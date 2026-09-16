import { sampleEntry } from "@affiant/core/testing";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * A filing over a connection something else has also built an ORM on.
 *
 * `drizzle-orm/postgres-js` replaces the driver's serializer for every type it knows,
 * including `json` and `jsonb`, with the identity function, because it encodes values
 * itself before it binds them. It does that on the *client*, so every other user of
 * that connection inherits it. A store that asked the driver to encode its documents
 * would hand a raw object to the socket write and fail there, in the driver's own
 * `Bind`, with a `TypeError` about a string argument that was an object.
 *
 * This package therefore encodes its own JSON and casts it in the statement, and this
 * case is the proof: it files one entry over a wrapped client and reads it back, which
 * is the filing reaching the row over the client the host handed in (DK-1).
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase({ max: 4 });
  // The wrapping is the whole of the setup: the store is given the postgres.js client,
  // not the Drizzle handle, exactly as a host that uses both would give it.
  drizzle(database.sql as never);
}, 120_000);

afterAll(async () => {
  await database.close();
});

it("files and reads back an entry over a client Drizzle has wrapped", async () => {
  const store = createPostgresDocketStore({ sql: database.sql });
  const filed = await store.file(sampleEntry("entry-1", { tenantId: "tenant-a" }));

  expect(filed.created).toBe(true);
  const read = await store.get("entry-1", { tenantId: "tenant-a" });
  expect(read?.affidavit).toEqual(filed.entry.affidavit);
});
