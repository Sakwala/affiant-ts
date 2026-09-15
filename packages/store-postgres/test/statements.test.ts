import type { Clock } from "@affiant/core";
import { sampleEntry, stubClock } from "@affiant/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { PostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * What the statements actually write, read back off the tables.
 *
 * The store contract measures a store through its own interface, which is the right
 * way round for a contract and leaves one class of mistake invisible: a value the fold
 * recomputes on the way out reads correctly however wrong the row is. An auditor reads
 * the row. So do these cases.
 *
 * Rules: DK-1 (a swept row left `pending` at its own deadline, and a decision arriving
 * after that deadline is refused and writes nothing), DK-4 (the recorded fact is the
 * record).
 */
const NOON = "2026-09-04T09:00:00.000Z";
const DEADLINE = "2026-09-04T09:30:00.000Z";
const AFTER_DEADLINE = "2026-09-04T09:30:00.001Z";
/** Deliberately much later than the deadline, so a sweep that stamped itself is caught. */
const SWEEP_RAN_AT = "2026-09-04T11:00:00.000Z";

let database: TestDatabase;
let store: PostgresDocketStore;
const clock = stubClock(NOON);

beforeAll(async () => {
  database = await createTestDatabase();
  store = createPostgresDocketStore({ sql: database.sql, clock });
}, 120_000);

afterAll(async () => {
  await database.close();
});

describe("what the sweep writes down (DK-1, DK-4)", () => {
  it("records the entry's own deadline, never the instant the sweep ran", async () => {
    const scope = { tenantId: "tenant-sweep" };
    await store.file(sampleEntry("swept", { tenantId: scope.tenantId, expiresAt: DEADLINE }));
    clock.set(SWEEP_RAN_AT);

    expect((await store.expireDue(SWEEP_RAN_AT, scope, 10)).expired).toEqual(["swept"]);

    const rows = await database.sql<{ at: Date; decided_at: string; kind: string }[]>`
      select kind, at, payload ->> 'decidedAt' as decided_at
      from affiant.docket_events
      where tenant_id = ${scope.tenantId} and entry_id = ${"swept"}`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("expiry");
    // Both of them, because both are read by something: `at` orders the facts on the
    // row and `decidedAt` is what the entry reports.
    expect(rows[0]?.decided_at).toBe(DEADLINE);
    expect(rows[0]?.at.toISOString()).toBe(DEADLINE);
    expect(rows[0]?.decided_at).not.toBe(SWEEP_RAN_AT);

    // And the entry agrees, because it is reading that row and not recomputing it.
    expect((await store.get("swept", scope))?.decidedAt).toBe(DEADLINE);
  });
});

describe("a decision that crosses the deadline while it is being applied (DK-1)", () => {
  it("is refused as expired and writes nothing at all", async () => {
    // The clock moves between the guard's decision to proceed and the statement that
    // would write. `transition` reads the clock four times — to classify the row, to
    // stamp the patch, to bound the insert, and to classify the refusal — so a clock
    // that answers NOON twice and then the far side of the deadline puts the crossing
    // exactly where it hurts: the row looked decidable, and by the time the statement
    // ran it was not.
    //
    // Two things have to hold for this to come out right, and neither is visible
    // through the fold: the insert carries the deadline test itself, and the re-read
    // after a write that did nothing says *why* it did nothing rather than assuming
    // somebody else got there first.
    const scope = { tenantId: "tenant-crossing" };
    await store.file(sampleEntry("crossing", { tenantId: scope.tenantId, expiresAt: DEADLINE }));

    const crossing = createPostgresDocketStore({
      sql: database.sql,
      clock: advancingClock(NOON, AFTER_DEADLINE, 2),
    });

    const result = await crossing.transition("crossing", scope, "pending", {
      status: "approved",
      decision: { kind: "approve", reason: null, at: NOON },
      attestation: { by: { kind: "member", id: "person-7" }, at: NOON, entryId: "crossing" },
    });

    expect(result).toBe("expired");

    const events = await database.sql<{ count: string }[]>`
      select count(*)::text as count from affiant.docket_events
      where tenant_id = ${scope.tenantId} and entry_id = ${"crossing"}`;
    expect(events[0]?.count).toBe("0");
  });
});

/** A clock that answers `first` for its first `answers` reads and `rest` after that. */
function advancingClock(first: string, rest: string, answers: number): Clock {
  let reads = 0;
  return {
    now: () => {
      reads += 1;
      return reads <= answers ? first : rest;
    },
  };
}
