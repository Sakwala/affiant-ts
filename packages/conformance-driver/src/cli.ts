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
 *
 *   affiant-conformance adapter --package @affiant/adapter-ai-sdk
 * ```
 *
 * The default command runs **both** fixture sections: the conformance section
 * against `@affiant/core`, and the adapter section once for the one adapter this
 * implementation ships and declares. The rulebook asserts the failing set over the
 * union of the sections a run covered, so the run document carries both and the
 * comparison is made once.
 *
 * `adapter` runs the adapter section alone, for one named package — what a host
 * reaches for while it is working on an adapter and does not want to wait for the
 * other sixty-eight documents.
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

import { adapterRunDocument, mergeRuns, runAdapterSection } from "./adapter.js";
import { aiSdkAdapter } from "./adapters/ai-sdk.js";
import { compareToManifest, describeVerdict, parityManifest } from "./parity.js";
import { runConformance, validateRunDocument } from "./run.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every Affiant adapter this implementation ships and declares.
 *
 * The rulebook scopes the adapter fixture section at the section level: a driver
 * runs it once for each of these, and an implementation that ships none runs none
 * and publishes `adapters: []`. Adding a second adapter is adding a binding here.
 */
const ADAPTERS = [aiSdkAdapter];

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

// ---------------------------------------------------------------------------
// `adapter` — the adapter section alone, for one named package
// ---------------------------------------------------------------------------

if (process.argv[2] === "adapter") {
  const named = flag("package");
  const binding =
    typeof named === "string" ? ADAPTERS.find((one) => one.package === named) : ADAPTERS[0];
  if (binding === undefined) {
    console.error(
      `this driver ships no adapter named ${JSON.stringify(named)}. It ships: ` +
        `${ADAPTERS.map((one) => one.package).join(", ")}.`,
    );
    process.exit(1);
  }

  const section = await runAdapterSection(binding);
  const document = adapterRunDocument(section, parityManifest.protocolTag);
  const schemaProblems = validateRunDocument(document);
  if (schemaProblems.length > 0) {
    console.error("The run document does not validate against conformance/results.schema.json:");
    for (const problem of schemaProblems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(
    `${binding.package}@${binding.version} on ${binding.runtime}` +
      `${binding.runtimeVersion === undefined ? "" : `@${binding.runtimeVersion}`}, ` +
      `protocol ${document.protocolTag}: ${String(document.summary.passed)} passed, ` +
      `${String(document.summary.failed)} failed, ${String(document.summary.errored)} errored of ` +
      `${String(document.summary.total)}`,
  );
  if (section.failingIds.length === 0) process.exit(0);

  console.error("the adapter section does not pass:");
  for (const result of section.results) {
    if (result.outcome === "pass") continue;
    const where = result.diff?.map((entry) => entry.at).join(", ") ?? result.reason ?? "";
    console.error(`  ${result.id} — ${result.outcome}${where === "" ? "" : `: ${where}`}`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The default command — both sections, one document, one comparison
// ---------------------------------------------------------------------------

const base = await runConformance({
  ...(typeof runtime === "string" ? { runtime } : {}),
  ...(typeof flag("commit") === "string" ? { commit: flag("commit") as string } : {}),
});

const sections = [];
for (const binding of ADAPTERS) sections.push(await runAdapterSection(binding));
const run = mergeRuns(base, ...sections);

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
  const file = join(packageRoot, "conformance", "parity", "typescript-v0.2.json");
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
    `parity: the failing set equals conformance/parity/typescript-v0.2.json ` +
      `(${String(parityManifest.failing.length)} listed)`,
  );
  process.exit(0);
}

console.error("parity: the failing set does not equal the published manifest.");
for (const line of describeVerdict(verdict, run)) console.error(`  ${line}`);
console.error(
  "A parity manifest is a published claim about this implementation. Fix the regression, or " +
    "publish the change by editing conformance/parity/typescript-v0.2.json in the same pull request.",
);
process.exit(1);
