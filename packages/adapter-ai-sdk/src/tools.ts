/**
 * The seam: Affiant tool definitions become an AI SDK `ToolSet` whose every
 * `execute` runs through the gate with an explicit turn context.
 *
 * **Rules served: GT-2** (the context is supplied per call through the SDK's own
 * channel and a call without one is refused, never defaulted), **CV-2** (this is a
 * call site: it calls the gate directly and throws when it cannot), **GT-6** (a
 * write-capable definition's own `execute` is never called), **CV-4** and **CV-1**
 * (a write-capable tool the adapter cannot
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
    Pick<Tool<any, any, any>, "execute" | "onInputAvailable" | "onInputStart" | "onInputDelta"> & {
      /**
       * Never set on an adapter-built tool, and not settable on one.
       *
       * The SDK's approval flow returns an approval request to the client and
       * reconstructs the answer from the message history the client sends back.
       * AZ-5 puts approval authority on the Docket row and nowhere else, so a tool
       * this package built must not carry a second place for it to appear to live.
       * The built objects are frozen as well, so this holds at run time and not only
       * in a type-checked build (CV-1: no option turns the gate off).
       */
      readonly needsApproval?: never;
    }
>;

/**
 * Why a write-capable definition could not be gated, when it could not (CV-4), plus
 * the one category this version of the adapter adds.
 */
export type AdapterUncoveredCategory = UncoveredCategory | "dynamic";

// ---------------------------------------------------------------------------
// The context schema
// ---------------------------------------------------------------------------

