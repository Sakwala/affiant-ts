import { sampleEntry, stubClock } from "@affiant/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { PostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * `within(tx)`: the Docket write and the host's write are one unit of work.
 *
 * A host's executor reads the approved-and-unexecuted list, performs the write and
 * reports the outcome. Those last two have to commit together or the Docket ends up
 * claiming a write that did not happen, or missing one that did — and an execution
 * outcome is recorded once (DK-1), so there is no second chance to correct it. The
 * same is true at the other end: a filing that commits while the host's own row rolls
 * back leaves an entry nobody can act on.
 *
 * So the store joins the transaction the host already has open rather than opening one
 * of its own. That is also the only shape that works on a pool of one connection,
 * which is what a host behind a connection pooler in transaction mode runs.
 */
let database: TestDatabase;
let store: PostgresDocketStore;

/** The instant every fixture here is filed at, so nothing reads expired mid-case. */
const NOON = "2026-09-04T09:00:00.000Z";
const clock = stubClock(NOON);

beforeAll(async () => {
  database = await createTestDatabase();
  await database.sql.unsafe(
    "create table host_rows (entry_id text primary key, amount text not null)",
  );
  store = createPostgresDocketStore({ sql: database.sql, clock });
}, 120_000);

afterAll(async () => {
  await database.close();
});

/** The host rows written so far, in id order. */
async function hostRows(): Promise<string[]> {
  const rows = await database.sql<{ entry_id: string }[]>`
    select entry_id from host_rows order by entry_id`;
  return rows.map((row) => row.entry_id);
}

describe("a store bound to the host's transaction", () => {
  it("commits the filing and the host's row together", async () => {
    await database.sql.begin(async (tx) => {
      await tx`insert into host_rows (entry_id, amount) values (${"together"}, ${"1.00"})`;
      await store.within(tx).file(sampleEntry("together", { tenantId: "tenant-a" }));
      return { value: null };
    });

    expect(await hostRows()).toContain("together");
    expect((await store.get("together", { tenantId: "tenant-a" }))?.entryId).toBe("together");
  });

  it("leaves no row behind when the host's transaction rolls back", async () => {
    const attempt = database.sql.begin(async (tx) => {
      await store.within(tx).file(sampleEntry("rolled-back", { tenantId: "tenant-a" }));
      await tx`insert into host_rows (entry_id, amount) values (${"rolled-back"}, ${"2.00"})`;
      throw new Error("the host's write failed");
    });

    await expect(attempt).rejects.toThrow("the host's write failed");
    expect(await hostRows()).not.toContain("rolled-back");
    expect(await store.get("rolled-back", { tenantId: "tenant-a" })).toBeNull();
  });

  it("records an execution outcome atomically with the host's write", async () => {
    // The executor's path: the list, the write, the report — the last two in one
    // transaction, so a crash between them cannot leave the Docket saying a write
    // happened that did not.
    const scope = { tenantId: "tenant-a" };
    await store.file(sampleEntry("executed", { tenantId: "tenant-a" }));
    await store.transition("executed", scope, "pending", {
      status: "approved",
      attestation: {
        by: { kind: "member", id: "person-7" },
        at: NOON,
        entryId: "executed",
      },
    });

    const outstanding = await store.listApprovedUnexecuted(scope, { limit: 10 });
    expect(outstanding.items.map((entry) => entry.entryId)).toContain("executed");

    await database.sql.begin(async (tx) => {
      const joined = store.within(tx);
      await tx`insert into host_rows (entry_id, amount) values (${"executed"}, ${"3.00"})`;
      const recorded = await joined.recordExecution(
        "executed",
        scope,
        "executed",
        "wrote 1 row",
        "unexecuted",
      );
      expect(typeof recorded).not.toBe("string");
      return { value: null };
    });

    const row = await store.get("executed", scope);
    expect(row?.execution).toBe("executed");
    expect(row?.executionDetail).toBe("wrote 1 row");
    expect(await hostRows()).toContain("executed");
  });

  it("rehydrates and lists from inside the host's transaction", async () => {
    const seen = await database.sql.begin(async (tx) => {
      const joined = store.within(tx);
      const page = await joined.rehydrate({ tenantId: "tenant-a" }, { limit: 10 });
      return { value: page.items.map((entry) => entry.entryId) };
    });

    // `together` is pending and `executed` has been reported on, so only the first is
    // outstanding for a reconnecting client (DK-5).
    expect(seen.value).toContain("together");
    expect(seen.value).not.toContain("executed");
  });
});
