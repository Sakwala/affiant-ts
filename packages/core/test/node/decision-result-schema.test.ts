import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import type { DocketEntry } from "../../src/docket/entry.js";
import type { DecisionResult } from "../../src/gate/decision-result.js";
import { decisionResultOf } from "../../src/gate/decision-result.js";
import type { PreparedField } from "../../src/gate/pipeline.js";
import { chainOf, mintConversation } from "../../src/model/provenance.js";
import { AT, harness, plus, policyReturning, turnContext, type Harness } from "../gate-support.js";

/**
 * Every envelope `decisionResultOf` builds, held against the rulebook's
 * DecisionResult schema at the pinned protocol ref.
 *
 * One envelope per outcome, because the schema is the part of this producer's output
 * another implementation also has to accept, and the outcomes differ in exactly the
 * properties the schema constrains.
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

const RESULT = "https://affiant.dev/schemas/0.1.0/decision-result.schema.json";

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
  const validate = ajv.getSchema(RESULT);
  if (validate === undefined) {
    throw new Error(`the vendored schema directory carries no ${RESULT}`);
  }
  return validate;
}

/** The schema's own complaints, as one line, so a failure names the property. */
function why(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim())
    .join("; ");
}

const FIELDS = ["status", "amount"] as const;

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
      fields: [prepared("status", "Active"), prepared("amount", "40")],
      args: null,
    },
    turnContext(),
  );
  return filed.entry;
}

/** Every envelope this suite checks, built from a row a real gate decided. */
async function results(): Promise<{ readonly [name: string]: DecisionResult }> {
  const built: Record<string, DecisionResult> = {};

  const approving = harness();
  const toApprove = await fileOne(approving);
  built["approved, unexecuted"] = decisionResultOf(
    await approving.gate.decide(
      toApprove.entryId,
      { kind: "approve", amendments: {} },
      turnContext(),
    ),
  );
  built["approved, executed"] = decisionResultOf(
    await approving.gate.markExecuted(toApprove.entryId, "executed", null, turnContext()),
  );

  const failing = harness();
  const toFail = await fileOne(failing);
  await failing.gate.decide(toFail.entryId, { kind: "approve", amendments: {} }, turnContext());
  built["approved, the write failed"] = decisionResultOf(
    await failing.gate.markExecuted(toFail.entryId, "failed", "the ledger refused", turnContext()),
  );

  const standing = harness({ policies: [policyReturning({ requirement: "StandingOrder" })] });
  built["approved by a Standing Order"] = decisionResultOf(await fileOne(standing));

  const rejecting = harness();
  const toReject = await fileOne(rejecting);
  built["rejected"] = decisionResultOf(
    await rejecting.gate.decide(
      toReject.entryId,
      { kind: "reject", reason: "not this quarter" },
      turnContext(),
    ),
  );

  for (const [name, resubmit] of [
    ["expired", false],
    ["expired, then resubmitted", true],
  ] as const) {
    const lapsing = harness({ defaultTtlMs: 60_000 });
    const toLapse = await fileOne(lapsing);
    const after = plus(toLapse.expiresAt, 1);
    lapsing.clock.set(after);
    await lapsing.gate.expireDue(after, { tenantId: "tenant-a" }, 10);
    if (resubmit) await lapsing.gate.resubmit(toLapse.entryId, turnContext());
    const row = await lapsing.gate.get(toLapse.entryId, turnContext());
    if (row === null) throw new Error("the expired entry disappeared");
    built[name] = decisionResultOf(row);
  }

  return built;
}

describe("decisionResultOf builds a v0.1 DecisionResult envelope", async () => {
  const validate = validator();
  const built = await results();

  for (const [name, result] of Object.entries(built)) {
    it(`${name}: validates against the envelope schema`, () => {
      const valid = validate(JSON.parse(JSON.stringify(result)) as unknown);

      expect(valid, `${name}: ${why(validate)}`).toBe(true);
    });
  }

  it("refuses an envelope missing a required property", () => {
    // The negative half: a suite that only ever validated good documents would pass
    // just as happily against a validator that had stopped refusing anything.
    const { attestation: _omitted, ...withoutAttestation } = built[
      "approved, unexecuted"
    ] as DecisionResult;

    expect(validate(JSON.parse(JSON.stringify(withoutAttestation)) as unknown)).toBe(false);
  });
});
