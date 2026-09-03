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
 * interfaces, the error-code registry (CV-1) and the telemetry-key registry (TL-1).
 * The Affidavit model, the canonical form, the Docket stores, the pipeline and the
 * decision path land in the pull requests named in each module's header.
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
