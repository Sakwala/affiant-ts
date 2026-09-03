/**
 * The canonical form of an Affidavit and its accepted amendments, and the SHA-256
 * hash over it.
 *
 * **Rules served: SR-1, SR-2, RT-1.**
 *
 * **SR-1** — *the canonical form of a filed proposal is a deterministic byte
 * sequence over the Affidavit **and its accepted amendments** (the amended field
 * values with their reviewer-act tags, in the same field order), with UTF-8, object
 * keys sorted by Unicode code point, no insignificant whitespace, numbers as their
 * shortest round-trip decimal representation, `null` written and absent omitted.
 * `canonicalHash` is the SHA-256 of that form.*
 *
 * **Why the amendments are inside the form and not beside it.** A host's execution
 * grant binds to `canonicalHash(Affidavit + amendments)`. If the form covered the
 * Affidavit alone, a grant minted for the proposal a reviewer *was shown* would
 * still validate the proposal they *amended* — the one substitution the whole
 * framework exists to prevent. Two conformance fixtures in this package's vector
 * set differ only by an amendment, and their hashes differ; that is the rule made
 * checkable.
 *
 * **Why a canonical form at all.** Three things depend on two independent
 * implementations agreeing byte for byte: the conformance suite compares canonical
 * forms across the .NET and TypeScript lines; an `utterance-span` provenance
 * binding hashes the span it points at, so an auditor can re-derive it years later;
 * and the execution grant above. `JSON.stringify` cannot do any of that — its key
 * order is insertion order, so the same Affidavit built by two code paths produces
 * two different documents and two different hashes.
 *
 * ## The form, precisely
 *
 * A JSON document with no space, tab or newline between tokens. Within it:
 *
 * - **Objects** — `{`, then each own enumerable string-keyed property whose value is
 *   not `undefined`, sorted by **Unicode code point** of the key, as `"key":value`
 *   separated by `,`, then `}`. Sorting by code point rather than by UTF-16 code
 *   unit matters above U+FFFF: a key starting with an emoji sorts *after* a key
 *   starting with U+E000, though a naive JavaScript `<` puts it first. Symbol keys
 *   are not JSON and are ignored; inherited properties are not own properties and
 *   are ignored.
 * - **Arrays** — `[`, elements in their own order, separated by `,`, then `]`.
 *   Array order is data, never sorted. An `undefined` element is refused rather
 *   than written as `null`: "absent omitted" is meaningful for a property and
 *   meaningless for a position, and silently substituting `null` would put a value
 *   on an audit record that the producer never wrote.
 * - **Strings** — JSON escaping and nothing more: `"` and `\` escaped, the C0
 *   control characters escaped (`\b`, `\t`, `\n`, `\f`, `\r`, else `\u00xx` with
 *   lowercase hex), unpaired surrogates escaped as `\udxxx`. Every other character
 *   is written as itself and encoded as UTF-8 — **no `\u` escapes for non-ASCII**,
 *   so `"é"` is two bytes and not six, and `/` is never escaped.
 * - **Numbers** — the shortest round-trip decimal, written positionally: never an
 *   exponent, `-0` written as `0`, non-finite refused. See {@link canonicalJson}
 *   for what "positionally" costs and why it is the safer half of the trade.
 * - **`null`** — written. **`true` / `false`** — written.
 * - **Money** — `{ amount, currency }` is two strings (SR-2). A value shaped like
 *   money whose amount is a number is refused here rather than hashed, because a
 *   float amount that reached the canonical form would be sworn to.
 *
 * ## What is refused
 *
 * A non-finite number is a `RangeError`. Everything else that has no canonical form
 * is a `TypeError`: `undefined` in an array position, a `bigint`, a function, a
 * symbol, a `Date` or `Map` or typed array (anything whose `Object.prototype.toString`
 * tag is not `[object Object]` or `[object Array]`), a cycle, and money with a
 * numeric amount. An audit form never guesses: a value it cannot write exactly is a
 * value it refuses to write at all.
 *
 * ## Integers beyond 2^53 (the documented limit of the rule)
 *
 * JSON numbers are IEEE 754 doubles by the time any implementation sees them, so
 * `9007199254740993` has already become `9007199254740992` in the parser, before the
 * canonical form is reached. This module therefore writes the shortest round-trip
 * decimal of the double it was given and **does not** convert large numbers to strings: a
 * canonical form cannot recover precision the parse already lost, and a form that
 * quietly restringified some numbers and not others would be harder to reimplement,
 * not easier. A host that needs exact integers beyond 2^53 — an account number, a
 * minor-unit amount, an accounting record's id — carries them as strings on the
 * wire. Money
 * already does, by SR-2.
 *
 * ## Runtime (RT-1)
 *
 * `canonicalHash` digests through `globalThis.crypto.subtle`, which has no
 * synchronous form, so every hash path in this framework is asynchronous end to end
 * — the stated portability choice, and the reason `canonicalHash` returns a
 * `Promise` on Node, on Bun and inside workerd alike. No `node:crypto`, no
 * filesystem, no Node global.
 *
 * @packageDocumentation
 */

