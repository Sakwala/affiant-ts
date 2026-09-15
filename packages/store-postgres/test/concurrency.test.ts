import { sampleEntry, stubClock } from "@affiant/core/testing";
import type { DocketEntry, Scope, TransitionPatch } from "@affiant/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { PostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * What happens when two callers reach the same row at the same time.
 *
 * The store contract runs both decisions on one connection, where JavaScript's own
 * single thread serialises them. A database does not work like that: two connections
 * are two backends, each with a snapshot of its own, and a guard written as "read, then
 * write" holds only for as long as nothing commits in between. These cases open real
 * second connections and make the gap happen on purpose.
 *
 * Rules: DK-1 (a row leaves `pending` exactly once, and the sweep reports what it
 * actually did), DK-3 (the sweep is bounded and reports what remains), DK-4 (export is
 * read-forward, and what it promises about consistency it can keep).
 */
const NOON = "2026-09-04T09:00:00.000Z";
const DEADLINE = "2026-09-04T09:30:00.000Z";
const AFTER_DEADLINE = "2026-09-04T09:30:00.001Z";

let database: TestDatabase;
let store: PostgresDocketStore;
const clock = stubClock(NOON);

/** The patch a person's approval writes. */
function approval(entryId: string): TransitionPatch {
  return {
    status: "approved",
    decision: { kind: "approve", reason: null, at: NOON },
    attestation: { by: { kind: "member", id: "person-7" }, at: NOON, entryId },
  };
}

/** Which terminal facts are recorded for `entryId`, in no particular order. */
async function terminalKinds(tenantId: string, entryId: string): Promise<string[]> {
  const rows = await database.sql<{ kind: string }[]>`
    select kind from affiant.docket_events
    where tenant_id = ${tenantId} and entry_id = ${entryId} and kind in ('decision', 'expiry')
    order by kind`;
  return rows.map((row) => row.kind);
}

beforeAll(async () => {
  database = await createTestDatabase({ max: 8 });
  store = createPostgresDocketStore({ sql: database.sql, clock });
}, 120_000);

afterAll(async () => {
  await database.close();
});

describe("a decision and the sweep reaching the same row (DK-1, DK-3)", () => {
  it("waits for an uncommitted decision and then sweeps nothing", async () => {
    // Deterministic rather than hopeful: the decision is written and *held*, so the
    // sweep's insert meets it as an uncommitted conflicting row and has to wait. When
    // it stops waiting the decision is committed, and the sweep must report that it
    // expired nothing rather than that it expired an approved entry.
    const scope: Scope = { tenantId: "tenant-held" };
    await store.file(sampleEntry("held", { tenantId: scope.tenantId, expiresAt: DEADLINE }));

    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let decided: unknown = null;

    const deciding = database.sql.begin(async (tx) => {
      decided = await store.within(tx).transition("held", scope, "pending", approval("held"));
      await gate;
      return { value: null };
    });

    while (decided === null) await pause(5);
    expect(typeof decided).not.toBe("string");

    const sweeping = store.expireDue(AFTER_DEADLINE, scope, 10);
    // Long enough for the sweep's statement to reach the index and block on it.
    await pause(150);
    release();
    await deciding;

    const swept = await sweeping;
    expect(swept.expired).toEqual([]);
    expect(await terminalKinds(scope.tenantId, "held")).toEqual(["decision"]);
    expect((await store.get("held", scope))?.status).toBe("approved");
  }, 60_000);

  it("never leaves a row carrying both facts, over twenty parallel races", async () => {
    const scope: Scope = { tenantId: "tenant-race" };
    const ids = Array.from({ length: 20 }, (_unused, index) => `race-${index}`);
    for (const entryId of ids) {
      await store.file(sampleEntry(entryId, { tenantId: scope.tenantId, expiresAt: DEADLINE }));
    }

    // The sweep and twenty decisions, launched together on a pool of real connections.
    const [swept] = await Promise.all([
      store.expireDue(AFTER_DEADLINE, scope, 20),
      ...ids.map((entryId) => store.transition(entryId, scope, "pending", approval(entryId))),
    ]);

    for (const entryId of ids) {
      // Exactly one terminal fact, whichever won.
      expect(await terminalKinds(scope.tenantId, entryId)).toHaveLength(1);
    }

    // And the sweep named only rows it actually expired: not one of them reads
    // approved, which is what a sweep reporting its read rather than its write did.
    for (const entryId of swept.expired) {
      const row = await store.get(entryId, scope);
      expect(row?.status).toBe("expired");
      expect(await terminalKinds(scope.tenantId, entryId)).toEqual(["expiry"]);
    }
  }, 60_000);
});

describe("export is a walk, and within(tx) makes it a snapshot (DK-4)", () => {
  it("yields the set the host's transaction began with while a filing lands", async () => {
    // One more than a batch, so the walk takes two, and the second one is where a
    // concurrent filing would show up.
    const scope: Scope = { tenantId: "tenant-export" };
    for (let index = 0; index < 201; index += 1) {
      await store.file(
        sampleEntry(`export-${String(index).padStart(3, "0")}`, {
          tenantId: scope.tenantId,
          expiresAt: "2026-09-06T23:59:00.000Z",
        }),
      );
    }

    const walked = await database.sql.begin("isolation level repeatable read", async (tx) => {
      const joined = store.within(tx);
      const seen: DocketEntry[] = [];
      let landed = false;
      for await (const entry of joined.export(scope)) {
        seen.push(entry);
        if (!landed) {
          // A filing on another connection, committed while the walk is between
          // batches. The transaction's snapshot was taken before it, so it is not part
          // of what this walk is exporting.
          landed = true;
          await store.file(
            sampleEntry("export-late", {
              tenantId: scope.tenantId,
              expiresAt: "2026-09-06T23:59:00.000Z",
            }),
          );
        }
      }
      return { value: seen.map((entry) => entry.entryId) };
    });

    expect(walked.value).toHaveLength(201);
    expect(walked.value).not.toContain("export-late");

    // The plain walk is not a snapshot and does not claim to be: it reads whatever is
    // committed when each batch runs, so the late filing is in it.
    const plain: string[] = [];
    for await (const entry of store.export(scope)) plain.push(entry.entryId);
    expect(plain).toHaveLength(202);
    expect(plain).toContain("export-late");
  }, 120_000);
});

/** Yield the event loop for `ms`, so another connection can get to the database. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
