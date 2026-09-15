/**
 * The adapter section: every document the rulebook's `adapter` manifest section
 * lists, put through one Affiant adapter, reported as the same
 * `results.schema.json` entries the conformance section produces.
 *
 * The rulebook's own description of this is `conformance/ADAPTER-RUNNER.md`. Three
 * rules are about an adapter's seam and about nothing else, and none of them could
 * be checked before an adapter existed:
 *
 * - **CV-2**, the fail-closed call site: a seam calls the gate directly with an
 *   explicit turn context and throws when the gate is unreachable. It never falls
 *   back to an ambient default and never hands the model the raw proposal.
 * - **CV-3**, the delegation clause: a framework checkpoint may carry an `entryId`
 *   and nothing else, the Affidavit is never read back out of one, and the Docket
 *   row is the source of truth.
 * - **CV-5** is a statement about documentation and packaging, so it is a lint over
 *   the adapter package rather than a fixture — `conformance/lint/adapter-claims.mjs`
 *   in the rulebook, run in this repository's CI against the adapter's own package.
 *
 * **Who runs this.** A driver runs the section once for every adapter its
 * implementation ships and declares, and an implementation that ships none runs none
 * of it and publishes `adapters: []`. The scoping is at the section level because
 * `DRIVER.md`'s sentence about the conformance section — run every entry, an unrun
 * entry is `error` — has to stay true, and an implementation with no adapter has no
 * seam to bind.
 *
 * **What is framework-specific and what is not.** Everything here is the rulebook's:
 * the gate is built from `given.gate` the same way a conformance fixture's is, the
 * tool definitions are built from `given.step.definitions`, and the expectations are
 * checked against the Docket. The three things only the framework can answer — build
 * a tool set, call one tool of it, and say what the framework was handed back — are
 * an {@link AdapterBinding}, and `./adapters/ai-sdk.js` is the one for
 * `@affiant/adapter-ai-sdk`.
 *
 * **No model, no network.** Every document in the section is scripted: the arguments
 * are the ones a model would have produced and the context is the one a host would
 * have passed. Nothing here asks a provider for anything.
 *
 * @packageDocumentation
 */

import { adapterFixtures, adapterManifest, fixtureSchema } from "@affiant/contract/conformance";
import type { ConformanceFixtureDocument } from "@affiant/contract/conformance";
import { createGate, isAffiantError, readStatus } from "@affiant/core";
import type {
  ApprovalPolicy,
  Clock,
  Decision,
  DocketEntry,
  DocketStore,
  FieldInterceptor,
  FieldSchema,
  Gate,
  GateOptions,
  InterceptorBinding,
  JsonValue,
  Operation,
  Principal,
  Scope,
  TelemetryEvent,
  TelemetryPort,
  ToolDefinition,
  TurnContext,
  UncoveredCategory,
} from "@affiant/core";
import { InMemoryDocketStore, InMemorySessionStore } from "@affiant/core/store-memory";
import {
  allowlistAuthorization,
  entityProjection,
  fixedClock,
  fixedRiskScorer,
  scriptedInference,
} from "@affiant/core/testing";
import type { FixtureClock, FixtureGate } from "@affiant/core/testing";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";

import type { ConformanceRun, FixtureOutcome, ResultDiff, RunDocument } from "./run.js";
import { IMPLEMENTATION_NAME, IMPLEMENTATION_VERSION, detectRuntime } from "./run.js";

// ---------------------------------------------------------------------------
// What a framework has to answer
// ---------------------------------------------------------------------------

/**
 * A tool definition as the adapter section states it: the core's own
 * {@link ToolDefinition}, plus the one fact only the framework has a place for.
 */
export interface AdapterToolDefinition extends ToolDefinition<never, unknown> {
  /** Which kind of the framework's own tool the host exposes this definition as. */
  readonly sdkKind?: "function" | "dynamic" | "provider";
}

/** One call through a built tool set, as an `adapter-call` step states it. */
export interface AdapterCall {
  /** The name of the tool in the built set. */
  readonly tool: string;
  /** The input a model produced for the call. */
  readonly args: Readonly<Record<string, JsonValue>>;
  /**
   * Which of the three the context is, because a binding passes each one differently:
   * a turn context the framework validates, nothing at all, or a value that is not a
   * turn context and is handed over exactly as the fixture wrote it.
   *
   * GT-2 is about a context an implementation can **read**, not about a property being
   * present, so `"malformed"` is a case a driver has to be able to make.
   */
  readonly contextKind: "turn" | "none" | "malformed";
  /** The context itself: a {@link TurnContext} for `"turn"`, `null` for `"none"`, any JSON for `"malformed"`. */
  readonly context: unknown;
  /**
   * The framework's own message history for the call, stated abstractly
   * (`{ kind: "framework-approval", approved }`). A binding maps each artefact to its
   * own framework's shape; an adapter reads no approval, no Affidavit and no entry
   * state out of it (CV-3).
   */
  readonly messages: readonly FrameworkMessage[];
}

/** One artefact of a host framework's own history, as a fixture states it. */
export interface FrameworkMessage {
  readonly kind: "framework-approval";
  readonly approved?: boolean;
}

/** What a call returned, once the binding has said which of the three shapes it is. */
export type AdapterCallShape =
  | { readonly kind: "filed"; readonly entryId: string }
  | { readonly kind: "read"; readonly result: unknown }
  | { readonly kind: "refused"; readonly code: string; readonly message: string };

/**
 * The three things only the framework can answer.
 *
 * Everything else the section needs — the gate, the definitions, the Docket, the
 * expectations — is the rulebook's and lives in this module. A second TypeScript
 * adapter is a second one of these and no change here.
 */
