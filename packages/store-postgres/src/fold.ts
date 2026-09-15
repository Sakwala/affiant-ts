/**
 * The row as the core sees it: the filing, plus the later facts, folded.
 *
 * **Rules served: DK-1** (the state machine and its correlations), **DK-2** (an
 * amendment's `null` is a cleared field and an absent key an untouched one), **DK-4**
 * (later facts are appended, never edited — which is why this is a fold and not an
 * `update`).
 *
 * The filing is stored whole, exactly as the core produced it, and each later fact is
 * one row in the events table. Nothing is ever written over: a decision, an execution
 * report, a supersession, a preserved amendment map and a sweep are five separate
 * rows, at most one of each per entry, and the current state of the entry is what you
 * get by laying them over the filing in the order they can happen. That is also why
 * there is no `update` statement anywhere in this package.
 *
 * @packageDocumentation
 */

import { instantMs } from "@affiant/core";
import type {
  Affidavit,
  AmendmentMap,
  Attestation,
  DecisionRecord,
  DocketEntry,
  DocketStatus,
  ExecutionOutcome,
  TransitionPatch,
} from "@affiant/core";

/**
 * What a decision writes: every field the patch determines, resolved against the row
 * it was applied to.
 *
 * Resolved at write time rather than stored as the patch, because a patch's `undefined`
 * means "leave what is there" and the row it means it about is the row the guard just
 * read. Storing the resolved values keeps the fold a plain overlay, and keeps the
 * meaning of the recorded fact from depending on a later reading of anything else.
 */
export interface DecisionPayload {
  readonly status: Exclude<DocketStatus, "pending">;
  readonly execution: ExecutionOutcome | null;
  readonly decidedAt: string;
  readonly decision: DecisionRecord | null;
  readonly amendments: AmendmentMap | null;
  readonly amendedAffidavit: Affidavit | null;
  readonly attestation: Attestation | null;
  readonly executionDetail: string | null;
  readonly supersededBy: string | null;
}

/** What the sweep writes: the row left `pending` at its own deadline, not at the sweep. */
export interface ExpiryPayload {
  readonly status: "expired";
  readonly execution: null;
  readonly decidedAt: string;
}

/** What the executor's one report writes (DK-1). */
export interface ExecutionPayload {
  readonly execution: Exclude<ExecutionOutcome, "unexecuted">;
  readonly executionDetail: string | null;
}

/** What a resubmission writes on the row it replaces (DK-1). */
export interface SupersessionPayload {
  readonly supersededBy: string;
}

/** What a refused late decision leaves behind, for a resubmission to prefill (DK-1, PV-2). */
export interface PreservedPayload {
  readonly amendments: AmendmentMap;
  readonly at: string;
  readonly by: string;
}

/** One row of the `docket_current` view, as postgres.js hands it back. */
export interface FoldRow {
  readonly filed_row: DocketEntry;
  readonly decision_payload: DecisionPayload | null;
  readonly execution_payload: ExecutionPayload | null;
  readonly supersession_payload: SupersessionPayload | null;
  readonly preserved_payload: PreservedPayload | null;
  readonly expiry_payload: ExpiryPayload | null;
  readonly filing_seq: string;
}

/**
 * The entry `row` stands for: the filing with each recorded fact laid over it.
 *
 * The order is the order the facts can happen in. A decision and a sweep are mutually
 * exclusive by the guard that writes them, so either may set the status; an execution
 * report only ever follows an approval; a supersession is written after a row is
 * terminal, so its successor link is laid over whatever the decision carried.
 */
export function foldEntry(row: FoldRow): DocketEntry {
  let entry = row.filed_row;

  const decision = row.decision_payload;
  if (decision !== null) {
    entry = withDecision(entry, decision);
  } else if (row.expiry_payload !== null) {
    // The sweep's own record, not a second derivation of it. A fold that recomputed
    // `decidedAt` from `expires_at` would read the same for a correct sweep and for one
    // that had stamped the instant it ran, which is the mistake DK-1 is about — and the
    // row, not the code, is what an auditor is reading (DK-4).
    //
    // Checked, because reading the row means trusting it, and a row can have been
    // written by something other than this package: a host's own migration, a restore,
    // a repair somebody did by hand. What must never happen is that a stored fact the
    // type forbids is handed back as though it were one the type allows.
    const sweptAt = row.expiry_payload.decidedAt;
    entry = {
      ...entry,
      status: "expired",
      execution: null,
      decidedAt: requireStoredInstant(sweptAt, entry.entryId, "the expiry event's decidedAt"),
    };
  }

  const execution = row.execution_payload;
  if (execution !== null) {
    entry = {
      ...entry,
      execution: execution.execution,
      executionDetail: execution.executionDetail,
    };
  }

  const supersession = row.supersession_payload;
  if (supersession !== null) {
    entry = {
      ...entry,
      lineage: { supersedes: entry.lineage.supersedes, supersededBy: supersession.supersededBy },
    };
  }

  const preserved = row.preserved_payload;
  if (preserved !== null) {
    entry = {
      ...entry,
      preservedAmendments: {
        amendments: preserved.amendments,
        at: preserved.at,
        by: preserved.by,
      },
    };
  }

  return entry;
}

