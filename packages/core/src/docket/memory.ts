/**
 * The reference Docket and Session stores, in memory.
 *
 * **Rules served: DK-1** (idempotent filing, the guarded compare-and-set, expiry as
 * queryable state, preserved amendments on a late decision, execution outcome,
 * lineage), **DK-3** (a bounded, paged sweep and no timer), **DK-4** (retention,
 * purge, export, read-forward), **DK-5** (rehydration order), **AZ-2** (tenant
 * isolation), **RT-2** (nothing unbounded but a purge).
 *
 * "In memory" is not "toy". This is the *reference* store: it is what the
 * store-semantics fixtures are written against, and a Postgres store earns the name
 * by passing the same ones. Everything a production store has to get right is here
 * — the compare-and-set, the deadline applied on read, the opaque paging, the
 * tenant partition — because a reference that skipped them would let a fixture pass
 * for the wrong reason.
 *
 * **How the compare-and-set is atomic without a lock.** JavaScript is
 * single-threaded, but `await` is an interleaving point: any method that reads state,
 * awaits, and then writes it has a window in which another caller can run. So every
 * mutating method here does its read and its write in **one synchronous block** —
 * the `async` wrapper contains no `await` at all, which means the body runs to
 * completion before the caller's next turn of the event loop. Two `transition` calls
 * launched together with `Promise.all` therefore serialize, and exactly one wins the
 * guard. A production store gets the same property from a conditional `UPDATE`; the
 * shape of the fixture is identical either way.
 *
 * **Storage layout.** One `Map` per tenant, keyed by entry id, so a cross-tenant read
 * is not a filtered read but an impossible one — there is no code path that looks in
 * another tenant's map. `Map` preserves insertion order, which *is* filing order, so
 * every list, sweep and export walks it directly rather than sorting. A sequence
 * number per row makes that position addressable by an opaque cursor.
 *
 * @packageDocumentation
 */

import type { AmendmentMap } from "../model/amendments.js";

import type { Clock } from "../ports.js";
import { defaultClock } from "../ports.js";

import type { DocketEntry, DocketStatus, ExecutionOutcome } from "./entry.js";
import { readStatus } from "./entry.js";
import { isDue, instantMs } from "./expiry.js";
import type {
  DocketStore,
  Page,
  PageResult,
  PreserveAmendmentsResult,
  RecordExecutionResult,
  RecordSupersessionResult,
  RetentionPolicy,
  Scope,
  SessionStore,
  TransitionPatch,
  TransitionResult,
} from "./store.js";

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

/**
 * The tag every cursor this store mints carries.
 *
 * A cursor is opaque to callers, and opaque has to mean *checked*, not merely
 * *ugly*: a cursor from one list handed to another, or a string a caller invented,
 * has to be a loud failure rather than a quietly different answer. The tag names the
 * store and the cursor format version, and the list kind is encoded beside it.
 */
const CURSOR_TAG = "affiant.docket.v1";

/** The lists that mint cursors. A cursor is only ever valid for the list that made it. */
type CursorKind = "pending" | "approved-unexecuted" | "rehydrate";

/** An opaque cursor naming a position within one list. */
function encodeCursor(kind: CursorKind, position: string): string {
  return btoa(`${CURSOR_TAG}|${kind}|${position}`);
}

/**
 * The position `cursor` names within `kind`'s list.
 *
 * @throws RangeError when the cursor is unreadable or belongs to a different list.
 *         A `RangeError` and not an `AffiantError`: the error-code registry names
 *         the reasons *the gate refuses a request*, and a bad cursor is a caller's
 *         programming error, not a request the framework declined.
 */
function decodeCursor(cursor: string, kind: CursorKind): string {
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new RangeError("cursor is not a cursor this store minted");
  }
  const tag = `${CURSOR_TAG}|${kind}|`;
  if (!decoded.startsWith(tag)) {
    throw new RangeError(`cursor does not belong to the ${kind} list`);
  }
  return decoded.slice(tag.length);
}

