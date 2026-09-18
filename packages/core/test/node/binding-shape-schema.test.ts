import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { bindingShapeReason } from "../../src/model/binding-shape.js";

/**
 * The hand-written binding checker, held **equal to** the protocol's
 * `binding.schema.json` at the pinned ref.
 *
 * The checker is written by hand because this package is runtime-neutral (RT-1) and a
 * validator that compiles code at run time does not run on workerd. That buys a
 * portable check and costs a risk: two statements of the same rule that can drift
 * apart. This suite is what makes drifting apart impossible in silence — one corpus
 * of bindings, valid and invalid, every kind and every level the schema closes, run
 * through both, with every verdict required to match.
 *
 * Node and Bun, not workerd: it reads the vendored schema directory off disk and
 * compiles validators. `vitest.workers.config.ts` excludes `test/node/`.
 */
const schemaDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "contract",
  "protocol",
  "schemas",
);

const BINDING = "https://affiant.dev/schemas/0.1.0/binding.schema.json";

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to the
 * same function, and which of the two an ES module import lands on depends on the
 * runtime's CommonJS interop — this suite runs on Node and under Bun — so unwrap
 * whichever shape arrived.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

/** One Ajv holding every v0.1 schema, so a `$ref` resolves as it does in the lint. */
function validator(): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of readdirSync(schemaDir).sort()) {
    if (!name.endsWith(".schema.json")) continue;
    ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, name), "utf8")) as object);
  }
  return ajv.getSchema(BINDING) as ValidateFunction;
}

const AT = "2026-09-18T09:00:00.000Z";
const UUID = "6f9619ff-8b86-d011-b42d-00c04fc964ff";

/** One case: what it is called, and the object both readers are handed. */
interface Case {
  readonly name: string;
  readonly binding: unknown;
}

function valid(name: string, binding: unknown): Case {
  return { name: `valid — ${name}`, binding };
}

function invalid(name: string, binding: unknown): Case {
  return { name: `invalid — ${name}`, binding };
}

/**
 * The corpus. Every kind, both verdicts, and every level the schema closes: the
 * binding, its `ref`, and `ref.relay` and `ref.constant` inside it.
 *
 * `binding.schema.json` carries no `examples`, so there are none to fold in; if it
 * ever grows some, they belong here.
 */
