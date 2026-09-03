/**
 * `@affiant/contract` — the Affiant wire format as TypeScript types.
 *
 * Affiant turns every database write an LLM agent proposes into an **Affidavit**:
 * a per-field evidence record carrying the proposed value, the value it replaces,
 * where each value came from and how confident the producer is. An Affidavit is
 * filed under a **Docket** entry and shown to a person as an **Evidence Card**,
 * which they approve, amend or reject before the host commits anything.
 *
 * Every type here is hand-written to be faithful to one JSON Schema at one pinned
 * tag of the protocol rulebook, {@link https://github.com/Sakwala/affiant-protocol}.
 * The schemas themselves are vendored under `protocol/` and importable as objects
 * from `@affiant/contract/schemas`; the tag is in `protocol/PIN`.
 *
 * Two rules govern the shapes below, and both come from the schemas rather than
 * from taste:
 *
 * - **Absent means `null`, never `undefined`.** The wire spells an absent optional
 *   value as an explicit `null`, so no property here is optional.
 * - **Arrays are never null.** Where the schema says an array is not nullable, an
 *   empty array is what an empty collection looks like.
 *
 * @packageDocumentation
 */

/**
 * The protocol tag this package is pinned to — the git tag on
 * `Sakwala/affiant-protocol` whose schemas and fixtures are vendored under
 * `protocol/`, without its leading `v`.
 */
export const PROTOCOL_VERSION = "0.0.1-seed" as const;

/**
 * Any value JSON can carry — and nothing else.
 *
 * Used wherever a schema applies no type constraint but still lists the property
 * as `required`. `unknown` would be wrong there: it admits `undefined`,
 * `JSON.stringify` drops a key whose value is `undefined`, and the payload then
 * fails the schema's `required` at the far end of a network hop. `JsonValue`
 * permits every JSON value, `null` included, and refuses `undefined`.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Protocol core
// ---------------------------------------------------------------------------

/**
 * Where a field value came from.
 *
 * Serialized as the member name, not an integer. The order of the union is the
 * determinism hierarchy, most deterministic first: when two provenance tags carry
 * equal confidence, the earlier member wins the merge.
 *
 * Schema: `schemas/provenance-source.schema.json`.
 */
export type ProvenanceSource =
  "UserStated" | "External" | "Computed" | "Conversation" | "Inferred" | "Default" | "Empty";

/**
 * Every {@link ProvenanceSource} value, in the determinism order the schema
 * defines. Pinned as data so a runtime check can use the same list the schema does.
 */
export const PROVENANCE_SOURCES = [
  "UserStated",
  "External",
  "Computed",
  "Conversation",
  "Inferred",
  "Default",
  "Empty",
] as const satisfies readonly ProvenanceSource[];

/** Narrows an arbitrary value to a {@link ProvenanceSource}. */
export function isProvenanceSource(value: unknown): value is ProvenanceSource {
  return typeof value === "string" && (PROVENANCE_SOURCES as readonly string[]).includes(value);
}

/**
 * One provenance record for one field value: where the value came from, how
 * confident the producer is in it, a human-readable explanation, and which
 * conversation turn produced it.
 *
 * A field whose provenance is unknown carries a tag with source `"Empty"` rather
 * than no tag at all — the absence of evidence is itself recorded evidence.
 *
 * Schema: `schemas/provenance-tag.schema.json`.
 */
export interface ProvenanceTag {
  /** Where the value came from. */
  source: ProvenanceSource;
  /** Confidence in the value, `0.0` to `1.0`. Never null. */
  confidence: number;
  /**
   * Human-readable explanation of how the value was obtained, e.g.
   * `"User stated: Status"`. `null` when there is nothing to say.
   */
  evidence: string | null;
  /**
   * Index of the conversation turn that produced the value, or `null` when the
   * value did not come from a turn.
   */
  conversationTurn: number | null;
}

/**
 * The ordered provenance history of a single field: the tag in force now, plus
 * every superseded tag, newest first. This is the audit trail that answers "how
 * did this field arrive at its current value?".
 *
 * Schema: `schemas/provenance-chain.schema.json`.
 */
export interface ProvenanceChain {
  /** The tag in force for this field's current value. */
  current: ProvenanceTag;
  /**
   * Superseded tags, newest first. Empty for a chain that has never been merged
   * or appended to. Never null.
   */
  prior: readonly ProvenanceTag[];
}

/**
 * How a reviewer surface should render a field. A plain string on the wire, not a
 * serialized enum, but drawn from a fixed set.
 *
 * Schema: the `kind` property of `schemas/affidavit-field.schema.json`.
 */
export type AffidavitFieldKind = "text" | "number" | "date" | "enum";

