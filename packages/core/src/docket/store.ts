/**
 * The Docket store contract — what a store must do, stated so that the in-memory
 * reference store and a production store are held to the same fixtures.
 *
 * **Rules served: DK-1** (idempotent filing, the guarded compare-and-set, expiry as
 * queryable state, preserved amendments on a late decision, lineage), **DK-3** (a
 * bounded, paged, host-scheduled sweep), **DK-4** (retention, purge and export are
 * hooks the host drives, and a row reads forward), **DK-5** (rehydration order),
 * **AZ-2** (every operation is tenant-scoped), **RT-2** (no unbounded operation).
 *
 * Three properties are worth reading the interface for.
 *
 * **Every operation is scoped.** There is no method that reaches a row by id alone.
 * An entry id is unique *within a tenant*, and a lookup with the wrong tenant is not
 * an error — it is a miss, indistinguishable from an id that does not exist.
 * Anything else leaks the existence of another tenant's rows to whoever can guess an
 * id, and AZ-2 exists because that check is the one hosts hand-roll and get wrong.
 *
 * **Every read applies expiry.** `get`, `listPending` and `rehydrate` report what a
 * row *reads* as, not what it says: a `pending` entry past its deadline reads
 * `expired` whether or not the host's sweep has run (DK-1). A store therefore needs
 * to know the time, which is why it is built with a {@link Clock} rather than being
 * handed an instant at every call — a store that took `now` as a parameter would let
 * a caller answer the deadline question for it.
 *
 * **Every list is bounded.** No method returns "all of them". Lists are paged with
 * an opaque cursor; the sweep and the retention hook take a limit and report whether
 * more remain; export is an `AsyncIterable`. RT-2's envelope — a serverless isolate
 * with no persistent process — has no room for a method that loads a tenant's
 * Docket into memory.
 *
 * *Two divergences from the v0.1 design record, recorded deliberately.* The
 * design's sketch of `transition` takes `(entryId, expected, patch)` and returns
 * `entry | "lost-race" | "not-pending"`. First, every other method on the interface
 * is scoped, and an unscoped transition would be the one door in the store through
 * which a caller could move another tenant's row by guessing an id — exactly what
 * AZ-2 closes; the signature here takes a {@link Scope} in the same position `get`
 * does. Second, the sketch has no way to say *no such entry*: reporting a missing id
 * as `"not-pending"` would make a caller turn it into `decision-expired`, which is a
 * different and misleading refusal, so {@link TransitionResult} carries a
 * `"not-found"` arm as well.
 *
 * @packageDocumentation
 */

// The **core** amendment map (ledger BD-31): a row holds the core model, and the
// wire shapes are reached only at the boundary. See the note in `entry.ts`.
import type { AmendmentMap } from "../model/amendments.js";

import type {
  Attestation,
  DecisionRecord,
  DocketEntry,
  DocketStatus,
  ExecutionOutcome,
} from "./entry.js";

// ---------------------------------------------------------------------------
// Scoping and paging
// ---------------------------------------------------------------------------

/**
 * What a store operation is allowed to see.
 *
 * `tenantId` is mandatory: there is no cross-tenant read. `conversationId` narrows
 * further, which is what a session surface asks for when it rehydrates one
 * conversation rather than a whole tenant's Docket.
 */
export interface Scope {
  /** The tenant. Mandatory — nothing in this interface reads across tenants. */
  readonly tenantId: string;
  /** One conversation within the tenant, when the caller wants only that (GT-2). */
  readonly conversationId?: string;
}

/**
 * Where to continue and how much to take.
 *
 * `cursor` is **opaque**: it is produced by a store, understood only by the same
 * store, and bound to the list that produced it — feeding a `listPending` cursor to
 * `export` is a caller error, not a silently different answer.
 */
export interface Page {
  /** The `cursor` from the previous {@link PageResult}, or absent/`null` to start. */
  readonly cursor?: string | null;
  /** How many entries to return at most. */
  readonly limit: number;
}

/** One page of a list. */
export interface PageResult<T> {
  /** The entries in this page, in filing order. */
  readonly items: readonly T[];
  /** Pass back as {@link Page.cursor} to continue, or `null` when the list is drained. */
  readonly cursor: string | null;
  /** Whether another page exists. `false` when `cursor` is `null`. */
  readonly more: boolean;
}

/**
 * What the host's retention job is allowed to remove (DK-4).
 *
 * Retention is a hook rather than a policy the framework holds an opinion about:
 * how long an approval record must be kept is a legal question with a different
 * answer in every jurisdiction the gate runs in, and a default would be wrong
 * somewhere important.
 */
