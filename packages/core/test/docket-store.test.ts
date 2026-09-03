import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { Attestation, DocketEntry } from "../src/docket/entry.js";
import type { Scope, TransitionPatch, TransitionResult } from "../src/docket/store.js";

import { affidavit, anEntry, stubClock } from "./docket-support.js";

/**
 * DK-1 — idempotent filing, the guarded compare-and-set, expiry as queryable state,
 * preserved amendments on a late decision, execution outcome and lineage, against
 * the reference store.
 *
 * The suite runs on Node, Bun and workerd unchanged: the store has no timer, no
 * filesystem and no Node API, so the same assertions hold on every runtime a host
 * might put the gate on (RT-1).
 */
const TENANT: Scope = { tenantId: "tenant-a" };
const NOON = "2026-09-04T09:00:00.000Z";
const AFTER_DEADLINE = "2026-09-04T09:30:00.001Z";

/** An approval by a named person (AZ-1). */
function attestedBy(id: string, entryId: string, at = NOON): Attestation {
  return { by: { kind: "member", id }, at, entryId };
}

/** The patch an approval writes. */
function approval(entryId: string, patch: Partial<TransitionPatch> = {}): TransitionPatch {
  return {
    status: "approved",
    decision: { kind: "approve", reason: null, at: NOON },
    attestation: attestedBy("person-7", entryId),
    ...patch,
  };
}

/** Narrows a transition result to the entry it produced, failing the test if it refused. */
function applied(result: TransitionResult): DocketEntry {
  expect(typeof result).not.toBe("string");
  return result as DocketEntry;
}

describe("filing is idempotent by entry id (DK-1)", () => {
  it("returns the existing entry on a re-file, with its existing deadline (GT-4)", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    const first = await store.file(anEntry("entry-1"));
    const refiled = await store.file(
      anEntry("entry-1", {
        expiresAt: "2026-09-04T23:59:00.000Z",
        filedAt: "2026-09-04T09:10:00.000Z",
      }),
    );

    expect(first.created).toBe(true);
    expect(refiled.created).toBe(false);
    expect(refiled.entry.expiresAt).toBe(first.entry.expiresAt);
    expect(refiled.entry.filedAt).toBe(first.entry.filedAt);
  });

  it("keeps one entry, not two", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-1"));

    const page = await store.listPending(TENANT, { limit: 10 });

    expect(page.items).toHaveLength(1);
  });

  it("never overwrites the filed Affidavit", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1", { affidavit: affidavit(["amount"]) }));
    const refiled = await store.file(anEntry("entry-1", { affidavit: affidavit(["recipient"]) }));

    expect(refiled.entry.affidavit.fields.map((f) => f.name)).toEqual(["amount"]);
  });
});

describe("the guarded compare-and-set (DK-1)", () => {
  it("applies the first transition and refuses the second as a lost race", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    const first = await store.transition("entry-1", TENANT, "pending", approval("entry-1"));
    const second = await store.transition("entry-1", TENANT, "pending", {
      status: "rejected",
      decision: { kind: "reject", reason: "too late", at: NOON },
    });

    expect(applied(first).status).toBe("approved");
    expect(applied(first).execution).toBe("unexecuted");
    expect(second).toBe("already-decided");

    const stored = await store.get("entry-1", TENANT);
    expect(stored?.status).toBe("approved");
    expect(stored?.decision).toEqual({ kind: "approve", reason: null, at: NOON });
  });

  it("lets exactly one of two interleaved transitions win", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    const results = await Promise.all([
      store.transition("entry-1", TENANT, "pending", approval("entry-1")),
      store.transition("entry-1", TENANT, "pending", {
        status: "rejected",
        decision: { kind: "reject", reason: "no", at: NOON },
      }),
    ]);

    const refusals = results.filter((result) => typeof result === "string");
    expect(refusals).toEqual(["already-decided"]);
    expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
  });

  it("survives a burst of interleaved decisions with a single winner", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    const results = await Promise.all(
      Array.from({ length: 25 }, (_unused, index) =>
        store.transition("entry-1", TENANT, "pending", {
          status: "approved",
          attestation: attestedBy(`person-${index}`, "entry-1"),
        }),
      ),
    );

    expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
    expect(results.filter((result) => result === "already-decided")).toHaveLength(24);
  });

  it("records the approver on the row (AZ-1)", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.transition("entry-1", TENANT, "pending", approval("entry-1"));

    const stored = await store.get("entry-1", TENANT);
    expect(stored?.attestation).toEqual({
      by: { kind: "member", id: "person-7" },
      at: NOON,
      entryId: "entry-1",
    });
    expect(stored?.decidedAt).toBe(NOON);
  });

  it("records a relayed decision as member-via-relay, never as member (AZ-3)", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1", { channel: "mcp" }));
    const decided = applied(
      await store.transition("entry-1", TENANT, "pending", {
        status: "approved",
        attestation: {
          by: {
            kind: "member-via-relay",
            memberId: "person-7",
            relay: {
              principal: "relay-desk",
              channelIdentity: "slack:U024BE7LH",
              messageId: "relay-msg-9",
            },
          },
          at: NOON,
          entryId: "entry-1",
        },
      }),
    );

    expect(decided.attestation?.by.kind).toBe("member-via-relay");
  });

  it("refuses a patch that contradicts its own status", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    await expect(
      store.transition("entry-1", TENANT, "pending", { status: "approved", execution: null }),
    ).rejects.toThrow(RangeError);
    await expect(
      store.transition("entry-1", TENANT, "pending", {
        status: "rejected",
        execution: "executed",
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      store.transition("entry-1", TENANT, "pending", { status: "pending" as never }),
    ).rejects.toThrow(RangeError);
  });

  it("says not-found for an id nothing in scope carries", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });

    expect(await store.transition("nope", TENANT, "pending", approval("nope"))).toBe("not-found");
  });
});

