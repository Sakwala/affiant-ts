/**
 * `@affiant/store-postgres` — the Affiant Docket on Postgres.
 *
 * What it is: an implementation of `DocketStore` and `SessionStore` from
 * `@affiant/core` over two append-only tables and a fold across them, plus the SQL
 * that creates them. What it is not: a connection manager. The host builds the
 * postgres.js `Sql` instance, and this package opens nothing and closes nothing.
 *
 * ```ts
 * import postgres from "postgres";
 * import { applyMigrations, createPostgresDocketStore } from "@affiant/store-postgres";
 *
 * const sql = postgres(connectionString, { max: 1, prepare: false });
 * await applyMigrations(sql);
 * const store = createPostgresDocketStore({ sql });
 * ```
 *
 * The migrations are also reachable on their own, at
 * `@affiant/store-postgres/migrations`, for a host whose migration tool vendors the
 * SQL into its own forward-only sequence.
 *
 * @packageDocumentation
 */

export { createPostgresDocketStore } from "./store.js";
export type { PostgresDocketStore, PostgresDocketStoreOptions } from "./store.js";

export { applyMigrations, MIGRATIONS, renderMigration } from "./migrations.js";
export type { ApplyMigrationsOptions, ApplyMigrationsResult, Migration } from "./migrations.js";

export { DEFAULT_SCHEMA } from "./schema.js";
