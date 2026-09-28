import { sampleAffidavit, sampleEntry } from "@affiant/core/testing";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SCHEMA } from "../src/schema.js";
import { applyMigrations, MIGRATIONS, renderMigration } from "../src/migrations.js";
import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase, databaseUrl } from "./setup.js";

/**
 * `0003_multiparty_migration_guard` (B-65, BD-324 F-2).
 *
 * The four cases the ruling asks for: the guard rejects an ordinary role and the
 * whole `applyMigrations` call — one transaction — records nothing; a row `0002`
 * already converted is left byte-identical; a row a silent `0002` run left in the
 * pre-0.3.0 shape is converted exactly as `0002`'s own expression would convert it;
 * and applying `0003` twice is a no-op the second time.
 */
let database: TestDatabase | null = null;
let second: TestDatabase | null = null;

afterEach(async () => {
  const held = database;
  database = null;
  if (held !== null) await held.close();
  const heldSecond = second;
  second = null;
  if (heldSecond !== null) await heldSecond.close();
});

/** A dedicated single connection: `set role` (session-scoped, not `set local`) has to
 * survive `applyMigrations`' own nested transaction, and postgres.js only guarantees
 * that when every statement runs over the same physical connection. */
function singleConnection(name: string): Sql {
  return postgres(databaseUrl(name), { max: 1, prepare: false, onnotice: () => {} });
}

/** A database with `0001` and `0002` applied as the superuser — the shape `0003` guards. */
async function at0002(): Promise<TestDatabase> {
  const db = await createTestDatabase({ migrate: false });
  await db.sql.unsafe(renderMigration(MIGRATIONS[0]!, DEFAULT_SCHEMA));
  await db.sql.unsafe(renderMigration(MIGRATIONS[1]!, DEFAULT_SCHEMA));
  return db;
}

/** A database with only `0001` applied — the shape `0002` itself converts from, used to
 * compute the reference conversion (iii) compares `0003`'s conversion against. */
async function at0001(): Promise<TestDatabase> {
  const db = await createTestDatabase({ migrate: false });
  await db.sql.unsafe(renderMigration(MIGRATIONS[0]!, DEFAULT_SCHEMA));
  return db;
}

/** Inserts `filedRow` into a database at `0001` — `requirement` still the bare string
 * column, `composite_ref` still present — the shape `0002`'s own rewrite converts from,
 * for the reference conversion in (iii). */
async function insertPre0002Row(
  sql: Sql,
  filedRow: Record<string, unknown>,
  fields: { readonly tenantId: string; readonly entryId: string; readonly requirement: string },
): Promise<void> {
  await sql`
    insert into affiant.docket_entries (
      tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
      blocked, composite_ref, supersedes, filed_at, expires_at, protocol_version, filed_row
    ) values (
      ${fields.tenantId}::text, ${fields.entryId}::text, ${"conv-1"}::text, ${"chat"}::text,
      ${"update_invoice"}::text, ${JSON.stringify(filedRow.affidavit)}::text::jsonb,
      ${fields.requirement}::text, null, null, null,
      ${"2026-09-04T09:00:00.000Z"}::text::timestamptz,
      ${"2026-09-04T09:30:00.000Z"}::text::timestamptz, ${"0.1.0"}::text,
      ${JSON.stringify(filedRow)}::text::jsonb
    )`;
}

/** One `docket_entries` row's `filed_row`, in the pre-0.3.0 shape (the same shape
 * `test/migration-0002.test.ts`'s own builder produces), built once so two inserts —
 * possibly into two different databases — carry the identical JSON text. */
function buildAlpha2FiledRow(fields: {
  readonly entryId: string;
  readonly tenantId: string;
  readonly requirement: string;
  readonly status: string;
  readonly execution: string | null;
  readonly executionDetail: string | null;
  readonly decidedAt: string | null;
  readonly decision: { readonly kind: string; readonly reason: string | null; readonly at: string } | null;
  readonly attestation: {
    readonly by: { readonly kind: string; readonly id: string };
    readonly at: string;
    readonly entryId: string;
  } | null;
}): Record<string, unknown> {
  return {
    entryId: fields.entryId,
    tenantId: fields.tenantId,
    conversationId: "conv-1",
    channel: "chat",
    toolName: "update_invoice",
    affidavit: sampleAffidavit(),
    amendedAffidavit: null,
    requirement: fields.requirement,
    blocked: null,
    compositeRef: null,
    lineage: { supersedes: null, supersededBy: null },
    filedAt: "2026-09-04T09:00:00.000Z",
    expiresAt: "2026-09-04T09:30:00.000Z",
    protocolVersion: "0.1.0",
    status: fields.status,
    execution: fields.execution,
    executionDetail: fields.executionDetail,
    decidedAt: fields.decidedAt,
    decision: fields.decision,
    amendments: null,
    attestation: fields.attestation,
    preservedAmendments: null,
  };
}