/** The sequence position a plain list cursor names, or `0` to start from the beginning. */
function decodeSequence(page: Page, kind: CursorKind): number {
  const cursor = page.cursor;
  if (cursor === undefined || cursor === null) return 0;
  const position = Number(decodeCursor(cursor, kind));
  if (!Number.isInteger(position) || position < 0) {
    throw new RangeError("cursor does not name a position in this list");
  }
  return position;
}

/** Rejects a page size that would make a list unbounded or empty (RT-2). */
function requireLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got: ${String(limit)}`);
  }
  return limit;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** One row, plus the filing position an opaque cursor addresses. */
interface StoredEntry {
  /** The row as it stands. Replaced wholesale on every write; never mutated. */
  entry: DocketEntry;
  /** The tenant-local filing position. Monotonic, never reused. */
  readonly seq: number;
}

/** One tenant's rows, in filing order. */
interface TenantShard {
  /** Keyed by entry id. Insertion order is filing order. */
  readonly entries: Map<string, StoredEntry>;
  /** The next filing position to hand out. */
  next: number;
}

/** How the in-memory Docket store is built. */
export interface InMemoryDocketStoreOptions {
  /**
   * Where "now" comes from, for the deadline every read applies (DK-1).
   *
   * A store needs a clock rather than a `now` parameter on each method because the
   * deadline is the store's answer to give: a method that let the caller supply the
   * instant would let the caller decide whether an entry had expired. A fixture
   * pins the instant by passing a stub clock here. Defaults to
   * {@link defaultClock}.
   */
  readonly clock?: Clock;
}

/**
 * The reference Docket store: one `Map` per tenant, every rule in the DK area
 * enforced, no timer anywhere.
 */
export class InMemoryDocketStore implements DocketStore {
  readonly #tenants = new Map<string, TenantShard>();
  readonly #clock: Clock;

  constructor(options: InMemoryDocketStoreOptions = {}) {
    this.#clock = options.clock ?? defaultClock;
  }

  // ------------------------------------------------------------------ filing

  /**
   * File `entry`, or return the one already filed under its id — never an error,
   * never an overwrite, never a refreshed deadline (DK-1, GT-4).
   */
  async file(entry: DocketEntry): Promise<{ entry: DocketEntry; created: boolean }> {
    const shard = this.#ensureShard(entry.tenantId);
    const existing = shard.entries.get(entry.entryId);
    if (existing !== undefined) {
      return { entry: this.#read(existing.entry), created: false };
    }
    shard.entries.set(entry.entryId, { entry, seq: shard.next });
    shard.next += 1;
    return { entry: this.#read(entry), created: true };
  }

  /** The entry as it reads now, or `null` when nothing in `scope` has that id. */
  async get(entryId: string, scope: Scope): Promise<DocketEntry | null> {
    const stored = this.#find(entryId, scope);
    return stored === null ? null : this.#read(stored.entry);
  }

  // ------------------------------------------------------------- transitions

  /**
   * The guarded compare-and-set (DK-1).
   *
   * No `await` between the read of the current state and the write of the new one:
   * that is what makes it atomic against every other caller in this isolate.
   */
  async transition(
    entryId: string,
    scope: Scope,
    expected: "pending",
    patch: TransitionPatch,
  ): Promise<TransitionResult> {
    const stored = this.#find(entryId, scope);
    if (stored === null) return "not-found";

    const current = readStatus(stored.entry, this.#clock.now());
    if (current !== expected) {
      // An expired row was nobody's decision; an approved or rejected one was
      // somebody's, and DK-1 requires the second decision be refused as such.
      return current === "expired" ? "not-pending" : "lost-race";
    }

    const next = applyPatch(stored.entry, patch, this.#clock.now());
    stored.entry = next;
    return next;
  }

  /**
   * Preserve the amendments a late decision carried, for a resubmission (DK-1).
   *
   * Writes `amendments` and nothing else: not `status`, not `decision`, not
   * `attestation`. The row's stored status stays as it was — it already *reads*
   * `expired`, and recording a sweep the host did not run would be this method
   * quietly doing a second job.
   */
  async preserveAmendments(
    entryId: string,
    scope: Scope,
    amendments: AmendmentMap,
  ): Promise<PreserveAmendmentsResult> {
    const stored = this.#find(entryId, scope);
    if (stored === null) return "not-found";
    if (readStatus(stored.entry, this.#clock.now()) !== "expired") return "not-expired";

    stored.entry = { ...stored.entry, amendments };
    return this.#read(stored.entry);
  }

  /** Record what the host's executor reported on an approved row (DK-1). */
  async recordExecution(
    entryId: string,
    scope: Scope,
    outcome: Exclude<ExecutionOutcome, "unexecuted">,
    detail: string | null,
  ): Promise<RecordExecutionResult> {
    const stored = this.#find(entryId, scope);
    if (stored === null) return "not-found";
    if (readStatus(stored.entry, this.#clock.now()) !== "approved") return "not-approved";

    stored.entry = { ...stored.entry, execution: outcome, executionDetail: detail };
    return this.#read(stored.entry);
  }

  /** Record the successor of a terminal row (DK-1); the row keeps its terminal state. */
  async recordSupersession(
    entryId: string,
    scope: Scope,
    supersededBy: string,
  ): Promise<RecordSupersessionResult> {
    const stored = this.#find(entryId, scope);
    if (stored === null) return "not-found";
    if (readStatus(stored.entry, this.#clock.now()) === "pending") return "not-terminal";

    stored.entry = {
      ...stored.entry,
      lineage: { supersedes: stored.entry.lineage.supersedes, supersededBy },
    };
    return this.#read(stored.entry);
  }

  // ------------------------------------------------------------------- lists

  /** Everything that reads `pending` right now, in filing order, paged. */
  async listPending(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const now = this.#clock.now();
    return this.#page(scope, page, "pending", (entry) => readStatus(entry, now) === "pending");
  }

  /** Everything approved and still unexecuted, in filing order, paged. */
  async listApprovedUnexecuted(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const now = this.#clock.now();
    return this.#page(
      scope,
      page,
      "approved-unexecuted",
      (entry) => readStatus(entry, now) === "approved" && entry.execution === "unexecuted",
    );
  }

  // ------------------------------------------------------------------- sweep

  /**
   * Mark at most `limit` due entries `expired`, in filing order, and say whether more
   * remain (DK-3).
   *
   * `decidedAt` is set to the entry's own `expiresAt`, not to `now`: the row left
   * `pending` at its deadline, which is when a reader who never ran a sweep would
   * have seen it go. A swept row and an unswept one past the same deadline are then
   * the same value, so a host cannot tell — and cannot come to depend on — whether
   * the sweep has caught up.
   */
  async expireDue(
    now: string,
    scope: Scope,
    limit: number,
  ): Promise<{ expired: string[]; more: boolean }> {
    requireLimit(limit);
    const shard = this.#shard(scope.tenantId);
    const expired: string[] = [];
    let more = false;

    if (shard !== null) {
      for (const stored of shard.entries.values()) {
        if (!inScope(stored.entry, scope) || !isDue(stored.entry, now)) continue;
        if (expired.length === limit) {
          more = true;
          break;
        }
        stored.entry = expire(stored.entry);
        expired.push(stored.entry.entryId);
      }
    }

    return { expired, more };
  }

  // ------------------------------------------------- retention, purge, export

  /**
   * Remove at most `limit` terminal entries whose terminal instant is before
   * `policy.olderThan` (DK-4).
   *
   * An `approved` row that is still `unexecuted` is **never** eligible, however old.
   * It is the only record that a write was authorised and has not yet happened, and
   * the Docket is the sole record of approval authority (AZ-5) — ageing it out would
   * delete the evidence and the outstanding work in one move.
   */
  async retention(
    policy: RetentionPolicy,
    scope: Scope,
    limit: number,
  ): Promise<{ removed: number; more: boolean }> {
    requireLimit(limit);
    const olderThan = instantMs(policy.olderThan, "olderThan");
    const now = this.#clock.now();
    const shard = this.#shard(scope.tenantId);
    const remove: string[] = [];
    let more = false;

    if (shard !== null) {
      for (const stored of shard.entries.values()) {
        if (!inScope(stored.entry, scope)) continue;
        if (!isRetainable(stored.entry, now, olderThan)) continue;
        if (remove.length === limit) {
          more = true;
          break;
        }
        remove.push(stored.entry.entryId);
      }
      for (const entryId of remove) shard.entries.delete(entryId);
    }

    return { removed: remove.length, more };
  }

  /** Remove everything belonging to `tenantId`, and nothing else (DK-4). */
  async purge(tenantId: string): Promise<{ removed: number }> {
    const shard = this.#tenants.get(tenantId);
    if (shard === undefined) return { removed: 0 };
    const removed = shard.entries.size;
    this.#tenants.delete(tenantId);
    return { removed };
  }

  /**
   * Every entry in `scope`, in filing order, streamed (DK-4).
   *
   * The ids are snapshotted when iteration begins and each row is read as the
   * consumer reaches it, so a concurrent transition is reflected and a concurrent
   * retention pass cannot make the iterator yield a row that has been removed.
   */
  async *export(scope: Scope): AsyncIterable<DocketEntry> {
    const shard = this.#shard(scope.tenantId);
    if (shard === null) return;
    const ids: string[] = [];
    for (const stored of shard.entries.values()) {
      if (inScope(stored.entry, scope)) ids.push(stored.entry.entryId);
    }
    for (const entryId of ids) {
      const stored = shard.entries.get(entryId);
      if (stored !== undefined) yield this.#read(stored.entry);
    }
  }

  // ---------------------------------------------------------------- internals

  /** The tenant's rows, or `null` when nothing has been filed for it. */
  #shard(tenantId: string): TenantShard | null {
    return this.#tenants.get(tenantId) ?? null;
  }

  /** The tenant's rows, opening a partition for it on first filing. */
  #ensureShard(tenantId: string): TenantShard {
    const existing = this.#tenants.get(tenantId);
    if (existing !== undefined) return existing;
    const shard: TenantShard = { entries: new Map<string, StoredEntry>(), next: 0 };
    this.#tenants.set(tenantId, shard);
    return shard;
  }

  /**
   * The stored row with that id inside `scope`, or `null`.
   *
   * The tenant is a map lookup, not a filter: there is no code path here that reads
   * another tenant's rows and then discards them, so a mismatched tenant is a miss
   * and tells the caller nothing about whether the id exists (AZ-2).
   */
  #find(entryId: string, scope: Scope): StoredEntry | null {
    const shard = this.#shard(scope.tenantId);
    if (shard === null) return null;
    const stored = shard.entries.get(entryId);
    if (stored === undefined) return null;
    return inScope(stored.entry, scope) ? stored : null;
  }

  /** The row as it reads now: the deadline applied, whether or not a sweep has run (DK-1). */
  #read(entry: DocketEntry): DocketEntry {
    return isDue(entry, this.#clock.now()) ? expire(entry) : entry;
  }

  /** One page of the rows in `scope` that `matches` accepts, in filing order. */
  #page(
    scope: Scope,
    page: Page,
    kind: CursorKind,
    matches: (entry: DocketEntry) => boolean,
  ): PageResult<DocketEntry> {
    const limit = requireLimit(page.limit);
    const after = decodeSequence(page, kind);
    const shard = this.#shard(scope.tenantId);
    const items: DocketEntry[] = [];
    let last = after;
    let more = false;

    if (shard !== null) {
      for (const stored of shard.entries.values()) {
        if (stored.seq < after) continue;
        if (!inScope(stored.entry, scope) || !matches(stored.entry)) continue;
        if (items.length === limit) {
          more = true;
          break;
        }
        items.push(this.#read(stored.entry));
        last = stored.seq + 1;
      }
    }

    return { items, cursor: more ? encodeCursor(kind, String(last)) : null, more };
  }
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/** Whether `entry` is inside `scope`'s conversation, when the scope names one. */
function inScope(entry: DocketEntry, scope: Scope): boolean {
  if (entry.tenantId !== scope.tenantId) return false;
  return scope.conversationId === undefined || entry.conversationId === scope.conversationId;
}

/** The row as an expired one: it left `pending` at its own deadline. */
function expire(entry: DocketEntry): DocketEntry {
  return { ...entry, status: "expired", execution: null, decidedAt: entry.expiresAt };
}

/**
 * Whether `entry` may be aged out under a retention cut at `olderThan`.
 *
 * Terminal, past the cut, and — for an approved row — already reported on by the
 * executor. The terminal instant is `decidedAt` where the row has one and the
 * deadline otherwise, which covers a row that expired without ever being swept.
 */
function isRetainable(entry: DocketEntry, now: string, olderThan: number): boolean {
  const status: DocketStatus = readStatus(entry, now);
  if (status === "pending") return false;
  if (status === "approved" && entry.execution === "unexecuted") return false;
  const terminalAt = status === "expired" ? (entry.decidedAt ?? entry.expiresAt) : entry.decidedAt;
  if (terminalAt === null) return false;
  return instantMs(terminalAt, "decidedAt") < olderThan;
}

/**
 * `entry` with `patch` applied, with the correlations DK-1 requires checked.
 *
 * A patch that contradicts itself — an approved row with no execution outcome, a
 * rejected row that carries one, a transition back to `pending` — is a `RangeError`
 * rather than a silently repaired row. A store that quietly fixed the caller's patch
 * would be the store deciding what the state machine means.
 */
function applyPatch(entry: DocketEntry, patch: TransitionPatch, now: string): DocketEntry {
  const status = patch.status;
  if (status === ("pending" as DocketStatus)) {
    throw new RangeError("a transition never returns an entry to pending (DK-1)");
  }

  const execution =
    patch.execution === undefined ? (status === "approved" ? "unexecuted" : null) : patch.execution;
  if (status === "approved" && execution === null) {
    throw new RangeError("an approved entry carries an execution outcome (DK-1)");
  }
  if (status !== "approved" && execution !== null) {
    throw new RangeError(`a ${status} entry carries no execution outcome (DK-1)`);
  }

  const decidedAt = patch.decidedAt === undefined ? now : patch.decidedAt;
  if (decidedAt === null) {
    throw new RangeError(`a ${status} entry records when it left pending (DK-1)`);
  }

  return {
    ...entry,
    status,
    execution,
    // AF-4: an approval that accepted amendments carries the recomputed Affidavit.
    // Absent leaves the sworn record as filed.
    affidavit: patch.affidavit ?? entry.affidavit,
    decision: patch.decision ?? null,
    amendments: patch.amendments === undefined ? entry.amendments : patch.amendments,
    attestation: patch.attestation === undefined ? entry.attestation : patch.attestation,
    executionDetail:
      patch.executionDetail === undefined ? entry.executionDetail : patch.executionDetail,
    lineage: {
      supersedes: entry.lineage.supersedes,
      supersededBy:
        patch.lineage?.supersededBy === undefined
          ? entry.lineage.supersededBy
          : patch.lineage.supersededBy,
    },
    decidedAt,
  };
}

// ---------------------------------------------------------------------------
// The session store (DK-5)
// ---------------------------------------------------------------------------

/** Which half of the rehydration sequence a cursor is in. */
const REHYDRATE_PENDING = "0";
/** The second half: approved rows the executor has not reported on. */
const REHYDRATE_APPROVED = "1";

/**
 * The reference Session store: rehydration in the order DK-5 fixes.
 *
 * It is built **on** a {@link DocketStore} rather than beside one, and it uses only
 * the public interface. That is deliberate: DK-5's order has to hold for any store a
 * host plugs in, so the reference implementation proves the `DocketStore` contract
 * is sufficient to produce it. A session store that reached into the in-memory
 * store's internals would prove nothing.
 */
export class InMemorySessionStore implements SessionStore {
  readonly #docket: DocketStore;

  constructor(docket: DocketStore) {
    this.#docket = docket;
  }

  /**
   * One page of: everything that reads `pending`, then everything `approved` and
   * `unexecuted`, each in filing order (DK-5).
   *
   * A page boundary that falls inside the first group resumes there; one that drains
   * it resumes at the start of the second. A reconnecting client therefore sees what
   * still needs a decision before what still needs execution, however small its page
   * size.
   */
  async rehydrate(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const limit = requireLimit(page.limit);
    const [group, inner] = splitRehydrateCursor(page);

    if (group === REHYDRATE_APPROVED) {
      const approved = await this.#docket.listApprovedUnexecuted(scope, pageAt(inner, limit));
      return this.#result(approved.items, approved, REHYDRATE_APPROVED);
    }

    const pending = await this.#docket.listPending(scope, pageAt(inner, limit));
    if (pending.more) {
      return this.#result(pending.items, pending, REHYDRATE_PENDING);
    }

    // The pending group is drained; the rest of this page comes from the second.
    const remaining = limit - pending.items.length;
    if (remaining === 0) {
      const peek = await this.#docket.listApprovedUnexecuted(scope, { limit: 1 });
      return {
        items: pending.items,
        cursor: peek.items.length > 0 ? encodeRehydrateCursor(REHYDRATE_APPROVED, null) : null,
        more: peek.items.length > 0,
      };
    }

    const approved = await this.#docket.listApprovedUnexecuted(scope, { limit: remaining });
    return this.#result([...pending.items, ...approved.items], approved, REHYDRATE_APPROVED);
  }

  /** One page of the sequence, with the underlying cursor wrapped in this one's group. */
  #result(
    items: readonly DocketEntry[],
    tail: PageResult<DocketEntry>,
    group: string,
  ): PageResult<DocketEntry> {
    return {
      items,
      cursor: tail.more ? encodeRehydrateCursor(group, tail.cursor) : null,
      more: tail.more,
    };
  }
}

/** A page request continuing at `cursor`, or starting from the beginning. */
function pageAt(cursor: string | null, limit: number): Page {
  return cursor === null ? { limit } : { cursor, limit };
}

/** The rehydration cursor: which group, and the underlying list cursor within it. */
function encodeRehydrateCursor(group: string, inner: string | null): string {
  return encodeCursor("rehydrate", `${group}:${inner ?? ""}`);
}

/**
 * `page`'s rehydration cursor as `[group, innerCursor]`, or the start of the
 * sequence when it has none.
 */
function splitRehydrateCursor(page: Page): [string, string | null] {
  const cursor = page.cursor;
  if (cursor === undefined || cursor === null) return [REHYDRATE_PENDING, null];
  const position = decodeCursor(cursor, "rehydrate");
  const separator = position.indexOf(":");
  const group = separator === -1 ? "" : position.slice(0, separator);
  if (group !== REHYDRATE_PENDING && group !== REHYDRATE_APPROVED) {
    throw new RangeError("cursor does not name a position in the rehydration sequence");
  }
  const inner = position.slice(separator + 1);
  return [group, inner === "" ? null : inner];
}
