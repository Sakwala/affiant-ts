/**
 * The Evidence Card for an entry that is already on the Docket.
 *
 * **Rules served: SR-1** (a host's rendering of a proposal lives on the card
 * envelope and not on the sworn record), **DK-1 and DK-5** (a row that reads expired
 * is never presented as one still awaiting a decision), **AZ-4 and CV-4** (a blocked
 * entry's card says so and never claims a confirmation is being awaited), **AF-2 and
 * AF-4** (the card shows the amended record and the numbers recomputed over it).
 *
 * A filing already returns a card, but a review queue lists entries long after they
 * were filed and has only the row. {@link cardFor} is that producer: pure, reading
 * no store, no clock and no port, and building through the same internal builder the
 * filing path uses so the two cannot drift.
 *
 * Two things the row cannot supply, and which therefore come from the caller: the
 * per-field rendering hints and the host's own verb for the operation. SR-1 puts
 * both on the envelope rather than on the record, and the Docket entry schema is
 * closed and has nowhere to keep them — so they are whatever the host passes on
 * *this* call, not what it passed at filing. The host can look them up: the row
 * records the tool that proposed it (CV-4), and the host holds that tool's
 * declaration.
 *
 * One thing a card built here does not carry: the sentence a policy chain gave at
 * filing. The row records the policy's verdict, not its prose, and re-running the
 * chain now would evaluate a different moment.
 *
 * @packageDocumentation
 */

import type { DocketEntry } from "../docket/entry.js";
import { readStatus } from "../docket/entry.js";
import { AffiantCallerError } from "../errors.js";
import type { FieldSchema } from "../ports.js";

import type { EvidenceCardRequest } from "./pipeline.js";
import { buildCard } from "./pipeline.js";

/**
 * What a card needs beside the row.
 *
 * Everything here except `now` is optional, and a card built with none of them is a
 * complete card: it simply carries no rendering hints, no host verb, and — for a
 * first filing — whatever the row itself preserved.
 */
export interface CardForOptions {
  /**
   * The instant to read the row's deadline against, as an ISO 8601 string in UTC.
   *
   * Required, and a parameter rather than a reading, because this package owns no
   * clock (RT-2): a card built from a row is built at a moment the caller knows and
   * the function cannot. It is what decides whether a `pending` row is still
   * awaiting a decision (DK-1).
   */
  readonly now: string;
  /**
   * The host's field schema for the operation that proposed this row — the source of
   * the card's per-field rendering hints.
   *
   * Absent, the card carries no `presentation`. The hints are the host's rendering
   * of the proposal and not its sworn substance (SR-1), so they are supplied here
   * rather than read off the row: a host that later widens a picker's set serves the
   * widened set for every entry, including ones filed before the change.
   */
  readonly schema?: FieldSchema;
  /**
   * The host's own verb for the operation — `"Onboard"`, `"Reprice"`.
   *
   * Absent, the card omits `hostOperation`, which the envelope allows.
   */
  readonly operationLabel?: string;
  /**
   * The entry this one supersedes, as `gate.get` returns it.
   *
   * **Required when the row supersedes another**, because a reviewer's earlier
   * corrections live on that row and nowhere else, and a card that silently dropped
   * them would still be a valid envelope and still be wrong. Passing it for a row
   * that supersedes nothing, or passing the wrong row, is a caller error.
   */
  readonly superseded?: DocketEntry;
}

/**
 * The Evidence Card for `entry`, as a reviewer surface should see it at `now`.
 *
 * Pure: no store, no clock, no port, no network. The same builder the filing path
 * uses, so for the same row, the same `schema`, the same `operationLabel`, the same
 * superseded row and an instant before the deadline, this returns the card the
 * filing returned — except that it carries no policy sentence in `warnings`.
 *
 * Works for a row in any status. An approved row, a rejected row and an expired row
 * all have cards; `requiresConfirmation` is the one field that says whether a
 * decision is being asked for, and it is `true` only for a row that is `pending`, is
 * not blocked, and has not passed its deadline at `now` (DK-1, DK-5, AZ-4).
 *
 * @throws AffiantCallerError of kind `superseded-entry-mismatch` when the row
 *         supersedes another and `options.superseded` is missing, is a different
 *         entry, or belongs to another tenant — or when it is supplied for a row
 *         that supersedes nothing.
 * @throws RangeError when `now` or the row's `expiresAt` is not a readable instant.
 */
