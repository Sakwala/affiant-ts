/**
 * `@affiant/core/testing` — the declarative fixture format, the runner that
 * executes it against a real gate, and the stub ports a fixture is wired from.
 *
 * ## What a fixture is
 *
 * One JSON document describing **a wiring, a sequence of acts, and what must be
 * true afterwards**:
 *
 * ```jsonc
 * {
 *   "id": "gate/standing-order-by-the-book",
 *   "rules": ["GT-5", "AZ-1"],
 *   "title": "A Standing Order with no threshold fires on the verdict alone",
 *   "given": {
 *     "clock": "2026-09-04T09:00:00.000Z",
 *     "gate": { "defaultTtlMs": 1800000, "authorization": { "allow": ["*"] } },
 *     "ctx": { "tenantId": "tenant-a", "conversationId": "conv-1", "channel": "chat" },
 *     "prior": [],
 *     "step": { "kind": "file", "toolName": "capture", "operation": { … } }
 *   },
 *   "expect": { "entry": { "status": "approved" } }
 * }
 * ```
 *
 * **One shape for every rule.** The gate's whole surface is reachable from
 * {@link FixtureStep} — `wrap-execute`, `file`, `decide`, `resubmit`,
 * `markExecuted`, `expireDue`, `get`, `rehydrate` — so a fixture about a decision
 * and a fixture about a filing differ in their steps, not in their format. A single
 * format is what lets one runner serve three consumers: this package's own suites,
 * a host checking its ports against the reference behaviour, and the conformance
 * driver that will run the same documents against a second implementation.
 *
 * ## What the expectations are, and what they are not
 *
 * Every expectation is a **partial** matcher: a fixture states the facts its rule is
 * about and says nothing about the rest, so an unrelated addition to `DocketEntry`
 * does not break thirty documents. What a fixture may not do is state something the
 * implementation computed for it — every value in a fixture is authored, and the
 * generator that mirrors these files into a TypeScript module computes nothing.
 *
 * ## Reading the results
 *
 * {@link runFixture} never throws for a failed expectation: it returns a
 * {@link FixtureResult} carrying every failure it found, each with the path it was
 * found at and the two values. A suite turns that into one assertion; a conformance
 * driver turns the same structure into a parity manifest naming what an
 * implementation does not yet pass. A runner that threw on the first mismatch could
 * do neither.
 *
 * @packageDocumentation
 */

import type { Principal, TurnContext } from "./context.js";
import type {
  Attestor,
  BlockedMarker,
  DocketEntry,
  ExecutionOutcome,
  RequirementKind,
} from "./docket/entry.js";
import { readStatus } from "./docket/entry.js";
import { InMemoryDocketStore, InMemorySessionStore } from "./docket/memory.js";
import type { DocketStore, Page, Scope } from "./docket/store.js";
import { isAffiantError } from "./errors.js";
import type { UncoveredCategory } from "./gate/coverage.js";
import type { Decision } from "./gate/decide.js";
import type { Gate, GateOptions, WriteProposal } from "./gate/gate.js";
import { createGate } from "./gate/gate.js";
import type { EvidenceCardRequest, FiledEntry, PreparedField } from "./gate/pipeline.js";
import type { ApprovalPolicy, Verdict } from "./gate/policy.js";
import type { Affidavit, JsonValue } from "./model/affidavit.js";
import type { AmendmentMap } from "./model/amendments.js";
import { canonicalHash } from "./model/canonical.js";
import type { Binding, ProvenanceSource } from "./model/provenance.js";
import { chainOf, mintTag } from "./model/provenance.js";
import type {
  AuthorizationPort,
  Clock,
  FieldInterceptor,
  FieldSchema,
  InferencePort,
  InterceptorBinding,
  Operation,
  ProjectionPort,
  RiskScorer,
  StructuredField,
} from "./ports.js";
import type { TelemetryEvent, TelemetryPort } from "./telemetry.js";

// ---------------------------------------------------------------------------
// The fixture document
// ---------------------------------------------------------------------------

/** One declarative fixture: what to wire, what to do, and what must then be true. */
export interface Fixture {
  /** A stable id, unique across the set. Never renamed — a parity manifest cites it. */
  readonly id: string;
  /** The rulebook ids this fixture checks. At least one. */
  readonly rules: readonly string[];
  /** What the fixture asserts, in a sentence a reviewer can read without the JSON. */
  readonly title: string;
  /** The wiring, the acts and the context they happen in. */
  readonly given: FixtureGiven;
  /** What must be true afterwards. Every clause optional; a fixture states its own rule. */
  readonly expect: FixtureExpectation;
}

/** The wiring and the acts. */
export interface FixtureGiven {
  /** How the gate is built. */
  readonly gate: FixtureGate;
  /** Which reference store to file into. Only the in-memory one exists at v0.1. */
  readonly store?: "memory";
  /** The instant the clock starts at. Every step may move it forward. */
  readonly clock: string;
  /** The turn every step runs in, unless the step overrides part of it. */
  readonly ctx: FixtureContext;
  /** Acts performed before the one under test. Their refusals are declared inline. */
  readonly prior?: readonly FixtureStep[];
  /** The act under test. {@link FixtureExpectation.error} is about this one. */
  readonly step: FixtureStep;
}

/** Everything `createGate` is given. */
export interface FixtureGate {
  /** The approval chain, in order (AZ-4). */
  readonly policies?: readonly FixturePolicy[];
  /** What the host's risk function returns, or `null` for no scorer wired (GT-5). */
  readonly riskScorer?: number | null;
  /** Deterministic resolvers (PV-2, GT-1 step 2). */
  readonly interceptors?: readonly FixtureInterceptor[];
  /** The deadline applied when neither the verdict nor the policy names one (GT-4). */
  readonly defaultTtlMs: number;
  /** Who may decide (AZ-2). */
  readonly authorization: FixtureAuthorization;
  /** What the host's inference reports, keyed by field name (GT-1 step 3). */
  readonly inference?: { readonly [fieldName: string]: FixtureInferredField } | null;
  /**
   * What the host's entities hold now, keyed `"<entityType>/<entityId>"` (AF-3).
   *
   * The projection port reads this table, so a fixture states the world rather than
   * the answer: an update names an entity, and the previous values are whatever the
   * table says that entity holds. An entity that is not in the table does not exist,
   * and the port answers `null`.
   */
  readonly entities?: { readonly [entityKey: string]: { readonly [field: string]: JsonValue } };
  /** Tools the host declared it cannot intercept (CV-4). */
  readonly uncovered?: readonly { readonly tool: string; readonly category: UncoveredCategory }[];
  /** Whether a rehydration surface is wired (DK-5). Defaults to `true`. */
  readonly sessions?: boolean;
}

