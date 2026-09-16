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

describe("every reader of a swept row agrees about when it left pending (DK-1, DK-4)", () => {
  it("keeps a swept row whose deadline is after the retention cut", async () => {
    // `get` reads the sweep's recorded instant and `retention` reads the view, so the
    // two have to be reading the same fact. With a cut strictly between the filing and
    // the deadline, a view that reached for `filed_at` would age the row out while the
    // entry still reported itself as having left `pending` after the cut.
    const scope = { tenantId: "tenant-cut" };
    clock.set(NOON);
    await store.file(
      sampleEntry("inside-the-cut", {
        tenantId: scope.tenantId,
        filedAt: NOON,
        expiresAt: DEADLINE,
      }),
    );
    clock.set(SWEEP_RAN_AT);
    await store.expireDue(SWEEP_RAN_AT, scope, 10);

    const cut = "2026-09-04T09:15:00.000Z";
    expect((await store.get("inside-the-cut", scope))?.decidedAt).toBe(DEADLINE);
    expect(await store.retention({ olderThan: cut }, scope, 10)).toEqual({
      removed: 0,
      more: false,
    });
    expect(await store.get("inside-the-cut", scope)).not.toBeNull();

    // Past the deadline, the same row goes.
    expect(await store.retention({ olderThan: SWEEP_RAN_AT }, scope, 10)).toEqual({
      removed: 1,
      more: false,
    });
  });
});

describe("a stored fact the type forbids is a refusal, not a value (DK-1)", () => {
  // The fold reads the row, which means it trusts the row, and a row can have been
  // written by something other than this package. What must never happen is that a
  // broken record is handed back as though it were a sound one — a `DocketEntry` whose
  // `decidedAt` is a number or absent is a value every caller's types say cannot exist.
  const malformed: readonly [string, Record<string, unknown>][] = [
    ["absent", { status: "expired", execution: null }],
    ["not an instant", { status: "expired", execution: null, decidedAt: "whenever" }],
    ["a number", { status: "expired", execution: null, decidedAt: 1_757_000_000_000 }],
  ];

  for (const [what, payload] of malformed) {
    it(`refuses an expiry event whose decidedAt is ${what}`, async () => {
      const scope = { tenantId: `tenant-malformed-${what.replace(/[^a-z]+/g, "-")}` };
      clock.set(NOON);
      await store.file(sampleEntry("broken", { tenantId: scope.tenantId }));
      await database.sql`
        insert into affiant.docket_events (tenant_id, entry_id, kind, payload, at)
        values (${scope.tenantId}, ${"broken"}, ${"expiry"},
                ${JSON.stringify(payload)}::text::jsonb,
                ${DEADLINE}::text::timestamptz)`;

      await expect(store.get("broken", scope)).rejects.toThrow(RangeError);
      // The refusal names the row, because the row is the only thing anybody can act on.
      await expect(store.get("broken", scope)).rejects.toThrow(/broken/);
    });
  }
});

describe("a character Postgres cannot store is this package's refusal (DK-2)", () => {
  // Two characters a JavaScript string can hold and a Postgres row cannot: U+0000,
  // which the encoding has no room for, and an unpaired surrogate, which cannot survive
  // the round trip through `text` that `jsonb` requires. Left to the driver they arrive
  // as `invalid byte sequence for encoding "UTF8": 0x00` and
  // `invalid input syntax for type json` — errors that name neither the entry nor the
  // field, and that come back from a plain column as a complaint about JSON, because the
  // whole entry is also stored as a document beside the columns.
  const NUL = String.fromCharCode(0);
  const LONE_SURROGATE = String.fromCharCode(0xd800);

  for (const [what, bad] of [
    ["U+0000", NUL],
    ["an unpaired surrogate", LONE_SURROGATE],
  ] as const) {
    it(`refuses a column value carrying ${what}, naming the entry and the field`, async () => {
      clock.set(NOON);
      const entry = sampleEntry("bad-column", {
        tenantId: "tenant-unstorable",
        channel: `chat${bad}`,
      });

      await expect(store.file(entry)).rejects.toThrow(RangeError);
      await expect(store.file(entry)).rejects.toThrow(/entry bad-column: channel/);
    });

    it(`refuses a value inside the Affidavit carrying ${what}, naming where it is`, async () => {
      clock.set(NOON);
      const base = sampleEntry("bad-document");
      const entry = sampleEntry("bad-document", {
        tenantId: "tenant-unstorable",
        affidavit: { ...base.affidavit, entityId: `invoice-1${bad}` },
      });

      await expect(store.file(entry)).rejects.toThrow(RangeError);
      // The path, not just the record: an Affidavit has dozens of strings in it and the
      // host has to be told which one it cannot file.
      await expect(store.file(entry)).rejects.toThrow(/entry bad-document: affidavit\.entityId/);
    });
  }

  it("leaves nothing behind when it refuses", async () => {
    clock.set(NOON);
    const base = sampleEntry("no-half-row");
    await expect(
      store.file(
        sampleEntry("no-half-row", {
          tenantId: "tenant-unstorable",
          affidavit: { ...base.affidavit, entityId: `invoice-1${NUL}` },
        }),
      ),
    ).rejects.toThrow(RangeError);

    const rows = await database.sql`
      select entry_id from affiant.docket_entries where entry_id = ${"no-half-row"}`;
    expect(rows).toHaveLength(0);
  });
});

describe("removing a filing removes what was appended to it (DK-4)", () => {
  it("takes the events with the filing on purge", async () => {
    // The foreign key's cascade is the only thing that does this, and nothing that
    // goes through the store's own interface can see whether it is there: a purged
    // tenant reads empty either way, while its later facts sit in the events table.
    const scope = { tenantId: "tenant-purge-cascade" };
    clock.set(NOON);
    await store.file(sampleEntry("purged", { tenantId: scope.tenantId }));
    await store.transition("purged", scope, "pending", {
      status: "rejected",
      decision: { kind: "reject", reason: "no", at: NOON },
    });
    expect(await eventCount(scope.tenantId)).toBe(1);

    expect(await store.purge(scope.tenantId)).toEqual({ removed: 1 });
    expect(await eventCount(scope.tenantId)).toBe(0);
  });

  it("takes the events with the filing on retention", async () => {
    const scope = { tenantId: "tenant-retention-cascade" };
    await store.file(
      sampleEntry("aged-out", { tenantId: scope.tenantId, filedAt: NOON, expiresAt: DEADLINE }),
    );
    clock.set(NOON);
    await store.transition("aged-out", scope, "pending", {
      status: "rejected",
      decision: { kind: "reject", reason: "no", at: NOON },
      decidedAt: NOON,
    });
    expect(await eventCount(scope.tenantId)).toBe(1);

    clock.set(SWEEP_RAN_AT);
    expect(await store.retention({ olderThan: SWEEP_RAN_AT }, scope, 10)).toEqual({
      removed: 1,
      more: false,
    });
    expect(await eventCount(scope.tenantId)).toBe(0);
  });
});

/** How many later facts the tenant's rows carry, read off the table. */
async function eventCount(tenantId: string): Promise<number> {
  const rows = await database.sql<{ count: string }[]>`
    select count(*)::text as count from affiant.docket_events where tenant_id = ${tenantId}`;
  return Number(rows[0]?.count ?? "0");
}

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
