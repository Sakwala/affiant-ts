/**
 * The seam: Affiant tool definitions become an AI SDK `ToolSet` whose every
 * `execute` runs through the gate with an explicit turn context.
 *
 * **Rules served: GT-2** (the context is supplied per call through the SDK's own
 * channel and a call without one is refused, never defaulted), **CV-2** (this is a
 * call site: it calls the gate directly and throws when it cannot), **GT-6** (a
 * write-capable definition's own `execute` is never reachable from the function the
 * SDK calls), **CV-4** and **CV-1** (a write-capable tool the adapter cannot
 * intercept is refused when `affiantTools` is built, unless the host has already
 * declared it uncovered), **AZ-5** (the filing is the result; the SDK's approval
 * mechanism is not used, because the Docket is the record of approval authority).
 *
 * ## Where the context comes from, and why it is per call
 *
 * The gate binds a turn at `wrap(tool, ctx)`. The SDK binds it at the call, through
 * `toolsContext`, which it validates against each tool's `contextSchema` and hands to
 * `execute` as `options.context`. So the adapter wraps **per call**: the gated tool
 * for this call is built from the context this call arrived with, used once, and
 * dropped. Nothing is kept between calls, there is no registry keyed by conversation,
 * and there is no default context to fall back to — a call whose context is missing
 * or the wrong shape throws (GT-2, CV-2).
 *
 * ## What the model sees after a filing
 *
 * A write tool's `execute` *is* the filing, so what comes back is a proposal: the
 * Docket entry's id, the status the row reads at, whether a person must confirm it,
 * and the names of the fields sworn to. `toModelOutput` cuts the full result down to
 * that, so the Affidavit and the Evidence Card do not go back into the transcript.
 * The host gets the whole result through {@link AffiantToolsOptions.onResult}.
 *
 * @packageDocumentation
 */

import type {
  FieldSchema,
  Gate,
  GatedToolResult,
  ToolDefinition,
  TurnContext,
  UncoveredCategory,
} from "@affiant/core";
import { AffiantError, assessCoverage } from "@affiant/core";
import type { JSONValue, Schema, Tool, ToolSet } from "ai";
import { jsonSchema, tool } from "ai";

import type { JsonSchemaObject } from "./schema.js";
import { assertMatchesFields, inputSchemaOf, TURN_CONTEXT_SCHEMA } from "./schema.js";

export { TURN_CONTEXT_SCHEMA } from "./schema.js";
export type { JsonSchemaObject } from "./schema.js";

// ---------------------------------------------------------------------------
// What a host hands in
// ---------------------------------------------------------------------------

/**
 * The per-call context an adapter-built tool declares and reads: the Affiant turn
 * context, under `turn`.
 *
 * It is an object rather than the bare context because the SDK's tool context is a
 * `Record<string, unknown>`, and a named property leaves room for a host to carry its
 * own keys alongside without either side guessing which is which.
 */
export type AffiantToolContext = {
  /** The turn this call runs under (GT-2). */
  readonly turn: TurnContext;
};

/**
 * An Affiant tool definition, plus the two things the SDK needs to know that the
 * core's {@link ToolDefinition} has no place for.
 *
 * Both are optional, and a plain `ToolDefinition` is a valid input.
 */
export interface AffiantToolDefinition<TArgs = never, TResult = unknown> extends ToolDefinition<
  TArgs,
  TResult
> {
  /**
   * Which kind of SDK tool the host exposes this definition as. `"provider"` means
   * the model provider runs it, which is an uncovered category (CV-4); `"dynamic"`
   * is a tool whose input shape is only known at runtime. Defaults to `"function"`.
   */
  readonly sdkKind?: "function" | "dynamic" | "provider";
  /**
   * The model-facing JSON Schema, when the host would rather write it than have it
   * derived from {@link ToolDefinition.inputSchema}. It must be a flat object whose
   * property names are exactly the declared field names, or wire-up refuses it.
   */
  readonly modelInputSchema?: JsonSchemaObject;
}

/** What {@link affiantTools} lets a host vary. */
export interface AffiantToolsOptions {
  /**
   * Receives every gated result with the context it ran under; the model sees only
   * the compact summary.
   *
   * This is where a host reads the Evidence Card it is about to deliver, or records
   * the entry id against its own turn. Awaited before the tool call returns, so a
   * host that files the card to a queue knows it is filed before the model is told
   * anything. A throw from it propagates.
   */
  readonly onResult?: (result: GatedToolResult<unknown>, ctx: TurnContext) => void | Promise<void>;
}