export interface RetentionPolicy {
  /**
   * Remove terminal entries whose terminal instant is strictly before this ISO 8601
   * instant.
   */
  readonly olderThan: string;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * What a transition out of `pending` writes.
 *
 * The patch is exactly the set of later facts a decision produces, and nothing
 * else: it cannot touch the Affidavit, the requirement, the deadline, the filing
 * instant or the entry's own id. That is DK-4's read-forward property in the type —
 * a row accumulates facts, it is never rewritten.
 *
 * `supersedes` is absent on purpose: it is fixed when an entry is filed and names
 * the entry this one *replaces*, which cannot change afterwards. `supersededBy` is
 * here because a caller may want to record a successor in the same write that closes
 * a row, though the ordinary path writes it with
 * {@link DocketStore.recordSupersession} on an already-terminal entry.
 */
export interface TransitionPatch {
  /** The state the entry moves to. Never back to `pending`. */
  readonly status: Exclude<DocketStatus, "pending">;
  /**
   * The execution outcome. Required to be `"unexecuted"` (the default) when `status`
   * is `"approved"`, and `null` otherwise — a store refuses a patch that contradicts
   * its own status (DK-1).
   */
  readonly execution?: ExecutionOutcome | null;
  /** What the reviewer chose and why. Absent for a sweep, which nobody decided. */
  readonly decision?: DecisionRecord | null;
  /**
   * The amendments the approval accepted. DK-2 holds inside the map: a `null` value
   * clears the field, an absent key leaves it untouched.
   */
  readonly amendments?: AmendmentMap | null;
  /** Who agreed (AZ-1). A decision without one is a decision nobody can be held to. */
  readonly attestation?: Attestation | null;
  /** When the row left `pending`. Defaults to the store's clock reading. */
  readonly decidedAt?: string | null;
  /** What the executor reported, when the caller already knows. */
  readonly executionDetail?: string | null;
  /** The successor link, for a caller closing and superseding a row in one write. */
  readonly lineage?: { readonly supersededBy?: string | null };
}

/**
 * What a guarded compare-and-set returns.
 *
 * The two refusals are distinct because they mean different things to a caller and
 * map to different error codes. `"lost-race"` means **someone else decided this
 * entry** — the row is `approved` or `rejected`, a second decision arrived, and
 * DK-1 requires it be refused rather than applied twice or silently overwritten.
 * `"not-pending"` means **the entry is no longer available to decide for a reason
 * that is not a competing decision** — it has passed its deadline, whether or not a
 * sweep has recorded that yet. A caller turns the first into
 * `decision-lost-race` and the second into `decision-expired`, and the second is
 * the one that must also preserve the amendments the late decision carried
 * ({@link DocketStore.preserveAmendments}).
 *
 * Between them the two cover every state a row can be in that is not `pending`, so
 * a caller never has to re-read to find out which refusal it got. `"not-found"` is
 * the third answer: no entry with that id is visible in the scope — which, for a
 * caller in the wrong tenant, is the only answer they get (AZ-2).
 */
export type TransitionResult = DocketEntry | "not-found" | "lost-race" | "not-pending";

/** What {@link DocketStore.preserveAmendments} returns. */
export type PreserveAmendmentsResult = DocketEntry | "not-found" | "not-expired";

/** What {@link DocketStore.recordExecution} returns. */
export type RecordExecutionResult = DocketEntry | "not-found" | "not-approved";

/** What {@link DocketStore.recordSupersession} returns. */
export type RecordSupersessionResult = DocketEntry | "not-found" | "not-terminal";

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/**
 * The durable record of every proposed write and everything that happened to it.
 *
 * A store is the only thing in the framework that remembers, so it is also the only
 * place the DK rules can be enforced rather than merely documented: the
 * idempotent file, the guarded transition, the deadline applied on read, the bounded
 * sweep and the append-only later facts are all properties of *this* interface. A
 * host that swaps the in-memory reference store for Postgres inherits them by
 * passing the same fixtures, not by re-reading the rulebook.
 */
export interface DocketStore {
  /**
   * File `entry`, or return the one already filed under its id (DK-1).
   *
   * Idempotent by `entryId` within the tenant, and idempotent in the strong sense:
   * a re-file is **never** an error and **never** overwrites. It returns the stored
   * entry as it stands, `created: false`, keeping its **existing** `expiresAt` — a
   * re-file that refreshed the deadline would let a retrying agent hold a card open
   * indefinitely, which is the .NET behaviour GT-4 corrects.
   */
  file(entry: DocketEntry): Promise<{ entry: DocketEntry; created: boolean }>;

  /**
   * The entry, with expiry applied (DK-1), or `null`.
   *
   * `null` covers both "no such id" and "not in this scope". A caller outside the
   * tenant learns nothing about whether the id exists.
   */
  get(entryId: string, scope: Scope): Promise<DocketEntry | null>;

  /**
   * Move an entry out of `pending`, if it is still `pending` (DK-1).
   *
   * A guarded compare-and-set: the read of the current state and the write of the
   * new one happen with no interleaving point between them, so of two decisions that
   * race, exactly one is applied and the other is refused. `expected` is `"pending"`
   * and only `"pending"` — nothing else in the state machine has a transition out of
   * it.
   */
  transition(
    entryId: string,
    scope: Scope,
    expected: "pending",
    patch: TransitionPatch,
  ): Promise<TransitionResult>;