describe("a decision that arrives after the deadline (DK-1)", () => {
  it("reads expired without any sweep, and refuses the transition as expired", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));

    expect((await store.get("entry-1", TENANT))?.status).toBe("pending");
    clock.set(AFTER_DEADLINE);

    const read = await store.get("entry-1", TENANT);
    expect(read?.status).toBe("expired");
    // The row left pending at its own deadline, not at the instant somebody looked.
    expect(read?.decidedAt).toBe("2026-09-04T09:30:00.000Z");

    expect(await store.transition("entry-1", TENANT, "pending", approval("entry-1"))).toBe(
      "expired",
    );
  });

  it("preserves the amendments the late decision carried, for a resubmission", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));
    clock.set(AFTER_DEADLINE);

    const refused = await store.transition("entry-1", TENANT, "pending", approval("entry-1"));
    expect(refused).toBe("expired");

    const preserved = await store.preserveAmendments("entry-1", TENANT, {
      status: "paid",
      note: null,
    });

    expect(typeof preserved).not.toBe("string");
    const row = preserved as DocketEntry;
    expect(row.amendments).toEqual({ status: "paid", note: null });
    // DK-2: a null value is a cleared field, and the key is present to say so.
    expect(Object.keys(row.amendments ?? {})).toContain("note");
    // The refusal stands: nothing about the decision was recorded.
    expect(row.status).toBe("expired");
    expect(row.decision).toBeNull();
    expect(row.attestation).toBeNull();
  });

  it("refuses to preserve amendments on a row that has not expired", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    expect(await store.preserveAmendments("entry-1", TENANT, { status: "paid" })).toBe(
      "not-expired",
    );
    expect(await store.preserveAmendments("missing", TENANT, {})).toBe("not-found");
  });

  it("reads the same whether or not the sweep has caught up", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-2"));
    clock.set(AFTER_DEADLINE);

    const unswept = await store.get("entry-1", TENANT);
    await store.expireDue(AFTER_DEADLINE, TENANT, 10);
    const swept = await store.get("entry-1", TENANT);

    expect(swept).toEqual(unswept);
  });
});

describe("execution outcome on an approved row (DK-1)", () => {
  it("moves execution without touching the approval", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.transition("entry-1", TENANT, "pending", approval("entry-1"));

    const executed = (await store.recordExecution(
      "entry-1",
      TENANT,
      "executed",
      "wrote 1 row",
    )) as DocketEntry;

    expect(executed.status).toBe("approved");
    expect(executed.execution).toBe("executed");
    expect(executed.executionDetail).toBe("wrote 1 row");
    expect(executed.attestation).not.toBeNull();
  });

  it("distinguishes approved-and-committed from approved-but-failed", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-2"));
    await store.transition("entry-1", TENANT, "pending", approval("entry-1"));
    await store.transition("entry-2", TENANT, "pending", approval("entry-2"));

    await store.recordExecution("entry-1", TENANT, "executed", null);
    await store.recordExecution("entry-2", TENANT, "failed", "unique constraint");

    expect((await store.get("entry-1", TENANT))?.execution).toBe("executed");
    const failed = await store.get("entry-2", TENANT);
    expect(failed?.status).toBe("approved");
    expect(failed?.execution).toBe("failed");
    expect(failed?.executionDetail).toBe("unique constraint");
  });

  it("refuses an execution outcome on a row nobody approved", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    expect(await store.recordExecution("entry-1", TENANT, "executed", null)).toBe("not-approved");
    expect(await store.recordExecution("missing", TENANT, "executed", null)).toBe("not-found");
  });

  it("leaves an approved row out of the pending list and in the executor's list", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.transition("entry-1", TENANT, "pending", approval("entry-1"));

    expect((await store.listPending(TENANT, { limit: 10 })).items).toHaveLength(0);
    expect((await store.listApprovedUnexecuted(TENANT, { limit: 10 })).items).toHaveLength(1);

    await store.recordExecution("entry-1", TENANT, "executed", null);
    expect((await store.listApprovedUnexecuted(TENANT, { limit: 10 })).items).toHaveLength(0);
  });
});

describe("resubmission lineage (DK-1)", () => {
  it("names the successor on the superseded row and the predecessor on the new one", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.transition("entry-1", TENANT, "pending", {
      status: "rejected",
      decision: { kind: "reject", reason: "wrong amount", at: NOON },
    });
    await store.file(anEntry("entry-2", { supersedes: "entry-1" }));

    const superseded = (await store.recordSupersession(
      "entry-1",
      TENANT,
      "entry-2",
    )) as DocketEntry;

    expect(superseded.status).toBe("rejected");
    expect(superseded.lineage).toEqual({ supersedes: null, supersededBy: "entry-2" });
    expect((await store.get("entry-2", TENANT))?.lineage).toEqual({
      supersedes: "entry-1",
      supersededBy: null,
    });
  });

  it("refuses to supersede a row that is still open for a decision", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    expect(await store.recordSupersession("entry-1", TENANT, "entry-2")).toBe("not-terminal");
    expect(await store.recordSupersession("missing", TENANT, "entry-2")).toBe("not-found");
  });

  it("supersedes an entry that expired without ever being swept", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));
    clock.set(AFTER_DEADLINE);

    const superseded = (await store.recordSupersession(
      "entry-1",
      TENANT,
      "entry-2",
    )) as DocketEntry;

    expect(superseded.status).toBe("expired");
    expect(superseded.lineage.supersededBy).toBe("entry-2");
  });
});
