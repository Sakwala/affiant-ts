/**
 * The adapter through the SDK's own generation surfaces: a `ToolLoopAgent` run, the
 * same run with the turn supplied per step, and the same path through `streamText`.
 *
 * The model is the SDK's mock, scripted to call the write tool and then talk. What is
 * being proved is that the seam works where a host will actually use it — the context
 * arrives through `toolsContext`, the gated `execute` runs, the filing reaches the
 * step, and the loop ends there.
 */

import { isAffiantError } from "@affiant/core";
import { generateText, streamText, ToolLoopAgent } from "ai";
import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext, stopWhenFiled } from "../src/index.js";

import { docketRows, scriptedModel, testGate, turnContext, writeTool } from "./support.js";

describe("a ToolLoopAgent run ends at the filing (A-4, AZ-5)", () => {
  it("files once, stops, and never runs the host's execute", async () => {
    const gate = testGate();
    let called = 0;
    const tools = affiantTools(gate, [
      writeTool({
        execute: () => {
          called += 1;
          return "written";
        },
      }),
    ]);
    const ctx = turnContext();

    const agent = new ToolLoopAgent({
      model: scriptedModel([
        { call: "update_ticket", input: { priority: "High" } },
        { text: "Filed it for review." },
      ]),
      tools,
      stopWhen: stopWhenFiled(),
      toolsContext: affiantToolsContext(ctx, tools),
    });

    const result = await agent.generate({ prompt: ctx.turn.utterance });

    expect(called).toBe(0);
    expect(result.steps).toHaveLength(1);
    const output = result.steps[0]?.toolResults[0]?.output as { kind: string; entryId: string };
    expect(output.kind).toBe("write");
    expect(await gate.get(output.entryId, ctx)).not.toBeNull();
  });

  it("takes the turn from prepareStep, so one agent can serve two conversations", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const first = turnContext({ conversationId: "conv-a", tenantId: "tenant-a" });
    const second = turnContext({ conversationId: "conv-b", tenantId: "tenant-b" });

    const run = async (ctx: ReturnType<typeof turnContext>): Promise<string> => {
      const agent = new ToolLoopAgent({
        model: scriptedModel([
          { call: "update_ticket", input: { priority: "High" } },
          { text: "Filed it." },
        ]),
        tools,
        stopWhen: stopWhenFiled(),
        prepareStep: () => ({ toolsContext: affiantToolsContext(ctx, tools) }),
      });
      const result = await agent.generate({ prompt: ctx.turn.utterance });
      const output = result.steps[0]?.toolResults[0]?.output as { entryId: string };
      return output.entryId;
    };

    const [a, b] = await Promise.all([run(first), run(second)]);

    // Two tenants, two rows, and neither is visible from the other's context (AZ-2).
    expect(a).not.toBe(b);
    expect(await gate.get(a, first)).not.toBeNull();
    expect(await gate.get(a, second)).toBeNull();
    expect(await gate.get(b, second)).not.toBeNull();
  });

  it("refuses a turn prepareStep does not answer for, when prepareStep is the only source", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const ctx = turnContext();
    let current: ReturnType<typeof turnContext> | null = ctx;

    const agent = new ToolLoopAgent({
      // One scripted step, so every turn's first model call is the same tool call.
      model: scriptedModel([{ call: "update_ticket", input: { priority: "High" } }]),
      tools,
      stopWhen: stopWhenFiled(),
      // The only source of the turn. No constructor-level `toolsContext`.
      prepareStep: () =>
        current === null ? {} : { toolsContext: affiantToolsContext(current, tools) },
    });

    const first = await agent.generate({ prompt: ctx.turn.utterance });
    expect((first.steps[0]?.toolResults[0]?.output as { kind: string }).kind).toBe("write");

    // Turn two arrives and the host forgot to name it. Nothing is filed for it.
    current = null;
    const failure = await agent
      .generate({ prompt: "and set it back to Low" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(isAffiantError((failure as { cause?: unknown }).cause)).toBe(true);
    expect(await docketRows(gate)).toHaveLength(1);
  });

  it("runs on when the model does not file, because only a filing stops the loop", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const ctx = turnContext();

    const agent = new ToolLoopAgent({
      model: scriptedModel([{ text: "Nothing to do." }]),
      tools,
      stopWhen: stopWhenFiled(),
      toolsContext: affiantToolsContext(ctx, tools),
    });

    const result = await agent.generate({ prompt: ctx.turn.utterance });

    expect(result.text).toBe("Nothing to do.");
    expect(result.steps).toHaveLength(1);
  });
});

describe("the same path through streamText (A-10)", () => {
  it("runs the gated execute and the filing reaches the stream", async () => {
    const gate = testGate();
    let called = 0;
    const tools = affiantTools(gate, [
      writeTool({
        execute: () => {
          called += 1;
          return "written";
        },
      }),
    ]);
    const ctx = turnContext();

    const result = streamText({
      model: scriptedModel([
        { call: "update_ticket", input: { priority: "High" } },
        { text: "Filed it for review." },
      ]),
      tools,
      stopWhen: stopWhenFiled(),
      prompt: ctx.turn.utterance,
      toolsContext: affiantToolsContext(ctx, tools),
    });

    // Draining the text stream runs the loop to completion.
    for await (const chunk of result.textStream) void chunk;

    const steps = await result.steps;
    expect(called).toBe(0);
    expect(steps).toHaveLength(1);
    const output = steps[0]?.toolResults[0]?.output as { kind: string; entryId: string };
    expect(output.kind).toBe("write");
    expect(await gate.get(output.entryId, ctx)).not.toBeNull();
  });
});

describe("how the refusal reaches a host through the SDK (GT-2)", () => {
  it("arrives as the SDK's own validation error carrying the AffiantError as cause", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const ctx = turnContext();

    // The host forgot `toolsContext` altogether.
    const failure = await generateText({
      model: scriptedModel([
        { call: "update_ticket", input: { priority: "High" } },
        { text: "Filed it." },
      ]),
      tools,
      stopWhen: stopWhenFiled(),
      prompt: ctx.turn.utterance,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const cause = (failure as { cause?: unknown }).cause;
    expect(isAffiantError(cause)).toBe(true);
    expect((cause as { code: string }).code).toBe("wireup-invalid");
    expect((cause as Error).message).toContain("GT-2");
    expect(await docketRows(gate)).toHaveLength(0);
  });
});
