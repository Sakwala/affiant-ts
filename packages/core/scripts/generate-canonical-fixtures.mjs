#!/usr/bin/env node
/**
 * Writes the SR-1 byte vectors, and mirrors them into a TypeScript module the
 * portable suites can import.
 *
 * Two outputs, from the scenarios declared in this file:
 *
 *   test/fixtures/canonical/*.json      the vectors — every property of each one,
 *                                       `input` included
 *   test/fixtures/canonical.generated.ts  the same vectors as a module
 *
 * **Why the inputs are built here rather than hand-authored.** They were
 * hand-authored once, and it went wrong: the seven vectors promoted at the
 * rulebook's `v0.1.0` described a *seed-shaped* record — `operationType`
 * `"WriteUpdate"`, `allowedValues` and `pattern` on the fields, `warnings` and
 * `requiresConfirmation` on the record, the superseded spelling `evidence` for a
 * tag's note, no `protocolVersion`, no `conversationTurn`, no `createdAt` — because
 * they were written before this implementation was aligned to the v0.1 wire, and
 * nothing checked them afterwards. `schemas/0.1.0/affidavit.schema.json` refuses
 * every one of those records. SR-1 defines the canonical form over the accepted
 * state of the Affidavit *as the schema defines it*, so a vector whose input is not
 * an Affidavit pins the bytes of a document the protocol does not have.
 *
 * So each scenario now names an operation, its fields and their provenance, and
 * this script builds the record through the aligned model — `buildAffidavit` and
 * then `toWire` — which is the same path a host's gate takes to produce the
 * Affidavit on a card. Whatever a v0.1 implementation serialises is what the vector
 * says, by construction rather than by transcription.
 *
 * **Why the expected values are written by the implementation.** A byte vector
 * somebody typed by hand is a transcription, and a transcription of 1,500 bytes of
 * canonical JSON is a typo waiting to be enshrined. So the implementation writes
 * them once, and an *independent* canonicalizer — a different algorithm, written
 * out in `test/canonical.test.ts` — has to agree on every vector, plus `sha256sum`
 * on the bytes in the Node-only suite. A vector is trustworthy because paths that
 * share no code produce it, not because it was typed carefully.
 *
 * **What stops the same class of defect coming back.**
 * `test/node/canonical-vector-schema.test.ts` validates every vector's `input`, and
 * the amended vector's `amendedInput`, against the vendored Affidavit schema, and
 * `test/node/canonical-vectors.test.ts` runs this script with `--check` so a
 * hand-edit to a vector file fails the build.
 *
 * Run after building the package, from `packages/core`:
 *
 *   pnpm build && pnpm generate:vectors
 *   pnpm build && node scripts/generate-canonical-fixtures.mjs --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAffidavit, toWire } from "../dist/model/affidavit.js";
import { applyAmendments } from "../dist/model/amendments.js";
import {
  applyAmendmentsForCanonical,
  canonicalHash,
  canonicalJson,
  canonicalString,
} from "../dist/model/canonical.js";
import { chainOf, merge, mintTag } from "../dist/model/provenance.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vectorDir = join(packageRoot, "test", "fixtures", "canonical");
const check = process.argv.includes("--check");

/** The instant every scenario's record is built at. Nothing here reads a clock. */
const AT = "2026-09-04T09:00:00.000Z";

/** The decision the amended vector's corrections arrived on (PV-2). */
const REVIEWER_ACT = {
  entryId: "8f14e45f-ceea-467e-bd76-000000000001",
  decisionAt: "2026-09-04T09:12:00.000Z",
  by: "ana",
};

/** `buildAffidavit` and then `toWire` — the record exactly as a v0.1 host emits it. */
function record(op, fields, meta) {
  return toWire(buildAffidavit(op, fields, meta));
}

// ---------------------------------------------------------------------------
// The seed-derived card, and the state a reviewer's amendments accept
// ---------------------------------------------------------------------------

/**
 * The proposal behind the protocol's seed fixture `wire/evidence-card-request`,
 * expressed as the v0.1 record.
 *
 * Built once and used by two vectors, so the amended vector is demonstrably the
 * same proposal with corrections on it rather than a second transcription of it.
 */
