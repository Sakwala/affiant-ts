/**
 * A database per test file, created and dropped by the file that uses it.
 *
 * Every suite here needs an empty Docket, and the cheapest honest way to get one is a
 * database of its own: the tables are created by the package's own migrations, so the
 * suites measure the SQL that ships rather than a schema a test author wrote out by
 * hand. The name carries a random suffix so two files never collide, and the admin
 * connection is opened, used and closed for each of the two statements that need it.
 *
 * `AFFIANT_PG_ADMIN_URL` points at a server the tests may create databases on. It
 * defaults to the local development container. Nothing here ever touches a database
 * it did not create.
 */
import postgres from "postgres";
import type { Options, PostgresType, Sql } from "postgres";

import { applyMigrations } from "../src/migrations.js";

/** Where a database may be created. Overridable, because CI's server is not a laptop's. */
export const DEFAULT_ADMIN_URL = "postgres://orrery:orrery@localhost:5433/postgres";

/**
 * One environment variable, where there is an environment to read it from.
 *
 * Guarded rather than read directly because these suites also run inside workerd,
 * where `process.env` is whatever the compatibility layer decided to provide.
 */
export function environment(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

/** The admin URL, from the environment where there is one to read. */
export function adminUrl(): string {
  return environment("AFFIANT_PG_ADMIN_URL") ?? DEFAULT_ADMIN_URL;
}

/** The same server, pointed at `database`. */
export function databaseUrl(database: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

/** A database this process created, and the connection it was handed back on. */
export interface TestDatabase {
  /** The host-owned connection the store under test is built from. */
  readonly sql: Sql;
  /** The database's name, for a message a failing test can print. */
  readonly name: string;
  /** Close the connection and drop the database. */
  close(): Promise<void>;
}

/** How a test database is built. */
export interface TestDatabaseOptions {
  /** The schema to apply the migrations to. Defaults to the package's own. */
  readonly schema?: string;
  /** Connections in the pool. The concurrency cases need more than one. */
  readonly max?: number;
  /** Whether to apply the migrations. `false` for the suite that applies them itself. */
  readonly migrate?: boolean;
}

/**
 * A fresh database with the package's migrations applied.
 *
 * `prepare: false` mirrors what a host behind a connection pooler in transaction mode
 * has to use, so the suites exercise the statements in the shape they will actually
 * run in.
 */
export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  const name = `affiant_test_${suffix()}`;
  await onAdmin((admin) => admin.unsafe(`create database "${name}"`));

  const sql = postgres(databaseUrl(name), connectionOptions(options.max ?? 10));
  if (options.migrate !== false) {
    await applyMigrations(sql, options.schema === undefined ? {} : { schema: options.schema });
  }

  return {
    sql,
    name,
    close: async () => {
      if (!isWorkerd()) await sql.end();
      // `with (force)` closes whatever is still attached, which is what makes the
      // drop work under workerd where the pool was deliberately left open.
      await onAdmin((admin) => admin.unsafe(`drop database if exists "${name}" with (force)`));
    },
  };
}

/** Whether the admin URL answers at all — what the budget suite skips itself on. */
export async function adminReachable(): Promise<boolean> {
  try {
    await onAdmin((admin) => admin`select 1`);
    return true;
  } catch {
    return false;
  }
}

/** Run one statement on the admin database, opening and closing the connection around it. */
async function onAdmin<T>(work: (admin: Sql) => Promise<T>): Promise<T> {
  const admin = postgres(adminUrl(), connectionOptions(1));
  try {
    return await work(admin);
  } finally {
    if (!isWorkerd()) await admin.end();
  }
}

/**
 * Whether this is running inside workerd.
 *
 * It matters for exactly one thing: closing a connection there. postgres.js's workerd
 * build reads its socket through a `ReadableStream`, and ending a connection cancels
 * that stream while a read is pending, which surfaces as an unhandled
 * `Error: Stream was cancelled.` (postgres 3.4.9, `cf/polyfills.js`) that no caller
 * can catch. There is nothing to close there in any case — the isolate goes away with
 * the test run, and the database is dropped with `force`, which detaches whatever is
 * still attached to it.
 */
function isWorkerd(): boolean {
  return (
    (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ===
    "Cloudflare-Workers"
  );
}

/** The driver options every connection here is opened with. */
function connectionOptions(max: number): Options<Record<string, PostgresType>> {
  return { max, prepare: false, onnotice: () => {} };
}

/** Eight characters of randomness, so two files never name the same database. */
function suffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
