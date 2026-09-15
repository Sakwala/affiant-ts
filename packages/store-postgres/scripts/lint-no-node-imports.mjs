#!/usr/bin/env node
/**
 * RT-1, at the level this package can actually hold it: no Node API reachable from
 * `src/`.
 *
 * Every other package here proves its runtime neutrality by type-checking `src/` with
 * `types: []`, so a Node global does not even resolve. This one cannot: postgres.js
 * declares its connection types in terms of `node:stream`, so `src/` is checked with
 * Node's declarations in scope and that particular proof is unavailable. The rule
 * itself is unchanged — the package's own code must run on Node, on workerd and under
 * Bun alike — so it is enforced here instead: no `node:` specifier and no bare Node
 * built-in may be imported or required anywhere under `src/`.
 *
 * A lint rather than a test, for the same reason as the Durable Object tripwire next
 * to it: the rule is about what the published source may *contain*, and an import that
 * no code path reaches is exactly the drift this catches. The suites that run inside
 * workerd are the other half of the proof, and they catch the rest.
 *
 * Usage:
 *
 *   node scripts/lint-no-node-imports.mjs                # lints packages/store-postgres/src
 *   node scripts/lint-no-node-imports.mjs <path> [...]   # lints the given files or directories
 *
 * Exits 0 when clean, 1 with one line per violation otherwise.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Only text sources are read; anything else in a target directory is skipped. */
const LINTABLE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

/**
 * The Node built-ins that are also importable without the `node:` prefix. Listed
 * rather than pattern-matched so that a module name this package legitimately uses
 * cannot be caught by accident.
 */
const BARE_BUILTINS = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
];

const BARE = BARE_BUILTINS.join("|");

/**
 * Each rule is `[regexp, what a reader should see in the failure]`. The patterns match
 * source text rather than parsing it: this is a tripwire, and a tripwire that is easy
 * to read is one a reviewer can trust.
 */
const FORBIDDEN = [
  [/from\s+["']node:[a-z_/]+["']/, 'an import from a "node:" module'],
  [/import\s+["']node:[a-z_/]+["']/, 'a side-effect import of a "node:" module'],
  [/import\s*\(\s*["']node:[a-z_/]+["']/, 'a dynamic import of a "node:" module'],
  [/require\s*\(\s*["']node:[a-z_/]+["']/, 'a require of a "node:" module'],
  [new RegExp(`from\\s+["'](${BARE})(/[a-z_/]+)?["']`), "an import of a Node built-in"],
  [new RegExp(`require\\s*\\(\\s*["'](${BARE})(/[a-z_/]+)?["']`), "a require of a Node built-in"],
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
  console.error("RT-1: this package's sources may not reach a Node API.");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    `${violations.length} violation(s) in ${scanned} file(s). ` +
      "The store runs on Node, on workerd and under Bun; only the driver's typings are Node's.",
  );
  process.exit(1);
}

console.log(`RT-1: clean — no Node API reachable from ${scanned} file(s).`);
