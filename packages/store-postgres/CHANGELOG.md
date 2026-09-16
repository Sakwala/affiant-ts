# Changelog — @affiant/store-postgres

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry
cites the rule ids it satisfies, which resolve in
[`INVARIANTS.md`](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md).

Repository-wide changes — the workspace, the protocol pin, the other packages — are in
the [root changelog](../../CHANGELOG.md).

## [0.1.0-alpha.1] — 2026-09-16

Two defects the first host to wire this package up ran into, both in the seam between
the package and a host's own database work, and what looking at that seam turned up
beside them. Not published: `npm i @affiant/store-postgres@alpha` still installs
`0.1.0-alpha.0`.

### Fixed

- **This package encodes its own JSON and normalises its own instants**
  ([#48](https://github.com/Sakwala/affiant-ts/issues/48)). postgres.js keeps a registry
  of serializers and parsers by Postgres type, and a wrapper is free to replace the
  entries in it. `drizzle-orm/postgres-js` replaces the serializers for `json` and
  `jsonb`, and both the serializers and the parsers for eight date and numeric types,
  with the identity function, because it encodes and decodes those itself; the
  replacement belongs to the connection, so it applied to this store's statements too
  whenever a host built both on one client. A filing then handed a raw object to the
  driver's socket write and failed there with `TypeError: The "string" argument must be
  of type string or an instance of Buffer or ArrayBuffer. Received an instance of
  Object`.

  Every document is now written by `JSON.stringify` here and every instant by
  `new Date(x).toISOString()`, and both are bound as text with a `::text::jsonb` or
  `::text::timestamptz` cast. The text half of each cast is load-bearing: postgres.js
  takes each parameter's type from the server's description of the statement, so over a
  client whose registry is intact a parameter written `::jsonb` would be encoded a second
  time and store a JSON string where a document belongs. The instants matter for the
  opposite reason — the rulebook's instants are whatever `Date.parse` can read, including
  a zoneless one such as `2026-09-04 09:30:00`, and the driver's serializer resolved that
  against the process's time zone while the identity function left the server to resolve
  it against its own, so one filing produced two different deadlines on two clients of
  the same database.

  The store contract now runs a second time over a client Drizzle has wrapped, on Node
  and inside workerd — 89 cases each way, with the wrapping asserted live before they run
  — and a case files a zoneless deadline over both clients and holds the stored row and
  the sweep's answer identical (DK-1).

- **The grant the owner of `docket_entries` needs is stated**
  ([#49](https://github.com/Sakwala/affiant-ts/issues/49)). `docket_events` references
  `docket_entries`, and Postgres enforces that reference as the owner of the table being
  referenced — not as the caller, and not as the owner of the table the foreign key is
  declared on. A role that owns `docket_entries` in a schema it did not create therefore
  needs `usage` on the schema although it never appears in a statement. Without it a
  host's first decision fails with `permission denied for schema affiant` while reads go
  on working. The README states the grant beside the application role's, and the
  row-level-security suite has a case that hands the two tables to two different owners,
  so it tells which of them the grant belongs to (AZ-2).

- **A character Postgres cannot store is refused by name.** A string carrying U+0000 or
  an unpaired surrogate reached the driver and came back as
  `invalid byte sequence for encoding "UTF8": 0x00` or
  `invalid input syntax for type json` — errors naming neither the entry nor the field,
  and the second of which arrived even for a plain column, because the whole entry is
  stored as a document beside the columns. `file` now refuses such a value with a
  `RangeError` naming the entry and the path to the field, before any statement runs, and
  writes nothing (DK-2).

## [0.1.0-alpha.0] — 2026-09-16

The first version. Built against the rulebook's
[`v0.2.0`](https://github.com/Sakwala/affiant-protocol/releases/tag/v0.2.0) tag, which
`@affiant/core` pins and vendors byte for byte. On npm since 2026-09-16 under the `alpha`
dist-tag, which `latest` also points at: `npm i @affiant/store-postgres@alpha`. That first
publish was made under a maintainer's own credential rather than by the publish workflow —
npm requires a package to exist on the registry before a trusted-publisher entry can name
it — so this version carries the registry's signatures but no provenance attestation.

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
