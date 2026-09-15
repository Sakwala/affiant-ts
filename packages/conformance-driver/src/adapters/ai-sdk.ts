/**
 * The adapter binding for `@affiant/adapter-ai-sdk`: the three things the rulebook's
 * adapter section cannot know because they are the AI SDK's and nobody else's.
 *
 * Everything the section *is* — the gate built from `given.gate`, the tool
 * definitions, the Docket, the expectations — is in `../adapter.js`. What is here is
 * how this framework builds a tool set, how it calls one tool of it, and what it is
 * handed back to put in its own history.
 *
 * **This is the mapping the adapter's own suites already make.** `packages/
 * adapter-ai-sdk/test/support.ts`'s `callTool` calls a built tool's `execute` with
 * the options the SDK passes it — a call id, the message history, and the per-call
 * context the SDK validates against the tool's `contextSchema`. That is what a
 * `adapter-call` step is, and it is why a model-free declarative fixture over this
 * seam is possible at all.
 *
 * **`context: null` is `context: undefined` here**, and the distinction matters. The
 * SDK passes no `context` at all when the generation call carried no `toolsContext`,
 * and that is the call CV-2 is about: a seam that cannot obtain a context refuses
 * rather than falling back to a shared default (GT-2).
 *
 * @packageDocumentation
 */

import { ADAPTER_VERSION, affiantTools } from "@affiant/adapter-ai-sdk";
import type { AffiantToolDefinition } from "@affiant/adapter-ai-sdk";
import type { Gate, GatedToolResult, JsonValue } from "@affiant/core";
import type { ToolSet } from "ai";

import type {
  AdapterBinding,
  AdapterCall,
  AdapterCallShape,
  AdapterToolDefinition,
  FrameworkMessage,
} from "../adapter.js";
import { AI_SDK_VERSION } from "./version.js";

export { ADAPTER_PACKAGE_VERSION, AI_SDK_VERSION } from "./version.js";

/** The call id every scripted call uses. A fixture never states one; nothing reads it. */
const TOOL_CALL_ID = "call-1";

/**
 * One abstract framework artefact, in the shape the AI SDK carries it.
 *
 * A fixture states `{ kind: "framework-approval", approved: true }` and names no
 * framework; this is where that becomes the SDK's own `tool-approval-response` part,
 * the thing the SDK reconstructs an approval from on the next call — the path AZ-5
 * closes. Mapping it here rather than in the fixture is what keeps the document about
 * the rule instead of about one SDK's message format.
 */
function sdkMessage(message: FrameworkMessage): unknown {
  return {
    role: "tool",
    content: [
      {
        type: "tool-approval-response",
        approvalId: `approval-${TOOL_CALL_ID}`,
        approved: message.approved ?? true,
      },
    ],
  };
}

/** `@affiant/adapter-ai-sdk`, bound to the rulebook's adapter fixture section. */
export const aiSdkAdapter: AdapterBinding<ToolSet> = {
  package: "@affiant/adapter-ai-sdk",
  version: ADAPTER_VERSION,
  runtime: "ai",
  runtimeVersion: AI_SDK_VERSION,

  build(gate: Gate, definitions: readonly AdapterToolDefinition[]): ToolSet {
    return affiantTools(gate, definitions as readonly AffiantToolDefinition[]);
  },

  async call(set: ToolSet, call: AdapterCall): Promise<unknown> {
    const entry = set[call.tool];
    if (entry === undefined) {
      throw new Error(`the built tool set has no tool named ${JSON.stringify(call.tool)}`);
    }
    const execute = entry.execute;
    if (execute === undefined) {
      throw new Error(`tool ${JSON.stringify(call.tool)} declares no execute`);
    }
    // The options object the SDK hands an `execute`, assembled the way the SDK
    // assembles it — `ToolExecutionOptions` types `context` as required, and a call
    // that arrived with none is precisely the case CV-2 is about, so the absence has
    // to be expressible here.
    //
    // Three context kinds and three shapes. `"turn"` is the ordinary one, wrapped as
    // the SDK's tool context is. `"none"` passes no `context` at all, which is what
    // the SDK does when the generation call carried no `toolsContext`. `"malformed"`
    // passes the fixture's value through **unwrapped**: GT-2 is about a context an
    // implementation can read, and wrapping a malformed value would quietly repair it.
    const options = {
      toolCallId: TOOL_CALL_ID,
      // The framework's own history for this call, in the SDK's own shape. An adapter
      // reads no approval, no Affidavit and no entry state out of it (CV-3); a fixture
      // states one to prove that.
      messages: call.messages.map(sdkMessage),
      ...(call.contextKind === "none"
        ? {}
        : call.contextKind === "malformed"
          ? { context: call.context }
          : { context: { turn: call.context } }),
    };
    return await (execute as (input: unknown, options: unknown) => unknown)(call.args, options);
  },

  async modelOutput(set: ToolSet, call: AdapterCall, output: unknown): Promise<JsonValue> {
    const entry = set[call.tool];
    const toModelOutput = entry?.toModelOutput;
    if (toModelOutput === undefined) {
      throw new Error(`tool ${JSON.stringify(call.tool)} declares no toModelOutput`);
    }
    const result = await toModelOutput({ toolCallId: TOOL_CALL_ID, input: call.args, output });
    return (result.type === "json" ? result.value : result) as JsonValue;
  },

  classify(output: unknown): AdapterCallShape {
    const result = output as GatedToolResult<unknown>;
    switch (result?.kind) {
      case "write":
        return { kind: "filed", entryId: result.entryId };
      case "read":
        return { kind: "read", result: result.result };
      case "error":
        return { kind: "refused", code: result.code, message: result.message };
      default:
        throw new Error(
          `a gated tool returned ${JSON.stringify(output)}, which is none of the three result ` +
            `kinds a tool result is (AF-5)`,
        );
    }
  },
};
