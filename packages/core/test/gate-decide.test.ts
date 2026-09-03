import { describe, expect, it } from "vitest";

import type { Principal, TurnContext } from "../src/context.js";
import type { DocketEntry } from "../src/docket/entry.js";
import type { DocketStore, Page, PageResult, RetentionPolicy, Scope } from "../src/docket/store.js";
import { InMemoryDocketStore } from "../src/docket/memory.js";
import { isAffiantError } from "../src/errors.js";
import type { Decision } from "../src/gate/decide.js";
import type { PreparedField } from "../src/gate/pipeline.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { chainOf, mintConversation } from "../src/model/provenance.js";

import {
  AT,
  decliningAuthorization,
  harness,
  member,
  plus,
  policyReturning,
  recordingAuthorization,
  relay,
  service,
  stubClock,
  throwingAuthorization,
  turnContext,
  type Harness,
} from "./gate-support.js";

/**
 * The decision path, hand-written.
 *
 * The declarative fixtures in `test/fixtures/decide/` cover what a fixture can state:
 * a filing, a sequence of acts, and the row that results. This suite covers what one
 * cannot — a spy that proves the store was *not* read, two decisions actually racing,
 * the shape of the object the gate hands a host, and the type-level half of AZ-3.
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELDS = ["status", "amount", "note"] as const;

/** One host-tagged field, so the substance gate has something to admit (GT-3). */
function prepared(name: string, value: JsonValue, isMandatory = false): PreparedField {
  return {
    name,
    kind: "text",
    value,
    provenance: chainOf(
      mintConversation({ confidence: 0.9, at: AT, note: `Stated: ${name}`, conversationTurn: 1 }),
    ),
    isMandatory,
  };
}

/** File one pending entry through the gate's Sequence C entry point. */
async function fileOne(h: Harness, ctx: TurnContext, args: unknown = null): Promise<DocketEntry> {
  const filed = await h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: [...FIELDS],
      },
      toolName: "update_invoice",
      fields: [prepared("status", "Active"), prepared("amount", "40"), prepared("note", "kept")],
      args,
    },
    ctx,
  );
  return filed.entry;
}

/** The code of the {@link AffiantError} `run` throws, or `null` when it does not throw. */
async function codeOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
  } catch (error) {
    if (isAffiantError(error)) return error.code;
    throw error;
  }
  return null;
}

/** A {@link DocketStore} that counts what it was asked, delegating everything. */
function countingStore(inner: DocketStore): { store: DocketStore; calls: string[] } {
  const calls: string[] = [];
  const store: DocketStore = {
    async file(entry) {
      calls.push("file");
      return inner.file(entry);
    },
    async get(entryId: string, scope: Scope) {
      calls.push("get");
      return inner.get(entryId, scope);
    },
    async transition(entryId, scope, expected, patch) {
      calls.push("transition");
      return inner.transition(entryId, scope, expected, patch);
    },
    async preserveAmendments(entryId, scope, amendments) {
      calls.push("preserveAmendments");
      return inner.preserveAmendments(entryId, scope, amendments);
    },
    async recordExecution(entryId, scope, outcome, detail) {
      calls.push("recordExecution");
      return inner.recordExecution(entryId, scope, outcome, detail);
    },
    async recordSupersession(entryId, scope, supersededBy) {
      calls.push("recordSupersession");
      return inner.recordSupersession(entryId, scope, supersededBy);
    },
    async listPending(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
      calls.push("listPending");
      return inner.listPending(scope, page);
    },
    async listApprovedUnexecuted(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
      calls.push("listApprovedUnexecuted");
      return inner.listApprovedUnexecuted(scope, page);
    },
    async expireDue(now: string, scope: Scope, limit: number) {
      calls.push("expireDue");
      return inner.expireDue(now, scope, limit);
    },
    async retention(policy: RetentionPolicy, scope: Scope, limit: number) {
      calls.push("retention");
      return inner.retention(policy, scope, limit);
    },
    async purge(tenantId: string) {
      calls.push("purge");
      return inner.purge(tenantId);
    },
    export(scope: Scope) {
      calls.push("export");
      return inner.export(scope);
    },
  };
  return { store, calls };
}

const APPROVE: Decision = { kind: "approve" };

// ---------------------------------------------------------------------------
// AZ-2 — fail closed, tenant scoped, the approver on the record
// ---------------------------------------------------------------------------

