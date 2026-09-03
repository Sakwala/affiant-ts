/**
 * Coverage: which tools the gate can actually intercept, and what happens to the
 * ones it cannot.
 *
 * **Rules served: CV-4** (a write-capable tool in an uncovered category is refused at
 * wire-up, or — where wire-up cannot see it — marked `blocked` with code
 * `coverage-refused` on the Docket; it is never silently allowed to write),
 * **CV-1** (the refusal is at wire-up and there is no option that turns the gate off
 * for a tool it covers), **AZ-4** (the blocked marker and its codes).
 *
 * ## The three categories
 *
 * A tool is *uncovered* when there is nothing for the gate to replace:
 *
 * - `"no-execute"` — the tool declares no `execute`. There is no function to stand in
 *   front of; whatever writes, writes somewhere this package cannot see.
 * - `"provider-executed"` — the model provider runs the tool on its own side. The
 *   call never reaches this process.
 * - `"hosted-mcp"` — the tool is a hosted MCP server's, and the write happens
 *   server-side, past the boundary an adapter can bind at.
 *
 * The first one that matches is the category reported; a tool with no `execute` that
 * is *also* provider-executed reads as `"no-execute"`, because that is the fact a
 * host can check without knowing anything about the provider.
 *
 * ## Why a declaration, and why it does not make the tool safe
 *
 * A host that knows it cannot cover a tool may declare it. The declaration does not
 * grant the tool anything: it converts a **wire-up refusal** into a **Docket record**
 * — every proposal from that tool is filed `pending` with `blocked: { code:
 * "coverage-refused", category, toolName }`, which AZ-4 says can never be decided and
 * never executes. So the choice a host makes is not "refuse or allow"; it is "refuse
 * at start-up, or refuse per proposal with the proposal on the record". The second is
 * the more useful of the two when the host wants a person to see what an uncovered
 * tool tried to do.
 *
 * What no declaration can do is cover a tool that opens its own connection and writes
 * inside its body. GT-6 states that boundary as an honest limit rather than a rule an
 * implementation can enforce.
 *
 * @packageDocumentation
 */

import type { TurnContext } from "../context.js";
import type { BlockedMarker } from "../docket/entry.js";
import type { FieldSchema, Operation } from "../ports.js";

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/**
 * A tool as the host declares it, in the shape the gate needs to decide two things:
 * whether it can be intercepted, and how its arguments become a proposal.
 *
 * The type parameters default to `never` and `unknown`, which makes the bare
 * `ToolDefinition` a supertype of every concrete one — so
 * {@link assessCoverage} and {@link declareUncovered} take any tool without a cast.
 *
 * `operation` is what a **write-capable** tool must supply: the function that turns a
 * call's arguments into the {@link Operation} the Affidavit is sworn over. It is the
 * host's declaration of what the tool is about to write, and it is required at
 * wire-up rather than inferred, because nothing else in this package can know that
 * `{ id, status }` is an update of a `Ticket` and not a search over one.
 *
 * `execute` takes the turn context as its second argument. A read tool is called
 * with the same explicit context the gate was given (GT-2); nothing is ambient, at
 * any depth of the call path. A write tool's `execute` is **never called by the
 * gate** (GT-6) — see `wrap.ts`.
 */
