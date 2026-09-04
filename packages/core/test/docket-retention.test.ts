import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { DocketEntry } from "../src/docket/entry.js";
import type { Scope } from "../src/docket/store.js";

import type { StubClock } from "./docket-support.js";
import { anEntry, ids, stubClock } from "./docket-support.js";

/**
 * DK-4 — retention, purge and export are hooks the host drives, and the Docket reads
 * forward. AZ-2 — every operation is tenant-scoped, and a mismatch is a miss.
 */
const TENANT: Scope = { tenantId: "tenant-a" };
const OTHER: Scope = { tenantId: "tenant-b" };
const NOON = "2026-09-04T09:00:00.000Z";
const LATE = "2026-09-05T09:00:00.000Z";

/** Everything `export` yields for `scope`, collected. */
async function exported(store: InMemoryDocketStore, scope: Scope): Promise<DocketEntry[]> {
  const out: DocketEntry[] = [];
  for await (const entry of store.export(scope)) out.push(entry);
  return out;
}

/** A store whose clock a test drives, so a row can be decided before it is aged out. */
function storeWithClock(start: string): { store: InMemoryDocketStore; clock: StubClock } {
  const clock = stubClock(start);
  return { store: new InMemoryDocketStore({ clock }), clock };
}

/**
 * An entry filed and decided at `at` — and, for an approval, reported on by the
 * executor, so it is eligible for retention at all.
 *
 * The clock is moved to `at` for the decision and left there; a caller ages the
 * store forward afterwards.
 */
async function decided(
  store: InMemoryDocketStore,
  clock: StubClock,
  entryId: string,
  kind: "approve" | "reject",
  at: string,
): Promise<void> {
  clock.set(at);
  await store.file(anEntry(entryId, { filedAt: at, expiresAt: "2026-09-06T23:59:00.000Z" }));
  await store.transition(entryId, TENANT, "pending", {
    status: kind === "approve" ? "approved" : "rejected",
    decision: { kind, reason: null, at },
    decidedAt: at,
  });
  if (kind === "approve") {
    await store.recordExecution(entryId, TENANT, "executed", null, "unexecuted");
  }
}

describe("retention ages out terminal entries in bounded pages (DK-4)", () => {
  it("removes at most the limit and says whether more remain", async () => {
    const { store, clock } = storeWithClock(NOON);
    for (const entryId of ["old-1", "old-2", "old-3"]) {
      await decided(store, clock, entryId, "reject", NOON);
    }
    clock.set(LATE);

    const first = await store.retention({ olderThan: LATE }, TENANT, 2);
    const second = await store.retention({ olderThan: LATE }, TENANT, 2);
    const third = await store.retention({ olderThan: LATE }, TENANT, 2);

    expect(first).toEqual({ removed: 2, more: true });
    expect(second).toEqual({ removed: 1, more: false });
    expect(third).toEqual({ removed: 0, more: false });
    expect(await exported(store, TENANT)).toHaveLength(0);
  });

  it("leaves a pending entry and a newer terminal one alone", async () => {
    const { store, clock } = storeWithClock(NOON);
    await store.file(anEntry("still-open", { expiresAt: "2026-09-06T09:00:00.000Z" }));
    await decided(store, clock, "old", "reject", NOON);
    await decided(store, clock, "recent", "reject", "2026-09-05T08:59:59.000Z");
    clock.set(LATE);

    const result = await store.retention({ olderThan: "2026-09-04T12:00:00.000Z" }, TENANT, 10);

    expect(result).toEqual({ removed: 1, more: false });
    expect(ids(await exported(store, TENANT))).toEqual(["still-open", "recent"]);
  });

  it("never ages out an approved write the executor has not reported on (AZ-5)", async () => {
    const { store, clock } = storeWithClock(NOON);
    await store.file(anEntry("awaiting-executor", { expiresAt: "2026-09-06T23:59:00.000Z" }));
    await store.transition("awaiting-executor", TENANT, "pending", {
      status: "approved",
      decidedAt: NOON,
    });
    clock.set(LATE);

    const result = await store.retention({ olderThan: LATE }, TENANT, 10);

    expect(result).toEqual({ removed: 0, more: false });
    expect(await store.get("awaiting-executor", TENANT)).not.toBeNull();
  });

  it("ages out an entry that expired without ever being swept", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(LATE) });
    await store.file(anEntry("never-decided"));

    const result = await store.retention({ olderThan: LATE }, TENANT, 10);

    expect(result).toEqual({ removed: 1, more: false });
  });

  it("refuses an unbounded retention pass", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(LATE) });

    await expect(store.retention({ olderThan: LATE }, TENANT, 0)).rejects.toThrow(RangeError);
    await expect(store.retention({ olderThan: "whenever" }, TENANT, 5)).rejects.toThrow(RangeError);
  });
});