/** Every {@link AffidavitFieldKind} value. */
export const AFFIDAVIT_FIELD_KINDS = [
  "text",
  "number",
  "date",
  "enum",
] as const satisfies readonly AffidavitFieldKind[];

/**
 * One sworn field inside an {@link Affidavit}: the proposed value, the value it
 * replaces, and the full provenance chain behind it.
 *
 * Schema: `schemas/affidavit-field.schema.json`.
 */
export interface AffidavitField {
  /** The field's name on the target entity. Also the key the amendment maps use. */
  name: string;
  /**
   * The proposed value. Any JSON value, including `null` — the wire applies no
   * type constraint here, so a consumer must narrow before using it. Not
   * `undefined`: the key is required, and a key whose value is `undefined` does
   * not survive `JSON.stringify`.
   */
  value: JsonValue;
  /**
   * The value being replaced. Any JSON value, including `null`; `null` for a
   * create operation, and also for a field that had no previous value. Not
   * `undefined`, for the same reason as {@link AffidavitField.value}.
   */
  previousValue: JsonValue;
  /** The provenance chain behind {@link AffidavitField.value}. */
  provenance: ProvenanceChain;
  /** Whether the target entity requires this field. */
  isMandatory: boolean;
  /** Rendering hint for a reviewer surface. */
  kind: AffidavitFieldKind;
  /** The closed set a reviewer may pick from when {@link AffidavitField.kind} is `"enum"`; `null` otherwise. */
  allowedValues: readonly string[] | null;
  /** A regular expression the value must satisfy, or `null` when unconstrained. */
  pattern: string | null;
}

/**
 * The sworn evidence record for one proposed write.
 *
 * Every write an agent proposes — create, update or delete — is wrapped in one of
 * these, carrying per-field provenance, before any person sees it and before
 * anything is committed.
 *
 * Schema: `schemas/affidavit.schema.json`.
 */
export interface Affidavit {
  /**
   * The operation being proposed, named by the host's own operation vocabulary
   * (e.g. `"WriteUpdate"`). An open string, not a closed set, at this tag.
   */
  operationType: string;
  /** The kind of domain entity being written, named by the host. */
  entityType: string;
  /**
   * The identifier of the entity being written; `null` for a create operation,
   * where no identifier exists yet.
   */
  entityId: string | null;
  /** The sworn fields. Never null — an empty array is what no fields looks like. */
  fields: readonly AffidavitField[];
  /** Confidence across the whole affidavit, `0.0` to `1.0`. Never null. */
  aggregateConfidence: number;
  /** Human-readable warnings a reviewer should see. Never null. */
  warnings: readonly string[];
  /** Whether a person must confirm this write before it commits. */
  requiresConfirmation: boolean;
}

/**
 * A map of reviewer amendments, keyed by {@link AffidavitField.name}.
 *
 * A `null` under a key means the reviewer explicitly cleared that field, which is
 * distinct from the key being absent — and distinct from `undefined`, which is
 * not a JSON value and would vanish on serialization.
 */
export type AmendmentMap = { readonly [fieldName: string]: JsonValue };

/**
 * The envelope that carries an {@link Affidavit} to a reviewer surface: the docket
 * entry it is filed under, the affidavit itself, the deadline, and — on a
 * resubmission — the amendments already made on the expired original.
 *
 * A producer may send the same request for the same `docketId` more than once; a
 * consumer must treat a repeat as the same card, updating in place rather than
 * adding a second one.
 *
 * Schema: `schemas/evidence-card-request.schema.json`.
 */
export interface EvidenceCardRequest {
  /** The docket entry this card is filed under. A UUID string. */
  docketId: string;
  /** The affidavit awaiting a decision. */
  affidavit: Affidavit;
  /** When the review window closes. An RFC 3339 date-time with an explicit offset. */
  requiredBy: string;
  /**
   * Set only when this card resubmits a review that expired: the amendments a
   * reviewer made on the original entry, so the next reviewer can see what was
   * already agreed. `null` for a first filing.
   */
  priorAmendments: AmendmentMap | null;
}

/**
 * Sent when a pending docket entry is approaching its deadline.
 *
 * A producer re-sends this on every sweep while the entry stays inside the warning
 * window, so a consumer must treat repeats for the same `docketId` as idempotent —
 * key a countdown off {@link DocketExpiringNotification.expiresAt} rather than
 * counting notifications.
 *
 * Schema: `schemas/docket-expiring.schema.json`.
 */
export interface DocketExpiringNotification {
  /** The docket entry approaching expiry. A UUID string. */
  docketId: string;
  /** When the entry expires. An RFC 3339 date-time with an explicit offset. */
  expiresAt: string;
}

/**
 * Sent when a pending docket entry has lapsed without a reviewer decision. The
 * write it carried is not committed.
 *
 * Schema: `schemas/docket-expired.schema.json`.
 */