export interface AdapterBinding<TSet = unknown> {
  /** The adapter package, by the name a reader installs it under. */
  readonly package: string;
  /** The version of it this run exercised. */
  readonly version: string;
  /** The host framework it is for, by the name its own registry knows it by. */
  readonly runtime: string;
  /** The version of that framework this run resolved, when the binding can tell. */
  readonly runtimeVersion?: string;
  /**
   * Build the framework's tool set from `definitions`, against `gate`.
   *
   * Throws the adapter's own wire-up refusal where it has one — which the runner
   * reports through `expect.error` exactly as a gate's wire-up refusal is (CV-1).
   */
  build(gate: Gate, definitions: readonly AdapterToolDefinition[]): TSet;
  /** Call one tool of `set` the way the framework calls it. */
  call(set: TSet, call: AdapterCall): Promise<unknown>;
  /** What the framework was handed back to put in its own history. */
  modelOutput(set: TSet, call: AdapterCall, output: unknown): Promise<JsonValue>;
  /** Which of the three shapes the call's return value is. */
  classify(output: unknown): AdapterCallShape;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** One adapter's run of the section, and the row its parity manifest publishes. */
export interface AdapterRun {
  /** One entry per document in the `adapter` manifest section, passes included. */
  readonly results: readonly FixtureOutcome[];
  /** Every id whose outcome was `fail` or `error`, sorted. */
  readonly failingIds: readonly string[];
  /** The `adapters[]` row this run supports, minus the claims-lint verdict CI supplies. */
  readonly declaration: {
    readonly package: string;
    readonly version: string;
    readonly runtime: string;
    readonly runtimeVersion?: string;
    readonly fixtures: number;
  };
}

/**
 * ajv-formats is CommonJS and sets both `module.exports` and `exports.default` to the
 * same function; which one an ES import lands on depends on the runtime's interop,
 * and this module deliberately runs on three of them.
 */
type AddFormats = (ajv: Ajv2020) => Ajv2020;
const imported = ajvFormats as unknown as AddFormats | { default: AddFormats };
const addFormats: AddFormats = typeof imported === "function" ? imported : imported.default;

/** A validator with the fixture format registered by `$id`. */
function validator(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema([fixtureSchema] as AnySchemaObject[]);
  return ajv;
}

/**
 * Run every document the `adapter` manifest section lists against one adapter.
 *
 * Every one, including the ones that pass: a run that reported only failures could
 * not be checked for completeness. A document the manifest lists that this driver
 * cannot load or cannot run is an `error`, never an absence and never a silent skip.
 */
export async function runAdapterSection<TSet>(binding: AdapterBinding<TSet>): Promise<AdapterRun> {
  const ajv = validator();
  const byId = new Map<string, ConformanceFixtureDocument>();
  for (const fixture of adapterFixtures) byId.set(fixture.id, fixture);

  const results: FixtureOutcome[] = [];
  for (const row of adapterManifest.fixtures) {
    const at = Date.now();
    const document = byId.get(row.id);
    if (document === undefined) {
      results.push({
        id: row.id,
        outcome: "error",
        reason: `the manifest lists ${row.id}, which this driver could not load`,
        durationMs: 0,
      });
      continue;
    }
    const outcome = await runOne(ajv, document, binding);
    results.push({ ...outcome, durationMs: Date.now() - at });
  }

  return {
    results,
    failingIds: results
      .filter((result) => result.outcome === "fail" || result.outcome === "error")
      .map((result) => result.id)
      .sort(),
    declaration: {
      package: binding.package,
      version: binding.version,
      runtime: binding.runtime,
      ...(binding.runtimeVersion === undefined ? {} : { runtimeVersion: binding.runtimeVersion }),
      fixtures: adapterManifest.fixtures.length,
    },
  };
}

/**
 * One adapter fixture, validated against the format and run.
 *
 * Exported so a suite can hold the runner to its own contract — that a document
 * stating a clause this driver does not bind is an `error` or a `fail` and never a
 * pass (`RUNNER.md` §8) — without going through the manifest.
 */
export async function runAdapterFixture<TSet>(
  document: ConformanceFixtureDocument,
  binding: AdapterBinding<TSet>,
): Promise<FixtureOutcome> {
  return await runOne(validator(), document, binding);
}

/**
 * The conformance section and one adapter's run of the adapter section, as the one
 * run document a driver publishes and the one failing set its parity manifest is
 * asserted against.
 *
 * The rulebook's assertion is over the **union** of the sections a run covered
 * (`PARITY.md`), so the two runs are merged rather than compared separately: a
 * failing adapter fixture is a failing fixture like any other.
 */
export function mergeRuns(
  base: ConformanceRun,
  ...adapters: readonly AdapterRun[]
): ConformanceRun {
  const results = [...base.document.results, ...adapters.flatMap((run) => run.results)];
  const document: RunDocument = {
    ...base.document,
    summary: {
      ...base.document.summary,
      total: results.length,
      passed: results.filter((result) => result.outcome === "pass").length,
      failed: results.filter((result) => result.outcome === "fail").length,
      errored: results.filter((result) => result.outcome === "error").length,
      skipped: results.filter((result) => result.outcome === "skipped").length,
    },
    results,
  };
  return {
    document,
    failingIds: [...base.failingIds, ...adapters.flatMap((run) => run.failingIds)].sort(),
    skippedIds: [...base.skippedIds].sort(),
  };
}

/**
 * A run document for an adapter section run on its own, for the CLI's `adapter`
 * command — the same shape as a full run's, carrying only this section's results.
 */
export function adapterRunDocument(run: AdapterRun, protocolTag: string): RunDocument {
  return {
    schemaVersion: "0.1.0",
    implementation: {
      name: IMPLEMENTATION_NAME,
      version: IMPLEMENTATION_VERSION,
      runtime: detectRuntime(),
    },
    protocolTag,
    producedAt: new Date().toISOString(),
    summary: {
      total: run.results.length,
      passed: run.results.filter((result) => result.outcome === "pass").length,
      failed: run.results.filter((result) => result.outcome === "fail").length,
      errored: run.results.filter((result) => result.outcome === "error").length,
      skipped: 0,
    },
    results: run.results,
  };
}

// ---------------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------------

/** A failure the runner found: the path, what the fixture said, what happened. */
type Failure = ResultDiff & { readonly at: string };

/** Everything one document's run accumulates. */
interface RunState<TSet> {
  readonly binding: AdapterBinding<TSet>;
  readonly clock: FixtureClock;
  readonly store: DocketStore;
  readonly gate: Gate;
  readonly events: TelemetryEvent[];
  /** The definitions of the last `adapter-build`, so a `gate: "absent"` call can rebuild. */
  definitions: readonly AdapterToolDefinition[];
  set: TSet | null;
  /** Whether any host function ran. Reset before the step under test. */
  hostExecuteRan: boolean;
  /** The entry the last filing produced, and the labels steps gave it. */
  lastEntryId: string | null;
  readonly labelled: Map<string, string>;
  /** What the step under test did. */
  outcome: StepOutcome;
  /** The call the step under test attempted, whether or not it returned. */
  attempted: AdapterCall | null;
}

/**
 * Marks a step kind this driver has not bound.
 *
 * It is thrown rather than folded into the step's outcome, and it escapes `runDocument`
 * to become an `error` for the whole document — in the step under test and in any
 * `prior` step alike. Without that it was swallowed: a schema-valid `file` step in an
 * adapter document raised, the raise was recorded as that step's outcome, and a document
 * stating no `expect.outcome` reported `pass` for a scene that was never set. An unbound
 * kind counts against the implementation exactly like a failure (`DRIVER.md` section 3,
 * `RUNNER.md` section 8); it is never a pass and never a silent skip.
 */
const UNBOUND_STEP = Symbol.for("affiant.conformance.unbound-step");

/** Whether `cause` is a step kind this driver has not bound. */
function isUnboundStep(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as Record<symbol, unknown>)[UNBOUND_STEP] === true
  );
}