/**
 * The host's answer to "may this principal act on this entry" (AZ-2).
 *
 * An allowlist of principal ids, `"*"` admitting everyone. `throws` makes the port
 * fall over instead of answering, which the gate must read as a refusal.
 */
export interface FixtureAuthorization {
  /** Principal ids admitted. `"*"` admits every principal. */
  readonly allow: readonly string[];
  /** Whether the port throws rather than answering. */
  readonly throws?: boolean;
}

/** One field the scripted inference port reports. */
export interface FixtureInferredField {
  /** The extracted value. */
  readonly value: JsonValue;
  /** How confident the port claims to be. Clamped by the pipeline (PV-1). */
  readonly confidence: number;
  /** Literally present in the turn (`Conversation`) or reasoned to (`Inferred`). */
  readonly presence: "literal" | "inferred";
  /** Where in the utterance, when the port can say. */
  readonly utteranceSpan?: { readonly start: number; readonly end: number } | null;
}

/** One deterministic resolver (PV-2). */
export interface FixtureInterceptor {
  /** A name for the record. */
  readonly name: string;
  /** The fields it resolves, keyed by field name. */
  readonly fields: {
    readonly [fieldName: string]: {
      readonly value: JsonValue;
      readonly source: "External" | "Computed";
      readonly confidence: number;
      readonly binding: InterceptorBinding;
      readonly evidence?: string | null;
    };
  };
}

/** One approval policy, as a fixture states it. */
export interface FixturePolicy {
  /** The host's id, written into a Standing Order attestation (AZ-1). */
  readonly id: string;
  /** The version that is speaking. */
  readonly version: string;
  /** The provenance sources it predicates on (PV-4). */
  readonly declaredInputs?: readonly ProvenanceSource[];
  /** Whether any verdict it can return names a threshold (GT-5, CV-1). */
  readonly declaresThreshold?: boolean;
  /** Its own default deadline (GT-4). */
  readonly defaultTtlMs?: number | null;
  /** What it says, or `null` for no opinion. */
  readonly verdict: Verdict | null;
}

/** The turn every step runs in. */
export interface FixtureContext {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly channel: string;
  /** The principal, or `null` for an unresolved identity (AZ-2). */
  readonly principal?: FixturePrincipal | null;
  readonly utterance?: string;
  readonly messageId?: string;
}

/** A principal, as a fixture states it. Structurally the core's own {@link Principal}. */
export type FixturePrincipal = Principal;

/** A field the host has already tagged, for a capture whose provenance is settled. */
export interface FixturePreparedField {
  readonly name: string;
  readonly kind: "text" | "number" | "date" | "enum";
  readonly value: JsonValue;
  readonly isMandatory?: boolean;
  /** The tag in force, or absent for "proposed, provenance unknown" (AF-1). */
  readonly provenance?: {
    readonly source: ProvenanceSource;
    readonly confidence: number;
    readonly binding?: Binding | null;
    readonly note?: string | null;
  } | null;
}

/** A tool definition, as a `wrap-execute` step states it. */
export interface FixtureTool {
  readonly name: string;
  readonly description?: string;
  readonly entityType: string;
  /** `null` for a create-shaped tool. */
  readonly entityId?: string | null;
  readonly writeCapable?: boolean;
  readonly executedBy?: "host" | "provider";
  readonly hostedMcp?: boolean;
  /** Whether the tool carries no `execute` at all — the `no-execute` category (CV-4). */
  readonly omitExecute?: boolean;
  /** The host's own verb, carried onto the card. */
  readonly operationLabel?: string;
  /** The fields the tool declares, with their reviewer-facing shape. */
  readonly fields: readonly {
    readonly name: string;
    readonly kind: "text" | "number" | "date" | "enum";
    readonly description?: string | null;
    readonly required?: boolean;
    readonly allowedValues?: readonly string[] | null;
    readonly pattern?: string | null;
  }[];
}

/** What every step may say about when it happens and who performs it. */
interface StepCommon {
  /** A label later steps and expectations can name this step's entry by. */
  readonly as?: string;
  /** Moves the clock before the step runs. Defaults to wherever the clock is. */
  readonly at?: string;
  /** The principal for this step, overriding the fixture's. `null` is unresolved. */
  readonly principal?: FixturePrincipal | null;
  /** The tenant this step is performed from, when it is not the fixture's (AZ-2). */
  readonly tenantId?: string;
  /** The conversation this step is performed in, when it is not the fixture's (GT-2). */
  readonly conversationId?: string;
  /** The entry this step acts on: a label from `as`, or the last one filed. */
  readonly entry?: string;
  /**
   * The refusal code this step is expected to produce, for a step in `prior`.
   *
   * Declared on the step rather than in a parallel array so a reader sees the refusal
   * beside the act that caused it. The step under test states its refusal in
   * {@link FixtureExpectation.error} instead.
   */
  readonly refusal?: string | null;
}

/** One act on the gate. */
export type FixtureStep =
  | (StepCommon & {
      /** Sequence A's way in: a model calls a wrapped tool (GT-6, CV-4). */
      readonly kind: "wrap-execute";
      readonly tool: FixtureTool;
      readonly args: { readonly [field: string]: JsonValue };
    })
  | (StepCommon & {
      /** Sequence C's way in: a capture the host assembled (GT-1). */
      readonly kind: "file";
      readonly toolName: string;
      readonly operation: Operation;
      readonly schema?: FixtureTool["fields"] | null;
      readonly preparedFields?: readonly FixturePreparedField[] | null;
      readonly args?: JsonValue;
      readonly operationLabel?: string | null;
    })
  | (StepCommon & {
      /** Approve, amend or reject (DK-1, AZ-1, AZ-2). */
      readonly kind: "decide";
      readonly decision: {
        readonly kind: "approve" | "reject";
        readonly amendments?: AmendmentMap | null;
        readonly reason?: string | null;
      };
    })
  | (StepCommon & {
      /** File an expired entry again (DK-1). */
      readonly kind: "resubmit";
    })
  | (StepCommon & {
      /** Report what the host's executor did (DK-1, AZ-5, AZ-7). */
      readonly kind: "markExecuted";
      readonly outcome: Exclude<ExecutionOutcome, "unexecuted">;
      readonly detail?: string | null;
    })
  | (StepCommon & {
      /** The host-scheduled sweep (DK-3). */
      readonly kind: "expireDue";
      readonly limit: number;
      readonly scope?: { readonly tenantId?: string; readonly conversationId?: string };
    })
  | (StepCommon & {
      /** Read the entry as it stands, with expiry applied (DK-1). */
      readonly kind: "get";
    })
  | (StepCommon & {
      /** One page of what a reconnecting client needs (DK-5). */
      readonly kind: "rehydrate";
      readonly page: { readonly limit: number; readonly cursor?: string | null };
      readonly scope?: { readonly tenantId?: string; readonly conversationId?: string };
    });

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