import type { AmendmentMap } from "@affiant/contract";

import { MONEY_AMOUNT_PATTERN, MONEY_CURRENCY_PATTERN } from "./money.js";

// ---------------------------------------------------------------------------
// The input shape
// ---------------------------------------------------------------------------

/**
 * One field of the Affidavit, as much of it as canonicalization needs to know.
 *
 * Deliberately minimal. This module serializes *whatever object it is handed* —
 * every own enumerable property, at every depth — so it does not need the Affidavit
 * type to do its work, and stating a full one here would couple the canonical form
 * to a model that is still being written (`model/affidavit.ts`, pull request C2).
 * What it does need is the two properties amendment application reads: the `name`
 * an amendment is keyed by, and the `value` an amendment replaces. Everything else
 * on a real `AffidavitField` — `previousValue`, `provenance`, `isMandatory`,
 * `kind`, `allowedValues`, `pattern` — is carried through untouched and appears in
 * the bytes, because the bytes are of the object, not of this interface.
 */
export interface CanonicalField {
  /** The field's name. The key {@link AmendmentMap} is keyed by. */
  readonly name: string;
  /** The proposed value. Any JSON value, including `null`. */
  readonly value?: unknown;
  /** The provenance chain behind the value, if the caller carries one. */
  readonly provenance?: unknown;
}

/**
 * The Affidavit being canonicalized, as much of it as this module needs to know.
 *
 * `fields` is optional so the same function can canonicalize the byte vectors that
 * exercise the *form* — key ordering, number shapes, escaping — without dressing
 * them up as Affidavits. A real `Affidavit` from `@affiant/contract` satisfies this
 * interface structurally, and so will C2's core model.
 */
export interface CanonicalInput {
  /** The sworn fields, in the order the Affidavit carries them. */
  readonly fields?: readonly CanonicalField[];
}

/** Options for {@link canonicalize}, {@link canonicalString} and {@link canonicalHash}. */
export interface CanonicalizeOptions {
  /**
   * What the reviewer's act was: the id of the Docket decision that carried the
   * amendments. Required whenever a non-empty {@link AmendmentMap} is applied,
   * because PV-2 says a `reviewer-act` binding names the decision that amended the
   * field, and a binding that names nothing is not a binding.
   */
  readonly reviewerActRef?: string;
}

/**
 * The provenance tag an amendment mints: the reviewer's own act, bound to the
 * decision that carried it.
 *
 * `UserStated` because a reviewer typing a value *is* the person stating it — the
 * one place that source is legitimate (PV-3 forbids an implementation's own
 * inference from minting it).
 */
export interface ReviewerActTag {
  /** Always `"UserStated"`: a person stated this value. */
  readonly source: "UserStated";
  /** What to look at to check the act: the Docket decision that amended the field. */
  readonly binding: {
    /** Always `"reviewer-act"`. */
    readonly kind: "reviewer-act";
    /** The decision the amendment arrived on. */
    readonly ref: string;
  };
}

// ---------------------------------------------------------------------------
// Amendments
// ---------------------------------------------------------------------------