/** Inserts `filedRow` (built by {@link buildAlpha2FiledRow}) into `sql`'s `docket_entries`. */
async function insertAlpha2Row(
  sql: Sql,
  filedRow: Record<string, unknown>,
  fields: { readonly tenantId: string; readonly entryId: string; readonly requirement: string },
): Promise<void> {
  // `composite_ref` is not in this list: this row is inserted into a database where
  // `0002` already ran (simulating the row it silently failed to convert), and `0002`
  // drops that column from the table itself — it is only ever present in `filed_row`
  // by then, which `filedRow.compositeRef: null` above already carries. The
  // `requirement` *column* is inserted already widened to `{ kind }` — `0002`'s
  // `alter column … type jsonb using …` is DDL, unconditional, and not blocked by row
  // level security, so a silent run always widens the column; only the DML rewrite of
  // `filed_row` (the RLS-guarded `update`) is what a silent run skips, which is why
  // `filed_row`'s own `requirement` stays the bare string below.
  await sql`
    insert into affiant.docket_entries (
      tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
      blocked, supersedes, filed_at, expires_at, protocol_version, filed_row
    ) values (
      ${fields.tenantId}::text, ${fields.entryId}::text, ${"conv-1"}::text, ${"chat"}::text,
      ${"update_invoice"}::text, ${JSON.stringify(filedRow.affidavit)}::text::jsonb,
      ${JSON.stringify({ kind: fields.requirement })}::text::jsonb, null, null,
      ${"2026-09-04T09:00:00.000Z"}::text::timestamptz,
      ${"2026-09-04T09:30:00.000Z"}::text::timestamptz, ${"0.1.0"}::text,
      ${JSON.stringify(filedRow)}::text::jsonb
    )`;
}

/** `filed_row`'s text for `entryId`, so two databases' rows compare as text. */
async function filedRowText(sql: Sql, entryId: string): Promise<string | null> {
  const rows = await sql<{ text: string }[]>`
    select filed_row::text as text from affiant.docket_entries where entry_id = ${entryId}`;
  return rows[0]?.text ?? null;
}

