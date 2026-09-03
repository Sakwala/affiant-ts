/**
 * `createGate` — the object a host builds once, and the wire-up checks it refuses at.
 *
 * **Rules served: CV-1** (a misconfiguration the framework can detect fails at
 * wire-up with a stated error; no option turns the gate off), **GT-2** (every entry
 * point takes the turn context as a parameter), **GT-5** (a policy that can declare a
 * risk threshold needs a host-supplied scorer, and its absence is caught here rather
 * than on the unlucky request that first reaches the threshold branch), **GT-4**
 * (`defaultTtlMs` is required, per ledger BD-31: `expiresAt` is not nullable and every
 * filed entry carries a deadline), **CV-4** (`declareUncovered`), **DK-3** (`expireDue`
 * is host-scheduled — this package owns no timer).
 *
 * ## What this gate does *not* have yet
 *
 * `decide`, `resubmit` and `markExecuted` are not on {@link Gate}. They arrive with
 * the decision path (pull request C6), where the authorization rules they exist to
 * enforce — AZ-2's fail-closed check, AZ-3's attestation kinds, DK-1's guarded
 * compare-and-set — arrive with them. A stub that threw would be a worse answer than
 * a missing method: the type would promise a decision path, and a host could write
 * against it and find out at runtime.
 *
 * ## Two ways in
 *
 * {@link Gate.wrap} is Sequence A: a chat turn, a tool the model calls, the pipeline
 * from the top. {@link Gate.file} is Sequence C: a capture that arrived over a trusted
 * relay's MCP surface with its provenance already settled, entering at the projection
 * step. They are the same pipeline; the second skips the two steps that have nothing
 * to do.
 *
 * @packageDocumentation
 */

import type { TurnContext } from "../context.js";
import type { DocketEntry } from "../docket/entry.js";
import type { DocketStore, Scope, SessionStore } from "../docket/store.js";
import { AffiantError } from "../errors.js";
import type {
  Clock,
  FieldInterceptor,
  FieldSchema,
  InferencePort,
  Operation,
  ProjectionPort,
  RiskScorer,
  TelemetryPort,
} from "../ports.js";
import { defaultClock } from "../ports.js";
import type { AuthorizationPort } from "../ports.js";
import { noopTelemetry } from "../telemetry.js";

import type { CoverageRegistry, ToolDefinition, UncoveredCategory } from "./coverage.js";
import { createCoverageRegistry, declareUncovered } from "./coverage.js";
import type { FiledEntry, PipelineDeps, PreparedField } from "./pipeline.js";
import { runPipeline } from "./pipeline.js";
import type { ApprovalPolicy } from "./policy.js";
import type { GatedTool } from "./wrap.js";
import { wrapTool } from "./wrap.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Everything a host supplies. The four ports and the deadline are required; the rest
 * have defaults that are the safe reading of "the host said nothing".
 *
 * `policies` defaults to none, which files everything `ReviewerConfirmation` — a
 * person confirms every write. `interceptors` defaults to none. `telemetry` defaults
 * to a port that drops events. `clock` defaults to the system clock, which is the one
 * dependency a fixture always replaces.
 */
export interface GateOptions {
  /** The Docket (DK-1). */
  readonly store: DocketStore;
  /** The rehydration surface, if the host has one (DK-5). Not used by the pipeline. */
  readonly sessions?: SessionStore;
  /** The host's structured inference (GT-1 step 3). */
  readonly inference: InferencePort;
  /** The host's previous-value lookup (AF-3). */
  readonly projection: ProjectionPort;
  /** Who may decide an entry (AZ-2). Required at wire-up even though C6 lands the decision path. */
  readonly authorization: AuthorizationPort;
  /** The approval chain, in order (AZ-4). */
  readonly policies?: readonly ApprovalPolicy[];
  /** The host's risk function (GT-5). Required if any policy declares a threshold. */
  readonly riskScorer?: RiskScorer;
  /** Deterministic resolvers (PV-2). */
  readonly interceptors?: readonly FieldInterceptor[];
  /** Where every instant on the record comes from. */
  readonly clock?: Clock;
  /** Where the TL-1 events go. */
  readonly telemetry?: TelemetryPort;
  /**
   * The deadline applied when neither the verdict nor the policy names one (GT-4).
   * **Required** (ledger BD-31): `expiresAt` is not nullable, so every filed entry
   * carries a deadline and there is no wiring in which one is missing.
   */
  readonly defaultTtlMs: number;
}