/** What one step did, kept so the expectations can look at it. */
interface StepOutcome {
  readonly code: string | null;
  readonly message: string | null;
  readonly shape: AdapterCallShape | null;
  readonly threw: unknown;
  readonly call: AdapterCall | null;
  readonly output: unknown;
  readonly entryId: string | null;
  readonly read: DocketEntry | null;
  readonly found: boolean | null;
}

const NOTHING: StepOutcome = {
  code: null,
  message: null,
  shape: null,
  threw: null,
  call: null,
  output: null,
  entryId: null,
  read: null,
  found: null,
};

/** One adapter fixture: validated against the format, then run. */
async function runOne<TSet>(
  ajv: Ajv2020,
  document: ConformanceFixtureDocument,
  binding: AdapterBinding<TSet>,
): Promise<FixtureOutcome> {
  const schemaId = typeof fixtureSchema["$id"] === "string" ? fixtureSchema["$id"] : "";
  const validate = ajv.getSchema(schemaId);
  if (validate === undefined) {
    return { id: document.id, outcome: "error", reason: "the fixture schema is not registered" };
  }
  if (!validate(document)) {
    const errors = (validate.errors ?? [])
      .map(
        (error) => `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? ""}`,
      )
      .join("; ");
    return {
      id: document.id,
      outcome: "error",
      reason: `does not validate against fixture.schema.json: ${errors}`,
    };
  }

  try {
    const failures = await runDocument(document as unknown as AdapterFixture, binding);
    if (failures.length === 0) return { id: document.id, outcome: "pass" };
    return { id: document.id, outcome: "fail", diff: failures };
  } catch (cause) {
    return {
      id: document.id,
      outcome: "error",
      reason: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
      diff: [{ at: "run", expected: "a completed run", actual: String(cause) }],
    };
  }
}

/** The document, as this runner reads it. */
interface AdapterFixture {
  readonly id: string;
  readonly rules: readonly string[];
  readonly title: string;
  readonly given: {
    readonly clock: string;
    readonly store?: string;
    readonly gate: FixtureGate;
    readonly ctx: FixtureContextDocument;
    readonly prior?: readonly AdapterStep[];
    readonly step: AdapterStep;
  };
  readonly expect: Readonly<Record<string, unknown>>;
}

/** `given.ctx`, and the shape a step may restate in full. */
interface FixtureContextDocument {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly channel: string;
  readonly principal?: Principal | null;
  readonly utterance?: string;
  readonly messageId?: string;
}

/** One step, of any kind this runner binds. */
interface AdapterStep {
  readonly kind: string;
  readonly as?: string;
  readonly at?: string;
  readonly principal?: Principal | null;
  readonly tenantId?: string;
  readonly conversationId?: string;
  readonly entry?: string;
  readonly refusal?: string | null;
  // adapter-build
  readonly definitions?: readonly AdapterDefinitionDocument[];
  readonly declared?: readonly { readonly tool: string; readonly category: UncoveredCategory }[];
  // adapter-call
  readonly tool?: string;
  readonly args?: Readonly<Record<string, JsonValue>>;
  readonly context?: "turn" | FixtureContextDocument | { readonly malformed: unknown } | null;
  readonly gate?: "present" | "absent";
  readonly messages?: readonly FrameworkMessage[];
  // decide / markExecuted / expireDue / rehydrate
  readonly decision?: {
    readonly kind: "approve" | "reject";
    readonly amendments?: Readonly<Record<string, JsonValue>> | null;
    readonly reason?: string | null;
  };
  readonly outcome?: "executed" | "failed";
  readonly detail?: string | null;
  readonly limit?: number;
  readonly scope?: { readonly tenantId?: string; readonly conversationId?: string };
  readonly page?: { readonly limit: number; readonly cursor?: string | null };
}

/** A definition as an `adapter-build` step states it. */
interface AdapterDefinitionDocument {
  readonly name: string;
  readonly description?: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly writeCapable?: boolean;
  readonly executedBy?: "host" | "provider";
  readonly hostedMcp?: boolean;
  readonly omitExecute?: boolean;
  readonly sdkKind?: "function" | "dynamic" | "provider";
  /** What a READ definition's host function returns, stated by the fixture. */
  readonly readResult?: JsonValue;
  readonly operationLabel?: string;
  readonly fields: readonly {
    readonly name: string;
    readonly kind: "text" | "number" | "date" | "enum";
    readonly description?: string | null;
    readonly required?: boolean;
    readonly allowedValues?: readonly string[] | null;
    readonly pattern?: string | null;
  }[];
}

/** Run one document and return every fact it stated that did not hold. */
async function runDocument<TSet>(
  fixture: AdapterFixture,
  binding: AdapterBinding<TSet>,
): Promise<Failure[]> {
  const failures: Failure[] = [];
  const clock = fixedClock(fixture.given.clock);
  const store = new InMemoryDocketStore({ clock });
  const events: TelemetryEvent[] = [];
  const telemetry: TelemetryPort = {
    emit(event) {
      events.push(event);
    },
  };

  // A wiring the gate refuses is itself a fixture (CV-1): the refusal is reported
  // through `expect.error` exactly as a step's refusal is, and nothing after it runs.
  let gate: Gate;
  try {
    gate = buildGate(fixture.given.gate, clock, store, telemetry);
  } catch (cause) {
    if (!isAffiantError(cause)) throw cause;
    checkWireUpRefusal(fixture, cause.code, cause.message, events, failures);
    return failures;
  }

  const state: RunState<TSet> = {
    binding,
    clock,
    store,
    gate,
    events,
    definitions: [],
    set: null,
    hostExecuteRan: false,
    lastEntryId: null,
    labelled: new Map(),
    outcome: NOTHING,
    attempted: null,
  };

  for (const [index, step] of (fixture.given.prior ?? []).entries()) {
    const outcome = await perform(fixture, step, state);
    compareDeclaredRefusal(step, outcome, `prior[${String(index)}]`, failures, true);
  }

  // `hostExecuteRan` is about the step under test: a prior step that legitimately
  // reached a host read must not answer for it. So is `attempted`, which is what the
  // framework-facing clauses read.
  state.hostExecuteRan = false;
  state.attempted = null;
  const final = await perform(fixture, fixture.given.step, state);
  state.outcome = final;
  compareDeclaredRefusal(fixture.given.step, final, "step", failures, false);

  await checkExpectations(fixture, state, failures);
  return failures;
}

// ---------------------------------------------------------------------------
// The gate, built from `given.gate` exactly as a conformance fixture's is
// ---------------------------------------------------------------------------

