/**
 * The run: every document the protocol's conformance manifest lists, put through
 * `@affiant/core`, reported as one `results.schema.json` document.
 *
 * This is the *driver* half of the arrangement the rulebook describes in
 * `conformance/DRIVER.md`. The fixtures name no class, no file and no language;
 * this module is the only place that knows any of that. It has five obligations,
 * and each one is a place a driver can quietly go wrong:
 *
 * 1. **Pin a ref.** The documents come from `@affiant/contract`, which vendors them
 *    byte-for-byte from one ref of the rulebook and records a checksum for every
 *    file. Nothing here fetches anything, and nothing here has its own copy — a
 *    second copy is a second thing to drift.
 * 2. **Supply the four ports from `given`.** `@affiant/core/testing`'s runner does
 *    this: a scripted inference port, a projection port reading the fixture's own
 *    entity table, an allowlist authorization port and a fixed clock. No wall clock
 *    is read anywhere in a run.
 * 3. **Bind each step kind.** Also the runner's, and the runner is the published
 *    one — what a driver for a second implementation will run against that
 *    implementation is exactly what runs here.
 * 4. **Run every document the manifest lists, and emit the result.** Every one,
 *    including the ones that pass: a run that reported only failures could not be
 *    checked for completeness. A document that cannot be run at all is an `error`,
 *    never an absence and never a silent skip.
 * 5. **Assert the failing set equals the parity manifest.** That is `./parity.js`.
 *
 * Runs unchanged on Node, on Bun and inside workerd (RT-1): it reads no file,
 * touches no Node API and reaches for no clock.
 *
 * @packageDocumentation
 */

import {
  PROTOCOL_PIN,
  canonicalVectorSchema,
  canonicalVectors,
  conformanceFixtures,
  conformanceManifest,
  fixtureSchema,
  resultsSchema,
} from "@affiant/contract/conformance";
import type {
  CanonicalVectorDocument,
  ConformanceFixtureDocument,
} from "@affiant/contract/conformance";
import type { AmendmentMap } from "@affiant/contract";
import { canonicalHash, canonicalString } from "@affiant/core";
import type { CanonicalInput, CanonicalizeOptions, ReviewerAct } from "@affiant/core";
import { runFixture } from "@affiant/core/testing";
import type { Fixture } from "@affiant/core/testing";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";

/**
 * The version of `@affiant/core` this driver reports as the implementation under
 * test.
 *
 * Pinned as a literal rather than read out of `package.json`: this module runs
 * inside workerd, which has no filesystem, and a version the run document is wrong
 * about would make the run unreproducible. `test/node/published-claims.test.ts` asserts it
 * against the package manifest on disk, so the literal cannot drift.
 */
export const IMPLEMENTATION_VERSION = "0.1.0-alpha.0";

/** The implementation name the rulebook's parity manifest and result documents use. */
export const IMPLEMENTATION_NAME = "typescript";

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to
 * the same function. Which of the two an ES module import lands on depends on the
 * runtime's CommonJS interop — and this module deliberately runs on three of them —
 * so unwrap whichever shape arrived.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

/** What one document did. `error` is not a pass and not a silent skip. */
export type Outcome = "pass" | "fail" | "error" | "skipped";

/** One stated fact that did not hold, at the path it was found. */
export interface ResultDiff {
  /** A dotted path into the expectation — `"entry.status"`, `"card.fields[1].kind"`. */
  readonly at: string;
  /** What the fixture said. */
  readonly expected?: unknown;
  /** What the implementation did. */
  readonly actual?: unknown;
}

/** One entry of the run document — one per document in the manifest, passes included. */
export interface FixtureOutcome {
  readonly id: string;
  readonly outcome: Outcome;
  readonly diff?: readonly ResultDiff[];
  readonly durationMs?: number;
  readonly reason?: string;
}

/** The run document, validating against the rulebook's `conformance/results.schema.json`. */
export interface RunDocument {
  readonly schemaVersion: "0.1.0";
  readonly implementation: {
    readonly name: string;
    readonly version: string;
    readonly commit?: string;
    readonly runtime?: string;
  };
  readonly protocolTag: string;
  readonly producedAt: string;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly errored: number;
    readonly skipped: number;
    readonly durationMs?: number;
  };
  readonly results: readonly FixtureOutcome[];
}

/** What {@link runConformance} needs that the documents do not carry. */
export interface RunOptions {
  /** The runtime the suite is being executed on — `"node"`, `"bun"`, `"workerd"`. */
  readonly runtime?: string;
  /** The commit the run was built from, when the caller knows it. */
  readonly commit?: string;
  /** The instant to stamp on the document. Defaults to now — the one clock read a run makes, and it is metadata. */
  readonly producedAt?: string;
}

