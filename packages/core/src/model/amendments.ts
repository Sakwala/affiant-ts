/**
 * Amendments: what a reviewer's correction means, and what it does to the record.
 *
 * **Rules served: DK-2** (in an amendment map `null` means *cleared* and an absent
 * key means *untouched*, and an implementation never conflates them), **AF-1** (a
 * field with unknown provenance is present and tagged `Empty`; a field the operation
 * does not propose is absent), **AF-2** (the three numbers, with `Empty` counting as
 * `0`), **AF-4** (an accepted amendment recomputes the three confidence numbers, and
 * the amended field's provenance is the reviewer's act — never the machine's
 * pre-correction tag), **PV-2** (that act carries a `reviewer-act` binding naming
 * the Docket decision it was made on).
 *
 * ## What clearing a field does to the numbers
 *
 * A cleared field has no value, so it cannot have confidence in one. Writing the
 * reviewer's `UserStated`/`1.0` tag over an emptied field would make the three
 * numbers *rise* as a reviewer wiped the Affidavit — clear every field and the record
 * reports perfect confidence over nothing, which is the arithmetic hole AF-2 exists
 * to close, arriving through the amendment path. So a clear is resolved against the
 * field rather than pasted onto it:
 *
 * - **A mandatory field stays and is tagged `Empty`** (confidence `0`, AF-1). The
 *   entity still requires it, so it is still proposed and still on the card — now
 *   visibly with nothing behind it, counted in `emptyFieldCount` and dragging
 *   `aggregateConfidence` to `0`.
 * - **An optional field is removed from `fields[]`** (AF-1). A reviewer clearing an
 *   optional field is saying "do not write this one", which is a field the write no
 *   longer proposes, and AF-1 says a field the operation does not propose is absent
 *   rather than present-and-`Empty`.
 *
 * Either way the reviewer's act is not lost: the `Empty` tag carries the same
 * `reviewer-act` binding and the same note a set would (PV-2), and the machine's
 * displaced tag stays in the chain behind it.
 *
 * Why DK-2 needs saying at all: `undefined` and `null` are one keystroke apart in
 * JavaScript and `{ Status: undefined }` reads to a careless consumer as "clear
 * Status", when it is in fact "say nothing about Status". Conflating them silently
 * either wipes a field nobody asked to wipe or ignores a correction a person made
 * on purpose. So this module resolves a map into {@link Amendment} values — `set`
 * or `clear`, both explicit — and a field nobody amended is simply not in the
 * resolved list. `undefined` under a key is refused, loudly.
 *
 * Why AF-4 needs saying: the shipped demo hosts return an amended Affidavit still
 * carrying the machine's pre-correction confidence, so a card can show a corrected
 * value under a number that was never about that value.
 *
 * @packageDocumentation
 */

import { mintTag, supersede, type ProvenanceTag } from "./provenance.js";

import {
  withConfidence,
  type Affidavit,
  type AffidavitField,
  type JsonValue,
} from "./affidavit.js";

/**
 * A reviewer's corrections, keyed by {@link AffidavitField.name}.
 *
 * `null` under a key clears the field; a key that is not present leaves the field
 * untouched (DK-2). `undefined` under a key means nothing and is refused by
 * {@link resolveAmendments}.
 */
export type AmendmentMap = { readonly [fieldName: string]: JsonValue | null };

/**
 * One resolved correction. DK-2's two meanings, made into two shapes so no reader
 * has to decide what a value means: `clear` carries no value because there is no
 * value, and `set` always carries one.
 *
 * "Untouched" has no shape here on purpose — it is the absence of an entry.
 */
export type Amendment =
  { readonly kind: "set"; readonly value: JsonValue } | { readonly kind: "clear" };

/** One field's correction, as {@link resolveAmendments} returns it. */
export interface ResolvedAmendment {
  /** The field being amended. */
  readonly name: string;
  /** What the reviewer did to it. */
  readonly amendment: Amendment;
}

/** Whether `map` says anything at all about `fieldName` (DK-2). */
export function hasAmendment(map: AmendmentMap, fieldName: string): boolean {
  return Object.hasOwn(map, fieldName);
}

/**
 * Resolve `map` into explicit {@link Amendment} values, in the map's own key order.
 *
 * @throws RangeError if a key is present holding `undefined` — the one thing an
 *         amendment map may not say, because it is indistinguishable at a glance
 *         from both of DK-2's meanings and is neither.
 */
export function resolveAmendments(map: AmendmentMap): readonly ResolvedAmendment[] {
  const resolved: ResolvedAmendment[] = [];
  for (const name of Object.keys(map)) {
    const value = map[name];
    if (value === undefined) {
      throw new RangeError(
        `DK-2: amendment ${JSON.stringify(name)} is undefined; ` +
          `use null to clear the field, or omit the key to leave it untouched`,
      );
    }
    resolved.push(
      value === null
        ? { name, amendment: { kind: "clear" } }
        : { name, amendment: { kind: "set", value } },
    );
  }
  return resolved;
}

/**
 * The decision a set of amendments was made on: which Docket entry, when, and by
 * whom.
 *
 * `entryId` and `decisionAt` become the `reviewer-act` binding (PV-2) — the pointer
 * an auditor follows years later to the decision that changed the value. `by` is
 * the person, carried in the tag's note for the card; the authoritative record of
 * who approved is the attestation on the Docket entry (AZ-1, pull request C6), not
 * a string on a tag.
 */