const CASES: readonly Case[] = [
  // --- utterance-span ------------------------------------------------------
  valid("utterance-span, all three keys", {
    kind: "utterance-span",
    ref: { offset: 0, length: 6, hash: "sha256:abc" },
  }),
  valid("utterance-span, a span further in", {
    kind: "utterance-span",
    ref: { offset: 42, length: 1, hash: "x" },
  }),
  invalid("utterance-span missing hash", {
    kind: "utterance-span",
    ref: { offset: 0, length: 6 },
  }),
  invalid("utterance-span with a negative offset", {
    kind: "utterance-span",
    ref: { offset: -1, length: 6, hash: "x" },
  }),
  invalid("utterance-span with a fractional length", {
    kind: "utterance-span",
    ref: { offset: 0, length: 1.5, hash: "x" },
  }),
  invalid("utterance-span with an offset as a string", {
    kind: "utterance-span",
    ref: { offset: "0", length: 6, hash: "x" },
  }),
  invalid("utterance-span with an empty hash", {
    kind: "utterance-span",
    ref: { offset: 0, length: 6, hash: "" },
  }),
  invalid("utterance-span with an undeclared key in ref", {
    kind: "utterance-span",
    ref: { offset: 0, length: 6, hash: "x", turn: 2 },
  }),

  // --- reviewer-act --------------------------------------------------------
  valid("reviewer-act", { kind: "reviewer-act", ref: { entryId: UUID, decisionAt: AT } }),
  valid("reviewer-act with a non-UTC offset", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: "2026-09-18T14:30:00+05:30" },
  }),
  valid("reviewer-act at a leap second", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: "2026-09-18T23:59:60Z" },
  }),
  invalid("reviewer-act with an entryId that is not a UUID", {
    kind: "reviewer-act",
    ref: { entryId: "entry-1", decisionAt: AT },
  }),
  invalid("reviewer-act with a local time and no offset", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: "2026-09-18T09:00:00" },
  }),
  invalid("reviewer-act with a date that is not on the calendar", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: "2026-02-30T09:00:00Z" },
  }),
  invalid("reviewer-act with a date and no time", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: "2026-09-18" },
  }),
  invalid("reviewer-act missing decisionAt", { kind: "reviewer-act", ref: { entryId: UUID } }),
  invalid("reviewer-act with an undeclared key in ref", {
    kind: "reviewer-act",
    ref: { entryId: UUID, decisionAt: AT, reviewer: "member-1" },
  }),

  // --- form-input ----------------------------------------------------------
  valid("form-input", { kind: "form-input", ref: { field: "status" } }),
  invalid("form-input with an empty field name", { kind: "form-input", ref: { field: "" } }),
  invalid("form-input missing field", { kind: "form-input", ref: {} }),
  invalid("form-input with an undeclared key in ref", {
    kind: "form-input",
    ref: { field: "status", form: "invoice" },
  }),

  // --- external-ref --------------------------------------------------------
  valid("external-ref, the two required keys", {
    kind: "external-ref",
    ref: { system: "billing", recordId: "inv-1" },
  }),
  valid("external-ref with fetchedAt and contentHash", {
    kind: "external-ref",
    ref: { system: "billing", recordId: "inv-1", fetchedAt: AT, contentHash: "sha256:def" },
  }),
  valid("external-ref with a relay", {
    kind: "external-ref",
    ref: {
      system: "whatsapp",
      recordId: "wamid-1",
      relay: { principal: "relay-1", channelIdentity: "+94770000000", messageId: "wamid-1" },
    },
  }),
  invalid("external-ref missing recordId", { kind: "external-ref", ref: { system: "billing" } }),
  invalid("external-ref with an undeclared key in ref", {
    kind: "external-ref",
    ref: { system: "billing", recordId: "inv-1", sourceUrl: "https://example.test/inv-1" },
  }),
  invalid("external-ref with a fetchedAt that is not an instant", {
    kind: "external-ref",
    ref: { system: "billing", recordId: "inv-1", fetchedAt: "yesterday" },
  }),
  invalid("external-ref with an empty contentHash", {
    kind: "external-ref",
    ref: { system: "billing", recordId: "inv-1", contentHash: "" },
  }),
  invalid("external-ref with a relay missing messageId", {
    kind: "external-ref",
    ref: {
      system: "whatsapp",
      recordId: "wamid-1",
      relay: { principal: "relay-1", channelIdentity: "+94770000000" },
    },
  }),
  invalid("external-ref with an undeclared key in relay", {
    kind: "external-ref",
    ref: {
      system: "whatsapp",
      recordId: "wamid-1",
      relay: {
        principal: "relay-1",
        channelIdentity: "+94770000000",
        messageId: "wamid-1",
        verified: true,
      },
    },
  }),
  invalid("external-ref with a relay that is a string", {
    kind: "external-ref",
    ref: { system: "whatsapp", recordId: "wamid-1", relay: "relay-1" },
  }),

  // --- computation-ref -----------------------------------------------------
  valid("computation-ref with no inputs", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: [] },
  }),
  valid("computation-ref with inputs and a constant", {
    kind: "computation-ref",
    ref: {
      rule: "vat-2026",
      inputs: ["amount", "region"],
      constant: { source: "https://revenue.example/vat", verifiedOn: "2026-03-01" },
    },
  }),
  invalid("computation-ref missing rule", { kind: "computation-ref", ref: { inputs: ["amount"] } }),
  invalid("computation-ref missing inputs", {
    kind: "computation-ref",
    ref: { rule: "vat-2026" },
  }),
  invalid("computation-ref with inputs as a string", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: "amount" },
  }),
  invalid("computation-ref with a number among the inputs", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: ["amount", 2] },
  }),
  invalid("computation-ref with an empty input name", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: [""] },
  }),
  invalid("computation-ref with inputs null", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: null },
  }),
  invalid("computation-ref with a constant missing verifiedOn", {
    kind: "computation-ref",
    ref: { rule: "vat-2026", inputs: [], constant: { source: "https://revenue.example/vat" } },
  }),
  invalid("computation-ref with an undeclared key in constant", {
    kind: "computation-ref",
    ref: {
      rule: "vat-2026",
      inputs: [],
      constant: { source: "https://revenue.example/vat", verifiedOn: "2026-03-01", note: "rates" },
    },
  }),

  // --- the binding itself --------------------------------------------------
  invalid("a kind outside the five", { kind: "screenshot", ref: { url: "https://example.test" } }),
  invalid("a kind in the wrong case", {
    kind: "External-Ref",
    ref: { system: "billing", recordId: "inv-1" },
  }),
  invalid("no kind at all", { ref: { field: "status" } }),
  invalid("a kind that is not a string", { kind: 1, ref: { field: "status" } }),
  invalid("no ref", { kind: "form-input" }),
  invalid("an undeclared key beside kind and ref", {
    kind: "form-input",
    ref: { field: "status" },
    note: "typed by hand",
  }),
  invalid("a ref that is null", { kind: "form-input", ref: null }),
  invalid("a ref that is an array", { kind: "form-input", ref: [] }),
  invalid("a ref that is a string", { kind: "form-input", ref: "status" }),
  invalid("a binding that is null", null),
  invalid("a binding that is a string", "external-ref"),
  invalid("a binding that is an array", [{ kind: "form-input", ref: { field: "status" } }]),
  invalid("a binding that is a number", 7),
  invalid("an empty object", {}),
];

describe("the binding checker and the protocol's binding schema", () => {
  const validate = validator();

  it("has a corpus covering every kind, both verdicts and every closed level", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
    expect(CASES.some((one) => one.name.startsWith("valid"))).toBe(true);
    for (const kind of [
      "utterance-span",
      "reviewer-act",
      "form-input",
      "external-ref",
      "computation-ref",
    ]) {
      expect(CASES.some((one) => JSON.stringify(one.binding ?? null).includes(kind))).toBe(true);
    }
  });

  for (const one of CASES) {
    it(`agrees with the schema: ${one.name}`, () => {
      const bySchema = validate(one.binding) === true;
      const byChecker = bindingShapeReason(one.binding) === null;
      expect(byChecker).toBe(bySchema);
      // And the corpus says which verdict it expects, so a case that is wrong in both
      // readings is still caught.
      expect(bySchema).toBe(one.name.startsWith("valid"));
    });
  }
});