describe("decision authorization (AZ-2)", () => {
  it("refuses an unresolved identity before the Docket is read", async () => {
    const clock = stubClock();
    const counted = countingStore(new InMemoryDocketStore({ clock }));
    const h = harness({ clock, store: counted.store });
    const entry = await fileOne(h, turnContext());
    counted.calls.length = 0;

    const code = await codeOf(() =>
      h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: null })),
    );

    expect(code).toBe("decision-unauthorized");
    expect(counted.calls, "the store was touched before the refusal").toEqual([]);
  });

  it("says why an unresolved identity was refused, in the message", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    await expect(
      h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: null })),
    ).rejects.toThrow(/identity unresolved/);
  });

  it("reports an entry in another tenant as not found, never as unauthorized", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext({ tenantId: "tenant-a" }));

    const code = await codeOf(() =>
      h.gate.decide(entry.entryId, APPROVE, turnContext({ tenantId: "tenant-b" })),
    );

    expect(code).toBe("entry-not-found");
  });

  it("leaves an entry in another tenant untouched", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext({ tenantId: "tenant-a" }));

    await codeOf(() =>
      h.gate.decide(entry.entryId, APPROVE, turnContext({ tenantId: "tenant-b" })),
    );

    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("pending");
    expect(after?.attestation).toBeNull();
  });

  it("refuses when the host's authorization port declines", async () => {
    const h = harness({ authorization: decliningAuthorization });
    const entry = await fileOne(h, turnContext());

    expect(await codeOf(() => h.gate.decide(entry.entryId, APPROVE, turnContext()))).toBe(
      "decision-unauthorized",
    );
  });

  it("treats an authorization port that throws as a refusal, never an approval", async () => {
    const h = harness({ authorization: throwingAuthorization });
    const entry = await fileOne(h, turnContext());

    expect(await codeOf(() => h.gate.decide(entry.entryId, APPROVE, turnContext()))).toBe(
      "decision-unauthorized",
    );
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("pending");
  });

  it("asks the host's port about the principal and the entry it is deciding", async () => {
    const seen: { principal: Principal; entryId: string }[] = [];
    const h = harness({ authorization: recordingAuthorization(true, seen) });
    const entry = await fileOne(h, turnContext());

    await h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: member("ana") }));

    expect(seen).toEqual([{ principal: { kind: "member", id: "ana" }, entryId: entry.entryId }]);
  });

  it("writes the approver onto the attestation (AZ-1)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const decided = await h.gate.decide(
      entry.entryId,
      APPROVE,
      turnContext({ principal: member("ana") }),
    );

    expect(decided.attestation).toEqual({
      by: { kind: "member", id: "ana" },
      at: AT,
      entryId: entry.entryId,
    });
  });

  it("emits decision.unauthorized without naming the principal", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    h.telemetry.events.length = 0;

    await codeOf(() => h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: null })));

    const event = h.telemetry.find("decision.unauthorized");
    expect(event?.attributes).toEqual({
      "entry.id": entry.entryId,
      "gen_ai.conversation.id": "conv-1",
      reason: "identity-unresolved",
      "principal.kind": "unresolved",
      path: "decide",
    });
  });
});

// ---------------------------------------------------------------------------
// AZ-3 — what identity may attest what
// ---------------------------------------------------------------------------

