/**
 * The Docket on Postgres.
 *
 * **Rules served: DK-1** (idempotent filing that keeps the deadline it already had,
 * the guarded compare-and-set, expiry as a queryable state, preserved amendments on a
 * late decision, the execution outcome recorded once, lineage), **DK-3** (a bounded,
 * paged, host-scheduled sweep and an opaque cursor on every list), **DK-4**
 * (retention, purge and export as hooks, and a row that reads forward), **DK-5**
 * (rehydration order), **AZ-2** (every operation is tenant-scoped, twice), **AZ-5**
 * (an approved write nobody has reported on is never aged out), **RT-2** (nothing
 * unbounded but a purge, and no process-lifetime cache), **RT-3** (the record lives
 * here, which is what a Durable Object host routes it to).
 *
 * Four properties are worth reading the file for.
 *
 * **There is no `update` statement.** A filing is written once; every later fact is a
 * row in a second table, at most one of each kind per entry. DK-1's guarded
 * compare-and-set is therefore a unique index rather than a lock: of two decisions
 * that race, one inserts and the other conflicts, and the one that conflicted is
 * refused. DK-4's "appended, never edited" falls out of the same index.
 *
 * **The connection is the host's.** This package opens nothing, pools nothing and
 * closes nothing. Each method runs `sql.begin` and completes the transaction before
 * it returns, which is what a connection pooler in transaction mode requires; a host
 * that must file or record an execution atomically with its own writes calls
 * {@link PostgresDocketStore.within} and gets a store bound to the transaction it
 * already has open.
 *
 * **The tenant is scoped twice.** Every statement filters by the tenant from the
 * {@link Scope} because the contract says so (AZ-2), *and* the migration forces
 * row-level security over a transaction-scoped setting this store writes at the top
 * of every transaction. The first is the contract; the second catches the statement
 * that forgot.
 *
 * **The deadline is the clock's question, never the database's.** `now()` is not
 * consulted anywhere. Reads apply the core's `readStatus` to the folded row, the
 * compare-and-set carries the clock's instant as a bound parameter, and the sweep
 * dates a row to its own `expiresAt` rather than to the instant the sweep ran.
 *
 * @packageDocumentation
 */

import type {
  AmendmentMap,
  Clock,
  DocketEntry,
  DocketStore,
  ExecutionOutcome,
  Page,
  PageResult,
  PreserveAmendmentsResult,
  PreservedAct,
  RecordExecutionResult,
  RecordSupersessionResult,
  RetentionPolicy,
  Scope,
  SessionStore,
  TransitionPatch,
  TransitionResult,
} from "@affiant/core";
import { defaultClock, instantMs, isDue, readStatus } from "@affiant/core";
import type { Sql, TransactionSql } from "postgres";

