import { describe, expect, it } from "vitest";

import type { TurnContext } from "../src/context.js";
import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { DocketStore } from "../src/docket/store.js";
import { isAffiantError, isCallerError } from "../src/errors.js";
import type { PreparedField } from "../src/gate/pipeline.js";
import { chainOf, mintConversation } from "../src/model/provenance.js";

import {
  AT,
  harness,
  interceptorPort,
  plus,
  policyReturning,
  stubClock,
  turnContext,
  writeTool,
  type Harness,
  type Trace,
} from "./gate-support.js";

/**
 * The two caller errors a host reaches by making a mistake in its own code: an
 * amendment naming a field the Affidavit does not propose, and a blank identifier in
 * the turn context it assembled.
 *
 * Neither is a refusal. The refusal registry names what the gate decided about a
 * proposal or a decider; these are arguments the caller could not legally have
 * passed. What is new is not *that* they fail — they always did — but that they
 * carry a `kind` a host can branch on, and that the turn context is read where GT-1
 * puts it: first, before a model call is spent on a turn that can never be filed.
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global.
 */

/** One host-tagged field, so the substance gate has something to admit (GT-3). */
function prepared(name: string, value: string): PreparedField {
  return {
    name,
    kind: "text",
    value,
    provenance: chainOf(
      mintConversation({ confidence: 0.9, at: AT, note: `Stated: ${name}`, conversationTurn: 1 }),
    ),
    isMandatory: false,
  };
}

/** File one entry through the gate's Sequence C entry point. */
async function fileOne(h: Harness, ctx: TurnContext = turnContext()) {
  return h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: ["status", "amount"],
      },
      toolName: "update_invoice",
      fields: [prepared("status", "Active"), prepared("amount", "40")],
      args: null,
    },
    ctx,
  );
}

/** Whatever was thrown, or `null` when nothing was. */
async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

// ---------------------------------------------------------------------------
// DK-2 — an amendment naming a field the Affidavit does not propose
// ---------------------------------------------------------------------------

describe("an amendment naming a field the Affidavit does not propose", () => {
  it("is a caller error, not a refusal, and names the field and the entry", async () => {
    const h = harness();
    const filed = await fileOne(h);

    const thrown = await thrownBy(() =>
      h.gate.decide(
        filed.entry.entryId,
        { kind: "approve", amendments: { nowhere: "x" } },
        turnContext(),
      ),
    );

    // Still a RangeError, so a host that already caught one keeps working.
    expect(thrown).toBeInstanceOf(RangeError);
    expect(isCallerError(thrown)).toBe(true);
    expect(isAffiantError(thrown)).toBe(false);
    expect(isCallerError(thrown) ? thrown.kind : null).toBe("amendment-unknown-field");
    expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
      field: "nowhere",
      entryId: filed.entry.entryId,
    });
  });

  it("changes no state: the row is untouched and still decidable (DK-2)", async () => {
    const h = harness();
    const filed = await fileOne(h);
    const before = await h.gate.get(filed.entry.entryId, turnContext());

    await thrownBy(() =>
      h.gate.decide(
        filed.entry.entryId,
        { kind: "approve", amendments: { nowhere: "x" } },
        turnContext(),
      ),
    );

    const after = await h.gate.get(filed.entry.entryId, turnContext());
    expect(after).toEqual(before);
    expect(after?.status).toBe("pending");

    // And the mistake cost the reviewer nothing: the same entry takes a good
    // decision immediately afterwards.
    const decided = await h.gate.decide(
      filed.entry.entryId,
      { kind: "approve", amendments: { amount: "4000" } },
      turnContext(),
    );
    expect(decided.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// GT-1, GT-2 — the turn context, read first
// ---------------------------------------------------------------------------

/** A store that records every method a filing path could call on it. */
function recordingStore(trace: Trace): DocketStore {
  const inner = new InMemoryDocketStore({ clock: stubClock() });
  return new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        trace.push(`store:${String(property)}`);
        return (value as (...rest: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as DocketStore;
}

/** A gate whose every port writes to one trace, so "nothing ran" is checkable. */
function spied(trace: Trace): Harness {
  return harness({
    trace,
    store: recordingStore(trace),
    interceptors: [interceptorPort("enrich", {}, trace)],
    policies: [policyReturning(null, { trace })],
    riskScore: 0.1,
  });
}

/** The identifiers a filing has always refused when blank. */
const IDENTIFIERS = ["conversationId", "tenantId", "channel"] as const;

describe("a blank turn-context identifier", () => {
  for (const identifier of IDENTIFIERS) {
    for (const blank of ["", "   "] as const) {
      it(`${identifier} = ${JSON.stringify(blank)}: refuses the filing, typed`, async () => {
        const trace: Trace = [];
        const h = spied(trace);

        const thrown = await thrownBy(() => fileOne(h, turnContext({ [identifier]: blank })));

        expect(thrown).toBeInstanceOf(RangeError);
        expect(isCallerError(thrown)).toBe(true);
        expect(isAffiantError(thrown)).toBe(false);
        expect(isCallerError(thrown) ? thrown.kind : null).toBe("turn-context-invalid");
        expect(isCallerError(thrown) ? thrown.details : null).toEqual({ identifier });
      });

      it(`${identifier} = ${JSON.stringify(blank)}: calls no port and files nothing (GT-1)`, async () => {
        const trace: Trace = [];
        const h = spied(trace);

        await thrownBy(() => fileOne(h, turnContext({ [identifier]: blank })));

        // GT-1's order is turn context, then interceptors, then one inference: none
        // of the later steps ran, so no model call was spent on a turn that could
        // never be filed, and nothing reached the Docket.
        expect(trace).toEqual([]);
      });

      it(`${identifier} = ${JSON.stringify(blank)}: refuses a wrapped tool call the same way`, async () => {
        const trace: Trace = [];
        const h = spied(trace);

        const thrown = await thrownBy(() =>
          h.gate.wrap(writeTool(), turnContext({ [identifier]: blank })).execute({
            status: "Active",
          }),
        );

        expect(isCallerError(thrown) ? thrown.kind : null).toBe("turn-context-invalid");
        expect(trace).toEqual([]);
      });
    }
  }

  it("refuses a resubmission before the pipeline runs, and files no successor", async () => {
    // `tenantId` is not among these: a resubmission looks the entry up in the
    // caller's tenant first, so a blank one is `entry-not-found` before the pipeline
    // is reached — as it was before this check existed.
    for (const identifier of ["conversationId", "channel"] as const) {
      const h = harness({ defaultTtlMs: 60_000 });
      const filed = await fileOne(h);
      const after = plus(filed.entry.expiresAt, 1);
      h.clock.set(after);
      await h.gate.expireDue(after, { tenantId: "tenant-a" }, 10);

      const thrown = await thrownBy(() =>
        h.gate.resubmit(filed.entry.entryId, turnContext({ [identifier]: "" })),
      );

      expect(isCallerError(thrown) ? thrown.kind : null).toBe("turn-context-invalid");
      const row = await h.gate.get(filed.entry.entryId, turnContext());
      expect(row?.lineage.supersededBy).toBeNull();
    }
  });

  it("refuses nothing a filing accepts today", async () => {
    // The set of refused inputs does not change. The identifiers a filing never
    // required — the relay's message id, the utterance, the turn's instant — are
    // still not required, blank or not.
    for (const key of ["messageId", "utterance", "at"] as const) {
      const h = harness();

      const filed = await fileOne(h, turnContext({ [key]: "" }));

      expect(filed.entry.status).toBe("pending");
    }
  });
});
