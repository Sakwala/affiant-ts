import { sampleEntry, stubClock } from "@affiant/core/testing";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * The same writes over a connection something else has also built an ORM on.
 *
 * postgres.js keeps a registry of serializers and parsers by Postgres type, and a
 * wrapper is free to replace the entries in it. `drizzle-orm/postgres-js` replaces the
 * serializers for `json` and `jsonb`, and both the serializers *and* the parsers for
 * eight date and numeric types, with the identity function, because it encodes and
 * decodes those itself. It does that to the *client*, so every other user of that
 * connection inherits it.
 *
 * Two consequences, and these cases hold both of them shut. A store that asked the
 * driver to encode its documents would hand a raw object to the socket write and fail
 * there, in the driver's own `Bind`, with a `TypeError` about a string argument that was
 * an object. And a store that let the driver resolve its instants would write a
 * different deadline on a wrapped client than on a plain one, because the driver's
 * `timestamptz` serializer resolves a zoneless instant against the process's time zone
 * and the identity function leaves the server to resolve it against its own.
 *
 * So this package encodes and normalises both itself and binds them as text (DK-1).
 */
let plain: TestDatabase;
let wrapped: TestDatabase;

/** Fixed, so nothing these cases file reads expired before they are done with it. */
const NOON = "2026-09-04T09:00:00.000Z";

beforeAll(async () => {
  plain = await createTestDatabase({ max: 4 });
  wrapped = await createTestDatabase({ max: 4 });
  // The wrapping is the whole of the setup: the store is given the postgres.js client,
  // not the Drizzle handle, exactly as a host that uses both would give it.
  drizzle(wrapped.sql as never);
}, 120_000);

afterAll(async () => {
  await plain.close();
  await wrapped.close();
});

it("files and reads back an entry over a client Drizzle has wrapped", async () => {
  const store = createPostgresDocketStore({ sql: wrapped.sql, clock: stubClock(NOON) });
  const filed = await store.file(sampleEntry("entry-1", { tenantId: "tenant-a" }));

  expect(filed.created).toBe(true);
  const read = await store.get("entry-1", { tenantId: "tenant-a" });
  expect(read?.affidavit).toEqual(filed.entry.affidavit);
});

describe("an instant means the same thing on both clients (DK-1)", () => {
  // `2026-09-04 09:30:00` is a deadline the core accepts — its instants are whatever
  // `Date.parse` can read — and it names no zone, which is what makes it the input that
  // tells the two clients apart. Anything carrying an offset is resolved identically by
  // both, and would leave this case passing against a store that did no normalising.
  const ZONELESS = "2026-09-04 09:30:00";
  /** Filed at the zoneless deadline, then swept from well past any reading of it. */
  const LONG_AFTER = "2026-09-05T00:00:00.000Z";

  /** What one client stored for the deadline, and what the sweep then did with it. */
  async function deadlineAndSweep(
    database: TestDatabase,
  ): Promise<{ storedAt: string; expired: string[] }> {
    const scope = { tenantId: "tenant-zoneless" };
    const store = createPostgresDocketStore({ sql: database.sql, clock: stubClock(NOON) });
    await store.file(sampleEntry("zoneless", { tenantId: scope.tenantId, expiresAt: ZONELESS }));

    const rows = await database.sql<{ at: string }[]>`
      select expires_at::text as at from affiant.docket_entries
      where tenant_id = ${scope.tenantId} and entry_id = ${"zoneless"}`;

    return {
      storedAt: rows[0]?.at ?? "no row",
      expired: (await store.expireDue(LONG_AFTER, scope, 10)).expired,
    };
  }

  it("writes the same deadline and sweeps the same rows on a wrapped and a plain client", async () => {
    const onPlain = await deadlineAndSweep(plain);
    const onWrapped = await deadlineAndSweep(wrapped);

    expect(onWrapped.storedAt).toBe(onPlain.storedAt);
    expect(onWrapped.expired).toEqual(["zoneless"]);
    expect(onPlain.expired).toEqual(["zoneless"]);
  });

  it("stores the instant this package normalised, not one either client resolved", async () => {
    // The row carries what `new Date(x).toISOString()` made of the filed string, which
    // is the value the store bound. Both clients therefore agree with the store, and not
    // merely with each other.
    const normalised = new Date(Date.parse(ZONELESS)).toISOString();
    // Rendered by the server rather than read back as a value, so that neither client's
    // parser has a say in what this case compares.
    const iso = `to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    for (const database of [plain, wrapped]) {
      const rows = await database.sql<{ at: string }[]>`
        select ${database.sql.unsafe(iso)} as at from affiant.docket_entries
        where tenant_id = ${"tenant-zoneless"} and entry_id = ${"zoneless"}`;
      expect(rows[0]?.at).toBe(normalised);
    }
  });
});