function buildGate(
  given: FixtureGate,
  clock: Clock,
  store: DocketStore,
  telemetry: TelemetryPort,
): Gate {
  const options: GateOptions = {
    store,
    inference: scriptedInference(given.inference ?? null),
    projection: entityProjection(given.entities),
    authorization: allowlistAuthorization(given.authorization),
    policies: (given.policies ?? []).map(policyOf),
    interceptors: (given.interceptors ?? []).map(interceptorOf),
    clock,
    telemetry,
    defaultTtlMs: given.defaultTtlMs,
    ...(given.sessions === false ? {} : { sessions: new InMemorySessionStore(store) }),
    ...(given.riskScorer === undefined || given.riskScorer === null
      ? {}
      : { riskScorer: fixedRiskScorer(given.riskScorer) }),
  };
  const gate = createGate(options);
  for (const declaration of given.uncovered ?? []) {
    gate.declareUncovered({ name: declaration.tool }, declaration.category);
  }
  return gate;
}

/** An {@link ApprovalPolicy} that always returns the fixture's verdict. */
function policyOf(stated: NonNullable<FixtureGate["policies"]>[number]): ApprovalPolicy {
  return {
    id: stated.id,
    version: stated.version,
    declaredInputs: stated.declaredInputs ?? [],
    ...(stated.declaresThreshold === undefined
      ? {}
      : { declaresThreshold: stated.declaresThreshold }),
    ...(stated.defaultTtlMs === undefined || stated.defaultTtlMs === null
      ? {}
      : { defaultTtlMs: stated.defaultTtlMs }),
    async evaluate() {
      return stated.verdict;
    },
  };
}

/** A {@link FieldInterceptor} that resolves the fixture's fields for every operation. */
function interceptorOf(stated: NonNullable<FixtureGate["interceptors"]>[number]): FieldInterceptor {
  return {
    name: stated.name,
    resolve() {
      const resolved: Record<
        string,
        {
          value: JsonValue;
          source: "External" | "Computed";
          binding: InterceptorBinding;
          confidence: number;
          evidence: string | null;
        }
      > = {};
      for (const [name, field] of Object.entries(stated.fields)) {
        resolved[name] = {
          value: field.value,
          source: field.source,
          binding: field.binding,
          confidence: field.confidence,
          evidence: field.evidence ?? null,
        };
      }
      return resolved;
    },
  };
}

/**
 * A gate that cannot be reached — what `gate: "absent"` builds a tool set against.
 *
 * Every entry point raises, so a seam that calls the gate throws (CV-2) and a seam
 * that silently returned the raw proposal as the tool's result would return instead,
 * which is what the fixture is there to catch.
 */
function unreachableGate(): Gate {
  const raise = (): never => {
    throw new Error("the gate is unreachable from this seam");
  };
  return {
    wrap: raise,
    file: raise,
    declareUncovered: raise,
    decide: raise,
    markExecuted: raise,
    resubmit: raise,
    get: raise,
    rehydrate: raise,
    expireDue: raise,
    coverage: { lookup: raise, declare: raise, declarations: raise },
  } as unknown as Gate;
}

// ---------------------------------------------------------------------------
// Definitions, contexts and steps
// ---------------------------------------------------------------------------

/** The field schema a definition declares. */
function fieldSchemaOf(document: AdapterDefinitionDocument): FieldSchema {
  return {
    entityType: document.entityType,
    fields: document.fields.map((field) => ({
      name: field.name,
      kind: field.kind,
      description: field.description ?? null,
      required: field.required ?? false,
      allowedValues: field.allowedValues ?? null,
      pattern: field.pattern ?? null,
    })),
  };
}

/**
 * A definition, with the host function the driver supplies.
 *
 * For a **write-capable** definition the function is a tripwire: the gate stands in
 * front of writes and must never perform one (GT-6), and a driver that supplied a
 * harmless no-op would turn every document here into one that cannot detect the bug
 * it is there for. For a **read** it records that it ran, which is what lets a
 * fixture state `hostExecuteRan: false` about a refused read and mean something.
 */
function definitionOf<TSet>(
  document: AdapterDefinitionDocument,
  state: RunState<TSet>,
): AdapterToolDefinition {
  const writeCapable = document.writeCapable === true;
  const execute = writeCapable
    ? (): never => {
        state.hostExecuteRan = true;
        throw new Error(`GT-6: the own execute of write tool ${document.name} was called`);
      }
    : (args: never): JsonValue => {
        state.hostExecuteRan = true;
        // The fixture's own value, so `expect.outcome.result` is a fact the document
        // pins rather than a value this driver chose and then checked against itself.
        return document.readResult === undefined
          ? (`${document.name} ran with ${JSON.stringify(args)}` as JsonValue)
          : document.readResult;
      };
  const operation = (args: never): Operation =>
    document.entityId === undefined || document.entityId === null
      ? {
          kind: "create",
          entityType: document.entityType,
          entityId: null,
          fields: Object.keys((args ?? {}) as Record<string, unknown>),
        }
      : {
          kind: "update",
          entityType: document.entityType,
          entityId: document.entityId,
          fields: Object.keys((args ?? {}) as Record<string, unknown>),
        };

  return {
    name: document.name,
    description: document.description ?? document.name,
    inputSchema: fieldSchemaOf(document),
    writeCapable,
    ...(document.omitExecute === true ? {} : { execute }),
    ...(document.executedBy === undefined ? {} : { executedBy: document.executedBy }),
    ...(document.hostedMcp === undefined ? {} : { hostedMcp: document.hostedMcp }),
    ...(document.sdkKind === undefined ? {} : { sdkKind: document.sdkKind }),
    ...(document.operationLabel === undefined ? {} : { operationLabel: document.operationLabel }),
    ...(writeCapable ? { operation } : {}),
  };
}

/** The turn context a step runs under, from `given.ctx` and the step's own overrides. */
function turnContextOf(
  step: AdapterStep,
  stated: FixtureContextDocument,
  clock: Clock,
): TurnContext {
  return {
    conversationId: step.conversationId ?? stated.conversationId,
    tenantId: step.tenantId ?? stated.tenantId,
    channel: stated.channel,
    principal: step.principal !== undefined ? step.principal : (stated.principal ?? null),
    turn: {
      utterance: stated.utterance ?? "",
      messageId: stated.messageId ?? "",
      at: clock.now(),
    },
  };
}

/** The scope a step reads the Docket in. */
function scopeOf(fixture: AdapterFixture, step: AdapterStep): Scope {
  const tenantId = step.tenantId ?? fixture.given.ctx.tenantId;
  const conversationId = step.scope?.conversationId;
  return conversationId === undefined ? { tenantId } : { tenantId, conversationId };
}

/** The entry a step acts on: a label from an earlier `as`, or the last one filed. */
function targetOf<TSet>(step: AdapterStep, state: RunState<TSet>): string | null {
  if (step.entry === undefined) return state.lastEntryId;
  return state.labelled.get(step.entry) ?? step.entry;
}

