import { runDocketStoreContract, runSessionStoreContract } from "@affiant/core/testing";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * The store contract, run against Postgres.
 *
 * Every assertion here is `@affiant/core`'s, not this package's: the same cases that
 * measure the shipped in-memory reference store measure this one, which is the whole
 * of what "interchangeable" is allowed to mean. DK-1's idempotent filing and guarded
 * compare-and-set, DK-2's cleared-versus-untouched amendment, DK-3's bounded paged
 * sweep and opaque cursors, DK-4's retention, purge and export, DK-5's rehydration
 * order, AZ-2's wrong-tenant miss and AZ-5's approved-and-unexecuted row that is never
 * aged out — all of them, unchanged.
 *
 * One database for the file, and the cases are kept apart by tenancy, which the
 * contract requires of a store in any event (AZ-2): every case files under a tenant id
 * of its own, and a case that needs a second tenant is handed one.
 */
let database: Promise<TestDatabase> | null = null;

/** The file's database, created on the first block that asks for it. */
function open(): Promise<TestDatabase> {
  database ??= createTestDatabase({ max: 20 });
  return database;
}

runDocketStoreContract(
  async (clock) => createPostgresDocketStore({ sql: (await open()).sql, clock }),
  { api: { describe, it, expect, beforeAll, afterAll }, name: "postgres" },
);

runSessionStoreContract(
  async (clock) => createPostgresDocketStore({ sql: (await open()).sql, clock }),
  { api: { describe, it, expect, beforeAll, afterAll }, name: "postgres" },
);

/**
 * The same contract again, over a connection a host has also built an ORM on.
 *
 * A host is entitled to use its own connection for its own tables, and
 * `drizzle-orm/postgres-js` reconfigures the client it is handed: it replaces the
 * driver's serializers — `json` and `jsonb` among them — with the identity function,
 * because it encodes values itself. That change lives on the connection, so it applies
 * to every statement anyone sends over it. Running the whole contract here is what says
 * every operation still reaches the row over a client configured that way (DK-1).
 *
 * A second database, because the cases file the same ids as the run above.
 */
let wrapped: Promise<TestDatabase> | null = null;

/** The second database, wrapped by Drizzle before the store ever sees the client. */
function openWrapped(): Promise<TestDatabase> {
  wrapped ??= createTestDatabase({ max: 20 }).then((created) => {
    drizzle(created.sql as never);
    requireWrapped(created);
    return created;
  });
  return wrapped;
}

/**
 * The client's `jsonb` serializer, or `undefined` when the driver's own is still there.
 *
 * `drizzle(client)` writes an identity function into the registry; postgres.js's own
 * entry is `JSON.stringify`. Reading the registry is the only way to tell from outside
 * whether the wrapping took, and telling is the point: without this check, deleting the
 * `drizzle(...)` call above leaves every case in this run green, and the run proves
 * nothing at all.
 */
function jsonbSerializer(database: TestDatabase): ((value: unknown) => unknown) | undefined {
  const registry = (
    database.sql as unknown as {
      options?: { serializers?: Record<string, (value: unknown) => unknown> };
    }
  ).options?.serializers;
  return registry?.["3802"];
}

/** Fail loudly, before any case runs, if the client under test is not wrapped after all. */
function requireWrapped(database: TestDatabase): void {
  const document = { wrapped: true };
  if (jsonbSerializer(database)?.(document) !== document) {
    throw new Error(
      "the second contract run is not running over a Drizzle-wrapped client: the driver's " +
        "own jsonb serializer is still in the registry",
    );
  }
}

describe("the second run really is over a wrapped client", () => {
  it("finds the driver's jsonb serializer replaced by Drizzle's identity function", async () => {
    const database = await openWrapped();
    const document = { a: 1 };

    // Identity, not JSON text: this is the whole of the defect #48 reported, held in
    // place so that the run below cannot quietly become a second plain run.
    expect(jsonbSerializer(database)?.(document)).toBe(document);
  });

  it("leaves the plain run's client with the driver's own serializer", async () => {
    const document = { a: 1 };
    expect(jsonbSerializer(await open())?.(document)).toBe('{"a":1}');
  });
});

runDocketStoreContract(
  async (clock) => createPostgresDocketStore({ sql: (await openWrapped()).sql, clock }),
  { api: { describe, it, expect, beforeAll, afterAll }, name: "postgres behind drizzle" },
);

runSessionStoreContract(
  async (clock) => createPostgresDocketStore({ sql: (await openWrapped()).sql, clock }),
  { api: { describe, it, expect, beforeAll, afterAll }, name: "postgres behind drizzle" },
);

afterAll(async () => {
  const held = [database, wrapped];
  database = null;
  wrapped = null;
  for (const one of held) if (one !== null) await (await one).close();
});
