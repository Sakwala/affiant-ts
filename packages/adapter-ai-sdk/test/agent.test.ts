/**
 * The adapter through the SDK's own generation surfaces: a `ToolLoopAgent` run, the
 * same run with the turn supplied per step, and the same path through `streamText`.
 *
 * The model is the SDK's mock, scripted to call the write tool and then talk. What is
 * being proved is that the seam works where a host will actually use it — the context
 * arrives through `toolsContext`, the gated `execute` runs, the filing reaches the
 * step, and the loop ends there.
 */

import { streamText, ToolLoopAgent } from "ai";
import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext, stopWhenFiled } from "../src/index.js";

import { scriptedModel, testGate, turnContext, writeTool } from "./support.js";

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
