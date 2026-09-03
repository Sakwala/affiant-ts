#!/usr/bin/env node
/**
 * Mirrors every declarative fixture into a TypeScript module the portable suites
 * can import.
 *
 *   test/fixtures/<set>/*.json          the fixtures — hand-authored, and the record
 *   test/fixtures/fixtures.generated.ts   the same fixtures as a module
 *
 * **Why a generated module rather than importing the JSON.** The fixture suites run
 * on Node, on Bun and inside workerd (RT-1), and JSON module support differs across
 * the three — import attributes, `createRequire`, a bundler's JSON loader. A plain
 * TypeScript module carrying the same data loads identically everywhere.
 * `test/node/fixture-mirror.test.ts` asserts the module and the JSON files still
 * agree, so the mirror cannot drift.
 *
 * **Nothing here is computed.** Unlike the canonical byte vectors, a fixture's
 * expectation is a statement about what a rule requires, and a statement an
 * implementation wrote for itself would prove nothing. Every value in these files is
 * authored; this script only re-types them.
 *
 * Run from `packages/core`:
 *
 *   pnpm generate:fixtures
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(packageRoot, "test", "fixtures");

/** The fixture sets, in the order the generated module lists them. */
const SETS = ["gate", "decide", "sequence-a", "sequence-c"];

const loaded = [];
for (const set of SETS) {
  const dir = join(fixtureRoot, set);
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    loaded.push({ set, file, fixture: JSON.parse(readFileSync(join(dir, file), "utf8")) });
  }
}

const seen = new Set();
for (const { set, file, fixture } of loaded) {
  const where = `${set}/${file}`;
  for (const field of ["id", "title"]) {
    if (typeof fixture[field] !== "string" || fixture[field].length === 0) {
      throw new Error(`${where}: needs a non-empty ${field}`);
    }
  }
  if (!Array.isArray(fixture.rules) || fixture.rules.length === 0) {
    throw new Error(`${where}: needs at least one rule id`);
  }
  for (const rule of fixture.rules) {
    if (!/^(AF|PV|GT|DK|AZ|SR|RT|CV|TL)-\d+$/.test(rule)) {
      throw new Error(`${where}: ${JSON.stringify(rule)} is not a rulebook id`);
    }
  }
  if (seen.has(fixture.id)) throw new Error(`${where}: duplicate id ${fixture.id}`);
  seen.add(fixture.id);
  for (const field of ["given", "expect"]) {
    if (typeof fixture[field] !== "object" || fixture[field] === null) {
      throw new Error(`${where}: needs a ${field} object`);
    }
  }
  if (fixture.given.step === undefined) throw new Error(`${where}: given needs a step`);
  if (typeof fixture.given.clock !== "string") throw new Error(`${where}: given needs a clock`);
}

/** A TypeScript object-literal expression for a JSON value. */
function literal(value, indent) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${inner}${literal(item, inner)}`).join(",\n")},\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const entries = keys.map(
    (key) => `${inner}${JSON.stringify(key)}: ${literal(value[key], inner)}`,
  );
  return `{\n${entries.join(",\n")},\n${indent}}`;
}

const module = `// GENERATED FILE - DO NOT EDIT BY HAND.
// Produced by scripts/generate-fixtures.mjs from test/fixtures/<set>/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a fixture: edit its JSON file, then run
// \`pnpm generate:fixtures\` from packages/core.

import type { Fixture } from "../../src/testing.js";

/** Every fixture, in set order then file order. */
export const fixtures: readonly Fixture[] = [
${loaded.map(({ set, file, fixture }) => `  // ${set}/${file}\n  ${literal(fixture, "  ")}`).join(",\n")},
];

/** The fixtures in one set, named by its id prefix. */
export function fixtureSet(prefix: string): readonly Fixture[] {
  return fixtures.filter((fixture) => fixture.id.startsWith(\`\${prefix}/\`));
}

/** A fixture by id, for a test that names one. */
export function fixture(id: string): Fixture {
  const found = fixtures.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(\`no fixture with id \${JSON.stringify(id)}\`);
  return found;
}
`;

writeFileSync(join(fixtureRoot, "fixtures.generated.ts"), module);

console.log(
  `fixtures: mirrored ${String(loaded.length)} file(s) into test/fixtures/fixtures.generated.ts`,
);