const seedCardAffidavit = record(
  { kind: "update", entityType: "Widget", entityId: "W-1", fields: ["Status", "Weight"] },
  [
    {
      name: "Status",
      kind: "enum",
      value: "Active",
      previousValue: null,
      isMandatory: true,
      // Unbound on purpose: the seed claimed `UserStated` with nothing to point at,
      // and v0.1 records that as `binding: null` rather than quietly downgrading the
      // grade (PV-5).
      provenance: chainOf(
        mintTag({
          source: "UserStated",
          confidence: 1,
          note: "User stated: Status",
          at: AT,
          conversationTurn: null,
        }),
      ),
    },
    {
      name: "Weight",
      kind: "number",
      value: 12.5,
      previousValue: 10,
      isMandatory: false,
      provenance: chainOf(
        mintTag({
          source: "Conversation",
          confidence: 0.9,
          note: "Extracted from search_widget",
          at: AT,
          conversationTurn: 3,
        }),
      ),
    },
  ],
  { createdAt: AT, conversationTurn: 3 },
);

const seedCardAmendments = { Status: "Retired", Weight: null };

// ---------------------------------------------------------------------------
// The scenarios
// ---------------------------------------------------------------------------

/**
 * The seven vectors, in file order. Each names the file it is written to, the rules
 * it checks, what it is for, and the record it canonicalises.
 *
 * `amendments` and `reviewerAct` are `null` where there are none. `amendedInput` is
 * present only on a vector that carries amendments: it is the accepted state those
 * amendments produce — the document the canonical bytes are actually taken over —
 * written down so that it, too, can be held against the Affidavit schema.
 */
