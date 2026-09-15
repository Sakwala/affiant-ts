# Changelog — @affiant/store-postgres

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [Unreleased]

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
  cannot expire the same row twice (DK-1).

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
  second time, and refuses when a recorded name's text has since changed.

- **Measured, not asserted.** The store contract from `@affiant/core/testing` — the
  same 69 cases the shipped in-memory reference store is measured by — passes on Node
  and inside workerd, and the protocol's 61 declarative conformance documents pass
  through this store on Node with nothing failing and nothing skipped. A tripwire keeps
  file-plus-decide on a ten-field Affidavit under 25 ms per operation, which is the
  store's share of RT-2's 100 ms envelope.

- **Packing and publishing are refused unless `AFFIANT_ALLOW_PUBLISH=1` is set.** `prepack`
  runs before `npm pack` and before `npm publish` and exits non-zero, which stops both, so
  a release stays something a person dispatched rather than something a script did.

### Not in this version

- A connection through Hyperdrive, and Bun, are unmeasured; Bun has a best-effort CI
  line and Hyperdrive has none.
- No outbox, no timer, no transcript table, no Drizzle description of the tables.
