/**
 * The interception seam: what a host wraps a tool with, and what the model gets back.
 *
 * **Rules served: GT-6** (a write tool can only produce a proposal — the gate never
 * calls its `execute`), **CV-4** (a write-capable tool in an uncovered category is
 * refused here, at wire-up, unless the host declared it), **CV-1** (the refusal is at
 * wire-up and there is no option that turns the gate off), **GT-2** (the turn context
 * is a parameter of `wrap` and of every `execute` call path; nothing is ambient),
 * **AF-5** (a tool call returns one of three things: a proposal, a read result, or an
 * error).
 *
 * ## Why the write path never calls `execute`
 *
 * The gated `execute` for a write-capable tool does not hold a reference to the
 * original function at all: it builds the {@link Operation} from
 * {@link ToolDefinition.operation}, runs the pipeline, and returns the entry and its
 * card. There is no branch in which the host's write runs, no option that restores
 * it, and nothing for a mistake to fall through to. That is GT-6 made structural
 * rather than documentary — a spy on the original `execute` records nothing, and a
 * fixture can prove it.
 *
 * What this cannot cover is a tool that opens its own connection and writes inside
 * its body: no wire-up check can see that, and GT-6 states the limit rather than
 * pretending to enforce it.
 *
 * ## Why the context is bound at `wrap`
 *
 * `wrap(tool, ctx)` returns a gated tool for *that turn*. The context is a parameter,
 * captured in this closure, and two turns wrapping the same tool definition get two
 * independent gated tools that share nothing (GT-2). A read tool's own `execute` is
 * then called with the same context as its second argument, so the explicitness
 * survives to the bottom of the call path rather than stopping at the seam.
 *
 * @packageDocumentation
 */

import type { TurnContext } from "../context.js";
import type { DocketStatus } from "../docket/entry.js";
import type { ErrorCode } from "../errors.js";
import { AffiantError, isAffiantError } from "../errors.js";
import type { JsonValue } from "../model/affidavit.js";

import type { ToolDefinition } from "./coverage.js";
import { assessCoverage } from "./coverage.js";
import type { EvidenceCardRequest, PipelineDeps } from "./pipeline.js";
import { runPipeline } from "./pipeline.js";

// ---------------------------------------------------------------------------
// What a gated call returns
// ---------------------------------------------------------------------------

/**
 * The three things a gated tool call can produce (AF-5).
 *
 * A `"write"` is a **proposal**, never a completed write: an entry id, the status the
 * row reads at, and the card a person is shown. A model reading this result learns
 * that the write is pending or that a Standing Order approved it — never that it
 * happened, because the gate does not execute (AZ-7).
 *
 * An `"error"` carries the refusal in a form a model can act on: a substance refusal
 * (GT-3) says the proposal swore to nothing, and a coverage refusal (CV-4) says the
 * tool is not one the gate can stand in front of.
 */
export type GatedToolResult<TResult> =
  | {
      /** A write proposal was filed. */
      readonly kind: "write";
      /** The Docket entry the proposal was filed under. */
      readonly entryId: string;
      /** What the row reads at — `"pending"` unless a Standing Order fired (AZ-1). */
      readonly status: DocketStatus;
      /** The Evidence Card the host delivers to a reviewer. */
      readonly card: EvidenceCardRequest;
    }
  | {
      /** A read tool ran and returned its own result. */
      readonly kind: "read";
      /** Whatever the tool returned, untouched. */
      readonly result: TResult;
    }
  | {
      /** The call did not produce a proposal or a result. */
      readonly kind: "error";
      /** The refusal's code, or `"tool-error"` when a read tool's own body threw. */
      readonly code: ErrorCode | "tool-error";
      /** What went wrong, in one line. */
      readonly message: string;
    };