const scenarios = [
  {
    file: "01-create-shaped.json",
    id: "canonical/create-shaped",
    rules: ["SR-1", "AF-1", "AF-3"],
    note:
      "A create-shaped Affidavit: entityId null, previousValue null on every field (AF-3), one " +
      "field left with no provenance so the record carries an `Empty` tag at confidence 0 rather " +
      "than omitting the field (AF-1). The three numbers are AF-2's: the aggregate is 0 because " +
      "one proposed field is `Empty`, the populated minimum is 0.9 over the field that is not, " +
      "and one field is counted empty. The canonical bytes sort every key by code point at every " +
      "level, so `aggregateConfidence` precedes `conversationTurn` precedes `createdAt` " +
      "regardless of the order `toWire` emits them in.",
    input: record(
      { kind: "create", entityType: "Widget", entityId: null, fields: ["Status", "Owner"] },
      [
        {
          name: "Status",
          kind: "enum",
          value: "Active",
          isMandatory: true,
          provenance: chainOf(
            mintTag({
              source: "Conversation",
              confidence: 0.9,
              note: "Extracted from the turn",
              at: AT,
              conversationTurn: 1,
            }),
          ),
        },
        // No `provenance`: AF-1's first half, and the reason the record shows an
        // `Empty` tag here rather than nothing.
        { name: "Owner", kind: "text", value: null, isMandatory: false },
      ],
      { createdAt: AT, conversationTurn: 1 },
    ),
    amendments: null,
    reviewerAct: null,
  },
  {
    file: "02-update-shaped.json",
    id: "canonical/update-shaped",
    rules: ["SR-1", "AF-3", "PV-1"],
    note:
      "An update-shaped Affidavit: entityId set, a previousValue on every proposed field, one of " +
      "them null because the field had no stored value (AF-3). `DueDate`'s chain was merged " +
      "rather than minted, so a superseded `Inferred` tag sits in `prior` behind the " +
      "`Conversation` tag that beat it (PV-1) — which pins that array order is data and is never " +
      "sorted. The two bound tags carry the v0.1 binding shapes: an `external-ref` naming a " +
      "system and a record within it, and a `computation-ref` naming a re-runnable rule and what " +
      "it consumed. `null` is written; a property whose value is undefined is omitted, which no " +
      "JSON file can express — `test/canonical.test.ts` covers that half.",
    input: record(
      {
        kind: "update",
        entityType: "Invoice",
        entityId: "INV-2026-0044",
        fields: ["DueDate", "Reference", "Total"],
      },
      [
        {
          name: "DueDate",
          kind: "date",
          value: "2026-10-01",
          previousValue: "2026-09-15",
          isMandatory: true,
          provenance: merge(
            chainOf(
              mintTag({
                source: "Inferred",
                confidence: 0.4,
                note: "Guessed from the payment terms",
                at: AT,
                conversationTurn: 4,
              }),
            ),
            mintTag({
              source: "Conversation",
              confidence: 0.82,
              note: "Extracted from the turn",
              at: AT,
              conversationTurn: 4,
            }),
          ),
        },
        {
          name: "Reference",
          kind: "text",
          value: "PO-77",
          previousValue: null,
          isMandatory: false,
          provenance: chainOf(
            mintTag({
              source: "External",
              confidence: 1,
              note: "Read from the purchase-order system",
              at: AT,
              conversationTurn: null,
              binding: {
                kind: "external-ref",
                ref: { system: "erp", recordId: "purchase-order/77" },
              },
            }),
          ),
        },
        {
          name: "Total",
          kind: "number",
          value: { amount: "4000.10", currency: "GBP" },
          previousValue: { amount: "40.00", currency: "GBP" },
          isMandatory: true,
          provenance: chainOf(
            mintTag({
              source: "Computed",
              confidence: 1,
              note: "Sum of the line items",
              at: AT,
              conversationTurn: null,
              binding: {
                kind: "computation-ref",
                ref: { rule: "invoice.total@v3", inputs: ["LineItems"] },
              },
            }),
          ),
        },
      ],
      { createdAt: AT, conversationTurn: 4 },
    ),
    amendments: null,
    reviewerAct: null,
  },
  {
    file: "03-wire-evidence-card-request.json",
    id: "canonical/wire-evidence-card-request",
    rules: ["SR-1", "SR-3"],
    note:
      "The proposal behind the protocol seed fixture `wire/evidence-card-request` " +
      "(Sakwala/affiant-protocol), as the v0.1 record. The same two fields, the same values and " +
      "the same grades; what changed is where they live. `allowedValues` and `pattern` are gone " +
      "from the fields — v0.1 puts a reviewer surface's rendering hints on the card envelope, " +
      "because nothing swears to them and a hash a grant is checked against must not move when " +
      "an input is restyled (SR-3). `warnings` and `requiresConfirmation` are gone for the same " +
      "reason. `confidence: 1.0` in the seed file is the JSON number 1 after parsing and " +
      "serializes as `1` — a canonical form has one spelling per value. The seed's " +
      "`aggregateConfidence` of 0.95 was the mean the shipped .NET projection computes; AF-2 " +
      "makes it the minimum, so this record reads 0.9.",
    input: seedCardAffidavit,
    amendments: null,
    reviewerAct: null,
  },
  {
    file: "04-wire-evidence-card-request-amended.json",
    id: "canonical/wire-evidence-card-request-amended",
    rules: ["SR-1", "AF-1", "AF-2", "AF-4", "DK-2", "PV-2"],
    note:
      "The same Affidavit as `canonical/wire-evidence-card-request`, with a reviewer's accepted " +
      "amendments applied: `Status` changed to Retired, `Weight` cleared with an explicit null " +
      "(DK-2 — null clears, an absent key leaves untouched). The bytes and the hash differ from " +
      "the unamended vector, and that difference is the point: an execution grant minted for the " +
      "proposal a reviewer was shown must not validate the proposal they amended.\n\n" +
      "`amendedInput` is the accepted state those amendments produce — the document the bytes " +
      "below are actually taken over. It is written down rather than left implicit because SR-1 " +
      "defines the canonical form over the accepted state *as the Affidavit schema defines it*, " +
      "and a state nobody can hold against the schema is a state nobody has checked. It is " +
      "produced by the model, not typed: the same `amendmentTag` a Docket row's accepted state " +
      "is written with, so the bytes a decision produces and the row that decision writes cannot " +
      "disagree.\n\n" +
      "Four things to see in it. (1) The tag in force is a whole provenance tag — source, " +
      "confidence, the note naming who amended the field, the instant of the decision, the " +
      "conversation turn, and a `reviewer-act` binding naming the decision *and when it was " +
      "made*. PV-2's binding is the pointer an auditor follows years later, and a pointer that " +
      "cannot say when the act happened cannot place it against the proposal's own instants. " +
      "(2) The displaced machine tag is preserved beneath it in `prior`, so a card can still " +
      "show what was proposed. (3) `Weight` is gone from `fields[]` rather than present holding " +
      "null: it is optional, and a reviewer clearing an optional field is saying the write no " +
      "longer proposes it; AF-1 says a field the operation does not propose is absent rather " +
      "than present with nothing in it. A mandatory field cleared the same way would stay, " +
      "tagged `Empty` at confidence 0. (4) All three confidence numbers are recomputed over what " +
      "is left (AF-4), not carried over from the proposal — an accepted state whose only field " +
      "is sworn at 1 while `populatedConfidence` still read the machine's pre-correction 0.9 " +
      "would contradict itself, and those are the bytes a grant binds to.",
    input: seedCardAffidavit,
    amendments: seedCardAmendments,
    reviewerAct: REVIEWER_ACT,
  },
  {
    file: "05-key-order-stress.json",
    id: "canonical/key-order-stress",
    rules: ["SR-1"],
    note:
      "An Affidavit whose one field carries, as its value, every key-ordering case a naive " +
      "comparator gets wrong — written in reverse order at every level. U+E000 (private use) " +
      "must sort BEFORE U+1F600 (an emoji) because SR-1 sorts by Unicode code point and 0xE000 < " +
      "0x1F600; a comparator using JavaScript's < compares UTF-16 code units, sees the emoji's " +
      "leading surrogate 0xD83D, and puts the emoji first. Also here: an integer-shaped key " +
      "(JavaScript reorders those to the front of Object.keys on its own), a precomposed e-acute " +
      "against the same letter decomposed (two distinct keys, never normalized), a key that is a " +
      "prefix of another, keys differing only by case, the empty key, and a key carrying a " +
      "solidus, which JSON escaping must not touch. The record's own keys are sorted by the same " +
      "rule at the top level, where `toWire` emits them in a different order from the one they " +
      "are written in. `kind` is a rendering hint and never constrains a value, which is why a " +
      "field of kind `text` may carry an object.",
    input: record(
      { kind: "create", entityType: "Widget", entityId: null, fields: ["Payload"] },
      [
        {
          name: "Payload",
          kind: "text",
          value: {
            zeta: {
              2: "another integer-shaped key",
              10: "integer-shaped key",
              "\u{1f600}": "emoji key, U+1F600",
              "\ue000": "private use, U+E000",
              "\u00e9": "e-acute precomposed, U+00E9",
              "e\u0301": "e plus combining acute, U+0065 U+0301",
              ab: "prefix plus one",
              a: "prefix",
              B: "uppercase B",
              b: "lowercase b",
              A: "uppercase A",
              "": "the empty key",
              "a/b": "a solidus, which JSON never escapes",
            },
            middle: [
              { second: 2, first: 1 },
              { b: [3, 2, 1], a: { y: null, x: true } },
            ],
            alpha: "written last, sorts first",
          },
          isMandatory: true,
          provenance: chainOf(
            mintTag({
              source: "Conversation",
              confidence: 0.5,
              note: "Taken verbatim from the turn",
              at: AT,
              conversationTurn: null,
            }),
          ),
        },
      ],
      { createdAt: AT, conversationTurn: null },
    ),
    amendments: null,
    reviewerAct: null,
  },
  {
    file: "06-number-forms.json",
    id: "canonical/number-forms",
    rules: ["SR-1"],
    note:
      "An Affidavit whose one field carries every number form the rule has to decide. `1.0` is " +
      "the number 1 once parsed and is written `1` — a canonical form has one spelling per " +
      "value. `1e21` is written positionally, not as `1e+21`: SR-1 says shortest round-trip " +
      "decimal, and this implementation writes those digits with the decimal point in place " +
      "rather than adopting ECMAScript's exponent thresholds, so a second implementation has to " +
      "agree about digits and not about a spelling. `0.1 + 0.2` is the double " +
      "0.30000000000000004 and is written with all of it; rounding it would be the framework " +
      "deciding what was sworn to. `9007199254740993` is already the double 9007199254740992 by " +
      "the time this function sees it — the parser rounded it, and the canonical bytes below say " +
      "so; no canonical form can recover a digit the parse threw away; a host that needs exact " +
      "integers beyond 2^53 carries them as strings, as money already does (SR-2). Two forms are " +
      "deliberately NOT in this file: a negative zero, because JSON parsers disagree about " +
      "whether they preserve the sign and a vector must mean the same thing to every " +
      "implementation that reads it, and the non-finite numbers, which JSON cannot spell at all. " +
      "`test/canonical.test.ts` covers both — that `-0` is written `0`, and that NaN and the " +
      "infinities raise a RangeError.",
    input: record(
      { kind: "create", entityType: "Widget", entityId: null, fields: ["Measurements"] },
      [
        {
          name: "Measurements",
          kind: "number",
          value: {
            one: 1,
            integer: 42,
            negativeInteger: -17,
            half: 0.5,
            sumOfTenths: 0.1 + 0.2,
            exp21: 1e21,
            exp23: 1.2345678901234569e23,
            beyond2p53: 9007199254740993,
            tiny: 1e-7,
            tinier: 1.5e-9,
            negativeTiny: -1.2345e-8,
            nested: [0, -0.5, 0.000001, 0.00001, 1000000, 1e20],
          },
          isMandatory: true,
          provenance: chainOf(
            mintTag({
              source: "Computed",
              confidence: 1,
              note: "Read off the instrument",
              at: AT,
              conversationTurn: null,
              binding: {
                kind: "computation-ref",
                ref: { rule: "instrument.readings@v1", inputs: [] },
              },
            }),
          ),
        },
      ],
      { createdAt: AT, conversationTurn: null },
    ),
    amendments: null,
    reviewerAct: null,
  },
  {
    file: "07-money-and-escapes.json",
    id: "canonical/money-and-escapes",
    rules: ["SR-1", "SR-2"],
    note:
      "Money as two strings, never a number (SR-2): a GBP amount with cents a float would lose, " +
      "a JPY amount with no minor units, a negative amount, and an amount far beyond what a " +
      "double can hold. Alongside them the string rules: only what JSON requires is escaped, so " +
      "a quote, a backslash and the C0 controls are escaped (with the two-character forms where " +
      "JSON has them, lowercase u-escapes otherwise) while every non-ASCII character is written " +
      "as itself and encoded as UTF-8 — an e-acute is two bytes, not six — and a solidus is " +
      "never escaped. The escaping rules apply to keys and to values alike, which is why the " +
      "note on one tag carries a quote of its own.",
    input: record(
      {
        kind: "update",
        entityType: "Invoice",
        entityId: "INV-2026-0045",
        fields: ["Total", "Refund", "Ceiling", "Memo"],
      },
      [
        {
          name: "Total",
          kind: "number",
          value: { amount: "4000.10", currency: "GBP" },
          previousValue: { amount: "0", currency: "GBP" },
          isMandatory: true,
          provenance: chainOf(
            mintTag({
              source: "Computed",
              confidence: 1,
              note: "Sum of the line items",
              at: AT,
              conversationTurn: null,
              binding: {
                kind: "computation-ref",
                ref: { rule: "invoice.total@v3", inputs: ["LineItems"] },
              },
            }),
          ),
        },
        {
          name: "Refund",
          kind: "number",
          value: { currency: "JPY", amount: "-1250" },
          previousValue: null,
          isMandatory: false,
          provenance: chainOf(
            mintTag({
              source: "UserStated",
              confidence: 1,
              note: 'Reviewer typed it into the "Refund" box',
              at: AT,
              conversationTurn: null,
              binding: { kind: "form-input", ref: { field: "Refund" } },
            }),
          ),
        },
        {
          name: "Ceiling",
          kind: "number",
          value: { amount: "123456789012345678901234567890.99", currency: "LKR" },
          previousValue: null,
          isMandatory: false,
          provenance: chainOf(
            mintTag({
              source: "External",
              confidence: 1,
              note: "Read from the ledger",
              at: AT,
              conversationTurn: null,
              binding: { kind: "external-ref", ref: { system: "ledger", recordId: "limit/9" } },
            }),
          ),
        },
        {
          name: "Memo",
          kind: "text",
          value:
            'quote " backslash \\ tab \t newline \n cr \r backspace \b formfeed \f nul \u0000 ' +
            "unit-separator \u001f solidus a/b accented éüñ script " +
            "日本語 emoji \u{1f600} private-use \ue000",
          previousValue: null,
          isMandatory: false,
          provenance: chainOf(
            mintTag({
              source: "Conversation",
              confidence: 0.7,
              note: "Taken verbatim from the turn",
              at: AT,
              conversationTurn: 2,
            }),
          ),
        },
      ],
      { createdAt: AT, conversationTurn: 2 },
    ),
    amendments: null,
    reviewerAct: null,
  },
];

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const vectors = [];
const differences = [];