/** Run one step and report what it did. */
async function perform<TSet>(
  fixture: AdapterFixture,
  step: AdapterStep,
  state: RunState<TSet>,
): Promise<StepOutcome> {
  if (step.at !== undefined) state.clock.set(step.at);
  try {
    return await dispatch(fixture, step, state);
  } catch (cause) {
    // A step kind nobody bound is a fact about this driver, not about the
    // implementation's behaviour, and it is an `error` for the whole document.
    if (isUnboundStep(cause)) throw cause;
    if (isAffiantError(cause)) {
      return { ...NOTHING, code: cause.code, message: cause.message, threw: cause };
    }
    return {
      ...NOTHING,
      threw: cause,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

async function dispatch<TSet>(
  fixture: AdapterFixture,
  step: AdapterStep,
  state: RunState<TSet>,
): Promise<StepOutcome> {
  const ctx = turnContextOf(step, fixture.given.ctx, state.clock);

  switch (step.kind) {
    case "adapter-build": {
      const documents = step.definitions ?? [];
      for (const declaration of step.declared ?? []) {
        state.gate.declareUncovered({ name: declaration.tool }, declaration.category);
      }
      state.definitions = documents.map((document) => definitionOf(document, state));
      state.set = state.binding.build(state.gate, state.definitions);
      return NOTHING;
    }

    case "adapter-call": {
      const tool = step.tool ?? "";
      const stated = step.context;
      const malformed =
        stated !== null && typeof stated === "object" && "malformed" in stated
          ? (stated as { readonly malformed: unknown })
          : null;
      const call: AdapterCall =
        stated === null || stated === undefined
          ? {
              tool,
              args: step.args ?? {},
              contextKind: "none",
              context: null,
              messages: step.messages ?? [],
            }
          : malformed !== null
            ? {
                tool,
                args: step.args ?? {},
                contextKind: "malformed",
                context: malformed.malformed,
                messages: step.messages ?? [],
              }
            : {
                tool,
                args: step.args ?? {},
                contextKind: "turn",
                context:
                  stated === "turn"
                    ? ctx
                    : turnContextOf(step, stated as FixtureContextDocument, state.clock),
                messages: step.messages ?? [],
              };
      // Recorded before the call, so a call that RAISES is still a call the
      // framework-facing clauses can answer about: what it was handed is nothing.
      state.attempted = call;
      const set =
        step.gate === "absent"
          ? state.binding.build(unreachableGate(), state.definitions)
          : state.set;
      if (set === null) {
        throw new Error(
          `${step.kind}: no tool set has been built — the fixture states no adapter-build step`,
        );
      }
      const output = await state.binding.call(set, call);
      const shape = state.binding.classify(output);
      if (shape.kind === "filed") {
        state.lastEntryId = shape.entryId;
        if (step.as !== undefined) state.labelled.set(step.as, shape.entryId);
      }
      return {
        ...NOTHING,
        shape,
        call,
        output,
        entryId: shape.kind === "filed" ? shape.entryId : null,
        ...(shape.kind === "refused" ? { code: shape.code, message: shape.message } : {}),
      };
    }

    case "get": {
      const target = targetOf(step, state);
      const read = target === null ? null : await state.gate.get(target, ctx);
      return { ...NOTHING, read, found: read !== null, entryId: target };
    }

    case "decide": {
      const target = targetOf(step, state);
      if (target === null) throw new Error("decide: no entry to act on");
      const stated = step.decision ?? { kind: "approve" as const };
      // `amendments` and `reason` are stated or absent, never null: DK-2's null is a
      // value *inside* an amendment map, and a null map is not the same statement.
      const decision: Decision =
        stated.kind === "reject"
          ? { kind: "reject", reason: stated.reason ?? "" }
          : {
              kind: "approve",
              ...(stated.amendments === undefined || stated.amendments === null
                ? {}
                : { amendments: stated.amendments }),
              ...(stated.reason === undefined || stated.reason === null
                ? {}
                : { reason: stated.reason }),
            };
      const row = await state.gate.decide(target, decision, ctx);
      return { ...NOTHING, read: row, entryId: target };
    }

    case "markExecuted": {
      const target = targetOf(step, state);
      if (target === null) throw new Error("markExecuted: no entry to act on");
      const row = await state.gate.markExecuted(
        target,
        step.outcome ?? "executed",
        step.detail ?? null,
        ctx,
      );
      return { ...NOTHING, read: row, entryId: target };
    }

    case "resubmit": {
      const target = targetOf(step, state);
      if (target === null) throw new Error("resubmit: no entry to act on");
      const filed = await state.gate.resubmit(target, ctx);
      state.lastEntryId = filed.entry.entryId;
      if (step.as !== undefined) state.labelled.set(step.as, filed.entry.entryId);
      return { ...NOTHING, read: filed.entry, entryId: filed.entry.entryId };
    }

    case "expireDue": {
      if (step.limit === undefined) throw new Error("expireDue: the step states no limit");
      await state.gate.expireDue(state.clock.now(), scopeOf(fixture, step), step.limit);
      return NOTHING;
    }

    case "rehydrate": {
      if (step.page === undefined) throw new Error("rehydrate: the step states no page");
      await state.gate.rehydrate(scopeOf(fixture, step), {
        limit: step.page.limit,
        cursor: step.page.cursor ?? null,
      });
      return NOTHING;
    }

    default:
      // `wrap-execute` and `file` are the gate's own seams, not an adapter's: a
      // document about either belongs in the conformance section, where the
      // reference runner binds them. An unbound step kind is an `error`, never a
      // pass (DRIVER.md §3).
      throw Object.assign(
        new Error(
          `the adapter driver binds adapter-build, adapter-call, get, decide, markExecuted, ` +
            `resubmit, expireDue and rehydrate; it does not bind ${JSON.stringify(step.kind)}`,
        ),
        { [UNBOUND_STEP]: true },
      );
  }
}

// ---------------------------------------------------------------------------
// The expectations
// ---------------------------------------------------------------------------

/** The `expect` clauses this driver answers. Anything else is an `error`, never a pass. */
const CLAUSES = new Set([
  "error",
  "entry",
  "found",
  "store",
  "telemetry",
  "telemetryAbsent",
  "outcome",
  "entries",
  "modelOutput",
  "frameworkCarries",
  "hostExecuteRan",
]);

/** The `expect.entry` keys this driver answers. */
const ENTRY_KEYS = new Set([
  "status",
  "execution",
  "executionDetail",
  "requirement",
  "blocked",
  "toolName",
  "channel",
  "tenantId",
  "conversationId",
  "attestation",
  "decision",
  "amendments",
  "preservedAmendments",
  "lineage",
  "expiresAtOffsetMs",
  "affidavit",
  "amendedAffidavit",
]);

/** The `affidavit` matcher keys this driver answers. */
const AFFIDAVIT_KEYS = new Set([
  "operationType",
  "entityType",
  "entityId",
  "aggregateConfidence",
  "populatedConfidence",
  "emptyFieldCount",
  "fields",
]);

/** The field matcher keys this driver answers. */
const FIELD_KEYS = new Set([
  "name",
  "value",
  "previousValue",
  "kind",
  "isMandatory",
  "source",
  "bound",
  "bindingKind",
  "confidence",
]);

/** A refusal a step declared, compared wherever it is declared. */
function compareDeclaredRefusal(
  step: AdapterStep,
  outcome: StepOutcome,
  where: string,
  failures: Failure[],
  always: boolean,
): void {
  if (step.refusal === undefined && !always) return;
  const expected = step.refusal ?? null;
  if (expected !== outcome.code) {
    failures.push({ at: `${where}.refusal`, expected, actual: outcome.code });
  }
}

/** On a wiring the gate refused, only four clauses are answerable. */
function checkWireUpRefusal(
  fixture: AdapterFixture,
  code: string,
  message: string,
  events: readonly TelemetryEvent[],
  failures: Failure[],
): void {
  const answerable = new Set(["error", "telemetry", "telemetryAbsent", "store", "entries"]);
  for (const key of Object.keys(fixture.expect)) {
    if (!answerable.has(key)) {
      failures.push({
        at: key,
        expected: "a clause answerable after a wiring refusal",
        actual: "the gate was refused at wire-up, so nothing was filed",
      });
    }
  }
  checkError(fixture.expect["error"], code, message, failures);
  checkTelemetry(fixture, events, failures);
}

async function checkExpectations<TSet>(
  fixture: AdapterFixture,
  state: RunState<TSet>,
  failures: Failure[],
): Promise<void> {
  for (const key of Object.keys(fixture.expect)) {
    if (!CLAUSES.has(key)) {
      // A `fail` naming itself, not an `error`: this is a document the driver could
      // run, and the fact it stated is one the driver did not check. Never a pass.
      failures.push({
        at: key,
        expected: "a clause this driver answers",
        actual: `the adapter driver does not bind expect.${key}; it answers ${[...CLAUSES].sort().join(", ")}`,
      });
    }
  }

  const outcome = state.outcome;

  // The refusal, or the absence of one.
  if ("error" in fixture.expect) {
    checkError(fixture.expect["error"], outcome.code, outcome.message, failures);
  }

  checkOutcome(fixture.expect["outcome"], outcome, failures);

  if (fixture.expect["hostExecuteRan"] !== undefined) {
    compare("hostExecuteRan", fixture.expect["hostExecuteRan"], state.hostExecuteRan, failures);
  }

  const scope: Scope = { tenantId: fixture.given.ctx.tenantId };
  const rows = await drain(state.store, scope);
  const now = state.clock.now();

  if (fixture.expect["entries"] !== undefined) {
    compare("entries", fixture.expect["entries"], rows.length, failures);
  }

  const storeClause = fixture.expect["store"];
  if (storeClause !== null && storeClause !== undefined && typeof storeClause === "object") {
    const stated = storeClause as Record<string, unknown>;
    compare("store.count", stated["count"], rows.length, failures);
    compare(
      "store.pending",
      stated["pending"],
      rows.filter((row) => readStatus(row, now) === "pending").length,
      failures,
    );
    compare(
      "store.approvedUnexecuted",
      stated["approvedUnexecuted"],
      rows.filter((row) => readStatus(row, now) === "approved" && row.execution === "unexecuted")
        .length,
      failures,
    );
  }

  if (fixture.expect["found"] !== undefined) {
    compare("found", fixture.expect["found"], outcome.found ?? false, failures);
  }

  const entryClause = fixture.expect["entry"];
  if (entryClause !== undefined && entryClause !== null) {
    const id = outcome.read?.entryId ?? outcome.entryId ?? state.lastEntryId;
    const row = outcome.read ?? (id === null ? null : await state.store.get(id, scope));
    if (row === null) failures.push({ at: "entry", expected: "a Docket row", actual: null });
    else checkEntry(row, entryClause as Record<string, unknown>, now, failures, "entry");
  }

  await checkFrameworkFacts(fixture, state, failures);
  checkTelemetry(fixture, state.events, failures);
}

/** `expect.error`: the refusal the step under test must produce, or the absence of one. */
function checkError(
  stated: unknown,
  code: string | null,
  message: string | null,
  failures: Failure[],
): void {
  if (stated === undefined || stated === null) {
    if (code !== null)
      failures.push({ at: "error", expected: null, actual: `${code}: ${message}` });
    return;
  }
  const expected = stated as { code?: unknown; messageContains?: unknown };
  if (code !== expected.code) {
    failures.push({
      at: "error.code",
      expected: expected.code,
      actual: code === null ? "no refusal" : `${code}: ${message}`,
    });
  }
  if (
    typeof expected.messageContains === "string" &&
    !(message ?? "").includes(expected.messageContains)
  ) {
    failures.push({ at: "error.message", expected: expected.messageContains, actual: message });
  }
}

/** `expect.outcome`: what the call under test did, as the caller saw it. */
function checkOutcome(stated: unknown, outcome: StepOutcome, failures: Failure[]): void {
  if (stated === undefined || stated === null) return;
  const expected = stated as {
    kind?: unknown;
    code?: unknown;
    messageContains?: unknown;
    result?: unknown;
  };

  // A call that raised something which is not a refusal is `thrown`; one that raised
  // or returned an Affiant refusal is `refused`; otherwise the binding said which of
  // the two result shapes it was.
  const actualKind =
    outcome.shape !== null
      ? outcome.shape.kind
      : outcome.code !== null
        ? "refused"
        : outcome.threw !== null
          ? "thrown"
          : "none";

  if (expected.kind !== actualKind) {
    failures.push({
      at: "outcome.kind",
      expected: expected.kind,
      actual:
        actualKind === "none" ? "no call outcome at all" : `${actualKind}: ${outcome.message}`,
    });
    return;
  }
  if (expected.code !== undefined) {
    compare("outcome.code", expected.code, outcome.code, failures);
  }
  if (typeof expected.messageContains === "string") {
    if (!(outcome.message ?? "").includes(expected.messageContains)) {
      failures.push({
        at: "outcome.messageContains",
        expected: expected.messageContains,
        actual: outcome.message,
      });
    }
  }
  if (expected.result !== undefined && outcome.shape?.kind === "read") {
    compare("outcome.result", expected.result, outcome.shape.result, failures);
  }
}

/** `expect.modelOutput` and `expect.frameworkCarries`: what the framework was handed. */
async function checkFrameworkFacts<TSet>(
  fixture: AdapterFixture,
  state: RunState<TSet>,
  failures: Failure[],
): Promise<void> {
  const wantsModel = "modelOutput" in fixture.expect;
  const wantsCarries = fixture.expect["frameworkCarries"] !== undefined;
  if (!wantsModel && !wantsCarries) return;

  const outcome = state.outcome;
  if (state.attempted === null || state.set === null) {
    failures.push({
      at: wantsModel ? "modelOutput" : "frameworkCarries",
      expected: "a call the framework was handed a result for",
      actual: "the step under test made no call through a built tool set",
    });
    return;
  }

  // A call that RAISED handed the framework nothing at all — there is no tool result
  // to put in a history. That is the fact `"modelOutput": null` states, and it is the
  // one that catches a seam which refuses and returns the raw proposal anyway (CV-2).
  const raised = outcome.shape === null;
  const output = raised
    ? null
    : await state.binding.modelOutput(state.set, state.attempted, outcome.output);
  const id = outcome.entryId;
  const row =
    id === null ? null : await state.store.get(id, { tenantId: fixture.given.ctx.tenantId });

  if (wantsModel) {
    const stated = fixture.expect["modelOutput"];
    if (stated === null) {
      if (!raised) {
        failures.push({
          at: "modelOutput",
          expected: null,
          actual: output,
        });
      }
    } else if (raised) {
      failures.push({
        at: "modelOutput",
        expected: "what the framework was handed",
        actual: "the call raised, so the framework was handed nothing",
      });
    } else {
      checkModelOutput(stated as Record<string, unknown>, output, row, failures);
    }
  }

  if (wantsCarries) {
    compare(
      "frameworkCarries",
      fixture.expect["frameworkCarries"],
      id === null || raised ? [] : keysCarrying(output, id).sort(),
      failures,
    );
  }
}

/** The `modelOutput` matcher, against what the framework was actually handed. */
function checkModelOutput(
  stated: Record<string, unknown>,
  output: JsonValue,
  row: DocketEntry | null,
  failures: Failure[],
): void {
  const asObject =
    output !== null && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, JsonValue>)
      : null;

  if (stated["keys"] !== undefined) {
    compare(
      "modelOutput.keys",
      stated["keys"],
      asObject === null ? null : Object.keys(asObject).sort(),
      failures,
    );
  }
  if (stated["fields"] !== undefined) {
    compare("modelOutput.fields", stated["fields"], asObject?.["fields"] ?? null, failures);
  }
  if (stated["status"] !== undefined) {
    // The status the model is told, which must be the row's own. A seam that read an
    // approval out of the framework's history and told the model `approved` over a
    // `pending` row is what AZ-5 closes, and nothing else here would see it.
    compare("modelOutput.status", stated["status"], asObject?.["status"] ?? null, failures);
    if (row !== null && asObject?.["status"] !== undefined) {
      compare("modelOutput.status (the row's own)", row.status, asObject["status"], failures);
    }
  }
  if (stated["carriesNoFieldValues"] !== true) return;

  // A check over TEXT, not over structure. A summary whose `note` reads
  // "priority=High" has put a sworn value in the framework's history exactly as surely
  // as one carrying it as a value, and a structural comparison passes it.
  const serialised = JSON.stringify(output) ?? "null";
  const sworn = (row?.amendedAffidavit ?? row?.affidavit)?.fields ?? [];
  for (const field of sworn) {
    if (hasKey(output, field.name)) {
      failures.push({
        at: "modelOutput.carriesNoFieldValues",
        expected: `no key named ${field.name} anywhere in the output`,
        actual: output,
      });
    }
    if (field.value === null) continue;
    // A string's serialisation is its JSON-escaped body WITHOUT the quotes, because a
    // value put in the framework's history inside a sentence is still in the
    // framework's history: `"note": "filed for review: priority=High"` carries the
    // sworn `High` exactly as surely as `"priority": "High"` would. Anything else —
    // a number, a boolean, an object — is its whole JSON form.
    const text =
      typeof field.value === "string"
        ? (JSON.stringify(field.value) ?? '""').slice(1, -1)
        : (JSON.stringify(field.value) ?? "");
    if (text === "") continue;
    // A serialisation shorter than three characters — `1`, `0`, `ok` — would match
    // almost any output as a substring, so it is compared as a whole JSON token
    // instead. Anything longer is looked for in the text, wherever it sits.
    const found = text.length < 3 ? containsToken(serialised, text) : serialised.includes(text);
    if (found) {
      failures.push({
        at: "modelOutput.carriesNoFieldValues",
        expected: `nothing anywhere in the output's text equal to the sworn value of ${field.name}`,
        actual: serialised,
      });
    }
  }
}

/**
 * Whether `token` appears in `serialised` as a whole JSON token — bounded on each side
 * by something that cannot be part of the same literal.
 *
 * The short-value rule. `1` as a substring matches `"entryId":"...1..."` and a dozen
 * other things; as a token it matches only a value that *is* `1`.
 */
function containsToken(serialised: string, token: string): boolean {
  const boundary = /[A-Za-z0-9_.+-]/;
  let at = serialised.indexOf(token);
  while (at !== -1) {
    const before = serialised[at - 1];
    const after = serialised[at + token.length];
    if (
      (before === undefined || !boundary.test(before)) &&
      (after === undefined || !boundary.test(after))
    ) {
      return true;
    }
    at = serialised.indexOf(token, at + 1);
  }
  return false;
}

/** Whether any object anywhere in `value` has a key named `name`. */
function hasKey(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((item) => hasKey(item, name));
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, name)) return true;
  return Object.values(record).some((item) => hasKey(item, name));
}

