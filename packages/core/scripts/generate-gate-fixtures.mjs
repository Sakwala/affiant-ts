#!/usr/bin/env node
/**
 * Mirrors the gate fixtures into a TypeScript module the portable suites can import.
 *
 *   test/fixtures/gate/*.json      the fixtures — hand-authored, and the record
 *   test/fixtures/gate.generated.ts  the same fixtures as a module
 *
 * **Why a generated module rather than importing the JSON.** The gate suite runs on
 * Node, on Bun and inside workerd (RT-1), and JSON module support differs across the
 * three — import attributes, `createRequire`, a bundler's JSON loader. A plain
 * TypeScript module carrying the same data loads identically everywhere.
 * `test/node/gate-fixtures.test.ts` asserts the module and the JSON files still agree,
 * so the mirror cannot drift.
 *
 * Unlike the canonical vectors, nothing here is computed: a gate fixture's expectation
 * is a statement about what the rule requires, and a statement an implementation wrote
 * for itself would prove nothing. Every value in these files is authored.
 *
 * Run from `packages/core`:
 *
 *   pnpm generate:gate-fixtures
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(packageRoot, "test", "fixtures", "gate");

const files = readdirSync(fixtureDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

const fixtures = files.map((file) => ({
  file,
  fixture: JSON.parse(readFileSync(join(fixtureDir, file), "utf8")),
}));

const seen = new Set();
for (const { file, fixture } of fixtures) {
  for (const field of ["id", "note"]) {
    if (typeof fixture[field] !== "string" || fixture[field].length === 0) {
      throw new Error(`${file}: needs a non-empty ${field}`);
    }
  }
  if (!Array.isArray(fixture.rules) || fixture.rules.length === 0) {
    throw new Error(`${file}: needs at least one rule id`);
  }
  if (seen.has(fixture.id)) throw new Error(`${file}: duplicate id ${fixture.id}`);
  seen.add(fixture.id);
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
// Produced by scripts/generate-gate-fixtures.mjs from test/fixtures/gate/*.json.
// The JSON files are the record; this module is how the suites read them on Node, Bun
// and workerd alike. To change a fixture: edit its JSON file, then run
// \`pnpm generate:gate-fixtures\` from packages/core.

/**
 * One gate fixture, in the shape the design record fixes: an id, the rules it checks,
 * what the host and the ports supply, and what the gate must do with it.
 *
 * \`given\` and \`expect\` are typed \`unknown\` at their leaves and narrowed by the
 * runner in \`test/gate-fixtures.test.ts\`. A fixture is data; a declaration here that
 * tried to be right for all of them would be a second implementation of the runner.
 */
export interface GateFixture {
  /** The fixture's id, matching the \`id\` in its JSON file. */
  readonly id: string;
  /** The rule ids this fixture checks. */
  readonly rules: readonly string[];
  /** What the fixture is for, and which shipped behaviour it refutes where one exists. */
  readonly note: string;
  /** The wiring, the turn and the proposal. */
  readonly given: Readonly<Record<string, unknown>>;
  /** What the gate must produce: a refusal, a row, an Affidavit, a card. */
  readonly expect: Readonly<Record<string, unknown>>;
}

/** Every fixture, in file order. */
export const gateFixtures: readonly GateFixture[] = [
${fixtures.map(({ file, fixture }) => `  // ${file}\n  ${literal(fixture, "  ")}`).join(",\n")},
];

/** A fixture by id, for a test that names one. */
export function gateFixture(id: string): GateFixture {
  const found = gateFixtures.find((fixture) => fixture.id === id);
  if (found === undefined) throw new Error(\`no gate fixture with id \${JSON.stringify(id)}\`);
  return found;
}
`;

writeFileSync(join(packageRoot, "test", "fixtures", "gate.generated.ts"), module);

console.log(
  `gate fixtures: mirrored ${String(fixtures.length)} file(s) into test/fixtures/gate.generated.ts`,
);