/**
 * The tag an amended field carries: `UserStated`, bound to the decision.
 *
 * Exported as one function on purpose. The **full** tag shape — the confidence, the
 * evidence line, the conversation turn — belongs to the core provenance model in
 * pull request C2, and the real `applyAmendments` lives there. This is the minimal
 * placeholder the canonical form is defined against, and it is the single place to
 * change when C2's shape lands; the byte vectors in `test/fixtures/canonical/` are
 * regenerated from that one edit. See {@link applyAmendmentsForCanonical} for why
 * the vectors are the authority and not this function.
 *
 * @param ref The Docket decision that carried the amendment.
 * @throws TypeError when `ref` is not a non-empty string (PV-2).
 */
export function reviewerActTag(ref: string): ReviewerActTag {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new TypeError(
      "PV-2: a reviewer-act binding names the Docket decision that amended the field; " +
        "applying amendments needs a non-empty reviewerActRef. A binding that names nothing " +
        "is not a binding.",
    );
  }
  return { source: "UserStated", binding: { kind: "reviewer-act", ref } };
}

/**
 * Apply an {@link AmendmentMap} to an Affidavit, returning a new object: each
 * amended field's `value` replaced, and a {@link reviewerActTag} put in force on
 * its provenance chain with the tag it supersedes preserved.
 *
 * **DK-2**: a `null` under a key clears that field's value; a key that is absent
 * leaves the field untouched. The two are never conflated — `null` is written into
 * the canonical bytes and changes the hash, exactly as any other amended value
 * does.
 *
 * **AF-4 / PV-2**: an amended field's provenance is the reviewer's act, never the
 * machine's pre-correction tag. So the new tag becomes `current` and the tag it
 * replaces moves to the head of the chain's history — nothing is discarded, and the
 * chain still reads newest first.
 *
 * **Why this function exists next to C2's `applyAmendments`.** SR-1 defines the
 * canonical form over "the Affidavit **and** its accepted amendments", and a
 * definition that could only be evaluated by calling another package's not-yet-
 * written function would not be a definition. So the form is defined here, and the
 * byte vectors in `test/fixtures/canonical/` pin the answer. The vectors — not this
 * code — are the authority: any implementation must produce those bytes whether it
 * applies the amendments **before** canonicalizing (the path a host takes, using
 * C2's `applyAmendments`, then calling {@link canonicalize} with no amendment
 * argument) or **during** (this path). A test in `test/canonical.test.ts` asserts
 * the two agree on every vector.
 *
 * @param affidavit        The Affidavit as filed.
 * @param amendments       The reviewer's accepted amendments, keyed by field name.
 * @param reviewerActRef   The Docket decision the amendments arrived on (PV-2).
 * @throws TypeError when the input carries no `fields` array, when a field is not
 *         an object, or when an amendment names a field the Affidavit does not
 *         carry — an amendment to something nobody swore to is a bug in the caller,
 *         and swallowing it would let two implementations disagree in silence.
 */
export function applyAmendmentsForCanonical(
  affidavit: CanonicalInput,
  amendments: AmendmentMap,
  reviewerActRef: string,
): CanonicalInput {
  const names = Object.keys(amendments);
  if (names.length === 0) return affidavit;

  const tag = reviewerActTag(reviewerActRef);
  const record = asRecord(affidavit, "the Affidavit");
  const fields = record["fields"];
  if (!Array.isArray(fields)) {
    throw new TypeError(
      "SR-1: amendments are applied per field, so the Affidavit must carry a fields array; " +
        `received ${describe(fields)} under "fields".`,
    );
  }

  const amended = new Set<string>();
  const nextFields = fields.map((field, index) => {
    const entry = asRecord(field, `fields[${String(index)}]`);
    const name = entry["name"];
    if (typeof name !== "string") return field;
    if (!Object.prototype.hasOwnProperty.call(amendments, name)) return field;
    amended.add(name);
    return {
      ...entry,
      value: amendments[name],
      provenance: withReviewerAct(entry["provenance"], tag),
    };
  });

  for (const name of names) {
    if (!amended.has(name)) {
      throw new TypeError(
        `DK-2: the amendment map names the field ${JSON.stringify(name)}, which this Affidavit ` +
          `does not carry. An amendment applies to a field that was sworn to; a key with no ` +
          `field is a caller bug, not an empty amendment.`,
      );
    }
  }

  return { ...record, fields: nextFields } as CanonicalInput;
}