export interface ToolDefinition<TArgs = never, TResult = unknown> {
  /** The tool's name, as the model sees it and as a Docket row records it. */
  readonly name: string;
  /** What the tool does, in one line. */
  readonly description: string;
  /** The fields a proposal from this tool can carry, for the inference step. */
  readonly inputSchema: FieldSchema;
  /** The host's implementation. Called for a read tool; never for a write tool (GT-6). */
  readonly execute?: (args: TArgs, ctx: TurnContext) => Promise<TResult> | TResult;
  /** Whether a call to this tool would write. */
  readonly writeCapable: boolean;
  /** Who runs it. `"provider"` means the call never reaches this process. */
  readonly executedBy?: "host" | "provider";
  /** Whether the tool is a hosted MCP server's, writing server-side. */
  readonly hostedMcp?: boolean;
  /** How a call's arguments declare the write being proposed. Required for a write tool. */
  readonly operation?: (args: TArgs) => Operation;
  /** The host's own verb for the operation, e.g. `"WriteUpdate"`, carried onto the card. */
  readonly operationLabel?: string;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

/** Why a tool cannot be intercepted (CV-4). */
export type UncoveredCategory = "no-execute" | "provider-executed" | "hosted-mcp";

/** Every {@link UncoveredCategory}, in the order {@link assessCoverage} checks them. */
export const UNCOVERED_CATEGORIES = [
  "no-execute",
  "provider-executed",
  "hosted-mcp",
] as const satisfies readonly UncoveredCategory[];

/** Whether `value` is one of the categories in {@link UNCOVERED_CATEGORIES}. */
export function isUncoveredCategory(value: unknown): value is UncoveredCategory {
  return typeof value === "string" && (UNCOVERED_CATEGORIES as readonly string[]).includes(value);
}

/** What {@link assessCoverage} found. */
export type CoverageAssessment =
  { readonly covered: true } | { readonly covered: false; readonly category: UncoveredCategory };

/**
 * Whether the gate can intercept `tool`, and if not, which category it falls in.
 *
 * This asks only about **interception**, not about whether the tool matters: a read
 * tool with no `execute` is reported uncovered too, because it is. What turns an
 * uncovered assessment into a refusal is CV-4's other half —
 * {@link ToolDefinition.writeCapable} — and that check lives in `wrap.ts`, where the
 * refusal is raised.
 */
export function assessCoverage(tool: ToolDefinition): CoverageAssessment {
  if (typeof tool.execute !== "function") return { covered: false, category: "no-execute" };
  if (tool.executedBy === "provider") return { covered: false, category: "provider-executed" };
  if (tool.hostedMcp === true) return { covered: false, category: "hosted-mcp" };
  return { covered: true };
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

/** One tool a host has declared it cannot cover. */
export interface UncoveredDeclaration {
  /** The tool's name — the key a later proposal is matched by. */
  readonly toolName: string;
  /** Why it cannot be covered. */
  readonly category: UncoveredCategory;
}

/**
 * The set of uncovered declarations a gate holds.
 *
 * One registry per gate, created by `createGate` and closed over by the pipeline —
 * never a module-level map. Two gates in one process (two tenants' wirings, a test
 * and the thing it tests) share nothing, which is the same reason GT-2 gives for the
 * turn context: state that is reachable without being passed is state two callers
 * can collide in.
 */
export interface CoverageRegistry {
  /**
   * Record that `toolName` cannot be covered.
   *
   * @throws RangeError if the tool was already declared under a different category —
   *         a host contradicting itself about what a tool is, which is a programming
   *         error rather than a refusal.
   */
  declare(toolName: string, category: UncoveredCategory): void;
  /** The category `toolName` was declared under, or `null` if it was not declared. */
  lookup(toolName: string): UncoveredCategory | null;
  /** Every declaration, in the order they were made. */
  declarations(): readonly UncoveredDeclaration[];
}

/** A fresh, empty {@link CoverageRegistry}. */
export function createCoverageRegistry(): CoverageRegistry {
  const declared = new Map<string, UncoveredCategory>();
  return {
    declare(toolName: string, category: UncoveredCategory): void {
      if (toolName.trim() === "") {
        throw new RangeError("CV-4: an uncovered declaration names a tool; the name was blank");
      }
      if (!isUncoveredCategory(category)) {
        throw new RangeError(
          `CV-4: ${JSON.stringify(category)} is not an uncovered category; the three are ` +
            `${UNCOVERED_CATEGORIES.join(", ")}`,
        );
      }
      const existing = declared.get(toolName);
      if (existing !== undefined && existing !== category) {
        throw new RangeError(
          `CV-4: tool ${JSON.stringify(toolName)} is already declared uncovered as ` +
            `${JSON.stringify(existing)}; it cannot also be ${JSON.stringify(category)}`,
        );
      }
      declared.set(toolName, category);
    },
    lookup(toolName: string): UncoveredCategory | null {
      return declared.get(toolName) ?? null;
    },
    declarations(): readonly UncoveredDeclaration[] {
      return [...declared].map(([toolName, category]) => ({ toolName, category }));
    },
  };
}

/**
 * Declare `tool` uncovered in `registry`, so that a later proposal from it is filed
 * `blocked` rather than refused at wire-up (CV-4).
 *
 * The first parameter is the registry rather than the gate: `gate.ts` builds the
 * registry and hands it to both `wrap` and the pipeline, and a function that took the
 * gate would make this module import the module that imports it. `Gate.declareUncovered`
 * is the surface a host calls; this is what it calls.
 */
export function declareUncovered(
  registry: CoverageRegistry,
  tool: Pick<ToolDefinition, "name">,
  category: UncoveredCategory,
): void {
  registry.declare(tool.name, category);
}

/** The AZ-4 marker a proposal from a declared-uncovered tool is filed with (CV-4). */
export function coverageRefusedMarker(
  toolName: string,
  category: UncoveredCategory,
): BlockedMarker {
  return { code: "coverage-refused", category, toolName };
}
