/**
 * `@affiant/core/store-memory` — the reference Docket and Session stores, in
 * memory.
 *
 * They are a separate entry point because a host in production imports the gate and
 * a *durable* store, and should never be one careless import away from an approval
 * record that lives only in an isolate that is about to be recycled. Keeping them
 * out of the main entry point makes the choice visible in the import line.
 *
 * The in-memory store is nonetheless the **reference** implementation, not a toy: it
 * is what the store-semantics fixtures are written against, and a production store
 * earns the name by passing the same ones. What it enforces — idempotent filing, the
 * guarded compare-and-set, the deadline applied on every read, opaque paging on every
 * list, the bounded sweep, retention, purge, export, and a tenant partition a query
 * cannot cross — is the DK area of the rulebook, in code.
 *
 * @packageDocumentation
 */

export { InMemoryDocketStore, InMemorySessionStore } from "./docket/memory.js";
export type { InMemoryDocketStoreOptions } from "./docket/memory.js";
