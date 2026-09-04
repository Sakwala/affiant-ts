import { describe, expect, it, vi } from "vitest";

import { assessCoverage, createCoverageRegistry, declareUncovered } from "../src/gate/coverage.js";
import { AffiantError, isAffiantError } from "../src/errors.js";

import { harness, readTool, turnContext, writeTool } from "./gate-support.js";

/**
 * Coverage and the interception seam.
 *
 * CV-4 (a write-capable tool the gate cannot intercept is refused at wire-up, or —
 * where the host declared it — filed blocked, never silently allowed), CV-1 (the
 * refusal is at wire-up, and there is no option that turns the gate off), GT-6 (a
 * write tool's own `execute` is never called), AF-5 (a tool call returns a proposal, a
 * read result, or an error).
 */

describe("assessing a tool (CV-4)", () => {
  it("covers a tool with an execute the gate can stand in front of", () => {
    expect(assessCoverage(writeTool())).toEqual({ covered: true });
  });

  it("reports a tool with no execute as no-execute", () => {
    expect(assessCoverage(writeTool({ omitExecute: true }))).toEqual({
      covered: false,
      category: "no-execute",
    });
  });

  it("reports a provider-executed tool", () => {
    expect(assessCoverage(writeTool({ executedBy: "provider" }))).toEqual({
      covered: false,
      category: "provider-executed",
    });
  });

  it("reports a hosted MCP tool", () => {
    expect(assessCoverage(writeTool({ hostedMcp: true }))).toEqual({
      covered: false,
      category: "hosted-mcp",
    });
  });

  it("reports the first category that matches, so a host is told the checkable fact", () => {
    expect(assessCoverage(writeTool({ omitExecute: true, executedBy: "provider" }))).toEqual({
      covered: false,
      category: "no-execute",
    });
  });
});

describe("refusing an uncovered write tool at wire-up (CV-4, CV-1)", () => {
  it("refuses a provider-executed write tool before a single call", () => {
    const { gate, telemetry } = harness();

    let thrown: unknown;
    try {
      gate.wrap(writeTool({ executedBy: "provider" }), turnContext());
    } catch (error) {
      thrown = error;
    }

    expect(isAffiantError(thrown)).toBe(true);
    expect((thrown as AffiantError).code).toBe("coverage-refused");
    expect((thrown as AffiantError).details["category"]).toBe("provider-executed");
    expect(telemetry.find("coverage.refused")?.attributes["phase"]).toBe("wire-up");
  });

  it("refuses a hosted MCP write tool", () => {
    const { gate } = harness();

    expect(() => gate.wrap(writeTool({ hostedMcp: true }), turnContext())).toThrow(/hosted-mcp/);
  });

  it("refuses a write tool with nothing to intercept", () => {
    const { gate } = harness();

    expect(() => gate.wrap(writeTool({ omitExecute: true }), turnContext())).toThrow(/no-execute/);
  });

  it("refuses a write tool that does not say what its arguments propose", () => {
    const { gate } = harness();

    expect(() => gate.wrap(writeTool({ omitOperation: true }), turnContext())).toThrow(
      /declares no `operation`/,
    );
  });

  it("refuses a read tool with nothing to call", () => {
    const { gate } = harness();
    const tool = { ...readTool(() => "x") } as Record<string, unknown>;
    delete tool["execute"];

    expect(() =>
      gate.wrap(tool as unknown as Parameters<typeof gate.wrap>[0], turnContext()),
    ).toThrow(/declares no `execute`/);
  });

  it("has no option that lets an uncovered write tool through", () => {
    const { gate } = harness();

    // The only way past the refusal is a declaration, and a declaration files every
    // proposal blocked — it never restores the write (CV-1).
    expect(() => gate.wrap(writeTool({ hostedMcp: true }), turnContext())).toThrow();
    gate.declareUncovered({ name: "update_invoice" }, "hosted-mcp");
    expect(() => gate.wrap(writeTool({ hostedMcp: true }), turnContext())).not.toThrow();
  });
});

