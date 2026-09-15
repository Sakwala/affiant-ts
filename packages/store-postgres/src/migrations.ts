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
 * **Two hosts starting at once is a no-op for the second, not a crash.** The whole
 * call runs in one transaction that first takes a transaction-scoped advisory lock
 * keyed on this package and this schema, so the second caller waits for the first to
 * finish and then finds everything applied. Without the lock they raced: the
 * migration's `create or replace function` has no `if not exists` to fall back on, and
 * the loser came back with a duplicate-key error on `pg_proc`.
 *
 * The connection is the host's. This opens one transaction and closes it before
 * returning; it never calls `end()`.
 *
 * @throws RangeError when the schema name is not a plain identifier, or when an
 *         applied migration's recorded digest differs from the shipped one.
 */
export async function applyMigrations(
  sql: Sql,
  options: ApplyMigrationsOptions = {},
): Promise<ApplyMigrationsResult> {
  const schema = requireSchema(options.schema ?? DEFAULT_SCHEMA);

  const held = await sql.begin(async (tx) => {
    // Two integers rather than one: the first names this package, so the lock cannot
    // collide with an advisory lock the host takes for reasons of its own. It is
    // released when this transaction ends, whichever way it ends.
    await tx`select pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${schema})::int)`;

    // The bookkeeping table has to exist before it can say what has been applied, so
    // it is created outside the sequence it records.
    await tx.unsafe(bootstrap(schema));

    const recorded = new Map<string, string>();
    const rows = await tx.unsafe<{ name: string; sha256: string }[]>(
      `select name, sha256 from ${qualified(schema, "schema_migrations")}`,
    );
    for (const row of rows) recorded.set(row.name, row.sha256);

    const applied: string[] = [];
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

      await tx.unsafe(renderMigration(migration, schema));
      await tx.unsafe(
        `insert into ${qualified(schema, "schema_migrations")} (name, sha256) values ($1, $2)` +
          " on conflict (name) do nothing",
        [migration.name, migration.sha256],
      );
      applied.push(migration.name);
    }

    return { value: applied };
  });

  return { applied: (held as { value: string[] }).value };
}

/**
 * The first half of the advisory lock's key: this package, so the second half is free
 * to be the schema. An arbitrary constant, fixed for the package's life.
 */
const LOCK_NAMESPACE = 0x0aff_1a17;

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
