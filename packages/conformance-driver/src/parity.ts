/**
 * The parity manifest: this implementation's published statement of exactly which
 * conformance documents it does **not** pass, and why — and the assertion that
 * compares a run against it.
 *
 * **Why a published list at all.** Two implementations of the same rulebook will
 * not reach it at the same moment, and pretending otherwise produces either a
 * suite nobody runs or a suite everybody quietly disables. A parity manifest makes
 * the gap a *published fact with a name*: somebody deciding whether to adopt an
 * implementation can see, before installing anything, which numbered rules it does
 * not yet meet and what its authors are doing about each one.
 *
 * **Why the comparison runs in both directions.** A fixture that starts failing and
 * is not listed is a regression, or a rule the implementation never met and nobody
 * wrote down. A fixture that starts passing and is still listed is a gap that has
 * been closed and not published. A check that caught only the first would let a fix
 * rot unrecorded, and the manifest would drift into a document nobody trusts.
 *
 * The format is the rulebook's `conformance/PARITY.md`, and the shape is its
 * `conformance/parity/MANIFEST.schema.json`. This module is the source; the
 * committed JSON beside it (`conformance/parity/typescript-v0.1.json`) is the
 * artifact, and `test/node/parity-file.test.ts` asserts the two are identical, so
 * the file cannot be regenerated without being committed — and cannot be edited
 * without the module saying so.
 *
 * @packageDocumentation
 */

import { PROTOCOL_PIN, coverageExemptions } from "@affiant/contract/conformance";

import { IMPLEMENTATION_NAME, IMPLEMENTATION_VERSION } from "./run.js";
import type { ConformanceRun } from "./run.js";

/** One document this implementation does not pass, and what is being done about it. */
export interface FailingRow {
  /** The document's id, exactly as the rulebook's manifest spells it. */
  readonly id: string;
  /** The rulebook ids it checks, copied from the document. */
  readonly rules: readonly string[];
  /** What is being done: corrected in a named release, fenced by a named workaround, or nothing. */
  readonly disposition: "fixed" | "fenced" | "ignored";
  /** What the implementation does instead and why it matters. One or two sentences, not a stack trace. */
  readonly detail: string;
  /** The release that corrects it. Required when `disposition` is `"fixed"`. */
  readonly fixedIn?: string;
  /** The host-side workaround. Required when `disposition` is `"fenced"`. */
  readonly fence?: string;
  /** Where the gap is recorded in this implementation's own issues. */
  readonly issue?: string;
  /** True when the rulebook's negative oracle expected this document to fail here. */
  readonly oracle?: boolean;
}

/** A runtime this manifest holds for (RT-1). */
export interface RuntimeClaim {
  readonly name: string;
  readonly version?: string;
  readonly claimed: boolean;
  readonly note?: string;
}

/** A rulebook exemption this implementation inherits, and what it checks in its place. */
export interface ExemptionRow {
  readonly rule: string;
  readonly until?: string;
  readonly reason: string;
  readonly checkedInstead?: string;
}

/** The published claim, in the rulebook's `parity/MANIFEST.schema.json` shape. */
export interface ParityManifest {
  readonly schemaVersion: "0.1.0";
  readonly implementation: string;
  readonly version: string;
  readonly protocolTag: string;
  readonly producedAt: string;
  readonly runLog?: string;
  readonly failing: readonly FailingRow[];
  readonly runtimes: readonly RuntimeClaim[];
  readonly exemptions: readonly ExemptionRow[];
  readonly notes?: string;
}

/**
 * What this implementation checks in place of each rule the rulebook excuses from
 * carrying a conformance fixture.
 *
 * The **reasons** are the rulebook's and are copied verbatim from
 * `conformance/lint/coverage-exemptions.json`; only these sentences are this
 * implementation's, and they name a suite or a lint a reader can go and run. An
 * implementation may not invent an exemption — exempting yourself from a rule is
 * not a parity report — so a rule absent from the rulebook's list cannot appear
 * here at all, and one present with nothing standing in for it says nothing rather
 * than something reassuring.
 */
const CHECKED_INSTEAD: Readonly<Record<string, string>> = {
  "SR-5":
    "the superseded 0.0.1-seed wire fixtures are validated against their own schemas in " +
    "@affiant/contract's schema suite, and no code path in @affiant/core reads a transport",
  "AF-5":
    "@affiant/contract's schema suite validates the three tool-result fixtures and refuses a " +
    "result carrying the seed's $type discriminator; its type-level suite narrows every union " +
    "on its own discriminator and fails to compile on a property read from the wrong arm",
  "SR-3":
    "@affiant/contract's schema suite validates all 45 positive v0.1 fixtures against schemas " +
    "closed with additionalProperties: false, and asserts that all 22 schema negatives are refused",
  "RT-1":
    "the three-runtime CI matrix — this driver and @affiant/core's whole suite on Node, Bun and " +
    "workerd — plus a type-check of packages/core/src with types: [] so no Node global resolves",
  "RT-2":
    "packages/core/test/node/gate-budget.test.ts and docket-budget.test.ts: a ten-field Affidavit " +
    "filed and decided a thousand times inside a stated per-request bound, and a Docket that does " +
    "not slow down as it grows",
  "RT-3":
    "packages/core/scripts/lint-no-durable-object.mjs, wired into pnpm lint: the package cannot " +
    "reach a Durable Object API at all, so an import that is never called is caught too",
  "TL-1":
    "packages/core/test/node/telemetry-registry.test.ts, which pins the shipped registry against " +
    "the generated module both ways, and every conformance fixture that asserts a telemetry key",
  "TL-2":
    "packages/core/telemetry-keys.json carries each key's attribute names, and the registry suite " +
    "checks the generated module against it; the names themselves are reviewed against the " +
    "conventions the rulebook names",
};