/** Whether `value` is a non-empty string — an identifier the record can carry. */
function named(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether `value` is a principal this seam will pass to the gate, or `null`.
 *
 * `null` is "no identity resolved", and a decision made under it is refused on identity
 * grounds (AZ-2). Anything else has to be one of the two kinds the core defines —
 * `"member"` or `"service"` — carrying an id: `{}`, `[]` and a `Date` are none of them,
 * and admitting one puts a principal on the record that no attestation rule can read
 * (AZ-3).
 *
 * **Stricter than the core's type, deliberately.** `Principal` types `id`,
 * `assertedMember`, `relay.channelIdentity` and `relay.messageId` as `string`, which
 * admits `""`. This seam requires each of them to be **non-empty** where it is present,
 * for the same reason the turn's own identifiers must be: a blank id is not an
 * identity, and it travels onto an attestation record (AZ-1) where a reader can no
 * longer tell it from an absent one. So a host that would have been admitted by the
 * type is refused here, at wire-up, rather than at the point somebody reads the record.
 * Both of `relay`'s fields are checked where a `relay` is present, and
 * `assertedMember` where it is present.
 */
function isPrincipal(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const principal = value as { readonly kind?: unknown; readonly id?: unknown };
  if (!named(principal.id)) return false;
  if (principal.kind === "member") return true;
  if (principal.kind !== "service") return false;
  const service = value as {
    readonly relay?: unknown;
    readonly assertedMember?: unknown;
  };
  if (service.assertedMember !== undefined && !named(service.assertedMember)) return false;
  if (service.relay === undefined) return true;
  if (typeof service.relay !== "object" || service.relay === null) return false;
  const relay = service.relay as {
    readonly channelIdentity?: unknown;
    readonly messageId?: unknown;
  };
  return named(relay.channelIdentity) && named(relay.messageId);
}

/**
 * Whether `value` is an {@link AffiantToolContext} the gate can be called with.
 *
 * Every property of the turn context is checked here, at the seam, before the gate is
 * touched (GT-2, CV-2). The five identifiers must be **non-empty**: a blank tenant is
 * not a tenant, and a context carrying one would either partition the Docket under the
 * empty string or reach the core's own range checks as a `RangeError` a host reads as
 * a crash rather than as a refusal (AZ-2). `principal` must be **present**, and is
 * either `null` — the host saying "no identity resolved", a different statement from a
 * context that forgot to mention one — or one of the two kinds the core defines, in the
 * shape it defines them ({@link isPrincipal}).
 *
 * `turn.utterance` may be empty: an empty message is a thing a person can send, and
 * what the gate does with a proposal that swears to nothing is GT-3's business.
 */
function isToolContext(value: unknown): value is AffiantToolContext {
  if (typeof value !== "object" || value === null) return false;
  const turn = (value as { readonly turn?: unknown }).turn;
  if (typeof turn !== "object" || turn === null) return false;
  const ctx = turn as Partial<TurnContext>;
  if (!("principal" in ctx) || !isPrincipal(ctx.principal)) return false;
  return (
    named(ctx.conversationId) &&
    named(ctx.tenantId) &&
    named(ctx.channel) &&
    typeof ctx.turn === "object" &&
    ctx.turn !== null &&
    typeof ctx.turn.utterance === "string" &&
    named(ctx.turn.messageId) &&
    named(ctx.turn.at)
  );
}

/**
 * The `contextSchema` every gated tool declares.
 *
 * One value for the module: it is the schema itself, not state. Nothing recognises a
 * gated tool by this object's identity — see {@link GATE_OF}, which survives a
 * structural copy and a second copy of this package.
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
 * Whether the adapter can intercept a **write-capable** `definition`, and if not,
 * which category it falls in (CV-4).
 *
 * Two categories the core cannot see from a `ToolDefinition` alone are added here,
 * because they are facts about the SDK rather than about the tool: a definition the
 * host exposes as a provider tool is provider-executed, and one it exposes as a
 * dynamic tool carries no field schema the model's input can be checked against, so
 * there is nothing to derive an Affidavit's shape from.
 *
 * **Only write-capable definitions are classified.** CV-4 is about writes that would
 * escape the gate; a read has none to escape with. A read definition with an `execute`
 * is wrapped as a read whatever the host says about how it is exposed — classifying it
 * uncovered would drop the host's own function on the floor and declare a tool nobody
 * runs.
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
 *   write path does not call it either (GT-6);
 * - a **read** definition with an `execute` becomes a tool whose own `execute` calls
 *   the gate, which calls the host's function with the same explicit context (GT-2).
 *   This holds however the host exposes it — a read has no write to escape with, so
 *   CV-4's categories do not apply to one;
 * - a **read with no `execute`** — one the client or the provider runs — is declared
 *   to the model and executed by nobody here.
 *
 * Every definition is **snapshotted** as it is read. A host that mutates one
 * afterwards changes nothing about the tool that was built from it.
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
  // The core's own default generics, `<never, unknown>`, which make the bare
  // `ToolDefinition` a supertype of every concrete one — so a host's
  // `ToolDefinition<TicketArgs, string>` and a host's `readonly ToolDefinition[]`
  // variable both go in without a cast. Widening these to `any` would make the
  // second fail under `strictFunctionTypes`, because `any` is not assignable to the
  // `never` that `execute`'s first parameter reads as.
  definitions: readonly AffiantToolDefinition[],
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
    // The definition as it reads *now*. Everything below — the coverage check, the
    // `operation` check, and the gated closure — reads this copy, so a definition a
    // host mutates after wire-up (a `writeCapable` that flips, an `execute` swapped
    // in) cannot turn a checked tool into an unchecked one behind the ToolSet's back
    // (CV-1: there is no option that turns the gate off, and a mutation is not an
    // option either). The copy is the whole mechanism; freezing it would guard a
    // value nothing else reads.
    const snapshot: AffiantToolDefinition = { ...definition };

    if (snapshot.writeCapable) {
      const classification = classify(snapshot);
      if (!classification.covered) {
        // A declaration converts a wire-up refusal into a Docket record for the three
        // categories the rulebook names (CV-4). `"dynamic"` is not one of them: it is
        // this adapter's own limit, and what is missing is the field schema an
        // Affidavit is sworn over — so there is nothing a declaration could record,
        // and no declaration lifts it.
        if (classification.category === "dynamic" || gate.coverage.lookup(name) === null) {
          throw coverageRefusal(name, classification.category);
        }
      }
      if (typeof snapshot.operation !== "function") {
        throw new AffiantError(
          "wireup-invalid",
          `CV-1: write-capable tool ${JSON.stringify(name)} declares no \`operation\`. A write ` +
            `tool must say how its arguments become the write being proposed, because nothing ` +
            `else can know which entity a call is about. Refused here rather than on the ` +
            `first call.`,
          { toolName: name },
        );
      }
      tools[name] = gatedTool(gate, snapshot, inputSchema, onResult);
      continue;
    }

    // A read. The only question is whether there is a function to call: a read the
    // client or the provider runs is declared to the model and executed by nobody
    // here, and everything else goes through the gate so the host's own function is
    // reached with this call's explicit context (GT-2).
    tools[name] =
      typeof snapshot.execute === "function"
        ? gatedTool(gate, snapshot, inputSchema, onResult)
        : declaredTool(snapshot, inputSchema);
  }

  // The set itself is frozen too, so a host that means to add a tool has to build a
  // new object — and the one it builds is the one `affiantToolsContext` inspects. It
  // is registered so a refusal can say whether the set it was handed came from here.
  const built = Object.freeze(tools);
  BUILT_SETS.add(built);
  return built as AffiantToolSet;
}

/** The model-facing schema for one definition: the host's, checked, or the derived one (AF-1). */
function modelSchemaOf(definition: AffiantToolDefinition): JsonSchemaObject {
  const schema: FieldSchema = definition.inputSchema;
  const supplied = definition.modelInputSchema;
  if (supplied === undefined) return inputSchemaOf(schema);
  assertMatchesFields(supplied, schema, definition.name);
  return supplied;
}

/** The abort a discarded generation deserves, in the shape the SDK recognises. */
function abortError(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  // `name === "AbortError"` is what the SDK's own `isAbortError` looks for.
  return new DOMException("The generation was aborted before the tool ran.", "AbortError");
}

/** A tool the adapter puts the gate in front of. */
function gatedTool(
  gate: Gate,
  definition: AffiantToolDefinition,
  inputSchema: JsonSchemaObject,
  onResult: AffiantToolsOptions["onResult"],
): ToolSet[string] {
  const name = definition.name;
  // The definition the gate is handed. `wrap` is generic over the tool's own argument
  // type, and what arrives here is the model's input — `unknown` at this seam,
  // whatever the host's own signature says.
  const forGate = definition as unknown as ToolDefinition<unknown, unknown>;
  const built = tool({
    description: definition.description,
    inputSchema: jsonSchema<unknown>(inputSchema as Parameters<typeof jsonSchema>[0]),
    contextSchema: TURN_CONTEXT_FLEX_SCHEMA,
    async execute(input: unknown, { context, abortSignal }): Promise<GatedToolResult<unknown>> {
      // The context is this call's, validated, and used once. Not stored, not
      // defaulted, not read from anywhere else (GT-2).
      const turn = requireContext(context, name).turn;
      // An abandoned generation should not leave a row on somebody's Docket for a
      // person to decide on. A filing already under way still completes — the gate
      // takes no signal — but one that has not started does not begin (AZ-7).
      if (abortSignal?.aborted === true) throw abortError(abortSignal);
      // The only function called from this closure. For a write-capable definition
      // the gate's write path never calls `definition.execute` (GT-6); for a read it
      // calls it with this same context as its second argument.
      const result = await gate.wrap(forGate, turn).execute(input);
      if (onResult !== undefined) await onResult(result, turn);
      return result;
    },
    toModelOutput({ output }) {
      return { type: "json", value: modelSummary(output as GatedToolResult<unknown>) };
    },
  });
  return markGated(built, gate);
}

/**
 * A tool the adapter declares to the model and executes nobody's code for: a read
 * with no `execute`.
 *
 * It carries no `contextSchema` and no `execute`, which is also what ends an agent
 * loop when the model calls it — the SDK stops when a tool has no `execute`, and the
 * host decides what to do with the call.
 */
function declaredTool(
  definition: AffiantToolDefinition,
  inputSchema: JsonSchemaObject,
): ToolSet[string] {
  return Object.freeze(
    tool({
      description: definition.description,
      inputSchema: jsonSchema<unknown>(inputSchema as Parameters<typeof jsonSchema>[0]),
      outputSchema: jsonSchema<unknown>({}),
    }),
  );
}

// ---------------------------------------------------------------------------
// The per-call context map
// ---------------------------------------------------------------------------

/**
 * The key an adapter-built tool records its gate under.
 *
 * A **registered** symbol (`Symbol.for`), so that a second copy of this package in the
 * same dependency tree reads the same key and can say *what* it is looking at. It is
 * the **diagnostic**, not the credential: it is an ordinary enumerable property, so any
 * copy of a gated tool carries it, and a mark a copy can carry is a mark a copy can
 * forge. What decides whether an object is a gated tool is {@link BUILT_TOOLS}.
 *
 * The value is the {@link Gate} the tool was built for, which is what lets
 * {@link affiantToolsContext} refuse a set holding two gates' tools.
 */
const GATE_OF = Symbol.for("affiant.adapter-ai-sdk.gate");

/**
 * The tool objects this module built — the credential the mark only points at.
 *
 * Membership cannot be spread, copied, assigned or forged: an object is in here if and
 * only if {@link gatedTool} returned it, which is the only way an object has the gate
 * in front of its `execute`. A frozen copy carrying its own `execute` and no
 * `needsApproval` satisfies every property a gated tool has *except* being one, and
 * identity is the only thing that tells them apart (GT-6, AZ-5).
 *
 * A `WeakSet` because it holds no tool alive: a host that discards a tool set discards
 * the tools with it.
 *
 * **This copy's, not the package's.** Two copies of this package hold two of these, so
 * neither recognises the other's tools — and refuses them by name rather than skipping
 * them. That is the honest answer: this copy can vouch for what it built and for
 * nothing else.
 */
const BUILT_TOOLS = new WeakSet<object>();

/** The tool sets this module returned, so a refusal can say where the set came from. */
const BUILT_SETS = new WeakSet<object>();

/** Record the gate `built` was made for, register it, and freeze it. */
function markGated(built: ToolSet[string], gate: Gate): ToolSet[string] {
  const marked = Object.freeze(Object.assign(built, { [GATE_OF]: gate }));
  BUILT_TOOLS.add(marked);
  return marked;
}

/** The gate a tool claims to have been built for, or `null` when it claims none. */
function gateOf(entry: unknown): Gate | null {
  if (typeof entry !== "object" || entry === null) return null;
  const gate = (entry as { readonly [GATE_OF]?: unknown })[GATE_OF];
  return gate === undefined || gate === null ? null : (gate as Gate);
}

/**
 * The `toolsContext` map for one turn: `{ turn: ctx }` under the name of every tool
 * in `tools` this adapter gated.
 *
 * Built per turn and passed on the generation call. A tool this package did not build
 * carries no mark and is left alone, so a host's own context for its own tools is not
 * overwritten by this one. A tool the host added that *writes* without going through
 * {@link affiantTools} is outside the guarantee: it carries no mark either, and
 * nothing here saw it to refuse it.
 *
 * What is **not** left alone is an object that carries the mark and is not one this
 * copy of the package built. Naming it would hand a turn's context to something with
 * the gate's name on it and none of the gate in front of it. Two shapes of that:
 * `{ ...tool, needsApproval: true }`, where the SDK would ask the client for approval
 * and reconstruct the answer from the message history it sends back (the path AZ-5
 * closes); and `{ ...tool, execute: mine }`, a frozen copy carrying its own function,
 * which nothing but identity can tell from the real one (GT-6). Both are refused, with
 * the message that says which.
 *
 * A tool built by a **second copy** of this package is refused the same way. Two copies
 * hold two registers, and neither can vouch for the other's objects — so it says so,
 * by name, rather than quietly leaving the tool out of the map and letting the call
 * fail later for a reason that reads like a host's mistake.
 *
 * @throws AffiantError `"wireup-invalid"` when a marked tool carries `needsApproval`
 *         (AZ-5) or is not an object this copy built (CV-1, GT-6), or when `tools`
 *         holds gated tools built for **more than one gate** — one map carries one turn
 *         context, and a turn belongs to one tenant, so handing it to two gates' tools
 *         would run a call under a wiring its context was never meant for (GT-2, CV-1).
 */
export function affiantToolsContext(
  ctx: TurnContext,
  tools: ToolSet,
): Record<string, AffiantToolContext> {
  const map: Record<string, AffiantToolContext> = {};
  const ourSet = BUILT_SETS.has(tools);
  let seen: Gate | null = null;
  for (const [name, entry] of Object.entries(tools)) {
    const gate = gateOf(entry);
    if (gate === null) continue;
    if (Object.prototype.hasOwnProperty.call(entry, "needsApproval")) {
      throw new AffiantError(
        "wireup-invalid",
        `AZ-5: tool ${JSON.stringify(name)} carries this package's mark and a ` +
          `\`needsApproval\` setting. The SDK's approval flow returns an approval request to ` +
          `the client and reads the answer back out of the message history the client sends ` +
          `— approval authority is the Docket row and nothing else stands in for it. A gated ` +
          `tool never sets it, so this object is a copy of one, and it is refused rather ` +
          `than given a turn's context.`,
        { toolName: name },
      );
    }
    if (!BUILT_TOOLS.has(entry)) {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: tool ${JSON.stringify(name)} carries this package's mark but is not an object ` +
          `this copy of the package built. A copy of a gated tool keeps the mark and can carry ` +
          `its own \`execute\`, so the mark says what an object claims and not what it is; only ` +
          `the object built by \`affiantTools\` has the gate in front of it (GT-6). ` +
          (ourSet
            ? `This set came from \`affiantTools\`, so something replaced the entry in it. `
            : `Pass the set \`affiantTools\` returned — spread it into a new object if you are ` +
              `adding tools of your own, keeping the gated entries as they are. If the tool ` +
              `came from a second copy of this package, build its context map with that copy's ` +
              `\`affiantToolsContext\`. `) +
          `It is refused rather than given a turn's context.`,
        { toolName: name },
      );
    }
    if (seen !== null && seen !== gate) {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: the tool set holds tools built for two different gates, and one turn context ` +
          `cannot stand for both — a turn belongs to one tenant and one wiring (GT-2). Build ` +
          `one context map per gate's tool set, and pass the set that matches the gate this ` +
          `turn is running against. ${JSON.stringify(name)} is the first tool from the second ` +
          `gate.`,
        { toolName: name },
      );
    }
    seen = gate;
    map[name] = { turn: ctx };
  }
  return map;
}