/** The run, and the set the parity manifest is compared against. */
export interface ConformanceRun {
  /** The document to publish beside the claim. */
  readonly document: RunDocument;
  /** Every id whose outcome was `fail` or `error`, sorted — what a parity manifest lists. */
  readonly failingIds: readonly string[];
  /** Every id whose outcome was `skipped`, sorted. A skip nobody declared is a hole. */
  readonly skippedIds: readonly string[];
}

/**
 * The runtime this is executing on, as far as it can be told apart without
 * assuming any of the three is present.
 *
 * Named on the run document rather than inferred by a reader, because the failing
 * set must be identical on every runtime the implementation claims (RT-1) and a
 * document that could not say where it ran would make that unprovable.
 */
export function detectRuntime(): string {
  const globals = globalThis as {
    Bun?: unknown;
    navigator?: { userAgent?: string };
    process?: { versions?: { node?: string; bun?: string } };
  };
  // workerd first, and by its user agent rather than by the absence of Node's
  // globals: under `@cloudflare/vitest-pool-workers` the Node compatibility layer
  // supplies `process.versions.node`, so "no Node here" is not a test for it and a
  // run document would name the wrong runtime — the one fact RT-1 is about.
  if (globals.navigator?.userAgent === "Cloudflare-Workers") return "workerd";
  if (globals.Bun !== undefined || globals.process?.versions?.bun !== undefined) return "bun";
  if (globals.process?.versions?.node !== undefined) return "node";
  return "unknown";
}

/** A validator with every schema a run needs registered by `$id`. */
function validator(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema([fixtureSchema, canonicalVectorSchema, resultsSchema] as AnySchemaObject[]);
  return ajv;
}

/** Every error ajv found, as one line a person can read. */
function errorsOf(ajv: Ajv2020, key: string): string {
  const validate = ajv.getSchema(key);
  return (validate?.errors ?? [])
    .map(
      (error) => `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? ""}`,
    )
    .join("; ");
}

/**
 * Run every document the manifest lists and report what happened.
 *
 * Each document is validated against its own schema **before** it is run, and a
 * document that fails that check is not run at all — running it would report a
 * pass, and a pass is the one answer it must never give. The runner applies the
 * same strictness to the document's own keys: an unknown key fails the fixture,
 * and an `expect` that states no fact fails as vacuous. Without those two checks a
 * driver reports a pass for a document that asserts nothing, and the whole
 * arrangement rests on that never happening.
 */
export async function runConformance(options: RunOptions = {}): Promise<ConformanceRun> {
  const ajv = validator();
  const started = Date.now();
  const results: FixtureOutcome[] = [];

  const byId = new Map<string, ConformanceFixtureDocument | CanonicalVectorDocument>();
  for (const fixture of conformanceFixtures) byId.set(fixture.id, fixture);
  for (const vector of canonicalVectors) byId.set(vector.id, vector);

  // The manifest is the index, not the directory listing and not the arrays above:
  // a document the manifest lists and this driver does not run is an `error`, never
  // an absence. Running a subset and reporting a pass is the failure mode the whole
  // arrangement exists to prevent.
  for (const row of conformanceManifest.fixtures) {
    const document = byId.get(row.id);
    const at = Date.now();
    if (document === undefined) {
      results.push({
        id: row.id,
        outcome: "error",
        reason: `the manifest lists ${row.id}, which this driver could not load`,
        durationMs: 0,
      });
      continue;
    }
    const outcome =
      row.set === "canonical"
        ? await runVector(ajv, document as CanonicalVectorDocument)
        : await runOne(ajv, document as ConformanceFixtureDocument);
    results.push({ ...outcome, durationMs: Date.now() - at });
  }

  const failingIds = results
    .filter((result) => result.outcome === "fail" || result.outcome === "error")
    .map((result) => result.id)
    .sort();
  const skippedIds = results
    .filter((result) => result.outcome === "skipped")
    .map((result) => result.id)
    .sort();

  const document: RunDocument = {
    schemaVersion: "0.1.0",
    implementation: {
      name: IMPLEMENTATION_NAME,
      version: IMPLEMENTATION_VERSION,
      ...(options.commit === undefined ? {} : { commit: options.commit }),
      runtime: options.runtime ?? detectRuntime(),
    },
    protocolTag: PROTOCOL_PIN,
    producedAt: options.producedAt ?? new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((result) => result.outcome === "pass").length,
      failed: results.filter((result) => result.outcome === "fail").length,
      errored: results.filter((result) => result.outcome === "error").length,
      skipped: skippedIds.length,
      durationMs: Date.now() - started,
    },
    results,
  };

  return { document, failingIds, skippedIds };
}