/**
 * Put `tag` in force on a provenance chain, preserving the tag it supersedes.
 *
 * Two spellings of the history array are accepted — `prior`, which the protocol's
 * seed schemas and wire fixtures use, and `history`, which the core model's working
 * draft uses. A chain that carries neither gets `prior`, the spelling that is on
 * the wire today. Recognising both is not indecision: this module lands beside a
 * concurrently written model, and a canonical form that threw on the other
 * spelling would be a merge hazard rather than a rule.
 */
function withReviewerAct(chain: unknown, tag: ReviewerActTag): unknown {
  if (chain === null || chain === undefined) return { current: tag, prior: [] };
  const record = asRecord(chain, "provenance");
  const key =
    !Array.isArray(record["prior"]) && Array.isArray(record["history"]) ? "history" : "prior";
  const existing = record[key];
  const history = Array.isArray(existing) ? existing : [];
  const superseded = record["current"];
  return {
    ...record,
    current: tag,
    [key]: superseded === undefined ? [...history] : [superseded, ...history],
  };
}

// ---------------------------------------------------------------------------
// The public canonicalization entry points
// ---------------------------------------------------------------------------

/**
 * The canonical form of `affidavit` and its accepted `amendments`, as UTF-8 bytes
 * (SR-1).
 *
 * @param affidavit  The Affidavit as filed.
 * @param amendments The accepted amendments, or `null` / omitted for none. An empty
 *                   map is the same as none and needs no `reviewerActRef`.
 * @param options    {@link CanonicalizeOptions.reviewerActRef}, required whenever
 *                   `amendments` is non-empty.
 * @throws RangeError on a non-finite number; TypeError on anything else with no
 *         canonical form (see the module header).
 */
export function canonicalize(
  affidavit: CanonicalInput,
  amendments?: AmendmentMap | null,
  options?: CanonicalizeOptions,
): Uint8Array {
  return new TextEncoder().encode(canonicalString(affidavit, amendments, options));
}

/**
 * The canonical form of `affidavit` and its accepted `amendments`, as a string —
 * the same document {@link canonicalize} returns, before UTF-8 encoding.
 *
 * Useful where the bytes are not what is wanted: a fixture that has to be readable
 * in a diff, a log line, a comparison in a test. The bytes are the contract; this is
 * the same document one encoding step earlier.
 */
export function canonicalString(
  affidavit: CanonicalInput,
  amendments?: AmendmentMap | null,
  options?: CanonicalizeOptions,
): string {
  return canonicalJson(withAmendments(affidavit, amendments, options));
}

/**
 * The SHA-256 of the canonical form, as lowercase hex (SR-1, RT-1).
 *
 * Asynchronous on every runtime because Web Crypto has no synchronous digest, and
 * Web Crypto is the only digest a package that must run on Node, Bun and workerd
 * can reach (RT-1). This is a stated portability choice, not an oversight: the
 * .NET line may hash synchronously, since the conformance fixtures assert *values*,
 * not call shapes.
 *
 * @returns 64 lowercase hex characters.
 */
export async function canonicalHash(
  affidavit: CanonicalInput,
  amendments?: AmendmentMap | null,
  options?: CanonicalizeOptions,
): Promise<string> {
  return sha256Hex(canonicalize(affidavit, amendments, options));
}

