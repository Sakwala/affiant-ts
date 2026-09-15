/**
 * Fixtures shared by the adapter suites: a gate wired to in-memory ports, tool
 * definitions, and a mock language model scripted to call a tool and then talk.
 *
 * Not a suite itself — `vitest.config.ts` collects `test/**\/*.test.ts`, so this
 * module is only ever imported. Everything here runs on Node, Bun and workerd alike:
 * no filesystem, no Node global.
 */

import type {
  FieldSchema,
  Gate,
  GatedToolResult,
  InferencePort,
  JsonValue,
  Operation,
  ProjectionPort,
  ToolDefinition,
  TurnContext,
} from "@affiant/core";
import { createGate } from "@affiant/core";
import { InMemoryDocketStore, InMemorySessionStore } from "@affiant/core/store-memory";
import type { ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/** The instant every fixture's clock reads. */
export const AT = "2026-09-15T09:00:00.000Z";

/** A turn context, explicit in every property (GT-2). */
export function turnContext(init: Partial<TurnContext> = {}): TurnContext {
  return {
    conversationId: "conv-1",
    tenantId: "tenant-a",
    channel: "chat",
    principal: { kind: "member", id: "member-1" },
    turn: { utterance: "Set the ticket priority to High", messageId: "msg-1", at: AT },
    ...init,
  };
}

/** The arguments the fixture tools take: a flat bag of field values. */
export type WriteArgs = { readonly [field: string]: JsonValue };

/** A field schema over `fields`, all text and all optional. */
export function schemaFor(entityType: string, fields: readonly string[]): FieldSchema {
  return {
    entityType,
    fields: fields.map((name) => ({
      name,
      kind: "text" as const,
      description: `The ${name}`,
      required: false,
      allowedValues: null,
      pattern: null,
    })),
  };
}

/** What {@link writeTool} lets a suite vary. */
export interface WriteToolInit {
  readonly name?: string;
  readonly fields?: readonly string[];
  readonly executedBy?: "host" | "provider";
  readonly hostedMcp?: boolean;
  readonly execute?: (args: WriteArgs, ctx: TurnContext) => Promise<string> | string;
  readonly omitOperation?: boolean;
}

/**
 * The `execute` a fixture write tool carries by default: a tripwire.
 *
 * A write tool needs *something* for the gate to stand in front of — a tool with no
 * `execute` is the `"no-execute"` uncovered category (CV-4). Making the default a
 * function that fails the suite if it is ever reached is GT-6 as a tripwire on every
 * fixture rather than only on the one that spies for it.
 */
export function refuseExecute(): never {
  throw new Error("GT-6: a write tool's own execute was called");
}

/** A write-capable definition whose `operation` names the fields its arguments carry. */
export function writeTool(init: WriteToolInit = {}): ToolDefinition<WriteArgs, string> {
  const fields = init.fields ?? ["priority"];
  const operation = (args: WriteArgs): Operation => ({
    kind: "update",
    entityType: "Ticket",
    entityId: "ticket-1",
    fields: Object.keys(args),
  });
  return {
    name: init.name ?? "update_ticket",
    description: "Update a ticket.",
    inputSchema: schemaFor("Ticket", fields),
    writeCapable: true,
    execute: init.execute ?? refuseExecute,
    ...(init.executedBy === undefined ? {} : { executedBy: init.executedBy }),
    ...(init.hostedMcp === undefined ? {} : { hostedMcp: init.hostedMcp }),
    ...(init.omitOperation === true ? {} : { operation }),
    operationLabel: "WriteUpdate",
  };
}

/** A read definition whose `execute` records the context it was called with. */
export function readTool(
  seen: TurnContext[],
  name = "find_ticket",
): ToolDefinition<WriteArgs, string> {
  return {
    name,
    description: "Find a ticket.",
    inputSchema: schemaFor("Ticket", ["query"]),
    writeCapable: false,
    execute(args, ctx) {
      seen.push(ctx);
      return `ticket-1 matches ${String(args["query"])}`;
    },
  };
}

/** An {@link InferencePort} that reports one field for every turn. */
export function inferencePort(field = "priority", value: JsonValue = "High"): InferencePort {
  return {
    async infer() {
      return { fields: { [field]: { value, confidence: 0.9 } } };
    },
  };
}

/** A {@link ProjectionPort} that reports nothing. */
export const emptyProjection: ProjectionPort = {
  async previousValues() {
    return null;
  },
};

/** What {@link testGate} lets a suite vary. */
export interface GateInit {
  readonly inference?: InferencePort;
  readonly field?: string;
}

/** A gate with in-memory ports and a fixed clock. */
export function testGate(init: GateInit = {}): Gate {
  const store = new InMemoryDocketStore({ clock: { now: () => AT } });
  return createGate({
    store,
    sessions: new InMemorySessionStore(store),
    inference: init.inference ?? inferencePort(init.field),
    projection: emptyProjection,
    authorization: {
      async mayDecide() {
        return true;
      },
    },
    clock: { now: () => AT },
    defaultTtlMs: 3_600_000,
  });
}

// ---------------------------------------------------------------------------
// The mock model
// ---------------------------------------------------------------------------

/**
 * The provider-spec result types, taken from the mock model's own constructor rather
 * than by importing `@ai-sdk/provider`.
 *
 * The adapter depends on `ai` and on nothing underneath it, and a test that reached
 * past that line would pin a transitive version this package does not declare. The
 * mock's options carry exactly the two shapes a scripted model has to produce.
 */
type MockInit = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type GenerateResult = Awaited<
  ReturnType<Extract<NonNullable<MockInit["doGenerate"]>, (...args: never[]) => unknown>>
>;
type StreamResult = Awaited<
  ReturnType<Extract<NonNullable<MockInit["doStream"]>, (...args: never[]) => unknown>>
>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

/** Nothing spent — the mock model reports no usage. */
const NO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** One scripted step: a tool call, or the text the model finishes with. */
export type ScriptedStep =
  { readonly call: string; readonly input: Record<string, JsonValue> } | { readonly text: string };

function generateResultFor(step: ScriptedStep, index: number): GenerateResult {
  if ("text" in step) {
    return {
      content: [{ type: "text", text: step.text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: NO_USAGE,
      warnings: [],
    };
  }
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: `call-${String(index)}`,
        toolName: step.call,
        input: JSON.stringify(step.input),
      },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage: NO_USAGE,
    warnings: [],
  };
}

function streamPartsFor(step: ScriptedStep, index: number): StreamPart[] {
  if ("text" in step) {
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: `text-${String(index)}` },
      { type: "text-delta", id: `text-${String(index)}`, delta: step.text },
      { type: "text-end", id: `text-${String(index)}` },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: NO_USAGE },
    ];
  }
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId: `call-${String(index)}`,
      toolName: step.call,
      input: JSON.stringify(step.input),
    },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: NO_USAGE },
  ];
}

