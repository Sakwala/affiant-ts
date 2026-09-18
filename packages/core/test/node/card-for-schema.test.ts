import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import type { DocketEntry } from "../../src/docket/entry.js";
import { cardFor } from "../../src/gate/card.js";
import type { EvidenceCardRequest, PreparedField } from "../../src/gate/pipeline.js";
import { chainOf, mintConversation } from "../../src/model/provenance.js";
import type { FieldSchema } from "../../src/ports.js";
import { AT, harness, plus, policyReturning, turnContext, type Harness } from "../gate-support.js";

/**
 * Every card `cardFor` builds, held against the rulebook's Evidence Card envelope
 * schema at the pinned protocol ref.
 *
 * A card that a reviewer surface cannot read is not a card, and the envelope is the
 * one part of this producer's output that another implementation also has to accept.
 * So the shapes are checked against the schema itself rather than against a
 * hand-written expectation: a row in each status, with and without the host's
 * optional rendering hints, blocked and unblocked.
 *
 * Node and Bun, not workerd: it reads the vendored schema directory off disk and
 * compiles validators, which is not a thing a Worker does.
 * `vitest.workers.config.ts` excludes `test/node/`.
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

const CARD = "https://affiant.dev/schemas/0.1.0/evidence-card-request.schema.json";

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to
 * the same function, and which of the two an ES module import lands on depends on
 * the runtime's CommonJS interop — this suite runs on Node and under Bun — so
 * unwrap whichever shape arrived.
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
  const validate = ajv.getSchema(CARD);
  if (validate === undefined) {
    throw new Error(`the vendored schema directory carries no ${CARD}`);
  }
  return validate;
}

/** The schema's own complaints, as one line, so a failure names the property. */
function why(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim())
    .join("; ");
}

const FIELDS = ["status", "amount", "note"] as const;

/** A field schema with something to render: a closed set and a mask (SR-1). */
const SCHEMA: FieldSchema = {
  entityType: "Invoice",
  fields: [
    {
      name: "status",
      kind: "enum",
      description: "The status",
      required: false,
      allowedValues: ["Active", "Retired"],
      pattern: null,
    },
    {
      name: "amount",
      kind: "number",
      description: "The amount",
      required: false,
      allowedValues: null,
      pattern: "^[0-9]+$",
    },
  ],
};

/** One host-tagged field, so the substance gate has something to admit (GT-3). */
function prepared(name: string, value: string): PreparedField {
  return {
    name,
    kind: "text",
    value,
    provenance: chainOf(
      mintConversation({ confidence: 0.9, at: AT, note: `Stated: ${name}`, conversationTurn: 1 }),
    ),
    isMandatory: false,
  };
}

/** File one entry through the gate's Sequence C entry point. */
async function fileOne(h: Harness): Promise<DocketEntry> {
  const filed = await h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: [...FIELDS],
      },
      toolName: "update_invoice",
      fields: [prepared("status", "Active"), prepared("amount", "40"), prepared("note", "kept")],
      args: null,
      schema: SCHEMA,
      operationLabel: "Reprice",
    },
    turnContext(),
  );
  return filed.entry;
}

/** Every card this suite checks, built from a row a real gate filed. */
async function cards(): Promise<{ readonly [name: string]: EvidenceCardRequest }> {
  const built: Record<string, EvidenceCardRequest> = {};

  const plain = harness({ defaultTtlMs: 60_000 });
  const pending = await fileOne(plain);
  built["pending, with the host's hints"] = cardFor(pending, {
    now: AT,
    schema: SCHEMA,
    operationLabel: "Reprice",
  });
  built["pending, with nothing the host did not swear to"] = cardFor(pending, { now: AT });
  built["pending, read after its deadline"] = cardFor(pending, {
    now: plus(pending.expiresAt, 1),
  });

  const approved = await plain.gate.decide(
    pending.entryId,
    { kind: "approve", amendments: { amount: "4000", note: null } },
    turnContext(),
  );
  built["approved, amended"] = cardFor(approved, { now: AT, schema: SCHEMA });

  const rejecting = harness({ defaultTtlMs: 60_000 });
  const toReject = await fileOne(rejecting);
  const rejected = await rejecting.gate.decide(
    toReject.entryId,
    { kind: "reject", reason: "not this quarter" },
    turnContext(),
  );
  built["rejected"] = cardFor(rejected, { now: AT, schema: SCHEMA });

  const standing = harness({ policies: [policyReturning({ requirement: "StandingOrder" })] });
  built["approved by a Standing Order"] = cardFor(await fileOne(standing), {
    now: AT,
    schema: SCHEMA,
  });

  const multiParty = harness({ policies: [policyReturning({ requirement: "MultiParty" })] });
  built["blocked: a requirement this version does not run"] = cardFor(await fileOne(multiParty), {
    now: AT,
    schema: SCHEMA,
  });

  const uncovered = harness({ uncovered: [["update_invoice", "no-execute"]] });
  built["blocked: a tool the host declared uncovered"] = cardFor(await fileOne(uncovered), {
    now: AT,
    schema: SCHEMA,
  });

  const resubmitting = harness({ defaultTtlMs: 60_000 });
  const original = await fileOne(resubmitting);
  resubmitting.clock.set(plus(AT, 90_000));
  await resubmitting.gate
    .decide(original.entryId, { kind: "approve", amendments: { amount: "4000" } }, turnContext())
    .catch(() => null);
  const fresh = await resubmitting.gate.resubmit(original.entryId, turnContext());
  const superseded = await resubmitting.gate.get(original.entryId, turnContext());
  if (superseded === null) throw new Error("the superseded entry disappeared");
  built["a resubmission, carrying the prior amendments"] = cardFor(fresh.entry, {
    now: resubmitting.clock.now(),
    superseded,
  });

  return built;
}

describe("cardFor builds a v0.1 Evidence Card envelope", async () => {
  const validate = validator();
  const built = await cards();

  for (const [name, card] of Object.entries(built)) {
    it(`${name}: validates against the envelope schema`, () => {
      const valid = validate(JSON.parse(JSON.stringify(card)) as unknown);

      expect(valid, `${name}: ${why(validate)}`).toBe(true);
    });
  }

  it("refuses an envelope missing a required property", () => {
    // The negative half: a suite that only ever validated good documents would pass
    // just as happily against a validator that had stopped refusing anything.
    const { requiresConfirmation: _omitted, ...withoutConfirmation } = built[
      "pending, with the host's hints"
    ] as EvidenceCardRequest;

    expect(validate(JSON.parse(JSON.stringify(withoutConfirmation)) as unknown)).toBe(false);
  });
});
