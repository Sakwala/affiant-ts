import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { canonicalVectors } from "../fixtures/canonical.generated.js";

/**
 * Every byte vector's record, held against the Affidavit schema at the pinned
 * protocol ref.
 *
 * **Why this suite exists.** The seven vectors promoted at the rulebook's `v0.1.0`
 * described a *seed-shaped* record — `operationType: "WriteUpdate"`, `allowedValues`
 * and `pattern` on the fields, `warnings` and `requiresConfirmation` on the record,
 * the superseded spelling `evidence` for a tag's note, no `protocolVersion`, no
 * `conversationTurn`, no `createdAt`. They were written before this implementation
 * was aligned to the v0.1 wire and nothing checked them afterwards, so they pinned
 * the canonical bytes of a document the protocol does not have.
 * `schemas/0.1.0/affidavit.schema.json` refuses every one of them.
 *
 * SR-1 defines the canonical form over the accepted state of the Affidavit *as the
 * schema defines it*, and AF-1 and AF-5 say what that record may carry. So a vector
 * whose input is not an Affidavit is not a statement about the protocol, and the
 * only thing that keeps the two from drifting again is a check that runs on every
 * build. That is this file.
 *
 * Both ends are checked: the `input`, and — on the amended vector — the
 * `amendedInput`, which is the state the amendments produce and the document the
 * bytes are actually taken over.
 *
 * The schema is the **vendored** copy, so this suite is about the ref
 * `packages/contract/protocol/PIN` names rather than about whatever is on the
 * rulebook's default branch today.
 *
 * Node and Bun, not workerd: it reads the vendored schema directory off disk, which
 * is not a thing a Worker does. `vitest.workers.config.ts` excludes `test/node/`.
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

const AFFIDAVIT = "https://affiant.dev/schemas/0.1.0/affidavit.schema.json";

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to
 * the same function, and which of the two an ES module import lands on depends on
 * the runtime's CommonJS interop — this suite runs on Node and under Bun — so
 * unwrap whichever shape arrived.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

/**
 * One Ajv holding every v0.1 schema, so a `$ref` resolves the way it does in the
 * rulebook's own fixture lint. `strict` is on: a schema this refuses is a schema the
 * lint would refuse too.
 */
function validator(): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of readdirSync(schemaDir).sort()) {
    if (!name.endsWith(".schema.json")) continue;
    ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, name), "utf8")) as object);
  }
  const validate = ajv.getSchema(AFFIDAVIT);
  if (validate === undefined) {
    throw new Error(`the vendored schema directory carries no ${AFFIDAVIT}`);
  }
  return validate;
}

/** The schema's own complaints, as one line, so a failure names the property. */
function why(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "(root)"} ${error.message ?? ""}`.trim())
    .join("; ");
}

describe("the canonical vectors describe a v0.1 Affidavit", () => {
  const validate = validator();

  for (const vector of canonicalVectors) {
    it(`${vector.id}: the input validates against the Affidavit schema`, () => {
      const valid = validate(vector.input);

      expect(valid, `${vector.id}: ${why(validate)}`).toBe(true);
    });

    if (vector.amendments !== null) {
      it(`${vector.id}: the accepted state validates too (SR-1)`, () => {
        // The canonical form is over the accepted state, so it is the accepted
        // state that has to be an Affidavit. A proposal that validates and an
        // amended state that does not would mean the bytes a grant binds to
        // describe a document the protocol does not have.
        const valid = validate(vector.amendedInput);

        expect(valid, `${vector.id} amendedInput: ${why(validate)}`).toBe(true);
      });
    }
  }

  it("refuses the seed-shaped record the superseded vectors carried", () => {
    // The negative half. Without it, a suite that only ever validated good records
    // would pass just as happily against a schema that had stopped refusing
    // anything — and what went wrong here was precisely that nothing was refusing.
    const seedShaped = {
      operationType: "WriteUpdate",
      entityType: "Widget",
      entityId: "W-1",
      fields: [
        {
          name: "Status",
          value: "Active",
          previousValue: null,
          provenance: {
            current: {
              source: "UserStated",
              confidence: 1,
              evidence: "User stated: Status",
              conversationTurn: null,
            },
            prior: [],
          },
          isMandatory: true,
          kind: "enum",
          allowedValues: ["Active", "Retired"],
          pattern: null,
        },
      ],
      aggregateConfidence: 0.95,
      warnings: [],
      requiresConfirmation: true,
    };

    expect(validate(seedShaped)).toBe(false);
  });
});
