import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject, ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";

import type { EvidenceCardRequest } from "../src/index.js";
import { presentationNamesUnknownFields } from "../src/index.js";
import { allSchemas, allSeedSchemas, schemasByPath, seedSchemasByPath } from "../src/schemas.js";
import {
  manifest,
  v01Fixtures,
  v03Fixtures,
  v04Fixtures,
  wireFixtures,
} from "./fixtures.generated.js";

type V01ManifestFixture = (typeof manifest)["0.1.0"]["fixtures"][number];
type V03ManifestFixture = (typeof manifest)["0.3.0"]["fixtures"][number];
type V04ManifestFixture = (typeof manifest)["0.4.0"]["fixtures"][number];
type SeedManifestFixture = (typeof manifest.fixtures)[number];

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to
 * the same function. Which of the two an ES module import lands on depends on the
 * runtime's CommonJS interop — and this suite deliberately runs on three of them —
 * so unwrap whichever shape arrived.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

/**
 * BD-257: a document validates against the schema version it was written for.
 * `protocol/schemas/` is a single flat directory holding only the pinned schema
 * shapes, so a document from an older manifest section only still validates if the
 * schema it names kept its shape from that section up to the pin — it is listed
 * under `definitionsOnly` in every newer section. `v01Fixtures` and `v03Fixtures`
 * (generated) already drop the rest; the local sets here mirror that chain so every
 * entry iterated has a document to validate, re-pathed onto the flat vendored
 * directory the same way the generator re-paths it.
 */
