#!/usr/bin/env node
/**
 * Fills in the expected values of the SR-1 byte vectors and mirrors them into a
 * TypeScript module the portable suites can import.
 *
 * Two outputs, from one input:
 *
 *   test/fixtures/canonical/*.json      the vectors — `input`, `amendments` and
 *                                       `reviewerAct` are hand-authored; this
 *                                       script writes `expectedBytesUtf8` and
 *                                       `expectedSha256` into them
 *   test/fixtures/canonical.generated.ts  the same vectors as a module
 *
 * **Why a generated module rather than importing the JSON.** The canonical suite
 * runs on Node, on Bun and inside workerd (RT-1), and JSON module support differs
 * across the three — import attributes, `createRequire`, a bundler's JSON loader.
 * A plain TypeScript module carrying the same data loads identically everywhere.
 * `test/node/canonical-vectors.test.ts` asserts the module and the JSON files still
 * agree, so the mirror cannot drift.
 *
 * **Why the expected values are written by the implementation.** A byte vector
 * somebody typed by hand is a transcription, and a transcription of 1,500 bytes of
 * canonical JSON is a typo waiting to be enshrined. So the implementation writes
 * them once, and an *independent* canonicalizer — a different algorithm, written
 * out in `test/canonical.test.ts` — has to agree on every vector, plus `sha256sum`
 * on the bytes in the Node-only suite. A vector is trustworthy because two paths
 * that share no code produce it, not because it was typed carefully.
 *
 * Run after building the package, from `packages/core`:
 *
 *   pnpm build && pnpm generate:vectors
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalHash, canonicalString } from "../dist/model/canonical.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vectorDir = join(packageRoot, "test", "fixtures", "canonical");

const files = readdirSync(vectorDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

const vectors = [];

for (const file of files) {
  const path = join(vectorDir, file);
  const vector = JSON.parse(readFileSync(path, "utf8"));
  const { input, amendments, reviewerAct } = vector;
  const options = reviewerAct === null ? undefined : { reviewerAct };

  vector.expectedBytesUtf8 = canonicalString(input, amendments, options);
  vector.expectedSha256 = await canonicalHash(input, amendments, options);

  writeFileSync(path, `${literal(vector, "", { json: true })}\n`);
  vectors.push({ file, vector });
}

/**
 * A TypeScript object-literal expression for a JSON value — or, with
 * `{ json: true }`, a JSON document.
 *
 * `JSON.stringify` would nearly do, but it writes `-0` as `0`, and one vector
 * exists precisely to pin what happens to negative zero. Losing the sign would
 * leave the file and the module testing a different input from the one the vector
 * is about, and the loss would be invisible in a diff. The only differences between
 * the two modes are the separator after a key and the trailing comma TypeScript
 * allows and JSON does not.
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
// Produced by scripts/generate-canonical-fixtures.mjs from test/fixtures/canonical/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a vector: edit its JSON file, then run
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
   * The Affidavit, or the bare JSON value where the vector exercises the form
   * itself. Typed \`unknown\` because a fixture is data: a suite narrows it to the
   * shape that suite is about, and no declaration here can be right for all seven.
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

writeFileSync(join(packageRoot, "test", "fixtures", "canonical.generated.ts"), module);

console.log(
  `canonical vectors: wrote expected bytes and SHA-256 into ${String(vectors.length)} file(s) ` +
    `and mirrored them into test/fixtures/canonical.generated.ts`,
);
