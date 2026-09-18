/**
 * The shape check every binding written by a host has to pass before the gate does
 * anything with it (PV-2, SR-3).
 *
 * A binding is the one part of an Affidavit a host writes freehand: everything else
 * is built by this package's own constructors. So it is the one part that can reach
 * the Docket in a shape the protocol's `binding.schema.json` refuses — and a row
 * that holds one produces an Evidence Card the rulebook's own envelope schema
 * rejects, which SR-4 forbids this implementation from claiming conformance for. It
 * is not cosmetic either: PV-4 lets a Standing Order approve a write with nobody
 * present when the tags it predicates on "carry a binding", and if any object in the
 * binding position counted, a host bug would satisfy PV-4 with a pointer no auditor
 * can follow — which PV-2 says "is not a binding".
 *
 * The check is written by hand rather than compiled from the schema: this package is
 * runtime-neutral (RT-1) and a validator that generates code at run time does not run
 * on workerd. A Node-side suite holds this function **equal to the schema** over a
 * corpus of valid and invalid bindings, so the two cannot drift apart in silence.
 *
 * Nothing here throws. It returns the reason, so the caller can say which field the
 * binding was on and where it came from.
 *
 * @packageDocumentation
 */

import { BINDING_KINDS } from "./provenance.js";

/** A JSON object as it arrives from a host: unknown keys, unknown values. */
type UnknownRecord = { readonly [key: string]: unknown };

/** Whether `value` is a plain JSON object — not `null`, not an array. */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// The primitive types the schemas refer to (common.schema.json)
// ---------------------------------------------------------------------------

/** `identifier`: a non-empty string. The protocol never parses one. */
function isIdentifier(value: unknown): boolean {
  return typeof value === "string" && value.length >= 1;
}

/** `nonNegativeInteger`: an integer of zero or more. */
function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** `uuid`: the canonical 8-4-4-4-12 form, as the `uuid` format admits it. */
const UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID.test(value);
}

const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
const DATE_TIME_SEPARATOR = /t|\s/i;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** RFC 3339 `full-date`, calendar-aware: 2026-02-30 is not a date. */
function isRfc3339Date(text: string): boolean {
  const matches = DATE.exec(text);
  if (matches === null) return false;
  const year = Number(matches[1]);
  const month = Number(matches[2]);
  const day = Number(matches[3]);
  if (month < 1 || month > 12) return false;
  const last = month === 2 && isLeapYear(year) ? 29 : (DAYS[month] as number);
  return day >= 1 && day <= last;
}

/** RFC 3339 `full-time` with the offset the protocol requires, leap second included. */
function isRfc3339Time(text: string): boolean {
  const matches = TIME.exec(text);
  if (matches === null) return false;
  const hour = Number(matches[1]);
  const minute = Number(matches[2]);
  const second = Number(matches[3]);
  const zone = matches[4];
  const zoneSign = matches[5] === "-" ? -1 : 1;
  const zoneHour = Number(matches[6] ?? 0);
  const zoneMinute = Number(matches[7] ?? 0);
  if (zoneHour > 23 || zoneMinute > 59 || zone === undefined) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  const utcMinute = minute - zoneMinute * zoneSign;
  const utcHour = hour - zoneHour * zoneSign - (utcMinute < 0 ? 1 : 0);
  return (
    (utcHour === 23 || utcHour === -1) && (utcMinute === 59 || utcMinute === -1) && second < 61
  );
}

/**
 * `isoInstant`: an RFC 3339 date-time with an explicit offset.
 *
 * Spelled out rather than handed to `Date.parse`, which accepts a great deal RFC
 * 3339 does not and whose leniency differs between runtimes — the point of this
 * module is one verdict, the schema's, on every runtime.
 */
function isIsoInstant(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const parts = value.split(DATE_TIME_SEPARATOR);
  return (
    parts.length === 2 && isRfc3339Date(parts[0] as string) && isRfc3339Time(parts[1] as string)
  );
}

// ---------------------------------------------------------------------------
// The schema, as a table
// ---------------------------------------------------------------------------

/** One property of a closed object: what it is called, and what it may hold. */
interface PropertySpec {
  readonly required: boolean;
  /** `null` for a nested closed object, which {@link checkObject} recurses into. */
  readonly check: ((value: unknown) => boolean) | null;
  /** The nested object's own properties, when `check` is `null`. */
  readonly nested?: ObjectSpec;
  /** How the type reads in a reason line. */
  readonly expected: string;
}

/** A closed object: exactly these properties, nothing else (SR-3). */
type ObjectSpec = { readonly [key: string]: PropertySpec };

function must(check: (value: unknown) => boolean, expected: string): PropertySpec {
  return { required: true, check, expected };
}