/** What must be true after the step under test. Every clause is optional. */
export interface FixtureExpectation {
  /** The refusal the step under test must produce, or `null`/absent for none. */
  readonly error?: { readonly code: string; readonly messageContains?: string } | null;
  /** The row the step acted on, or the row it filed. */
  readonly entry?: EntryExpectation | null;
  /** The Evidence Card a filing produced. */
  readonly card?: CardExpectation | null;
  /** The row a `resubmit` superseded. */
  readonly superseded?: EntryExpectation | null;
  /** Telemetry keys that must have been emitted at some point (TL-1). */
  readonly telemetry?: readonly string[] | null;
  /** Telemetry keys that must **never** have been emitted. */
  readonly telemetryAbsent?: readonly string[] | null;
  /** What the Docket holds afterwards. */
  readonly store?: {
    readonly count?: number;
    readonly pending?: number;
    readonly approvedUnexecuted?: number;
  } | null;
  /** What an `expireDue` step reported (DK-3). */
  readonly expired?: { readonly count?: number; readonly more?: boolean } | null;
  /** What a `rehydrate` step returned (DK-5). */
  readonly page?: {
    readonly count?: number;
    readonly more?: boolean;
    readonly statuses?: readonly string[];
  } | null;
  /** Whether the row a `get` step read was found. */
  readonly found?: boolean;
}

/** A partial matcher over a Docket row. */
export interface EntryExpectation {
  readonly status?: string;
  readonly execution?: string | null;
  readonly requirement?: RequirementKind;
  readonly blocked?: BlockedMarker | null;
  readonly toolName?: string;
  readonly channel?: string;
  readonly tenantId?: string;
  readonly conversationId?: string;
  /** The attestor as it must read (AZ-1, AZ-3), or `null` for no attestation. */
  readonly attestation?: Attestor | null;
  readonly decision?: { readonly kind: string; readonly reason: string | null } | null;
  readonly amendments?: AmendmentMap | null;
  readonly preservedAmendments?: {
    readonly amendments: AmendmentMap;
    readonly at: string;
    readonly by: string;
  } | null;
  /** `supersedes` / `supersededBy`, where `"@filed"` means "the entry this step filed". */
  readonly lineage?: {
    readonly supersedes?: string | null;
    readonly supersededBy?: string | null;
  };
  /** The deadline, as milliseconds after the instant the entry was filed (GT-4). */
  readonly expiresAtOffsetMs?: number;
  /** The Affidavit as proposed — never edited by a decision (DK-4). */
  readonly affidavit?: AffidavitExpectation;
  /** The state an accepted amendment produced, or `null` while none has (AF-4). */
  readonly amendedAffidavit?: AffidavitExpectation | null;
  /**
   * Whether the row's canonical form differs from its proposal's (SR-1).
   *
   * `true` is the substitution guard: a grant minted over the Affidavit a reviewer
   * was shown must not validate the one they amended.
   */
  readonly canonicalDiffersFromProposal?: boolean;
}

/** A partial matcher over an Affidavit. */
export interface AffidavitExpectation {
  readonly operationType?: "create" | "update";
  readonly entityType?: string;
  readonly entityId?: string | null;
  readonly aggregateConfidence?: number;
  readonly populatedConfidence?: number | null;
  readonly emptyFieldCount?: number;
  /** The fields, in order. Stating this asserts the field list exactly (AF-1). */
  readonly fields?: readonly FieldExpectation[];
}

/** A partial matcher over one sworn field. */
export interface FieldExpectation {
  readonly name: string;
  readonly value?: JsonValue;
  readonly previousValue?: JsonValue | null;
  readonly kind?: string;
  readonly isMandatory?: boolean;
  /** The grade in force. */
  readonly source?: ProvenanceSource;
  /** Whether the tag in force points at something checkable (PV-2, PV-4). */
  readonly bound?: boolean;
  /** The kind of binding, when the fixture is about which one. */
  readonly bindingKind?: string | null;
  readonly confidence?: number;
  /** The grades the chain displaced, newest first. */
  readonly priorSources?: readonly ProvenanceSource[];
}