/**
 * SHA-256 over arbitrary bytes, as lowercase hex, through Web Crypto (RT-1).
 *
 * Exported because the canonical form is not the only thing this framework hashes:
 * an `utterance-span` binding hashes the span it points at, so an auditor can
 * re-derive it, and a host's execution grant hashes what it grants over.
 *
 * @throws Error when the runtime exposes no `crypto.subtle` — which, on a runtime
 *         this package claims to support, means the host has replaced a standard
 *         global rather than that the digest is unavailable.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { readonly crypto?: Crypto }).crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(
      "RT-1: this package hashes through Web Crypto only (globalThis.crypto.subtle), which is " +
        "present on Node 22, Bun and workerd. There is no node:crypto fallback by design: a " +
        "synchronous fallback on one runtime would make the hash path synchronous there and " +
        "asynchronous everywhere else, and the contract is asynchronous end to end.",
    );
  }
  // Copied into a view this function owns: `digest` takes an ArrayBuffer-backed
  // source, and a caller's array may be backed by a SharedArrayBuffer another
  // thread can write to while the digest runs. A canonical form is small, and a
  // hash of bytes that changed underneath it would be worse than a copy.
  const digest = await subtle.digest("SHA-256", new Uint8Array(bytes));
  const view = new Uint8Array(digest);
  let hex = "";
  for (const byte of view) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Apply the amendments if there are any, refusing an amendment with no reviewer act. */
function withAmendments(
  affidavit: CanonicalInput,
  amendments: AmendmentMap | null | undefined,
  options: CanonicalizeOptions | undefined,
): CanonicalInput {
  if (amendments === null || amendments === undefined) return affidavit;
  if (Object.keys(amendments).length === 0) return affidavit;
  const ref = options?.reviewerActRef;
  if (ref === undefined) {
    throw new TypeError(
      "PV-2: applying amendments to the canonical form needs options.reviewerActRef — the id of " +
        "the Docket decision the amendments arrived on. The reviewer-act binding names that " +
        "decision, and a binding whose source cannot be checked is not a binding.",
    );
  }
  return applyAmendmentsForCanonical(affidavit, amendments, ref);
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

/**
 * The canonical form of any JSON value (SR-1), as a string.
 *
 * The general writer the Affidavit entry points are built on, exported because
 * SR-1's form is defined over JSON and not over one type: a binding, a grant
 * payload and a fixture all need the same bytes.
 *
 * **Numbers, and the one place this is stricter than RFC 8785.** The shortest
 * round-trip decimal for a value is what JavaScript's `Number#toString` produces,
 * and that is the form RFC 8785 (JSON Canonicalization Scheme) adopts wholesale —
 * exponent notation included, so `1e21` serializes as `1e+21`. This writer instead
 * writes every number **positionally**: `1000000000000000000000`, and `1e-7` as
 * `0.0000001`. The digits are the same digits; only the decimal point moves, so the
 * value denoted is identical and it parses back to the identical double. What is
 * bought is that a second implementation — in .NET, in Go, in a database function —
 * has to agree about *digits*, not about ECMAScript's exponent thresholds and its
 * `e+21` spelling, which is the part of RFC 8785 that needs an appendix. What is
 * paid is length: a denormal near `5e-324` writes out as roughly a thousand
 * characters. That is a bad number to have in an audit record for reasons that have
 * nothing to do with this function.
 *
 * "Positionally" means the **shortest round-trip digits** with the point moved, not
 * the double's exact binary value: `1.2345678901234569e23` is written
 * `123456789012345690000000`, not the exact `123456789012345685803008`. The two
 * parse to the same double, and SR-1 asks for the shortest round-trip form — so the
 * digits are the ones `Number#toString` chose, and nothing else.
 *
 * @throws RangeError on `NaN` or an infinity — a number with no decimal form at all.
 * @throws TypeError on a value with no canonical form (see the module header).
 */
export function canonicalJson(value: unknown): string {
  const out: string[] = [];
  writeValue(value, out, "", new Set<object>());
  return out.join("");
}

function writeValue(value: unknown, out: string[], path: string, open: Set<object>): void {
  if (value === null) {
    out.push("null");
    return;
  }
  if (typeof value === "boolean") {
    out.push(value ? "true" : "false");
    return;
  }
  if (typeof value === "string") {
    out.push(JSON.stringify(value));
    return;
  }
  if (typeof value === "number") {
    out.push(writeNumber(value, path));
    return;
  }
  if (typeof value === "undefined") {
    throw new TypeError(
      `SR-1: undefined has no canonical form and cannot be written at ${at(path)}. A property ` +
        `whose value is undefined is omitted; an undefined anywhere else is a caller bug.`,
    );
  }
  if (typeof value === "bigint") {
    throw new TypeError(
      `SR-1: a bigint has no JSON form, so none at ${at(path)}. Carry an integer beyond 2^53 as ` +
        `a string — see this module's header on why the canonical form does not restring numbers ` +
        `for you.`,
    );
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`SR-1: a ${typeof value} has no canonical form; found one at ${at(path)}.`);
  }

  if (open.has(value)) {
    throw new TypeError(
      `SR-1: the value contains a cycle, which reaches ${at(path)}. A canonical form is a finite ` +
        `document; an Affidavit is a tree.`,
    );
  }
  open.add(value);
  try {
    if (Array.isArray(value)) {
      writeArray(value, out, path, open);
    } else {
      writeObject(value, out, path, open);
    }
  } finally {
    open.delete(value);
  }
}