function repath(schemaPath: string): string {
  return schemaPath.replace(/^schemas\/\d+\.\d+\.\d+\//, "schemas/0.4.0/");
}
function unchangedIn(section: "0.3.0" | "0.4.0"): Set<string> {
  return new Set((manifest[section].definitionsOnly as readonly string[]).map(repath));
}
const unchangedSince03 = unchangedIn("0.4.0");
const unchangedSince01 = new Set(
  [...unchangedIn("0.3.0")].filter((path) => unchangedSince03.has(path)),
);
/** The schemas a 0.1.0 document may name and still be kept (the chain, not one section). */
const v03DefinitionsOnly = unchangedSince01;
const v01 = (manifest["0.1.0"].fixtures as readonly V01ManifestFixture[])
  .map((entry) => ({
    ...entry,
    schema: repath(entry.schema) as typeof entry.schema,
  }))
  .filter((entry) => v03DefinitionsOnly.has(entry.schema));
const positives = v01.filter((entry) => entry.kind === "positive");
const negatives = v01.filter((entry) => entry.kind === "negative");
/**
 * A negative the schema **accepts**: it breaks a relation between two objects,
 * which no JSON Schema can state. The rulebook marks it, and the check that
 * refuses it lives in code — here, {@link presentationNamesUnknownFields}.
 */
const crossObject = negatives.filter(
  (entry) => (entry as { check?: string }).check === "cross-object",
);
const schemaNegatives = negatives.filter(
  (entry) => (entry as { check?: string }).check === undefined,
);

// BD-256: the 0.3.0 section carries one cross-object negative
// (`v0.3/evidence-card-request/93-presentation-names-unknown-field`, the same
// relation as the v0.1 counterpart above) which the schema itself cannot refuse.
// A 0.3.0 document is kept only if the 0.4.0 section left its schema unchanged: the
// 0.4.0 section re-authors docket-entry, decision-result and notification, and its
// own documents (`v04Fixtures`) replace the 0.3.0 ones for those three schemas.
const v03Raw = manifest["0.3.0"].fixtures as readonly V03ManifestFixture[];
const v03 = v03Raw.filter((entry) => unchangedSince03.has(repath(entry.schema)));
const v03Positives = v03.filter((entry) => entry.kind === "positive");
const v03AllNegatives = v03.filter((entry) => entry.kind === "negative");
const v03CrossObject = v03AllNegatives.filter(
  (entry) => (entry as { check?: string }).check === "cross-object",
);
const v03Negatives = v03AllNegatives.filter(
  (entry) => (entry as { check?: string }).check === undefined,
);

// The newest section: every document is kept.
const v04 = manifest["0.4.0"].fixtures as readonly V04ManifestFixture[];
const v04Positives = v04.filter((entry) => entry.kind === "positive");

const seedSchemaRelevant = manifest.fixtures.filter(
  (entry): entry is SeedManifestFixture & { schema: string } => entry.schemaRelevant,
);

let ajv: Ajv2020;

function validatorFor(schemaPath: string): ValidateFunction {
  // BD-257: `protocol/schemas/` is a flat directory holding only the pinned
  // (0.4.0) shapes; a caller naming a `schemas/0.1.0/...` or `schemas/0.3.0/...`
  // path for a schema that did not change shape (this file has several literal
  // ones) still resolves, onto the pinned copy of the same file.
  const repathed = schemaPath.replace(/^schemas\/(0\.1\.0|0\.3\.0)\//, "schemas/0.4.0/");
  const schema =
    schemasByPath[repathed] ??
    seedSchemasByPath[repathed] ??
    schemasByPath[schemaPath] ??
    seedSchemasByPath[schemaPath];
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

/** A fixture as data, detached from the frozen generated module. */
function documentFor(id: string): unknown {
  const fixture = v01Fixtures[id];
  if (fixture === undefined) throw new Error(`no v0.1 fixture ${id}`);
  return JSON.parse(JSON.stringify(fixture));
}

/** The v0.3 counterpart to {@link documentFor}. */
function v03DocumentFor(id: string): unknown {
  const fixture = v03Fixtures[id];
  if (fixture === undefined) throw new Error(`no v0.3 fixture ${id}`);
  return JSON.parse(JSON.stringify(fixture));
}

/** The v0.4 counterpart to {@link documentFor}. */
function v04DocumentFor(id: string): unknown {
  const fixture = v04Fixtures[id];
  if (fixture === undefined) throw new Error(`no v0.4 fixture ${id}`);
  return JSON.parse(JSON.stringify(fixture));
}

beforeAll(() => {
  ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  // Registering every schema by its own `$id` is what makes the cross-document
  // `$ref`s (affidavit -> affidavit-field -> provenance-chain -> …) resolve. The
  // seed set carries `0.0.1-seed` in its `$id`s, so both versions coexist.
  ajv.addSchema(allSchemas as unknown as AnySchemaObject[]);
  ajv.addSchema(allSeedSchemas as unknown as AnySchemaObject[]);
});

describe("the v0.1 fixture set", () => {
  it("is the 46 positives and 23 negatives the rulebook promoted, minus BD-257's exclusions", () => {
    // BD-257: docket-entry, requirement, attestation, evidence-card-request and
    // error-code changed shape at the pin, so their 0.1.0 documents (the 1
    // cross-object negative among them) are excluded from this filtered set —
    // v03Fixtures / the v0.3 describe blocks below cover those schemas instead.
    // The counts below are read from the generated manifest, never written as
    // literals: the total is what the rulebook promoted, the excluded count is
    // what BD-257's five changed schemas remove from it.
    const v01Raw = manifest["0.1.0"].fixtures as readonly V01ManifestFixture[];
    const excluded = v01Raw.filter((entry) => !v03DefinitionsOnly.has(repath(entry.schema)));
    const totalPositives = v01Raw.filter((entry) => entry.kind === "positive").length;
    const totalNegatives = v01Raw.filter((entry) => entry.kind === "negative").length;
    const excludedPositives = excluded.filter((entry) => entry.kind === "positive").length;
    const excludedNegatives = excluded.filter((entry) => entry.kind === "negative").length;

    expect(totalPositives).toBe(46);
    expect(totalNegatives).toBe(23);
    expect(positives).toHaveLength(totalPositives - excludedPositives);
    expect(negatives).toHaveLength(totalNegatives - excludedNegatives);
    expect(schemaNegatives).toHaveLength(negatives.length - crossObject.length);
    expect(crossObject).toHaveLength(
      negatives.filter((entry) => (entry as { check?: string }).check === "cross-object").length,
    );
  });

  it("covers every schema that carries a payload of its own", () => {
    // Unfiltered here on purpose: this checks the 0.1.0 manifest's own internal
    // consistency (every 0.1.0 schema has a fixture), not what BD-257 lets validate
    // against the pinned flat directory — that is the describe blocks below.
    const v01Raw = manifest["0.1.0"].fixtures as readonly V01ManifestFixture[];
    const cited = new Set<string>(v01Raw.map((entry) => repath(entry.schema)));
    for (const entry of [...v03Raw, ...v04]) {
      cited.add(repath(entry.schema));
    }
    const uncovered = Object.keys(schemasByPath).filter(
      (path) => !cited.has(path) && !unchangedSince03.has(path),
    );

    expect(uncovered).toEqual([]);
  });
});

describe("every positive v0.1 fixture validates against the schema the manifest assigns it", () => {
  it.each(positives.map((entry) => [entry.id, entry.schema] as const))(
    "%s against %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);

      const valid = validate(documentFor(id));

      expect(validate.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    },
  );
});

describe("every negative v0.1 fixture is refused", () => {
  it.each(schemaNegatives.map((entry) => [entry.id, entry.schema] as const))(
    "%s is refused by %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);

      expect(validate(documentFor(id))).toBe(false);
      expect((validate.errors ?? []).length).toBeGreaterThan(0);
    },
  );

  it.each(crossObject.map((entry) => [entry.id, entry.schema] as const))(
    "%s passes %s and is refused by the cross-object check instead",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);
      const document = documentFor(id) as EvidenceCardRequest;

      // The schema accepts it: `presentation[].name` is a non-empty string as far
      // as JSON Schema can say. What it names is the fact no schema can check.
      expect(validate(document)).toBe(true);
      expect(presentationNamesUnknownFields(document)).toEqual(["dueDate"]);
    },
  );
});