export function cardFor(entry: DocketEntry, options: CardForOptions): EvidenceCardRequest {
  return buildCard(entry, {
    priorAmendments: priorAmendmentsFor(entry, options.superseded),
    schema: options.schema ?? null,
    operationLabel: options.operationLabel ?? null,
    // The row records the policy's verdict, not the sentence it gave (SR-1 keeps
    // prose off the record), and re-running the chain here would judge a different
    // moment against a host risk function this function is not allowed to call.
    policyReason: null,
    // DK-5: a row that reads expired is never presented as pending, swept or not —
    // so the deadline is measured with the reading the stores and the sweep use
    // rather than with a second comparison written here. AZ-4: a blocked entry's
    // card never claims a confirmation is being awaited.
    requiresConfirmation: readStatus(entry, options.now) === "pending" && entry.blocked === null,
  });
}

/**
 * The amendments a reviewer already made, which the Docket holds on the row this
 * entry replaced.
 *
 * A first filing answers from its own preserved map — the amendments a decision
 * carried after the deadline had passed (DK-1). A resubmission answers from the row
 * it supersedes, which is where the corrections that prefilled it were preserved,
 * and which the caller must therefore hand over. The absence fails loudly rather
 * than reading `null`: a card that quietly dropped a reviewer's earlier corrections
 * validates against the envelope schema and is still wrong.
 */
function priorAmendmentsFor(entry: DocketEntry, superseded: DocketEntry | undefined) {
  const supersedes = entry.lineage.supersedes;

  if (supersedes === null) {
    if (superseded !== undefined) {
      throw new AffiantCallerError(
        "superseded-entry-mismatch",
        `Docket entry ${JSON.stringify(entry.entryId)} supersedes no entry, so there is no ` +
          `superseded row for its card to read prior amendments from; entry ` +
          `${JSON.stringify(superseded.entryId)} was supplied`,
        { entryId: entry.entryId, supersedes: null, supplied: superseded.entryId },
      );
    }
    return entry.preservedAmendments?.amendments ?? null;
  }

  if (superseded === undefined) {
    throw new AffiantCallerError(
      "superseded-entry-mismatch",
      `Docket entry ${JSON.stringify(entry.entryId)} supersedes entry ` +
        `${JSON.stringify(supersedes)}, whose preserved amendments are the card's ` +
        `priorAmendments; pass that entry as options.superseded`,
      { entryId: entry.entryId, supersedes, supplied: null },
    );
  }
  if (superseded.entryId !== supersedes) {
    throw new AffiantCallerError(
      "superseded-entry-mismatch",
      `Docket entry ${JSON.stringify(entry.entryId)} supersedes entry ` +
        `${JSON.stringify(supersedes)}, but options.superseded is entry ` +
        `${JSON.stringify(superseded.entryId)}`,
      { entryId: entry.entryId, supersedes, supplied: superseded.entryId },
    );
  }
  if (superseded.tenantId !== entry.tenantId) {
    throw new AffiantCallerError(
      "superseded-entry-mismatch",
      `Docket entry ${JSON.stringify(entry.entryId)} belongs to tenant ` +
        `${JSON.stringify(entry.tenantId)} and options.superseded to tenant ` +
        `${JSON.stringify(superseded.tenantId)}; a card reads no row from another tenant`,
      {
        entryId: entry.entryId,
        supersedes,
        tenantId: entry.tenantId,
        suppliedTenantId: superseded.tenantId,
      },
    );
  }

  return superseded.preservedAmendments?.amendments ?? null;
}