export interface DocketExpiredNotification {
  /** The docket entry that expired. A UUID string. */
  docketId: string;
}

// ---------------------------------------------------------------------------
// Host and transport vocabulary
//
// The shapes below are NOT protocol core. They are how one shipped host talks to
// its own client, recorded in the protocol's conformance fixtures as reference
// shapes. They carry no schema at tag v0.0.1-seed, so nothing validates them; a
// different host is free to use a different vocabulary. They are typed here
// because their closed string sets are pinned in the protocol's
// `conformance/fixtures/enum-values.json`, and a TypeScript host that speaks to a
// .NET host over the same hub benefits from having them named.
// ---------------------------------------------------------------------------

/**
 * What became of a review.
 *
 * Host vocabulary, not protocol core. Pinned set:
 * `enum-values.json → actionDecisionResultOutcome`.
 */
export type ActionDecisionOutcome = "approved" | "rejected" | "expired" | "resubmitted";

/** Every {@link ActionDecisionOutcome} value. */
export const ACTION_DECISION_OUTCOMES = [
  "approved",
  "rejected",
  "expired",
  "resubmitted",
] as const satisfies readonly ActionDecisionOutcome[];

/**
 * How a host tells its own client what became of a review it was showing.
 *
 * Host/transport shape, not protocol core: no schema at tag `v0.0.1-seed`.
 * Fixture: `wire/action-decision-result`.
 */
export interface ActionDecisionResult {
  /** The review this outcome belongs to. A UUID string. */
  actionId: string;
  /** What became of it. */
  outcome: ActionDecisionOutcome;
  /** Whether the reviewer's amendments survived the outcome. */
  amendmentsPreserved: boolean;
}

/**
 * The status a host's action-status query returns per docket entry.
 *
 * Host vocabulary, not protocol core. Pinned set:
 * `enum-values.json → getActionStatusesValue`. No wire fixture at tag
 * `v0.0.1-seed`.
 */
export type ActionStatus =
  "pending" | "approved" | "rejected" | "expired" | "resubmitted" | "unknown";

/** Every {@link ActionStatus} value. */
export const ACTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "resubmitted",
  "unknown",
] as const satisfies readonly ActionStatus[];

/**
 * How a host tells a reconnecting client how many reviews are still waiting.
 *
 * Host/transport shape, not protocol core: no schema at tag `v0.0.1-seed`.
 * Fixture: `wire/session-rehydrated`.
 */
export interface SessionRehydrated {
  /** How many docket entries are still awaiting a decision. */
  pendingDocketCount: number;
}

/**
 * Severity of a transient message to a UI.
 *
 * Host vocabulary, not protocol core. Pinned set:
 * `enum-values.json → systemNotificationLevel`.
 */
export type SystemNotificationLevel = "error" | "warning" | "info";

/** Every {@link SystemNotificationLevel} value. */
export const SYSTEM_NOTIFICATION_LEVELS = [
  "error",
  "warning",
  "info",
] as const satisfies readonly SystemNotificationLevel[];

/**
 * A transient message for a UI to show.
 *
 * Host/transport shape, not protocol core: no schema at tag `v0.0.1-seed`.
 * Fixture: `wire/system-notification`.
 */
export interface SystemNotification {
  /** Severity. */
  level: SystemNotificationLevel;
  /** The message to show. */
  message: string;
}

/**
 * One step of a UI walkthrough, naming its target element by the element's
 * registered semantic id rather than by a CSS selector.
 *
 * Host/transport shape, not protocol core: no schema at tag `v0.0.1-seed`.
 */
export interface UiGuidanceStep {
  /** The registered semantic id of the element this step points at. */
  elementId: string;
  /** The step's heading. */
  title: string;
  /** The step's body text. */
  description: string;
  /** A value to pre-fill into the element, or `null` for none. */
  prefillValue: string | null;
  /**
   * Which side of the element the step's callout sits on, named by the host
   * surface's own vocabulary (`"top"`, `"bottom"`, …). An open string at this tag.
   */
  side: string;
  /** Extra padding around the element's highlight, in pixels, or `null` for the default. */
  highlightPadding: number | null;
}

/**
 * A UI walkthrough: a route to navigate to and an ordered list of steps.
 *
 * Host/transport shape, not protocol core: no schema at tag `v0.0.1-seed`. Its
 * meaning stays with the host surface that renders it.
 * Fixture: `wire/guide-ui`.
 */
export interface UiGuidance {
  /** The route to navigate to before the walkthrough starts. */
  navigateTo: string;
  /** The steps, in order. */
  steps: readonly UiGuidanceStep[];
  /** Why the walkthrough was offered, in the host's own words. */
  context: string;
}
