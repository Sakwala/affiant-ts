/**
 * `@affiant/core/store-memory` — the reference Docket and Session stores, in
 * memory.
 *
 * The entry point exists from the first release so a host can pin the import path
 * and a conformance driver can name it. The stores themselves — `InMemoryDocketStore`
 * and `InMemorySessionStore`, the compare-and-set transition, expiry-as-state, the
 * paged `expireDue` sweep, the rehydration lists and the retention, purge and
 * export hooks — arrive in pull request **C4 (`core/store`)**.
 *
 * The in-memory store is the reference implementation, not a toy: it passes the
 * same store-semantics fixtures a Postgres store will have to pass.
 *
 * @packageDocumentation
 */

export {};
