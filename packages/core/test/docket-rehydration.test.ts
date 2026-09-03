import { describe, expect, it } from "vitest";

import { InMemoryDocketStore, InMemorySessionStore } from "../src/docket/memory.js";
import type { DocketEntry } from "../src/docket/entry.js";
import type { Page, Scope } from "../src/docket/store.js";

import { anEntry, ids, stubClock } from "./docket-support.js";

/**
 * DK-5 — rehydration order is fixed: `pending` entries, then `approved` and
 * `unexecuted` entries, each in filing order.
 *
 * The order is a rule and not a preference because the two groups ask different
 * things of the person reconnecting — the first still needs a decision, the second
 * still needs execution — and a client that interleaved them would put settled work
 * in front of work that is blocked on the reader.
 */
const TENANT: Scope = { tenantId: "tenant-a" };
const NOON = "2026-09-04T09:00:00.000Z";

/** A store holding, in filing order: pending, approved-executed, approved-unexecuted, rejected. */
async function mixedStore(): Promise<{
  docket: InMemoryDocketStore;
  sessions: InMemorySessionStore;
}> {
  const docket = new InMemoryDocketStore({ clock: stubClock(NOON) });
  await docket.file(anEntry("pending-1"));
  await docket.file(anEntry("approved-executed", { status: "approved" }));
  await docket.file(anEntry("approved-1", { status: "approved" }));
  await docket.file(anEntry("rejected-1", { status: "rejected" }));
  await docket.file(anEntry("pending-2"));
  await docket.file(anEntry("approved-2", { status: "approved" }));
  await docket.recordExecution("approved-executed", TENANT, "executed", null);
  return { docket, sessions: new InMemorySessionStore(docket) };
}

/** Every page of the rehydration sequence, walked with `limit`-sized pages. */
async function walk(sessions: InMemorySessionStore, limit: number): Promise<string[]> {
  const out: DocketEntry[] = [];
  let page: Page = { limit };
  for (;;) {
    const result = await sessions.rehydrate(TENANT, page);
    out.push(...result.items);
    if (!result.more) {
      expect(result.cursor).toBeNull();
      break;
    }
    expect(result.cursor).not.toBeNull();
    page = { cursor: result.cursor, limit };
  }
  return ids(out);
}

const EXPECTED = ["pending-1", "pending-2", "approved-1", "approved-2"];

describe("rehydration order (DK-5)", () => {
  it("returns pending entries before approved and unexecuted ones", async () => {
    const { sessions } = await mixedStore();

    const page = await sessions.rehydrate(TENANT, { limit: 10 });

    expect(ids(page.items)).toEqual(EXPECTED);
    expect(page.more).toBe(false);
  });

  it("leaves out rows that need neither a decision nor execution", async () => {
    const { sessions } = await mixedStore();

    const page = await sessions.rehydrate(TENANT, { limit: 10 });

    expect(ids(page.items)).not.toContain("rejected-1");
    expect(ids(page.items)).not.toContain("approved-executed");
  });

  it("holds the order at every page size", async () => {
    const { sessions } = await mixedStore();

    for (const limit of [1, 2, 3, 4, 5, 10]) {
      expect(await walk(sessions, limit)).toEqual(EXPECTED);
    }
  });

  it("resumes in the second group when a page boundary drains the first", async () => {
    const { sessions } = await mixedStore();

    const first = await sessions.rehydrate(TENANT, { limit: 2 });
    const second = await sessions.rehydrate(TENANT, { cursor: first.cursor, limit: 2 });

    expect(ids(first.items)).toEqual(["pending-1", "pending-2"]);
    expect(first.more).toBe(true);
    expect(ids(second.items)).toEqual(["approved-1", "approved-2"]);
    expect(second.more).toBe(false);
  });

  it("drops an entry that expired while the client was away", async () => {
    const clock = stubClock(NOON);
    const docket = new InMemoryDocketStore({ clock });
    const sessions = new InMemorySessionStore(docket);
    await docket.file(anEntry("pending-1"));
    await docket.file(anEntry("approved-1", { status: "approved" }));
    clock.set("2026-09-04T09:30:00.001Z");

    const page = await sessions.rehydrate(TENANT, { limit: 10 });

    expect(ids(page.items)).toEqual(["approved-1"]);
  });

  it("rehydrates one conversation when the scope names one", async () => {
    const docket = new InMemoryDocketStore({ clock: stubClock(NOON) });
    const sessions = new InMemorySessionStore(docket);
    await docket.file(anEntry("here", { conversationId: "conv-2" }));
    await docket.file(anEntry("elsewhere", { conversationId: "conv-3" }));

    const page = await sessions.rehydrate(
      { tenantId: "tenant-a", conversationId: "conv-2" },
      { limit: 10 },
    );

    expect(ids(page.items)).toEqual(["here"]);
  });

  it("returns nothing for a session with nothing outstanding", async () => {
    const docket = new InMemoryDocketStore({ clock: stubClock(NOON) });
    const sessions = new InMemorySessionStore(docket);

    const page = await sessions.rehydrate(TENANT, { limit: 10 });

    expect(page).toEqual({ items: [], cursor: null, more: false });
  });

  it("refuses a cursor from another list and an unbounded page", async () => {
    const { docket, sessions } = await mixedStore();
    const pending = await docket.listPending(TENANT, { limit: 1 });

    await expect(sessions.rehydrate(TENANT, { cursor: pending.cursor, limit: 2 })).rejects.toThrow(
      RangeError,
    );
    await expect(sessions.rehydrate(TENANT, { limit: 0 })).rejects.toThrow(RangeError);
  });
});
