/**
 * `@affiant/store-postgres` — the Affiant Docket on Postgres.
 *
 * This commit carries the SQL and the smallest thing that will apply it; the store
 * itself follows.
 *
 * @packageDocumentation
 */

export { applyMigrations, MIGRATIONS, renderMigration } from "./migrations.js";
export type { ApplyMigrationsOptions, ApplyMigrationsResult, Migration } from "./migrations.js";

export { DEFAULT_SCHEMA } from "./schema.js";
