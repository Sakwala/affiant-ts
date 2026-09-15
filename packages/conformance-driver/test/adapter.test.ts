import { adapterManifest, conformanceManifest } from "@affiant/contract/conformance";
import type { ConformanceFixtureDocument } from "@affiant/contract/conformance";
import { AffiantError } from "@affiant/core";
import { beforeAll, describe, expect, it } from "vitest";

import { aiSdkAdapter } from "../src/adapters/ai-sdk.js";
import { mergeRuns, runAdapterFixture, runAdapterSection } from "../src/adapter.js";
import type {
  AdapterBinding,
  AdapterCall,
  AdapterRun,
  AdapterToolDefinition,
} from "../src/adapter.js";
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
 *
 * Half of what is below is deliberately broken bindings. A green run of ten documents
 * says nothing on its own — the first round of this work had seven documents, a green
 * run, and three seams that would have passed it. Each mutation here is one of those
 * seams, and the assertion is which document catches it.
 */
let run: AdapterRun;

beforeAll(async () => {
  run = await runAdapterSection(aiSdkAdapter);
}, 120_000);

/** The binding, with one thing about it changed. */
function binding(patch: Partial<AdapterBinding<never>>): AdapterBinding<never> {
  return { ...(aiSdkAdapter as unknown as AdapterBinding<never>), ...patch };
}