/** A partial matcher over an Evidence Card. */
export interface CardExpectation {
  readonly requiresConfirmation?: boolean;
  readonly warningsContain?: readonly string[];
  readonly priorAmendments?: AmendmentMap | null;
  readonly blocked?: BlockedMarker | null;
  readonly protocolVersion?: string;
  readonly aggregateConfidence?: number;
  readonly populatedConfidence?: number | null;
  readonly emptyFieldCount?: number;
  /** The reviewer-facing shape of each field, in order (the typed-input rule). */
  readonly fields?: readonly {
    readonly name: string;
    readonly kind?: string;
    readonly value?: JsonValue;
    readonly allowedValues?: readonly string[] | null;
    readonly pattern?: string | null;
    readonly isMandatory?: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One thing a fixture expected that the gate did not do. */
export interface FixtureFailure {
  /** Where, as a dotted path into the expectation — `"entry.status"`, `"card.fields[1].kind"`. */
  readonly at: string;
  /** What the fixture said. */
  readonly expected: unknown;
  /** What the gate did. */
  readonly actual: unknown;
}

/** What running one fixture produced. */
export interface FixtureResult {
  readonly id: string;
  readonly rules: readonly string[];
  readonly title: string;
  /** `true` when `failures` is empty. */
  readonly pass: boolean;
  readonly failures: readonly FixtureFailure[];
}

/** What running a set of fixtures produced. */
export interface FixtureRunResult {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly FixtureResult[];
  /** The ids that failed, for a parity manifest. */
  readonly failedIds: readonly string[];
}

// ---------------------------------------------------------------------------
// The stub ports
// ---------------------------------------------------------------------------

/** A {@link Clock} a fixture drives by hand. */
export interface FixtureClock extends Clock {
  /** Move the clock to `instant`. */
  set(instant: string): void;
}

/** A {@link Clock} that reads `start` until a step moves it. */
export function fixedClock(start: string): FixtureClock {
  let current = start;
  return {
    now: () => current,
    set: (instant) => {
      current = instant;
    },
  };
}

/**
 * An {@link InferencePort} that reports exactly what the fixture scripted, for every
 * turn.
 *
 * Scripted rather than computed: the gate's contract is that it asks the host for
 * values and tags whatever it gets, so a fixture that also decided *how* the values
 * were found would be testing a model the framework does not ship.
 */
export function scriptedInference(
  fields: { readonly [fieldName: string]: FixtureInferredField } | null,
): InferencePort {
  const scripted: Record<string, StructuredField> = {};
  for (const [name, field] of Object.entries(fields ?? {})) {
    scripted[name] = {
      value: field.value,
      confidence: field.confidence,
      presence: field.presence,
      utteranceSpan: field.utteranceSpan ?? null,
    };
  }
  return {
    async infer() {
      return { fields: scripted };
    },
  };
}

/**
 * A {@link ProjectionPort} reading the fixture's entity table (AF-3).
 *
 * An entity the table does not name does not exist, and the port answers `null` —
 * which the pipeline treats as "nothing to project", not as "every field was empty".
 */
export function entityProjection(entities: FixtureGate["entities"]): ProjectionPort {
  const table = entities ?? {};
  return {
    async previousValues(op: Operation) {
      if (op.kind !== "update") return null;
      const row = table[`${op.entityType}/${op.entityId}`];
      if (row === undefined) return null;
      const previous: Record<string, JsonValue> = {};
      for (const name of op.fields) {
        if (Object.hasOwn(row, name)) previous[name] = row[name] as JsonValue;
      }
      return previous;
    },
  };
}

/**
 * An {@link AuthorizationPort} over an allowlist of principal ids (AZ-2).
 *
 * `"*"` admits everyone. A port configured to throw is the AZ-2 case that matters
 * most: the gate must read a port that fell over as a refusal, never as an approval.
 */
export function allowlistAuthorization(config: FixtureAuthorization): AuthorizationPort {
  const allowed = new Set(config.allow);
  return {
    async mayDecide(principal: Principal) {
      if (config.throws === true) throw new Error("the host's directory is unavailable");
      return allowed.has("*") || allowed.has(principal.id);
    },
  };
}

/** A {@link RiskScorer} that always returns `score` (GT-5). */
export function fixedRiskScorer(score: number): RiskScorer {
  return {
    async score() {
      return score;
    },
  };
}

/** The ports a fixture is wired from. Every one has a default; a driver may replace any. */
export interface FixturePorts {
  /** The Docket. Defaults to the in-memory reference store. */
  readonly store?: (clock: Clock) => DocketStore;
  readonly inference?: (fixture: Fixture) => InferencePort;
  readonly projection?: (fixture: Fixture) => ProjectionPort;
  readonly authorization?: (fixture: Fixture) => AuthorizationPort;
  readonly clock?: (fixture: Fixture) => FixtureClock;
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

/** What one step did, kept so the expectations can look at it. */
interface StepOutcome {
  readonly code: string | null;
  readonly message: string | null;
  readonly filed: FiledEntry | null;
  readonly entryId: string | null;
  readonly read: DocketEntry | null;
  readonly expired: { readonly expired: readonly string[]; readonly more: boolean } | null;
  readonly page: { readonly items: readonly DocketEntry[]; readonly more: boolean } | null;
}

/**
 * Run `fixture` against a real gate and report what it did.
 *
 * Never throws for a failed expectation — see the module note. It **does** propagate
 * a `RangeError` or a `TypeError`, because those are programming errors in the
 * fixture or in a port, not behaviours a rule is about, and swallowing them into a
 * failure list would hide a broken document behind a red test.
 */
export async function runFixture(
  fixture: Fixture,
  ports: FixturePorts = {},
): Promise<FixtureResult> {
  const failures: FixtureFailure[] = [];
  const given = fixture.given;

  const clock = (ports.clock ?? ((f: Fixture) => fixedClock(f.given.clock)))(fixture);
  const store = (ports.store ?? ((c: Clock) => new InMemoryDocketStore({ clock: c })))(clock);
  const events: TelemetryEvent[] = [];
  const telemetry: TelemetryPort = {
    emit(event) {
      events.push(event);
    },
  };

  // A wiring the gate refuses is a rule (CV-1), so it has to be expressible as a
  // fixture: the refusal is reported exactly as a refusal from the step would be,
  // and nothing after it runs, because there is no gate to run it on.
  let gate: Gate;
  try {
    gate = buildGate(fixture, { clock, store, telemetry, ports });
  } catch (error) {
    if (!isAffiantError(error)) throw error;
    return wireUpRefusal(fixture, error.code, error.message, events);
  }

  const labelled = new Map<string, string>();
  let lastFiled: string | null = null;
  const supersededIds: string[] = [];

  const runOne = async (step: FixtureStep, where: string): Promise<StepOutcome> => {
    if (step.at !== undefined) clock.set(step.at);
    const target = step.entry === undefined ? lastFiled : (labelled.get(step.entry) ?? step.entry);
    const outcome = await performStep(step, {
      gate,
      store,
      fixture,
      clock,
      target,
    });
    if (outcome.filed !== null) {
      lastFiled = outcome.filed.entry.entryId;
      if (step.as !== undefined) labelled.set(step.as, lastFiled);
      const supersedes = outcome.filed.entry.lineage.supersedes;
      if (supersedes !== null) supersededIds.push(supersedes);
    } else if (outcome.entryId !== null && step.as !== undefined) {
      labelled.set(step.as, outcome.entryId);
    }
    const expectedRefusal = step.refusal ?? null;
    if (where !== "step" && expectedRefusal !== outcome.code) {
      failures.push({ at: `${where}.refusal`, expected: expectedRefusal, actual: outcome.code });
    }
    return outcome;
  };

  const priors = given.prior ?? [];
  for (const [index, step] of priors.entries()) {
    await runOne(step, `prior[${String(index)}]`);
  }
  const final = await runOne(given.step, "step");

  // ---- the refusal (or the absence of one) --------------------------------
  const expectedError = fixture.expect.error ?? null;
  if (expectedError === null) {
    if (final.code !== null) {
      failures.push({ at: "error", expected: null, actual: `${final.code}: ${final.message}` });
    }
  } else {
    if (final.code !== expectedError.code) {
      failures.push({
        at: "error.code",
        expected: expectedError.code,
        actual: final.code === null ? "no refusal" : `${final.code}: ${final.message}`,
      });
    }
    const phrase = expectedError.messageContains;
    if (phrase !== undefined && !(final.message ?? "").includes(phrase)) {
      failures.push({ at: "error.message", expected: phrase, actual: final.message });
    }
  }

  // ---- the row ------------------------------------------------------------
  const scope: Scope = { tenantId: given.ctx.tenantId };
  const targetId = final.filed?.entry.entryId ?? final.entryId ?? lastFiled;
  const row = final.read ?? (targetId === null ? null : await store.get(targetId, scope));

  if (fixture.expect.found !== undefined) {
    if ((row !== null) !== fixture.expect.found) {
      failures.push({ at: "found", expected: fixture.expect.found, actual: row !== null });
    }
  }

  const entryExpectation = fixture.expect.entry ?? null;
  if (entryExpectation !== null) {
    if (row === null) {
      failures.push({ at: "entry", expected: "a Docket row", actual: null });
    } else {
      await checkEntry(row, entryExpectation, clock.now(), failures, "entry");
    }
  }

  const supersededExpectation = fixture.expect.superseded ?? null;
  if (supersededExpectation !== null) {
    const supersededId = supersededIds[supersededIds.length - 1];
    const superseded = supersededId === undefined ? null : await store.get(supersededId, scope);
    if (superseded === null) {
      failures.push({ at: "superseded", expected: "a superseded Docket row", actual: null });
    } else {
      await checkEntry(superseded, supersededExpectation, clock.now(), failures, "superseded");
    }
  }

  // ---- the card -----------------------------------------------------------
  // Checked on every filing, stated or not: these hold for every card the gate ever
  // produces, and a fixture that had to repeat them would be a fixture that stops
  // being about its own rule.
  if (final.filed !== null) checkCardInvariants(final.filed, failures);

  const cardExpectation = fixture.expect.card ?? null;
  if (cardExpectation !== null) {
    if (final.filed === null) {
      failures.push({ at: "card", expected: "an Evidence Card", actual: null });
    } else {
      checkCard(final.filed.card, cardExpectation, failures);
    }
  }

  // ---- telemetry, the store, the sweep, the page --------------------------
  const emitted = events.map((event) => String(event.key));
  for (const key of fixture.expect.telemetry ?? []) {
    if (!emitted.includes(key)) {
      failures.push({ at: `telemetry.${key}`, expected: "emitted", actual: emitted });
    }
  }
  for (const key of fixture.expect.telemetryAbsent ?? []) {
    if (emitted.includes(key)) {
      failures.push({ at: `telemetryAbsent.${key}`, expected: "never emitted", actual: emitted });
    }
  }

  const storeExpectation = fixture.expect.store ?? null;
  if (storeExpectation !== null) {
    const all = await drain(store, scope);
    compare("store.count", storeExpectation.count, all.length, failures);
    const now = clock.now();
    compare(
      "store.pending",
      storeExpectation.pending,
      all.filter((entry) => readStatus(entry, now) === "pending").length,
      failures,
    );
    compare(
      "store.approvedUnexecuted",
      storeExpectation.approvedUnexecuted,
      all.filter(
        (entry) => readStatus(entry, now) === "approved" && entry.execution === "unexecuted",
      ).length,
      failures,
    );
  }

  const expiredExpectation = fixture.expect.expired ?? null;
  if (expiredExpectation !== null) {
    compare("expired.count", expiredExpectation.count, final.expired?.expired.length, failures);
    compare("expired.more", expiredExpectation.more, final.expired?.more, failures);
  }

  const pageExpectation = fixture.expect.page ?? null;
  if (pageExpectation !== null) {
    compare("page.count", pageExpectation.count, final.page?.items.length, failures);
    compare("page.more", pageExpectation.more, final.page?.more, failures);
    if (pageExpectation.statuses !== undefined) {
      const now = clock.now();
      compare(
        "page.statuses",
        pageExpectation.statuses,
        (final.page?.items ?? []).map((entry) => readStatus(entry, now)),
        failures,
      );
    }
  }

  return {
    id: fixture.id,
    rules: fixture.rules,
    title: fixture.title,
    pass: failures.length === 0,
    failures,
  };
}

/**
 * The result for a fixture whose *wiring* was refused (CV-1).
 *
 * Reported through the same `expect.error` clause a step's refusal is, because to a
 * host the two are the same event with different timing — and the timing is the
 * point of CV-1: a misconfiguration the framework can detect fails when the gate is
 * built, not on the unlucky request that first reaches the broken branch.
 */
function wireUpRefusal(
  fixture: Fixture,
  code: string,
  message: string,
  events: readonly TelemetryEvent[],
): FixtureResult {
  const failures: FixtureFailure[] = [];
  const expected = fixture.expect.error ?? null;
  if (expected === null) {
    failures.push({ at: "error", expected: null, actual: `${code}: ${message}` });
  } else {
    compare("error.code", expected.code, code, failures);
    if (expected.messageContains !== undefined && !message.includes(expected.messageContains)) {
      failures.push({ at: "error.message", expected: expected.messageContains, actual: message });
    }
  }
  const emitted = events.map((event) => String(event.key));
  for (const key of fixture.expect.telemetry ?? []) {
    if (!emitted.includes(key)) {
      failures.push({ at: `telemetry.${key}`, expected: "emitted", actual: emitted });
    }
  }
  if ((fixture.expect.store?.count ?? 0) !== 0) {
    failures.push({ at: "store.count", expected: fixture.expect.store?.count, actual: 0 });
  }
  return {
    id: fixture.id,
    rules: fixture.rules,
    title: fixture.title,
    pass: failures.length === 0,
    failures,
  };
}

/**
 * Run every fixture and summarise.
 *
 * Takes the documents rather than a directory: this module runs inside workerd and
 * under Bun as well as on Node, and none of those three read a directory the same
 * way. A caller that has files loads them and passes them here.
 */
export async function runFixtureDir(
  fixtures: readonly Fixture[],
  ports: FixturePorts = {},
): Promise<FixtureRunResult> {
  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runFixture(fixture, ports));
  }
  const failed = results.filter((result) => !result.pass);
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    failedIds: failed.map((result) => result.id),
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/** Build the gate a fixture describes. Refusals at wire-up are the caller's to catch. */
function buildGate(
  fixture: Fixture,
  deps: {
    readonly clock: FixtureClock;
    readonly store: DocketStore;
    readonly telemetry: TelemetryPort;
    readonly ports: FixturePorts;
  },
): Gate {
  const given = fixture.given.gate;
  const options: GateOptions = {
    store: deps.store,
    inference: (
      deps.ports.inference ?? ((f: Fixture) => scriptedInference(f.given.gate.inference ?? null))
    )(fixture),
    projection: (
      deps.ports.projection ?? ((f: Fixture) => entityProjection(f.given.gate.entities))
    )(fixture),
    authorization: (
      deps.ports.authorization ??
      ((f: Fixture) => allowlistAuthorization(f.given.gate.authorization))
    )(fixture),
    policies: (given.policies ?? []).map(policyOf),
    interceptors: (given.interceptors ?? []).map(interceptorOf),
    clock: deps.clock,
    telemetry: deps.telemetry,
    defaultTtlMs: given.defaultTtlMs,
    ...(given.sessions === false ? {} : { sessions: new InMemorySessionStore(deps.store) }),
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
function policyOf(fixture: FixturePolicy): ApprovalPolicy {
  return {
    id: fixture.id,
    version: fixture.version,
    declaredInputs: fixture.declaredInputs ?? [],
    ...(fixture.declaresThreshold === undefined
      ? {}
      : { declaresThreshold: fixture.declaresThreshold }),
    ...(fixture.defaultTtlMs === undefined || fixture.defaultTtlMs === null
      ? {}
      : { defaultTtlMs: fixture.defaultTtlMs }),
    async evaluate() {
      return fixture.verdict;
    },
  };
}

/** A {@link FieldInterceptor} that resolves the fixture's fields for every operation. */
function interceptorOf(fixture: FixtureInterceptor): FieldInterceptor {
  return {
    name: fixture.name,
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
      for (const [name, field] of Object.entries(fixture.fields)) {
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

/** The turn a step runs in (GT-2): explicit in every property, nothing ambient. */
function contextOf(fixture: Fixture, step: FixtureStep, at: string): TurnContext {
  const ctx = fixture.given.ctx;
  const principal = step.principal === undefined ? (ctx.principal ?? null) : step.principal;
  return {
    tenantId: step.tenantId ?? ctx.tenantId,
    conversationId: step.conversationId ?? ctx.conversationId,
    channel: ctx.channel,
    principal,
    turn: {
      utterance: ctx.utterance ?? "",
      messageId: ctx.messageId ?? "msg-1",
      at,
    },
  };
}

/** The prepared fields a `file` step describes, with their tags minted at `at`. */
function preparedOf(fields: readonly FixturePreparedField[], at: string): PreparedField[] {
  return fields.map((field) => ({
    name: field.name,
    kind: field.kind,
    value: field.value,
    ...(field.isMandatory === undefined ? {} : { isMandatory: field.isMandatory }),
    ...(field.provenance === undefined || field.provenance === null
      ? {}
      : {
          provenance: chainOf(
            mintTag({
              source: field.provenance.source,
              confidence: field.provenance.confidence,
              at,
              note: field.provenance.note ?? null,
              binding: field.provenance.binding ?? null,
            }),
          ),
        }),
  }));
}

/** The field schema a tool or a `file` step declares. */
function schemaOf(entityType: string, fields: FixtureTool["fields"]): FieldSchema {
  return {
    entityType,
    fields: fields.map((field) => ({
      name: field.name,
      kind: field.kind,
      description: field.description ?? null,
      required: field.required ?? false,
      allowedValues: field.allowedValues ?? null,
      pattern: field.pattern ?? null,
    })),
  };
}

/** The empty outcome every step starts from. */
const NOTHING: StepOutcome = {
  code: null,
  message: null,
  filed: null,
  entryId: null,
  read: null,
  expired: null,
  page: null,
};

/** Perform one step, turning a refusal into a code rather than letting it escape. */
async function performStep(
  step: FixtureStep,
  deps: {
    readonly gate: Gate;
    readonly store: DocketStore;
    readonly fixture: Fixture;
    readonly clock: FixtureClock;
    readonly target: string | null;
  },
): Promise<StepOutcome> {
  const at = deps.clock.now();
  const ctx = contextOf(deps.fixture, step, at);
  try {
    switch (step.kind) {
      case "wrap-execute": {
        const tool = step.tool;
        const entityId = tool.entityId === undefined ? null : tool.entityId;
        const wrapped = deps.gate.wrap<{ readonly [field: string]: JsonValue }, string>(
          {
            name: tool.name,
            description: tool.description ?? tool.name,
            inputSchema: schemaOf(tool.entityType, tool.fields),
            writeCapable: tool.writeCapable ?? true,
            ...(tool.omitExecute === true
              ? {}
              : {
                  execute: (): never => {
                    throw new Error("GT-6: the gate called a write tool's own execute");
                  },
                }),
            ...(tool.executedBy === undefined ? {} : { executedBy: tool.executedBy }),
            ...(tool.hostedMcp === undefined ? {} : { hostedMcp: tool.hostedMcp }),
            ...(tool.operationLabel === undefined ? {} : { operationLabel: tool.operationLabel }),
            operation: (args): Operation =>
              entityId === null
                ? {
                    kind: "create",
                    entityType: tool.entityType,
                    entityId: null,
                    fields: Object.keys(args),
                  }
                : {
                    kind: "update",
                    entityType: tool.entityType,
                    entityId,
                    fields: Object.keys(args),
                  },
          },
          ctx,
        );
        const result = await wrapped.execute(step.args);
        if (result.kind === "error") {
          return { ...NOTHING, code: result.code, message: result.message };
        }
        if (result.kind === "read") return NOTHING;
        const filed = await deps.store.get(result.entryId, { tenantId: ctx.tenantId });
        return {
          ...NOTHING,
          entryId: result.entryId,
          read: filed,
          filed: filed === null ? null : { entry: filed, created: true, card: result.card },
        };
      }
      case "file": {
        const proposal: WriteProposal = {
          operation: step.operation,
          toolName: step.toolName,
          ...(step.args === undefined ? {} : { args: step.args }),
          ...(step.preparedFields === undefined || step.preparedFields === null
            ? {}
            : { fields: preparedOf(step.preparedFields, at) }),
          ...(step.schema === undefined || step.schema === null
            ? {}
            : { schema: schemaOf(step.operation.entityType, step.schema) }),
          ...(step.operationLabel === undefined || step.operationLabel === null
            ? {}
            : { operationLabel: step.operationLabel }),
        };
        const filed = await deps.gate.file(proposal, ctx);
        return { ...NOTHING, filed, entryId: filed.entry.entryId };
      }
      case "decide": {
        const id = requireTarget(deps.target, step.kind);
        const stated = step.decision;
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
        const entry = await deps.gate.decide(id, decision, ctx);
        return { ...NOTHING, entryId: id, read: entry };
      }
      case "resubmit": {
        const id = requireTarget(deps.target, step.kind);
        const filed = await deps.gate.resubmit(id, ctx);
        return { ...NOTHING, filed, entryId: filed.entry.entryId };
      }
      case "markExecuted": {
        const id = requireTarget(deps.target, step.kind);
        const entry = await deps.gate.markExecuted(id, step.outcome, step.detail ?? null, ctx);
        return { ...NOTHING, entryId: id, read: entry };
      }
      case "expireDue": {
        const scope: Scope = {
          tenantId: step.scope?.tenantId ?? ctx.tenantId,
          ...(step.scope?.conversationId === undefined
            ? {}
            : { conversationId: step.scope.conversationId }),
        };
        const expired = await deps.gate.expireDue(at, scope, step.limit);
        return { ...NOTHING, expired };
      }
      case "get": {
        const id = requireTarget(deps.target, step.kind);
        const entry = await deps.gate.get(id, ctx);
        return { ...NOTHING, entryId: id, read: entry };
      }
      case "rehydrate": {
        const scope: Scope = {
          tenantId: step.scope?.tenantId ?? ctx.tenantId,
          ...(step.scope?.conversationId === undefined
            ? {}
            : { conversationId: step.scope.conversationId }),
        };
        const page: Page = {
          limit: step.page.limit,
          ...(step.page.cursor === undefined || step.page.cursor === null
            ? {}
            : { cursor: step.page.cursor }),
        };
        const result = await deps.gate.rehydrate(scope, page);
        return { ...NOTHING, page: { items: result.items, more: result.more } };
      }
    }
  } catch (error) {
    if (isAffiantError(error)) {
      return { ...NOTHING, code: error.code, message: error.message };
    }
    throw error;
  }
}

/** The entry a step acts on, or a fixture bug. */
function requireTarget(target: string | null, kind: string): string {
  if (target !== null) return target;
  throw new RangeError(
    `fixture step ${JSON.stringify(kind)} names no entry and nothing has been filed; ` +
      `give the step an \`entry\` label or file something in \`prior\` first`,
  );
}

/** Everything the Docket holds in `scope`, in filing order. */
async function drain(store: DocketStore, scope: Scope): Promise<DocketEntry[]> {
  const all: DocketEntry[] = [];
  for await (const entry of store.export(scope)) all.push(entry);
  return all;
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/** Record a failure when `expected` is stated and differs from `actual`. */
function compare(at: string, expected: unknown, actual: unknown, failures: FixtureFailure[]): void {
  if (expected === undefined) return;
  if (!deepEqual(expected, actual)) failures.push({ at, expected, actual });
}

/** Structural equality over the JSON values a fixture can state. */
function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => deepEqual(item, right[i]));
  }
  const leftKeys = Object.keys(left as object);
  const rightKeys = Object.keys(right as object);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right as object, key) &&
      deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

/** Check a row against its partial matcher. */
async function checkEntry(
  entry: DocketEntry,
  expected: EntryExpectation,
  now: string,
  failures: FixtureFailure[],
  at: string,
): Promise<void> {
  // The status a row *reads* (DK-1), not the one it says: a row past its deadline
  // reads expired whether or not a sweep has run, and every fixture about expiry is
  // about the read.
  compare(`${at}.status`, expected.status, readStatus(entry, now), failures);
  compare(`${at}.execution`, expected.execution, entry.execution, failures);
  compare(`${at}.requirement`, expected.requirement, entry.requirement, failures);
  compare(`${at}.blocked`, expected.blocked, entry.blocked, failures);
  compare(`${at}.toolName`, expected.toolName, entry.toolName, failures);
  compare(`${at}.channel`, expected.channel, entry.channel, failures);
  compare(`${at}.tenantId`, expected.tenantId, entry.tenantId, failures);
  compare(`${at}.conversationId`, expected.conversationId, entry.conversationId, failures);
  compare(`${at}.amendments`, expected.amendments, entry.amendments, failures);
  compare(
    `${at}.preservedAmendments`,
    expected.preservedAmendments,
    entry.preservedAmendments,
    failures,
  );
  compare(`${at}.attestation`, expected.attestation, entry.attestation?.by ?? null, failures);

  if (expected.attestation != null && entry.attestation !== null) {
    // AZ-1: an attestation names the entry it attests to, or it is not evidence.
    compare(`${at}.attestation.entryId`, entry.entryId, entry.attestation.entryId, failures);
  }

  if (expected.decision !== undefined) {
    compare(
      `${at}.decision`,
      expected.decision,
      entry.decision === null ? null : { kind: entry.decision.kind, reason: entry.decision.reason },
      failures,
    );
  }

  if (expected.lineage !== undefined) {
    checkLink(
      `${at}.lineage.supersedes`,
      expected.lineage.supersedes,
      entry.lineage.supersedes,
      failures,
    );
    checkLink(
      `${at}.lineage.supersededBy`,
      expected.lineage.supersededBy,
      entry.lineage.supersededBy,
      failures,
    );
  }

  if (expected.expiresAtOffsetMs !== undefined) {
    const wanted = new Date(Date.parse(entry.filedAt) + expected.expiresAtOffsetMs).toISOString();
    compare(`${at}.expiresAt`, wanted, entry.expiresAt, failures);
  }

  if (expected.affidavit !== undefined) {
    checkAffidavit(entry.affidavit, expected.affidavit, failures, `${at}.affidavit`);
  }
  if (expected.amendedAffidavit !== undefined) {
    if (expected.amendedAffidavit === null) {
      compare(`${at}.amendedAffidavit`, null, entry.amendedAffidavit, failures);
    } else if (entry.amendedAffidavit === null) {
      failures.push({
        at: `${at}.amendedAffidavit`,
        expected: "the accepted state",
        actual: null,
      });
    } else {
      checkAffidavit(
        entry.amendedAffidavit,
        expected.amendedAffidavit,
        failures,
        `${at}.amendedAffidavit`,
      );
    }
  }

  if (expected.canonicalDiffersFromProposal !== undefined) {
    const sworn = await canonicalHash(entry.amendedAffidavit ?? entry.affidavit);
    const proposal = await canonicalHash(entry.affidavit);
    compare(
      `${at}.canonicalDiffersFromProposal`,
      expected.canonicalDiffersFromProposal,
      sworn !== proposal,
      failures,
    );
  }
}

/**
 * Check one lineage link (DK-1).
 *
 * A fixture cannot state a derived entry id — the id is a hash of the proposal — so
 * `"@some"` asserts only that the link is present, which is the fact the rule is
 * about: a resubmission names what it replaces, and the replaced row names it back.
 */
function checkLink(
  at: string,
  expected: string | null | undefined,
  actual: string | null,
  failures: FixtureFailure[],
): void {
  if (expected === undefined) return;
  if (expected === "@some") {
    if (actual === null) failures.push({ at, expected: "an entry id", actual: null });
    return;
  }
  compare(at, expected, actual, failures);
}

/** Check an Affidavit against its partial matcher. */
function checkAffidavit(
  affidavit: Affidavit,
  expected: AffidavitExpectation,
  failures: FixtureFailure[],
  at: string,
): void {
  compare(`${at}.operationType`, expected.operationType, affidavit.operationType, failures);
  compare(`${at}.entityType`, expected.entityType, affidavit.entityType, failures);
  compare(`${at}.entityId`, expected.entityId, affidavit.entityId, failures);
  compare(
    `${at}.aggregateConfidence`,
    expected.aggregateConfidence,
    affidavit.aggregateConfidence,
    failures,
  );
  compare(
    `${at}.populatedConfidence`,
    expected.populatedConfidence,
    affidavit.populatedConfidence,
    failures,
  );
  compare(`${at}.emptyFieldCount`, expected.emptyFieldCount, affidavit.emptyFieldCount, failures);

  if (expected.fields === undefined) return;
  compare(
    `${at}.fields`,
    expected.fields.map((field) => field.name),
    affidavit.fields.map((field) => field.name),
    failures,
  );
  for (const [index, wanted] of expected.fields.entries()) {
    const field = affidavit.fields.find((candidate) => candidate.name === wanted.name);
    if (field === undefined) continue;
    const path = `${at}.fields[${String(index)}]`;
    compare(`${path}.value`, wanted.value, field.value, failures);
    compare(`${path}.previousValue`, wanted.previousValue, field.previousValue, failures);
    compare(`${path}.kind`, wanted.kind, field.kind, failures);
    compare(`${path}.isMandatory`, wanted.isMandatory, field.isMandatory, failures);
    compare(`${path}.source`, wanted.source, field.provenance.current.source, failures);
    compare(`${path}.confidence`, wanted.confidence, field.provenance.current.confidence, failures);
    compare(`${path}.bound`, wanted.bound, field.provenance.current.binding != null, failures);
    compare(
      `${path}.bindingKind`,
      wanted.bindingKind,
      field.provenance.current.binding?.kind ?? null,
      failures,
    );
    compare(
      `${path}.priorSources`,
      wanted.priorSources,
      field.provenance.prior.map((tag) => tag.source),
      failures,
    );
  }
}

/**
 * The card facts that hold for every filing, whatever the fixture is about.
 *
 * - **SR-4**: the card names the protocol version the row is pinned to, and points
 *   at the row it was built from with the row's own deadline (GT-4).
 * - **AF-2**: all three confidence numbers, and all three are the *record's* — a
 *   card whose numbers were recomputed for display could disagree with the row.
 * - **AZ-4 / CV-4**: a blocked row says so on the card and never asks for a
 *   confirmation no decision path will accept.
 */
function checkCardInvariants(filed: FiledEntry, failures: FixtureFailure[]): void {
  const { entry, card } = filed;
  const sworn = entry.amendedAffidavit ?? entry.affidavit;
  compare("card.docketId", entry.entryId, card.docketId, failures);
  compare("card.requiredBy", entry.expiresAt, card.requiredBy, failures);
  compare("card.protocolVersion", entry.protocolVersion, card.protocolVersion, failures);
  compare(
    "card.affidavit.aggregateConfidence",
    sworn.aggregateConfidence,
    card.affidavit.aggregateConfidence,
    failures,
  );
  compare(
    "card.populatedConfidence",
    sworn.populatedConfidence,
    card.populatedConfidence,
    failures,
  );
  compare("card.emptyFieldCount", sworn.emptyFieldCount, card.emptyFieldCount, failures);
  compare("card.blocked", entry.blocked, card.blocked, failures);
  if (entry.blocked !== null) {
    compare("card.requiresConfirmation", false, card.affidavit.requiresConfirmation, failures);
  }
}

/** Check an Evidence Card against its partial matcher. */
function checkCard(
  card: EvidenceCardRequest,
  expected: CardExpectation,
  failures: FixtureFailure[],
): void {
  compare(
    "card.requiresConfirmation",
    expected.requiresConfirmation,
    card.affidavit.requiresConfirmation,
    failures,
  );
  compare("card.priorAmendments", expected.priorAmendments, card.priorAmendments, failures);
  compare("card.blocked", expected.blocked, card.blocked, failures);
  compare("card.protocolVersion", expected.protocolVersion, card.protocolVersion, failures);
  compare(
    "card.aggregateConfidence",
    expected.aggregateConfidence,
    card.affidavit.aggregateConfidence,
    failures,
  );
  compare(
    "card.populatedConfidence",
    expected.populatedConfidence,
    card.populatedConfidence,
    failures,
  );
  compare("card.emptyFieldCount", expected.emptyFieldCount, card.emptyFieldCount, failures);

  const warnings = card.affidavit.warnings.join(" ");
  for (const [index, phrase] of (expected.warningsContain ?? []).entries()) {
    if (!warnings.includes(phrase)) {
      failures.push({
        at: `card.warningsContain[${String(index)}]`,
        expected: phrase,
        actual: card.affidavit.warnings,
      });
    }
  }

  if (expected.fields === undefined) return;
  compare(
    "card.fields",
    expected.fields.map((field) => field.name),
    card.affidavit.fields.map((field) => field.name),
    failures,
  );
  for (const [index, wanted] of expected.fields.entries()) {
    const field = card.affidavit.fields.find((candidate) => candidate.name === wanted.name);
    if (field === undefined) continue;
    const path = `card.fields[${String(index)}]`;
    compare(`${path}.kind`, wanted.kind, field.kind, failures);
    compare(`${path}.value`, wanted.value, field.value, failures);
    compare(`${path}.allowedValues`, wanted.allowedValues, field.allowedValues, failures);
    compare(`${path}.pattern`, wanted.pattern, field.pattern, failures);
    compare(`${path}.isMandatory`, wanted.isMandatory, field.isMandatory, failures);
  }
}