/**
 * A capture the host has already assembled — Sequence C's way in.
 *
 * Supply `fields` when the provenance is settled (a relay's capture, a form
 * submission, a replay): the pipeline skips the interceptors and the inference and
 * starts at projection. Supply `schema` instead to run the whole pipeline against the
 * turn without a {@link ToolDefinition}. Supplying neither is a wire-up error — there
 * would be nothing to swear to and no way to find out.
 */
export interface WriteProposal {
  /** The write being proposed. */
  readonly operation: Operation;
  /** The tool or capture source's name — the key a coverage declaration matches (CV-4). */
  readonly toolName: string;
  /** Host-tagged fields. Present ⇒ interceptors and inference are skipped. */
  readonly fields?: readonly PreparedField[];
  /** The field schema, for a proposal that should run inference. */
  readonly schema?: FieldSchema;
  /** The arguments this capture came from, part of the entry id's derivation. */
  readonly args?: unknown;
  /** The host's own verb for the operation, carried onto the card. */
  readonly operationLabel?: string;
}

/** The gate a host builds once and calls from every seam (CV-2). */
export interface Gate {
  /**
   * Put the gate in front of `tool` for the turn `ctx` describes (GT-2, GT-6, CV-4).
   *
   * @throws AffiantError `"coverage-refused"` or `"wireup-invalid"` at wire-up.
   */
  wrap<TArgs, TResult>(
    tool: ToolDefinition<TArgs, TResult>,
    ctx: TurnContext,
  ): GatedTool<TArgs, TResult>;
  /**
   * File a host-assembled proposal — Sequence C's entry point.
   *
   * @throws AffiantError `"substance-refused"` when the capture swears to nothing
   *         (GT-3), or `"wireup-invalid"` when the proposal carries neither prepared
   *         fields nor a schema.
   */
  file(proposal: WriteProposal, ctx: TurnContext): Promise<FiledEntry>;
  /**
   * Record that the gate cannot intercept `tool`, so every later proposal from it is
   * filed `blocked` rather than refused at wire-up (CV-4). It never allows the tool.
   */
  declareUncovered(tool: Pick<ToolDefinition, "name">, category: UncoveredCategory): void;
  /** The entry as it reads now, within `ctx`'s tenant, or `null` (DK-1, expiry as state). */
  get(entryId: string, ctx: TurnContext): Promise<DocketEntry | null>;
  /**
   * Expire the pending entries in `scope` that are past their deadline, at most
   * `limit` of them (DK-3). The host schedules this; the core owns no timer.
   */
  expireDue(
    now: string,
    scope: Scope,
    limit: number,
  ): Promise<{ readonly expired: readonly string[]; readonly more: boolean }>;
  /** The uncovered declarations this gate holds (CV-4). */
  readonly coverage: CoverageRegistry;
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

/**
 * Build the gate, refusing a wiring it can tell is wrong (CV-1).
 *
 * Every refusal names the missing piece, because a wire-up error a host has to bisect
 * is a wire-up error a host works around. The checks:
 *
 * - the four ports — `store`, `inference`, `projection`, `authorization` — are present;
 * - `defaultTtlMs` is a positive, finite integer of milliseconds (GT-4, BD-31);
 * - every policy that says {@link ApprovalPolicy.declaresThreshold} has a
 *   `riskScorer` to compare against (GT-5). This is checked from the **static**
 *   declaration, before any evaluation, because a check that only fires when a policy
 *   happens to return a threshold is exactly the "silent non-fire" GT-5 forbids.
 *
 * @throws AffiantError `"wireup-invalid"`, naming what is missing.
 */
export function createGate(options: GateOptions): Gate {
  requirePort(options.store, "store", "the Docket every entry is filed in (DK-1)");
  requirePort(options.inference, "inference", "the host's structured inference (GT-1 step 3)");
  requirePort(options.projection, "projection", "the host's previous-value lookup (AF-3)");
  requirePort(options.authorization, "authorization", "who may decide an entry (AZ-2)");

  const defaultTtlMs = options.defaultTtlMs;
  if (!Number.isInteger(defaultTtlMs) || defaultTtlMs <= 0) {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: GateOptions.defaultTtlMs must be a positive whole number of milliseconds; ` +
        `received ${JSON.stringify(defaultTtlMs)}. Every filed entry carries a deadline (GT-4), ` +
        `so there is no wiring in which this is absent.`,
      { option: "defaultTtlMs" },
    );
  }

  const policies = options.policies ?? [];
  if (options.riskScorer === undefined) {
    const needsScorer = policies.filter((policy) => policy.declaresThreshold === true);
    if (needsScorer.length > 0) {
      throw new AffiantError(
        "wireup-invalid",
        `CV-1: policy ${needsScorer.map((policy) => JSON.stringify(policy.id)).join(", ")} ` +
          `declares a risk threshold and no GateOptions.riskScorer was supplied. This package ` +
          `ships no scoring formula and no floor (GT-5): the host owns the risk function, and ` +
          `a declared threshold with nothing to compare against is a configuration error, never ` +
          `a silent non-fire.`,
        { option: "riskScorer", policyIds: needsScorer.map((policy) => policy.id) },
      );
    }
  }

  const coverage = createCoverageRegistry();
  const clock = options.clock ?? defaultClock;
  const telemetry = options.telemetry ?? noopTelemetry;
  const store = options.store;

  const deps: PipelineDeps = {
    store,
    inference: options.inference,
    projection: options.projection,
    policies,
    interceptors: options.interceptors ?? [],
    riskScorer: options.riskScorer,
    clock,
    telemetry,
    defaultTtlMs,
    coverage,
  };

  return {
    coverage,

    wrap(tool, ctx) {
      return wrapTool(tool, ctx, deps);
    },

    async file(proposal, ctx) {
      const fields = proposal.fields ?? null;
      const schema = proposal.schema ?? null;
      if (fields === null && schema === null) {
        throw new AffiantError(
          "wireup-invalid",
          `CV-1: a proposal for ${JSON.stringify(proposal.toolName)} carries neither prepared ` +
            `fields nor a field schema. Supply \`fields\` when the capture's provenance is ` +
            `already settled (Sequence C), or \`schema\` to run the inference step against the ` +
            `turn. With neither there is nothing to swear to.`,
          { toolName: proposal.toolName },
        );
      }
      return runPipeline(
        {
          operation: proposal.operation,
          toolName: proposal.toolName,
          schema,
          args: proposal.args ?? null,
          preparedFields: fields,
          operationLabel: proposal.operationLabel ?? null,
        },
        ctx,
        deps,
      );
    },

    declareUncovered(tool, category) {
      declareUncovered(coverage, tool, category);
    },

    async get(entryId, ctx) {
      // Tenant scope, not conversation scope: a reviewer surface reads an entry filed
      // in another conversation of the same tenant, and AZ-2's boundary is the tenant.
      return store.get(entryId, { tenantId: ctx.tenantId });
    },

    async expireDue(now, scope, limit) {
      const result = await store.expireDue(now, scope, limit);
      for (const entryId of result.expired) {
        telemetry.emit({ key: "docket.expired", at: now, attributes: { "entry.id": entryId } });
      }
      return result;
    },
  };
}

/** Refuse a missing port by name, so a host is told what to supply rather than what broke. */
function requirePort(value: unknown, option: string, what: string): void {
  if (value === null || value === undefined) {
    throw new AffiantError(
      "wireup-invalid",
      `CV-1: GateOptions.${option} is required — ${what}. A misconfiguration the gate can ` +
        `detect fails here, at wire-up, and there is no option that turns the gate off.`,
      { option },
    );
  }
}