describe("purge removes a tenant and nothing else (DK-4)", () => {
  it("removes every row the tenant has and leaves the others untouched", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("a-1"));
    await store.file(anEntry("a-2"));
    await store.file(anEntry("b-1", { tenantId: "tenant-b" }));

    const purged = await store.purge("tenant-a");

    expect(purged).toEqual({ removed: 2 });
    expect(await exported(store, TENANT)).toHaveLength(0);
    expect(ids(await exported(store, OTHER))).toEqual(["b-1"]);
  });

  it("is a no-op for a tenant that has filed nothing", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });

    expect(await store.purge("tenant-nobody")).toEqual({ removed: 0 });
  });
});

describe("export streams the Docket in filing order (DK-4)", () => {
  it("yields every row of the scope, oldest first", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("first"));
    await store.file(anEntry("second", { status: "approved" }));
    await store.file(anEntry("third", { status: "rejected" }));

    expect(ids(await exported(store, TENANT))).toEqual(["first", "second", "third"]);
  });

  it("narrows to one conversation when the scope names one", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("in-1"));
    await store.file(anEntry("elsewhere", { conversationId: "conv-2" }));
    await store.file(anEntry("in-2"));

    const rows = await exported(store, { tenantId: "tenant-a", conversationId: "conv-1" });

    expect(ids(rows)).toEqual(["in-1", "in-2"]);
  });

  it("applies the deadline to what it yields", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));
    clock.set("2026-09-04T09:30:00.001Z");

    const rows = await exported(store, TENANT);

    expect(rows[0]?.status).toBe("expired");
  });

  it("yields nothing for a tenant that has filed nothing", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });

    expect(await exported(store, OTHER)).toHaveLength(0);
  });
});

describe("a tenant mismatch is a miss, not another tenant's row (AZ-2)", () => {
  it("returns null for the right id in the wrong tenant", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    expect(await store.get("entry-1", TENANT)).not.toBeNull();
    expect(await store.get("entry-1", OTHER)).toBeNull();
  });

  it("keeps two tenants' entries with the same id apart", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("shared-id", { conversationId: "conv-a" }));
    await store.file(anEntry("shared-id", { tenantId: "tenant-b", conversationId: "conv-b" }));

    expect((await store.get("shared-id", TENANT))?.conversationId).toBe("conv-a");
    expect((await store.get("shared-id", OTHER))?.conversationId).toBe("conv-b");
  });

  it("refuses every write from the wrong tenant as not-found", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));

    expect(await store.transition("entry-1", OTHER, "pending", { status: "rejected" })).toBe(
      "not-found",
    );
    expect(await store.preserveAmendments("entry-1", OTHER, {}, { at: NOON, by: "person-7" })).toBe(
      "not-found",
    );
    expect(await store.recordExecution("entry-1", OTHER, "executed", null, "unexecuted")).toBe(
      "not-found",
    );
    expect(await store.recordSupersession("entry-1", OTHER, "entry-2")).toBe("not-found");
    expect((await store.get("entry-1", TENANT))?.status).toBe("pending");
  });

  it("lists and exports nothing for the wrong tenant", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-2", { status: "approved" }));

    expect((await store.listPending(OTHER, { limit: 10 })).items).toHaveLength(0);
    expect((await store.listApprovedUnexecuted(OTHER, { limit: 10 })).items).toHaveLength(0);
    expect(await exported(store, OTHER)).toHaveLength(0);
    expect(await store.expireDue("2027-01-01T00:00:00.000Z", OTHER, 10)).toEqual({
      expired: [],
      more: false,
    });
  });

  it("narrows to one conversation within the tenant", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1", { conversationId: "conv-1" }));
    await store.file(anEntry("entry-2", { conversationId: "conv-2" }));

    const scoped: Scope = { tenantId: "tenant-a", conversationId: "conv-2" };

    expect(await store.get("entry-1", scoped)).toBeNull();
    expect(ids((await store.listPending(scoped, { limit: 10 })).items)).toEqual(["entry-2"]);
  });
});