describe("0003_multiparty_migration_guard", () => {
  it("(i) refuses an ordinary role; the whole applyMigrations call is one transaction and records nothing", async () => {
    database = await createTestDatabase({ migrate: false });
    const schema = `affiant_guard_${Math.random().toString(36).slice(2, 8)}`;
    const role = `affiant_migrator_${Math.random().toString(36).slice(2, 8)}`;
    await database.sql.unsafe(`create role "${role}" nosuperuser nobypassrls nologin`);
    await database.sql.unsafe(`grant create on database "${database.name}" to "${role}"`);

    const roleSql = singleConnection(database.name);
    try {
      await roleSql.unsafe(`set role "${role}"`);
      await expect(applyMigrations(roleSql, { schema })).rejects.toThrow(
        /run this package's migrations as a superuser or a role with BYPASSRLS/,
      );
    } finally {
      await roleSql.end();
    }

    // The whole call — 0001, 0002 and 0003's guard — is one transaction: 0003's raise
    // rolled back 0001's and 0002's DDL along with it, so the schema this call would
    // have created is not there to hold a `schema_migrations` table in the first place.
    const rows = await database.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = ${schema} and table_name = 'schema_migrations'`;
    expect(rows).toHaveLength(0);

    await database.sql.unsafe(`drop owned by "${role}"`);
    await database.sql.unsafe(`drop role if exists "${role}"`);
  }, 120_000);

  it("(ii) leaves a row 0002 already converted byte-identical", async () => {
    database = await at0002();
    const store = createPostgresDocketStore({ sql: database.sql });
    // A minimal, already-0.3.0-shaped filing — exactly what a host running at 0002 or
    // later writes; nothing here is in the pre-0.3.0 shape 0003's predicate matches.
    await store.file(sampleEntry("already-native", { tenantId: "tenant-a" }));

    const before = await filedRowText(database.sql, "already-native");
    expect(before).not.toBeNull();

    await database.sql.unsafe(renderMigration(MIGRATIONS[2]!, DEFAULT_SCHEMA));

    const after = await filedRowText(database.sql, "already-native");
    expect(after).toBe(before);
  }, 120_000);

  it("(iii) converts a silent 0002 run's stranded row exactly as 0002's own expression would", async () => {
    database = await at0002();
    second = await at0001();

    const decidedAt = "2026-09-04T09:10:00.000Z";
    const filedRow = buildAlpha2FiledRow({
      entryId: "stranded-alpha2",
      tenantId: "tenant-a",
      requirement: "ReviewerConfirmation",
      status: "approved",
      execution: "executed",
      executionDetail: "wrote invoice 42",
      decidedAt,
      decision: { kind: "approve", reason: null, at: decidedAt },
      attestation: { by: { kind: "member", id: "person-7" }, at: decidedAt, entryId: "stranded-alpha2" },
    });
    const insertFields = { tenantId: "tenant-a", entryId: "stranded-alpha2", requirement: "ReviewerConfirmation" };

    // Simulates the silent run (BD-324 F-2): this row is inserted into a database
    // where `0002` is already recorded — the `requirement` column already widened to
    // `{ kind }` by `0002`'s DDL, `filed_row` left in the pre-0.3.0 shape because the
    // RLS-guarded DML never converted it.
    await insertAlpha2Row(database.sql, filedRow, insertFields);
    // The reference database gets the identical `filed_row`, inserted into the true
    // pre-0002 shape (0001 only) and converted by 0002's own rewrite, unblocked here
    // because this runs as the superuser.
    await insertPre0002Row(second.sql, filedRow, insertFields);
    await second.sql.unsafe(renderMigration(MIGRATIONS[1]!, DEFAULT_SCHEMA));

    await database.sql.unsafe(renderMigration(MIGRATIONS[2]!, DEFAULT_SCHEMA));

    const via0003 = await filedRowText(database.sql, "stranded-alpha2");
    const via0002 = await filedRowText(second.sql, "stranded-alpha2");
    expect(via0003).not.toBeNull();
    expect(via0003).toBe(via0002);

    // And it really did convert, not merely match a second no-op: the object shape is
    // there.
    const store = createPostgresDocketStore({ sql: database.sql });
    const entry = await store.get("stranded-alpha2", { tenantId: "tenant-a" });
    expect(entry?.requirement).toEqual({ kind: "ReviewerConfirmation" });
    expect(entry?.decision).toEqual({ kind: "approve", reason: null, at: decidedAt, by: "person-7" });
    expect(entry?.executionDetail).toEqual({ code: "legacy", note: "wrote invoice 42" });
  }, 120_000);

  it("(iv) applied twice changes nothing the second time", async () => {
    database = await at0002();
    const decidedAt = "2026-09-04T09:10:00.000Z";
    const filedRow = buildAlpha2FiledRow({
      entryId: "twice-alpha2",
      tenantId: "tenant-a",
      requirement: "ReviewerConfirmation",
      status: "approved",
      execution: "executed",
      executionDetail: "wrote invoice 42",
      decidedAt,
      decision: { kind: "approve", reason: null, at: decidedAt },
      attestation: { by: { kind: "member", id: "person-7" }, at: decidedAt, entryId: "twice-alpha2" },
    });
    await insertAlpha2Row(database.sql, filedRow, {
      tenantId: "tenant-a",
      entryId: "twice-alpha2",
      requirement: "ReviewerConfirmation",
    });

    await database.sql.unsafe(renderMigration(MIGRATIONS[2]!, DEFAULT_SCHEMA));
    const once = await filedRowText(database.sql, "twice-alpha2");

    await database.sql.unsafe(renderMigration(MIGRATIONS[2]!, DEFAULT_SCHEMA));
    const twice = await filedRowText(database.sql, "twice-alpha2");

    expect(twice).toBe(once);
  }, 120_000);
});