/**
 * The rulebook's exemptions, copied, each with what this implementation does
 * instead where something does.
 *
 * Built from the vendored list rather than retyped, so a rule the rulebook stops
 * exempting stops appearing here in the same pull request that moves the pin.
 */
export const inheritedExemptions: readonly ExemptionRow[] = coverageExemptions.exemptions.map(
  (exemption): ExemptionRow => {
    const instead = CHECKED_INSTEAD[exemption.rule];
    return {
      rule: exemption.rule,
      until: exemption.until,
      reason: exemption.reason,
      ...(instead === undefined ? {} : { checkedInstead: instead }),
    };
  },
);

/**
 * The claim: `@affiant/core` passes every document in the promoted suite.
 *
 * An empty `failing[]` is the strongest possible statement and is what a
 * conformant implementation publishes — and it is only worth anything because the
 * assertion below is merge-blocking in this repository, so the day one of these
 * documents stops passing is the day a pull request stops merging.
 *
 * This implementation is the one the fixtures were promoted from, which is why the
 * list is empty rather than because it is generous with itself: the rulebook's
 * negative oracle exists for exactly that suspicion, and it applies to the *other*
 * implementation's manifest, where every document the oracle names must appear.
 */
export const parityManifest: ParityManifest = {
  schemaVersion: "0.1.0",
  implementation: IMPLEMENTATION_NAME,
  version: IMPLEMENTATION_VERSION,
  protocolTag: PROTOCOL_PIN,
  producedAt: "2026-09-04T00:00:00.000Z",
  runLog: "packages/conformance-driver/conformance/results/typescript-0.1.0-alpha.0.json",
  failing: [],
  runtimes: [
    { name: "node", version: ">=22", claimed: true },
    {
      name: "bun",
      claimed: true,
      note: "the same suite, run under Bun in this repository's CI",
    },
    {
      name: "workerd",
      claimed: true,
      note: "run through @cloudflare/vitest-pool-workers — the runtime a Cloudflare Worker host would execute @affiant/core on",
    },
  ],
  exemptions: inheritedExemptions,
  notes:
    "The protocolTag is a commit rather than a tag: the rulebook's v0.1 text is on its default " +
    "branch and v0.1.0 has not been cut. A commit is as immutable as a tag and, unlike a tag, " +
    "cannot be moved under a running build; this manifest and the driver's pin move to the tag in " +
    "the same pull request that adopts it. The suite is run on all three claimed runtimes and the " +
    "failing set is asserted identical on each.",
};

/** What a run disagreed with the manifest about. Empty on both sides is the only green answer. */
export interface ParityVerdict {
  /** Ids that failed and the manifest does not list — a regression, or a rule nobody wrote down. */
  readonly unexpectedFailures: readonly string[];
  /** Ids the manifest lists that passed — a gap closed and not published. */
  readonly unexpectedPasses: readonly string[];
  /** Ids skipped that the manifest does not declare a reason for. A skip nobody declared is a hole. */
  readonly undeclaredSkips: readonly string[];
  /** True when all three are empty. */
  readonly matches: boolean;
}

/**
 * Compare a run's failing set against the manifest, in both directions.
 *
 * `skipped` is not a third bucket that quietly avoids this: a skip is legitimate
 * only where the manifest declares it, and this checks that too.
 */
export function compareToManifest(
  run: ConformanceRun,
  manifest: ParityManifest = parityManifest,
): ParityVerdict {
  const claimed = new Set(manifest.failing.map((row) => row.id));
  const failed = new Set(run.failingIds);

  const unexpectedFailures = [...failed].filter((id) => !claimed.has(id)).sort();
  const unexpectedPasses = [...claimed].filter((id) => !failed.has(id)).sort();
  const undeclaredSkips = run.skippedIds.filter((id) => !claimed.has(id)).sort();

  return {
    unexpectedFailures,
    unexpectedPasses,
    undeclaredSkips,
    matches:
      unexpectedFailures.length === 0 &&
      unexpectedPasses.length === 0 &&
      undeclaredSkips.length === 0,
  };
}

/** A {@link ParityVerdict} as the lines a person reads on a red build. */
export function describeVerdict(verdict: ParityVerdict, run: ConformanceRun): readonly string[] {
  if (verdict.matches) return [];
  const lines: string[] = [];
  for (const id of verdict.unexpectedFailures) {
    const result = run.document.results.find((one) => one.id === id);
    const where = result?.diff?.map((entry) => entry.at).join(", ") ?? result?.reason ?? "";
    lines.push(
      `${id} failed and the parity manifest does not list it` + (where === "" ? "" : ` — ${where}`),
    );
  }
  for (const id of verdict.unexpectedPasses) {
    lines.push(
      `${id} passed and the parity manifest still lists it as failing — publish the fix by removing the row`,
    );
  }
  for (const id of verdict.undeclaredSkips) {
    lines.push(`${id} was skipped and the parity manifest declares no reason for it`);
  }
  return lines;
}
