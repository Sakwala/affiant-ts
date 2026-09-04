/**
 * `@affiant/conformance-driver` — the Affiant protocol's conformance suite, run
 * against `@affiant/core`.
 *
 * Affiant turns every database write an LLM agent proposes into an **Affidavit**
 * filed under a **Docket** entry and shown to a person as an **Evidence Card**.
 * The rules that record must obey are numbered in the protocol rulebook
 * ({@link https://github.com/Sakwala/affiant-protocol}), and a **conformance
 * suite** of declarative documents pins them: each one is a wiring, a sequence of
 * acts, and what must then be true, written in a format that names no class, no
 * file and no language.
 *
 * A **driver** is the per-implementation program that binds those documents to one
 * implementation and reports what happened. This is the TypeScript one. It runs
 * every document the rulebook's manifest lists, emits a machine-readable run
 * document, and asserts that the set of documents it does not pass equals the
 * **parity manifest** this implementation publishes — in both directions, so a
 * regression and a quietly-closed gap are equally loud.
 *
 * Two entry points, and the second is why the first exists:
 *
 * ```ts
 * import { compareToManifest, runConformance } from "@affiant/conformance-driver";
 *
 * const run = await runConformance();
 * const verdict = compareToManifest(run);
 * if (!verdict.matches) process.exitCode = 1;
 * ```
 *
 * A host embedding `@affiant/core` can run the same suite against its own wiring
 * with the `affiant-conformance` command, and publish the run document beside
 * whatever it claims about the framework it depends on.
 *
 * @packageDocumentation
 */

export {
  IMPLEMENTATION_NAME,
  IMPLEMENTATION_VERSION,
  detectRuntime,
  runConformance,
  validateRunDocument,
} from "./run.js";
export type {
  ConformanceRun,
  FixtureOutcome,
  Outcome,
  ResultDiff,
  RunDocument,
  RunOptions,
} from "./run.js";

export {
  compareToManifest,
  describeVerdict,
  inheritedExemptions,
  parityManifest,
} from "./parity.js";
export type {
  ExemptionRow,
  FailingRow,
  ParityManifest,
  ParityVerdict,
  RuntimeClaim,
} from "./parity.js";
