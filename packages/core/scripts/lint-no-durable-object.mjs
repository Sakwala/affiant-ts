#!/usr/bin/env node
/**
 * RT-3: no Affidavit, Docket entry or attestation record lives in Durable Object
 * storage.
 *
 * Durable Object state is *working* state — an alarm, a cursor, an entry id. The
 * audit record lives in the production store. A host adopting an agents SDK whose
 * default state store is DO-embedded must route the record elsewhere, and the way
 * that rule stays true as this package grows is that the package cannot reach a
 * Durable Object API at all: no `cloudflare:workers` import, no
 * `DurableObjectStorage` or `DurableObjectState` type, no `ctx.storage`.
 *
 * A lint rather than a test because the rule is about what the source may *contain*,
 * not about what a code path does at runtime — an import that is never called is
 * exactly the drift this catches.
 *
 * Usage:
 *
 *   node scripts/lint-no-durable-object.mjs                # lints packages/core/src
 *   node scripts/lint-no-durable-object.mjs <path> [...]   # lints the given files or directories
 *
 * Exits 0 when clean, 1 with one line per violation otherwise.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Only text sources are read; anything else in a target directory is skipped. */
const LINTABLE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"]);

/**
 * Each rule is `[regexp, what a reader should see in the failure]`. The patterns
 * are written to match source text, not to parse it: this is a tripwire, and a
 * tripwire that is easy to read is one a reviewer can trust.
 */
const FORBIDDEN = [
  [/["']cloudflare:workers["']/, 'an import of "cloudflare:workers"'],
  [/\bDurableObjectStorage\b/, "the DurableObjectStorage type"],
  [/\bDurableObjectState\b/, "the DurableObjectState type"],
  [/\bctx\s*\.\s*storage\b/, "ctx.storage (Durable Object storage)"],
];

function extensionOf(path) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

/** Every lintable file at or under `target`. */
function filesUnder(target) {
  const stats = statSync(target);
  if (stats.isFile()) return LINTABLE.has(extensionOf(target)) ? [target] : [];
  const out = [];
  for (const child of readdirSync(target, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const path = join(target, child.name);
    if (child.isDirectory()) out.push(...filesUnder(path));
    else if (child.isFile() && LINTABLE.has(extensionOf(child.name))) out.push(path);
  }
  return out;
}

const targets = process.argv.slice(2);
const roots = targets.length > 0 ? targets.map((t) => resolve(t)) : [join(packageRoot, "src")];

const violations = [];
let scanned = 0;

for (const root of roots) {
  for (const file of filesUnder(root)) {
    scanned += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push(`${relative(process.cwd(), file)}:${index + 1}: ${what}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("RT-3: the Affiant core may not reach Durable Object storage.");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    `${violations.length} violation(s) in ${scanned} file(s). ` +
      "Durable Object state is working state; the audit record lives in the production store.",
  );
  process.exit(1);
}

console.log(`RT-3: clean — no Durable Object storage reachable from ${scanned} file(s).`);
