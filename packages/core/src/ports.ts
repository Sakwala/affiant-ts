/**
 * The ports a host supplies. Types only — this module has no runtime behaviour
 * beyond {@link defaultClock}.
 *
 * **Rules served: GT-1** (the pipeline runs in protocol order, and every step it
 * cannot do itself is a port), **GT-5** (a Standing Order that declares a risk
 * threshold is compared against a host-supplied scorer), **AZ-2** (decision
 * authorization is the host's answer, and the gate fails closed on it), **CV-1**
 * (a port the gate needs and does not have is a wire-up failure, not a runtime
 * surprise), **GT-2** (every port method that needs to know who is asking is
 * handed the {@link TurnContext}; none of them may go looking).
 *
 * The shape of this file is the framework's central claim: **the core ships no
 * model client, no scoring formula, no executor and no store.** It decides *what
 * must be sworn to and who must agree*, and it asks the host for everything else.
 * That is what lets one gate sit in front of any model, any database and any
 * approval surface — and it is why a host cannot accidentally end up with a gate
 * that scores its own risk or executes its own writes.
 *
 * @packageDocumentation
 */

import type { Principal, TurnContext, Turn } from "./context.js";
import type { DocketEntry } from "./docket/entry.js";
import type { Affidavit } from "./model/affidavit.js";
import type { InterceptorBinding } from "./model/provenance.js";

export type { TelemetryPort, TelemetryEvent, TelemetryAttributes } from "./telemetry.js";

/**
 * The bindings a deterministic interceptor may mint, re-exported from the model.
 *
 * The type lives in `model/provenance.ts` with the other four binding kinds (PV-2);
 * it is re-exported here because an interceptor is a port, and a host writing one
 * should not have to know which module the binding came from.
 */
export type { InterceptorBinding };

// ---------------------------------------------------------------------------
// What the gate is being asked to swear to
// ---------------------------------------------------------------------------

/**
 * The write being proposed, named the way the host names it.
 *
 * `create` carries no `entityId` because none exists yet; `update` always carries
 * one. That is the distinction the projection step turns into `previousValue:
 * null` on every field of a create (AF-3), so it is spelled as a discriminated
 * union rather than a nullable string a caller could get wrong.
 */
export type Operation =
  | {
      /** A new entity. */
      readonly kind: "create";
      /** The kind of domain entity being written, named by the host. */
      readonly entityType: string;
      /** Always `null` for a create — no identifier exists yet. */
      readonly entityId: null;
      /** The names of the fields being proposed. */
      readonly fields: readonly string[];
    }
  | {
      /** An existing entity. */
      readonly kind: "update";
      /** The kind of domain entity being written, named by the host. */
      readonly entityType: string;
      /** The identifier of the entity being written. Never `null` for an update. */
      readonly entityId: string;
      /** The names of the fields being proposed. */
      readonly fields: readonly string[];
    };

/**
 * What a single field is, as far as the inference port needs to know: enough to ask
 * a model for a value and to reject one that does not fit.
 *
 * `kind` is the wire's rendering hint, reused here so the description a model is
 * given and the control a reviewer sees cannot drift apart.
 */
export interface FieldSchemaEntry {
  /** The field's name on the target entity. The key everything else is keyed by. */
  readonly name: string;
  /** What sort of value this is. */
  readonly kind: "text" | "number" | "date" | "enum";
  /** What the field means, for the model and for the reviewer. `null` when the name says it. */
  readonly description: string | null;
  /** Whether the target entity requires the field. */
  readonly required: boolean;
  /** The closed set a value must come from when {@link FieldSchemaEntry.kind} is `"enum"`; `null` otherwise. */
  readonly allowedValues: readonly string[] | null;
}

/** The fields one inference call is asked to fill, and the entity they belong to. */
export interface FieldSchema {
  /** The kind of domain entity being written. */
  readonly entityType: string;
  /** The fields to extract, in the order the host declared them. */
  readonly fields: readonly FieldSchemaEntry[];
}

/** Where in the utterance a value was found, as character offsets into {@link Turn.utterance}. */
export interface UtteranceSpan {
  /** Inclusive start offset. */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
}

/** One field an inference port filled in. */
export interface StructuredField {
  /** The extracted value. Any JSON value, including `null`. */
  readonly value: unknown;
  /**
   * How confident the port is, `0.0` to `1.0`. The pipeline clamps whatever
   * arrives into that range rather than trusting it (PV-1).
   */
  readonly confidence: number;
  /**
   * Whether the value is literally present in the utterance (`"literal"`, tagged
   * `Conversation`) or was reasoned to (`"inferred"`, tagged `Inferred`). The
   * distinction is provenance, not confidence: a reviewer reads them differently.
   */
  readonly presence: "literal" | "inferred";
  /**
   * Where in the utterance the value was found, when the port can say. `null` when
   * it cannot — the pipeline then records the tag without an `utterance-span`
   * binding rather than inventing offsets.
   */
  readonly utteranceSpan: UtteranceSpan | null;
}

/** What one inference call returns: the fields it could fill, keyed by name. */
export interface StructuredResult {
  /** The filled fields. A field the port could not fill is absent, not `null`. */
  readonly fields: { readonly [fieldName: string]: StructuredField };
}

// ---------------------------------------------------------------------------
// The ports
// ---------------------------------------------------------------------------

