import type { Principal, TurnContext } from "../src/context.js";
import type { DocketStore } from "../src/docket/store.js";
import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { ApprovalPolicy, Verdict } from "../src/gate/policy.js";
import type { ToolDefinition, UncoveredCategory } from "../src/gate/coverage.js";
import type { Gate, GateOptions } from "../src/gate/gate.js";
import { createGate } from "../src/gate/gate.js";
import type { JsonValue } from "../src/model/affidavit.js";
import type {
  AuthorizationPort,
  Clock,
  FieldInterceptor,
  FieldSchema,
  InferencePort,
  InterceptedFields,
  Operation,
  ProjectionPort,
  RiskScorer,
  StructuredField,
  UtteranceSpan,
} from "../src/ports.js";
import type { TelemetryEvent, TelemetryPort } from "../src/telemetry.js";

/**
 * Fixtures and stub ports shared by the gate suites.
 *
 * Not a suite itself — `vitest.config.ts` collects `test/**\/*.test.ts`, so this
 * module is only ever imported. Every port here is a hand-written stub rather than a
 * mocking library's: the gate's whole contract is "the host supplies these", and a
 * stub written out is a second reading of what a host has to implement.
 *
 * Everything runs on Node, Bun and workerd alike: no filesystem, no Node global.
 */

/** The instant every fixture's clock starts at. */
export const AT = "2026-09-04T09:00:00.000Z";

/** A clock a test drives by hand. */
export interface StubClock extends Clock {
  /** Move the clock to `instant`. */
  set(instant: string): void;
}

/** A {@link Clock} that reads `start` until a test moves it. */
export function stubClock(start: string = AT): StubClock {
  let current = start;
  return {
    now: () => current,
    set: (instant: string) => {
      current = instant;
    },
  };
}

// ---------------------------------------------------------------------------
// Turn contexts
// ---------------------------------------------------------------------------

/** What {@link turnContext} lets a test vary. */
export interface TurnContextInit {
  readonly conversationId?: string;
  readonly tenantId?: string;
  readonly channel?: string;
  readonly principal?: Principal | null;
  readonly utterance?: string;
  readonly messageId?: string;
  readonly at?: string;
}