/**
 * `entry` with a recorded decision laid over it.
 *
 * The same overlay whether the decision is being read back or has just been written:
 * a caller that has both the row and the fact it just recorded knows the result
 * without reading it again, and no other fact can be on the row — an execution report
 * needs an approval, a supersession needs a terminal row, a preserved amendment map
 * needs an expired one, and the sweep is excluded by the guard that wrote this.
 */
export function withDecision(entry: DocketEntry, decision: DecisionPayload): DocketEntry {
  return {
    ...entry,
    status: decision.status,
    execution: decision.execution,
    decision: decision.decision,
    amendments: decision.amendments,
    amendedAffidavit: decision.amendedAffidavit,
    attestation: decision.attestation,
    executionDetail: decision.executionDetail,
    decidedAt: decision.decidedAt,
    lineage: { supersedes: entry.lineage.supersedes, supersededBy: decision.supersededBy },
  };
}

/**
 * `value` as an ISO instant, or a refusal that says which row is unreadable.
 *
 * A `RangeError` rather than an `AffiantError`, for the reason the core gives: the
 * error-code registry names the reasons the gate refuses a *request*, and a stored fact
 * that does not parse is a broken record, not a request anybody made. The entry id is
 * in the message because the row it names is the only thing anybody can act on.
 *
 * @throws RangeError when `value` is not a string, or is not a readable instant.
 */
function requireStoredInstant(value: unknown, entryId: string, what: string): string {
  if (typeof value !== "string") {
    throw new RangeError(
      `${what} on entry ${entryId} is ${value === undefined ? "missing" : typeof value}, not an ISO 8601 instant`,
    );
  }
  try {
    instantMs(value, what);
  } catch {
    throw new RangeError(`${what} on entry ${entryId} is not a readable instant: ${value}`);
  }
  return value;
}

/**
 * The row as an expired one **when no sweep has recorded it**: it left `pending` at its
 * own deadline, which is the only instant available when nothing was written down.
 *
 * A swept row and an unswept one past the same deadline have to be the same value, or a
 * host learns to tell whether the sweep has caught up and comes to depend on it. The
 * swept row gets its instant from the event the sweep wrote; this is the unswept half,
 * and the two agree because the sweep records the deadline and not the moment it ran
 * (DK-1).
 */
export function expired(entry: DocketEntry): DocketEntry {
  return { ...entry, status: "expired", execution: null, decidedAt: entry.expiresAt };
}

/**
 * The facts `patch` writes onto `entry`, with the correlations DK-1 requires checked.
 *
 * A patch that contradicts itself — an approved row with no execution outcome, a
 * rejected row that carries one, a transition back to `pending` — is a `RangeError`
 * rather than a silently repaired row, and it is raised before any statement writes
 * anything. A store that quietly fixed the caller's patch would be the store deciding
 * what the state machine means.
 *
 * @throws RangeError when the patch contradicts its own status.
 */
export function decisionPayload(
  entry: DocketEntry,
  patch: TransitionPatch,
  now: string,
): DecisionPayload {
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
    status,
    execution,
    decidedAt,
    decision: patch.decision ?? null,
    // DK-4: the proposal is never overwritten. An approval that accepted amendments
    // records the accepted state beside it; a patch that names none leaves the row's
    // map as it stands, and `null` in the map is the reviewer clearing a field (DK-2).
    amendments: patch.amendments === undefined ? entry.amendments : patch.amendments,
    amendedAffidavit: patch.amendedAffidavit ?? entry.amendedAffidavit,
    attestation: patch.attestation === undefined ? entry.attestation : patch.attestation,
    executionDetail:
      patch.executionDetail === undefined ? entry.executionDetail : patch.executionDetail,
    supersededBy:
      patch.lineage?.supersededBy === undefined
        ? entry.lineage.supersededBy
        : patch.lineage.supersededBy,
  };
}