describe("the run covers the whole adapter section", () => {
  it("reports one result per document in the rulebook's adapter manifest, passes included", () => {
    expect(run.results).toHaveLength(adapterManifest.fixtures.length);
    expect(run.results.map((result) => result.id).sort()).toEqual(
      adapterManifest.fixtures.map((row) => row.id).sort(),
    );
  });

  it("runs the twelve documents the section lists", () => {
    expect(adapterManifest.fixtures).toHaveLength(12);
    expect(run.declaration.fixtures).toBe(12);
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

describe("a seam that decides from the framework's history is caught (CV-3, AZ-5)", () => {
  it("fails the replayed-approval document when the summary reads the artefact", async () => {
    // The seam AZ-5 closes: an approval reconstructed from the message history the
    // client sent back, and the model told the row is approved. The Docket row is
    // untouched, so every assertion about the row still holds — only `modelOutput`
    // sees it, which is why that clause is on the document.
    const readsTheArtefact = binding({
      async modelOutput(set, call: AdapterCall, output: unknown) {
        const summary = (await aiSdkAdapter.modelOutput(set as never, call, output)) as Record<
          string,
          unknown
        >;
        const approved = call.messages.some(
          (message) => message.kind === "framework-approval" && message.approved !== false,
        );
        return (approved ? { ...summary, status: "approved" } : summary) as never;
      },
    });

    const broken = await runAdapterSection(readsTheArtefact);

    expect(broken.failingIds).toContain("adapter/cv3-replayed-approval-changes-nothing");
    const result = broken.results.find(
      (one) => one.id === "adapter/cv3-replayed-approval-changes-nothing",
    );
    expect(result?.diff?.map((entry) => entry.at)).toContain("modelOutput.status");
  }, 120_000);
});

describe("the framework artefact reaches the seam the framework would reach (CV-3, AZ-5)", () => {
  it("hands the tool a tool-approval-response part on the options the SDK uses", async () => {
    // The binding-level half of the replayed-approval document, and it needs its own
    // test: emptying `sdkMessage` leaves all twelve fixtures green, because a seam that
    // is never handed an approval cannot read one, and the document then passes for the
    // wrong reason. A fixture states the artefact abstractly; this is where that
    // becomes the shape the SDK's own seam reads its history in, and it is asserted on
    // the options the tool is actually called with.
    const seen: unknown[] = [];
    const set = {
      update_ticket: {
        execute(_input: unknown, options: unknown) {
          seen.push(options);
          return { kind: "read", result: null };
        },
      },
    } as unknown as Parameters<typeof aiSdkAdapter.call>[0];

    await aiSdkAdapter.call(set, {
      tool: "update_ticket",
      args: { priority: "High" },
      contextKind: "turn",
      context: {
        conversationId: "conv-1",
        tenantId: "tenant-a",
        channel: "chat",
        principal: { kind: "member", id: "member-1" },
        turn: { utterance: "Set it to High", messageId: "msg-1", at: "2026-09-15T09:00:00.000Z" },
      },
      messages: [{ kind: "framework-approval", approved: true }],
    });

    expect(seen).toHaveLength(1);
    const options = seen[0] as { messages: readonly { content: readonly { type: string }[] }[] };
    expect(options.messages).toHaveLength(1);
    expect(options.messages[0]?.content[0]?.type).toBe("tool-approval-response");
  });

  it("passes no context at all where the call arrived with none, and the value unwrapped where it is malformed", async () => {
    // The other two context kinds, on the same seam. `"none"` must leave `context` off
    // the options entirely — the SDK's own behaviour when a generation call carried no
    // `toolsContext` — and `"malformed"` must hand the value over exactly as written,
    // because wrapping it as `{ turn: … }` would repair the thing GT-2 is about.
    const seen: Record<string, unknown>[] = [];
    const set = {
      update_ticket: {
        execute(_input: unknown, options: Record<string, unknown>) {
          seen.push(options);
          return { kind: "read", result: null };
        },
      },
    } as unknown as Parameters<typeof aiSdkAdapter.call>[0];
    const base = { tool: "update_ticket", args: {}, messages: [] } as const;

    await aiSdkAdapter.call(set, { ...base, contextKind: "none", context: null });
    await aiSdkAdapter.call(set, {
      ...base,
      contextKind: "malformed",
      context: { nonsense: true },
    });

    expect(Object.hasOwn(seen[0] ?? {}, "context")).toBe(false);
    expect(seen[1]?.["context"]).toEqual({ nonsense: true });
  });
});

describe("a refusal that carries the wrong code is caught (CV-2)", () => {
  it("fails the two refusal documents on outcome.code", async () => {
    // `wireup-invalid` and `coverage-refused` are different statements about why a
    // call did not file, and a document that only knew "it was refused" would pass a
    // seam that refused for the wrong reason.
    const wrongCode = binding({
      async call(): Promise<unknown> {
        throw new AffiantError("coverage-refused", "the wrong refusal entirely");
      },
    });

    const broken = await runAdapterSection(wrongCode);

    for (const id of [
      "adapter/cv2-write-without-context-refuses",
      "adapter/cv2-read-without-context-never-runs",
    ]) {
      const result = broken.results.find((one) => one.id === id);
      expect(result?.outcome, id).toBe("fail");
      expect(
        result?.diff?.map((entry) => entry.at),
        id,
      ).toContain("outcome.code");
    }
  }, 120_000);
});

describe("a seam that runs the host's own code before checking the context is caught (CV-2)", () => {
  it("fails the read document on hostExecuteRan", async () => {
    // CV-2's real content on a read: the refusal happens at the seam, before anything
    // the host wrote runs. Without a positive case for the tripwire, `hostExecuteRan`
    // was a clause that read `false` because nothing ever set it.
    let definitions: readonly AdapterToolDefinition[] = [];
    const runsTheHostFirst = binding({
      build(gate, given) {
        definitions = given;
        return aiSdkAdapter.build(gate, given) as never;
      },
      async call(set, call: AdapterCall): Promise<unknown> {
        const definition = definitions.find((one) => one.name === call.tool);
        if (definition?.writeCapable === false && definition.execute !== undefined) {
          (definition.execute as (args: unknown, ctx: unknown) => unknown)(call.args, null);
        }
        return await aiSdkAdapter.call(set as never, call);
      },
    });

    const broken = await runAdapterSection(runsTheHostFirst);
    const result = broken.results.find(
      (one) => one.id === "adapter/cv2-read-without-context-never-runs",
    );

    expect(result?.outcome).toBe("fail");
    expect(result?.diff?.map((entry) => entry.at)).toContain("hostExecuteRan");
  }, 120_000);
});

describe("a step kind this driver has not bound is an error, always", () => {
  /** A document of the adapter section, with `step` and `prior` as given. */
  function document(given: Record<string, unknown>): ConformanceFixtureDocument {
    return {
      id: "adapter/cv2-write-with-context-files",
      rules: ["CV-2"],
      title: "a document carrying a step kind this driver has not bound",
      given: {
        clock: "2026-09-15T09:00:00.000Z",
        gate: { defaultTtlMs: 3_600_000, authorization: { allow: ["*"] } },
        ctx: {
          tenantId: "tenant-a",
          conversationId: "conv-1",
          channel: "chat",
          principal: { kind: "member", id: "member-1" },
          utterance: "Set the ticket priority to High",
          messageId: "msg-1",
        },
        ...given,
      },
      expect: { entries: 0 },
    } as unknown as ConformanceFixtureDocument;
  }

  const unbound = {
    kind: "file",
    toolName: "update_ticket",
    operation: { kind: "update", entityType: "Ticket", entityId: "ticket-1", fields: ["priority"] },
  };

  it("errors when the step under test is unbound", async () => {
    // Not a pass, and not a failure of the implementation: a driver that cannot run a
    // document says so, and an `error` counts against it exactly like a failure
    // (DRIVER.md section 3).
    const outcome = await runAdapterFixture(document({ step: unbound }), aiSdkAdapter);

    expect(outcome.outcome).toBe("error");
    expect(outcome.reason).toContain("does not bind");
  });

  it("errors when a prior step is unbound, rather than reporting on a scene nobody set", async () => {
    // This is the one that was wrong. The raise was folded into that step's outcome,
    // nothing compared it, and a document stating no `expect.outcome` reported `pass`
    // for a document whose `prior` never ran.
    const outcome = await runAdapterFixture(
      document({ prior: [unbound], step: { kind: "get" } }),
      aiSdkAdapter,
    );

    expect(outcome.outcome).toBe("error");
    expect(outcome.reason).toContain("does not bind");
  });
});

describe("the section is not vacuous", () => {
  it("fails a document whose expectation the adapter does not meet", async () => {
    // A driver that reported a pass for a document it did not really check is the
    // failure mode the whole arrangement exists to prevent, so the runner is made to
    // fail on purpose: a binding that never reaches the seam fails the filing
    // documents rather than passing them.
    const alwaysRefuses = binding({
      async call(): Promise<unknown> {
        return { kind: "error", code: "wireup-invalid", message: "a binding that never calls" };
      },
    });
    const broken = await runAdapterSection(alwaysRefuses);

    expect(broken.failingIds).toContain("adapter/cv2-write-with-context-files");
    expect(broken.failingIds).toContain("adapter/cv3-model-output-carries-no-values");
  }, 120_000);

  it("errors on a document stating a clause the adapter section does not have", async () => {
    // `card` and `canonicalHash` are the gate's own artefacts, produced through the
    // gate's own entry points, and the adapter variant of fixture.schema.json refuses
    // them: a document stating one is not run at all, which is an `error` and never a
    // pass. The driver's own clause guard sits behind that as a backstop, for a clause
    // the format gains before this driver binds it.
    for (const clause of [
      { canonicalHash: "0".repeat(64) },
      { card: { requiresConfirmation: true } },
    ]) {
      const outcome = await runAdapterFixture(
        {
          id: "adapter/cv2-write-with-context-files",
          rules: ["CV-2"],
          title: "a document carrying a clause the adapter section does not have",
          given: {
            clock: "2026-09-15T09:00:00.000Z",
            gate: { defaultTtlMs: 3_600_000, authorization: { allow: ["*"] } },
            ctx: { tenantId: "tenant-a", conversationId: "conv-1", channel: "chat" },
            step: { kind: "get" },
          },
          expect: clause,
        } as unknown as ConformanceFixtureDocument,
        aiSdkAdapter,
      );

      expect(outcome.outcome, JSON.stringify(clause)).toBe("error");
      expect(outcome.reason, JSON.stringify(clause)).toContain("does not validate");
    }
  });

  it("fails a summary that carries a sworn value inside a sentence (CV-3)", async () => {
    // `carriesNoFieldValues` is a check over text, not over structure. A structural
    // comparison passes a summary whose `note` reads `priority=High`, and the sworn
    // value is in the framework's history either way.
    const tellsTheValue = binding({
      async modelOutput(set, call: AdapterCall, output: unknown) {
        const summary = (await aiSdkAdapter.modelOutput(set as never, call, output)) as Record<
          string,
          unknown
        >;
        return { ...summary, note: "filed for review: priority=High" } as never;
      },
    });

    const broken = await runAdapterSection(tellsTheValue);
    const result = broken.results.find(
      (one) => one.id === "adapter/cv3-model-output-carries-no-values",
    );

    expect(result?.outcome).toBe("fail");
    expect(result?.diff?.map((entry) => entry.at)).toContain("modelOutput.carriesNoFieldValues");
  }, 120_000);

  it("fails a refusal that hands the framework something anyway (CV-2)", async () => {
    // `"modelOutput": null` is the statement that the framework was handed nothing.
    // Without it a refusal document observes only an empty Docket, and a seam that
    // refused and returned the raw proposal to the model would pass it.
    const refusesAndTells = binding({
      async call(): Promise<unknown> {
        return { kind: "error", code: "wireup-invalid", message: "refused, but here it is" };
      },
    });

    const broken = await runAdapterSection(refusesAndTells);
    const result = broken.results.find(
      (one) => one.id === "adapter/cv2-write-without-context-refuses",
    );

    expect(result?.outcome).toBe("fail");
    expect(result?.diff?.map((entry) => entry.at)).toContain("modelOutput");
  }, 120_000);
});
