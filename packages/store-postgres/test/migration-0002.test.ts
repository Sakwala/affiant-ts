import { sampleAffidavit } from "@affiant/core/testing";
import type { Sql } from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SCHEMA } from "../src/schema.js";
import { MIGRATIONS, renderMigration } from "../src/migrations.js";
import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * `0002_native_multiparty` on rows filed at alpha.2 (R-5).
 *
 * The migration converts the `requirement` column and rewrites `filed_row` for
 * exactly the rows that still carry the pre-0.3.0 shape, and aborts outright when a
 * `pending` `MultiParty` row would be left with no way to state its approvals. These
 * cases seed a row in that pre-0.3.0 shape by SQL directly — the way an existing
 * deployment's table actually holds one — rather than through this package's own
 * `file`, which has only ever written the 0.3.0 shape.
 */
let database: TestDatabase | null = null;

afterEach(async () => {
  const held = database;
  database = null;
  if (held !== null) await held.close();
});

/** A database with only `0001` applied — the shape `0002` has to migrate away from. */
async function atAlpha2(): Promise<TestDatabase> {
  database = await createTestDatabase({ migrate: false });
  await database.sql.unsafe(renderMigration(MIGRATIONS[0]!, DEFAULT_SCHEMA));
  return database;
}

/** One `docket_entries` row, in the shape a pre-0.3.0 gate wrote it. */
async function insertAlpha2Row(
  sql: Sql,
  fields: {
    readonly tenantId: string;
    readonly entryId: string;
    readonly requirement: string;
    readonly status: string;
    readonly execution: string | null;
    readonly executionDetail: string | null;
    readonly decidedAt: string | null;
    readonly decision: {
      readonly kind: string;
      readonly reason: string | null;
      readonly at: string;
    } | null;
    readonly attestation: {
      readonly by: { readonly kind: string; readonly id: string };
      readonly at: string;
      readonly entryId: string;
    } | null;
  },
): Promise<void> {
  const affidavit = sampleAffidavit();
  const filedRow = {
    entryId: fields.entryId,
    tenantId: fields.tenantId,
    conversationId: "conv-1",
    channel: "chat",
    toolName: "update_invoice",
    affidavit,
    amendedAffidavit: null,
    // The bare kind name — a pre-0.3.0 `requirement`, before the object shape.
    requirement: fields.requirement,
    blocked: null,
    // A key `0002` drops from every row it rewrites (composition above the gate is
    // withdrawn); its presence here is the fact R-5 is about.
    compositeRef: null,
    lineage: { supersedes: null, supersededBy: null },
    filedAt: "2026-09-04T09:00:00.000Z",
    expiresAt: "2026-09-04T09:30:00.000Z",
    protocolVersion: "0.1.0",
    status: fields.status,
    execution: fields.execution,
    // A string, the shape every pre-0.3.0 outcome carried, before it became a typed
    // object.
    executionDetail: fields.executionDetail,
    decidedAt: fields.decidedAt,
    // A decision with no `by` — the field `0002` has to add, reading the entry-level
    // attestation.
    decision: fields.decision,
    amendments: null,
    attestation: fields.attestation,
    preservedAmendments: null,
  };

  await sql`
    insert into affiant.docket_entries (
      tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
      blocked, composite_ref, supersedes, filed_at, expires_at, protocol_version, filed_row
    ) values (
      ${fields.tenantId}::text, ${fields.entryId}::text, ${"conv-1"}::text, ${"chat"}::text,
      ${"update_invoice"}::text, ${JSON.stringify(affidavit)}::text::jsonb,
      ${fields.requirement}::text, null, null, null,
      ${"2026-09-04T09:00:00.000Z"}::text::timestamptz,
      ${"2026-09-04T09:30:00.000Z"}::text::timestamptz, ${"0.1.0"}::text,
      ${JSON.stringify(filedRow)}::text::jsonb
    )`;
}

describe("0002_native_multiparty on a row filed at alpha.2", () => {
  it("rewrites a decided, executed row to one the store reads back as a valid DocketEntry", async () => {
    const { sql } = await atAlpha2();
    const decidedAt = "2026-09-04T09:10:00.000Z";
    await insertAlpha2Row(sql, {
      tenantId: "tenant-a",
      entryId: "alpha2-decided",
      requirement: "ReviewerConfirmation",
      status: "approved",
      execution: "executed",
      executionDetail: "wrote invoice 42",
      decidedAt,
      decision: { kind: "approve", reason: null, at: decidedAt },
      attestation: {
        by: { kind: "member", id: "person-7" },
        at: decidedAt,
        entryId: "alpha2-decided",
      },
    });

    await sql.unsafe(renderMigration(MIGRATIONS[1]!, DEFAULT_SCHEMA));

    const store = createPostgresDocketStore({ sql });
    const entry = await store.get("alpha2-decided", { tenantId: "tenant-a" });

    expect(entry).not.toBeNull();
    expect(entry?.requirement).toEqual({ kind: "ReviewerConfirmation" });
    expect(entry?.approvals).toBeNull();
    expect(Object.hasOwn(entry as object, "compositeRef")).toBe(false);
    expect(entry?.decision).toEqual({
      kind: "approve",
      reason: null,
      at: decidedAt,
      by: "person-7",
    });
    expect(entry?.executionDetail).toEqual({ code: "legacy", note: "wrote invoice 42" });
  }, 120_000);

  it("aborts with the ruled message when a pending MultiParty row would be stranded", async () => {
    const { sql } = await atAlpha2();
    await insertAlpha2Row(sql, {
      tenantId: "tenant-a",
      entryId: "alpha2-blocked-multiparty",
      requirement: "MultiParty",
      status: "pending",
      execution: null,
      executionDetail: null,
      decidedAt: null,
      decision: null,
      attestation: null,
    });

    await expect(sql.unsafe(renderMigration(MIGRATIONS[1]!, DEFAULT_SCHEMA))).rejects.toThrow(
      /expire or purge blocked MultiParty rows before upgrading/,
    );
  }, 120_000);
});
