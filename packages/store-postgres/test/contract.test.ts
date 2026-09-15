import { runDocketStoreContract, runSessionStoreContract } from "@affiant/core/testing";
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

afterAll(async () => {
  const held = database;
  database = null;
  if (held !== null) await (await held).close();
});
