/**
 * Amendments: what a reviewer's correction means, and what it does to the record.
 *
 * **Rules served: DK-2** (in an amendment map `null` means *cleared* and an absent
 * key means *untouched*, and an implementation never conflates them), **AF-4** (an
 * accepted amendment recomputes the three confidence numbers, and the amended
 * field's provenance is the reviewer's act — never the machine's pre-correction
 * tag), **PV-2** (that act carries a `reviewer-act` binding naming the Docket
 * decision it was made on).
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

import { mintTag, supersede, type Binding } from "./provenance.js";

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
 * Apply `map` to `affidavit` as `act`, returning a new Affidavit.
 *
 * What happens to an amended field: its value becomes the amended value (`null`
 * when cleared, DK-2), and a `UserStated` tag carrying a `reviewer-act` binding
 * goes **on top of** its chain (PV-2, AF-4). On top rather than merged: a
 * reviewer's correction is not a confidence contest it might lose to the machine's
 * own tag, and the displaced tag stays in `prior` so the card can still show what
 * the machine had proposed.
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

  const binding: Binding = {
    kind: "reviewer-act",
    ref: { entryId: act.entryId, decisionAt: act.decisionAt },
  };

  const fields = affidavit.fields.map((field): AffidavitField => {
    const amendment = byName.get(field.name);
    if (amendment === undefined) return field;

    const value: JsonValue = amendment.kind === "clear" ? null : amendment.value;
    const tag = mintTag({
      source: "UserStated",
      confidence: 1,
      note:
        amendment.kind === "clear"
          ? `Cleared by ${act.by} on Docket entry ${act.entryId}`
          : `Amended by ${act.by} on Docket entry ${act.entryId}`,
      at: act.decisionAt,
      conversationTurn: affidavit.conversationTurn,
      binding,
    });

    return {
      name: field.name,
      kind: field.kind,
      value,
      previousValue: field.previousValue,
      provenance: supersede(field.provenance, tag),
      isMandatory: field.isMandatory,
    };
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
