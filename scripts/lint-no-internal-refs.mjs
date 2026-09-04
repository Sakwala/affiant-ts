#!/usr/bin/env node
/**
 * No private working vocabulary in anything this repository publishes.
 *
 * The packages here go to npm and their doc comments go with them: `tsc` copies a
 * `/** … *\/` block into the emitted `.d.ts` and `.js` alike, so a note written for
 * the people building this framework is read by every consumer who hovers a symbol.
 * A citation of an internal decision record is the worst kind: it looks
 * authoritative, it resolves to nothing a reader can open, and it tells them the
 * documentation was written for somebody else.
 *
 * The rule is therefore about what the published source may *contain*, not about
 * what any code path does — which is why it is a lint and not a test, the same shape
 * as `packages/core/scripts/lint-no-durable-object.mjs`.
 *
 * **What to write instead.** State the reason itself, and cite the public rulebook
 * id — `GT-4`, `AF-2`, `AZ-1` — which resolves in
 * https://github.com/Sakwala/affiant-protocol. "**Required** (decision record 31)"
 * becomes "**Required**: `expiresAt` is not nullable, so every filed entry carries a
 * deadline (GT-4)". The second is shorter *and* it answers the question.
 *
 * Scope: `packages/<name>/src/`, `samples/<name>/src/`, `spikes/<name>/src/`, and every
 * `README.md` and
 * `CHANGELOG.md` in the repository. Tests and fixtures are excluded: they are not
 * published, and a fixture whose note quotes a rule needs room to quote it.
 *
 * **Generated modules are excluded too**, by their banner. A module written by a
 * generator out of the vendored rulebook carries the rulebook's own words — a
 * conformance fixture whose external reference reads `ledger:limit/9` is somebody
 * else's accounting example, not this project's working vocabulary — and there is
 * no doc comment in it for a person to fix. The rule is about prose a human wrote
 * and a consumer will read; a data module has neither half.
 *
 * Usage:
 *
 *   node scripts/lint-no-internal-refs.mjs                # lints the scope above
 *   node scripts/lint-no-internal-refs.mjs <path> [...]   # lints the given files or directories
 *
 * Exits 0 when clean, 1 with one line per violation otherwise.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Only text sources are read; anything else in a target directory is skipped. */
const LINTABLE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".md"]);

/** The first line every generated module carries. A file starting with it is skipped. */
const GENERATED_BANNER = "// GENERATED FILE — DO NOT EDIT BY HAND.";

/** Directories never walked, whatever a target says. */
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", ".git"]);

/**
 * Each rule is `[regexp, what a reader should see in the failure]`. The patterns
 * match source text rather than parsing it: this is a tripwire, and a tripwire that
 * is easy to read is one a reviewer can trust.
 *
 * The proper nouns are case-sensitive because their lowercase forms are ordinary
 * English; the rest are not, because their capitalisation carries no meaning.
 */
const FORBIDDEN = [
  [/\bBD-\d+\b/, "a citation of an internal decision record (BD-n)"],
  [/\bledgers?\b/i, 'the word "ledger" — name the record, or cite the rulebook id'],
  [/\bOrrery\b/, "the name of a private project (Orrery)"],
  [/\bFin\b(?=\s)/, "the name of a private working agent (Fin)"],
  [/ratification/i, 'the word "ratification" — an internal governance term'],
  [/\bconductors?\b/i, 'the word "conductor" — an internal orchestration term'],
  [/\btrackers?\b/i, 'the word "tracker" — an internal planning artefact'],
  [/\bchancery\b/i, "the name of a private working area (chancery)"],
  [/\bMission Control\b/i, "the name of a private working surface (Mission Control)"],
  [/\breadiness report\b/i, "a citation of an internal readiness report"],
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
    if (SKIP_DIRECTORIES.has(child.name)) continue;
    const path = join(target, child.name);
    if (child.isDirectory()) out.push(...filesUnder(path));
    else if (child.isFile() && LINTABLE.has(extensionOf(child.name))) out.push(path);
  }
  return out;
}

/** Every `README.md` and `CHANGELOG.md` in the repository, in path order. */
function publishedProse(directory) {
  const out = [];
  for (const child of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (SKIP_DIRECTORIES.has(child.name)) continue;
    const path = join(directory, child.name);
    if (child.isDirectory()) out.push(...publishedProse(path));
    else if (child.name === "README.md" || child.name === "CHANGELOG.md") out.push(path);
  }
  return out;
}

/** The published sources, when no target is given on the command line. */
function defaultTargets() {
  const out = [];
  for (const group of ["packages", "samples", "spikes"]) {
    const groupRoot = join(repoRoot, group);
    let entries;
    try {
      entries = readdirSync(groupRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!child.isDirectory() || SKIP_DIRECTORIES.has(child.name)) continue;
      const source = join(groupRoot, child.name, "src");
      try {
        if (statSync(source).isDirectory()) out.push(source);
      } catch {
        // A package with no `src/` is not a failure; there is simply nothing to read.
      }
    }
  }
  return [...out, ...publishedProse(repoRoot)];
}

const argumentTargets = process.argv.slice(2);
const roots =
  argumentTargets.length > 0 ? argumentTargets.map((target) => resolve(target)) : defaultTargets();

const violations = [];
const seen = new Set();
let scanned = 0;
let generated = 0;

for (const root of roots) {
  for (const file of filesUnder(root)) {
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    if (text.startsWith(GENERATED_BANNER)) {
      generated += 1;
      continue;
    }
    scanned += 1;
    const lines = text.split("\n");
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
  console.error("Published source may not carry this project's private working vocabulary.");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    `${violations.length} violation(s) in ${scanned} file(s). ` +
      "State the reason itself and cite the public rulebook id instead.",
  );
  process.exit(1);
}

console.log(
  `No internal references: clean — ${scanned} published file(s) read` +
    (generated > 0 ? `, ${generated} generated module(s) skipped.` : "."),
);