/**
 * Every path in `value` whose value is the string `id`, dotted for a nested match and
 * bracketed for an array index — `entryId`, `result.entryId`, `items[0].entryId`.
 *
 * Paths rather than bare key names, so a summary that buried the entry id somewhere
 * unexpected is named rather than merely counted (CV-3).
 */
function keysCarrying(value: unknown, id: string): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node === id) {
      found.push(path);
      return;
    }
    if (Array.isArray(node)) {
      for (const [index, item] of node.entries()) walk(item, `${path}[${String(index)}]`);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      walk(item, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(value, "");
  return found;
}

/** `expect.telemetry` and `expect.telemetryAbsent`. */
function checkTelemetry(
  fixture: AdapterFixture,
  events: readonly TelemetryEvent[],
  failures: Failure[],
): void {
  const emitted = events.map((event) => String(event.key));
  for (const key of (fixture.expect["telemetry"] ?? []) as readonly string[]) {
    if (!emitted.includes(key)) {
      failures.push({ at: `telemetry.${key}`, expected: "emitted", actual: emitted });
    }
  }
  for (const key of (fixture.expect["telemetryAbsent"] ?? []) as readonly string[]) {
    if (emitted.includes(key)) {
      failures.push({ at: `telemetryAbsent.${key}`, expected: "never emitted", actual: emitted });
    }
  }
}

/** `expect.entry`: a partial matcher over a Docket row. */
function checkEntry(
  row: DocketEntry,
  stated: Record<string, unknown>,
  now: string,
  failures: Failure[],
  path: string,
): void {
  for (const key of Object.keys(stated)) {
    if (!ENTRY_KEYS.has(key)) {
      failures.push({
        at: `${path}.${key}`,
        expected: "a matcher key this driver answers",
        actual: `the adapter driver does not bind ${key}`,
      });
    }
  }

  // `status` is the status the row READS, not the one it stores: a row past its
  // deadline reads expired whether or not a sweep has run (DK-1).
  compare(`${path}.status`, stated["status"], readStatus(row, now), failures);
  compare(`${path}.execution`, stated["execution"], row.execution, failures);
  compare(`${path}.executionDetail`, stated["executionDetail"], row.executionDetail, failures);
  compare(`${path}.requirement`, stated["requirement"], row.requirement, failures);
  compare(`${path}.blocked`, stated["blocked"], row.blocked, failures);
  compare(`${path}.toolName`, stated["toolName"], row.toolName, failures);
  compare(`${path}.channel`, stated["channel"], row.channel, failures);
  compare(`${path}.tenantId`, stated["tenantId"], row.tenantId, failures);
  compare(`${path}.conversationId`, stated["conversationId"], row.conversationId, failures);
  compare(`${path}.amendments`, stated["amendments"], row.amendments, failures);
  compare(
    `${path}.preservedAmendments`,
    stated["preservedAmendments"],
    row.preservedAmendments,
    failures,
  );
  compare(`${path}.decision`, stated["decision"], row.decision, failures);
  compare(`${path}.lineage`, stated["lineage"], row.lineage, failures);

  if (stated["attestation"] !== undefined) {
    // The attestation matcher is the record's ATTESTOR, not the whole record — and
    // whenever a fixture states a non-null one, the runner also checks that the
    // record names the entry it attests to: a record that cannot name its own
    // subject is not evidence (AZ-1).
    compare(`${path}.attestation`, stated["attestation"], row.attestation?.by ?? null, failures);
    if (stated["attestation"] !== null && row.attestation !== null) {
      compare(`${path}.attestation.entryId`, row.entryId, row.attestation.entryId, failures);
    }
  }

  if (stated["expiresAtOffsetMs"] !== undefined) {
    compare(
      `${path}.expiresAtOffsetMs`,
      stated["expiresAtOffsetMs"],
      Date.parse(row.expiresAt) - Date.parse(row.filedAt),
      failures,
    );
  }

  if (stated["affidavit"] !== undefined) {
    checkAffidavit(row.affidavit, stated["affidavit"], failures, `${path}.affidavit`);
  }
  if (stated["amendedAffidavit"] !== undefined) {
    if (stated["amendedAffidavit"] === null) {
      compare(`${path}.amendedAffidavit`, null, row.amendedAffidavit, failures);
    } else if (row.amendedAffidavit === null) {
      failures.push({ at: `${path}.amendedAffidavit`, expected: "an amended state", actual: null });
    } else {
      checkAffidavit(
        row.amendedAffidavit,
        stated["amendedAffidavit"],
        failures,
        `${path}.amendedAffidavit`,
      );
    }
  }
}

/** A partial matcher over an Affidavit. Stating `fields` states the list exactly, in order. */
function checkAffidavit(
  affidavit: DocketEntry["affidavit"],
  matcher: unknown,
  failures: Failure[],
  path: string,
): void {
  if (matcher === null || typeof matcher !== "object") return;
  const stated = matcher as Record<string, unknown>;
  for (const key of Object.keys(stated)) {
    if (!AFFIDAVIT_KEYS.has(key)) {
      failures.push({
        at: `${path}.${key}`,
        expected: "a matcher key this driver answers",
        actual: `the adapter driver does not bind ${key}`,
      });
    }
  }
  compare(`${path}.operationType`, stated["operationType"], affidavit.operationType, failures);
  compare(`${path}.entityType`, stated["entityType"], affidavit.entityType, failures);
  compare(`${path}.entityId`, stated["entityId"], affidavit.entityId, failures);
  compare(
    `${path}.aggregateConfidence`,
    stated["aggregateConfidence"],
    affidavit.aggregateConfidence,
    failures,
  );
  compare(
    `${path}.populatedConfidence`,
    stated["populatedConfidence"],
    affidavit.populatedConfidence,
    failures,
  );
  compare(
    `${path}.emptyFieldCount`,
    stated["emptyFieldCount"],
    affidavit.emptyFieldCount,
    failures,
  );

  const fields = stated["fields"];
  if (!Array.isArray(fields)) return;
  if (fields.length !== affidavit.fields.length) {
    failures.push({
      at: `${path}.fields.length`,
      expected: fields.length,
      actual: affidavit.fields.length,
    });
    return;
  }
  for (const [index, matcherField] of fields.entries()) {
    const field = affidavit.fields[index];
    if (field === undefined || matcherField === null || typeof matcherField !== "object") continue;
    const at = `${path}.fields[${String(index)}]`;
    const statedField = matcherField as Record<string, unknown>;
    for (const key of Object.keys(statedField)) {
      if (!FIELD_KEYS.has(key)) {
        failures.push({
          at: `${at}.${key}`,
          expected: "a matcher key this driver answers",
          actual: `the adapter driver does not bind ${key}`,
        });
      }
    }
    const tag = field.provenance.current;
    compare(`${at}.name`, statedField["name"], field.name, failures);
    compare(`${at}.value`, statedField["value"], field.value, failures);
    compare(`${at}.previousValue`, statedField["previousValue"], field.previousValue, failures);
    compare(`${at}.kind`, statedField["kind"], field.kind, failures);
    compare(`${at}.isMandatory`, statedField["isMandatory"], field.isMandatory, failures);
    compare(`${at}.source`, statedField["source"], tag.source, failures);
    compare(`${at}.bound`, statedField["bound"], tag.binding !== null, failures);
    compare(`${at}.bindingKind`, statedField["bindingKind"], tag.binding?.kind ?? null, failures);
    compare(`${at}.confidence`, statedField["confidence"], tag.confidence, failures);
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Every row of the tenant's Docket. */
async function drain(store: DocketStore, scope: Scope): Promise<DocketEntry[]> {
  const rows: DocketEntry[] = [];
  for await (const row of store.export(scope)) rows.push(row);
  return rows;
}

/** Record a failure when `expected` is stated and differs from `actual`. */
function compare(at: string, expected: unknown, actual: unknown, failures: Failure[]): void {
  if (expected === undefined) return;
  if (!deepEqual(expected, actual)) failures.push({ at, expected, actual });
}

/** Structural equality: arrays by length then element-wise, objects by key set then value-wise. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}
