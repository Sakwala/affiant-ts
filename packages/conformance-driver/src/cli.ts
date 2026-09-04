#!/usr/bin/env node
/**
 * `affiant-conformance` — run the protocol's conformance suite against
 * `@affiant/core`, write the run document, and check it against the published
 * parity manifest.
 *
 * ```
 *   affiant-conformance                     # run, write, and assert
 *   affiant-conformance --out <directory>   # write the run document elsewhere
 *   affiant-conformance --runtime bun       # name the runtime on the document
 *   affiant-conformance --no-write          # assert only; write nothing
 *   affiant-conformance --write-manifest    # regenerate the parity manifest file
 * ```
 *
 * Exits `0` when the failing set equals the manifest exactly, and `1` on any
 * difference in either direction — a document that started failing, or one that
 * started passing and is still listed as failing.
 *
 * The Node half of this package: it writes files and reads `process.argv`. The run
 * itself is in `./run.js`, which touches neither and runs on Bun and inside
 * workerd unchanged.
 *
 * **`--write-manifest` never commits.** A change to the failing set is a change to
 * a published claim about an implementation and belongs in a pull request a person
 * read.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareToManifest, describeVerdict, parityManifest } from "./parity.js";
import { runConformance, validateRunDocument } from "./run.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One `--flag value` or `--flag` from the command line. */
function flag(name: string): string | true | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  return next === undefined || next.startsWith("--") ? true : next;
}

const runtime = flag("runtime");
const out = flag("out");
const write = flag("no-write") === undefined;

const run = await runConformance({
  ...(typeof runtime === "string" ? { runtime } : {}),
  ...(typeof flag("commit") === "string" ? { commit: flag("commit") as string } : {}),
});

const schemaErrors = validateRunDocument(run.document);
if (schemaErrors.length > 0) {
  // The driver's own output is held to the rulebook's schema for the same reason
  // every fixture is: a run document nobody validated is a claim about an
  // implementation in a shape no consumer agreed to.
  console.error("The run document does not validate against conformance/results.schema.json:");
  for (const error of schemaErrors) console.error(`  ${error}`);
  process.exit(1);
}

if (write) {
  const directory =
    typeof out === "string" ? resolve(out) : join(packageRoot, "conformance", "results");
  const suffix =
    run.document.implementation.runtime === undefined ||
    run.document.implementation.runtime === "node"
      ? ""
      : `-${run.document.implementation.runtime}`;
  const file = join(
    directory,
    `${run.document.implementation.name}-${run.document.implementation.version}${suffix}.json`,
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, `${JSON.stringify(run.document, null, 2)}\n`);
  console.log(`run document: ${file}`);
}

if (flag("write-manifest") !== undefined) {
  const file = join(packageRoot, "conformance", "parity", "typescript-v0.1.json");
  writeFileSync(file, `${JSON.stringify(parityManifest, null, 2)}\n`);
  console.log(`parity manifest: ${file} (regenerated — commit it in a pull request a person read)`);
}

const { summary, implementation, protocolTag } = run.document;
console.log(
  `${implementation.name}@${implementation.version} on ${implementation.runtime ?? "unknown"}, ` +
    `protocol ${protocolTag}: ${String(summary.passed)} passed, ${String(summary.failed)} failed, ` +
    `${String(summary.errored)} errored, ${String(summary.skipped)} skipped of ${String(summary.total)}`,
);

const verdict = compareToManifest(run);
if (verdict.matches) {
  console.log(
    `parity: the failing set equals conformance/parity/typescript-v0.1.json ` +
      `(${String(parityManifest.failing.length)} listed)`,
  );
  process.exit(0);
}

console.error("parity: the failing set does not equal the published manifest.");
for (const line of describeVerdict(verdict, run)) console.error(`  ${line}`);
console.error(
  "A parity manifest is a published claim about this implementation. Fix the regression, or " +
    "publish the change by editing conformance/parity/typescript-v0.1.json in the same pull request.",
);
process.exit(1);
