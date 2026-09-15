/**
 * The package's SQL, and the smallest thing that will apply it.
 *
 * **Rules served: DK-4** (a recorded fact is never edited, which is a property of the
 * tables these statements create), **AZ-2** (the row-level security they enable).
 *
 * Two audiences. A host with a migration tool of its own — most hosts — vendors
 * {@link Migration.sql} into its own forward-only sequence and checks
 * {@link Migration.sha256} in its CI, so the copy it runs is provably the copy this
 * version shipped. A host without one calls {@link applyMigrations}, which records
 * what it applied in a table of its own and is a no-op the second time.
 *
 * The SQL carries `{{schema}}` where the schema name belongs, because the schema is
 * configurable and an identifier cannot be a bound parameter. {@link renderMigration}
 * is the only thing that substitutes it, through one checked quoting function, and
 * the digest is over the text as shipped so it does not depend on the host's choice.
 *
 * @packageDocumentation
 */

import type { Sql } from "postgres";

import { MIGRATIONS } from "./migrations.generated.js";
import type { Migration } from "./migrations.generated.js";
import { DEFAULT_SCHEMA, quoteIdentifier, renderSchema, requireSchema } from "./schema.js";

export type { Migration } from "./migrations.generated.js";
export { MIGRATIONS } from "./migrations.generated.js";

/** How {@link applyMigrations} is pointed at a schema. */
export interface ApplyMigrationsOptions {
  /** The schema to create the tables in. Defaults to `"affiant"`. */
  readonly schema?: string;
}

/** What {@link applyMigrations} did. */
export interface ApplyMigrationsResult {
  /** The names applied by this call, in order. Empty when everything was already there. */
  readonly applied: string[];
}

/**
 * `migration`'s SQL with the schema substituted — what a host's own migration tool
 * should store, and what {@link applyMigrations} executes.
 */
export function renderMigration(migration: Migration, schema: string = DEFAULT_SCHEMA): string {
  return renderSchema(migration.sql, schema);
}

/**
 * Apply every migration this package ships that has not been applied to `schema` yet.
 *
 * Idempotent: a second call applies nothing. A migration whose name is recorded with
 * a different digest is a {@link RangeError} and nothing is applied after it — the
 * text that ran here and the text this version ships are not the same text, and
 * guessing which one the tables match is exactly the guess a migration table exists
 * to make unnecessary.
 *
 * The connection is the host's. This opens one transaction per migration and closes
 * it before returning; it never calls `end()`.
 *
 * @throws RangeError when the schema name is not a plain identifier, or when an
 *         applied migration's recorded digest differs from the shipped one.
 */
export async function applyMigrations(
  sql: Sql,
  options: ApplyMigrationsOptions = {},
): Promise<ApplyMigrationsResult> {
  const schema = requireSchema(options.schema ?? DEFAULT_SCHEMA);
  const applied: string[] = [];

  // The bookkeeping table has to exist before it can say what has been applied, so
  // it is created outside the sequence it records. Both statements are
  // `if not exists`, which is what makes a second call — or two hosts starting at
  // once — a no-op rather than a race.
  await sql.unsafe(bootstrap(schema));

  const recorded = new Map<string, string>();
  const rows = await sql.unsafe<{ name: string; sha256: string }[]>(
    `select name, sha256 from ${qualified(schema, "schema_migrations")}`,
  );
  for (const row of rows) recorded.set(row.name, row.sha256);

  for (const migration of MIGRATIONS) {
    const previous = recorded.get(migration.name);
    if (previous !== undefined) {
      if (previous !== migration.sha256) {
        throw new RangeError(
          `migration ${migration.name} was applied as ${previous} but this package ships ${migration.sha256}`,
        );
      }
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(renderMigration(migration, schema));
      await tx.unsafe(
        `insert into ${qualified(schema, "schema_migrations")} (name, sha256) values ($1, $2)` +
          " on conflict (name) do nothing",
        [migration.name, migration.sha256],
      );
    });
    applied.push(migration.name);
  }

  return { applied };
}

/** The schema and the migration table, both of which the recorded sequence presumes. */
function bootstrap(schema: string): string {
  return (
    `create schema if not exists ${identifier(schema)};\n` +
    `create table if not exists ${qualified(schema, "schema_migrations")} (\n` +
    "  name        text        not null primary key,\n" +
    "  sha256      text        not null,\n" +
    "  applied_at  timestamptz not null default now()\n" +
    ");"
  );
}

/** `schema`, checked and quoted. */
function identifier(schema: string): string {
  return quoteIdentifier(requireSchema(schema));
}

/** `schema.table`, with the schema checked and quoted and the table name a literal here. */
function qualified(schema: string, table: string): string {
  return `${identifier(schema)}."${table}"`;
}
