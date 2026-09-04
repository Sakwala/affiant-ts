#!/usr/bin/env node
/**
 * Turns the vendored protocol JSON under `protocol/` into three committed
 * TypeScript modules:
 *
 *   src/schemas.ts               the JSON Schemas as importable objects
 *   src/conformance.ts           the conformance suite: fixtures, byte vectors,
 *                                the manifest, and the formats a driver emits
 *   test/fixtures.generated.ts   the per-schema example and negative fixtures,
 *                                the manifest and the enum sets
 *
 * Why generate rather than import the JSON directly: these modules have to load on
 * Node, on Bun and inside Cloudflare workerd, and JSON module support differs across
 * the three (import attributes, `createRequire`, bundler JSON loaders). Worse, a
 * Worker has no filesystem at all, so a conformance driver running the suite inside
 * workerd cannot read a fixture off disk — and the suite has to run on every runtime
 * the implementation claims (RT-1). A plain TypeScript module carrying the same data
 * loads identically everywhere, and the `protocol/` copies stay the byte-for-byte
 * record of the pinned ref.
 *
 * Run after `sync-protocol.mjs`, or whenever `protocol/` changes:
 *
 *   node scripts/generate-sources.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const protocolDir = join(packageRoot, "protocol");

const pin = readFileSync(join(protocolDir, "PIN"), "utf8").trim();

/** `affidavit-field` -> `affidavitField` */
function camel(kebab) {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** `wire/evidence-card-request` -> `wireEvidenceCardRequest` */
function identifierFor(fixtureId) {
  return camel(fixtureId.replace(/\//g, "-"));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function literal(value, indent) {
  // JSON.stringify's output is a valid TypeScript object-literal expression:
  // every key is quoted and every value is a JSON scalar, array or object.
  return JSON.stringify(value, null, 2)
    .split("\n")
    .join("\n" + indent);
}

const banner = (sourceNote) => `// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-sources.mjs from protocol/, which is a byte-for-byte
// copy of Sakwala/affiant-protocol at ${pin}.
// ${sourceNote}
// To change it: edit protocol/PIN, run \`pnpm sync-protocol\`, then \`pnpm generate\`.
`;

// ---------------------------------------------------------------- src/schemas.ts

/** Every `*.schema.json` directly under `protocol/<dir>`, sorted by file name. */
function schemaSet(localDir, upstreamPrefix, suffix) {
  return readdirSync(join(protocolDir, localDir))
    .filter((file) => file.endsWith(".schema.json"))
    .sort()
    .map((file) => {
      const name = file.replace(/\.schema\.json$/, "");
      return {
        file,
        name,
        identifier: `${camel(name)}${suffix}`,
        /** The path this schema has in the rulebook — what the manifest names it by. */
        path: `${upstreamPrefix}/${file}`,
        json: readJson(join(protocolDir, localDir, file)),
      };
    });
}

const wireSchemas = schemaSet("schemas", "schemas/0.1.0", "Schema");
const seedSchemaEntries = schemaSet("schemas/seed", "schemas", "SeedSchema");

/** The `export const` block plus the four lookup tables for one schema set. */
function schemaModuleSection(entries, { nameType, byName, byPath, byId, all, what }) {
  return `/** The name of each ${what}, without the \`.schema.json\` suffix. */
export type ${nameType} =
${entries.map((e) => `  | ${JSON.stringify(e.name)}`).join("\n")};

${entries
  .map(
    (e) =>
      `/** \`${e.path}\` — ${String(e.json.title ?? e.name)}. */\nexport const ${e.identifier}: JsonSchemaDocument = ${literal(e.json, "")};`,
  )
  .join("\n\n")}

/** Every ${what}, keyed by name (\`"affidavit"\`, \`"provenance-tag"\`, …). */
export const ${byName}: Readonly<Record<${nameType}, JsonSchemaDocument>> = {
${entries.map((e) => `  ${JSON.stringify(e.name)}: ${e.identifier},`).join("\n")}
};

/**
 * Every ${what}, keyed by the repository-relative path the protocol's
 * \`conformance/fixtures/MANIFEST.json\` uses to refer to it.
 */
export const ${byPath}: Readonly<Record<string, JsonSchemaDocument>> = {
${entries.map((e) => `  ${JSON.stringify(e.path)}: ${e.identifier},`).join("\n")}
};

/**
 * Every ${what}, keyed by its \`$id\`. \`$ref\` between the schemas is by \`$id\`, so
 * registering all of these with a validator is what makes the references resolve.
 */
export const ${byId}: Readonly<Record<string, JsonSchemaDocument>> = {
${entries.map((e) => `  ${JSON.stringify(e.json.$id)}: ${e.identifier},`).join("\n")}
};

/** Every ${what}, in a stable order. */
export const ${all}: readonly JsonSchemaDocument[] = [
${entries.map((e) => `  ${e.identifier},`).join("\n")}
];`;
}

const schemasTs = `${banner("Source: protocol/schemas/*.schema.json and protocol/schemas/seed/*.schema.json")}
/**
 * A JSON Schema document from the Affiant protocol. Loosely typed on purpose: the
 * documents are data, and every validator library has its own schema type.
 */
export interface JsonSchemaDocument {
  readonly $id?: string;
  readonly $schema?: string;
  readonly title?: string;
  readonly description?: string;
  readonly [keyword: string]: unknown;
}

/** The protocol version these schemas were vendored from. Defined once in \`./index.js\`. */
export { PROTOCOL_VERSION } from "./index.js";

${schemaModuleSection(wireSchemas, {
  nameType: "SchemaName",
  byName: "schemas",
  byPath: "schemasByPath",
  byId: "schemasById",
  all: "allSchemas",
  what: "schema",
})}

// ---------------------------------------------------------------------------
// The superseded 0.0.1-seed set
//
// The seed schemas describe the wire the shipped .NET framework sends: the shape
// v0.1 replaced. They are kept because that framework still sends it and a reader
// comparing the two needs both in one place — never because a v0.1 producer may
// emit one. Their \`$id\`s carry \`0.0.1-seed\`, so both sets can be registered with
// one validator without colliding.
// ---------------------------------------------------------------------------

${schemaModuleSection(seedSchemaEntries, {
  nameType: "SeedSchemaName",
  byName: "seedSchemas",
  byPath: "seedSchemasByPath",
  byId: "seedSchemasById",
  all: "allSeedSchemas",
  what: "superseded 0.0.1-seed schema",
})}
`;

writeFileSync(join(packageRoot, "src", "schemas.ts"), schemasTs);

// ------------------------------------------------------------ shared manifest

const manifest = readJson(join(protocolDir, "fixtures", "MANIFEST.json"));
const enumValues = readJson(join(protocolDir, "fixtures", "enum-values.json"));

// ------------------------------------------------------------ src/conformance.ts

const conformance = manifest.conformance;
const conformanceEntries = conformance.fixtures.map((entry) => ({
  id: entry.id,
  set: entry.set,
  json: readJson(join(protocolDir, "fixtures", entry.file)),
}));

const stepFixtures = conformanceEntries.filter((entry) => entry.set !== "canonical");
const canonicalEntries = conformanceEntries.filter((entry) => entry.set === "canonical");

const conformanceTs = `${banner("Source: protocol/fixtures/{gate,decide,sequence-a,sequence-c,canonical}/ and protocol/conformance/")}
import type { JsonSchemaDocument } from "./schemas.js";

/** Any value JSON can carry. Re-declared here so this module imports no types it does not need. */
type JsonData = string | number | boolean | null | JsonData[] | { [key: string]: JsonData };

/**
 * The ref of \`Sakwala/affiant-protocol\` every document in this module was taken
 * from — a git tag, or a full commit while a version's text is on the default
 * branch and its tag has not been cut. A driver puts this in the \`protocolTag\` of
 * every result document it emits and of the parity manifest it is asserted against:
 * a result whose ref is not the one the manifest names is not a comparison.
 */
export const PROTOCOL_PIN = ${JSON.stringify(pin)} as const;

/**
 * One declarative conformance fixture: a wiring, a sequence of acts, and what must
 * then be true. The format is the rulebook's \`conformance/RUNNER.md\` and its
 * machine-readable form is {@link fixtureSchema}; \`given\` and \`expect\` are left as
 * data here because this package does not run them — a driver validates a document
 * against the schema and hands it to its own implementation's runner.
 */
export interface ConformanceFixtureDocument {
  /** A stable id, unique across the set and prefixed by the set it belongs to. Never renamed. */
  readonly id: string;
  /** The rulebook ids this fixture checks. At least one. */
  readonly rules: readonly string[];
  /** What the fixture asserts, in a sentence. The test name in every runner. */
  readonly title: string;
  /** The wiring, the acts, and the turn they happen in. */
  readonly given: JsonData;
  /** What must be true afterwards. Every matcher is partial. */
  readonly expect: JsonData;
}

/**
 * One canonical byte vector: an Affidavit, the amendments accepted on it, the
 * decision they arrived on, and the exact bytes and digest those produce (SR-1).
 * A different document shape from a fixture, and not run through the step
 * machinery. A driver **reproduces** the bytes and the digest through the
 * implementation's own exported canonical-hash helper; it never re-derives them,
 * and it never regenerates them when they disagree — a disagreement is the finding.
 */
export interface CanonicalVectorDocument {
  readonly id: string;
  readonly rules: readonly string[];
  /** What this vector stresses, and why. */
  readonly note: string;
  /** The input Affidavit. */
  readonly input: JsonData;
  /** The amendments accepted on it, or \`null\`. */
  readonly amendments: JsonData;
  /** The reviewer act the amendments arrived on, or \`null\`. */
  readonly reviewerAct: JsonData;
  /** The exact canonical bytes, as a UTF-8 string. */
  readonly expectedBytesUtf8: string;
  /** The SHA-256 of those bytes, as 64 lowercase hex characters. */
  readonly expectedSha256: string;
}

/**
 * The \`"conformance"\` section of \`conformance/fixtures/MANIFEST.json\`: every
 * promoted document with its id, its file, the rules it checks, the set it belongs
 * to, and its negative-oracle entry. A driver runs **every fixture this lists** —
 * running a subset and reporting a pass is the failure mode the whole arrangement
 * exists to prevent.
 */
export const conformanceManifest = ${literal(conformance, "")} as const;

/**
 * The ${stepFixtures.length} declarative fixtures, in manifest order. Promoted
 * byte-identical from the reference implementation's own test set, so "this
 * implementation passes it and that one does not" is a comparison rather than an
 * opinion.
 */
export const conformanceFixtures: readonly ConformanceFixtureDocument[] = [
${stepFixtures.map((e) => `  ${literal(e.json, "  ")},`).join("\n")}
];

/** The ${canonicalEntries.length} canonical byte vectors, in manifest order (SR-1). */
export const canonicalVectors: readonly CanonicalVectorDocument[] = [
${canonicalEntries.map((e) => `  ${literal(e.json, "  ")},`).join("\n")}
];

/** Every conformance fixture and byte vector, keyed by its manifest id. */
export const conformanceById: Readonly<
  Record<string, ConformanceFixtureDocument | CanonicalVectorDocument>
> = {
${conformanceEntries
  .map(
    (e) =>
      `  ${JSON.stringify(e.id)}: ${e.set === "canonical" ? `canonicalVectors[${String(canonicalEntries.indexOf(e))}]!` : `conformanceFixtures[${String(stepFixtures.indexOf(e))}]!`},`,
  )
  .join("\n")}
};

/** \`conformance/fixture.schema.json\` — what a declarative fixture may say. */
export const fixtureSchema: JsonSchemaDocument = ${literal(readJson(join(protocolDir, "conformance", "fixture.schema.json")), "")};

/** \`conformance/canonical-vector.schema.json\` — what a byte vector says. */
export const canonicalVectorSchema: JsonSchemaDocument = ${literal(readJson(join(protocolDir, "conformance", "canonical-vector.schema.json")), "")};

/** \`conformance/results.schema.json\` — the run document a driver emits. */
export const resultsSchema: JsonSchemaDocument = ${literal(readJson(join(protocolDir, "conformance", "results.schema.json")), "")};

/** \`conformance/parity/MANIFEST.schema.json\` — the parity manifest a run is asserted against. */
export const parityManifestSchema: JsonSchemaDocument = ${literal(readJson(join(protocolDir, "conformance", "parity", "MANIFEST.schema.json")), "")};

/**
 * \`conformance/lint/coverage-exemptions.json\` — the rules the rulebook excuses from
 * carrying a conformance fixture at this version, each with a reason. A driver
 * **copies** these into its parity manifest and adds what it checks instead; it may
 * not invent one, because exempting yourself from a rule is not a parity report.
 */
export const coverageExemptions = ${literal(readJson(join(protocolDir, "conformance", "lint", "coverage-exemptions.json")), "")} as const;
`;

writeFileSync(join(packageRoot, "src", "conformance.ts"), conformanceTs);

// ------------------------------------------------ test/fixtures.generated.ts

const wireEntries = manifest.fixtures.map((entry) => ({
  id: entry.id,
  identifier: identifierFor(entry.id),
  json: readJson(join(protocolDir, "fixtures", entry.file)),
}));

const v01 = manifest["0.1.0"];
const v01Entries = v01.fixtures.map((entry) => ({
  id: entry.id,
  kind: entry.kind,
  schema: entry.schema,
  json: readJson(join(protocolDir, "fixtures", entry.file)),
}));

const fixturesTs = `${banner("Source: protocol/fixtures/wire/ and protocol/fixtures/v0.1/")}
${wireEntries
  .map(
    (e) =>
      `/** Fixture \`${e.id}\`. */\nexport const ${e.identifier} = ${literal(e.json, "")} as const;`,
  )
  .join("\n\n")}

/** Every 0.0.1-seed wire fixture, keyed by its manifest id. */
export const wireFixtures = {
${wireEntries.map((e) => `  ${JSON.stringify(e.id)}: ${e.identifier},`).join("\n")}
} as const;

/**
 * Every v0.1 fixture, keyed by its manifest id: one or more positive examples per
 * schema, and the negatives that must fail. Left as \`unknown\` because a negative
 * fixture is, by construction, not assignable to the type its schema describes.
 */
export const v01Fixtures: Readonly<Record<string, unknown>> = {
${v01Entries.map((e) => `  ${JSON.stringify(e.id)}: ${literal(e.json, "  ")},`).join("\n")}
};

/** \`conformance/fixtures/MANIFEST.json\` at the pinned ref. */
export const manifest = ${literal(manifest, "")} as const;

/** \`conformance/fixtures/enum-values.json\` at the pinned ref. */
export const enumValues = ${literal(enumValues, "")} as const;
`;

writeFileSync(join(packageRoot, "test", "fixtures.generated.ts"), fixturesTs);

console.log(
  `generated src/schemas.ts (${wireSchemas.length} schemas + ${seedSchemaEntries.length} seed), ` +
    `src/conformance.ts (${stepFixtures.length} fixtures + ${canonicalEntries.length} vectors) and ` +
    `test/fixtures.generated.ts (${wireEntries.length} wire + ${v01Entries.length} v0.1 fixtures) from ${pin}`,
);
