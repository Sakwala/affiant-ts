import { adapterManifest, conformanceManifest } from "@affiant/contract/conformance";
import { beforeAll, describe, expect, it } from "vitest";

import { aiSdkAdapter } from "../src/adapters/ai-sdk.js";
import { mergeRuns, runAdapterFixture, runAdapterSection } from "../src/adapter.js";
import type { AdapterRun } from "../src/adapter.js";
import { compareToManifest, describeVerdict, parityManifest } from "../src/parity.js";
import { runConformance, validateRunDocument } from "../src/run.js";

/**
 * The adapter section, run against `@affiant/adapter-ai-sdk`.
 *
 * Three rules are about an adapter's seam and about nothing else, and none of them
 * could be checked before an adapter existed: CV-2's fail-closed call site, CV-3's
 * delegation clause, and CV-5 — which is a lint over the package rather than a
 * fixture, because no fixture can observe a statement about documentation.
 *
 * This suite is merge-blocking beside the conformance one. The rulebook asserts the
 * failing set over the **union** of the sections a run covered, so the two runs are
 * merged and compared to the published manifest once: a failing adapter fixture is a
 * failing fixture like any other.
 */
let run: AdapterRun;

beforeAll(async () => {
  run = await runAdapterSection(aiSdkAdapter);
}, 120_000);

describe("the run covers the whole adapter section", () => {
  it("reports one result per document in the rulebook's adapter manifest, passes included", () => {
    expect(run.results).toHaveLength(adapterManifest.fixtures.length);
    expect(run.results.map((result) => result.id).sort()).toEqual(
      adapterManifest.fixtures.map((row) => row.id).sort(),
    );
  });

  it("runs the seven documents the section lists", () => {
    expect(adapterManifest.fixtures).toHaveLength(7);
    expect(run.declaration.fixtures).toBe(7);
  });

  it("passes every one", () => {
    // The lines are in the failure message on purpose: a red build should say which
    // document failed and at which path, not that a length comparison failed.
    expect(
      run.results
        .filter((result) => result.outcome !== "pass")
        .map((result) => `${result.id}: ${result.reason ?? JSON.stringify(result.diff)}`),
    ).toEqual([]);
    expect(run.failingIds).toEqual([]);
  });

  it("declares the adapter the parity manifest publishes", () => {
    expect(run.declaration.package).toBe("@affiant/adapter-ai-sdk");
    expect(run.declaration.runtime).toBe("ai");
    const declared = parityManifest.adapters?.[0];
    expect(declared?.package).toBe(run.declaration.package);
    expect(declared?.version).toBe(run.declaration.version);
    expect(declared?.runtime).toBe(run.declaration.runtime);
    expect(declared?.runtimeVersion).toBe(run.declaration.runtimeVersion);
    expect(declared?.fixtures).toBe(run.declaration.fixtures);
  });
});

describe("the union of the two sections is what the parity manifest is asserted against", () => {
  it("matches the published manifest exactly, in both directions", async () => {
    const merged = mergeRuns(await runConformance(), run);

    expect(merged.document.results).toHaveLength(
      conformanceManifest.fixtures.length + adapterManifest.fixtures.length,
    );
    expect(validateRunDocument(merged.document)).toEqual([]);

    const verdict = compareToManifest(merged);
    expect(describeVerdict(verdict, merged)).toEqual([]);
    expect(verdict.matches).toBe(true);
    expect(merged.document.summary.passed).toBe(merged.document.summary.total);
  }, 120_000);
});

describe("the section is not vacuous", () => {
  it("fails a document whose expectation the adapter does not meet", async () => {
    // A driver that reported a pass for a document it did not really check is the
    // failure mode the whole arrangement exists to prevent, so the runner is made to
    // fail on purpose: a binding that hands back a context the seam never got would
    // make CV-2's refusal fixtures pass and its filing fixture fail.
    const alwaysRefuses = {
      ...aiSdkAdapter,
      async call(): Promise<unknown> {
        return { kind: "error", code: "wireup-invalid", message: "a binding that never calls" };
      },
    };
    const broken = await runAdapterSection(alwaysRefuses);

    expect(broken.failingIds).toContain("adapter/cv2-write-with-context-files");
    expect(broken.failingIds).toContain("adapter/cv3-model-output-carries-no-values");
  }, 120_000);

  it("errors rather than passes when a document states a clause it does not bind", async () => {
    // An expectation key a driver does not answer is a fact nobody checks, so it is an
    // error outcome and it counts against the implementation exactly like a failure
    // (RUNNER.md §8). Proven by running one document with a clause added.
    const outcome = await runAdapterFixture(
      {
        id: "adapter/cv2-write-with-context-files",
        rules: ["CV-2"],
        title: "a document carrying a clause this driver does not bind",
        given: {
          clock: "2026-09-15T09:00:00.000Z",
          gate: { defaultTtlMs: 3_600_000, authorization: { allow: ["*"] } },
          ctx: { tenantId: "tenant-a", conversationId: "conv-1", channel: "chat" },
          step: { kind: "get" },
        },
        expect: { canonicalHash: "0".repeat(64) },
      },
      aiSdkAdapter,
    );

    expect(outcome.outcome).not.toBe("pass");
  });
});
