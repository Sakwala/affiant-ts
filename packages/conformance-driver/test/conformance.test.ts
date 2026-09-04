import { conformanceManifest } from "@affiant/contract/conformance";
import { beforeAll, describe, expect, it } from "vitest";

import { compareToManifest, describeVerdict, parityManifest } from "../src/parity.js";
import { detectRuntime, runConformance, validateRunDocument } from "../src/run.js";
import type { ConformanceRun } from "../src/run.js";

/**
 * The conformance run, and the assertion that makes it worth having.
 *
 * This suite is the merge-blocking one. It runs every document the rulebook's
 * conformance manifest lists through `@affiant/core` and asserts that the set of
 * documents this implementation does **not** pass equals
 * `conformance/parity/typescript-v0.1.json` exactly — in both directions.
 *
 * Why both directions. A document that starts failing and is not listed is a
 * regression, or a rule the implementation never met and nobody wrote down. A
 * document that starts passing and is still listed is a gap that has been closed
 * and not published. A check that caught only the first would let a fix rot
 * unrecorded, and the manifest would become a document nobody trusts.
 *
 * It runs unchanged on Node, under Bun and inside workerd (RT-1). The failing set
 * must be identical on all three: a document that fails on one runtime only is a
 * failing document, and it would show up here as an unexpected failure on that
 * runtime's job.
 */
let run: ConformanceRun;

beforeAll(async () => {
  run = await runConformance();
}, 120_000);

describe("the run covers the whole promoted suite", () => {
  it("reports one result per document in the rulebook's manifest, passes included", () => {
    // A run that reported only failures could not be checked for completeness.
    expect(run.document.results).toHaveLength(conformanceManifest.fixtures.length);
    expect(run.document.results.map((result) => result.id).sort()).toEqual(
      conformanceManifest.fixtures.map((row) => row.id).sort(),
    );
  });

  it("runs the 56 declarative fixtures and the 7 canonical byte vectors", () => {
    expect(conformanceManifest.fixtures).toHaveLength(63);
    expect(conformanceManifest.fixtures.filter((row) => row.set === "canonical")).toHaveLength(7);
    expect(run.document.summary.total).toBe(63);
  });

  it("names the runtime it ran on and the protocol ref the documents came from", () => {
    // Not decoration: the failing set must be identical on every runtime the
    // implementation claims (RT-1), and a run document that could not say where it
    // ran would make that unprovable. Under @cloudflare/vitest-pool-workers the
    // Node compatibility layer supplies `process.versions.node`, so this is the
    // check that the detection did not quietly answer "node" everywhere.
    expect(run.document.implementation.runtime).toBe(detectRuntime());
    expect(parityManifest.runtimes.map((runtime) => runtime.name)).toContain(
      run.document.implementation.runtime,
    );
    expect(run.document.protocolTag).toBe(parityManifest.protocolTag);
    expect(run.document.implementation.name).toBe(parityManifest.implementation);
    expect(run.document.implementation.version).toBe(parityManifest.version);
  });

  it("emits a document the rulebook's results schema accepts", () => {
    expect(validateRunDocument(run.document)).toEqual([]);
  });

  it("skips nothing: a skip is legitimate only where the manifest declares one", () => {
    expect(run.skippedIds).toEqual([]);
    expect(run.document.summary.skipped).toBe(0);
  });
});

describe("the failing set equals the published parity manifest", () => {
  it("matches it exactly, in both directions", () => {
    const verdict = compareToManifest(run);

    // The lines are in the failure message on purpose: a red build should say
    // which document changed and at which path, not that a set comparison failed.
    expect(describeVerdict(verdict, run)).toEqual([]);
    expect(verdict.matches).toBe(true);
  });

  it("publishes an empty failing set, which is what this implementation claims", () => {
    // The reference implementation the fixtures were promoted from. An empty list
    // is the strongest possible statement, and it is only worth anything because
    // this suite is required in CI: the day one of these stops passing is the day a
    // pull request stops merging.
    expect(parityManifest.failing).toEqual([]);
    expect(run.failingIds).toEqual([]);
    expect(run.document.summary.failed).toBe(0);
    expect(run.document.summary.errored).toBe(0);
    expect(run.document.summary.passed).toBe(run.document.summary.total);
  });

  it("claims exactly the three runtimes the suite is run on (RT-1)", () => {
    expect(parityManifest.runtimes.map((runtime) => runtime.name).sort()).toEqual([
      "bun",
      "node",
      "workerd",
    ]);
    expect(parityManifest.runtimes.every((runtime) => runtime.claimed)).toBe(true);
  });
});

describe("the comparison is not vacuous", () => {
  it("reports a document that failed and the manifest does not list", () => {
    const verdict = compareToManifest({
      ...run,
      failingIds: ["gate/substance-hollow-refused"],
    });

    expect(verdict.matches).toBe(false);
    expect(verdict.unexpectedFailures).toEqual(["gate/substance-hollow-refused"]);
  });

  it("reports a document that passed and the manifest still lists as failing", () => {
    const verdict = compareToManifest(run, {
      ...parityManifest,
      failing: [
        {
          id: "decide/approve",
          rules: ["AZ-1"],
          disposition: "ignored",
          detail: "a row nobody removed after the gap was closed",
        },
      ],
    });

    expect(verdict.matches).toBe(false);
    expect(verdict.unexpectedPasses).toEqual(["decide/approve"]);
  });

  it("reports a skip the manifest declares no reason for", () => {
    const verdict = compareToManifest({ ...run, skippedIds: ["sequence-a/sweep-pages"] });

    expect(verdict.matches).toBe(false);
    expect(verdict.undeclaredSkips).toEqual(["sequence-a/sweep-pages"]);
  });

  it("says which document and where, rather than that a set comparison failed", () => {
    const lines = describeVerdict(
      compareToManifest({ ...run, failingIds: ["gate/ttl-from-verdict"] }),
      run,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("gate/ttl-from-verdict");
    expect(lines[0]).toContain("does not list it");
  });
});

describe("the exemptions are the rulebook's, copied and not invented", () => {
  it("carries one row per rule the rulebook excuses, and no others", () => {
    // An implementation cannot exempt itself from a rule: exempting yourself is not
    // a parity report, it is a press release. The rows are built from the vendored
    // list, so a rule the rulebook stops excusing stops appearing here.
    expect(parityManifest.exemptions.map((row) => row.rule).sort()).toEqual([
      "AF-5",
      "CV-2",
      "CV-3",
      "CV-5",
      "RT-1",
      "RT-2",
      "RT-3",
      "SR-3",
      "SR-5",
      "TL-1",
      "TL-2",
    ]);
  });

  it("names what stands in for every exemption that holds for good", () => {
    // The three that name nothing are the ones whose fixtures arrive with the first
    // adapter at protocol v0.2 — there is nothing standing in for them yet, and
    // saying so is more useful than something reassuring.
    for (const row of parityManifest.exemptions) {
      if (row.until === "always") {
        expect(row.checkedInstead, row.rule).toBeDefined();
      }
    }
    expect(
      parityManifest.exemptions
        .filter((row) => row.checkedInstead === undefined)
        .map((row) => row.rule),
    ).toEqual(["CV-2", "CV-3", "CV-5"]);
  });
});