describe("attestation kinds (AZ-3)", () => {
  it("refuses a machine caller with nothing to relay", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const code = await codeOf(() =>
      h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: service("svc-1") })),
    );

    expect(code).toBe("decision-unauthorized");
  });

  it("says a machine caller cannot attest a decision", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    await expect(
      h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: service("svc-1") })),
    ).rejects.toThrow(/a machine caller cannot attest a decision/);
  });

  it("refuses a relay that names a person but not the message it carried", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    const halfRelay: Principal = { kind: "service", id: "relay-1", assertedMember: "ana" };

    expect(
      await codeOf(() =>
        h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: halfRelay })),
      ),
    ).toBe("decision-unauthorized");
  });

  it("attests member-via-relay, naming the person and the relay (Sequence C-2)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext({ channel: "mcp" }));

    const decided = await h.gate.decide(
      entry.entryId,
      APPROVE,
      turnContext({
        channel: "mcp",
        principal: relay({
          id: "whatsapp-relay",
          assertedMember: "ana",
          channelIdentity: "+94770000000",
          messageId: "wamid-42",
        }),
      }),
    );

    expect(decided.attestation).toEqual({
      by: {
        kind: "member-via-relay",
        memberId: "ana",
        relay: {
          principal: "whatsapp-relay",
          channelIdentity: "+94770000000",
          messageId: "wamid-42",
        },
      },
      at: AT,
      entryId: entry.entryId,
    });
  });

  it("never lets a service principal produce a member attestation (Sequence C-4)", async () => {
    const principals: Principal[] = [
      service("svc-1"),
      { kind: "service", id: "relay-1", assertedMember: "ana" },
      { kind: "service", id: "relay-1", relay: { channelIdentity: "+9477", messageId: "m" } },
      relay({ assertedMember: "ana" }),
    ];

    for (const principal of principals) {
      const h = harness();
      const entry = await fileOne(h, turnContext());
      let attested: DocketEntry | null = null;
      try {
        attested = await h.gate.decide(entry.entryId, APPROVE, turnContext({ principal }));
      } catch (error) {
        expect(isAffiantError(error)).toBe(true);
      }
      expect(attested?.attestation?.by.kind ?? "member-via-relay").not.toBe("member");
    }
  });
});

// ---------------------------------------------------------------------------
// DK-1 — the state machine
// ---------------------------------------------------------------------------

describe("the review outcome (DK-1)", () => {
  it("approves: approved, unexecuted, decided now, with the decision recorded", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const decided = await h.gate.decide(
      entry.entryId,
      { kind: "approve", reason: "checked against the PO" },
      turnContext(),
    );

    expect(decided.status).toBe("approved");
    expect(decided.execution).toBe("unexecuted");
    expect(decided.decidedAt).toBe(AT);
    expect(decided.decision).toEqual({
      kind: "approve",
      reason: "checked against the PO",
      at: AT,
    });
  });

  it("rejects: rejected, no execution outcome, the reason on the row", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const decided = await h.gate.decide(
      entry.entryId,
      { kind: "reject", reason: "the amount is wrong" },
      turnContext(),
    );

    expect(decided.status).toBe("rejected");
    expect(decided.execution).toBeNull();
    expect(decided.decision?.reason).toBe("the amount is wrong");
    expect(decided.attestation?.by).toEqual({ kind: "member", id: "member-1" });
  });

  it("refuses a second decision on an entry that is no longer pending", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.decide(entry.entryId, APPROVE, turnContext());

    // Sequential, so the read in step (iv) already sees the decided row: the answer
    // is "not pending", not "you lost a race" — there was no race. The lost-race code
    // is reserved for the compare-and-set losing to a decision that arrived after
    // this one had read the row, which the next test drives.
    expect(
      await codeOf(() =>
        h.gate.decide(entry.entryId, { kind: "reject", reason: "changed my mind" }, turnContext()),
      ),
    ).toBe("decision-not-pending");
  });

  it("leaves the first decision standing when a second is refused", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: member("ana") }));
    await codeOf(() =>
      h.gate.decide(entry.entryId, { kind: "reject", reason: "no" }, turnContext()),
    );

    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("approved");
    expect(after?.attestation?.by).toEqual({ kind: "member", id: "ana" });
  });

  it("applies exactly one of two decisions that race, and refuses the other", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const results = await Promise.allSettled([
      h.gate.decide(entry.entryId, APPROVE, turnContext({ principal: member("ana") })),
      h.gate.decide(
        entry.entryId,
        { kind: "reject", reason: "no" },
        turnContext({ principal: member("bo") }),
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const error = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect(error.code).toBe("decision-lost-race");

    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.attestation).not.toBeNull();
    expect(["approved", "rejected"]).toContain(after?.status);
  });

  it("refuses a decision made after the deadline, and preserves its amendments", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    const code = await codeOf(() =>
      h.gate.decide(
        entry.entryId,
        { kind: "approve", amendments: { amount: "4000", note: null } },
        turnContext(),
      ),
    );

    expect(code).toBe("decision-expired");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("expired");
    expect(after?.amendments).toEqual({ amount: "4000", note: null });
    expect(after?.attestation, "a refused decision attests nothing").toBeNull();
    expect(after?.decision, "a refused decision is not recorded").toBeNull();
  });

  it("refuses a late decision naming a field the Affidavit does not propose", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    await expect(
      h.gate.decide(
        entry.entryId,
        { kind: "approve", amendments: { nonesuch: "x" } },
        turnContext(),
      ),
    ).rejects.toBeInstanceOf(RangeError);
    expect((await h.store.get(entry.entryId, { tenantId: "tenant-a" }))?.amendments).toBeNull();
  });

  it("preserves nothing for a caller that could not have attested (AZ-3, PV-3)", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    // A resubmission prefills preserved amendments with a `UserStated` tag, so a
    // machine with nothing to relay must not be able to leave one behind.
    const code = await codeOf(() =>
      h.gate.decide(
        entry.entryId,
        { kind: "approve", amendments: { amount: "4000" } },
        turnContext({ principal: service("svc-1") }),
      ),
    );

    expect(code).toBe("decision-expired");
    expect((await h.store.get(entry.entryId, { tenantId: "tenant-a" }))?.amendments).toBeNull();
  });

  it("preserves a relay's amendments, because a relay can attest (AZ-3)", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    await codeOf(() =>
      h.gate.decide(
        entry.entryId,
        { kind: "approve", amendments: { amount: "4000" } },
        turnContext({ principal: relay({ assertedMember: "ana" }) }),
      ),
    );

    expect((await h.store.get(entry.entryId, { tenantId: "tenant-a" }))?.amendments).toEqual({
      amount: "4000",
    });
  });

  it("refuses every decision on a blocked entry, and never degrades it (AZ-4)", async () => {
    const h = harness({ policies: [policyReturning({ requirement: "MultiParty" })] });
    const entry = await fileOne(h, turnContext());
    expect(entry.blocked).toEqual({ code: "requirement-not-implemented", level: "MultiParty" });

    let thrown: unknown;
    try {
      await h.gate.decide(entry.entryId, APPROVE, turnContext());
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { code?: string }).code).toBe("decision-not-pending");
    expect((thrown as { details?: Record<string, unknown> }).details).toMatchObject({
      blocked: "requirement-not-implemented",
      level: "MultiParty",
    });
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("pending");
    expect(after?.requirement).toBe("MultiParty");
  });

  it("emits docket.transition with where the row came from and where it went", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    h.telemetry.events.length = 0;

    await h.gate.decide(entry.entryId, APPROVE, turnContext());

    expect(h.telemetry.find("docket.transition")?.attributes).toEqual({
      "entry.id": entry.entryId,
      "gen_ai.conversation.id": "conv-1",
      from: "pending",
      to: "approved",
      execution: "unexecuted",
      "decision.kind": "approve",
      "attestation.kind": "member",
      amended: false,
    });
  });
});

