# @affiant/store-postgres

The [Affiant](https://affiant.dev) **Docket** on Postgres: the durable record of every
write an AI agent proposed, what was decided about it, who agreed, and what became of
it.

[`@affiant/core`](../core#readme) ships an in-memory reference Docket. This package is
the one you put a production host on. It implements the same two interfaces — the
`DocketStore` every gate operation goes through and the `SessionStore` a reconnecting
client rehydrates from — over two tables and a view, on a [postgres.js](https://github.com/porsager/postgres)
connection you own.

## What it stores

One row per filed proposal, written once and never updated: the Affidavit exactly as
the agent proposed it, what the policy chain decided the write needs, the deadline, and
the whole entry as the core produced it. Then one row per later fact, at most one of
each kind per entry: the decision and its attestation, the executor's outcome, a
supersession, the amendments a decision carried after the deadline had passed, and the
sweep. What you read back is a fold of the filing and its facts.

There is no `update` statement in this package. That is not a style choice: a recorded
fact is never edited (`DK-4`), and every guard the Docket needs — a second decision
refused, an execution outcome recorded once, a sweep that cannot expire the same row
twice — is a unique index rather than a lock (`DK-1`). Rule ids like these resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md),
the rulebook both Affiant implementations are held to.

## Wiring it

```ts
import postgres from "postgres";
import { applyMigrations, createPostgresDocketStore } from "@affiant/store-postgres";

const sql = postgres(connectionString, { prepare: false });
await applyMigrations(sql); // or vendor the SQL into your own migration sequence
const store = createPostgresDocketStore({ sql });
```

`store` goes to `createGate({ store, sessions: store, … })` — it is both interfaces —
and that is the whole of the integration.

**The connection is yours.** This package opens no connection, keeps no pool of its own
and never calls `sql.end()`. Every method opens one transaction and completes it before
returning, so nothing is held across a request boundary.

**`within(tx)` when a write has to be atomic with yours.** An executor reads the
approved-and-unexecuted list, performs the write and reports the outcome; the last two
have to commit together, because an execution outcome is recorded once and there is no
second chance to correct it (`DK-1`).

```ts
await sql.begin(async (tx) => {
  await tx`insert into invoices ${tx(row)}`;
  await store.within(tx).recordExecution(entryId, scope, "executed", null, "unexecuted");
});
```

A store bound to your transaction runs its statements on `tx` and opens nothing. On a
pool of one connection that is not merely tidier — a store that opened a transaction
inside yours would wait for the connection you are holding.

## The tenant setting

Every statement filters by the tenant on the `Scope`, because a lookup carrying the
wrong tenant is a miss and never a distinguishable refusal (`AZ-2`). The tables also
enable **and force** row-level security, with policies over
`current_setting('affiant.tenant_id', true)`, which each transaction sets from the
scope it was given before it does anything else.

The setting name is this package's own, and it belongs to this package: **do not set
`affiant.tenant_id` yourself, and do not read it back.** If your application scopes its
own rows with a setting, give that one a name of its own and the two stay independent
even when they carry the same value. Inside `within(tx)` the store writes
`affiant.tenant_id` from the scope at the start of **every** call and does not put back
what was there, so a value you had set would be gone for the rest of your transaction.

The setting is transaction-scoped, never session-scoped, so it does not travel with a
pooled connection to whoever gets it next.

Row-level security is the second fence, not the first. It catches a statement that
forgot its filter, and SQL you write beside the store. It does nothing for a superuser,
which bypasses it — run your application as an ordinary role, and grant it `usage` on
the schema, `select, insert, delete` on the two tables, and `select` on the view. Those
are the grants the package's own row-level-security suite issues and measures; the view
is not updatable, so it needs no more.

## Migrations

`migrations/0001_affiant_docket.sql` is plain forward-only SQL. Two ways to run it:

- **`applyMigrations(sql, { schema })`** applies what has not been applied yet, records
  each name with the SHA-256 of the text it ran in `schema_migrations`, and is a no-op
  the second time. A name recorded with a different digest is a refusal naming both
  digests, because from that point nobody can say what shape the tables are in.
- **Vendor it.** `MIGRATIONS` from `@affiant/store-postgres/migrations` is
  `{ name, sha256, sql }` per migration. Copy the SQL into your own forward-only
  sequence and assert the digest in your CI, and an upgrade of this package that
  changes the SQL becomes a failure you read rather than a drift you find later.

The SQL carries `{{schema}}` where the schema name belongs, because the schema is
configurable (`"affiant"` by default) and an identifier cannot be a bound parameter.
`renderMigration(migration, schema)` substitutes it through one checked quoting
function; the digest is over the text as shipped, so it does not depend on which schema
you chose.

The schema is created with `create schema if not exists`, so a schema you pre-create is
left as it is.

## Export is a walk, not a snapshot

`export(scope)` yields every entry in filing order, in bounded batches, each batch its
own transaction — because a transaction held across your consumption of the stream
would pin a pooled connection for as long as you took over it. The consequence is worth
stating plainly: an entry whose filing position was allocated before the walk began and
committed after the walk had passed that position is **not** yielded.

If you need a consistent set — a tenant asking for their own record, say — walk through
`within(tx)` inside your own `repeatable read` transaction, where every batch reads the
one snapshot that transaction took:

```ts
await sql.begin("isolation level repeatable read", async (tx) => {
  for await (const entry of store.within(tx).export(scope)) write(entry);
});
```

## Runtimes

Node 22, **workerd** — the runtime a Cloudflare Worker runs on — and Bun all run this
package in CI, and a red run on any of them blocks a merge. Node and workerd run the
store contract from `@affiant/core/testing`: 89 cases, the same ones the in-memory
reference store is measured by. On workerd the connection is a direct TCP one, dialled
by the `workerd` build postgres.js ships in its own `exports` map. On Node and under Bun
the run additionally puts the protocol's 61 declarative conformance documents through
this store with nothing failing, so the gate's behaviour is measured with this Docket
underneath it and not only the store's own.

Three things about Workers worth knowing before you deploy.

The store never holds a transaction across an `await` you control, which is what a
connection pooler in transaction mode requires of it.

The connection options are yours to choose — this package imposes none of them;
Cloudflare's Hyperdrive documentation is the authority on what they should be behind
Hyperdrive, and postgres.js's own README is the authority on what they mean. The suites
here run with `prepare: false`, which is the shape a pooler in transaction mode leaves
you with.

**Do not call `sql.end()` on a connection you are about to discard.** An isolate takes
its sockets with it when it ends, so there is nothing to close; and with postgres.js
3.4.9 under workerd, `end()` resolves and the driver's pending socket read then rejects
with `Error: Stream was cancelled.` from `cf/polyfills.js` — a rejection raised outside
any call of yours, which nothing you write can catch.

**Speed.** `file` plus `transition` on a ten-field Affidavit averages roughly 4 to
16 ms per operation on a development laptop, against a Postgres in a container beside
it. A tripwire in the suite fails the build above 25 ms on Node, which is this store's
share of the 100 ms envelope RT-2 pins for a per-request path. Your own numbers depend
on where your database is and are the only ones worth planning against, so the bound is
overridable with `AFFIANT_BUDGET_MS`, and every run that measures prints the mean it
measured.

**Not measured here: a connection through Hyperdrive.** Every runtime this package
claims is exercised in CI; Hyperdrive is not, and this README will say so until a
deployment proves it.

## What is not in this package

- **No outbox and no delivery.** A host's outbox is a retry of an already-attested
  write, never a second authorization path (`AZ-5`); it is yours.
- **No timer.** Expiry is a state every read applies, not an event: an entry past its
  deadline reads `expired` whether or not any sweep has run. `expireDue` exists to make
  that durable and to drive notifications, and **you** schedule it (`DK-3`).
- **No transcript.** `SessionStore` in the core is the rehydration surface and nothing
  more. A conversation's history is your working state, not an Affiant record.
- **No model client, and no Drizzle schema.** The tables are ordinary tables; describe
  them in your own ORM if you want typed reads of them.

## Status

`0.1.0-alpha.0`. Peer dependencies: `@affiant/core` (`>=0.1.0-alpha.1`) and `postgres`
(`>=3.4.0`). Apache-2.0.

Source: [`Sakwala/affiant-ts`](https://github.com/Sakwala/affiant-ts).