for (const scenario of scenarios) {
  const { file, id, rules, note, input, amendments, reviewerAct } = scenario;
  const options = reviewerAct === null ? undefined : { reviewerAct };

  const vector = { id, rules, note, input, amendments, reviewerAct };

  if (amendments !== null) {
    // The accepted state, written down. Produced twice by paths that share nothing
    // but `amendmentTag`, and refused here if they disagree: the core model's own
    // `applyAmendments` — the one a Docket row's accepted state is written with —
    // and the serializer's, which is what the bytes below are taken over.
    const accepted = applyAmendmentsForCanonical(input, amendments, reviewerAct);
    const throughTheModel = toWire(
      applyAmendments(fromWireRecord(input), amendments, reviewerAct),
      input.protocolVersion,
    );
    if (canonicalJson(accepted) !== canonicalJson(throughTheModel)) {
      throw new Error(
        `${id}: the canonical serializer and the core model disagree about the accepted state. ` +
          `Both must call amendmentTag and recompute the same numbers; a difference here is the ` +
          `finding, not something to write down.\n` +
          `  serializer: ${canonicalJson(accepted)}\n` +
          `  model:      ${canonicalJson(throughTheModel)}`,
      );
    }
    vector.amendedInput = accepted;
  }

  vector.expectedBytesUtf8 = canonicalString(input, amendments, options);
  vector.expectedSha256 = await canonicalHash(input, amendments, options);

  const contents = `${literal(vector, "", { json: true })}\n`;
  const path = join(vectorDir, file);

  let existing = null;
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    // not written yet
  }
  if (existing !== contents) {
    differences.push(existing === null ? `added   ${file}` : `updated ${file}`);
    if (!check) writeFileSync(path, contents);
  }

  vectors.push({ file, vector });
}

