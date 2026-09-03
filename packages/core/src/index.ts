/**
 * `@affiant/core` — the Affiant gate for TypeScript.
 *
 * Affiant turns every database write an LLM agent proposes into an **Affidavit**:
 * a per-field evidence record carrying the proposed value, the value it replaces,
 * where each value came from and how confident the producer is. An Affidavit is
 * filed as a **Docket** entry and shown to a person as an **Evidence Card**, which
 * they approve, amend or reject before the host commits anything. A **Standing
 * Order** is a policy verdict that approves a write with no person present.
 *
 * This package is the gate itself. It is held equivalent to the .NET
 * implementation by the rulebook at
 * {@link https://github.com/Sakwala/affiant-protocol}: numbered invariants and a
 * shared conformance fixture suite that both implementations run.
 *
 * **What this package does not contain, by rule:** a model client, a risk-scoring
 * formula, an executor, a transport and a production store. Each is a port the host
 * supplies (see `ports.ts`), which is what lets one gate sit in front of any model,
 * any database and any approval surface.
 *
 * **What is here at `0.1.0-alpha.0`:** the turn context (GT-2), the port
 * interfaces, the error-code registry (CV-1), the telemetry-key registry (TL-1) and
 * the Affidavit model — the provenance ladder with its bindings and merge rule
 * (PV-1..PV-3, PV-5), the Affidavit and its three confidence numbers (AF-1..AF-3),
 * and amendment semantics with the recompute they force (DK-2, AF-4). The canonical
 * form, the Docket stores, the pipeline and the decision path land in the pull
 * requests named in each module's header.
 *
 * **Not on npm.** The version string exists so the conformance driver can pin it;
 * publishing waits on the public parity report and a green TypeScript conformance
 * driver.
 *
 * @packageDocumentation
 */

/** The version of this package. Not published to npm at this version. */
export const CORE_VERSION = "0.1.0-alpha.0";

/**
 * The protocol tag the wire types are pinned to, re-exported from
 * `@affiant/contract` so a host that only depends on the gate can still assert
 * which rulebook tag it is speaking.
 */
export { PROTOCOL_VERSION } from "@affiant/contract";

// --------------------------------------------------------------- turn context

export type { ChannelIdentity, Principal, RelayAssertion, Turn, TurnContext } from "./context.js";

// -------------------------------------------------------------------- errors

export { AffiantError, ERROR_CODES, ErrorCode, isAffiantError, isErrorCode } from "./errors.js";
export type { AffiantErrorDetails } from "./errors.js";

// ----------------------------------------------------------------- telemetry

export {
  isTelemetryKey,
  noopTelemetry,
  TELEMETRY_KEYS,
  TELEMETRY_REGISTRY_VERSION,
} from "./telemetry.js";
export type {
  TelemetryAttributes,
  TelemetryEvent,
  TelemetryKey,
  TelemetryKeyEntry,
  TelemetryPort,
} from "./telemetry.js";

// model
// ---------------------------------------------------------------------------
// Added by pull request C2 (`core/model`). Kept as one block so the pull requests
// that follow can append their own without fighting over this file.

export {
  AFFIDAVIT_FIELD_KINDS,
  buildAffidavit,
  computeConfidence,
  fromWire,
  isJsonValue,
  isMoney,
  toWire,
  wireCarryOf,
  withConfidence,
} from "./model/affidavit.js";
export type {
  Affidavit,
  AffidavitField,
  AffidavitFieldInput,
  AffidavitFieldKind,
  AffidavitMeta,
  ConfidenceNumbers,
  FromWireStamp,
  JsonValue,
  Money,
  WireCarry,
} from "./model/affidavit.js";

export { applyAmendments, hasAmendment, resolveAmendments } from "./model/amendments.js";
export type {
  Amendment,
  AmendmentMap,
  ResolvedAmendment,
  ReviewerAct,
} from "./model/amendments.js";

export {
  BINDING_KINDS,
  chainOf,
  determinismRank,
  emptyTag,
  isBound,
  isHonourable,
  merge,
  mintConversation,
  mintInference,
  mintInferred,
  mintTag,
  PROVENANCE_LADDER,
  requiresBinding,
  supersede,
  tagsOf,
} from "./model/provenance.js";
export type {
  Binding,
  BindingKind,
  ComputationConstantRef,
  ComputationRef,
  ExternalRef,
  FormInputRef,
  InferenceSource,
  MintInferenceOptions,
  MintTagOptions,
  ProvenanceChain,
  ProvenanceSource,
  ProvenanceTag,
  RelayRef,
  ReviewerActRef,
  UtteranceSpanRef,
} from "./model/provenance.js";

// end model
// ---------------------------------------------------------------------------

// --------------------------------------------------------------------- ports

export { defaultClock } from "./ports.js";
export type {
  AuthorizationPort,
  Clock,
  DocketEntry,
  FieldInterceptor,
  FieldSchema,
  FieldSchemaEntry,
  InferencePort,
  InterceptedField,
  InterceptedFields,
  InterceptorBinding,
  Operation,
  ProjectionPort,
  RiskScorer,
  StructuredField,
  StructuredResult,
  UtteranceSpan,
} from "./ports.js";
