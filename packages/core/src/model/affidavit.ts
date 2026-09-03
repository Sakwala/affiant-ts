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
 * mean over non-`Empty` fields; the parity manifest names it. The seed wire fixture
 * carries `aggregateConfidence: 0.95` — the mean of `1.0` and `0.9` — where this
 * package computes `0.9`, and `test/wire-roundtrip.test.ts` asserts both numbers so
 * the difference is a fact the suite states rather than a surprise.
 *
 * Nothing here reads a clock or a database. `createdAt` is passed in and
 * `previousValue` comes from the host's projection port.
 *
 * @packageDocumentation
 */

import type {
  Affidavit as WireAffidavit,
  AffidavitField as WireAffidavitField,
  JsonValue,
} from "@affiant/contract";

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
// Money (SR-2, shape only)
// ---------------------------------------------------------------------------

/**
 * A monetary amount: a decimal string plus an ISO 4217 currency code (SR-2).
 *
 * A string, never a binary float, because `0.1 + 0.2` is not `0.3` and a reviewer
 * approving "£4,000.01" must be approving the number that will be written. The
 * amount and the currency travel together because an amount with no currency is
 * not money.
 */
export interface Money {
  /** The amount as a decimal string: no exponent, no thousands separators. */
  readonly amount: string;
  /** The ISO 4217 currency code, e.g. `"GBP"`. */
  readonly currency: string;
}

/**
 * Whether `value` has the {@link Money} **shape** — two string properties.
 *
 * Shape only, on purpose: whether `amount` is a well-formed decimal within the
 * currency's minor-unit scale, and whether `currency` is a real ISO 4217 code, is
 * the canonical-form validator's job (SR-2, pull request C3). Splitting them keeps
 * this module free of a currency table.
 */
export function isMoney(value: unknown): value is Money {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { amount?: unknown; currency?: unknown };
  return typeof candidate.amount === "string" && typeof candidate.currency === "string";
}

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
 * name for the operation is carried on the wire (see {@link WireCarry}).
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
   * are none (AF-2).
   *
   * Optional because the seed wire schema carries only `aggregateConfidence`; every
   * Affidavit this package builds writes all three, and the schema catches up at
   * protocol v0.1.
   */
  readonly populatedConfidence?: number | null;
  /**
   * How many proposed fields are tagged `Empty` (AF-2). Optional for the same
   * reason as {@link Affidavit.populatedConfidence}.
   */
  readonly emptyFieldCount?: number;
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
 * The facts the wire Affidavit carries that the core Affidavit does not own.
 *
 * Three of them are the host's presentation of the proposal rather than its sworn
 * substance — the host's own operation verb (`"WriteUpdate"`), the warnings a card
 * should show, and whether a person must confirm (which is the policy chain's
 * verdict, not a property of the evidence). Per-field `allowedValues` and `pattern`
 * are the reviewer surface's input constraints, for the same reason.
 *
 * Keeping them out of {@link Affidavit} and explicit here is the point: the core
 * swears to what a value is and where it came from, and hands presentation back to
 * whoever asked.
 */
export interface WireCarry {
  /** The host's own name for the operation, e.g. `"WriteUpdate"`. */
  readonly operationType: string;
  /** Human-readable warnings a reviewer should see. */
  readonly warnings: readonly string[];
  /** Whether a person must confirm this write before it commits. */
  readonly requiresConfirmation: boolean;
  /** Per-field input constraints, keyed by field name. */
  readonly fieldConstraints: {
    readonly [fieldName: string]: {
      readonly allowedValues: readonly string[] | null;
      readonly pattern: string | null;
    };
  };
}

/** Lift the {@link WireCarry} out of a wire Affidavit, so a round trip can put it back. */
export function wireCarryOf(wire: WireAffidavit): WireCarry {
  const fieldConstraints: Record<
    string,
    { allowedValues: readonly string[] | null; pattern: string | null }
  > = {};
  for (const field of wire.fields) {
    fieldConstraints[field.name] = {
      allowedValues: field.allowedValues,
      pattern: field.pattern,
    };
  }
  return {
    operationType: wire.operationType,
    warnings: wire.warnings,
    requiresConfirmation: wire.requiresConfirmation,
    fieldConstraints,
  };
}