/** A turn context, explicit in every property (GT-2). */
export function turnContext(init: TurnContextInit = {}): TurnContext {
  return {
    conversationId: init.conversationId ?? "conv-1",
    tenantId: init.tenantId ?? "tenant-a",
    channel: init.channel ?? "chat",
    principal: init.principal === undefined ? { kind: "member", id: "member-1" } : init.principal,
    turn: {
      utterance: init.utterance ?? "Set the invoice status to Active",
      messageId: init.messageId ?? "msg-1",
      at: init.at ?? AT,
    },
  };
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/** A telemetry port that keeps what it was given. */
export interface TelemetryLog {
  /** The port to hand to `createGate`. */
  readonly port: TelemetryPort;
  /** Every event, in emission order. */
  readonly events: TelemetryEvent[];
  /** The keys, in emission order. */
  keys(): string[];
  /** The first event with `key`, or `undefined`. */
  find(key: string): TelemetryEvent | undefined;
}

/** A recording {@link TelemetryPort}. */
export function telemetryLog(): TelemetryLog {
  const events: TelemetryEvent[] = [];
  return {
    port: {
      emit(event: TelemetryEvent): void {
        events.push(event);
      },
    },
    events,
    keys: () => events.map((event) => event.key as string),
    find: (key: string) => events.find((event) => (event.key as string) === key),
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** The step names a {@link Trace} records, in the order GT-1 fixes them. */
export type Trace = string[];

/** One field as the inference port would report it. */
export function structured(
  value: JsonValue,
  presence: "literal" | "inferred",
  confidence: number,
  utteranceSpan: UtteranceSpan | null = null,
): StructuredField {
  return { value, confidence, presence, utteranceSpan };
}

/** An {@link InferencePort} that reports `fields` for every turn. */
export function inferencePort(
  fields: { readonly [name: string]: StructuredField },
  trace?: Trace,
): InferencePort {
  return {
    async infer(_turn, _schema) {
      trace?.push("inference");
      return { fields };
    },
  };
}

/** A {@link ProjectionPort} that reports `previous` for every operation. */
export function projectionPort(
  previous: Record<string, unknown> | null,
  trace?: Trace,
): ProjectionPort {
  return {
    async previousValues(_op, _ctx) {
      trace?.push("projection");
      return previous;
    },
  };
}

/** An {@link AuthorizationPort} that admits everyone. C6 is where this starts to matter. */
export const permissiveAuthorization: AuthorizationPort = {
  async mayDecide() {
    return true;
  },
};

/** A {@link FieldInterceptor} that resolves `fields` for every operation. */
export function interceptorPort(
  name: string,
  fields: InterceptedFields,
  trace?: Trace,
): FieldInterceptor {
  return {
    name,
    resolve(_op, _ctx) {
      trace?.push(`interceptor:${name}`);
      return fields;
    },
  };
}

/** A {@link RiskScorer} that always returns `score`. */
export function riskScorer(score: number, trace?: Trace): RiskScorer {
  return {
    async score() {
      trace?.push("risk");
      return score;
    },
  };
}

/** What {@link policyReturning} lets a test vary. */
export interface PolicyInit {
  readonly id?: string;
  readonly version?: string;
  readonly declaredInputs?: readonly ApprovalPolicy["declaredInputs"][number][];
  readonly declaresThreshold?: boolean;
  readonly defaultTtlMs?: number;
  readonly trace?: Trace;
}

/** An {@link ApprovalPolicy} that always returns `verdict`. */
export function policyReturning(verdict: Verdict | null, init: PolicyInit = {}): ApprovalPolicy {
  const id = init.id ?? "policy-1";
  return {
    id,
    version: init.version ?? "1.0.0",
    declaredInputs: init.declaredInputs ?? [],
    ...(init.declaresThreshold === undefined ? {} : { declaresThreshold: init.declaresThreshold }),
    ...(init.defaultTtlMs === undefined ? {} : { defaultTtlMs: init.defaultTtlMs }),
    async evaluate() {
      init.trace?.push(`policy:${id}`);
      return verdict;
    },
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** The arguments the fixture tools take: a flat bag of field values. */
export type WriteArgs = { readonly [field: string]: JsonValue };

/** The schema the fixture tools declare. */
export function schemaFor(
  entityType: string,
  fields: readonly string[],
  kind: "text" | "number" | "date" | "enum" = "text",
): FieldSchema {
  return {
    entityType,
    fields: fields.map((name) => ({
      name,
      kind,
      description: `The ${name}`,
      required: false,
      allowedValues: null,
    })),
  };
}

/** What {@link writeTool} lets a test vary. */
export interface WriteToolInit {
  readonly name?: string;
  readonly entityType?: string;
  readonly entityId?: string | null;
  readonly fields?: readonly string[];
  readonly execute?: (args: WriteArgs, ctx: TurnContext) => Promise<string> | string;
  readonly executedBy?: "host" | "provider";
  readonly hostedMcp?: boolean;
  readonly omitOperation?: boolean;
  readonly omitExecute?: boolean;
}

/**
 * The `execute` a fixture write tool carries by default.
 *
 * A write tool needs *something* for the gate to stand in front of — a tool with no
 * `execute` is the `"no-execute"` uncovered category (CV-4). So the default is a
 * function that fails if it is ever reached, which is GT-6 as a tripwire on every
 * fixture rather than only the one that spies for it.
 */
function refuseExecute(): never {
  throw new Error("GT-6: the gate called a write tool's own execute");
}

/**
 * A write-capable tool whose `operation` names the fields its arguments carry.
 *
 * `execute` is present by default and is what a GT-6 fixture spies on: the gate must
 * never call it.
 */
export function writeTool(init: WriteToolInit = {}): ToolDefinition<WriteArgs, string> {
  const entityId = init.entityId === undefined ? "invoice-1" : init.entityId;
  const entityType = init.entityType ?? "Invoice";
  const fields = init.fields ?? ["status"];
  return {
    name: init.name ?? "update_invoice",
    description: "Update an invoice",
    inputSchema: schemaFor(entityType, fields),
    writeCapable: true,
    ...(init.omitExecute === true ? {} : { execute: init.execute ?? refuseExecute }),
    ...(init.executedBy === undefined ? {} : { executedBy: init.executedBy }),
    ...(init.hostedMcp === undefined ? {} : { hostedMcp: init.hostedMcp }),
    ...(init.omitOperation === true
      ? {}
      : {
          operation: (args: WriteArgs): Operation =>
            entityId === null
              ? { kind: "create", entityType, entityId: null, fields: Object.keys(args) }
              : { kind: "update", entityType, entityId, fields: Object.keys(args) },
        }),
  };
}

/** A read-only tool that returns whatever `execute` returns. */
export function readTool(
  execute: (args: WriteArgs, ctx: TurnContext) => Promise<string> | string,
  name = "search_invoices",
): ToolDefinition<WriteArgs, string> {
  return {
    name,
    description: "Search invoices",
    inputSchema: schemaFor("Invoice", ["query"]),
    writeCapable: false,
    execute,
  };
}

// ---------------------------------------------------------------------------
// A wired gate
// ---------------------------------------------------------------------------

/** What {@link harness} lets a test vary. Everything else is a safe default. */
export interface HarnessInit {
  readonly store?: DocketStore;
  readonly inferred?: { readonly [name: string]: StructuredField };
  /** A whole inference port, for a fixture that needs the answer to depend on the turn. */
  readonly inference?: InferencePort;
  readonly previousValues?: Record<string, unknown> | null;
  readonly policies?: readonly ApprovalPolicy[];
  readonly interceptors?: readonly FieldInterceptor[];
  readonly riskScore?: number;
  readonly defaultTtlMs?: number;
  readonly clock?: StubClock;
  readonly trace?: Trace;
  readonly uncovered?: readonly (readonly [string, UncoveredCategory])[];
}

/** A gate, its store, its clock, its telemetry log and the step trace. */
export interface Harness {
  readonly gate: Gate;
  readonly store: DocketStore;
  readonly clock: StubClock;
  readonly telemetry: TelemetryLog;
  readonly trace: Trace;
}

/** A gate wired from stubs, with everything a fixture needs to look at afterwards. */
export function harness(init: HarnessInit = {}): Harness {
  const trace = init.trace ?? [];
  const clock = init.clock ?? stubClock();
  const telemetry = telemetryLog();
  const store = init.store ?? new InMemoryDocketStore({ clock });
  const options: GateOptions = {
    store,
    inference:
      init.inference ??
      inferencePort(init.inferred ?? { status: structured("Active", "literal", 0.9) }, trace),
    projection: projectionPort(init.previousValues ?? null, trace),
    authorization: permissiveAuthorization,
    policies: init.policies ?? [],
    interceptors: init.interceptors ?? [],
    clock,
    telemetry: telemetry.port,
    defaultTtlMs: init.defaultTtlMs ?? 30 * 60 * 1000,
    ...(init.riskScore === undefined ? {} : { riskScorer: riskScorer(init.riskScore, trace) }),
  };
  const gate = createGate(options);
  for (const [name, category] of init.uncovered ?? []) {
    gate.declareUncovered({ name }, category);
  }
  return { gate, store, clock, telemetry, trace };
}

/** `at` plus `ms`, as an ISO instant — the deadline GT-4 stamps. */
export function plus(at: string, ms: number): string {
  return new Date(Date.parse(at) + ms).toISOString();
}
