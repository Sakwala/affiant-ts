import { describe, expect, it } from "vitest";

import type { DocketEntry } from "../src/docket/entry.js";
import { isAffiantError, isCallerError } from "../src/errors.js";
import { decisionResultOf } from "../src/gate/decision-result.js";
import type { PreparedField } from "../src/gate/pipeline.js";
import { chainOf, mintConversation } from "../src/model/provenance.js";

import { AT, harness, plus, policyReturning, turnContext, type Harness } from "./gate-support.js";

/**
 * `decisionResultOf` — the DecisionResult envelope for a row that has been decided.
 *
 * The report and the row answer different questions, and this suite is mostly about
 * where the two part company: a rejected row names the person who rejected it, and
 * the envelope's `attestation` — "who agreed" (AZ-1) — is `null` all the same; an
 * expired row that a resubmission replaced reports `resubmitted` and not `expired`.
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global. The envelopes
 * are held against the rulebook's JSON Schema in
 * `test/node/decision-result-schema.test.ts`, which needs a validator that compiles
 * code and so cannot run in a Worker.
 */

const FIELDS = ["status", "amount"] as const;

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
async function fileOne(h: Harness): Promise<DocketEntry> {
  const filed = await h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: [...FIELDS],
      },
      toolName: "update_invoice",
      fields: [prepared("status", "Active"), prepared("amount", "40")],
      args: null,
    },
    turnContext(),
  );
  return filed.entry;
}

/** A row a person approved, still waiting for the host's executor (AZ-7). */
async function approvedRow(): Promise<DocketEntry> {
  const h = harness();
  const pending = await fileOne(h);
  return h.gate.decide(pending.entryId, { kind: "approve", amendments: {} }, turnContext());
}

/** A row that lapsed, and — when asked — its successor's supersession recorded on it. */
async function expiredRow(resubmit: boolean): Promise<DocketEntry> {
  const h = harness({ defaultTtlMs: 60_000 });
  const pending = await fileOne(h);
  const after = plus(pending.expiresAt, 1);
  h.clock.set(after);
  await h.gate.expireDue(after, { tenantId: "tenant-a" }, 10);
  if (resubmit) await h.gate.resubmit(pending.entryId, turnContext());
  const row = await h.gate.get(pending.entryId, turnContext());
  if (row === null) throw new Error("the expired entry disappeared");
  return row;
}

describe("decisionResultOf reports what became of a review", () => {
  it("reports an approval the executor has not yet answered for", async () => {
    const row = await approvedRow();

    expect(decisionResultOf(row)).toEqual({
      protocolVersion: row.protocolVersion,
      docketId: row.entryId,
      outcome: "approved",
      attestation: row.attestation,
      execution: "unexecuted",
    });
    expect(row.attestation).not.toBeNull();
  });

  // AZ-7: the execution outcome is the second axis, and every value the type has
  // travels on the envelope unchanged once the host's executor has reported.
  for (const outcome of ["executed", "failed"] as const) {
    it(`carries execution ${outcome} once the host's executor reported it`, async () => {
      const h = harness();
      const pending = await fileOne(h);
      await h.gate.decide(pending.entryId, { kind: "approve", amendments: {} }, turnContext());
      const row = await h.gate.markExecuted(pending.entryId, outcome, null, turnContext());

      expect(decisionResultOf(row)).toMatchObject({ outcome: "approved", execution: outcome });
    });
  }

  it("reports a Standing Order's approval, with the policy as the attestor (AZ-3)", async () => {
    const h = harness({ policies: [policyReturning({ requirement: "StandingOrder" })] });
    const row = await fileOne(h);

    const result = decisionResultOf(row);

    expect(result.outcome).toBe("approved");
    expect(result.attestation?.by.kind).toBe("standing-order");
    expect(result.execution).toBe("unexecuted");
  });

  it("reports a rejection with no attestation, though the row names who rejected (AZ-1)", async () => {
    const h = harness();
    const pending = await fileOne(h);
    const row = await h.gate.decide(
      pending.entryId,
      { kind: "reject", reason: "not this quarter" },
      turnContext(),
    );

    // The row does name a decider — the two answer different questions, and the
    // envelope's field asks who *agreed*.
    expect(row.attestation).not.toBeNull();
    expect(decisionResultOf(row)).toEqual({
      protocolVersion: row.protocolVersion,
      docketId: row.entryId,
      outcome: "rejected",
      attestation: null,
      execution: null,
    });
  });

  it("reports an expiry nobody resubmitted as expired, carrying nothing (DK-1)", async () => {
    const row = await expiredRow(false);

    expect(row.status).toBe("expired");
    expect(decisionResultOf(row)).toEqual({
      protocolVersion: row.protocolVersion,
      docketId: row.entryId,
      outcome: "expired",
      attestation: null,
      execution: null,
    });
  });

  it("reports an expiry a successor replaced as resubmitted (DK-4)", async () => {
    const row = await expiredRow(true);

    expect(row.status).toBe("expired");
    expect(row.lineage.supersededBy).not.toBeNull();
    expect(decisionResultOf(row)).toMatchObject({
      outcome: "resubmitted",
      attestation: null,
      execution: null,
    });
  });

  it("refuses a pending row: the caller owns the instant it would be read against", async () => {
    const h = harness();
    const pending = await fileOne(h);

    expect(() => decisionResultOf(pending)).toThrow(RangeError);

    const thrown = (() => {
      try {
        decisionResultOf(pending);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(isCallerError(thrown)).toBe(true);
    // A caller error is not a refusal: it carries no ErrorCode and never appears in
    // the protocol's registry.
    expect(isAffiantError(thrown)).toBe(false);
    expect(isCallerError(thrown) ? thrown.kind : null).toBe("entry-not-decided");
    expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
      entryId: pending.entryId,
      status: "pending",
    });
  });

  it("reads a row that has been through JSON, as a host's store returns one", async () => {
    const row = await approvedRow();
    const rehydrated = JSON.parse(JSON.stringify(row)) as DocketEntry;

    expect(decisionResultOf(rehydrated)).toEqual(decisionResultOf(row));
  });
});