/**
 * The `ToolSet` {@link affiantTools} returns: an ordinary SDK `ToolSet` whose entries
 * are known to take an {@link AffiantToolContext}.
 *
 * It is a `ToolSet` wherever one is wanted. Naming the context type is what lets the
 * SDK check the `toolsContext` a host passes on the generation call, instead of
 * widening it to nothing and making every host cast.
 */
export type AffiantToolSet = Record<
  string,
  Tool<any, any, AffiantToolContext> &
    Pick<
      Tool<any, any, any>,
      "execute" | "onInputAvailable" | "onInputStart" | "onInputDelta" | "needsApproval"
    >
>;

/**
 * Why a write-capable definition could not be gated, when it could not (CV-4), plus
 * the one category this version of the adapter adds.
 */
export type AdapterUncoveredCategory = UncoveredCategory | "dynamic";

// ---------------------------------------------------------------------------
// The context schema
// ---------------------------------------------------------------------------

/** Whether `value` is an {@link AffiantToolContext} the gate can be called with. */
function isToolContext(value: unknown): value is AffiantToolContext {
  if (typeof value !== "object" || value === null) return false;
  const turn = (value as { readonly turn?: unknown }).turn;
  if (typeof turn !== "object" || turn === null) return false;
  const ctx = turn as Partial<TurnContext>;
  return (
    typeof ctx.conversationId === "string" &&
    typeof ctx.tenantId === "string" &&
    typeof ctx.channel === "string" &&
    typeof ctx.turn === "object" &&
    ctx.turn !== null &&
    typeof ctx.turn.utterance === "string" &&
    typeof ctx.turn.messageId === "string" &&
    typeof ctx.turn.at === "string"
  );
}

/**
 * The `contextSchema` every gated tool declares.
 *
 * One frozen value for the module: it is the schema itself, not state, and its
 * identity is what {@link affiantToolsContext} matches on so that a host's own
 * context-taking tools in the same `ToolSet` are left alone.
 */
const TURN_CONTEXT_FLEX_SCHEMA: Schema<AffiantToolContext> = jsonSchema<AffiantToolContext>(
  TURN_CONTEXT_SCHEMA as Parameters<typeof jsonSchema>[0],
  {
    validate: (value: unknown) =>
      isToolContext(value)
        ? { success: true as const, value }
        : { success: false as const, error: contextError(value) },
  },
);

/** The refusal a call with no usable context gets (GT-2, CV-2). */
function contextError(value: unknown, toolName?: string): AffiantError {
  const named = toolName === undefined ? "a gated tool" : JSON.stringify(toolName);
  return new AffiantError(
    "wireup-invalid",
    `GT-2: ${named} was called with ${value === undefined ? "no" : "an unusable"} turn ` +
      `context. Pass \`toolsContext: affiantToolsContext(ctx, tools)\` on the generation ` +
      `call, where \`ctx\` is the turn context for this turn. There is no shared default to ` +
      `fall back to: two conversations must never observe each other's context, so a seam ` +
      `that cannot obtain one refuses (CV-2).`,
    toolName === undefined ? {} : { toolName },
  );
}

/** The context for this call, or the refusal. */
function requireContext(value: unknown, toolName: string): AffiantToolContext {
  if (!isToolContext(value)) throw contextError(value, toolName);
  return value;
}

// ---------------------------------------------------------------------------
// Classification (CV-4)
// ---------------------------------------------------------------------------

/** What {@link classify} found about one definition. */
type Classification =
  | { readonly covered: true }
  | { readonly covered: false; readonly category: AdapterUncoveredCategory };

/**
 * Whether the adapter can intercept `definition`, and if not, which category it falls
 * in (CV-4).
 *
 * Two categories the core cannot see from a `ToolDefinition` alone are added here,
 * because they are facts about the SDK rather than about the tool: a definition the
 * host exposes as a provider tool is provider-executed, and one it exposes as a
 * dynamic tool carries no field schema the model's input can be checked against, so
 * there is nothing to derive an Affidavit's shape from.
 */
function classify(definition: AffiantToolDefinition): Classification {
  if (definition.sdkKind === "provider") return { covered: false, category: "provider-executed" };
  if (definition.sdkKind === "dynamic") return { covered: false, category: "dynamic" };
  const assessment = assessCoverage(definition);
  return assessment.covered ? { covered: true } : { covered: false, category: assessment.category };
}

