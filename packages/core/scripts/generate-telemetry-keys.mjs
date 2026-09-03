#!/usr/bin/env node
/**
 * Turns the telemetry-key registry (`telemetry-keys.json`) into a committed
 * TypeScript module:
 *
 *   src/telemetry-keys.ts    the registry as a frozen `as const` array
 *
 * Why generate rather than import the JSON directly: this package has to load on
 * Node, on Bun and inside Cloudflare workerd, and JSON module support differs
 * across the three (import attributes, `createRequire`, bundler JSON loaders). A
 * plain TypeScript module carrying the same data loads identically everywhere, and
 * `telemetry-keys.json` stays the single record a reader edits. This mirrors how
 * `packages/contract` generates `src/schemas.ts` from its vendored protocol JSON.
 *
 * TL-1: the registry is a versioned API. A key is never renamed and never removed,
 * only deprecated; `since` records the package version a key first shipped in.
 *
 * Usage:
 *
 *   node scripts/generate-telemetry-keys.mjs            write src/telemetry-keys.ts
 *   node scripts/generate-telemetry-keys.mjs --check    exit 1 if it is out of date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(packageRoot, "telemetry-keys.json");
const outputPath = join(packageRoot, "src", "telemetry-keys.ts");

const registry = JSON.parse(readFileSync(registryPath, "utf8"));

const seen = new Set();
for (const entry of registry.keys) {
  for (const field of ["key", "since", "description"]) {
    if (typeof entry[field] !== "string" || entry[field].length === 0) {
      throw new Error(`telemetry-keys.json: entry ${JSON.stringify(entry.key)} needs a ${field}`);
    }
  }
  if (!Array.isArray(entry.attributes)) {
    throw new Error(
      `telemetry-keys.json: entry ${JSON.stringify(entry.key)} needs an attributes array`,
    );
  }
  if (seen.has(entry.key)) {
    throw new Error(`telemetry-keys.json: duplicate key ${JSON.stringify(entry.key)}`);
  }
  seen.add(entry.key);
}

/** JSON.stringify's output is a valid TypeScript expression for these values. */
const json = (value) => JSON.stringify(value);

const entries = registry.keys
  .map(
    (entry) =>
      `  /** ${entry.description} Since ${entry.since}. */\n` +
      `  {\n` +
      `    key: ${json(entry.key)},\n` +
      `    since: ${json(entry.since)},\n` +
      `    description: ${json(entry.description)},\n` +
      `    attributes: [${entry.attributes.map(json).join(", ")}],\n` +
      `  },`,
  )
  .join("\n");

const module = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-telemetry-keys.mjs from telemetry-keys.json.
// To change it: edit telemetry-keys.json, then run \`pnpm -C packages/core generate\`.

/** One entry in the telemetry-key registry (TL-1). */
export interface TelemetryKeyEntry {
  /** The event name. Never renamed, never removed — only deprecated. */
  readonly key: string;
  /** The package version this key first shipped in. */
  readonly since: string;
  /** What the event means, in one line. */
  readonly description: string;
  /**
   * The attribute names the gate carries on this event. Filled per key by the
   * pull request that starts emitting it; OpenTelemetry's \`gen_ai.*\` vocabulary
   * is used where a name exists there (TL-2).
   */
  readonly attributes: readonly string[];
}

/** The version of the registry itself. */
export const TELEMETRY_REGISTRY_VERSION = ${json(registry.registryVersion)};

/** Every telemetry key, in registry order. */
export const TELEMETRY_KEYS = [
${entries}
] as const satisfies readonly TelemetryKeyEntry[];
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== module) {
    console.error(
      `src/telemetry-keys.ts is out of date with telemetry-keys.json — run \`pnpm -C packages/core generate\`.`,
    );
    process.exit(1);
  }
  console.log(`src/telemetry-keys.ts is in sync (${registry.keys.length} keys)`);
} else {
  writeFileSync(outputPath, module);
  console.log(`generated src/telemetry-keys.ts (${registry.keys.length} keys)`);
}
