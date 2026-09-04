/**
 * The Affidavit: the sworn evidence record for one proposed write, its fields, the
 * three confidence numbers, and the mapping to and from the wire shape.
 *
 * **Rules served: AF-1** (`fields[]` carries only the proposed fields; unknown
 * provenance is present and tagged `Empty`, a field the operation does not propose
 * is absent), **AF-2** (three confidence numbers, `aggregateConfidence` the
 * *minimum* over proposed fields with `Empty` counting as `0`), **AF-3**
 * (`entityId` non-null ⇔ update; an update carries a `previousValue` key on every
 * proposed field, `null` where the field had no stored value), **SR-2** (money is a
 * decimal string plus an ISO 4217 code — the shape only; the validator is pull
 * request C3).
 *
 * Why AF-2 is a minimum and not a mean: a mean that first discards every `Empty`
 * field lets a mostly-empty Affidavit report high confidence, which is the exact
 * hole once provenance authorises writes. The shipped .NET projection computes a
 * mean over non-`Empty` fields; the parity manifest names it.
 *
 * Nothing here reads a clock or a database. `createdAt` is passed in and
 * `previousValue` comes from the host's projection port.
 *
 * @packageDocumentation
 */

import type {
  Affidavit as WireAffidavit,
  AffidavitField as WireAffidavitField,
  EvidenceCardRequest as WireEvidenceCardRequest,
  FieldPresentation,
  JsonValue,
  ProvenanceTag as WireProvenanceTag,
} from "@affiant/contract";
import { PROTOCOL_VERSION } from "@affiant/contract";

import type { Operation } from "../ports.js";

import {
  chainOf,
  emptyTag,
  mintTag,
  type ProvenanceChain,
  type ProvenanceTag,
} from "./provenance.js";

// ---------------------------------------------------------------------------
// JSON values
// ---------------------------------------------------------------------------

/**
 * Any value that survives a round trip through JSON, re-exported from
 * `@affiant/contract` so the gate and the wire agree on one definition of what a
 * field value may be. `null` is a value; `undefined` is not.
 */
export type { JsonValue };

/**
 * Whether `value` is a {@link JsonValue}: no `undefined`, no function, no symbol, no
 * `NaN` or infinity, no cycle.
 *
 * Checked deeply, because a field value is carried onto a record a person is asked
 * to swear to and later hashed into a canonical form (SR-1); a value that
 * serialises to something different from what the reviewer saw is the failure mode
 * this closes.
 */
export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueWithin(value, new WeakSet<object>());
}

function isJsonValueWithin(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      return false;
  }
  const object = value as object;
  if (seen.has(object)) return false;
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      return object.every((element) => isJsonValueWithin(element, seen));
    }
    if (
      Object.getPrototypeOf(object) !== Object.prototype &&
      Object.getPrototypeOf(object) !== null
    ) {
      return false;
    }
    return Object.values(object as Record<string, unknown>).every((element) =>
      isJsonValueWithin(element, seen),
    );
  } finally {
    seen.delete(object);
  }
}

/**
 * {@link isJsonValue} as an assertion, for a boundary that must not carry the value
 * through.
 *
 * The wire types already say a field value is a {@link JsonValue}; a value that
 * arrived over a network makes that a claim rather than a fact, and this is the
 * boundary where the claim is checked.
 */