/**
 * A mock language model that plays `steps` in order, one per generation step.
 *
 * The SDK's own mock is the model here on purpose: no provider package is a
 * dependency of this adapter, and a suite that reached for one would make the
 * adapter's tests prove something about a provider rather than about the seam.
 */
export function scriptedModel(steps: readonly ScriptedStep[]): MockLanguageModelV4 {
  let generateIndex = 0;
  let streamIndex = 0;
  const at = (index: number): ScriptedStep =>
    steps[Math.min(index, steps.length - 1)] as ScriptedStep;
  return new MockLanguageModelV4({
    doGenerate: () => {
      const index = generateIndex;
      generateIndex += 1;
      return Promise.resolve(generateResultFor(at(index), index));
    },
    doStream: () => {
      const index = streamIndex;
      streamIndex += 1;
      const parts = streamPartsFor(at(index), index);
      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      });
    },
  });
}

/** A mock model that answers one structured-output call with `object`. */
export function structuredModel(object: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text" as const, text: JSON.stringify(object) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: NO_USAGE,
        warnings: [],
      }),
  });
}

// ---------------------------------------------------------------------------
// Calling a tool the way the SDK does
// ---------------------------------------------------------------------------

/** Call one entry of a `ToolSet` with the options the SDK passes an `execute`. */
export async function callTool(
  tools: ToolSet,
  name: string,
  input: unknown,
  context: unknown,
): Promise<GatedToolResult<unknown>> {
  const entry = tools[name];
  if (entry === undefined) throw new Error(`no tool named ${name}`);
  const run = entry.execute;
  if (run === undefined) throw new Error(`tool ${name} declares no execute`);
  const output = await run(input, { toolCallId: "call-1", messages: [], context });
  return output as GatedToolResult<unknown>;
}

/** What one entry's `toModelOutput` makes of a result — what the model is actually shown. */
export async function summaryOf(
  tools: ToolSet,
  name: string,
  input: unknown,
  output: unknown,
): Promise<unknown> {
  const entry = tools[name];
  if (entry === undefined) throw new Error(`no tool named ${name}`);
  const toModelOutput = entry.toModelOutput;
  if (toModelOutput === undefined) throw new Error(`tool ${name} declares no toModelOutput`);
  const result = await toModelOutput({ toolCallId: "call-1", input, output });
  return result.type === "json" ? result.value : result;
}