/** One declarative fixture: validated, then run through the reference runner. */
async function runOne(ajv: Ajv2020, document: ConformanceFixtureDocument): Promise<FixtureOutcome> {
  const id = typeof fixtureSchema["$id"] === "string" ? fixtureSchema["$id"] : "";
  const validate = ajv.getSchema(id);
  if (validate === undefined) {
    return { id: document.id, outcome: "error", reason: "the fixture schema is not registered" };
  }
  if (!validate(document)) {
    return {
      id: document.id,
      outcome: "error",
      reason: `does not validate against fixture.schema.json: ${errorsOf(ajv, id)}`,
    };
  }

  try {
    // The published runner, not a private one: what a driver for a second
    // implementation will run against that implementation is what runs here.
    const result = await runFixture(document as unknown as Fixture);
    if (result.pass) return { id: document.id, outcome: "pass" };
    return {
      id: document.id,
      outcome: "fail",
      diff: result.failures.map((failure) => ({
        at: failure.at,
        expected: failure.expected,
        actual: failure.actual,
      })),
    };
  } catch (cause) {
    // A crash is an `error`, and an error counts against the implementation
    // exactly like a failure. The runner propagates a programming error in a
    // document or a port on purpose; swallowing one would hide a broken document
    // behind a green run.
    return {
      id: document.id,
      outcome: "error",
      reason: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
      diff: [{ at: "run", expected: "a completed run", actual: String(cause) }],
    };
  }
}

/**
 * One canonical byte vector (SR-1): the bytes and the digest **reproduced**
 * through the implementation's own exported helpers.
 *
 * Never re-derived here. An oracle that re-derived the binding could not catch an
 * implementation whose exported helper disagreed with it, which is precisely the
 * substitution SR-1 exists to prevent — and a driver never regenerates an
 * expectation when the two disagree, because a disagreement is the finding.
 */
async function runVector(ajv: Ajv2020, vector: CanonicalVectorDocument): Promise<FixtureOutcome> {
  const id = typeof canonicalVectorSchema["$id"] === "string" ? canonicalVectorSchema["$id"] : "";
  const validate = ajv.getSchema(id);
  if (validate === undefined) {
    return { id: vector.id, outcome: "error", reason: "the vector schema is not registered" };
  }
  if (!validate(vector)) {
    return {
      id: vector.id,
      outcome: "error",
      reason: `does not validate against canonical-vector.schema.json: ${errorsOf(ajv, id)}`,
    };
  }

  try {
    const input = vector.input as CanonicalInput;
    const amendments = vector.amendments as AmendmentMap | null;
    // The vector's `reviewerAct` is JSON as far as the schema is concerned; the act
    // it names is what PV-2 requires an amended field's tag to point at, so the
    // implementation's own type is the one applied here.
    const act = vector.reviewerAct as unknown as ReviewerAct | null;
    const options: CanonicalizeOptions | undefined =
      act === null ? undefined : { reviewerAct: act };

    const bytes = canonicalString(input, amendments, options);
    const digest = await canonicalHash(input, amendments, options);

    const diff: ResultDiff[] = [];
    if (bytes !== vector.expectedBytesUtf8) {
      diff.push({ at: "expectedBytesUtf8", expected: vector.expectedBytesUtf8, actual: bytes });
    }
    if (digest !== vector.expectedSha256) {
      diff.push({ at: "expectedSha256", expected: vector.expectedSha256, actual: digest });
    }
    return diff.length === 0
      ? { id: vector.id, outcome: "pass" }
      : { id: vector.id, outcome: "fail", diff };
  } catch (cause) {
    return {
      id: vector.id,
      outcome: "error",
      reason: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
    };
  }
}

/**
 * Whether a run document is what `conformance/results.schema.json` describes.
 *
 * The driver's own output is checked against the rulebook's schema for the same
 * reason every fixture is: a run document nobody validated is a claim about an
 * implementation in a shape no consumer agreed to.
 */
export function validateRunDocument(document: RunDocument): readonly string[] {
  const ajv = validator();
  const id = typeof resultsSchema["$id"] === "string" ? resultsSchema["$id"] : "";
  const validate = ajv.getSchema(id);
  if (validate === undefined) return ["the results schema is not registered"];
  if (validate(document)) return [];
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? ""}`,
  );
}