describe("every positive v0.3 fixture validates against the schema the manifest assigns it (BD-256)", () => {
  it.each(v03Positives.map((entry) => [entry.id, entry.schema] as const))(
    "%s against %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);

      const valid = validate(v03DocumentFor(id));

      expect(validate.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    },
  );
});

describe("every negative v0.3 fixture is refused (BD-256)", () => {
  it.each(v03Negatives.map((entry) => [entry.id, entry.schema] as const))(
    "%s is refused by %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);

      expect(validate(v03DocumentFor(id))).toBe(false);
      expect((validate.errors ?? []).length).toBeGreaterThan(0);
    },
  );
});

describe("every positive v0.4 fixture validates against the schema the manifest assigns it", () => {
  it.each(v04Positives.map((entry) => [entry.id, entry.schema] as const))(
    "%s against %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);

      const valid = validate(v04DocumentFor(id));

      expect(validate.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    },
  );

  it("carries the withdrawn row: status withdrawn, decided by a withdraw", () => {
    const row = v04DocumentFor("v0.4/docket-entry-withdrawn") as {
      status: unknown;
      decision: { kind: unknown };
    };

    expect(row.status).toBe("withdrawn");
    expect(row.decision.kind).toBe("withdraw");
  });
});

describe("the cross-object check is not vacuous", () => {
  it("passes every positive card fixture, hints and all", () => {
    const cards = v03Positives.filter(
      (entry) => entry.schema === "schemas/0.3.0/evidence-card-request.schema.json",
    );

    expect(cards.length).toBeGreaterThanOrEqual(4);
    for (const entry of cards) {
      expect(
        presentationNamesUnknownFields(v03DocumentFor(entry.id) as EvidenceCardRequest),
        entry.id,
      ).toEqual([]);
    }
  });

  it("says nothing about a card that carries no hints", () => {
    const card = { affidavit: { fields: [] } } as unknown as EvidenceCardRequest;

    expect(presentationNamesUnknownFields(card)).toEqual([]);
  });

  it.each(v03CrossObject.map((entry) => [entry.id, entry.schema] as const))(
    "%s passes %s and is refused by the cross-object check instead (BD-256)",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);
      const document = v03DocumentFor(id) as EvidenceCardRequest;

      expect(validate(document)).toBe(true);
      expect(presentationNamesUnknownFields(document)).toEqual(["dueDate"]);
    },
  );
});

