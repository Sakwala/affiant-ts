import { describe, expect, it } from "vitest";

import type { TurnContext } from "../src/context.js";
import type { DocketEntry } from "../src/docket/entry.js";
import { isAffiantError, isCallerError } from "../src/errors.js";
import { cardFor } from "../src/gate/card.js";
import { decisionResultOf } from "../src/gate/decision-result.js";
import type { PreparedField } from "../src/gate/pipeline.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { chainOf, mintConversation } from "../src/model/provenance.js";
import { InMemoryDocketStore } from "../src/docket/memory.js";

import {
  AT,
  decliningAuthorization,
  harness,
  member,
  plus,
  policyReturning,
  relay,
  service,
  stubClock,
  turnContext,
  type Harness,
} from "./gate-support.js";

/**
 * `Gate.withdraw` — DK-1's withdrawal transition.
 *
 * Each case names the vendored fixture it mirrors (`decide/35`…`44`, at the
 * rulebook's `v0.4.0-pre.1` pre-release). Runs on Node, Bun and workerd alike:
 * no filesystem, no Node global.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELDS = ["status", "amount", "note"] as const;

const APPROVE = { kind: "approve" } as const;

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
async function fileOne(h: Harness, ctx: TurnContext, args: JsonValue = null): Promise<DocketEntry> {
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
    return null;
  } catch (error) {
    return isAffiantError(error) ? error.code : null;
  }
}

// ---------------------------------------------------------------------------
// Cases 1-8
// ---------------------------------------------------------------------------

describe("Gate.withdraw", () => {
  it("withdraws a pending ReviewerConfirmation entry, recording the act as a decision (fixture 36)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the invoice was deleted before review" },
      turnContext({ principal: service("host") }),
    );

    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.decision).toEqual({
      kind: "withdraw",
      reason: "the invoice was deleted before review",
      at: AT,
      by: "host",
    });
    expect(withdrawn.attestation).toBeNull();
    expect(withdrawn.execution).toBeNull();
    expect(withdrawn.decidedAt).toBe(AT);
    expect(withdrawn.approvals).toBeNull();
  });

  it("withdraws a pending MultiParty entry, leaving its recorded approvals untouched (fixture 35)", async () => {
    const h = harness({
      policies: [
        policyReturning({
          requirement: { kind: "MultiParty", approvers: ["ana", "bo", "cy"], required: 3 },
        }),
      ],
    });
    const entry = await fileOne(h, turnContext());
    const afterApprove = await h.gate.decide(
      entry.entryId,
      APPROVE,
      turnContext({ principal: member("ana") }),
    );
    expect(afterApprove.status).toBe("pending");

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the requesting agent cancelled the change" },
      turnContext({ principal: service("host") }),
    );

    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.approvals).toEqual(afterApprove.approvals);
  });

  it("withdraws a blocked pending entry (fixture 37)", async () => {
    const h = harness({
      policies: [policyReturning({ requirement: { kind: "ReferralRequired" } })],
    });
    const entry = await fileOne(h, turnContext());
    expect(entry.blocked).toEqual({
      code: "requirement-not-implemented",
      level: "ReferralRequired",
    });

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the referral was cancelled" },
      turnContext({ principal: service("host") }),
    );

    expect(withdrawn.status).toBe("withdrawn");
  });

  it("refuses a withdrawal made after the deadline, preserving nothing (fixture 39)", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const entry = await fileOne(h, turnContext());
    h.clock.set(plus(AT, 90_000));

    const code = await codeOf(() =>
      h.gate.withdraw(
        entry.entryId,
        { reason: "too late" },
        turnContext({ principal: service("host") }),
      ),
    );

    expect(code).toBe("decision-expired");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.status).toBe("expired");
    expect(after?.preservedAmendments).toBeNull();
    expect(after?.decision).toBeNull();
  });

  it("refuses to withdraw an already-approved entry (fixture 38)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    const approved = await h.gate.decide(entry.entryId, APPROVE, turnContext());

    const code = await codeOf(() =>
      h.gate.withdraw(
        entry.entryId,
        { reason: "too late" },
        turnContext({ principal: service("host") }),
      ),
    );

    expect(code).toBe("decision-not-pending");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after).toEqual(approved);
  });

  it("refuses a second withdrawal of an already-withdrawn entry (fixture 40)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    const first = await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    const code = await codeOf(() =>
      h.gate.withdraw(
        entry.entryId,
        { reason: "again" },
        turnContext({ principal: service("host") }),
      ),
    );

    expect(code).toBe("decision-not-pending");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.decision).toEqual(first.decision);
  });

  it("answers a withdrawal from another tenant with entry-not-found (fixture 41)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const code = await codeOf(() =>
      h.gate.withdraw(
        entry.entryId,
        { reason: "not my entry" },
        turnContext({ tenantId: "tenant-b", principal: service("host") }),
      ),
    );

    expect(code).toBe("entry-not-found");
  });

  it("refuses a decision made after a withdrawal (fixture 42)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    const code = await codeOf(() => h.gate.decide(entry.entryId, APPROVE, turnContext()));

    expect(code).toBe("decision-not-pending");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.preservedAmendments).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Cases 9-16
  // ---------------------------------------------------------------------------

  it("refuses an execution report after a withdrawal (fixture 43)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    const code = await codeOf(() =>
      h.gate.markExecuted(entry.entryId, "executed", null, turnContext()),
    );

    expect(code).toBe("decision-not-pending");
    const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(after?.execution).toBeNull();
  });

  it("replays a re-file of a withdrawn entry as the withdrawn row (fixture 44)", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    const replayed = await h.gate.file(
      {
        operation: {
          kind: "update",
          entityType: "Invoice",
          entityId: "invoice-1",
          fields: [...FIELDS],
        },
        toolName: "update_invoice",
        fields: [prepared("status", "Active"), prepared("amount", "40"), prepared("note", "kept")],
        args: null,
      },
      turnContext(),
    );

    expect(replayed.created).toBe(false);
    expect(replayed.entry.status).toBe("withdrawn");
    expect(replayed.entry.entryId).toBe(entry.entryId);
    const row = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
    expect(row?.status).toBe("withdrawn");
  });

  it("records the row's decidedAt as the gate's own instant even when the store's clock reads differently", async () => {
    const gateClock = stubClock(AT);
    const storeClock = stubClock(plus(AT, 5_000));
    const store = new InMemoryDocketStore({ clock: storeClock });
    const h = harness({ clock: gateClock, store });
    const entry = await fileOne(h, turnContext());

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    expect(withdrawn.decidedAt).toBe(AT);
    expect(withdrawn.decision).toMatchObject({ at: AT });
  });

  it("records the relayed member, not the relay service, as by for a withdrawal by a relay principal", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: relay({ assertedMember: "member-9" }) }),
    );

    expect(withdrawn.decision).toMatchObject({ by: "member-9" });
  });

  it("a withdraw step without a reason is a caller error and records nothing", async () => {
    const h = harness();

    for (const reason of ["", "   ", undefined] as const) {
      const entry = await fileOne(h, turnContext());
      let thrown: unknown;
      try {
        await h.gate.withdraw(
          entry.entryId,
          { reason } as never,
          turnContext({ principal: service("host") }),
        );
      } catch (error) {
        thrown = error;
      }

      expect(isCallerError(thrown)).toBe(true);
      expect((thrown as { kind?: string }).kind).toBe("withdrawal-reason-missing");
      const after = await h.store.get(entry.entryId, { tenantId: "tenant-a" });
      expect(after?.status).toBe("pending");
    }
  });

  it("resubmit of a withdrawn entry is a caller error and files nothing", async () => {
    const h = harness();
    const withdrawnSource = await fileOne(h, turnContext());
    await h.gate.withdraw(
      withdrawnSource.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );
    let withdrawnResubmitError: unknown;
    try {
      await h.gate.resubmit(withdrawnSource.entryId, turnContext());
    } catch (error) {
      withdrawnResubmitError = error;
    }

    const rejectedSource = await fileOne(h, turnContext(), "a second filing");
    await h.gate.decide(rejectedSource.entryId, { kind: "reject", reason: "no" }, turnContext());
    let rejectedResubmitError: unknown;
    try {
      await h.gate.resubmit(rejectedSource.entryId, turnContext());
    } catch (error) {
      rejectedResubmitError = error;
    }

    expect(isAffiantError(withdrawnResubmitError)).toBe(true);
    expect(isAffiantError(rejectedResubmitError)).toBe(true);
    expect((withdrawnResubmitError as { code?: string }).code).toBe(
      (rejectedResubmitError as { code?: string }).code,
    );
    expect(withdrawnResubmitError).toBeInstanceOf((rejectedResubmitError as object).constructor);

    const withdrawnRow = await h.store.get(withdrawnSource.entryId, { tenantId: "tenant-a" });
    expect(withdrawnRow?.status).toBe("withdrawn");
    const rejectedRow = await h.store.get(rejectedSource.entryId, { tenantId: "tenant-a" });
    expect(rejectedRow?.status).toBe("rejected");
  });

  it("refuses a withdrawal with no principal in ctx", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());

    let thrown: unknown;
    try {
      await h.gate.withdraw(
        entry.entryId,
        { reason: "the subject was deleted" },
        turnContext({ principal: null }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(isAffiantError(thrown)).toBe(true);
    expect((thrown as { code?: string }).code).toBe("decision-unauthorized");
    expect((thrown as { details?: Record<string, unknown> }).details).toMatchObject({
      reason: "identity-unresolved",
    });
  });

  it("withdraws even when the authorization port declines", async () => {
    const h = harness({ authorization: decliningAuthorization });
    const entry = await fileOne(h, turnContext());

    const withdrawn = await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    expect(withdrawn.status).toBe("withdrawn");
  });

  it("emits exactly one docket.transition event, with the withdrawal's attributes", async () => {
    const h = harness();
    const entry = await fileOne(h, turnContext());
    h.telemetry.events.length = 0;

    await h.gate.withdraw(
      entry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    expect(h.telemetry.events).toHaveLength(1);
    expect(h.telemetry.find("docket.transition")?.attributes).toEqual({
      "entry.id": entry.entryId,
      "gen_ai.conversation.id": "conv-1",
      from: "pending",
      to: "withdrawn",
      execution: null,
      "decision.kind": "withdraw",
      "attestation.kind": null,
      amended: false,
    });
  });

  it("decisionResultOf and cardFor read a withdrawn row as an informational terminal row", async () => {
    const h = harness();
    const withdrawnEntry = await fileOne(h, turnContext());
    const withdrawn = await h.gate.withdraw(
      withdrawnEntry.entryId,
      { reason: "the subject was deleted" },
      turnContext({ principal: service("host") }),
    );

    const rejectedEntry = await fileOne(h, turnContext(), "a second filing");
    const rejected = await h.gate.decide(
      rejectedEntry.entryId,
      { kind: "reject", reason: "no" },
      turnContext(),
    );

    expect(decisionResultOf(withdrawn).outcome).toBe("withdrawn");
    expect(cardFor(withdrawn, { now: AT }).requiresConfirmation).toBe(false);
    expect(cardFor(withdrawn, { now: AT }).requiresConfirmation).toBe(
      cardFor(rejected, { now: AT }).requiresConfirmation,
    );
  });
});