/** The wire-up refusal for a write-capable tool in an uncovered category (CV-4, CV-1). */
function coverageRefusal(toolName: string, category: AdapterUncoveredCategory): AffiantError {
  if (category === "dynamic") {
    return new AffiantError(
      "coverage-refused",
      `CV-4: write-capable tool ${JSON.stringify(toolName)} is exposed as a dynamic tool. A ` +
        `dynamic tool's input shape is not known until it is called, so there is no field ` +
        `schema to swear an Affidavit over and no way to say what the call proposes to ` +
        `write. Expose it as a function tool with a field schema, or do not make it ` +
        `write-capable. Dynamic write tools are refused in this version.`,
      { toolName, category },
    );
  }
  return new AffiantError(
    "coverage-refused",
    `CV-4: write-capable tool ${JSON.stringify(toolName)} is in an uncovered category ` +
      `(${category}) — there is no \`execute\` in this process for the adapter to stand in ` +
      `front of, so a write through it would not be filed. Either make it interceptable, or ` +
      `call gate.declareUncovered(tool, ${JSON.stringify(category)}) so every proposal from ` +
      `it is filed blocked on the Docket. There is no option that turns the gate off (CV-1).`,
    { toolName, category },
  );
}

// ---------------------------------------------------------------------------
// What the model is told
// ---------------------------------------------------------------------------

/**
 * The compact result a model is given, cut down from the full gated result (AZ-5, AZ-7).
 *
 * A filing tells the model three things and no more: an id it can refer to, whether
 * the row is waiting on a person, and which fields were sworn to. It is never told
 * that the write happened, because it did not — the gate does not execute (AZ-7), and
 * an executor runs later from an approved row (AZ-5).
 */
function modelSummary(result: GatedToolResult<unknown>): JSONValue {
  switch (result.kind) {
    case "write": {
      const fields: string[] = result.card.affidavit.fields.map((field) => field.name);
      const blocked =
        result.card.blocked === null ? null : ({ ...result.card.blocked } as unknown as JSONValue);
      return {
        outcome: "filed-for-review",
        entryId: result.entryId,
        status: result.status,
        requiresConfirmation: result.card.requiresConfirmation,
        fields,
        blocked,
        note:
          result.card.blocked === null
            ? "Filed for review. The write has not happened and will not happen until it is approved and the host's executor runs it."
            : "Filed on the record, but blocked: no decision on this entry will be accepted, so the write will not happen.",
      };
    }
    case "read":
      return (result.result ?? null) as JSONValue;
    case "error":
      return { outcome: "refused", code: result.code, message: result.message };
  }
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

/**
 * Build the AI SDK `ToolSet` for `definitions`, with the gate in front of every one
 * the adapter can intercept.
 *
 * One entry per definition, keyed by the definition's name. What each entry is:
 *
 * - a **write-capable** definition becomes a tool whose `execute` calls the gate and
 *   returns the proposal. The definition's own `execute` is never called from here:
 *   the only function this closure invokes is `gate.wrap(...).execute`, and the gate's
 *   write path holds no reference to it (GT-6);
 * - a **read** definition the adapter can intercept becomes a tool whose `execute`
 *   calls the gate, which calls the host's own function with the same explicit
 *   context (GT-2);
 * - a definition with nothing to intercept and no write to guard — a read the client
 *   or the provider runs — is declared to the model and executed by nobody here.
 *
 * Nothing here sets `needsApproval` or `toolApproval`. The SDK's approval flow
 * reconstructs approval from client-supplied message history; AZ-5 says approval
 * authority lives on the Docket row and nowhere else, so this adapter does not offer
 * a second place for it to appear to live.
 *
 * @throws AffiantError `"coverage-refused"` when a write-capable definition is in a
 *         category the adapter cannot intercept and the gate holds no declaration for
 *         it (CV-4, CV-1), or `"wireup-invalid"` when a definition is unusable — a
 *         write tool with no `operation`, a read tool that cannot be called, a
 *         duplicate name, or a supplied model schema that does not match the fields.
 */
export function affiantTools(
  gate: Gate,
  // `any` rather than the core's `<never, unknown>` defaults: the gated `execute`
  // receives the model's input, which is only ever `unknown` at this seam, and a
  // definition typed for its own arguments must still be accepted without a cast at
  // the call site. The host's types are preserved where they matter — in the
  // definition's own `operation` and `execute`.
  definitions: readonly AffiantToolDefinition<any, any>[],
  options: AffiantToolsOptions = {},
): AffiantToolSet {
  const tools: Record<string, ToolSet[string]> = {};
  const onResult = options.onResult;

  for (const definition of definitions) {
    const name = definition.name;
    if (name.trim() === "") {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: a tool definition has a blank name. The name is what the model calls and what ` +
          `a Docket row records, so it cannot be empty.`,
        {},
      );
    }
    if (Object.prototype.hasOwnProperty.call(tools, name)) {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: two tool definitions are named ${JSON.stringify(name)}. A ToolSet is keyed by ` +
          `name, so the second would replace the first and one of the two would silently ` +
          `stop being gated.`,
        { toolName: name },
      );
    }

    const inputSchema = modelSchemaOf(definition);
    const classification = classify(definition);

    if (definition.writeCapable) {
      if (!classification.covered && gate.coverage.lookup(name) === null) {
        throw coverageRefusal(name, classification.category);
      }
      if (typeof definition.operation !== "function") {
        throw new AffiantError(
          "wireup-invalid",
          `CV-1: write-capable tool ${JSON.stringify(name)} declares no \`operation\`. A write ` +
            `tool must say how its arguments become the write being proposed, because nothing ` +
            `else can know which entity a call is about. Refused here rather than on the ` +
            `first call.`,
          { toolName: name },
        );
      }
      tools[name] = gatedTool(gate, definition, inputSchema, onResult);
      continue;
    }

    if (!classification.covered) {
      tools[name] = declaredTool(definition, inputSchema);
      continue;
    }
    tools[name] = gatedTool(gate, definition, inputSchema, onResult);
  }

  return tools as AffiantToolSet;
}