describe("the v0.1 schemas refuse the mutations a rule is about", () => {
  it("rejects an affidavit whose absent optional value is undefined rather than null", () => {
    const validate = validatorFor("schemas/0.1.0/affidavit.schema.json");
    const mutated = documentFor("v0.1/affidavit/01-update-shaped") as Record<string, unknown>;
    // Dropping the key is what `undefined` becomes once it goes through JSON.
    delete mutated["populatedConfidence"];

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("required");
  });

  it("rejects a provenance source outside the pinned set", () => {
    const validate = validatorFor("schemas/0.1.0/provenance-tag.schema.json");
    const mutated = documentFor("v0.1/provenance-tag/01-conversation") as Record<string, unknown>;
    mutated["source"] = "Vibes";

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("enum");
  });

  it("rejects a confidence above 1", () => {
    const validate = validatorFor("schemas/0.1.0/affidavit.schema.json");
    const mutated = documentFor("v0.1/affidavit/01-update-shaped") as Record<string, unknown>;
    mutated["aggregateConfidence"] = 1.5;

    expect(validate(mutated)).toBe(false);
    expect((validate.errors ?? []).map((error) => error.keyword)).toContain("maximum");
  });

  it("rejects a card envelope whose docketId key has been renamed (BD-256/BD-257)", () => {
    const validate = validatorFor("schemas/0.3.0/evidence-card-request.schema.json");
    const mutated = v03DocumentFor("v0.3/evidence-card-request/01-first-filing") as Record<
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

  it("rejects a notification told apart by its properties rather than by its kind (BD-256/BD-257)", () => {
    const validate = validatorFor("schemas/0.4.0/notification.schema.json");
    const mutated = v04DocumentFor("v0.4/notification-transition-to-withdrawn") as Record<
      string,
      unknown
    >;
    delete mutated["kind"];

    expect(validate(mutated)).toBe(false);
  });

  it("rejects a tool result carrying the seed's $type discriminator (BD-256/BD-257)", () => {
    const validate = validatorFor("schemas/0.3.0/tool-result.schema.json");
    const mutated = v03DocumentFor("v0.3/tool-result/03-read") as Record<string, unknown>;
    mutated["$type"] = mutated["kind"];
    delete mutated["kind"];

    expect(validate(mutated)).toBe(false);
  });
});

describe("the superseded 0.0.1-seed wire still validates against its own schemas", () => {
  it("the seed manifest marks the four core payloads as schema-relevant", () => {
    expect(seedSchemaRelevant.map((entry) => entry.id)).toEqual([
      "wire/evidence-card-request",
      "wire/evidence-card-request-resubmission",
      "wire/docket-expiring",
      "wire/docket-expired",
    ]);
  });

  it.each(seedSchemaRelevant.map((entry) => [entry.id, entry.schema] as const))(
    "%s against %s",
    (id, schemaPath) => {
      const validate = validatorFor(schemaPath);
      const fixture = wireFixtures[id as keyof typeof wireFixtures];

      const valid = validate(JSON.parse(JSON.stringify(fixture)));

      expect(validate.errors ?? []).toEqual([]);
      expect(valid).toBe(true);
    },
  );

  it("is not the v0.1 shape: a seed card is refused by the v0.1 card schema", () => {
    const validate = validatorFor("schemas/0.1.0/evidence-card-request.schema.json");

    expect(validate(JSON.parse(JSON.stringify(wireFixtures["wire/evidence-card-request"])))).toBe(
      false,
    );
  });
});