import type { CursorKind } from "./cursor.js";
import {
  decodeCursor,
  decodePosition,
  encodeCursor,
  requireLimit,
  requirePosition,
} from "./cursor.js";
import type { FoldRow } from "./fold.js";
import { decisionPayload, expired, foldEntry, withDecision } from "./fold.js";
import { DEFAULT_SCHEMA, requireSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// The public shape
// ---------------------------------------------------------------------------

/** How the store is built. */
export interface PostgresDocketStoreOptions {
  /**
   * The host's connection. The store never opens it, never pools of its own and never
   * calls `end()` on it — its lifetime is the host's, and on a serverless isolate that
   * is the only arrangement a connection pooler can live with.
   */
  readonly sql: Sql;
  /**
   * Where "now" comes from, for the deadline every read applies (DK-1). Defaults to
   * the core's `defaultClock`. The database's own clock is never consulted.
   */
  readonly clock?: Clock;
  /** The schema the tables live in. Defaults to `"affiant"`. */
  readonly schema?: string;
}

/** The Docket and the rehydration surface over it, on one connection. */
export interface PostgresDocketStore extends DocketStore, SessionStore {
  /**
   * A store bound to a transaction the host already has open: the same methods, no
   * `begin` of its own, the same tenant setting.
   *
   * This is what makes "file the entry and write the host's row, or neither" a single
   * unit of work. It is also the only safe shape on a pool of one connection, where a
   * store opening a transaction inside the host's would wait for a connection the host
   * is holding.
   */
  within(tx: TransactionSql): DocketStore & SessionStore;
}

/**
 * A {@link DocketStore} and {@link SessionStore} over the package's tables.
 *
 * @throws RangeError when `schema` is not a plain SQL identifier.
 */
export function createPostgresDocketStore(
  options: PostgresDocketStoreOptions,
): PostgresDocketStore {
  const schema = requireSchema(options.schema ?? DEFAULT_SCHEMA);
  const clock = options.clock ?? defaultClock;
  const sql = options.sql;

  const ownTransaction: Runner = async (tenantId, work) => {
    const held = await sql.begin(async (tx) => {
      await setTenant(tx, tenantId);
      return { value: await work(tx) };
    });
    return (held as { value: ReturnType<typeof work> extends Promise<infer R> ? R : never }).value;
  };

  const store = new Store(clock, schema, ownTransaction);

  return Object.assign(store, {
    within(tx: TransactionSql): DocketStore & SessionStore {
      const joined: Runner = async (tenantId, work) => {
        await setTenant(tx, tenantId);
        return work(tx);
      };
      return new Store(clock, schema, joined);
    },
  });
}

// ---------------------------------------------------------------------------
// Running one unit of work
// ---------------------------------------------------------------------------

/**
 * How a method gets a transaction with the tenant set on it.
 *
 * The transaction callback's own result is wrapped in an object before it leaves
 * postgres.js, which unwraps an array a callback returns and would otherwise change
 * the shape of every method here that answers with a list.
 */
type Runner = <T>(tenantId: string, work: (tx: TransactionSql) => Promise<T>) => Promise<T>;

/**
 * The tenant the rest of this transaction may see (AZ-2).
 *
 * Transaction-scoped (`set_config(..., true)`), never session-scoped: a connection
 * pooler in transaction mode hands the same backend to somebody else between
 * transactions, and a setting that outlived the transaction would go with it. The
 * value is a bound parameter, and the setting name is this package's own so a host's
 * own tenant setting stays independent of it.
 */
async function setTenant(tx: TransactionSql, tenantId: string): Promise<void> {
  await tx`select set_config('affiant.tenant_id', ${tenantId}, true)`;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** How many rows one `export` batch reads. Bounded, because RT-2 has no room for more. */
const EXPORT_BATCH = 200;

/** Which half of the rehydration sequence a cursor is in (DK-5). */
const REHYDRATE_PENDING = "0";
/** The second half: approved rows the executor has not reported on. */
const REHYDRATE_APPROVED = "1";

/** What one page of a list produced, before it is turned into a cursor. */
interface Slice {
  readonly items: DocketEntry[];
  readonly last: string;
  readonly more: boolean;
}

class Store implements DocketStore, SessionStore {
  readonly #clock: Clock;
  readonly #schema: string;
  readonly #run: Runner;

  constructor(clock: Clock, schema: string, run: Runner) {
    this.#clock = clock;
    this.#schema = schema;
    this.#run = run;
  }

  // ------------------------------------------------------------------ filing

  /**
   * File `entry`, or return the one already filed under its id — never an error,
   * never an overwrite, never a refreshed deadline (DK-1, GT-4).
   *
   * `on conflict do nothing` is the whole of the idempotence: the second filing of an
   * id writes nothing at all, so the stored `expiresAt` and `filedAt` are the ones the
   * first filing set. A re-file that refreshed the deadline would let a retrying agent
   * hold a card open indefinitely.
   */
  async file(entry: DocketEntry): Promise<{ entry: DocketEntry; created: boolean }> {
    return this.#run(entry.tenantId, async (tx) => {
      const inserted = await tx`
        insert into ${tx(this.#table("docket_entries"))} (
          tenant_id, entry_id, conversation_id, channel, tool_name, affidavit, requirement,
          blocked, composite_ref, supersedes, filed_at, expires_at, protocol_version, filed_row
        ) values (
          ${entry.tenantId}, ${entry.entryId}, ${entry.conversationId}, ${entry.channel},
          ${entry.toolName}, ${json(tx, entry.affidavit)}, ${entry.requirement},
          ${entry.blocked === null ? null : json(tx, entry.blocked)}, ${entry.compositeRef},
          ${entry.lineage.supersedes}, ${entry.filedAt}::timestamptz,
          ${entry.expiresAt}::timestamptz, ${entry.protocolVersion}, ${json(tx, entry)}
        )
        on conflict (tenant_id, entry_id) do nothing
        returning entry_id`;

      // A row this call just created carries no later fact yet, so its fold is the
      // entry as it was handed in and reading it back would be a round trip for an
      // answer already in hand. A re-file has to be read: what it returns is the
      // entry that is *already* there, with the deadline it already had (GT-4).
      if (inserted.length === 1) return { entry: this.#read(entry), created: true };

      const stored = await this.#fold(tx, entry.entryId, { tenantId: entry.tenantId });
      if (stored === null) {
        // Only reachable when the row that conflicted is not visible to this call,
        // which means the tenant setting and the row's tenant disagree.
        throw new RangeError(`the filed entry ${entry.entryId} is not visible in its own tenant`);
      }
      return { entry: this.#read(stored), created: false };
    });
  }

  /** The entry as it reads now, or `null` when nothing in `scope` has that id (AZ-2). */
  async get(entryId: string, scope: Scope): Promise<DocketEntry | null> {
    return this.#run(scope.tenantId, async (tx) => {
      const stored = await this.#fold(tx, entryId, scope);
      return stored === null ? null : this.#read(stored);
    });
  }

  // ------------------------------------------------------------- transitions

  /**
   * The guarded compare-and-set (DK-1).
   *
   * The guard is an insert, not a lock. The row is read first so that a refusal can
   * say *which* refusal it is — an expired row and a row somebody else decided are
   * different answers a caller acts on differently — and the insert then repeats the
   * guard in SQL, so of two decisions that arrive together exactly one is written.
   * The loser's insert finds the unique index already taken, writes nothing, and the
   * re-read tells it which refusal it earned.
   */
  async transition(
    entryId: string,
    scope: Scope,
    expected: "pending",
    patch: TransitionPatch,
  ): Promise<TransitionResult> {
    return this.#run(scope.tenantId, async (tx) => {
      const stored = await this.#fold(tx, entryId, scope);
      if (stored === null) return "not-found" as TransitionResult;

      const refusal = this.#refusalFor(stored, expected);
      if (refusal !== null) return refusal;

      // Raised before anything is written, and after the row is known, so that the
      // refusals above keep the same meaning they have on the reference store.
      const payload = decisionPayload(stored, patch, this.#clock.now());
      const written = await this.#appendGuarded(tx, scope.tenantId, entryId, "decision", payload, {
        at: payload.decidedAt,
        liveAt: this.#clock.now(),
      });

      if (!written) {
        const again = await this.#fold(tx, entryId, scope);
        if (again === null) return "not-found" as TransitionResult;
        return this.#refusalFor(again, expected) ?? ("already-decided" as TransitionResult);
      }

      // The write succeeded, so the row is the one just read with this decision laid
      // over it — the same overlay the fold would compute, without the round trip.
      return this.#read(withDecision(stored, payload));
    });
  }

  /**
   * Preserve the amendments a late decision carried, for a resubmission (DK-1).
   *
   * One appended fact on a row the transition guard refused, and nothing else: not
   * `status`, not `decision`, not `attestation`. The act's own instant and principal
   * are recorded, not the store's clock reading, because a resubmission binds each
   * prefilled value to the moment the person typed it (PV-2).
   */
  async preserveAmendments(
    entryId: string,
    scope: Scope,
    amendments: AmendmentMap,
    act: PreservedAct,
  ): Promise<PreserveAmendmentsResult> {
    return this.#run(scope.tenantId, async (tx) => {
      const stored = await this.#fold(tx, entryId, scope);
      if (stored === null) return "not-found" as PreserveAmendmentsResult;
      if (readStatus(stored, this.#clock.now()) !== "expired") {
        return "not-expired" as PreserveAmendmentsResult;
      }

      await this.#appendGuarded(
        tx,
        scope.tenantId,
        entryId,
        "preserved-amendments",
        { amendments, at: act.at, by: act.by },
        { at: act.at },
      );

      const after = await this.#fold(tx, entryId, scope);
      if (after === null) return "not-found" as PreserveAmendmentsResult;
      return this.#read(after);
    });
  }

  /**
   * Record what the host's executor reported on an approved row, **once** (DK-1, DK-4).
   *
   * The same compare-and-set as a decision, on the execution axis: the row is read to
   * tell `"not-approved"` from `"execution-already-recorded"`, and the insert settles
   * the race. Without the guard an `executed` row could be flipped to `failed` by a
   * later caller, which would leave an approved-and-committed write
   * indistinguishable from an approved-but-failed one.
   */
  async recordExecution(
    entryId: string,
    scope: Scope,
    outcome: Exclude<ExecutionOutcome, "unexecuted">,
    detail: string | null,
    expected: "unexecuted",
  ): Promise<RecordExecutionResult> {
    return this.#run(scope.tenantId, async (tx) => {
      const stored = await this.#fold(tx, entryId, scope);
      if (stored === null) return "not-found" as RecordExecutionResult;
      if (readStatus(stored, this.#clock.now()) !== "approved") {
        return "not-approved" as RecordExecutionResult;
      }
      if (stored.execution !== expected) {
        return "execution-already-recorded" as RecordExecutionResult;
      }

      const written = await this.#appendGuarded(
        tx,
        scope.tenantId,
        entryId,
        "execution",
        { execution: outcome, executionDetail: detail },
        { at: this.#clock.now() },
      );
      if (!written) return "execution-already-recorded" as RecordExecutionResult;

      const after = await this.#fold(tx, entryId, scope);
      if (after === null) return "not-found" as RecordExecutionResult;
      return this.#read(after);
    });
  }

  /** Record the successor of a terminal row (DK-1); the row keeps its terminal state. */
  async recordSupersession(
    entryId: string,
    scope: Scope,
    supersededBy: string,
  ): Promise<RecordSupersessionResult> {
    return this.#run(scope.tenantId, async (tx) => {
      const stored = await this.#fold(tx, entryId, scope);
      if (stored === null) return "not-found" as RecordSupersessionResult;
      if (readStatus(stored, this.#clock.now()) === "pending") {
        return "not-terminal" as RecordSupersessionResult;
      }

      await this.#appendGuarded(
        tx,
        scope.tenantId,
        entryId,
        "supersession",
        { supersededBy },
        { at: this.#clock.now() },
      );

      const after = await this.#fold(tx, entryId, scope);
      if (after === null) return "not-found" as RecordSupersessionResult;
      return this.#read(after);
    });
  }

  // ------------------------------------------------------------------- lists

  /** Everything that reads `pending` right now, in filing order, paged. */
  async listPending(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const limit = requireLimit(page.limit);
    const after = decodePosition(page.cursor, "pending");
    const slice = await this.#run(scope.tenantId, (tx) =>
      this.#slice(tx, scope, "pending", after, limit),
    );
    return pageOf(slice, "pending");
  }

  /** Everything approved and still unexecuted, in filing order, paged. */
  async listApprovedUnexecuted(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const limit = requireLimit(page.limit);
    const after = decodePosition(page.cursor, "approved-unexecuted");
    const slice = await this.#run(scope.tenantId, (tx) =>
      this.#slice(tx, scope, "approved-unexecuted", after, limit),
    );
    return pageOf(slice, "approved-unexecuted");
  }

  /**
   * One page of the rehydration sequence: everything that reads `pending`, then
   * everything `approved` and `unexecuted`, each in filing order (DK-5).
   *
   * A page boundary inside the first group resumes there; one that drains it resumes
   * at the start of the second. Both groups are read in one transaction, so a page
   * cannot straddle a decision made between two queries.
   */
  async rehydrate(scope: Scope, page: Page): Promise<PageResult<DocketEntry>> {
    const limit = requireLimit(page.limit);
    const [group, after] = splitRehydrateCursor(page);

    return this.#run(scope.tenantId, async (tx) => {
      if (group === REHYDRATE_APPROVED) {
        const approved = await this.#slice(tx, scope, "approved-unexecuted", after, limit);
        return rehydratePage(approved.items, approved, REHYDRATE_APPROVED);
      }

      const pending = await this.#slice(tx, scope, "pending", after, limit);
      if (pending.more) return rehydratePage(pending.items, pending, REHYDRATE_PENDING);

      // The pending group is drained; the rest of this page comes from the second.
      const remaining = limit - pending.items.length;
      if (remaining === 0) {
        const peek = await this.#slice(tx, scope, "approved-unexecuted", "0", 1);
        const more = peek.items.length > 0;
        return {
          items: pending.items,
          cursor: more ? encodeRehydrateCursor(REHYDRATE_APPROVED, "0") : null,
          more,
        };
      }

      const approved = await this.#slice(tx, scope, "approved-unexecuted", "0", remaining);
      return rehydratePage([...pending.items, ...approved.items], approved, REHYDRATE_APPROVED);
    });
  }

  // ------------------------------------------------------------------- sweep

  /**
   * Mark at most `limit` due entries `expired`, in filing order, and say whether more
   * remain (DK-3).
   *
   * `decidedAt` is the entry's own `expiresAt`, never the sweep instant: the row left
   * `pending` at its deadline, which is when a reader who never ran a sweep would have
   * seen it go. A swept row and an unswept one past the same deadline are then the
   * same value, so a host cannot come to depend on whether the sweep has caught up.
   */
  async expireDue(
    now: string,
    scope: Scope,
    limit: number,
  ): Promise<{ expired: string[]; more: boolean }> {
    requireLimit(limit);
    instantMs(now, "now");

    return this.#run(scope.tenantId, async (tx) => {
      // Choosing the rows and recording the sweep are **one statement**. As two, a
      // decision committing between them left the row carrying a decision *and* an
      // expiry, and the sweep reported an approved entry as expired. Here the insert
      // repeats the deadline test and the "nothing terminal yet" test itself, the
      // partial unique index refuses the second terminal fact whichever arrives
      // second, and `expired` is what the insert says it wrote — never what the read
      // hoped it would (DK-1, DK-3, DK-4).
      const rows = await tx<{ entry_id: string; inserted: boolean; due_count: string }[]>`
        with due as (
          select v.entry_id, v.filing_seq, v.filed_row ->> 'expiresAt' as expires_at_iso
          from ${tx(this.#table("docket_current"))} v
          where v.tenant_id = ${scope.tenantId}::text
            and (${conversationOf(scope)}::text is null
                 or v.conversation_id = ${conversationOf(scope)}::text)
            and v.status = 'pending'
            and v.expires_at <= ${now}::timestamptz
          order by v.filing_seq
          limit ${limit + 1}
        ),
        capped as (select * from due order by filing_seq limit ${limit}),
        swept as (
          insert into ${tx(this.#table("docket_events"))} (tenant_id, entry_id, kind, payload, at)
          select ${scope.tenantId}::text, c.entry_id, 'expiry',
                 jsonb_build_object(
                   'status', 'expired', 'execution', null, 'decidedAt', c.expires_at_iso
                 ),
                 c.expires_at_iso::timestamptz
          from capped c
          join ${tx(this.#table("docket_entries"))} e
            on e.tenant_id = ${scope.tenantId}::text and e.entry_id = c.entry_id
          where e.expires_at <= ${now}::timestamptz
            and not exists (
              select 1 from ${tx(this.#table("docket_events"))} x
              where x.tenant_id = ${scope.tenantId}::text
                and x.entry_id = c.entry_id
                and x.kind in ('decision', 'expiry')
            )
          on conflict do nothing
          returning entry_id
        )
        select c.entry_id,
               (s.entry_id is not null) as inserted,
               (select count(*) from due)::text as due_count
        from capped c
        left join swept s on s.entry_id = c.entry_id
        order by c.filing_seq`;

      const dueCount = Number(rows[0]?.due_count ?? "0");
      return {
        expired: rows.filter((row) => row.inserted).map((row) => row.entry_id),
        more: dueCount > limit,
      };
    });
  }

  // ------------------------------------------------- retention, purge, export

  /**
   * Remove at most `limit` terminal entries whose terminal instant is before
   * `policy.olderThan` (DK-4).
   *
   * An `approved` row that is still `unexecuted` is **never** eligible, however old:
   * it is the only record that a write was authorised and has not yet happened, and
   * the Docket is the sole record of approval authority (AZ-5). The events go with the
   * filing, by the foreign key's cascade — a tombstone would keep a fact the host
   * asked to age out.
   */
  async retention(
    policy: RetentionPolicy,
    scope: Scope,
    limit: number,
  ): Promise<{ removed: number; more: boolean }> {
    requireLimit(limit);
    instantMs(policy.olderThan, "olderThan");
    const now = this.#clock.now();

    return this.#run(scope.tenantId, async (tx) => {
      const candidates = await tx<{ entry_id: string }[]>`
        with scoped as (
          select v.*,
                 case when v.status = 'pending' and v.expires_at <= ${now}::timestamptz
                      then 'expired' else v.status end as read_status
          from ${tx(this.#table("docket_current"))} v
          where v.tenant_id = ${scope.tenantId}::text
            and (${conversationOf(scope)}::text is null
                 or v.conversation_id = ${conversationOf(scope)}::text)
        )
        select entry_id from scoped
        where read_status <> 'pending'
          and not (read_status = 'approved' and execution = 'unexecuted')
          and (case when read_status = 'expired'
                    then coalesce(decided_at, expires_at) else decided_at end)
              < ${policy.olderThan}::timestamptz
        order by filing_seq
        limit ${limit + 1}`;

      const more = candidates.length > limit;
      const take = candidates.slice(0, limit).map((row) => row.entry_id);
      if (take.length > 0) {
        await tx`
          delete from ${tx(this.#table("docket_entries"))}
          where tenant_id = ${scope.tenantId}::text and entry_id = any(${take}::text[])`;
      }
      return { removed: take.length, more };
    });
  }

  /**
   * Remove everything belonging to `tenantId` (DK-4).
   *
   * Unbounded by design and by necessity: a tenant asking for their data to be deleted
   * is asking for all of it, and a partial purge is not a purge.
   */
  async purge(tenantId: string): Promise<{ removed: number }> {
    return this.#run(tenantId, async (tx) => {
      const removed = await tx`
        delete from ${tx(this.#table("docket_entries"))}
        where tenant_id = ${tenantId}::text
        returning entry_id`;
      return { removed: removed.length };
    });
  }

  /**
   * Every entry in `scope`, in filing order, streamed (DK-4).
   *
   * Keyset batches rather than one query, and one transaction per batch rather than
   * one held open across the consumer's awaits: a transaction that spanned the
   * consumer would pin a pooled connection for as long as the consumer took, which is
   * the one thing a pooler in transaction mode cannot allow.
   *
   * **This is a walk in filing order, not a snapshot.** Each batch is its own
   * transaction, and the walk resumes after the filing position it reached, so an
   * entry whose position was allocated before the walk began and committed after the
   * walk had passed that position is not yielded. A caller that needs a consistent set
   * — a tenant's export of their own record, say — walks through
   * {@link PostgresDocketStore.within} inside its own `repeatable read` transaction,
   * where every batch reads the one snapshot that transaction took.
   */
  async *export(scope: Scope): AsyncIterable<DocketEntry> {
    let after = "0";
    for (;;) {
      const batch = await this.#run(scope.tenantId, (tx) =>
        this.#slice(tx, scope, "all", after, EXPORT_BATCH),
      );
      for (const entry of batch.items) yield entry;
      if (!batch.more) return;
      after = batch.last;
    }
  }

  // ---------------------------------------------------------------- internals

  /** `schema.table`, for the one identifier helper that quotes it. */
  #table(name: string): string {
    return `${this.#schema}.${name}`;
  }

  /** The row as it reads now: the deadline applied, whether or not a sweep has run (DK-1). */
  #read(entry: DocketEntry): DocketEntry {
    return isDue(entry, this.#clock.now()) ? expired(entry) : entry;
  }

  /**
   * Which refusal a row that is not in `expected` earns, or `null` when it is.
   *
   * An expired row was nobody's decision; an approved or rejected one was somebody's,
   * and DK-1 requires the second decision be refused as such.
   */
  #refusalFor(entry: DocketEntry, expected: "pending"): TransitionResult | null {
    const current = readStatus(entry, this.#clock.now());
    if (current === expected) return null;
    return current === "expired" ? "expired" : "already-decided";
  }

  /** The folded entry with that id inside `scope`, or `null` (AZ-2). */
  async #fold(tx: TransactionSql, entryId: string, scope: Scope): Promise<DocketEntry | null> {
    const rows = await tx<FoldRow[]>`
      select filed_row, decision_payload, execution_payload, supersession_payload,
             preserved_payload, expiry_payload, filing_seq
      from ${tx(this.#table("docket_current"))}
      where tenant_id = ${scope.tenantId}::text
        and entry_id = ${entryId}::text
        and (${conversationOf(scope)}::text is null
             or conversation_id = ${conversationOf(scope)}::text)`;
    const row = rows[0];
    return row === undefined ? null : foldEntry(row);
  }

  /**
   * Append one later fact, if the entry is still in a state that admits it.
   *
   * `true` when the row was written, `false` when a unique index was already taken —
   * which is the compare-and-set losing, and the only outcome a caller has to tell
   * apart. `on conflict do nothing` names no index on purpose: a decision conflicts
   * with an earlier decision on `(tenant_id, entry_id, kind)` and with a sweep on the
   * partial index over the two terminal kinds, and both mean the same thing here.
   * A decision additionally repeats its guard in SQL: the row must have no decision and
   * no sweep recorded and must still be inside its deadline at `liveAt`.
   */
  async #appendGuarded(
    tx: TransactionSql,
    tenantId: string,
    entryId: string,
    kind: "decision" | "execution" | "supersession" | "preserved-amendments",
    payload: unknown,
    options: { readonly at: string; readonly liveAt?: string },
  ): Promise<boolean> {
    const liveAt = options.liveAt ?? null;
    const written = await tx`
      insert into ${tx(this.#table("docket_events"))} (tenant_id, entry_id, kind, payload, at)
      select ${tenantId}::text, ${entryId}::text, ${kind}::text,
             ${json(tx, payload)}::jsonb, ${options.at}::timestamptz
      where exists (
        select 1 from ${tx(this.#table("docket_entries"))} e
        where e.tenant_id = ${tenantId}::text
          and e.entry_id = ${entryId}::text
          and (${liveAt}::timestamptz is null or e.expires_at > ${liveAt}::timestamptz)
      )
      and not exists (
        select 1 from ${tx(this.#table("docket_events"))} x
        where x.tenant_id = ${tenantId}::text
          and x.entry_id = ${entryId}::text
          and (x.kind = ${kind}::text
               or (${liveAt}::timestamptz is not null and x.kind = 'expiry'))
      )
      on conflict do nothing
      returning id`;
    return written.length === 1;
  }

  /**
   * One page of the rows in `scope` that `kind` selects, in filing order, with a
   * `limit + 1` probe so `more` is a fact rather than a guess.
   */
  async #slice(
    tx: TransactionSql,
    scope: Scope,
    kind: CursorKind | "all",
    after: string,
    limit: number,
  ): Promise<Slice> {
    const now = this.#clock.now();
    const rows = await tx<FoldRow[]>`
      select filed_row, decision_payload, execution_payload, supersession_payload,
             preserved_payload, expiry_payload, filing_seq
      from ${tx(this.#table("docket_current"))} v
      where v.tenant_id = ${scope.tenantId}::text
        and (${conversationOf(scope)}::text is null
             or v.conversation_id = ${conversationOf(scope)}::text)
        and v.filing_seq > ${requirePosition(after)}::bigint
        and (
          ${kind}::text = 'all'
          or (${kind}::text = 'pending'
              and v.status = 'pending' and v.expires_at > ${now}::timestamptz)
          or (${kind}::text = 'approved-unexecuted'
              and v.status = 'approved' and v.execution = 'unexecuted')
        )
      order by v.filing_seq
      limit ${limit + 1}`;

    const more = rows.length > limit;
    const taken = rows.slice(0, limit);
    const last = taken[taken.length - 1]?.filing_seq ?? after;
    return { items: taken.map((row) => this.#read(foldEntry(row))), last, more };
  }
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

/** The conversation a scope narrows to, or `null` when it narrows to none. */
function conversationOf(scope: Scope): string | null {
  return scope.conversationId ?? null;
}

/**
 * `value` as a bound `jsonb` parameter — the one place a record becomes SQL.
 *
 * The cast is the driver's type for a JSON document, which is narrower than the
 * shapes the core's records actually have (a readonly array, an optional property).
 * Everything sent through here is a value the core built and `JSON.stringify` can
 * write, so the narrowing is about the driver's declaration and not about the data.
 */
function json(tx: TransactionSql, value: unknown): JsonParameter {
  return tx.json(value as Parameters<TransactionSql["json"]>[0]);
}

/** What the driver hands back for a JSON document: a parameter, not a string. */
type JsonParameter = ReturnType<TransactionSql["json"]>;

/** A slice as the contract's page shape, with a cursor only when another page exists. */
function pageOf(slice: Slice, kind: CursorKind): PageResult<DocketEntry> {
  return {
    items: slice.items,
    cursor: slice.more ? encodeCursor(kind, slice.last) : null,
    more: slice.more,
  };
}

/** One page of the rehydration sequence, with the tail's position wrapped in its group. */
function rehydratePage(
  items: readonly DocketEntry[],
  tail: Slice,
  group: string,
): PageResult<DocketEntry> {
  return {
    items,
    cursor: tail.more ? encodeRehydrateCursor(group, tail.last) : null,
    more: tail.more,
  };
}

/** The rehydration cursor: which group, and the filing position within it. */
function encodeRehydrateCursor(group: string, position: string): string {
  return encodeCursor("rehydrate", `${group}:${position}`);
}

/**
 * `page`'s rehydration cursor as `[group, position]`, or the start of the sequence.
 *
 * @throws RangeError when the cursor belongs to another list or names no position.
 */
function splitRehydrateCursor(page: Page): [string, string] {
  const cursor = page.cursor;
  if (cursor === undefined || cursor === null) return [REHYDRATE_PENDING, "0"];
  const position = decodeCursor(cursor, "rehydrate");
  const separator = position.indexOf(":");
  const group = separator === -1 ? "" : position.slice(0, separator);
  if (group !== REHYDRATE_PENDING && group !== REHYDRATE_APPROVED) {
    throw new RangeError("cursor does not name a position in the rehydration sequence");
  }
  return [group, requirePosition(position.slice(separator + 1))];
}