/** A tool with the gate in front of it, bound to one turn (GT-2). */
export interface GatedTool<TArgs, TResult> {
  /** The wrapped tool's name, unchanged — a model sees the same tool it always did. */
  readonly name: string;
  /** The wrapped tool's description, unchanged. */
  readonly description: string;
  /** Whether a call to this tool would write. */
  readonly writeCapable: boolean;
  /**
   * Call the tool. A write-capable tool produces a proposal and **never** runs the
   * host's `execute` (GT-6); a read tool passes straight through to its own.
   */
  execute(args: TArgs): Promise<GatedToolResult<TResult>>;
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

/**
 * Put the gate in front of `tool` for the turn `ctx` describes.
 *
 * Wire-up refuses three things, all before a single call is made (CV-1):
 *
 * - a **write-capable** tool the gate cannot intercept and the host has not declared
 *   uncovered — `AffiantError("coverage-refused")`, naming the category (CV-4);
 * - a write-capable tool with no {@link ToolDefinition.operation}, because nothing
 *   else in this package can know what its arguments propose;
 * - a read tool with no `execute`, which is a tool that cannot be called at all.
 *
 * A write tool the host *has* declared uncovered is wrapped and returns proposals like
 * any other; the pipeline files each one `blocked` (CV-4). The declaration converts a
 * start-up refusal into a Docket record — it never turns the gate off.
 *
 * @throws AffiantError `"coverage-refused"` or `"wireup-invalid"`.
 */
export function wrapTool<TArgs, TResult>(
  tool: ToolDefinition<TArgs, TResult>,
  ctx: TurnContext,
  deps: PipelineDeps,
): GatedTool<TArgs, TResult> {
  // Captured once, per wrap. Read from nowhere else, ever (GT-2).
  const turn = ctx;

  if (!tool.writeCapable) {
    const run = tool.execute;
    if (typeof run !== "function") {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: read tool ${JSON.stringify(tool.name)} declares no \`execute\`; there is ` +
          `nothing to call.`,
        { toolName: tool.name },
      );
    }
    return {
      name: tool.name,
      description: tool.description,
      writeCapable: false,
      async execute(args: TArgs): Promise<GatedToolResult<TResult>> {
        // The only place a host's own function is called, and it is called with the
        // same explicit context the seam was given (GT-2).
        try {
          return { kind: "read", result: await run(args, turn) };
        } catch (error) {
          return { kind: "error", code: codeOf(error), message: messageOf(error) };
        }
      },
    };
  }

  const assessment = assessCoverage(tool);
  if (!assessment.covered && deps.coverage.lookup(tool.name) === null) {
    deps.telemetry.emit({
      key: "coverage.refused",
      at: deps.clock.now(),
      attributes: {
        "gen_ai.tool.name": tool.name,
        "coverage.category": assessment.category,
        phase: "wire-up",
      },
    });
    throw new AffiantError(
      "coverage-refused",
      `CV-4: write-capable tool ${JSON.stringify(tool.name)} is in an uncovered category ` +
        `(${assessment.category}) — there is nothing for the gate to intercept, so a write ` +
        `through it would not be filed. Either make it interceptable, or call ` +
        `gate.declareUncovered(tool, ${JSON.stringify(assessment.category)}) so every ` +
        `proposal from it is filed blocked on the Docket. There is no option that turns the ` +
        `gate off for a tool it covers (CV-1).`,
      { toolName: tool.name, category: assessment.category },
    );
  }

  const toOperation = tool.operation;
  if (typeof toOperation !== "function") {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: write-capable tool ${JSON.stringify(tool.name)} declares no \`operation\`; a ` +
        `write tool must say how its arguments become the write being proposed, because ` +
        `nothing else can know which entity a call is about.`,
      { toolName: tool.name },
    );
  }

  const operationLabel = tool.operationLabel ?? null;

  return {
    name: tool.name,
    description: tool.description,
    writeCapable: true,

    // GT-6: the host's own `execute` is not captured on this path and is not
    // reachable from the closure below. There is no branch that runs the write.
    async execute(args: TArgs): Promise<GatedToolResult<TResult>> {
      try {
        const filed = await runPipeline(
          {
            operation: toOperation(args),
            toolName: tool.name,
            schema: tool.inputSchema,
            // A model's tool arguments are JSON — that is what a tool call is on
            // every transport this gate sits behind. `TArgs` is the tool author's
            // own type and `wrap` does not constrain it (an interface would not
            // satisfy `JsonValue`'s index signature, and refusing those tools would
            // buy nothing), so the value is admitted here. `deriveEntryId` still
            // raises a TypeError naming the offending path if a host hands the gate
            // something with no canonical form.
            args: args as JsonValue,
            preparedFields: null,
            operationLabel,
            supersedes: null,
            priorAmendments: null,
          },
          turn,
          deps,
        );
        return {
          kind: "write",
          entryId: filed.entry.entryId,
          status: filed.entry.status,
          card: filed.card,
        };
      } catch (error) {
        // A refusal is an answer: the model is told the proposal swore to nothing, or
        // that the tool is uncovered, and can say so. A `RangeError` from a port
        // contract violation is *not* an answer — it is a host bug, and swallowing it
        // into a tool result would hide it from the host and leave the model guessing.
        if (isAffiantError(error)) {
          return { kind: "error", code: error.code, message: error.message };
        }
        throw error;
      }
    },
  };
}

/** The code to report for a throw from a read tool's own body. */
function codeOf(error: unknown): ErrorCode | "tool-error" {
  return isAffiantError(error) ? error.code : "tool-error";
}

/** The message to report for a throw, without assuming it was an `Error`. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
