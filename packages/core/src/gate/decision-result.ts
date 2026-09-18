/**
 * The DecisionResult envelope for an entry that has already been decided.
 *
 * **Rules served: DK-1** (a row's status and its execution outcome are two axes,
 * and a row that is still `pending` has no outcome to report), **AZ-1** (an
 * attestation says who agreed, and only an approval has one), **AZ-5** (this
 * envelope is a report and never an authorization — the row is the sole record of
 * approval authority), **SR-4** (the envelope carries the protocol version of the
 * record it reports on).
 *
 * The report and the row answer different questions, and this is the one place the
 * mapping between them is written. A rejected row names the person who rejected it;
 * the envelope's `attestation` asks *who agreed*, so a rejection reports `null`.
 * An expired row reads `resubmitted` once a successor has superseded it, and
 * `expired` while none has.
 *
 * Pure: reads no store, no clock and no port. A row whose status is `pending` may
 * still read expired at some instant, and choosing that instant is the caller's —
 * so a `pending` row is refused rather than guessed at.
 *
 * @packageDocumentation
 */

import type { Attestation, DocketEntry, ExecutionOutcome } from "../docket/entry.js";
import { AffiantCallerError } from "../errors.js";

/**
 * What became of a review.
 *
 * `"resubmitted"` is the outcome an expired entry reads once a successor has
 * superseded it; it is never a Docket status, which is why this is its own union
 * and not `DocketStatus`.
 */
export type DecisionOutcome = "approved" | "rejected" | "expired" | "resubmitted";

/**
 * What became of a review, as the producer reports it back.
 *
 * Stays assignable to `@affiant/contract`'s `DecisionResult`;
 * `test/gate-types.test-d.ts` asserts that it does.
 */
export interface DecisionResult {
  /** The protocol version this envelope conforms to (SR-4). */
  readonly protocolVersion: string;
  /** The Docket entry this reports on. */
  readonly docketId: string;
  /** What became of the review. */
  readonly outcome: DecisionOutcome;
  /**
   * Who agreed, or `null` when nobody did — a rejection and an expiry carry none
   * (AZ-1). Not the same question as who decided: the row of a rejection names its
   * reviewer and this field is still `null`.
   */
  readonly attestation: Attestation | null;
  /** What became of the write, or `null` when the review did not approve it. */
  readonly execution: ExecutionOutcome | null;
}

/**
 * The DecisionResult envelope for `entry`.
 *
 * Pure: no store, no clock, no port, no network. Every field comes off the row —
 * the version and the entry id (SR-4), the outcome from the status and the lineage,
 * and the attestation and the execution outcome only when the review approved.
 *
 * @throws AffiantCallerError of kind `entry-not-decided` when the row's status is
 *         `pending`. Whether such a row has passed its deadline is read against an
 *         instant, and this function is given none; settle it first — with the
 *         sweep, or by reading the row's status at the instant you mean.
 */
export function decisionResultOf(entry: DocketEntry): DecisionResult {
  const outcome = outcomeOf(entry);
  const approved = outcome === "approved";

  return {
    protocolVersion: entry.protocolVersion,
    docketId: entry.entryId,
    outcome,
    // AZ-1: the field answers "who agreed". Only an approval has an answer, and a
    // rejected row's own attestation names who decided, which is a different
    // question and not this envelope's.
    attestation: approved ? entry.attestation : null,
    // DK-1: a row carries an execution outcome exactly when it is approved.
    execution: approved ? entry.execution : null,
  };
}

/** The outcome the row reads as: the status, except that a superseded expiry reads `resubmitted`. */
function outcomeOf(entry: DocketEntry): DecisionOutcome {
  switch (entry.status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "expired":
      // DK-4: the history reads forward, so an expiry that a resubmission replaced
      // reports the replacement rather than the lapse.
      return entry.lineage.supersededBy === null ? "expired" : "resubmitted";
    default:
      throw new AffiantCallerError(
        "entry-not-decided",
        `Docket entry ${JSON.stringify(entry.entryId)} is still pending, so there is no ` +
          `outcome to report; a pending row that has passed its deadline is settled by a ` +
          `sweep or read against an instant, which this function is given none of`,
        { entryId: entry.entryId, status: entry.status },
      );
  }
}
