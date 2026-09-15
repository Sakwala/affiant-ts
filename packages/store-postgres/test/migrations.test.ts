import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sampleEntry } from "@affiant/core/testing";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS, applyMigrations, renderMigration } from "../src/migrations.js";
import { createPostgresDocketStore } from "../src/store.js";
import { DEFAULT_SCHEMA } from "../src/schema.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase, databaseUrl } from "./setup.js";

/**
 * The migrations: applied once, re-runnable, and provably the text this version ships.
 *
 * A host with a migration tool of its own vendors the SQL into its own forward-only
 * sequence and checks the digest in CI; a host without one calls `applyMigrations`.
 * Both need the same two guarantees, and these are them: running twice changes
 * nothing, and a recorded name whose text has since changed is a refusal rather than a
 * guess about which version the tables match.
 */
let database: TestDatabase | null = null;

/** A database with nothing applied to it yet. */
async function bare(): Promise<TestDatabase> {
  database = await createTestDatabase({ migrate: false });
  return database;
}

afterEach(async () => {
  const held = database;
  database = null;
  if (held !== null) await held.close();
});

describe("applyMigrations", () => {
  it("applies every migration once and nothing the second time", async () => {
    const { sql } = await bare();

    const first = await applyMigrations(sql);
    const second = await applyMigrations(sql);

    expect(first.applied).toEqual(MIGRATIONS.map((migration) => migration.name));
    expect(second.applied).toEqual([]);
  }, 120_000);

  it("records what it applied, with the digest of the text it ran", async () => {
    const { sql } = await bare();
    await applyMigrations(sql);

    const rows = await sql<{ name: string; sha256: string }[]>`
      select name, sha256 from affiant.schema_migrations order by name`;

    expect(rows.map((row) => row.name)).toEqual(MIGRATIONS.map((migration) => migration.name));
    expect(rows.map((row) => row.sha256)).toEqual(MIGRATIONS.map((migration) => migration.sha256));
  }, 120_000);

  it("lets two hosts start at once, applying everything once", async () => {
    // Two connections, both calling it, with nothing applied yet. Without the advisory
    // lock this raced: the migration's `create or replace function` has no
    // `if not exists` to fall back on, and the loser came back with a duplicate-key
    // error on `pg_proc`. With it, the second caller waits and then finds its work
    // done.
    const { sql, name } = await bare();
    const second = postgres(databaseUrl(name), { max: 1, prepare: false, onnotice: () => {} });
    try {
      const [first, other] = await Promise.all([applyMigrations(sql), applyMigrations(second)]);
      const names = MIGRATIONS.map((migration) => migration.name);
      expect([first.applied.length, other.applied.length].sort()).toEqual([0, names.length]);
      expect([...first.applied, ...other.applied]).toEqual(names);
    } finally {
      await second.end();
    }
  }, 120_000);

  it("refuses to continue when an applied migration's text has changed", async () => {
    // The failure this catches is the quiet one: somebody edits a migration that has
    // already run somewhere, and from then on nobody can say what shape the tables
    // are in. A refusal with both digests in it is the answer; repairing the record
    // silently is not.
    const { sql } = await bare();
    await applyMigrations(sql);
    await sql`update affiant.schema_migrations set sha256 = ${"0".repeat(64)}`;

    await expect(applyMigrations(sql)).rejects.toThrow(RangeError);
  }, 120_000);

  it("applies the tables to the schema it is given", async () => {
    const { sql } = await bare();

    await applyMigrations(sql, { schema: "affiant_elsewhere" });

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = ${"affiant_elsewhere"} order by table_name`;
    expect(tables.map((row) => row.table_name)).toContain("docket_entries");

    const defaulted = await sql<{ count: string }[]>`
      select count(*)::text as count from information_schema.tables
      where table_schema = ${DEFAULT_SCHEMA}`;
    expect(defaulted[0]?.count).toBe("0");
  }, 120_000);

  it("refuses a schema name that is not a plain identifier", async () => {
    const { sql } = await bare();

    await expect(applyMigrations(sql, { schema: 'a"; drop table x --' })).rejects.toThrow(
      RangeError,
    );
  }, 120_000);
});

describe("the shipped SQL", () => {
  it("renders with the schema quoted and the placeholder gone", () => {
    const rendered = renderMigration(MIGRATIONS[0]!, "affiant_elsewhere");

    expect(rendered).not.toContain("{{schema}}");
    expect(rendered).toContain('"affiant_elsewhere".docket_entries');
  });

  it("names each migration once, in order", () => {
    const names = MIGRATIONS.map((migration) => migration.name);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the files the package ships", () => {
  // The digest cases above compare the generated module with itself, which is a real
  // check of the module and no check at all of the SQL: a `.sql` file edited without
  // regenerating would pass every one of them. These read the files.
  const directory = new URL("../migrations/", import.meta.url);

  /** Every shipped `.sql` file, in the order the generator takes them. */
  function shipped(): { name: string; sql: string }[] {
    return readdirSync(fileURLToPath(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({
        name: name.replace(/\.sql$/, ""),
        sql: readFileSync(new URL(name, directory), "utf8"),
      }));
  }

  /** The placeholder substituted the way a host vendoring the file would substitute it. */
  function renderFile(text: string, schema: string): string {
    return text.split("{{schema}}").join(`"${schema}"`);
  }

  it("carries one constant per file, digesting to what the file digests to", () => {
    const files = shipped();

    expect(files.map((file) => file.name)).toEqual(MIGRATIONS.map((one) => one.name));
    for (const [index, file] of files.entries()) {
      const digest = createHash("sha256").update(file.sql, "utf8").digest("hex");
      expect(MIGRATIONS[index]?.sha256).toBe(digest);
      expect(MIGRATIONS[index]?.sql).toBe(file.sql);
    }
  });

  it("builds a working Docket from the text on disk, not from the constant", async () => {
    // What a host vendoring the SQL into its own migration sequence actually runs is
    // the file. If the file and the module ever part company, this is the half that
    // says which of them is the one that works.
    const { sql } = await bare();
    const schema = "affiant_from_disk";
    for (const file of shipped()) {
      await sql.unsafe(renderFile(file.sql, schema));
    }

    const store = createPostgresDocketStore({ sql, schema });
    const scope = { tenantId: "tenant-disk" };
    const filed = await store.file(sampleEntry("from-disk", { tenantId: scope.tenantId }));

    expect(filed.created).toBe(true);
    expect((await store.get("from-disk", scope))?.entryId).toBe("from-disk");
  }, 120_000);
});
