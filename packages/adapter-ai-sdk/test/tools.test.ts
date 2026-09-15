/**
 * The seam itself: what `affiantTools` builds, what it refuses to build, and what a
 * call through it does.
 *
 * Every suite here runs on Node, under Bun and inside workerd.
 */

import { AffiantError, isAffiantError } from "@affiant/core";
import { jsonSchema, tool } from "ai";
import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext, TURN_CONTEXT_SCHEMA } from "../src/index.js";

import {
  callTool,
  readTool,
  summaryOf,
  testGate,
  turnContext,
  writeTool,
  type WriteArgs,
} from "./support.js";

describe("a read tool runs with the context of the call (GT-2)", () => {
  it("passes the turn context through the gate to the host's own execute", async () => {
    const gate = testGate();
    const seen: ReturnType<typeof turnContext>[] = [];
    const tools = affiantTools(gate, [readTool(seen)]);
    const ctx = turnContext({ conversationId: "conv-7" });

    const result = await callTool(tools, "find_ticket", { query: "open" }, { turn: ctx });

    expect(result).toEqual({ kind: "read", result: "ticket-1 matches open" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.conversationId).toBe("conv-7");
    expect(seen[0]).toBe(ctx);
  });

  it("gives two interleaved calls their own context and nothing shared", async () => {
    const gate = testGate();
    const seen: ReturnType<typeof turnContext>[] = [];
    const tools = affiantTools(gate, [readTool(seen)]);

    await Promise.all([
      callTool(
        tools,
        "find_ticket",
        { query: "a" },
        { turn: turnContext({ conversationId: "one" }) },
      ),
      callTool(
        tools,
        "find_ticket",
        { query: "b" },
        { turn: turnContext({ conversationId: "two" }) },
      ),
    ]);

    expect(seen.map((ctx) => ctx.conversationId).sort()).toEqual(["one", "two"]);
  });
});

describe("a write tool files a proposal and never runs the host's execute (GT-6)", () => {
  it("returns the entry and card, and the tripwire execute is never reached", async () => {
    const gate = testGate();
    let called = 0;
    // A tripwire: if the gate ever calls a write tool's own execute this counts it
    // and the assertion below fails. The gate's write path does not hold a reference
    // to this function at all.
    const definition = writeTool({
      execute: () => {
        called += 1;
        return "written";
      },
    });
    const tools = affiantTools(gate, [definition]);

    const result = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext() },
    );

    expect(called).toBe(0);
    expect(result.kind).toBe("write");
    if (result.kind !== "write") throw new Error("unreachable");
    expect(result.status).toBe("pending");
    expect(result.entryId).toMatch(/\S/);
    expect(await gate.get(result.entryId, turnContext())).not.toBeNull();
  });

  it("shows the model a summary of the filing and not the Affidavit (A-4)", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const input: WriteArgs = { priority: "High" };

    const result = await callTool(tools, "update_ticket", input, { turn: turnContext() });
    const summary = (await summaryOf(tools, "update_ticket", input, result)) as Record<
      string,
      unknown
    >;

    expect(summary["outcome"]).toBe("filed-for-review");
    expect(summary["entryId"]).toBe(result.kind === "write" ? result.entryId : null);
    expect(summary["status"]).toBe("pending");
    expect(summary["fields"]).toEqual(["priority"]);
    expect(summary["blocked"]).toBeNull();
    expect(Object.keys(summary).sort()).toEqual([
      "blocked",
      "entryId",
      "fields",
      "note",
      "outcome",
      "requiresConfirmation",
      "status",
    ]);
  });

  it("hands the host the whole result with the context it ran under", async () => {
    const gate = testGate();
    const seen: { entryId: string; conversationId: string }[] = [];
    const tools = affiantTools(gate, [writeTool()], {
      onResult(result, ctx) {
        if (result.kind === "write") {
          seen.push({ entryId: result.entryId, conversationId: ctx.conversationId });
        }
      },
    });

    await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext({ conversationId: "conv-9" }) },
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.conversationId).toBe("conv-9");
  });
});

