import { conformanceManifest } from "@affiant/contract/conformance";
import { runConformance } from "@affiant/conformance-driver";
import type { ConformanceRun } from "@affiant/conformance-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrations.js";
import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * The protocol's declarative conformance suite, run against this store.
 *
 * The 61 documents are the rulebook's, not this package's: the same wirings, acts
 * and assertions that `@affiant/core` is measured by, with the Docket underneath
 * swapped for Postgres. A store that passes them is a store the gate's behaviour does
 * not change on — which is the only sense in which "a production store" means
 * anything.
 *
 * **A schema per document.** Every fixture starts from an empty Docket and files ids
 * like `entry-1` under `tenant-a`, so one shared set of tables would make the second
 * document read the first one's rows and fail for a reason that has nothing to do with
 * the rule it tests. Each document therefore gets a schema of its own with the
 * package's own migrations applied to it — which incidentally exercises
 * `applyMigrations` against a non-default schema sixty-one times.
 */
let database: TestDatabase;
let run: ConformanceRun;
/** The schemas the factory created, in the order the documents asked for them. */
const schemas: string[] = [];

beforeAll(async () => {
  database = await createTestDatabase({ migrate: false, max: 10 });

  run = await runConformance({
    runtime: "node",
    ports: {
      store: async (clock) => {
        const schema = `affiant_fx_${schemas.length}`;
        await applyMigrations(database.sql, { schema });
        schemas.push(schema);
        return createPostgresDocketStore({ sql: database.sql, clock, schema });
      },
    },
  });
}, 600_000);

afterAll(async () => {
  for (const schema of schemas) {
    await database.sql.unsafe(`drop schema if exists "${schema}" cascade`);
  }
  await database.close();
});

describe("the declarative conformance suite over the Postgres Docket", () => {
  it("passes every document the manifest lists, with nothing failing", () => {
    // Zero, in both halves: nothing failed, and nothing was skipped. A skipped
    // document is a document this store was not measured on, and a run that reported
    // one as a pass would be the whole arrangement failing quietly.
    expect(run.failingIds).toEqual([]);
    expect(run.skippedIds).toEqual([]);
    expect(run.document.summary.total).toBe(conformanceManifest.fixtures.length);
    expect(run.document.summary.passed).toBe(conformanceManifest.fixtures.length);
  });

  it("built a Docket of its own for each of the 61 declarative documents", () => {
    // The factory is the proof that the run went through this store at all: a run
    // that quietly fell back to the in-memory reference would pass and mean nothing.
    const declarative = conformanceManifest.fixtures.filter((row) => row.set !== "canonical");
    expect(declarative).toHaveLength(61);
    expect(schemas).toHaveLength(declarative.length);
    expect(new Set(schemas).size).toBe(schemas.length);
  });

  it("reports one result per document, canonical byte vectors included", () => {
    expect(run.document.results).toHaveLength(68);
    expect(run.document.results.map((result) => result.id).sort()).toEqual(
      conformanceManifest.fixtures.map((row) => row.id).sort(),
    );
  });
});