describe("a declared-uncovered tool's proposals are filed blocked (CV-4, AZ-4)", () => {
  it("files the proposal pending with the coverage-refused marker", async () => {
    const { gate, telemetry } = harness({ uncovered: [["update_invoice", "provider-executed"]] });

    const result = await gate
      .wrap(writeTool({ executedBy: "provider" }), turnContext())
      .execute({ status: "Active" });

    if (result.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(result.status).toBe("pending");
    const entry = await gate.get(result.entryId, turnContext());
    expect(entry?.blocked).toEqual({
      code: "coverage-refused",
      category: "provider-executed",
      toolName: "update_invoice",
    });
    expect(telemetry.find("coverage.refused")?.attributes["phase"]).toBe("proposal");
  });

  it("blocks the entry even when a policy would have auto-approved it", async () => {
    const { gate } = harness({
      uncovered: [["update_invoice", "hosted-mcp"]],
      policies: [
        {
          id: "auto",
          version: "1.0.0",
          declaredInputs: [],
          async evaluate() {
            return { requirement: "StandingOrder" as const };
          },
        },
      ],
    });

    const result = await gate
      .wrap(writeTool({ hostedMcp: true }), turnContext())
      .execute({ status: "Active" });

    if (result.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const entry = await gate.get(result.entryId, turnContext());
    // The requirement is recorded verbatim; the row is pending and blocked, and no
    // attestation was written. AZ-4 permits moving toward a person, never away.
    expect(entry?.requirement).toBe("StandingOrder");
    expect(entry?.status).toBe("pending");
    expect(entry?.attestation).toBeNull();
    expect(entry?.blocked?.code).toBe("coverage-refused");
  });

  it("puts the refusal on the card as a warning a reviewer can read", async () => {
    const { gate } = harness({ uncovered: [["update_invoice", "no-execute"]] });

    const result = await gate
      .wrap(writeTool({ omitExecute: true }), turnContext())
      .execute({ status: "Active" });

    if (result.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect((result.card.warnings ?? []).join(" ")).toContain("declared uncovered");
  });
});

describe("the registry itself", () => {
  it("keeps a declaration and reports it back", () => {
    const registry = createCoverageRegistry();

    declareUncovered(registry, { name: "t" }, "hosted-mcp");

    expect(registry.lookup("t")).toBe("hosted-mcp");
    expect(registry.declarations()).toEqual([{ toolName: "t", category: "hosted-mcp" }]);
  });

  it("reports nothing for a tool that was never declared", () => {
    expect(createCoverageRegistry().lookup("t")).toBeNull();
  });

  it("refuses a host that contradicts itself about a tool", () => {
    const registry = createCoverageRegistry();
    registry.declare("t", "hosted-mcp");

    expect(() => registry.declare("t", "no-execute")).toThrow(RangeError);
    expect(() => registry.declare("t", "hosted-mcp")).not.toThrow();
  });

  it("refuses a category that is not one of the three", () => {
    expect(() =>
      createCoverageRegistry().declare("t", "made-up" as unknown as "hosted-mcp"),
    ).toThrow(RangeError);
  });

  it("is per gate, so two gates share nothing", () => {
    const one = harness();
    const two = harness();

    one.gate.declareUncovered({ name: "t" }, "hosted-mcp");

    expect(one.gate.coverage.lookup("t")).toBe("hosted-mcp");
    expect(two.gate.coverage.lookup("t")).toBeNull();
  });
});

describe("a write tool's own execute is never called (GT-6)", () => {
  it("produces a proposal instead of running the write", async () => {
    const execute = vi.fn(() => "written");
    const { gate } = harness();

    const result = await gate
      .wrap(writeTool({ execute }), turnContext())
      .execute({ status: "Active" });

    expect(execute).not.toHaveBeenCalled();
    expect(result.kind).toBe("write");
  });

  it("does not call it on a refusal either", async () => {
    const execute = vi.fn(() => "written");
    const { gate } = harness({ inferred: {} });

    const result = await gate
      .wrap(writeTool({ execute }), turnContext())
      .execute({ status: "Active" });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "error", code: "substance-refused" });
  });

  it("does not call it for a declared-uncovered tool", async () => {
    const execute = vi.fn(() => "written");
    const { gate } = harness({ uncovered: [["update_invoice", "hosted-mcp"]] });

    await gate
      .wrap(writeTool({ execute, hostedMcp: true }), turnContext())
      .execute({ status: "Active" });

    expect(execute).not.toHaveBeenCalled();
  });
});

describe("a read tool passes through (AF-5)", () => {
  it("returns the tool's own result", async () => {
    const { gate } = harness();

    const result = await gate
      .wrap(
        readTool(() => "three invoices"),
        turnContext(),
      )
      .execute({ query: "open" });

    expect(result).toEqual({ kind: "read", result: "three invoices" });
  });

  it("hands the read tool the same explicit context the seam was given (GT-2)", async () => {
    const { gate } = harness();
    const seen: string[] = [];

    await gate
      .wrap(
        readTool((_args, ctx) => {
          seen.push(`${ctx.tenantId}/${ctx.conversationId}`);
          return "ok";
        }),
        turnContext({ tenantId: "tenant-b", conversationId: "conv-9" }),
      )
      .execute({ query: "open" });

    expect(seen).toEqual(["tenant-b/conv-9"]);
  });

  it("files nothing", async () => {
    const { gate, store, telemetry } = harness();

    await gate
      .wrap(
        readTool(() => "ok"),
        turnContext(),
      )
      .execute({ query: "open" });

    expect((await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items).toHaveLength(
      0,
    );
    expect(telemetry.keys()).not.toContain("affidavit.filed");
  });

  it("turns a throw from the tool's own body into the error arm", async () => {
    const { gate } = harness();

    const result = await gate
      .wrap(
        readTool(() => {
          throw new Error("the search index is down");
        }),
        turnContext(),
      )
      .execute({ query: "open" });

    expect(result).toEqual({
      kind: "error",
      code: "tool-error",
      message: "the search index is down",
    });
  });

  it("reports a thrown non-Error without pretending it was one", async () => {
    const { gate } = harness();

    const result = await gate
      .wrap(
        readTool(() => {
          throw "nope";
        }),
        turnContext(),
      )
      .execute({ query: "open" });

    expect(result).toMatchObject({ kind: "error", code: "tool-error", message: "nope" });
  });
});