  /**
   * Record the amendments a decision carried after the entry had already expired, so
   * a resubmission can prefill them (DK-1).
   *
   * This is the one write that applies to a row the transition guard refused, and it
   * is a separate method for that reason: folding it into `transition` would make a
   * refused compare-and-set write to the row, and "applied once or not at all" is
   * exactly the property DK-1's fixture asserts. Under DK-4 this is an appended
   * later fact on a terminal row, not an edit of a recorded decision — it touches
   * `amendments` and nothing else, never `status`, `decision` or `attestation`.
   *
   * Returns `"not-expired"` when the entry does not read `expired`; a caller that
   * gets it has a bug, because a decision that was not refused as expired has no
   * amendments to preserve.
   */
  preserveAmendments(
    entryId: string,
    scope: Scope,
    amendments: AmendmentMap,
  ): Promise<PreserveAmendmentsResult>;

  /**
   * Record what the host's executor reported for an approved entry (DK-1).
   *
   * `status` stays `approved`; only `execution` and `executionDetail` move. The
   * framework never performs the write (AZ-7) — it records what the host says
   * happened, so that an approved-but-failed write is distinguishable from an
   * approved-and-committed one on the row.
   *
   * Returns `"not-approved"` for any row that is not `approved`.
   */
  recordExecution(
    entryId: string,
    scope: Scope,
    outcome: Exclude<ExecutionOutcome, "unexecuted">,
    detail: string | null,
  ): Promise<RecordExecutionResult>;

  /**
   * Record that a terminal entry has been resubmitted as `supersededBy` (DK-1).
   *
   * The superseded entry keeps its terminal state; only the successor link is added.
   * A resubmission is a new entry, never a reopened one, which is what lets the
   * history read forward (DK-4).
   *
   * Returns `"not-terminal"` for a row that still reads `pending`.
   */
  recordSupersession(
    entryId: string,
    scope: Scope,
    supersededBy: string,
  ): Promise<RecordSupersessionResult>;

  /** Entries that read `pending` right now, in filing order, paged. */
  listPending(scope: Scope, page: Page): Promise<PageResult<DocketEntry>>;

  /**
   * Entries that are `approved` and still `unexecuted`, in filing order, paged.
   *
   * The host's executor reads this: an approved write nobody has reported on is work
   * outstanding, and after a restart it is the only record that the work exists.
   */
  listApprovedUnexecuted(scope: Scope, page: Page): Promise<PageResult<DocketEntry>>;

  /**
   * Mark at most `limit` entries that are due at `now` as `expired`, in filing order
   * (DK-3).
   *
   * The host schedules this; the core owns no timer. The sweep makes the state
   * durable and gives the host a list to notify on — it does not *cause* expiry,
   * which every read already applies (DK-1). `more` says whether another call would
   * find more, so a host drains the queue in bounded steps rather than in one
   * unbounded pass.
   */
  expireDue(
    now: string,
    scope: Scope,
    limit: number,
  ): Promise<{ expired: string[]; more: boolean }>;

  /**
   * Remove at most `limit` terminal entries older than `policy.olderThan` (DK-4).
   *
   * Each call shrinks the eligible set, so a host drains retention by calling until
   * `more` is `false` — the same bounded-step shape as the sweep, and for the same
   * RT-2 reason.
   */
  retention(
    policy: RetentionPolicy,
    scope: Scope,
    limit: number,
  ): Promise<{ removed: number; more: boolean }>;

  /**
   * Remove everything belonging to `tenantId` (DK-4).
   *
   * Unbounded by design and by necessity: a tenant asking for their data to be
   * deleted is asking for all of it, and a partial purge is not a purge. It is the
   * one operation that is not paged, and the only one that takes a tenant id rather
   * than a {@link Scope} — there is no such thing as purging half a tenant.
   */
  purge(tenantId: string): Promise<{ removed: number }>;

  /**
   * Every entry in `scope`, in filing order, streamed (DK-4).
   *
   * An `AsyncIterable` rather than an array so a large Docket never has to fit in
   * memory (RT-2). The portable document shape a host would export *to* is reserved
   * for protocol v0.2; this yields the rows.
   */
  export(scope: Scope): AsyncIterable<DocketEntry>;
}

/**
 * What a reconnecting client needs to see, in the order DK-5 fixes.
 *
 * **`pending` entries first, then `approved` and `unexecuted`**, each in filing
 * order. The order is a rule rather than a preference because the two groups ask
 * different things of the person reconnecting: the first still needs a decision, the
 * second still needs execution, and a client that showed them interleaved would put
 * work that is already agreed in front of work that is still blocked on the reader.
 */
export interface SessionStore {
  /**
   * One page of the rehydration sequence: everything that reads `pending`, then
   * everything `approved` and `unexecuted`, each in filing order.
   *
   * Paged like every other list (RT-2). The cursor carries the position *within the
   * sequence*, so a page boundary that falls between the two groups resumes at the
   * start of the second rather than restarting the first.
   */
  rehydrate(scope: Scope, page: Page): Promise<PageResult<DocketEntry>>;
}