/**
 * One tool-free structured extraction over the unmodified turn.
 *
 * "Tool-free" is the point: the gate asks the model for *values*, never for an
 * action, so nothing the model returns can execute. The host owns the model
 * client, the prompt and the cost.
 */
export interface InferencePort {
  /**
   * Extract `schema`'s fields from `turn`, verbatim as the host received it.
   *
   * @param turn   The turn, unmodified — same object as `ctx.turn`.
   * @param schema The fields to fill.
   */
  infer(turn: Turn, schema: FieldSchema): Promise<StructuredResult>;
}

/**
 * What the target entity holds *now*, so the Affidavit can swear to what a write
 * would replace rather than only to what it would set.
 *
 * The gate never reads the host's database itself; a card that shows "was £40,
 * becomes £4,000" only exists because the host answered this.
 */
export interface ProjectionPort {
  /**
   * The current values of `op.fields` on the entity `op` names.
   *
   * @returns A map keyed by field name, or `null` when there is nothing to project
   *          — a create, or an entity that no longer exists. A field the host
   *          cannot supply is absent from the map, which is not the same as `null`
   *          under its key (`null` means "the field is currently empty").
   */
  previousValues(op: Operation, ctx: TurnContext): Promise<Record<string, unknown> | null>;
}

/**
 * Whether this principal may decide this entry. The host's answer, and the gate
 * fails closed on it (AZ-2).
 *
 * The gate has already refused an unresolved principal and a cross-tenant entry
 * before it asks; this port answers the host's own question — role, ownership,
 * separation of duties. A port that throws is a refusal, never an approval.
 */
export interface AuthorizationPort {
  /** Whether `principal` may decide `entry`. */
  mayDecide(principal: Principal, entry: DocketEntry): Promise<boolean>;
}

/**
 * How risky this write is, on the host's own scale.
 *
 * There is no default formula, deliberately: a number the framework invented would
 * be compared against a threshold the operator chose, and the operator would have
 * no way to know what they had agreed to. A policy that declares a threshold with
 * no scorer wired is a wire-up failure (`wireup-invalid`, CV-1), not a policy that
 * quietly never fires.
 */
export interface RiskScorer {
  /** Score `affidavit`. The scale is the host's; the policy's threshold is on the same scale (GT-5). */
  score(affidavit: Affidavit, ctx: TurnContext): Promise<number>;
}

/**
 * Where "now" comes from.
 *
 * A port rather than a call to `Date.now()` inside the gate, for two reasons: a
 * fixture has to be able to pin an expiry to the millisecond, and the core owns no
 * timer of its own (DK-3) — expiry is state the host sweeps, not a callback the
 * gate schedules.
 */
export interface Clock {
  /** The current instant, as an ISO 8601 string in UTC. */
  now(): string;
}

/**
 * The clock used when a host supplies none: the Web-standard `Date`, formatted as
 * an ISO 8601 instant in UTC.
 *
 * `Date` and `toISOString` are ECMAScript, present on Node, Bun and workerd alike
 * (RT-1). No Node API, no timer, no interval — one reading, on demand.
 */
export const defaultClock: Clock = {
  now(): string {
    return new Date().toISOString();
  },
};

// ---------------------------------------------------------------------------
// Deterministic field resolution
// ---------------------------------------------------------------------------

/**
 * The binding that makes a deterministic value checkable: which external record or
 * computation the value came from.
 *
 * PV-4 is why it is mandatory on an {@link InterceptedField} rather than optional:
 * a Standing Order — an approval with no person present — is honoured only if every
 * provenance input the policy declares carries a binding. An `External` value with
 * no binding is a claim nobody can re-derive, so a policy that would auto-approve
 * on it falls back to asking a person.
 *
 * {@link InterceptorBinding} is the two-kind restriction of the model's `Binding`
 * union: `external-ref` (a system of record) and `computation-ref` (a named,
 * re-runnable rule). The other three kinds all point at something a *person* did,
 * and PV-3 forbids a machine from minting those.
 */

/** One field a {@link FieldInterceptor} resolved. */
export interface InterceptedField {
  /** The resolved value. */
  readonly value: unknown;
  /**
   * Where it came from. Only these two: **PV-3** forbids an interceptor from
   * minting `UserStated`, because a machine may not put words in a person's mouth.
   */
  readonly source: "External" | "Computed";
  /** How to check the value. Never absent (PV-4). */
  readonly binding: InterceptorBinding;
  /**
   * How confident the interceptor is, `0.0` to `1.0`. A deterministic resolver
   * normally says `1`; the merge step clamps whatever arrives (PV-1).
   */
  readonly confidence: number;
  /** A human-readable line for the reviewer, or `null`. */
  readonly evidence: string | null;
}

/** The fields one interceptor resolved, keyed by field name. */
export type InterceptedFields = { readonly [fieldName: string]: InterceptedField };

/**
 * A host-supplied resolver that fills fields deterministically, before any model is
 * asked (GT-1 step 2).
 *
 * Interceptors run first because a value read from a system of record beats a value
 * a model guessed, and running them first means the model is never asked for
 * something the host already knows.
 */
export interface FieldInterceptor {
  /** A name for the record and for telemetry. */
  readonly name: string;
  /**
   * Resolve whichever of `op.fields` this interceptor can. Returning `{}` is normal
   * — an interceptor that has nothing to say says nothing.
   */
  resolve(op: Operation, ctx: TurnContext): Promise<InterceptedFields> | InterceptedFields;
}
