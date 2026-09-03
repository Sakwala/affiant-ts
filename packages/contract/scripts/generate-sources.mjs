#!/usr/bin/env node
/**
 * Turns the vendored protocol JSON under `protocol/` into two committed TypeScript
 * modules:
 *
 *   src/schemas.ts               the JSON Schemas as importable objects
 *   test/fixtures.generated.ts   the conformance fixtures, the manifest and the enum sets
 *
 * Why generate rather than import the JSON directly: this package has to load on
 * Node, on Bun and inside Cloudflare workerd, and JSON module support differs across
 * the three (import attributes, `createRequire`, bundler JSON loaders). A plain
 * TypeScript module carrying the same data loads identically everywhere, and the
 * `protocol/` copies stay the byte-for-byte record of the pinned tag.
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
// copy of Sakwala/affiant-protocol at tag ${pin}.
// ${sourceNote}
// To change it: edit protocol/PIN, run \`pnpm sync-protocol\`, then \`pnpm generate\`.
`;

// ---------------------------------------------------------------- src/schemas.ts

const schemaFiles = readdirSync(join(protocolDir, "schemas"))
  .filter((f) => f.endsWith(".schema.json"))
  .sort();

const schemaEntries = schemaFiles.map((file) => {
  const name = file.replace(/\.schema\.json$/, "");
  return {
    file,
    name,
    identifier: `${camel(name)}Schema`,
    path: `schemas/${file}`,
    json: readJson(join(protocolDir, "schemas", file)),
  };
});

const schemasTs = `${banner("Source: protocol/schemas/*.schema.json")}
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

/** The name of each schema, without the \`.schema.json\` suffix. */
export type SchemaName =
${schemaEntries.map((e) => `  | ${JSON.stringify(e.name)}`).join("\n")};

${schemaEntries
  .map(
    (e) =>
      `/** \`${e.path}\` — ${String(e.json.title ?? e.name)}. */\nexport const ${e.identifier}: JsonSchemaDocument = ${literal(e.json, "")};`,
  )
  .join("\n\n")}

/** Every schema, keyed by name (\`"affidavit"\`, \`"provenance-tag"\`, …). */
export const schemas: Readonly<Record<SchemaName, JsonSchemaDocument>> = {
${schemaEntries.map((e) => `  ${JSON.stringify(e.name)}: ${e.identifier},`).join("\n")}
};

/**
 * Every schema, keyed by the repository-relative path the protocol's
 * \`conformance/fixtures/MANIFEST.json\` uses to refer to it.
 */
export const schemasByPath: Readonly<Record<string, JsonSchemaDocument>> = {
${schemaEntries.map((e) => `  ${JSON.stringify(e.path)}: ${e.identifier},`).join("\n")}
};

/**
 * Every schema, keyed by its \`$id\`. \`$ref\` between the schemas is by \`$id\`, so
 * registering all of these with a validator is what makes the references resolve.
 */
export const schemasById: Readonly<Record<string, JsonSchemaDocument>> = {
${schemaEntries.map((e) => `  ${JSON.stringify(e.json.$id)}: ${e.identifier},`).join("\n")}
};

/** Every schema, in a stable order. */
export const allSchemas: readonly JsonSchemaDocument[] = [
${schemaEntries.map((e) => `  ${e.identifier},`).join("\n")}
];
`;

writeFileSync(join(packageRoot, "src", "schemas.ts"), schemasTs);

// ------------------------------------------------ test/fixtures.generated.ts

const manifest = readJson(join(protocolDir, "fixtures", "MANIFEST.json"));
const enumValues = readJson(join(protocolDir, "fixtures", "enum-values.json"));

const fixtureEntries = manifest.fixtures.map((entry) => ({
  id: entry.id,
  identifier: identifierFor(entry.id),
  json: readJson(join(protocolDir, "fixtures", entry.file)),
}));

const fixturesTs = `${banner("Source: protocol/fixtures/")}
${fixtureEntries
  .map(
    (e) =>
      `/** Fixture \`${e.id}\`. */\nexport const ${e.identifier} = ${literal(e.json, "")} as const;`,
  )
  .join("\n\n")}

/** Every fixture, keyed by its manifest id. */
export const fixtures = {
${fixtureEntries.map((e) => `  ${JSON.stringify(e.id)}: ${e.identifier},`).join("\n")}
} as const;

/** \`conformance/fixtures/MANIFEST.json\` at the pinned tag. */
export const manifest = ${literal(manifest, "")} as const;

/** \`conformance/fixtures/enum-values.json\` at the pinned tag. */
export const enumValues = ${literal(enumValues, "")} as const;
`;

writeFileSync(join(packageRoot, "test", "fixtures.generated.ts"), fixturesTs);

console.log(
  `generated src/schemas.ts (${schemaEntries.length} schemas) and ` +
    `test/fixtures.generated.ts (${fixtureEntries.length} fixtures) from ${pin}`,
);
