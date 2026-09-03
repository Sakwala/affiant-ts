import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject, ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";

import { allSchemas, schemasByPath } from "../src/schemas.js";
import { fixtures, manifest } from "./fixtures.generated.js";

type ManifestFixture = (typeof manifest.fixtures)[number];

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to
 * the same function. Which of the two an ES module import lands on depends on the
 * runtime's CommonJS interop — and this suite deliberately runs on three of them —
 * so unwrap whichever shape arrived.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

const schemaRelevant = manifest.fixtures.filter(
  (entry): entry is ManifestFixture & { schema: string } => entry.schemaRelevant,
);

let ajv: Ajv2020;

function validatorFor(schemaPath: string): ValidateFunction {
  const schema = schemasByPath[schemaPath];
  if (schema === undefined) {
    throw new Error(`the manifest names ${schemaPath}, which is not vendored`);
  }
  const id = schema["$id"];
  if (typeof id !== "string") {
    throw new Error(`${schemaPath} has no $id to resolve $ref against`);
  }
  const validate = ajv.getSchema(id);
  if (validate === undefined) {
    throw new Error(`${id} was not registered`);
  }
  return validate;
}

beforeAll(() => {
  ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  // Registering every schema by its own `$id` is what makes the cross-document
  // `$ref`s (affidavit -> affidavit-field -> provenance-chain -> …) resolve.
  ajv.addSchema(allSchemas as unknown as AnySchemaObject[]);
});

describe("every schema-relevant fixture validates against the schema the manifest assigns it", () => {
  it("the manifest marks the four core payloads as schema-relevant", () => {
    expect(schemaRelevant.map((entry) => entry.id)).toEqual([
      "wire/evidence-card-request",
      "wire/evidence-card-request-resubmission",
      "wire/docket-expiring",
      "wire/docket-expired",
    ]);
  });

  it.each(schemaRelevant.map((entry) => [entry.id, entry.schema] as const))(
    "%s against %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);
      const fixture = fixtures[id as keyof typeof fixtures];

      const valid = validate(JSON.parse(JSON.stringify(fixture)));

      expect(validate.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    },
  );
});

describe("the suite is not vacuous", () => {
  it("rejects an evidence card request whose docketId key has been renamed", () => {
    const validate = validatorFor("schemas/evidence-card-request.schema.json");
    const mutated = JSON.parse(JSON.stringify(fixtures["wire/evidence-card-request"])) as Record<
      string,
      unknown
    >;
    mutated["docket_id"] = mutated["docketId"];
    delete mutated["docketId"];

    expect(validate(mutated)).toBe(false);
    const keywords = (validate.errors ?? []).map((error) => error.keyword);
    expect(keywords).toContain("required");
    expect(keywords).toContain("additionalProperties");
  });

  it("rejects a provenance source outside the pinned set", () => {
    const validate = validatorFor("schemas/evidence-card-request.schema.json");
    const mutated = JSON.parse(
      JSON.stringify(fixtures["wire/evidence-card-request"]),
    ) as EvidenceCardRequestShape;
    const field = mutated.affidavit.fields[0];
    if (field === undefined) throw new Error("fixture has no fields");
    field.provenance.current.source = "Vibes";

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("enum");
  });

  it("rejects a confidence above 1", () => {
    const validate = validatorFor("schemas/evidence-card-request.schema.json");
    const mutated = JSON.parse(
      JSON.stringify(fixtures["wire/evidence-card-request"]),
    ) as EvidenceCardRequestShape;
    mutated.affidavit.aggregateConfidence = 1.5;

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("maximum");
  });

  it("rejects a docket expiry notification whose timestamp is not a date-time", () => {
    const validate = validatorFor("schemas/docket-expiring.schema.json");
    const mutated = JSON.parse(JSON.stringify(fixtures["wire/docket-expiring"])) as Record<
      string,
      unknown
    >;
    mutated["expiresAt"] = "the first of August";

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("format");
  });

  it("rejects an affidavit whose absent optional value is undefined rather than null", () => {
    const validate = validatorFor("schemas/evidence-card-request.schema.json");
    const mutated = JSON.parse(
      JSON.stringify(fixtures["wire/evidence-card-request"]),
    ) as EvidenceCardRequestShape;
    // Dropping the key is what `undefined` becomes once it goes through JSON.
    delete (mutated as { priorAmendments?: unknown }).priorAmendments;

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("required");
  });
});

/** A deliberately loose, mutable mirror of the envelope, for building bad payloads. */
interface EvidenceCardShapeField {
  provenance: { current: { source: string } };
}
interface EvidenceCardRequestShape {
  docketId: string;
  requiredBy: string;
  priorAmendments: unknown;
  affidavit: {
    aggregateConfidence: number;
    fields: EvidenceCardShapeField[];
  };
}