function may(check: (value: unknown) => boolean, expected: string): PropertySpec {
  return { required: false, check, expected };
}

/** `relayRef` in `binding.schema.json`: closed, three required identifiers. */
const RELAY_REF: ObjectSpec = {
  principal: must(isIdentifier, "a non-empty string"),
  channelIdentity: must(isIdentifier, "a non-empty string"),
  messageId: must(isIdentifier, "a non-empty string"),
};

/** `computationRef`'s `constant`: closed, two required non-empty strings. */
const COMPUTATION_CONSTANT: ObjectSpec = {
  source: must(isIdentifier, "a non-empty string"),
  verifiedOn: must(isIdentifier, "a non-empty string"),
};

function isIdentifierArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isIdentifier);
}

/** The `ref` of each of the five kinds, in the schema's order. */
const REFS: { readonly [kind: string]: ObjectSpec } = {
  "utterance-span": {
    offset: must(isNonNegativeInteger, "an integer of zero or more"),
    length: must(isNonNegativeInteger, "an integer of zero or more"),
    hash: must(isIdentifier, "a non-empty string"),
  },
  "reviewer-act": {
    entryId: must(isUuid, "a UUID"),
    decisionAt: must(isIsoInstant, "an RFC 3339 instant with an offset"),
  },
  "form-input": {
    field: must(isIdentifier, "a non-empty string"),
  },
  "external-ref": {
    system: must(isIdentifier, "a non-empty string"),
    recordId: must(isIdentifier, "a non-empty string"),
    fetchedAt: may(isIsoInstant, "an RFC 3339 instant with an offset"),
    contentHash: may(isIdentifier, "a non-empty string"),
    relay: { required: false, check: null, nested: RELAY_REF, expected: "a relay object" },
  },
  "computation-ref": {
    rule: must(isIdentifier, "a non-empty string"),
    inputs: must(isIdentifierArray, "an array of non-empty strings"),
    constant: {
      required: false,
      check: null,
      nested: COMPUTATION_CONSTANT,
      expected: "a constant object",
    },
  },
};

/**
 * Check one closed object against its spec, deepest first.
 *
 * `path` is how the property reads in a reason line — `ref`, `ref.relay` — so a host
 * that gets one back can go straight to the line that built it.
 */
function checkObject(value: unknown, spec: ObjectSpec, path: string): string | null {
  if (!isRecord(value)) return `${path} is not an object`;
  for (const [name, property] of Object.entries(spec)) {
    const present = Object.hasOwn(value, name) && value[name] !== undefined;
    if (!present) {
      if (property.required) return `${path}.${name} is missing`;
      continue;
    }
    const nested = property.nested;
    if (nested !== undefined) {
      const reason = checkObject(value[name], nested, `${path}.${name}`);
      if (reason !== null) return reason;
      continue;
    }
    if (property.check !== null && !property.check(value[name])) {
      return `${path}.${name} is not ${property.expected}`;
    }
  }
  for (const name of Object.keys(value)) {
    if (value[name] === undefined) continue;
    if (!Object.hasOwn(spec, name)) return `${path}.${name} is not a property of ${path}`;
  }
  return null;
}

/**
 * Why `value` is not a binding, or `null` when it is one.
 *
 * Equal to `binding.schema.json` at the pinned protocol ref: one of the five kinds,
 * that kind's required keys with the schema's types, its optional keys when present,
 * and no undeclared key at any level the schema closes — the binding itself, its
 * `ref`, and `ref.relay` and `ref.constant` inside it.
 *
 * The shape, not the truth: a well-formed `external-ref` naming a record that does
 * not exist passes here, and it is an auditor who finds out otherwise.
 *
 * One stated difference from running the schema over the same object: a property
 * explicitly set to `undefined` is read as absent, at every level. `undefined` is not
 * a JSON value and does not survive serialization, so the object this sees and the
 * object the schema would ever be run over differ there — and a host that spreads an
 * optional property it does not have should not be told it wrote a bad binding.
 */
export function bindingShapeReason(value: unknown): string | null {
  if (!isRecord(value)) return "the binding is not an object";
  const kind = value["kind"];
  if (typeof kind !== "string" || !(BINDING_KINDS as readonly string[]).includes(kind)) {
    return (
      `binding kind ${JSON.stringify(kind)} is not one of the five the protocol fixes ` +
      `(${BINDING_KINDS.join(", ")})`
    );
  }
  if (!Object.hasOwn(value, "ref") || value["ref"] === undefined) return "ref is missing";
  for (const name of Object.keys(value)) {
    if (value[name] === undefined) continue;
    if (name !== "kind" && name !== "ref") return `${name} is not a property of a binding`;
  }
  return checkObject(value["ref"], REFS[kind] as ObjectSpec, "ref");
}