function writeArray(
  value: readonly unknown[],
  out: string[],
  path: string,
  open: Set<object>,
): void {
  out.push("[");
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) out.push(",");
    const element = value[index];
    const elementPath = `${path}/${String(index)}`;
    if (element === undefined) {
      throw new TypeError(
        `SR-1: undefined at ${at(elementPath)}. "Absent omitted" is a rule about properties; a ` +
          `position cannot be omitted without moving every element after it, and writing null ` +
          `instead would put a value on the record that the producer never wrote.`,
      );
    }
    writeValue(element, out, elementPath, open);
  }
  out.push("]");
}

function writeObject(value: object, out: string[], path: string, open: Set<object>): void {
  const tag = Object.prototype.toString.call(value);
  if (tag !== "[object Object]") {
    throw new TypeError(
      `SR-1: ${tag} has no canonical form; found one at ${at(path)}. The form is defined over ` +
        `JSON — objects, arrays, strings, numbers, booleans and null. A Date, a Map, a Set or a ` +
        `typed array is converted by the host before it is sworn to, so the record shows what the ` +
        `host meant rather than what a serializer guessed.`,
    );
  }
  const record = value as { readonly [key: string]: unknown };
  assertNotFloatMoney(record, path);

  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort(compareCodePoints);

  out.push("{");
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] as string;
    if (index > 0) out.push(",");
    out.push(JSON.stringify(key), ":");
    writeValue(record[key], out, `${path}/${key}`, open);
  }
  out.push("}");
}

/**
 * SR-2, enforced where it can be enforced without a schema.
 *
 * This writer sees JSON, not field types, so it cannot know which field is
 * monetary. What it can recognise is the money *shape*: an object carrying both
 * `amount` and `currency`, where `currency` already looks like an ISO 4217 code. In
 * that one case the amount must be a decimal string, and a number there is refused
 * rather than hashed — the whole point of SR-2 is that a float never becomes the
 * thing a reviewer swore to, and the canonical form is the last place to catch it.
 *
 * Narrow on purpose: an unrelated object that happens to carry an `amount` and a
 * `currency` that is not a three-letter uppercase code is left alone.
 */
function assertNotFloatMoney(record: { readonly [key: string]: unknown }, path: string): void {
  const currency = record["currency"];
  if (typeof currency !== "string" || !MONEY_CURRENCY_PATTERN.test(currency)) return;
  if (!Object.prototype.hasOwnProperty.call(record, "amount")) return;
  const amount = record["amount"];
  if (typeof amount === "string" && MONEY_AMOUNT_PATTERN.test(amount)) return;
  if (typeof amount === "number") {
    throw new TypeError(
      `SR-2: money at ${at(path)} carries a JSON number amount (${String(amount)}). Money on the ` +
        `wire is { amount: "<decimal string>", currency: "<ISO 4217>" }; a binary float cannot ` +
        `hold the amount a reviewer read, and the canonical form is what a grant binds to.`,
    );
  }
  throw new TypeError(
    `SR-2: money at ${at(path)} carries an amount that is not a decimal string ` +
      `(${describe(amount)}). Expected ${String(MONEY_AMOUNT_PATTERN)}: no exponent, no ` +
      `thousands separators, no leading "+".`,
  );
}