/**
 * A wire Affidavit read back into the core model, for the cross-check above.
 *
 * `fromWire` would do it, but it needs the whole `@affiant/contract` type surface;
 * this script only needs the record it just built, whose `createdAt` and
 * `conversationTurn` it already knows.
 */
function fromWireRecord(wire) {
  const op =
    wire.entityId === null
      ? {
          kind: "create",
          entityType: wire.entityType,
          entityId: null,
          fields: wire.fields.map((field) => field.name),
        }
      : {
          kind: "update",
          entityType: wire.entityType,
          entityId: wire.entityId,
          fields: wire.fields.map((field) => field.name),
        };
  return buildAffidavit(op, wire.fields, {
    createdAt: wire.createdAt,
    conversationTurn: wire.conversationTurn,
  });
}

/**
 * A TypeScript object-literal expression for a JSON value — or, with
 * `{ json: true }`, a JSON document.
 *
 * `JSON.stringify` would nearly do, but it writes `-0` as `0`, and a number's sign
 * is one of the things these vectors are about. Losing it would leave the file and
 * the module testing a different input from the one the vector is about, and the
 * loss would be invisible in a diff. The only differences between the two modes are
 * the separator after a key and the trailing comma TypeScript allows and JSON does
 * not.
 */
function literal(value, indent, options = {}) {
  const json = options.json === true;
  const tail = json ? "" : ",";
  if (value === null) return "null";
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${inner}${literal(item, inner, options)}`);
    return `[\n${items.join(",\n")}${tail}\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const entries = keys.map(
    (key) => `${inner}${JSON.stringify(key)}: ${literal(value[key], inner, options)}`,
  );
  return `{\n${entries.join(",\n")}${tail}\n${indent}}`;
}

const module = `// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-canonical-fixtures.mjs, which also writes
// test/fixtures/canonical/*.json. The JSON files are the record a conformance driver
// reads; this module is how the suites read them on Node, Bun and workerd alike. To
// change a vector: edit the scenario in the generator, then run
// \`pnpm build && pnpm generate:vectors\` from packages/core.

/**
 * One SR-1 byte vector: an input, the amendments accepted on it, and the canonical
 * form and SHA-256 those two produce.
 */
export interface CanonicalVector {
  /** The vector's id, matching the \`id\` in its JSON file. */
  readonly id: string;
  /** The rule ids this vector checks. */
  readonly rules: readonly string[];
  /** What the vector is for, and which trap it sets. */
  readonly note: string;
  /**
   * The Affidavit, as a v0.1 implementation serialises it. Typed \`unknown\` because
   * a fixture is data: a suite narrows it to the shape that suite is about, and no
   * declaration here can be right for all seven.
   */
  readonly input: unknown;
  /** The accepted amendments, or \`null\` for none. */
  readonly amendments: { readonly [fieldName: string]: unknown } | null;
  /**
   * The decision the amendments arrived on — its entry, its instant and its
   * principal (PV-2) — or \`null\` where there are no amendments.
   */
  readonly reviewerAct: {
    readonly entryId: string;
    readonly decisionAt: string;
    readonly by: string;
  } | null;
  /**
   * The accepted state the amendments produce — the Affidavit the canonical form is
   * actually taken over (SR-1). Present only on a vector that carries amendments.
   */
  readonly amendedInput?: unknown;
  /** The canonical form as a string - the bytes before UTF-8 encoding. */
  readonly expectedBytesUtf8: string;
  /** The SHA-256 of the UTF-8 bytes, lowercase hex. */
  readonly expectedSha256: string;
}

/** Every vector, in file order. */
export const canonicalVectors: readonly CanonicalVector[] = [
${vectors.map(({ file, vector }) => `  // ${file}\n  ${literal(vector, "  ")}`).join(",\n")},
];