function asJsonValue(value: unknown, where: string): JsonValue {
  if (!isJsonValue(value)) {
    throw new RangeError(`${where} is not a JSON value`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Money (SR-2)
// ---------------------------------------------------------------------------

/**
 * Money is one definition, and it lives in `./money.ts` — the SR-2 module, which
 * owns the {@link Money} shape, the decimal-string and ISO 4217 validators, and the
 * scale check a host declares. Re-exported here because an Affidavit is where a
 * caller meets a monetary field, and because the export path `@affiant/core` offers
 * should not depend on which pull request wrote which half.
 *
 * Note that `isMoney` **validates**: it is `false` for `{ amount: "1e3" }` and for
 * `{ currency: "usd" }`, not only for a missing property. A shape-only guard on a
 * public surface would answer "yes, money" for values SR-2 refuses, which is the
 * wrong answer to give a host that is about to swear to one.
 */
export { isMoney } from "./money.js";
export type { Money } from "./money.js";

// ---------------------------------------------------------------------------
// The Affidavit
// ---------------------------------------------------------------------------

/** How a reviewer surface should render a field. Same set as the wire's. */
export type AffidavitFieldKind = "text" | "number" | "date" | "enum";

/** Every {@link AffidavitFieldKind}. */
export const AFFIDAVIT_FIELD_KINDS = [
  "text",
  "number",
  "date",
  "enum",
] as const satisfies readonly AffidavitFieldKind[];

/**
 * One sworn field: the proposed value, the value it replaces, and the whole
 * provenance chain behind it.
 *
 * `previousValue` is `null` on a create and on an update field that had no stored
 * value; the two are distinguished by the Affidavit's `operationType`, not by the
 * field (AF-3).
 */
export interface AffidavitField {
  /** The field's name on the target entity. The key amendments use. */
  readonly name: string;
  /** Rendering hint for a reviewer surface. */
  readonly kind: AffidavitFieldKind;
  /** The proposed value. */
  readonly value: JsonValue;
  /** The value being replaced, or `null` (AF-3). */
  readonly previousValue: JsonValue | null;
  /** Where the value came from, and everything it displaced. */
  readonly provenance: ProvenanceChain;
  /** Whether the target entity requires the field. */
  readonly isMandatory: boolean;
}

/**
 * The sworn evidence record for one proposed write.
 *
 * `operationType` is the protocol's own two-valued vocabulary rather than the
 * host's operation name, because AF-3 is a rule about the *shape* — an update names
 * the entity it updates and swears to what it replaces — and "create-only" has to
 * be a predicate a policy can test without knowing the host's verbs. The host's own
 * verb travels beside the record, never on it, and the v0.1 wire has no slot for
 * it at all — a card carries the shape, and the host keeps its own vocabulary.
 */
export interface Affidavit {
  /** `create` when nothing exists yet; `update` when an entity is being changed. */
  readonly operationType: "create" | "update";
  /** The kind of domain entity being written, named by the host. */
  readonly entityType: string;
  /** The entity being written; `null` on a create, non-null on an update (AF-3). */
  readonly entityId: string | null;
  /** The sworn fields, in the order the operation proposed them. */
  readonly fields: readonly AffidavitField[];
  /** Minimum confidence over every proposed field, `Empty` counting as `0` (AF-2). */
  readonly aggregateConfidence: number;
  /**
   * Minimum confidence over the non-`Empty` proposed fields, or `null` when there
   * are none (AF-2). `null` rather than `0`: "there is nothing populated to be
   * confident about" is a different statement from "the populated fields are
   * worthless", and a card showing `0` would say the second.
   */
  readonly populatedConfidence: number | null;
  /** How many proposed fields are tagged `Empty` (AF-2). */
  readonly emptyFieldCount: number;
  /** The conversation turn the proposal was made on, or `null`. */
  readonly conversationTurn: number | null;
  /** When the Affidavit was built, as an ISO 8601 instant. */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// The three numbers (AF-2)
// ---------------------------------------------------------------------------

/** The three numbers AF-2 requires a card to show. */
export interface ConfidenceNumbers {
  /** Minimum over every proposed field, `Empty` counting as `0`. */
  readonly aggregateConfidence: number;
  /** Minimum over the non-`Empty` proposed fields; `null` when there are none. */
  readonly populatedConfidence: number | null;
  /** How many proposed fields are tagged `Empty`. */
  readonly emptyFieldCount: number;
}

/**
 * The three confidence numbers over `fields` (AF-2).
 *
 * - `aggregateConfidence` is the **minimum** over every proposed field, with an
 *   `Empty` field counting as `0` whatever its tag says — so it is `0` exactly when
 *   some proposed field has unknown provenance.
 * - `populatedConfidence` is the minimum over the non-`Empty` fields, and **`null`**
 *   when there are none. `null` rather than `0`: "there is nothing populated to be
 *   confident about" is a different statement from "the populated fields are
 *   worthless", and a card that showed `0` would say the second.
 * - `emptyFieldCount` counts the `Empty` fields.
 *
 * An Affidavit with no fields at all reports `0`, `null`, `0`. It has nothing to
 * swear to, and the substance gate refuses it before it is ever filed (GT-3).
 *
 * Neither the protocol nor this package defines a threshold on any of the three.
 */
export function computeConfidence(fields: readonly AffidavitField[]): ConfidenceNumbers {
  let aggregate: number | null = null;
  let populated: number | null = null;
  let emptyFieldCount = 0;

  for (const field of fields) {
    const tag = field.provenance.current;
    const contribution = tag.source === "Empty" ? 0 : tag.confidence;
    aggregate = aggregate === null ? contribution : Math.min(aggregate, contribution);
    if (tag.source === "Empty") {
      emptyFieldCount += 1;
    } else {
      populated = populated === null ? tag.confidence : Math.min(populated, tag.confidence);
    }
  }

  return {
    aggregateConfidence: aggregate ?? 0,
    populatedConfidence: populated,
    emptyFieldCount,
  };
}

// ---------------------------------------------------------------------------
// Building (AF-1, AF-3)
// ---------------------------------------------------------------------------

/**
 * One field as a caller offers it to {@link buildAffidavit}.
 *
 * `provenance` is optional and its absence is the whole of AF-1's first half: a
 * proposed field whose provenance nobody knows is **present** on the Affidavit with
 * an `Empty` tag at confidence `0`, never quietly omitted.
 *
 * `previousValue` is optional in the type and **required at runtime on an update**
 * (AF-3): the key must be there, holding `null` where the field had no stored
 * value. Optional-in-the-type is what lets a create omit it; the runtime check is
 * what stops an update from forgetting it.
 */
export interface AffidavitFieldInput {
  /** The field's name. Must be one the operation proposes. */
  readonly name: string;
  /** Rendering hint for a reviewer surface. */
  readonly kind: AffidavitFieldKind;
  /** The proposed value. */
  readonly value: JsonValue;
  /** The stored value being replaced; `null` where there was none. */
  readonly previousValue?: JsonValue | null;
  /** Where the value came from. Absent means unknown, which becomes an `Empty` tag. */
  readonly provenance?: ProvenanceChain;
  /** Whether the target entity requires the field. */
  readonly isMandatory: boolean;
}

/** What {@link buildAffidavit} needs that the operation and the fields do not carry. */
export interface AffidavitMeta {
  /** When the Affidavit is built, as an ISO 8601 instant. Passed in; nothing here reads a clock. */
  readonly createdAt: string;
  /** The conversation turn the proposal was made on. Defaults to `null`. */
  readonly conversationTurn?: number | null;
}

/**
 * Build an Affidavit for `op` from `fields`, enforcing AF-1 and AF-3 and computing
 * the three numbers (AF-2).
 *
 * **AF-1.** `op.fields` is the authority on what is proposed, and the field list
 * must cover it exactly. A field the operation does not propose is a `RangeError`
 * rather than a silently `Empty`-tagged row (that is the "absent, never
 * `Empty`-tagged" half of the rule, made unfakeable); a proposed field with no
 * entry is also a `RangeError`, because the way to say "proposed, provenance
 * unknown" is to pass the field with no `provenance` and get an `Empty` tag.
 *
 * **AF-3.** `op.kind` and `op.entityId` must agree — an update names its entity, a
 * create names none — and on an update every field must carry the `previousValue`
 * key, holding `null` where the entity had no stored value. On a create every
 * `previousValue` is `null`.
 *
 * @throws RangeError on any AF-1 or AF-3 violation, naming the field.
 */
export function buildAffidavit(
  op: Operation,
  fields: readonly AffidavitFieldInput[],
  meta: AffidavitMeta,
): Affidavit {
  // AF-3, the shape half. `Operation` is a discriminated union, so a type-checked
  // caller cannot get here wrong; a JavaScript one can.
  if (op.kind === "update" && (op.entityId === null || op.entityId === undefined)) {
    throw new RangeError("AF-3: an update-shaped operation must name the entity it updates");
  }
  if (op.kind === "create" && op.entityId !== null) {
    throw new RangeError("AF-3: a create-shaped operation has no entityId");
  }

  const proposed = new Set(op.fields);
  const seen = new Set<string>();

  const built = fields.map((input): AffidavitField => {
    if (!proposed.has(input.name)) {
      throw new RangeError(
        `AF-1: field ${JSON.stringify(input.name)} is not proposed by the operation; ` +
          `a field the operation does not propose is absent from the Affidavit, never Empty-tagged`,
      );
    }
    if (seen.has(input.name)) {
      throw new RangeError(`AF-1: field ${JSON.stringify(input.name)} is proposed twice`);
    }
    seen.add(input.name);

    const carriesPreviousValue = Object.hasOwn(input, "previousValue");
    if (op.kind === "update" && !carriesPreviousValue) {
      throw new RangeError(
        `AF-3: update field ${JSON.stringify(input.name)} must carry a previousValue key; ` +
          `pass null where the entity had no stored value`,
      );
    }
    if (op.kind === "create" && carriesPreviousValue && input.previousValue !== null) {
      throw new RangeError(
        `AF-3: create field ${JSON.stringify(input.name)} must have previousValue null`,
      );
    }

    return {
      name: input.name,
      kind: input.kind,
      value: input.value,
      previousValue: op.kind === "create" ? null : (input.previousValue ?? null),
      // AF-1: unknown provenance is a recorded absence, not a missing tag.
      provenance: input.provenance ?? chainOf(emptyTag(meta.createdAt, "Provenance unknown")),
      isMandatory: input.isMandatory,
    };
  });

  for (const name of op.fields) {
    if (!seen.has(name)) {
      throw new RangeError(
        `AF-1: proposed field ${JSON.stringify(name)} has no entry; ` +
          `a proposed field with unknown provenance is present and Empty-tagged, never omitted`,
      );
    }
  }

  return withConfidence(
    {
      operationType: op.kind,
      entityType: op.entityType,
      entityId: op.entityId,
      conversationTurn: meta.conversationTurn ?? null,
      createdAt: meta.createdAt,
    },
    built,
  );
}

/** The Affidavit's own properties minus the three numbers — what a caller supplies. */
type AffidavitCore = Omit<
  Affidavit,
  "aggregateConfidence" | "populatedConfidence" | "emptyFieldCount" | "fields"
>;

/**
 * Assemble an Affidavit from its parts with the three numbers computed over
 * `fields` (AF-2, and AF-4 when the fields have been amended).
 *
 * Exported because the amendment path needs exactly this: same identity, same
 * order, recomputed numbers.
 */
export function withConfidence(core: AffidavitCore, fields: readonly AffidavitField[]): Affidavit {
  const numbers = computeConfidence(fields);
  return {
    operationType: core.operationType,
    entityType: core.entityType,
    entityId: core.entityId,
    fields,
    aggregateConfidence: numbers.aggregateConfidence,
    populatedConfidence: numbers.populatedConfidence,
    emptyFieldCount: numbers.emptyFieldCount,
    conversationTurn: core.conversationTurn,
    createdAt: core.createdAt,
  };
}

// ---------------------------------------------------------------------------
// The wire (SR-3, SR-4)
// ---------------------------------------------------------------------------

/**
 * The presentation the card envelope carries beside a sworn record, which the
 * Affidavit itself does not own.
 *
 * All four are the host's presentation of the proposal rather than its sworn
 * substance: the sentences a reviewer should read, whether a person must confirm
 * (which is the policy chain's verdict, not a property of the evidence), the
 * per-field rendering hints a surface builds its inputs from, and the host's own
 * verb for the operation.
 *
 * They live on the envelope and not on the record because the canonical form a
 * host's execution grant binds to is defined over the Affidavit and its accepted
 * amendments and nothing else (SR-1). A closed value set, a regular expression an
 * input is masked with, and a sentence a reviewer should read are none of those
 * things: swearing to them would put a rendering decision inside a hash a grant is
 * checked against, so that restyling an input invalidates a grant minted over
 * evidence that did not change. It would also invite the misreading that the gate
 * enforces them — it does not. A value outside `allowedValues`, or not matching
 * `pattern`, is still recorded; a host that wants such a value refused enforces
 * that in its own policy.
 */
export interface WireCarry {
  /** Sentences a reviewer should see beside the record. Empty when there are none. */
  readonly warnings: readonly string[];
  /** Whether a person must confirm this write before it commits. */
  readonly requiresConfirmation: boolean;
  /**
   * How a reviewer surface should render each field's input: one entry per field
   * the host has a hint for, naming a field the Affidavit carries. Empty when the
   * host declared none.
   */
  readonly presentation: readonly FieldPresentation[];
  /**
   * The host's own verb for the operation, or `null` when it named none.
   *
   * `Affidavit.operationType` is the protocol's two-valued shape, so that a rule
   * about shape stays a predicate a policy can test without knowing any host's
   * vocabulary. The host's word for the same act travels **beside** it, here, where
   * a reviewer surface can show it and no hash is taken over it.
   */
  readonly hostOperation: string | null;
}

/**
 * Lift the {@link WireCarry} off a card envelope, so a round trip can put it back.
 *
 * The two optional slots come back as empty arrays rather than `undefined`: a
 * caller reading them wants something to iterate, and `toWire`'s companion,
 * {@link presentationToWire}, turns an empty one back into an omitted property.
 */
export function wireCarryOf(card: WireEvidenceCardRequest): WireCarry {
  return {
    warnings: card.warnings ?? [],
    requiresConfirmation: card.requiresConfirmation,
    presentation: card.presentation ?? [],
    hostOperation: card.hostOperation ?? null,
  };
}

/**
 * The card envelope's three optional presentation slots as the wire spells them:
 * **absent** when there is nothing to say, never `null`.
 *
 * Nothing swears to any of them, so a producer with nothing to say says nothing —
 * the distinction the schemas draw between a value that is sometimes missing
 * (spelled `null`) and a property that is meaningful only sometimes (spelled by its
 * absence).
 */
export function presentationToWire(carry: WireCarry): {
  presentation?: readonly FieldPresentation[];
  warnings?: readonly string[];
  hostOperation?: string;
} {
  return {
    ...(carry.presentation.length > 0 ? { presentation: carry.presentation } : {}),
    ...(carry.warnings.length > 0 ? { warnings: carry.warnings } : {}),
    ...(carry.hostOperation === null ? {} : { hostOperation: carry.hostOperation }),
  };
}

/** What {@link fromWire} must be told, because a wire Affidavit does not carry it. */
export interface FromWireStamp {
  /**
   * The instant to stamp on the Affidavit. A tag carries its own `at` on the wire
   * from v0.1, so this is the record's `createdAt` and the fallback for a tag that
   * somehow arrived without one.
   */
  readonly at: string;
  /** The conversation turn the proposal was made on. Defaults to the wire's own, else `null`. */
  readonly conversationTurn?: number | null;
}

/**
 * Read a wire Affidavit into the core model.
 *
 * **A payload from another protocol version is refused, never guessed at.** The
 * `0.0.1-seed` shape the shipped .NET framework still sends is a different
 * document — the host's verb where the shape belongs, one confidence number rather
 * than three, the warnings and the confirmation flag on the record, the
 * presentation on each field — and reading it as though it were this one would
 * produce a record that swore to things nobody said. SR-4 puts the version on the
 * envelope precisely so a consumer can tell: a differing **major** is refused, and
 * so is an older minor whose shape this version does not describe. A newer minor is
 * accepted, because a minor only adds.
 *
 * Two mappings are worth stating. **The operation shape is derived, not trusted:**
 * `entityId === null` is a create and anything else is an update (AF-3), so a
 * record whose `operationType` disagrees with its own `entityId` still lands on the
 * right side of the rule. **A grade is carried, never raised:** a binding read off
 * the wire is recorded as it arrived, and whether a tag may be relied on is PV-4's
 * call, not the reader's.
 *
 * @throws RangeError if the payload names another protocol version, if a field
 *         value is not a JSON value, or if the wire shape violates AF-1 or AF-3.
 */
export function fromWire(wire: WireAffidavit, stamp: FromWireStamp): Affidavit {
  assertReadableVersion(wire.protocolVersion);

  const entityId = wire.entityId;
  const names = wire.fields.map((field) => field.name);

  const op: Operation =
    entityId === null
      ? { kind: "create", entityType: wire.entityType, entityId: null, fields: names }
      : { kind: "update", entityType: wire.entityType, entityId, fields: names };

  const fields = wire.fields.map((field): AffidavitFieldInput => ({
    name: field.name,
    kind: field.kind,
    value: asJsonValue(field.value, `field ${JSON.stringify(field.name)} value`),
    previousValue: asJsonValue(
      field.previousValue,
      `field ${JSON.stringify(field.name)} previousValue`,
    ),
    provenance: chainFromWire(field.provenance, stamp.at),
    isMandatory: field.isMandatory,
  }));

  return buildAffidavit(op, fields, {
    createdAt: stamp.at,
    conversationTurn: stamp.conversationTurn ?? wire.conversationTurn ?? null,
  });
}

/**
 * Refuse a payload this version cannot read (SR-4).
 *
 * A differing major is a different protocol. An older minor is a shape this
 * version does not describe — `0.0.1-seed` is the one that exists, and it is not a
 * subset of v0.1 but a different document. A newer minor is accepted and not
 * warned about here: a minor only adds, and the caller who wants to know can
 * compare `PROTOCOL_VERSION` itself.
 */
function assertReadableVersion(version: string): void {
  // A payload with no version at all is the seed, which predates the property.
  // Checked as data rather than trusted from the type: this is a boundary, and the
  // type is a claim about what arrived rather than a fact.
  if (typeof version === "string") {
    const [major, minor] = version.split(".");
    const [targetMajor, targetMinor] = PROTOCOL_VERSION.split(".");
    if (major === targetMajor && Number(minor) >= Number(targetMinor)) return;
  }
  throw new RangeError(
    `SR-4: this package reads protocol ${PROTOCOL_VERSION} and was handed ` +
      `${version === undefined ? "a payload carrying no protocolVersion at all" : JSON.stringify(version)}. ` +
      `The 0.0.1-seed wire is a different document — the host's verb where the operation shape belongs, ` +
      `one confidence number rather than three, the warnings and the presentation on the record rather ` +
      `than on the card envelope — and is deliberately not converted: reading it as this shape would ` +
      `produce a record that swore to things nobody said. Translate it at the host boundary instead; ` +
      `its schemas are exported from @affiant/contract/schemas as seedSchemas.`,
  );
}

function tagFromWire(tag: WireProvenanceTag, at: string): ProvenanceTag {
  return mintTag({
    source: tag.source,
    confidence: tag.confidence,
    note: tag.note,
    at: tag.at ?? at,
    conversationTurn: tag.conversationTurn,
    // PV-5: a binding is carried exactly as it arrived. Nothing here raises a
    // grade; whether an unbound tag above `Conversation` may be relied on is
    // PV-4's call.
    binding: tag.binding,
  });
}

function chainFromWire(chain: WireAffidavitField["provenance"], at: string): ProvenanceChain {
  return {
    current: tagFromWire(chain.current, at),
    prior: chain.prior.map((tag) => tagFromWire(tag, at)),
  };
}

/**
 * Write a core Affidavit back out in the wire shape.
 *
 * Everything on the wire record is the record: the operation's **shape** rather
 * than the host's verb (AF-3), the three confidence numbers (AF-2), the version
 * the envelope conforms to (SR-4), and each field's value, previous value and
 * whole provenance chain. The presentation a surface needs goes on the card
 * envelope instead — see {@link WireCarry}.
 *
 * `aggregateConfidence` is **the computed value** (AF-2). An implementation that
 * wrote back whatever number it was handed would let a mean computed elsewhere
 * travel under a name the rule defines as a minimum.
 */
export function toWire(
  affidavit: Affidavit,
  protocolVersion: string = PROTOCOL_VERSION,
): WireAffidavit {
  return {
    protocolVersion,
    operationType: affidavit.operationType,
    entityType: affidavit.entityType,
    entityId: affidavit.entityId,
    fields: affidavit.fields.map((field): WireAffidavitField => ({
      name: field.name,
      kind: field.kind,
      value: field.value,
      previousValue: field.previousValue,
      provenance: {
        current: tagToWire(field.provenance.current),
        prior: field.provenance.prior.map(tagToWire),
      },
      isMandatory: field.isMandatory,
    })),
    aggregateConfidence: affidavit.aggregateConfidence,
    populatedConfidence: affidavit.populatedConfidence,
    emptyFieldCount: affidavit.emptyFieldCount,
    conversationTurn: affidavit.conversationTurn,
    createdAt: affidavit.createdAt,
  };
}

function tagToWire(tag: ProvenanceTag): WireProvenanceTag {
  return {
    source: tag.source,
    confidence: tag.confidence,
    note: tag.note,
    at: tag.at,
    conversationTurn: tag.conversationTurn,
    binding: tag.binding ?? null,
  };
}