/** What {@link fromWire} must be told, because the wire shape at `0.0.1-seed` does not carry it. */
export interface FromWireStamp {
  /** The instant to stamp on the Affidavit and on every tag it derives. */
  readonly at: string;
  /** The conversation turn the proposal was made on. Defaults to `null`. */
  readonly conversationTurn?: number | null;
}

/**
 * Read a wire Affidavit into the core model.
 *
 * Two mappings are worth stating. **The operation shape is derived, not trusted:**
 * `entityId === null` is a create and anything else is an update (AF-3), so a host
 * verb the core has never heard of still lands on the right side of the rule.
 * **A grade is carried, never raised:** a wire tag has no `binding` field at
 * `0.0.1-seed`, so every tag read here is unbound, and the seed fixture's
 * `UserStated` tag is therefore a claim `isHonourable` reports as not honourable —
 * which is PV-5 exactly: no wire type promotes a grade.
 *
 * @throws RangeError if a field value is not a JSON value, or if the wire shape
 *         violates AF-1 or AF-3.
 */
export function fromWire(wire: WireAffidavit, stamp: FromWireStamp): Affidavit {
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
    conversationTurn: stamp.conversationTurn ?? null,
  });
}

function tagFromWire(tag: WireAffidavitField["provenance"]["current"], at: string): ProvenanceTag {
  return mintTag({
    source: tag.source,
    confidence: tag.confidence,
    note: tag.evidence,
    at,
    conversationTurn: tag.conversationTurn,
    // PV-5: the wire at `0.0.1-seed` has no binding field, so nothing read from it
    // is bound. The grade is recorded; whether it may be relied on is PV-4's call.
    binding: null,
  });
}

function chainFromWire(chain: WireAffidavitField["provenance"], at: string): ProvenanceChain {
  return {
    current: tagFromWire(chain.current, at),
    prior: chain.prior.map((tag) => tagFromWire(tag, at)),
  };
}

/**
 * Write a core Affidavit back out in the wire shape, putting `carry` back where it
 * came from.
 *
 * `aggregateConfidence` is **the computed value** (AF-2), which is the one place a
 * round trip through this pair does not return what it was given: the seed fixture
 * arrives carrying `0.95`, the mean of its two fields, and leaves carrying `0.9`,
 * their minimum. That is the rule doing its job, and `test/wire-roundtrip.test.ts`
 * asserts both numbers.
 *
 * `at` and `binding` have nowhere to go on the wire at protocol tag `0.0.1-seed`
 * and are dropped; a tag's `note` is the wire's `evidence`.
 */
export function toWire(affidavit: Affidavit, carry: WireCarry): WireAffidavit {
  return {
    operationType: carry.operationType,
    entityType: affidavit.entityType,
    entityId: affidavit.entityId,
    fields: affidavit.fields.map((field): WireAffidavitField => {
      const constraints = carry.fieldConstraints[field.name];
      return {
        name: field.name,
        value: field.value,
        previousValue: field.previousValue,
        provenance: {
          current: tagToWire(field.provenance.current),
          prior: field.provenance.prior.map(tagToWire),
        },
        isMandatory: field.isMandatory,
        kind: field.kind,
        allowedValues: constraints?.allowedValues ?? null,
        pattern: constraints?.pattern ?? null,
      };
    }),
    aggregateConfidence: affidavit.aggregateConfidence,
    warnings: carry.warnings,
    requiresConfirmation: carry.requiresConfirmation,
  };
}

function tagToWire(tag: ProvenanceTag): WireAffidavitField["provenance"]["current"] {
  return {
    source: tag.source,
    confidence: tag.confidence,
    evidence: tag.note,
    conversationTurn: tag.conversationTurn,
  };
}