/** A vector by id, for a test that names one. */
export function canonicalVector(id: string): CanonicalVector {
  const found = canonicalVectors.find((vector) => vector.id === id);
  if (found === undefined) throw new Error(\`no canonical vector with id \${JSON.stringify(id)}\`);
  return found;
}
`;

const modulePath = join(packageRoot, "test", "fixtures", "canonical.generated.ts");
let existingModule = null;
try {
  existingModule = readFileSync(modulePath, "utf8");
} catch {
  // not written yet
}
if (existingModule !== module) {
  differences.push(
    existingModule === null ? "added   canonical.generated.ts" : "updated canonical.generated.ts",
  );
  if (!check) writeFileSync(modulePath, module);
}

if (check) {
  if (differences.length === 0) {
    console.log(`canonical vectors: ${String(vectors.length)} file(s) and the module are current`);
  } else {
    console.error("--check: the committed vectors differ from what the implementation produces:");
    for (const line of differences) console.error(`  ${line}`);
    console.error(
      "\nA vector is written by the implementation, never by hand. Run " +
        "`pnpm build && pnpm generate:vectors` from packages/core and commit the result.",
    );
    process.exit(1);
  }
} else {
  console.log(
    `canonical vectors: wrote ${String(vectors.length)} file(s) and mirrored them into ` +
      `test/fixtures/canonical.generated.ts` +
      (differences.length === 0
        ? " (nothing changed)"
        : ` (${String(differences.length)} change(s))`),
  );
}