// ---------------------------------------------------------------------------
// AF-4 / DK-2 — amendments
// ---------------------------------------------------------------------------

describe("amendments (DK-2, AF-4, PV-2)", () => {
  /** Approve with one field set, one cleared and one left out of the map. */
  async function amended(): Promise<{ h: Harness; entry: DocketEntry; decided: DocketEntry }> {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    const decided = await h.gate.decide(
      entry.entryId,
      { kind: "approve", amendments: { amount: "4000", note: null } },
      turnContext({ principal: member("ana") }),
    );
    return { h, entry, decided };
  }

  it("sets an amended value, and takes a cleared optional field off the record (AF-1)", async () => {
    const { decided } = await amended();
    const byName = new Map(decided.affidavit.fields.map((field) => [field.name, field]));

    expect(byName.get("amount")?.value).toBe("4000");
    // `note` is optional, and a reviewer who clears it is saying "do not write this
    // one" — a field the write no longer proposes, which AF-1 makes absent rather
    // than present with nothing in it.
    expect(decided.affidavit.fields.map((field) => field.name)).toEqual(["status", "amount"]);
    expect(byName.has("note")).toBe(false);
  });

  it("keeps a cleared mandatory field, tagged Empty at confidence zero (AF-1, AF-2)", async () => {
    const h = harness();
    const filed = await h.gate.file(
      {
        operation: {
          kind: "update",
          entityType: "Invoice",
          entityId: "invoice-1",
          fields: [...FIELDS],
        },
        toolName: "update_invoice",
        fields: [
          prepared("status", "Active", true),
          prepared("amount", "40"),
          prepared("note", "kept"),
        ],
      },
      turnContext(),
    );

    const decided = await h.gate.decide(
      filed.entry.entryId,
      { kind: "approve", amendments: { status: null } },
      turnContext({ principal: member("ana") }),
    );
    const status = decided.affidavit.fields.find((field) => field.name === "status");

    // The entity still requires it, so it stays and is visibly unsourced rather than
    // carrying the reviewer's 1.0 over an emptied field — which would let a reviewer
    // wipe the record and leave it reporting perfect confidence over nothing.
    expect(status?.value).toBeNull();
    expect(status?.provenance.current.source).toBe("Empty");
    expect(status?.provenance.current.confidence).toBe(0);
    expect(status?.provenance.current.binding).toEqual({
      kind: "reviewer-act",
      ref: { entryId: filed.entry.entryId, decisionAt: AT },
    });
    expect(decided.affidavit.aggregateConfidence).toBe(0);
    expect(decided.affidavit.emptyFieldCount).toBe(1);
    expect(decided.affidavit.populatedConfidence).toBe(0.9);
  });

  it("leaves a field the map does not name exactly as it was", async () => {
    const { entry, decided } = await amended();
    const before = entry.affidavit.fields.find((field) => field.name === "status");
    const after = decided.affidavit.fields.find((field) => field.name === "status");

    expect(after).toEqual(before);
  });

  it("puts the reviewer's act on top, with the machine's tag preserved beneath (PV-2)", async () => {
    const { entry, decided } = await amended();
    const field = decided.affidavit.fields.find((candidate) => candidate.name === "amount");

    expect(field?.provenance.current.source).toBe("UserStated");
    expect(field?.provenance.current.binding).toEqual({
      kind: "reviewer-act",
      ref: { entryId: entry.entryId, decisionAt: AT },
    });
    expect(field?.provenance.current.note).toContain("ana");
    expect(field?.provenance.prior[0]?.source).toBe("Conversation");
  });

  it("recomputes the three numbers over the amended fields (AF-4)", async () => {
    const { decided } = await amended();

    // status is Conversation at 0.9 and amount is the reviewer's act at 1; `note`
    // was cleared and, being optional, is no longer proposed. Nothing here is
    // `Empty`, so the count is 0 and the minimum is status's 0.9.
    expect(decided.affidavit.aggregateConfidence).toBe(0.9);
    expect(decided.affidavit.populatedConfidence).toBe(0.9);
    expect(decided.affidavit.emptyFieldCount).toBe(0);
  });

  it("records the map itself on the row, so a resubmission can read it (DK-2)", async () => {
    const { decided } = await amended();

    expect(decided.amendments).toEqual({ amount: "4000", note: null });
  });

  it("marks the transition event as amended", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    h.telemetry.events.length = 0;
    await h.gate.decide(
      entry.entryId,
      { kind: "approve", amendments: { amount: "4000" } },
      turnContext(),
    );

    expect(h.telemetry.find("docket.transition")?.attributes["amended"]).toBe(true);
  });

  it("refuses an amendment naming a field the Affidavit does not propose", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    await expect(
      h.gate.decide(
        entry.entryId,
        { kind: "approve", amendments: { nonesuch: "x" } },
        turnContext(),
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

// ---------------------------------------------------------------------------
// DK-1 / AZ-5 / AZ-7 — the execution outcome
// ---------------------------------------------------------------------------

describe("the execution outcome (DK-1, AZ-5, AZ-7)", () => {
  async function approved(h: Harness): Promise<DocketEntry> {
    const entry = await fileOne(h, turnContext());
    return h.gate.decide(entry.entryId, APPROVE, turnContext());
  }

  it("records executed against an approved row, leaving the approval standing", async () => {
    const h = harness();
    const entry = await approved(h);

    const reported = await h.gate.markExecuted(entry.entryId, "executed", "row 41", turnContext());

    expect(reported.status).toBe("approved");
    expect(reported.execution).toBe("executed");
    expect(reported.executionDetail).toBe("row 41");
    expect(reported.attestation).toEqual(entry.attestation);
  });

  it("records failed, so an approved-but-failed write is distinguishable", async () => {
    const h = harness();
    const entry = await approved(h);

    const reported = await h.gate.markExecuted(
      entry.entryId,
      "failed",
      "unique constraint",
      turnContext(),
    );

    expect(reported.status).toBe("approved");
    expect(reported.execution).toBe("failed");
    expect(reported.executionDetail).toBe("unique constraint");
  });

  it("refuses an execution report on a pending row", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    expect(
      await codeOf(() => h.gate.markExecuted(entry.entryId, "executed", null, turnContext())),
    ).toBe("decision-not-pending");
  });

  it("refuses an execution report on a rejected row", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.decide(entry.entryId, { kind: "reject", reason: "no" }, turnContext());

    expect(
      await codeOf(() => h.gate.markExecuted(entry.entryId, "executed", null, turnContext())),
    ).toBe("decision-not-pending");
  });

  it("admits a service principal to report an outcome it is not admitted to decide", async () => {
    const h = harness();
    const entry = await approved(h);

    const reported = await h.gate.markExecuted(
      entry.entryId,
      "executed",
      null,
      turnContext({ principal: service("executor-1") }),
    );

    expect(reported.execution).toBe("executed");
  });

  it("still refuses an execution report with no resolved identity", async () => {
    const h = harness();
    const entry = await approved(h);

    expect(
      await codeOf(() =>
        h.gate.markExecuted(entry.entryId, "executed", null, turnContext({ principal: null })),
      ),
    ).toBe("decision-unauthorized");
  });

  it("still scopes an execution report to the caller's tenant", async () => {
    const h = harness();
    const entry = await approved(h);

    expect(
      await codeOf(() =>
        h.gate.markExecuted(entry.entryId, "executed", null, turnContext({ tenantId: "tenant-b" })),
      ),
    ).toBe("entry-not-found");
  });

  it("emits docket.transition for the execution report", async () => {
    const h = harness();
    const entry = await approved(h);
    h.telemetry.events.length = 0;

    await h.gate.markExecuted(entry.entryId, "executed", null, turnContext());

    expect(h.telemetry.find("docket.transition")?.attributes).toMatchObject({
      "entry.id": entry.entryId,
      from: "approved",
      to: "approved",
      execution: "executed",
      "attestation.kind": "member",
    });
  });

  it("has no executor port and no method that performs a write (AZ-7)", () => {
    const h = harness();

    expect(Object.keys(h.gate).sort()).toEqual([
      "coverage",
      "decide",
      "declareUncovered",
      "expireDue",
      "file",
      "get",
      "markExecuted",
      "rehydrate",
      "resubmit",
      "wrap",
    ]);
  });

  it("reaches executed only through a host's report (AZ-7)", async () => {
    const h = harness();
    const entry = await approved(h);

    // Everything else the gate can be asked to do leaves the row unexecuted.
    await h.gate.expireDue(plus(AT, 10_000_000), { tenantId: "tenant-a" }, 10);
    await fileOne(h, turnContext());
    expect((await h.store.get(entry.entryId, { tenantId: "tenant-a" }))?.execution).toBe(
      "unexecuted",
    );

    await h.gate.markExecuted(entry.entryId, "executed", null, turnContext());
    expect((await h.store.get(entry.entryId, { tenantId: "tenant-a" }))?.execution).toBe(
      "executed",
    );
  });
});

// ---------------------------------------------------------------------------
// DK-1 — resubmission
// ---------------------------------------------------------------------------

describe("resubmission (DK-1, PV-2)", () => {
  /** File, let it expire under a late amendment, and resubmit. */
  async function resubmitted(): Promise<{
    h: Harness;
    original: DocketEntry;
    fresh: DocketEntry;
  }> {
    const h = harness({ defaultTtlMs: 60_000 });
    const original = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));
    await codeOf(() =>
      h.gate.decide(
        original.entryId,
        { kind: "approve", amendments: { amount: "4000", note: null } },
        turnContext(),
      ),
    );
    const filed = await h.gate.resubmit(original.entryId, turnContext());
    return { h, original, fresh: filed.entry };
  }

  it("files a new entry, not a reopened one", async () => {
    const { original, fresh } = await resubmitted();

    expect(fresh.entryId).not.toBe(original.entryId);
    expect(fresh.status).toBe("pending");
  });

  it("names the lineage in both directions", async () => {
    const { h, original, fresh } = await resubmitted();
    const superseded = await h.store.get(original.entryId, { tenantId: "tenant-a" });

    expect(fresh.lineage).toEqual({ supersedes: original.entryId, supersededBy: null });
    expect(superseded?.lineage).toEqual({ supersedes: null, supersededBy: fresh.entryId });
  });

  it("leaves the superseded entry expired, with its preserved amendments", async () => {
    const { h, original } = await resubmitted();
    const superseded = await h.store.get(original.entryId, { tenantId: "tenant-a" });

    expect(superseded?.status).toBe("expired");
    expect(superseded?.amendments).toEqual({ amount: "4000", note: null });
  });

  it("prefills the amended values, tagged as the reviewer's act (PV-2)", async () => {
    const { original, fresh } = await resubmitted();
    const byName = new Map(fresh.affidavit.fields.map((field) => [field.name, field]));

    expect(byName.get("amount")?.value).toBe("4000");
    expect(byName.get("note")?.value).toBeNull();
    expect(byName.get("amount")?.provenance.current.source).toBe("UserStated");
    expect(byName.get("amount")?.provenance.current.binding).toEqual({
      kind: "reviewer-act",
      ref: { entryId: original.entryId, decisionAt: original.expiresAt },
    });
    expect(byName.get("amount")?.provenance.prior[0]?.source).toBe("Conversation");
  });

  it("leaves an unamended field carrying the provenance it was filed with", async () => {
    const { fresh } = await resubmitted();
    const status = fresh.affidavit.fields.find((field) => field.name === "status");

    expect(status?.value).toBe("Active");
    expect(status?.provenance.current.source).toBe("Conversation");
  });

  it("carries the prior amendments onto the new card (DK-2)", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const original = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));
    await codeOf(() =>
      h.gate.decide(
        original.entryId,
        { kind: "approve", amendments: { amount: "4000" } },
        turnContext(),
      ),
    );

    const filed = await h.gate.resubmit(original.entryId, turnContext());

    expect(filed.card.priorAmendments).toEqual({ amount: "4000" });
  });

  it("stamps a fresh deadline from the policy chain, run again (GT-4)", async () => {
    const { h, fresh } = await resubmitted();

    expect(fresh.expiresAt).toBe(plus(h.clock.now(), 60_000));
    expect(fresh.requirement).toBe("ReviewerConfirmation");
  });

  it("is idempotent: resubmitting the same entry twice is one new row", async () => {
    const { h, original, fresh } = await resubmitted();

    const again = await h.gate.resubmit(original.entryId, turnContext());

    expect(again.entry.entryId).toBe(fresh.entryId);
    expect(again.created).toBe(false);
  });

  it("refuses a resubmission of an entry that is still pending", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    expect(await codeOf(() => h.gate.resubmit(entry.entryId, turnContext()))).toBe(
      "decision-not-pending",
    );
  });

  it("refuses a resubmission of a decided entry", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.decide(entry.entryId, APPROVE, turnContext());

    expect(await codeOf(() => h.gate.resubmit(entry.entryId, turnContext()))).toBe(
      "decision-not-pending",
    );
  });

  it("refuses a resubmission with no resolved identity, or in another tenant", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    expect(
      await codeOf(() => h.gate.resubmit(entry.entryId, turnContext({ principal: null }))),
    ).toBe("decision-unauthorized");
    expect(
      await codeOf(() => h.gate.resubmit(entry.entryId, turnContext({ tenantId: "tenant-b" }))),
    ).toBe("entry-not-found");
  });
});

// ---------------------------------------------------------------------------
// DK-5 — rehydration through the gate
// ---------------------------------------------------------------------------

describe("rehydration (DK-5)", () => {
  it("returns pending entries first, then approved and unexecuted ones", async () => {
    const h = harness();
    const first = await fileOne(h, turnContext(), { seq: 1 });
    const second = await fileOne(h, turnContext(), { seq: 2 });
    const third = await fileOne(h, turnContext(), { seq: 3 });
    await h.gate.decide(first.entryId, APPROVE, turnContext());

    const page = await h.gate.rehydrate({ tenantId: "tenant-a" }, { limit: 10 });

    expect(page.items.map((entry) => entry.entryId)).toEqual([
      second.entryId,
      third.entryId,
      first.entryId,
    ]);
  });

  it("refuses when the host wired no session store", async () => {
    const h = harness({ sessions: null });

    let thrown: unknown;
    try {
      await h.gate.rehydrate({ tenantId: "tenant-a" }, { limit: 10 });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { code?: string }).code).toBe("wireup-invalid");
    expect((thrown as { details?: Record<string, unknown> }).details).toEqual({
      option: "sessions",
    });
  });
});