export interface ReviewerAct {
  /** The Docket entry the decision was made on. */
  readonly entryId: string;
  /** When the decision was made, as an ISO 8601 instant. */
  readonly decisionAt: string;
  /** Who made it, as the host identifies them. */
  readonly by: string;
}

/**
 * The provenance tag an accepted amendment puts in force on the field it names
 * (PV-2, AF-2).
 *
 * One function so there is one answer. The canonical form (SR-1) is defined over
 * "the Affidavit and its accepted amendments", and an implementation that minted a
 * *nearly* identical tag on the serialization path would produce different bytes
 * from the same decision — which is the one thing a canonical form exists to make
 * impossible. `model/canonical.ts` calls this, and so does {@link applyAmendments}.
 *
 * A set mints `UserStated` at confidence `1`: a reviewer typing a value is the
 * person stating it, and PV-3 makes that the one place the grade is legitimate. A
 * clear mints `Empty` at confidence `0`: an emptied field has no value to be
 * confident in, so a clearing can never raise a confidence number.
 *
 * Either way the binding is `reviewer-act`, naming the decision *and the instant*,
 * so an auditor can follow a clearing as readily as a correction.
 *
 * @param amendment        What the reviewer did to the field.
 * @param act              The decision it arrived on.
 * @param conversationTurn The turn the Affidavit belongs to, carried onto the tag.
 */
export function amendmentTag(
  amendment: Amendment,
  act: ReviewerAct,
  conversationTurn: number | null,
): ProvenanceTag {
  const cleared = amendment.kind === "clear";
  return mintTag({
    source: cleared ? "Empty" : "UserStated",
    confidence: cleared ? 0 : 1,
    note: cleared
      ? `Cleared by ${act.by} on Docket entry ${act.entryId}`
      : `Amended by ${act.by} on Docket entry ${act.entryId}`,
    at: act.decisionAt,
    conversationTurn,
    binding: { kind: "reviewer-act", ref: { entryId: act.entryId, decisionAt: act.decisionAt } },
  });
}

/**
 * Apply `map` to `affidavit` as `act`, returning a new Affidavit.
 *
 * What happens to a field the reviewer **set**: its value becomes the amended value,
 * and a `UserStated` tag carrying a `reviewer-act` binding goes **on top of** its
 * chain (PV-2, AF-4). On top rather than merged: a reviewer's correction is not a
 * confidence contest it might lose to the machine's own tag, and the displaced tag
 * stays in `prior` so the card can still show what the machine had proposed.
 *
 * What happens to a field the reviewer **cleared** (`null`, DK-2): a mandatory field
 * keeps its place with value `null` under an `Empty` tag at confidence `0`, and an
 * optional field leaves `fields[]` entirely. See the module note above for why the
 * reviewer's `1.0` is not written over an emptied field.
 *
 * What happens to everything else: nothing. A field the map does not name keeps its
 * value, its `previousValue` and its whole chain, byte for byte (DK-2). And
 * `previousValue` never moves — it is what the entity holds now, which an
 * amendment does not change.
 *
 * The three numbers are recomputed over the amended fields (AF-4).
 *
 * @throws RangeError if `map` names a field the Affidavit does not propose. Not an
 *         {@link AffiantError}: the error-code registry names refusals the gate
 *         makes at runtime about a proposal's substance or a decider's identity,
 *         and this is a caller passing a field name that is not there — a
 *         programming error, in the same class as an out-of-range index.
 */
export function applyAmendments(
  affidavit: Affidavit,
  map: AmendmentMap,
  act: ReviewerAct,
): Affidavit {
  const resolved = resolveAmendments(map);
  if (resolved.length === 0) return affidavit;

  const byName = new Map(resolved.map((entry) => [entry.name, entry.amendment]));
  for (const name of byName.keys()) {
    if (!affidavit.fields.some((field) => field.name === name)) {
      throw new RangeError(
        `amendment names field ${JSON.stringify(name)}, which this Affidavit does not propose`,
      );
    }
  }

  const fields = affidavit.fields.flatMap((field): AffidavitField[] => {
    const amendment = byName.get(field.name);
    if (amendment === undefined) return [field];

    // AF-1: a cleared optional field is a field the write no longer proposes, so it
    // is absent rather than present with nothing in it.
    if (amendment.kind === "clear" && !field.isMandatory) return [];

    const cleared = amendment.kind === "clear";
    const value: JsonValue = cleared ? null : amendment.value;
    const tag = amendmentTag(amendment, act, affidavit.conversationTurn);

    return [
      {
        name: field.name,
        kind: field.kind,
        value,
        previousValue: field.previousValue,
        provenance: supersede(field.provenance, tag),
        isMandatory: field.isMandatory,
      },
    ];
  });

  // AF-4: the numbers are the amended Affidavit's, not the proposal's.
  return withConfidence(
    {
      operationType: affidavit.operationType,
      entityType: affidavit.entityType,
      entityId: affidavit.entityId,
      conversationTurn: affidavit.conversationTurn,
      createdAt: affidavit.createdAt,
    },
    fields,
  );
}