/**
 * The shortest round-trip decimal for `value`, written positionally.
 *
 * `String(n)` is the shortest decimal that parses back to `n` — the ECMAScript
 * `Number::toString` algorithm, identical on every conforming runtime. It uses
 * exponent notation above `1e21` and below `1e-6`; {@link expandExponent} moves the
 * decimal point back into place without touching a digit.
 */
function writeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `SR-1: ${String(value)} at ${at(path)} has no decimal form, so it has no canonical form. ` +
        `NaN and the infinities are not JSON numbers; a host that means "unknown" writes null.`,
    );
  }
  if (Object.is(value, -0)) return "0";
  return expandExponent(`${value}`);
}

/**
 * `"1e+21"` to `"1000000000000000000000"`, `"1.5e-9"` to `"0.0000000015"`; anything
 * without an exponent unchanged.
 *
 * Purely textual: the digits are the digits `Number#toString` produced, and only the
 * position of the decimal point changes, so the decimal value — and therefore the
 * double it parses back to — is untouched.
 */
function expandExponent(literal: string): string {
  const marker = literal.indexOf("e");
  if (marker === -1) return literal;

  const mantissa = literal.slice(0, marker);
  const exponent = Number.parseInt(literal.slice(marker + 1), 10);
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const point = unsigned.indexOf(".");
  const integerDigits = point === -1 ? unsigned : unsigned.slice(0, point);
  const fractionDigits = point === -1 ? "" : unsigned.slice(point + 1);
  const digits = integerDigits + fractionDigits;
  const pointAt = integerDigits.length + exponent;

  let written: string;
  if (pointAt <= 0) written = `0.${"0".repeat(-pointAt)}${digits}`;
  else if (pointAt >= digits.length) written = digits + "0".repeat(pointAt - digits.length);
  else written = `${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;

  return negative ? `-${written}` : written;
}

/**
 * Compare two strings by Unicode **code point**, which is what SR-1 says and what
 * JavaScript's `<` does not do.
 *
 * `<` compares UTF-16 code units, so a character above U+FFFF — an emoji, most of
 * the CJK extensions, every historic script — compares as its surrogate pair,
 * starting at U+D800, and sorts *before* U+E000 to U+FFFF instead of after. Every
 * key in a Latin-script Affidavit sorts identically either way, which is exactly
 * what makes this a trap: an implementation that used `<` would pass every test
 * anyone wrote until the day a key carried an emoji, and then two implementations
 * would hash the same Affidavit differently.
 *
 * Iterating a string yields code points, not code units, so the fix is to compare
 * what the iterator yields.
 */
function compareCodePoints(left: string, right: string): number {
  const leftPoints = left[Symbol.iterator]();
  const rightPoints = right[Symbol.iterator]();
  for (;;) {
    const a = leftPoints.next();
    const b = rightPoints.next();
    if (a.done === true) return b.done === true ? 0 : -1;
    if (b.done === true) return 1;
    const x = a.value.codePointAt(0) ?? 0;
    const y = b.value.codePointAt(0) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
}

/** Every own enumerable property of `value`, or a refusal naming where it was found. */
function asRecord(value: unknown, where: string): { readonly [key: string]: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`SR-1: expected ${where} to be an object; received ${describe(value)}.`);
  }
  return value as { readonly [key: string]: unknown };
}

/** A JSON-pointer-ish location for an error message; the root has no path. */
function at(path: string): string {
  return path === "" ? "the root value" : path;
}

/** A short, safe rendering of an arbitrary value for an error message. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    const text = value.length <= 60 ? value : `${value.slice(0, 57)}...`;
    return `the string ${JSON.stringify(text)}`;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${typeof value} ${String(value)}`;
  }
  if (Array.isArray(value)) return `an array of ${String(value.length)}`;
  return Object.prototype.toString.call(value);
}
