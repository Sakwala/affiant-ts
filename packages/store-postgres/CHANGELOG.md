# Changelog — @affiant/store-postgres

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [0.1.0-alpha.0] — 2026-09-15

The first version. Built against the rulebook's
[`v0.1.3`](https://github.com/Sakwala/affiant-protocol/releases/tag/v0.1.3) tag, which
`@affiant/core` pins and vendors byte for byte. Not on npm yet: publishing is a separate,
hand-dispatched step and it has not been dispatched for this version.

### Added

- **The Docket on Postgres.** `createPostgresDocketStore({ sql })` returns an object
  implementing both `DocketStore` and `SessionStore` from `@affiant/core` over two
  tables and a fold across them, and `within(tx)` returns the same store bound to a
  transaction the host already has open — which is how an executor records an outcome
  atomically with its own write, an outcome being recorded once and not correctable
  afterwards (DK-1, AZ-5).

- **No `update` statement.** A filing is written once and every later fact is its own
  row, at most one of each kind per entry, so a recorded fact is appended and never
  edited (DK-4) and every guard the Docket needs is a unique index rather than a lock:
  a second decision is refused, an execution outcome is recorded once, and a sweep
  cannot expire the same row twice (DK-1). A second index over the two *terminal* kinds
  is what makes a decision and a sweep exclude each other across connections, so a row
  never carries both and `expireDue` reports the rows it wrote rather than the rows it
  read.

- **The tenant scoped twice** (AZ-2). Every statement filters by the tenant from the
  `Scope`, and the tables enable and force row-level security over
  `current_setting('affiant.tenant_id', true)`, which each transaction sets from that
  same scope before anything else runs. The setting is the package's own name and is
  transaction-scoped, so it neither collides with a host's own tenant setting nor
  travels with a pooled connection.

- **The deadline is the store's clock's, never the database's.** `now()` is not
  consulted anywhere: reads apply the core's `readStatus` to the folded row, the
  compare-and-set carries the clock's instant as a bound parameter, and `expireDue`
  dates a swept row to its own `expiresAt`, so a swept row and an unswept one past the
  same deadline are the same value (DK-1).

- **Opaque cursors tagged with the list that minted them** (DK-3), over the filing
  sequence. A cursor from another list, or one nobody minted, is a `RangeError` rather
  than a quietly different page.

- **Forward-only SQL, shipped as text and as data.**
  `migrations/0001_affiant_docket.sql` creates the schema, the two tables, their
  indexes, the row-level-security policies and the fold view; `MIGRATIONS` from
  `@affiant/store-postgres/migrations` carries the same text with its SHA-256, for a
  host whose own migration tool vendors it and asserts the digest in CI.
  `applyMigrations(sql, { schema })` is for a host without one: it applies what has not
  been applied, records each name with the digest of the text it ran, is a no-op the
  second time, and refuses when a recorded name's text has since changed. It runs under
  a transaction-scoped advisory lock keyed on the schema, so two hosts starting at once
  give one caller the work and the other nothing, rather than a duplicate-key error.

- **Measured, not asserted.** The store contract from `@affiant/core/testing` — the
  same 89 cases the shipped in-memory reference store is measured by — passes on Node
  and inside workerd, and the protocol's 61 declarative conformance documents pass
  through this store on Node and under Bun with nothing failing and nothing skipped.
  Four cases across two suites open real second connections: a decision and a sweep
  reaching one row, twenty of those races at once, two hosts migrating at once, and an
  export that has to be a snapshot. Two more read the tables directly, because a value
  the fold recomputes on the way out reads correctly however wrong the row is, and an
  auditor reads the row. A tripwire keeps
  file-plus-decide on a ten-field Affidavit under 25 ms per operation, which is the
  store's share of RT-2's 100 ms envelope; `AFFIANT_BUDGET_MS` moves the bound for a
  slower machine, and every run that measures prints the mean it measured — a run with
  no server to measure against prints why it skipped instead.

- **`export` says what it is.** A walk in filing order, in bounded batches, each its own
  transaction — so an entry committed during the walk, behind the position the walk has
  already passed, is not yielded. A caller that needs a consistent set walks through
  `within(tx)` inside its own `repeatable read` transaction (DK-4).

- **Packing and publishing are refused unless `AFFIANT_ALLOW_PUBLISH=1` is set.** `prepack`
  runs before `npm pack` and before `npm publish` and exits non-zero, which stops both, so
  a release stays something a person dispatched rather than something a script did.

### Not in this version

- A connection through Hyperdrive is unmeasured. Node, workerd and Bun each run this
  package in CI, and a red run on any of them blocks a merge.
- No outbox, no timer, no transcript table, no Drizzle description of the tables.