describe("a call with no usable context is refused, never defaulted (GT-2, CV-2)", () => {
  it("throws when the context is missing", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);

    await expect(callTool(tools, "update_ticket", { priority: "High" }, undefined)).rejects.toThrow(
      AffiantError,
    );
  });

  it("throws when the context is the wrong shape", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);

    const failure = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: { conversationId: "conv-1" } },
    ).catch((error: unknown) => error);

    expect(isAffiantError(failure)).toBe(true);
    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).message).toContain("GT-2");
  });

  it("files nothing when the context is refused", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);

    await callTool(tools, "update_ticket", { priority: "High" }, null).catch(() => undefined);

    const page = await gate.rehydrate({ tenantId: "tenant-a" }, { limit: 10, cursor: null });
    expect(page.items).toHaveLength(0);
  });
});

describe("coverage is settled when the ToolSet is built, not on the first call (CV-4, CV-1)", () => {
  it("refuses a provider-executed write tool the gate holds no declaration for", () => {
    const gate = testGate();
    const failure = (() => {
      try {
        affiantTools(gate, [writeTool({ executedBy: "provider" })]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(isAffiantError(failure)).toBe(true);
    expect((failure as AffiantError).code).toBe("coverage-refused");
    expect((failure as AffiantError).details["category"]).toBe("provider-executed");
    expect((failure as AffiantError).details["toolName"]).toBe("update_ticket");
  });

  it("refuses a write tool the host exposes as a provider tool", () => {
    const gate = testGate();
    expect(() => affiantTools(gate, [{ ...writeTool(), sdkKind: "provider" as const }])).toThrow(
      /coverage-refused|uncovered category/,
    );
  });

  it("refuses a write tool the host exposes as a dynamic tool (A-3)", () => {
    const gate = testGate();
    const failure = (() => {
      try {
        affiantTools(gate, [{ ...writeTool(), sdkKind: "dynamic" as const }]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("coverage-refused");
    expect((failure as AffiantError).details["category"]).toBe("dynamic");
  });

  it("refuses a hosted-MCP write tool", () => {
    const gate = testGate();
    expect(() => affiantTools(gate, [writeTool({ hostedMcp: true })])).toThrow(AffiantError);
  });

  it("refuses a write tool with no operation", () => {
    const gate = testGate();
    const failure = (() => {
      try {
        affiantTools(gate, [writeTool({ omitOperation: true })]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
  });

  it("refuses two definitions with the same name", () => {
    const gate = testGate();
    expect(() => affiantTools(gate, [writeTool(), writeTool()])).toThrow(AffiantError);
  });

  it("builds a declared uncovered tool, and its proposals file pending and blocked", async () => {
    const gate = testGate();
    const definition = writeTool({ executedBy: "provider" });
    gate.declareUncovered(definition, "provider-executed");
    const tools = affiantTools(gate, [definition]);

    const result = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext() },
    );

    expect(result.kind).toBe("write");
    if (result.kind !== "write") throw new Error("unreachable");
    expect(result.status).toBe("pending");
    expect(result.card.blocked).toEqual({
      code: "coverage-refused",
      category: "provider-executed",
      toolName: "update_ticket",
    });
    expect(result.card.requiresConfirmation).toBe(false);
  });

  it("declares a read tool with no execute to the model and executes nothing", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [
      {
        name: "client_side_read",
        description: "A read the client runs.",
        inputSchema: { entityType: "Ticket", fields: [] },
        writeCapable: false,
      },
    ]);

    expect(tools["client_side_read"]).toBeDefined();
    expect(tools["client_side_read"]?.execute).toBeUndefined();
  });
});

describe("the model-facing input schema is derived from the field schema (A-5)", () => {
  it("maps each kind and honours required", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [
      {
        ...writeTool(),
        inputSchema: {
          entityType: "Ticket",
          fields: [
            {
              name: "title",
              kind: "text",
              description: null,
              required: true,
              allowedValues: null,
              pattern: null,
            },
            {
              name: "points",
              kind: "number",
              description: "Story points",
              required: false,
              allowedValues: null,
              pattern: null,
            },
            {
              name: "due",
              kind: "date",
              description: null,
              required: false,
              allowedValues: null,
              pattern: null,
            },
            {
              name: "priority",
              kind: "enum",
              description: null,
              required: false,
              allowedValues: ["Low", "High"],
              pattern: null,
            },
          ],
        },
      },
    ]);

    const schema = tools["update_ticket"]?.inputSchema as { jsonSchema: Record<string, unknown> };
    const json = schema.jsonSchema as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
      additionalProperties: boolean;
    };

    expect(json.properties["title"]).toEqual({ type: "string" });
    expect(json.properties["points"]).toEqual({ type: "number", description: "Story points" });
    expect(json.properties["due"]).toEqual({ type: "string", format: "date" });
    expect(json.properties["priority"]).toEqual({ type: "string", enum: ["Low", "High"] });
    expect(json.required).toEqual(["title"]);
    expect(json.additionalProperties).toBe(false);
  });

  it("takes a host's own schema when its properties are the declared fields", () => {
    const gate = testGate();
    const supplied = {
      type: "object",
      properties: { priority: { type: "string", description: "Low, Medium or High" } },
    };
    const tools = affiantTools(gate, [{ ...writeTool(), modelInputSchema: supplied }]);

    const schema = tools["update_ticket"]?.inputSchema as { jsonSchema: unknown };
    expect(schema.jsonSchema).toBe(supplied);
  });

  it("refuses a host schema whose properties are not the declared fields", () => {
    const gate = testGate();
    expect(() =>
      affiantTools(gate, [
        {
          ...writeTool(),
          modelInputSchema: { type: "object", properties: { urgency: { type: "string" } } },
        },
      ]),
    ).toThrow(AffiantError);
  });

  it("refuses a host schema that is not an object at all", () => {
    const gate = testGate();
    expect(() =>
      affiantTools(gate, [{ ...writeTool(), modelInputSchema: { type: "string" } }]),
    ).toThrow(/flat object/);
  });

  it("refuses a nested host schema", () => {
    const gate = testGate();
    const failure = (() => {
      try {
        affiantTools(gate, [
          {
            ...writeTool(),
            modelInputSchema: {
              type: "object",
              properties: {
                priority: {
                  type: "object",
                  properties: { level: { type: "string" }, note: { type: "string" } },
                },
              },
            },
          },
        ]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).message).toContain("nested object");
  });

  it("refuses a host schema with an array property", () => {
    const gate = testGate();
    expect(() =>
      affiantTools(gate, [
        {
          ...writeTool(),
          modelInputSchema: {
            type: "object",
            properties: { priority: { type: "array", items: { type: "string" } } },
          },
        },
      ]),
    ).toThrow(/array/);
  });

  it("refuses a host schema requiring a property the field schema does not declare", () => {
    const gate = testGate();
    expect(() =>
      affiantTools(gate, [
        {
          ...writeTool(),
          modelInputSchema: {
            type: "object",
            properties: { priority: { type: "string" } },
            required: ["priority", "assignee"],
          },
        },
      ]),
    ).toThrow(/"assignee", which the field schema does not declare/);
  });
});

describe("the per-turn context map", () => {
  it("carries one entry per gated tool and leaves a host's own tools alone", () => {
    const gate = testGate();
    const seen: ReturnType<typeof turnContext>[] = [];
    const tools = affiantTools(gate, [
      writeTool(),
      readTool(seen),
      {
        name: "client_side_read",
        description: "A read the client runs.",
        inputSchema: { entityType: "Ticket", fields: [] },
        writeCapable: false,
      },
    ]);
    const ctx = turnContext();

    // A tool of the host's own, in the same ToolSet, taking its own context.
    const hostOwn = tool({
      description: "The host's own tool.",
      inputSchema: jsonSchema<unknown>({ type: "object" }),
      contextSchema: jsonSchema<{ tenant: string }>({ type: "object" }),
      execute: () => "ok",
    });

    const map = affiantToolsContext(ctx, { ...tools, host_own_tool: hostOwn });

    expect(Object.keys(map).sort()).toEqual(["find_ticket", "update_ticket"]);
    expect(map["update_ticket"]).toEqual({ turn: ctx });
    expect(map["client_side_read"]).toBeUndefined();
  });

  it("names the turn context schema every gated tool declares", () => {
    expect(TURN_CONTEXT_SCHEMA).toMatchObject({ type: "object", required: ["turn"] });
  });
});
