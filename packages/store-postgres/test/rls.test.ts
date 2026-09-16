import { sampleEntry, stubClock } from "@affiant/core/testing";
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
 * The cases run under roles of their own rather than as the superuser who created the
 * tables, because a superuser bypasses row-level security entirely and would prove
 * nothing. Two roles, because there are two things to prove: an ordinary application
 * role, which policies apply to because `enable` says so, and a **non-superuser owner**
 * of the tables, which policies apply to only because `force` says so. Without the
 * second, dropping `force row level security` from the migration changes nothing any
 * test can see.
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

describe("row-level security applies to the tables' own owner (AZ-2)", () => {
  // A second database, because this one hands the tables to somebody else and that is
  // not a state the cases above should have to reason about.
  let owned: TestDatabase;
  const owner = `affiant_owner_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    owned = await createTestDatabase({ max: 4 });
    const sql = owned.sql;

    const store = createPostgresDocketStore({ sql });
    await store.file(entryFor("tenant-a", "entry-1"));
    await store.file(entryFor("tenant-b", "entry-1"));

    // A host that runs its application as the role that owns the schema is an ordinary
    // arrangement, and `enable row level security` alone would exempt it.
    await sql.unsafe(`create role "${owner}" nosuperuser`);
    await sql.unsafe(`grant usage on schema affiant to "${owner}"`);
    await sql.unsafe(`alter table affiant.docket_entries owner to "${owner}"`);
    await sql.unsafe(`alter table affiant.docket_events owner to "${owner}"`);
    await sql.unsafe(`alter view affiant.docket_current owner to "${owner}"`);
  }, 120_000);

  afterAll(async () => {
    await owned.sql.unsafe(`drop owned by "${owner}"`);
    await owned.sql.unsafe(`drop role if exists "${owner}"`);
    await owned.close();
  });

  it("shows the owner nothing when the transaction declares no tenant", async () => {
    const seen = await owned.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${owner}"`);
      const entries = await tx`select entry_id from affiant.docket_entries`;
      const events = await tx`select id from affiant.docket_events`;
      const view = await tx`select entry_id from affiant.docket_current`;
      return { value: [entries.length, events.length, view.length] };
    });

    expect(seen.value).toEqual([0, 0, 0]);
  });

  it("refuses the owner an insert while the transaction declares no tenant", async () => {
    const attempt = owned.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${owner}"`);
      await tx`
        insert into affiant.docket_entries (
          tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
          filed_at, expires_at, protocol_version, filed_row
        ) values (
          ${"tenant-a"}, ${"owner-wrote-this"}, ${"conv-1"}, ${"chat"}, ${"update_invoice"},
          ${tx.json({})}, ${"ReviewerConfirmation"}, ${"2026-09-04T09:00:00.000Z"}::timestamptz,
          ${"2026-09-04T09:30:00.000Z"}::timestamptz, ${"0.1.0"}, ${tx.json({})}
        )`;
      return { value: null };
    });

    await expect(attempt).rejects.toThrow(/row-level security/i);
  });

  it("shows the owner one tenant's rows once the transaction declares it", async () => {
    const seen = await owned.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${owner}"`);
      await tx`select set_config('affiant.tenant_id', ${"tenant-a"}, true)`;
      const rows = await tx<{ tenant_id: string }[]>`
        select tenant_id from affiant.docket_current`;
      return { value: rows.map((row) => row.tenant_id) };
    });

    expect(seen.value).toEqual(["tenant-a"]);
  });
});

describe("the grants the store's objects need to reference each other (AZ-2)", () => {
  // A third database, because this one hands the tables to a role that is not the
  // schema's owner and grants it less than the arrangements above do.
  let split: TestDatabase;
  /** Owns the two tables and the view, and is not the schema's owner. */
  const tablesOwner = `affiant_tables_${Math.random().toString(36).slice(2, 8)}`;
  /** The application role, with exactly the grants the README lists for it. */
  const application = `affiant_role_${Math.random().toString(36).slice(2, 8)}`;
  /** Fixed, so nothing the case files reads expired before it is decided. */
  const clock = stubClock("2026-09-04T09:00:00.000Z");

  beforeAll(async () => {
    split = await createTestDatabase({ max: 4 });
    const sql = split.sql;

    await sql.unsafe(`create role "${tablesOwner}" nosuperuser`);
    await sql.unsafe(`create role "${application}" nosuperuser`);
    // `create` is what lets a role own an object in a schema; `usage` is what lets it
    // look one up there, and the two are separate grants. The tables are handed over
    // with only the first, which is the arrangement a host lands in when its migrations
    // run as a role that did not create the schema.
    await sql.unsafe(`grant create on schema affiant to "${tablesOwner}"`);
    await sql.unsafe(`alter table affiant.docket_entries owner to "${tablesOwner}"`);
    await sql.unsafe(`alter table affiant.docket_events owner to "${tablesOwner}"`);
    await sql.unsafe(`alter view affiant.docket_current owner to "${tablesOwner}"`);

    await sql.unsafe(`grant usage on schema affiant to "${application}"`);
    await sql.unsafe(
      `grant select, insert, delete on affiant.docket_entries, affiant.docket_events to "${application}"`,
    );
    await sql.unsafe(`grant select on affiant.docket_current to "${application}"`);
  }, 120_000);

  afterAll(async () => {
    await split.sql.unsafe(`drop owned by "${application}"`);
    await split.sql.unsafe(`drop owned by "${tablesOwner}"`);
    await split.sql.unsafe(`drop role if exists "${application}"`);
    await split.sql.unsafe(`drop role if exists "${tablesOwner}"`);
    await split.close();
  });

  /** File `entryId` and decide it, as the application role. */
  async function fileAndDecide(entryId: string): Promise<string> {
    const held = await split.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${application}"`);
      const store = createPostgresDocketStore({ sql: split.sql, clock }).within(tx);
      await store.file(entryFor("tenant-a", entryId));
      const decided = await store.transition(entryId, { tenantId: "tenant-a" }, "pending", {
        status: "approved",
        attestation: {
          by: { kind: "member", id: "person-7" },
          at: "2026-09-04T09:10:00.000Z",
          entryId,
        },
      });
      return { value: typeof decided === "string" ? decided : decided.status };
    });
    return held.value;
  }

  it("needs usage on the schema for the role that owns the tables, not only for the caller", async () => {
    // The application role has every grant the README lists, and the filing goes in:
    // `docket_entries` references nothing. The decision is a row in `docket_events`,
    // which references `docket_entries`, and Postgres runs that referential-integrity
    // check as the owner of the *referencing* table — so it is the tables' owner, not
    // the caller, that has to be able to look the schema up.
    await expect(fileAndDecide("before-the-grant")).rejects.toThrow(
      /permission denied for schema affiant/,
    );

    // Not a general loss of access: the caller reads the tables perfectly well. What
    // is missing is a grant to a role that never appears in the statement.
    const readable = await split.sql.begin(async (tx) => {
      await tx.unsafe(`set local role "${application}"`);
      await tx`select set_config('affiant.tenant_id', ${"tenant-a"}, true)`;
      return { value: await tx`select entry_id from affiant.docket_events` };
    });
    expect(readable.value).toHaveLength(0);

    await split.sql.unsafe(`grant usage on schema affiant to "${tablesOwner}"`);
    expect(await fileAndDecide("after-the-grant")).toBe("approved");
  });
});
