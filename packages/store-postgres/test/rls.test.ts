import { sampleEntry } from "@affiant/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { createTestDatabase } from "./setup.js";

/**
 * Row-level security: the half of AZ-2 the statements do not carry.
 *
 * Every statement in the package filters by tenant, because the contract says an
 * entry outside the caller's tenant is a miss. These cases prove the second fence:
 * the tables enable *and force* row-level security over a transaction-scoped setting
 * the store writes, so a statement that forgot the filter — or a host that reached
 * past the store and wrote SQL of its own — still sees nothing outside the tenant the
 * transaction declared.
 *
 * The cases run under a role of their own rather than under the owner, because a
 * superuser bypasses row-level security entirely and would prove nothing. `force` is
 * what covers the ordinary owner; the role here is what a host's application user
 * looks like.
 */
let database: TestDatabase;
/** A non-superuser role, which is what row-level security is about. */
const role = `affiant_app_${Math.random().toString(36).slice(2, 8)}`;

/** An entry filed in `tenantId`, built by the contract's own fixture builder. */
function entryFor(tenantId: string, entryId: string) {
  return sampleEntry(entryId, { tenantId });
}

beforeAll(async () => {
  database = await createTestDatabase({ max: 4 });
  const sql = database.sql;
  await sql.unsafe(`create role "${role}" nosuperuser`);
  await sql.unsafe(`grant usage on schema affiant to "${role}"`);
  await sql.unsafe(
    `grant select, insert, delete on affiant.docket_entries, affiant.docket_events to "${role}"`,
  );
  await sql.unsafe(`grant select on affiant.docket_current to "${role}"`);

  const store = createPostgresDocketStore({ sql });
  await store.file(entryFor("tenant-a", "entry-1"));
  await store.file(entryFor("tenant-b", "entry-1"));
}, 120_000);

afterAll(async () => {
  // The role is a cluster object, not a database one: dropping the database leaves it
  // behind, and a suite that ran often enough left a role per run on a shared server.
  // `drop owned by` first, because the grants above are dependencies of it.
  await database.sql.unsafe(`drop owned by "${role}"`);
  await database.sql.unsafe(`drop role if exists "${role}"`);
  await database.close();
});

describe("row-level security over the tenant setting (AZ-2)", () => {
  it("shows a restricted role nothing at all when no tenant is declared", async () => {
    const rows = await database.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${role}"`);
      return { value: await tx`select entry_id from affiant.docket_entries` };
    });
    expect(rows.value).toHaveLength(0);
  });

  it("shows the declared tenant's rows and no other tenant's", async () => {
    const seen = await database.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${role}"`);
      await tx`select set_config('affiant.tenant_id', ${"tenant-a"}, true)`;
      const rows = await tx<{ tenant_id: string }[]>`select tenant_id from affiant.docket_entries`;
      return { value: rows.map((row) => row.tenant_id) };
    });
    expect(seen.value).toEqual(["tenant-a"]);
  });

  it("hides the other tenant's row from the view as well as from the tables", async () => {
    const seen = await database.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${role}"`);
      await tx`select set_config('affiant.tenant_id', ${"tenant-b"}, true)`;
      const rows = await tx<{ tenant_id: string }[]>`select tenant_id from affiant.docket_current`;
      return { value: rows.map((row) => row.tenant_id) };
    });
    expect(seen.value).toEqual(["tenant-b"]);
  });

  it("refuses an insert that carries a tenant the transaction did not declare", async () => {
    // The policy's `with check` half, exercised the way a host would breach it: SQL
    // written beside the store rather than through it. Without this half a restricted
    // role could write a row it would then be unable to read, which is a way of
    // writing into somebody else's tenant.
    const attempt = database.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${role}"`);
      await tx`select set_config('affiant.tenant_id', ${"tenant-a"}, true)`;
      await tx`
        insert into affiant.docket_entries (
          tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
          filed_at, expires_at, protocol_version, filed_row
        ) values (
          ${"tenant-c"}, ${"smuggled"}, ${"conv-1"}, ${"chat"}, ${"update_invoice"},
          ${tx.json({})}, ${"ReviewerConfirmation"}, ${"2026-09-04T09:00:00.000Z"}::timestamptz,
          ${"2026-09-04T09:30:00.000Z"}::timestamptz, ${"0.1.0"}, ${tx.json({})}
        )`;
      return { value: null };
    });

    await expect(attempt).rejects.toThrow(/row-level security/i);
  });

  it("lets the store read and write under the restricted role for its own tenant", async () => {
    const read = await database.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${role}"`);
      const store = createPostgresDocketStore({ sql: database.sql }).within(tx);
      const filed = await store.file(entryFor("tenant-a", "entry-2"));
      const got = await store.get("entry-2", { tenantId: "tenant-a" });
      const missed = await store.get("entry-1", { tenantId: "tenant-nobody" });
      return { value: { created: filed.created, got: got?.entryId ?? null, missed } };
    });

    expect(read.value.created).toBe(true);
    expect(read.value.got).toBe("entry-2");
    // A tenant with nothing in it is a miss, and it is a miss twice over: the
    // statement filters by tenant and the policy would have hidden the row anyway.
    expect(read.value.missed).toBeNull();
  });
});
