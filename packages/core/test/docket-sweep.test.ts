import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { Scope } from "../src/docket/store.js";

import { anEntry, ids, stubClock } from "./docket-support.js";

/**
 * DK-3 — the expiry sweep is bounded, paged and host-scheduled.
 *
 * The shipped .NET sweep runs every 30 seconds over every pending entry, unpaged, on
 * every instance. Two things replace it here: the deadline is applied on read
 * (DK-1, so nothing depends on the sweep having run), and the sweep itself takes a
 * limit and reports whether more remain, so a host drains it in bounded steps. The
 * core schedules nothing — `test/node/docket-runtime.test.ts` greps `src/` for a
 * timer.
 */
const TENANT: Scope = { tenantId: "tenant-a" };
const NOON = "2026-09-04T09:00:00.000Z";
const AFTER_DEADLINE = "2026-09-04T09:30:00.001Z";

/** A store holding `count` entries that are all due at {@link AFTER_DEADLINE}. */
async function storeWithDueEntries(count: number): Promise<InMemoryDocketStore> {
  const store = new InMemoryDocketStore({ clock: stubClock(AFTER_DEADLINE) });
  for (let index = 1; index <= count; index += 1) {
    await store.file(
      anEntry(`entry-${index}`, {
        filedAt: `2026-09-04T09:00:0${index}.000Z`,
      }),
    );
  }
  return store;
}

describe("expireDue is bounded and reports what is left (DK-3)", () => {
  it("expires at most the limit and says more remain", async () => {
    const store = await storeWithDueEntries(5);

    const first = await store.expireDue(AFTER_DEADLINE, TENANT, 2);

    expect(first.expired).toEqual(["entry-1", "entry-2"]);
    expect(first.more).toBe(true);
  });

  it("drains five due entries in three bounded calls", async () => {
    const store = await storeWithDueEntries(5);

    const first = await store.expireDue(AFTER_DEADLINE, TENANT, 2);
    const second = await store.expireDue(AFTER_DEADLINE, TENANT, 2);
    const third = await store.expireDue(AFTER_DEADLINE, TENANT, 2);
    const fourth = await store.expireDue(AFTER_DEADLINE, TENANT, 2);

    expect(first.expired).toEqual(["entry-1", "entry-2"]);
    expect(second.expired).toEqual(["entry-3", "entry-4"]);
    expect(third.expired).toEqual(["entry-5"]);
    expect(third.more).toBe(false);
    // Nothing is expired twice: a swept row is no longer due.
    expect(fourth).toEqual({ expired: [], more: false });
  });

  it("expires in filing order", async () => {
    const store = await storeWithDueEntries(4);

    const swept = await store.expireDue(AFTER_DEADLINE, TENANT, 10);

    expect(swept.expired).toEqual(["entry-1", "entry-2", "entry-3", "entry-4"]);
  });

  it("leaves entries that are not due alone", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("due", { expiresAt: "2026-09-04T09:10:00.000Z" }));
    await store.file(anEntry("later", { expiresAt: "2026-09-04T23:00:00.000Z" }));

    const swept = await store.expireDue("2026-09-04T09:15:00.000Z", TENANT, 10);

    expect(swept.expired).toEqual(["due"]);
    expect((await store.get("later", TENANT))?.status).toBe("pending");
  });

  it("never sweeps an entry that already left pending", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("approved-1", { status: "approved" }));
    await store.file(anEntry("rejected-1", { status: "rejected" }));
    clock.set(AFTER_DEADLINE);

    expect(await store.expireDue(AFTER_DEADLINE, TENANT, 10)).toEqual({
      expired: [],
      more: false,
    });
  });

  it("sweeps only the scope it was asked for", async () => {
    const store = await storeWithDueEntries(2);
    await store.file(anEntry("other-conv", { conversationId: "conv-2" }));

    const swept = await store.expireDue(
      AFTER_DEADLINE,
      { ...TENANT, conversationId: "conv-2" },
      10,
    );

    expect(swept.expired).toEqual(["other-conv"]);
    expect((await store.get("entry-1", TENANT))?.status).toBe("expired");
  });

  it("refuses an unbounded sweep", async () => {
    const store = await storeWithDueEntries(1);

    await expect(store.expireDue(AFTER_DEADLINE, TENANT, 0)).rejects.toThrow(RangeError);
    await expect(store.expireDue(AFTER_DEADLINE, TENANT, -1)).rejects.toThrow(RangeError);
    await expect(store.expireDue(AFTER_DEADLINE, TENANT, 1.5)).rejects.toThrow(RangeError);
  });
});

describe("every list is paged with an opaque cursor (DK-3, RT-2)", () => {
  it("walks the pending list a page at a time", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    for (let index = 1; index <= 5; index += 1) await store.file(anEntry(`entry-${index}`));

    const first = await store.listPending(TENANT, { limit: 2 });
    const second = await store.listPending(TENANT, { cursor: first.cursor, limit: 2 });
    const third = await store.listPending(TENANT, { cursor: second.cursor, limit: 2 });

    expect(ids(first.items)).toEqual(["entry-1", "entry-2"]);
    expect(first.more).toBe(true);
    expect(ids(second.items)).toEqual(["entry-3", "entry-4"]);
    expect(ids(third.items)).toEqual(["entry-5"]);
    expect(third.more).toBe(false);
    expect(third.cursor).toBeNull();
  });

  it("hands back a cursor a caller cannot read or guess", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-2"));

    const page = await store.listPending(TENANT, { limit: 1 });

    expect(page.cursor).not.toBeNull();
    expect(page.cursor).not.toContain("entry-1");
  });

  it("refuses a cursor minted for a different list", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    await store.file(anEntry("entry-1"));
    await store.file(anEntry("entry-2"));
    const pending = await store.listPending(TENANT, { limit: 1 });

    await expect(
      store.listApprovedUnexecuted(TENANT, { cursor: pending.cursor, limit: 1 }),
    ).rejects.toThrow(RangeError);
  });

  it("refuses a cursor nobody minted", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });

    await expect(store.listPending(TENANT, { cursor: "not-a-cursor", limit: 1 })).rejects.toThrow(
      RangeError,
    );
  });

  it("refuses an unbounded page", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });

    await expect(store.listPending(TENANT, { limit: 0 })).rejects.toThrow(RangeError);
  });

  it("drops an entry out of the pending list the moment it reads expired", async () => {
    const clock = stubClock(NOON);
    const store = new InMemoryDocketStore({ clock });
    await store.file(anEntry("entry-1"));

    expect((await store.listPending(TENANT, { limit: 10 })).items).toHaveLength(1);
    clock.set(AFTER_DEADLINE);
    expect((await store.listPending(TENANT, { limit: 10 })).items).toHaveLength(0);
  });
});