/** The model-facing schema for one definition: the host's, checked, or the derived one (AF-1). */
function modelSchemaOf(definition: AffiantToolDefinition): JsonSchemaObject {
  const schema: FieldSchema = definition.inputSchema;
  const supplied = definition.modelInputSchema;
  if (supplied === undefined) return inputSchemaOf(schema);
  assertMatchesFields(supplied, schema, definition.name);
  return supplied;
}

/** A tool the adapter puts the gate in front of. */
function gatedTool(
  gate: Gate,
  definition: AffiantToolDefinition<any, any>,
  inputSchema: JsonSchemaObject,
  onResult: AffiantToolsOptions["onResult"],
): ToolSet[string] {
  const name = definition.name;
  return tool({
    description: definition.description,
    inputSchema: jsonSchema<unknown>(inputSchema as Parameters<typeof jsonSchema>[0]),
    contextSchema: TURN_CONTEXT_FLEX_SCHEMA,
    async execute(input: unknown, { context }): Promise<GatedToolResult<unknown>> {
      // The context is this call's, validated, and used once. Not stored, not
      // defaulted, not read from anywhere else (GT-2).
      const turn = requireContext(context, name).turn;
      // The only function called from this closure. For a write-capable definition
      // the gate's write path never reaches `definition.execute` (GT-6); for a read
      // it calls it with this same context as its second argument.
      const result = await gate.wrap(definition, turn).execute(input);
      if (onResult !== undefined) await onResult(result, turn);
      return result;
    },
    toModelOutput({ output }) {
      return { type: "json", value: modelSummary(output as GatedToolResult<unknown>) };
    },
  });
}

/**
 * A tool the adapter declares to the model and executes nobody's code for: a read
 * with no `execute`, or one the provider or the client runs.
 *
 * It carries no `contextSchema` and no `execute`, which is also what ends an agent
 * loop when the model calls it — the SDK stops when a tool has no `execute`, and the
 * host decides what to do with the call.
 */
function declaredTool(
  definition: AffiantToolDefinition,
  inputSchema: JsonSchemaObject,
): ToolSet[string] {
  return tool({
    description: definition.description,
    inputSchema: jsonSchema<unknown>(inputSchema as Parameters<typeof jsonSchema>[0]),
    outputSchema: jsonSchema<unknown>({}),
  });
}

// ---------------------------------------------------------------------------
// The per-call context map
// ---------------------------------------------------------------------------

/**
 * The `toolsContext` map for one turn: `{ turn: ctx }` under the name of every tool
 * in `tools` this adapter gated.
 *
 * Built per turn and passed on the generation call. A tool a host added to the same
 * `ToolSet` itself is left out, so a host's own context for its own tools is not
 * overwritten by this one.
 */
export function affiantToolsContext(
  ctx: TurnContext,
  tools: ToolSet,
): Record<string, AffiantToolContext> {
  const map: Record<string, AffiantToolContext> = {};
  for (const [name, entry] of Object.entries(tools)) {
    if (
      (entry as { readonly contextSchema?: unknown }).contextSchema === TURN_CONTEXT_FLEX_SCHEMA
    ) {
      map[name] = { turn: ctx };
    }
  }
  return map;
}
