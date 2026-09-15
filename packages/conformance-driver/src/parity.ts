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
 * committed JSON beside it (`conformance/parity/typescript-v0.2.json`) is the
 * artifact, and `test/node/published-claims.test.ts` asserts the two are identical,
 * so the file cannot be regenerated without being committed — and cannot be edited
 * without the module saying so.
 *
 * @packageDocumentation
 */

import { adapterManifest, PROTOCOL_PIN, coverageExemptions } from "@affiant/contract/conformance";

import { ADAPTER_PACKAGE_VERSION, AI_SDK_VERSION } from "./adapters/version.js";
import { IMPLEMENTATION_NAME, IMPLEMENTATION_VERSION, detectRuntime } from "./run.js";
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
  /** The Unicode version this runtime's own character database carries (PV-3). */
  readonly unicodeVersion?: string;
  readonly note?: string;
}

/**
 * One Affiant adapter this implementation ships and declares, and what the rulebook's
 * adapter fixture section said about it (protocol v0.2.0, `conformance/PARITY.md`).
 *
 * An implementation that ships none publishes `adapters: []`, which is the positive
 * statement that it runs none of that section — silence is not the same claim.
 */
export interface AdapterClaim {
  /** The adapter package, by the name a reader installs it under. */
  readonly package: string;
  /** The version of it the run exercised. */
  readonly version: string;
  /** The host framework it is for, by the name its own registry knows it by. */
  readonly runtime: string;
  /** The version of that framework the run resolved and ran against. */
  readonly runtimeVersion?: string;
  /** How many documents of the adapter section this adapter's run covered. */
  readonly fixtures: number;
  /** What the rulebook's adapter claims lint said about the package (CV-5). */
  readonly claimsLint?: "pass" | "fail" | "skipped";
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
  readonly adapters?: readonly AdapterClaim[];
  readonly exemptions: readonly ExemptionRow[];
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// The Unicode version each runtime carries, measured rather than declared
// ---------------------------------------------------------------------------

/** A runtime this implementation claims and runs the whole suite on (RT-1). */
type ClaimedRuntime = "node" | "bun" | "workerd";

/** One Unicode release, and code points first assigned in it. */
interface UnicodeProbe {
  /** The release, as the manifest states it. */
  readonly version: string;
  /** Code points that exist from this release onward and did not before it. */
  readonly codePoints: readonly string[];
}

/**
 * The probe set: for each Unicode release since 14.0, code points first assigned in
 * that release.
 *
 * A runtime does not have to tell you which Unicode database it carries — `workerd`
 * exposes no such field at all, and Bun's `process.versions.unicode` reads `15.1`
 * while its regular-expression engine answers for 17.0 — so the version is
 * established the way PV-3 establishes presence: by looking. Each code point is
 * tested against exactly the four General_Category classes PV-3's neighbour rule
 * reads, so what is measured is the database the finder actually consults and not a
 * neighbouring one.
 *
 * A probe says nothing unless the release it stands for is the release that first
 * assigned it, so every age below is the code point's value in the Unicode Character
 * Database's `DerivedAge.txt` (17.0.0, dated 2025-07-30), the file that records
 * exactly that: U+0870 Arabic Extended-B, `Lo` (`0870..088E ; 14.0`); U+11F00 Kawi,
 * `Mn` (`11F00..11F10 ; 15.0`); U+2EBF0 CJK Unified Ideographs Extension I, `Lo`
 * (`2EBF0..2EE5D ; 15.1` — the whole of what 15.1 assigned); U+105C0 Todhri, `Lo`
 * (`105C0..105F3 ; 16.0`) and U+116D0 Myanmar Extended-C, `Nd` (`116D0..116E3 ; 16.0`);
 * U+11DB0 Tolong Siki, `Lo` (`11DB0..11DDB ; 17.0`) and U+10940 Sidetic, `Lo`
 * (`10940..10959 ; 17.0`).
 *
 * Three of the four classes are covered rather than only `L*`. The fourth cannot be:
 * connector punctuation is ten code points, and `DerivedAge.txt` ages the newest of
 * them — U+2054 — at 4.0, so no release since 14.0 has one to probe with.
 */
export const UNICODE_PROBES: readonly UnicodeProbe[] = [
  { version: "14.0", codePoints: ["\u{0870}"] },
  { version: "15.0", codePoints: ["\u{11F00}"] },
  { version: "15.1", codePoints: ["\u{2EBF0}"] },
  { version: "16.0", codePoints: ["\u{105C0}", "\u{116D0}"] },
  { version: "17.0", codePoints: ["\u{11DB0}", "\u{10940}"] },
];

/** PV-3's four boundary categories, as the finder in `@affiant/core` reads them. */
const ASSIGNED = /^[\p{L}\p{M}\p{Nd}\p{Pc}]$/u;

/** Whether this runtime's own database counts `codePoint` as one of PV-3's four. */
function isAssignedHere(codePoint: string): boolean {
  return ASSIGNED.test(codePoint);
}

/**
 * The highest Unicode release every one of whose probe code points this runtime
 * counts as assigned.
 *
 * The walk stops at the first release that does not answer, so a runtime that knows
 * 16.0 and not 17.0 reads `16.0` rather than skipping ahead on a later release it
 * happens to know one code point of.
 *
 * @param isAssigned How a code point is tested. The default is this runtime's own
 *        database, which is the only answer a manifest may publish; the parameter is
 *        what lets the suite prove the walk stops where it says it stops.
 */
export function probeUnicodeVersion(
  isAssigned: (codePoint: string) => boolean = isAssignedHere,
): string {
  let highest = "below 14.0";
  for (const probe of UNICODE_PROBES) {
    if (!probe.codePoints.every((codePoint) => isAssigned(codePoint))) break;
    highest = probe.version;
  }
  return highest;
}

/**
 * What {@link probeUnicodeVersion} answered on each claimed runtime.
 *
 * Not typed from a release note: every row here was taken by running the probe on
 * that runtime, and `test/conformance.test.ts` re-takes it on every run — the suite
 * runs on all three, so a row that goes stale turns that runtime's job red rather
 * than quietly publishing a wrong version.
 */
export const MEASURED_UNICODE_VERSIONS: Readonly<Record<ClaimedRuntime, string>> = {
  node: "17.0",
  bun: "17.0",
  workerd: "16.0",
};

/** The recorded measurement for a runtime, or `undefined` for one not claimed. */
export function recordedUnicodeVersion(runtime: string): string | undefined {
  return (MEASURED_UNICODE_VERSIONS as Readonly<Record<string, string>>)[runtime];
}

/**
 * The version the manifest states for one runtime.
 *
 * The runtime this process is on answers for itself, so a manifest generated here
 * cannot state a version this runtime does not measure. The other two answer with
 * the recorded measurement, which their own job re-takes.
 */
function unicodeVersionOf(runtime: ClaimedRuntime): string {
  return runtime === detectRuntime() ? probeUnicodeVersion() : MEASURED_UNICODE_VERSIONS[runtime];
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
  producedAt: "2026-09-15T00:00:00.000Z",
  runLog: "packages/conformance-driver/conformance/results/typescript-0.1.0-alpha.2.json",
  failing: [],
  adapters: [
    {
      package: "@affiant/adapter-ai-sdk",
      version: ADAPTER_PACKAGE_VERSION,
      runtime: "ai",
      runtimeVersion: AI_SDK_VERSION,
      fixtures: adapterManifest.fixtures.length,
      claimsLint: "pass",
      note:
        "the rulebook's conformance/lint/adapter-claims.mjs, run against this package in the " +
        "adapter-claims CI job of this repository, where the npm registry is reachable (CV-5)",
    },
  ],
  runtimes: [
    { name: "node", version: ">=22", claimed: true, unicodeVersion: unicodeVersionOf("node") },
    {
      name: "bun",
      claimed: true,
      unicodeVersion: unicodeVersionOf("bun"),
      note: "the same suite, run under Bun in this repository's CI",
    },
    {
      name: "workerd",
      claimed: true,
      unicodeVersion: unicodeVersionOf("workerd"),
      note: "run through @cloudflare/vitest-pool-workers — the runtime a Cloudflare Worker host would execute @affiant/core on",
    },
  ],
  exemptions: inheritedExemptions,
  notes:
    "The protocolTag is the rulebook ref this repository pins in packages/contract/protocol/PIN " +
    "and vendors byte for byte, checksummed on every run. The failing set is the union over the " +
    "two fixture sections the run covers: the conformance section against @affiant/core, and the " +
    "adapter section against @affiant/adapter-ai-sdk, which is the one adapter this " +
    "implementation ships and declares. The suite is run on all three claimed runtimes and the " +
    "failing set is asserted identical on each; an empty failing set is what this implementation " +
    "owes, being the one the fixtures were promoted from, and the run it is read off is " +
    "published beside this manifest in the rulebook. The adapter row's claimsLint is what the " +
    "rulebook's conformance/lint/adapter-claims.mjs said about the package in this repository's " +
    "adapter-claims CI job; that lint reads the npm registry, which is why it runs there and not " +
    "in the rulebook's own CI. Each runtime's unicodeVersion is measured by probe, not declared: " +
    "probeUnicodeVersion() in packages/conformance-driver/src/parity.ts tests code points first " +
    "assigned in Unicode 14.0, 15.0, 15.1, 16.0 and 17.0 against the four General_Category " +
    "classes PV-3's neighbour rule reads, and states the highest release all of whose code " +
    "points that runtime counts as assigned; the suite re-takes the measurement on whichever " +
    "runtime it is running on, so no row here can be a version this implementation has not " +
    "measured. As measured on 2026-09-08 — Node 22.22.1 and 24.14.0 (both ICU 78.2), Bun 1.3.13 " +
    "and 1.4.2, workerd at compatibility date 2026-03-10 — workerd's database is one release " +
    "behind the other two, which is the divergence PV-3 admits: a code point assigned in 17.0 is " +
    "a letter beside a candidate hit on Node and Bun and an unassigned boundary on workerd. No " +
    "fixture utterance in this suite carries a non-ASCII code point at all, so the failing set " +
    "is identical on all three, which is what the runs assert.",
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
