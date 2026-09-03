// GENERATED FILE — DO NOT EDIT BY HAND.
// Produced by scripts/generate-telemetry-keys.mjs from telemetry-keys.json.
// To change it: edit telemetry-keys.json, then run `pnpm -C packages/core generate`.

/** One entry in the telemetry-key registry (TL-1). */
export interface TelemetryKeyEntry {
  /** The event name. Never renamed, never removed — only deprecated. */
  readonly key: string;
  /** The package version this key first shipped in. */
  readonly since: string;
  /** What the event means, in one line. */
  readonly description: string;
  /**
   * The attribute names the gate carries on this event. Filled per key by the
   * pull request that starts emitting it; OpenTelemetry's `gen_ai.*` vocabulary
   * is used where a name exists there (TL-2).
   */
  readonly attributes: readonly string[];
}

/** The version of the registry itself. */
export const TELEMETRY_REGISTRY_VERSION = "0.1.0-alpha.0";

/** Every telemetry key, in registry order. */
export const TELEMETRY_KEYS = [
  /** An Affidavit was filed as a Docket entry. Since 0.1.0-alpha.0. */
  {
    key: "affidavit.filed",
    since: "0.1.0-alpha.0",
    description: "An Affidavit was filed as a Docket entry.",
    attributes: ["gen_ai.tool.name", "gen_ai.conversation.id", "entry.id", "docket.requirement", "docket.status", "affidavit.field_count", "created"],
  },
  /** A proposal was refused before filing because it swore to nothing (GT-3). Since 0.1.0-alpha.0. */
  {
    key: "affidavit.refused.substance",
    since: "0.1.0-alpha.0",
    description: "A proposal was refused before filing because it swore to nothing (GT-3).",
    attributes: ["gen_ai.tool.name", "gen_ai.conversation.id", "affidavit.field_count", "reason"],
  },
  /** A tool the gate must cover could not be intercepted, or a tool the host declared uncovered produced a proposal (CV-4). Since 0.1.0-alpha.0. */
  {
    key: "coverage.refused",
    since: "0.1.0-alpha.0",
    description: "A tool the gate must cover could not be intercepted, or a tool the host declared uncovered produced a proposal (CV-4).",
    attributes: ["gen_ai.tool.name", "coverage.category", "phase"],
  },
  /** A Docket entry changed state (DK-1). Since 0.1.0-alpha.0. */
  {
    key: "docket.transition",
    since: "0.1.0-alpha.0",
    description: "A Docket entry changed state (DK-1).",
    attributes: ["entry.id", "gen_ai.conversation.id", "from", "to", "execution", "decision.kind", "attestation.kind", "amended"],
  },
  /** A pending Docket entry passed its expiry (DK-3). Since 0.1.0-alpha.0. */
  {
    key: "docket.expired",
    since: "0.1.0-alpha.0",
    description: "A pending Docket entry passed its expiry (DK-3).",
    attributes: ["entry.id"],
  },
  /** A decision was refused on identity grounds: no resolved principal, another tenant, or the host's authorization port said no (AZ-2). Since 0.1.0-alpha.0. */
  {
    key: "decision.unauthorized",
    since: "0.1.0-alpha.0",
    description: "A decision was refused on identity grounds: no resolved principal, another tenant, or the host's authorization port said no (AZ-2).",
    attributes: ["entry.id", "gen_ai.conversation.id", "reason", "principal.kind", "path"],
  },
  /** A Standing Order policy approved a write with no person present (AZ-1). Since 0.1.0-alpha.0. */
  {
    key: "standing-order.fired",
    since: "0.1.0-alpha.0",
    description: "A Standing Order policy approved a write with no person present (AZ-1).",
    attributes: ["policy.id", "policy.version", "entry.id", "risk.score"],
  },
  /** A Standing Order verdict was not honoured: a proposed field the entity requires had no known value (GT-5), an unbound provenance input (PV-4), or a risk score above the policy's threshold (GT-5). `blocked.reason` is the stable code to alert on - `mandatory-field-empty`, `unbound-declared-input` or `risk-above-threshold`; `reason` is the sentence the reviewer sees on the card and is free to be rephrased. Since 0.1.0-alpha.0. */
  {
    key: "standing-order.blocked",
    since: "0.1.0-alpha.0",
    description: "A Standing Order verdict was not honoured: a proposed field the entity requires had no known value (GT-5), an unbound provenance input (PV-4), or a risk score above the policy's threshold (GT-5). `blocked.reason` is the stable code to alert on - `mandatory-field-empty`, `unbound-declared-input` or `risk-above-threshold`; `reason` is the sentence the reviewer sees on the card and is free to be rephrased.",
    attributes: ["policy.id", "policy.version", "blocked.reason", "reason", "provenance.field", "provenance.source", "affidavit.empty_mandatory_fields", "risk.score", "risk.threshold"],
  },
  /** A host's approval policy broke its own contract: an unusable deadline, or an evaluate that threw (GT-4, CV-1). Since 0.1.0-alpha.0. */
  {
    key: "policy.invalid",
    since: "0.1.0-alpha.0",
    description: "A host's approval policy broke its own contract: an unusable deadline, or an evaluate that threw (GT-4, CV-1).",
    attributes: ["policy.id", "policy.version", "option", "reason"],
  },
] as const satisfies readonly TelemetryKeyEntry[];
