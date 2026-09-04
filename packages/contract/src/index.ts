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
 * ref of the protocol rulebook, {@link https://github.com/Sakwala/affiant-protocol}.
 * The schemas themselves are vendored under `protocol/` and importable as objects
 * from `@affiant/contract/schemas`; the ref is in `protocol/PIN`, and the numbered
 * rules the doc comments cite (`AF-1`, `GT-4`, `AZ-1`, …) are defined in full in
 * that repository's `INVARIANTS.md`.
 *
 * Three rules govern the shapes below, and all three come from the schemas rather
 * than from taste:
 *
 * - **Absent means `null`, never `undefined`.** The wire spells an absent optional
 *   value as an explicit `null`, so almost no property here is optional.
 * - **Arrays are never null.** Where the schema says an array is not nullable, an
 *   empty array is what an empty collection looks like.
 * - **Four places are genuinely optional**, and each is a property that is
 *   meaningful only sometimes rather than a value that is sometimes missing: the
 *   non-discriminator properties of a union arm, the three properties of an
 *   `external-ref` binding a source either supports or does not, the
 *   `computation-ref` constant, and the card envelope's two presentation slots.
 *   Nothing swears to a presentation slot, so a producer with nothing to say says
 *   nothing rather than saying `null`.
 *
 * @packageDocumentation
 */

/**
 * The protocol version this package is pinned to — the version of the wire the
 * schemas vendored under `protocol/` describe (SR-4). It is a version of the
 * **protocol**, not of this package: while the major is `0` a schema-breaking
 * change bumps the minor. A consumer refuses a payload whose major differs from
 * this and MAY warn on a newer minor it does not know.
 */
export const PROTOCOL_VERSION = "0.1.0" as const;

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
// Provenance (PV-1, PV-2)
// ---------------------------------------------------------------------------

/**
 * Where a field value came from.
 *
 * Serialized as the member name, not an integer. The order of the union is the
 * determinism hierarchy, most deterministic first: when two provenance tags carry
 * equal confidence, the earlier member wins the merge (PV-1). Read it as a claim
 * about who could re-derive the value: the person said it; a system of record
 * holds it; a named rule computes it; it was literally present in the
 * conversation; a model reasoned to it; a default filled it in; nobody knows.
 *
 * Schema: `schemas/0.1.0/provenance-source.schema.json`.
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
 * A relay that asserted a person's identity rather than authenticating them: the
 * channel a capture or a decision arrived on, and the message it arrived in.
 *
 * Schema: `schemas/0.1.0/binding.schema.json#/$defs/relayRef`.
 */
export interface RelayRef {
  /** The relay's own principal id. */
  principal: string;
  /** How the person is addressed on that channel. */
  channelIdentity: string;
  /** The message the capture or decision arrived in. */
  messageId: string;
}

/**
 * The span of the unmodified utterance a value was read from.
 *
 * Offset and length rather than a start/end pair, and a hash of the substring:
 * offsets alone rot the moment anything re-wraps or re-encodes a transcript, so
 * the hash is what lets an auditor prove the span still says what it said.
 */
export interface UtteranceSpanBinding {
  kind: "utterance-span";
  ref: {
    /** Character offset into the utterance, from `0`. */
    offset: number;
    /** Length of the span in characters. */
    length: number;
    /** Digest of the spanned substring, so the span can be checked after the fact. */
    hash: string;
  };
}

/**
 * The Docket decision that amended or prefilled the field. A reviewer's correction
 * is provenance in its own right: their act is what the new value rests on, and
 * this names the act (AF-4).
 */
export interface ReviewerActBinding {
  kind: "reviewer-act";
  ref: {
    /** The Docket entry the decision was made on. */
    entryId: string;
    /** When the decision was made. */
    decisionAt: string;
  };
}

/** The form control a person typed into, as the host's own surface names it. */
export interface FormInputBinding {
  kind: "form-input";
  ref: {
    /** The form field's name. */
    field: string;
  };
}

/**
 * The system of record an `External` value was read from.
 *
 * `system` and `recordId` are always present; the other three are present only
 * when the value's kind of source makes them checkable, and are **absent** rather
 * than `null` — a binding names what it can point at and claims nothing else.
 */
export interface ExternalRefBinding {
  kind: "external-ref";
  ref: {
    /** The source system, named the way the host names it. */
    system: string;
    /** The record within that system. A canonical URL where the system is a page with no API. */
    recordId: string;
    /** When the value was read. Present where the source is re-read rather than addressed by a stable record id. */
    fetchedAt?: string;
    /** Digest of what the source said when it was read. The companion of {@link ExternalRefBinding.ref.fetchedAt}. */
    contentHash?: string;
    /** The relay that carried the capture, when one did. */
    relay?: RelayRef;
  };
}

/**
 * The deterministic rule a `Computed` value came out of, and what it consumed. The
 * rule is re-runnable, named rather than described, and the inputs are field names
 * in the order the rule consumed them.
 */
export interface ComputationRefBinding {
  kind: "computation-ref";
  ref: {
    /** The rule's name — re-runnable, not a description. */
    rule: string;
    /** The field names the rule consumed, in order. Never null. */
    inputs: readonly string[];
    /**
     * An externally published constant the rule depends on, when there is one.
     * When a value was checked is a different fact from when the tag was written:
     * a rate table verified in March and used in September is a September tag
     * resting on a March fact, and a reviewer is entitled to see both.
     */
    constant?: {
      /** Where the constant is published. */
      source: string;
      /** The date the constant was last verified. */
      verifiedOn: string;
    };
  };
}

/**
 * What to look at to check a value (PV-2).
 *
 * A provenance tag says where a value came from; a binding points at the artifact
 * an auditor can go and check years later. The five kinds are a fixed set — a
 * binding kind nobody can enumerate is a binding nobody can audit. A tag with no
 * binding is not a lie, it is a weaker claim: a tag graded above `Conversation`
 * with no binding is recorded as claimed, but a verdict made with no person
 * present may not rest on it (PV-4, PV-5).
 *
 * Schema: `schemas/0.1.0/binding.schema.json`.
 */
export type Binding =
  | UtteranceSpanBinding
  | ReviewerActBinding
  | FormInputBinding
  | ExternalRefBinding
  | ComputationRefBinding;

/** Every {@link Binding} kind, in the schema's order. */
export const BINDING_KINDS = [
  "utterance-span",
  "reviewer-act",
  "form-input",
  "external-ref",
  "computation-ref",
] as const satisfies readonly Binding["kind"][];

/**
 * One provenance record for one field value: where the value came from, how
 * confident its producer is, a line for the reviewer, when the tag was minted,
 * which conversation turn produced it, and what to look at to check it.
 *
 * A field whose provenance is unknown carries a tag with source `"Empty"` at
 * confidence `0` rather than no tag at all — the absence of evidence is itself
 * recorded evidence (AF-1, PV-1).
 *
 * Schema: `schemas/0.1.0/provenance-tag.schema.json`.
 */
export interface ProvenanceTag {
  /** Where the value came from. */
  source: ProvenanceSource;
  /** Confidence in the value, clamped into `[0, 1]` at mint time (PV-1). An `Empty` tag always carries `0`. */
  confidence: number;
  /**
   * A human-readable line for the reviewer explaining how the value was obtained,
   * or `null` when there is nothing to say. Spelled `evidence` in the
   * `0.0.1-seed` wire; renamed because the whole record is the evidence and this
   * property is the sentence a person reads.
   */
  note: string | null;
  /** When the tag was minted. */
  at: string;
  /** Index of the conversation turn the value came from, or `null`. */
  conversationTurn: number | null;
  /**
   * What to look at to check the value, or `null` when the producer had nothing to
   * point at (PV-2). Written on every minted tag — `null` rather than omitted — so
   * a reader never has to distinguish "unbound" from "the property was left off".
   */
  binding: Binding | null;
}

/**
 * The ordered provenance history of a single field: the tag in force now, plus
 * every tag it displaced, newest first.
 *
 * Nothing is ever dropped from a chain — a merge that discarded the loser would
 * erase the fact that two producers disagreed, which is the fact a reviewer most
 * wants (PV-1, AF-4).
 *
 * Schema: `schemas/0.1.0/provenance-chain.schema.json`.
 */
export interface ProvenanceChain {
  /** The tag in force for this field's current value. */
  current: ProvenanceTag;
  /** Superseded tags, newest first. Empty on a chain that has never been merged. Never null. */
  prior: readonly ProvenanceTag[];
}

// ---------------------------------------------------------------------------
// The Affidavit (AF-1 … AF-4)
// ---------------------------------------------------------------------------

/**
 * How a reviewer surface should render a field, drawn from a fixed set. It never
 * constrains the value: the gate carries a hint and validates nothing against it.
 *
 * Schema: the `kind` property of `schemas/0.1.0/affidavit-field.schema.json`.
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
 * replaces, and the whole provenance chain behind it.
 *
 * A field the operation does not propose is **absent**; a proposed field whose
 * provenance is unknown is **present** and tagged `Empty` at confidence `0`. The
 * two are never confused, which is what makes the field list a statement of intent
 * a policy can read (AF-1).
 *
 * Presentation the reviewer surface needs but the record does not swear to — the
 * closed value set an input offers, the pattern an input is masked with — travels
 * beside the Affidavit on the card envelope, not on the field. See
 * {@link FieldPresentation}.
 *
 * Schema: `schemas/0.1.0/affidavit-field.schema.json`.
 */
export interface AffidavitField {
  /** The field's name on the target entity. Also the key the amendment maps use. */
  name: string;
  /** Rendering hint for a reviewer surface. */
  kind: AffidavitFieldKind;
  /**
   * The proposed value. Any JSON value, including `null`. A monetary value is a
   * {@link Money} object (SR-2), never a JSON number. Not `undefined`: the key is
   * required, and a key whose value is `undefined` does not survive
   * `JSON.stringify`.
   */
  value: JsonValue;
  /**
   * The stored value this replaces. `null` on a create, and also on an update
   * field the entity had no stored value for; the two are distinguished by the
   * Affidavit's `operationType`, not by the field (AF-3).
   */
  previousValue: JsonValue;
  /** Where the value came from, and everything it displaced. */
  provenance: ProvenanceChain;
  /**
   * Whether the target entity requires this field. A Standing Order is never
   * honoured while a mandatory proposed field reads `Empty` (GT-5), so this is not
   * decoration.
   */
  isMandatory: boolean;
}

/**
 * The shape of the operation an Affidavit swears to. Two in v0.1, and they are
 * shapes rather than the host's own verbs: a create names no entity and swears to
 * no previous values; an update names the entity it changes and carries a
 * `previousValue` key on every proposed field (AF-3). "Create-only" is therefore a
 * predicate a policy can test without knowing what the host calls its operations.
 *
 * Schema: `schemas/0.1.0/operation.schema.json`.
 */
export type Operation = "create" | "update";

/** Every {@link Operation} value. */
export const OPERATIONS = ["create", "update"] as const satisfies readonly Operation[];

/**
 * The sworn evidence record for one proposed write.
 *
 * Every write an agent proposes is wrapped in one of these, carrying per-field
 * provenance, before any person sees it and before anything is committed.
 *
 * The three confidence numbers are AF-2. A mean that first discards every `Empty`
 * field lets a mostly-empty Affidavit report high confidence, which is the exact
 * hole once provenance authorises writes — so `aggregateConfidence` is a
 * **minimum** with `Empty` counting as `0`.
 *
 * Schema: `schemas/0.1.0/affidavit.schema.json`.
 */
export interface Affidavit {
  /** The protocol version this record conforms to (SR-4). */
  protocolVersion: string;
  /** The shape of the operation being proposed. The host's own verb is not on the record. */
  operationType: Operation;
  /** The kind of domain entity being written, named by the host. */
  entityType: string;
  /**
   * The entity being written; `null` on a create, non-null on an update. Non-null
   * if and only if `operationType` is `"update"` — a schema cannot state that
   * correlation, and an implementation enforces it (AF-3).
   */
  entityId: string | null;
  /** The sworn fields, in the order the operation proposed them. Never null. */
  fields: readonly AffidavitField[];
  /**
   * The **minimum** confidence over every proposed field's current tag, with an
   * `Empty` field counting as `0` whatever its tag says — so it is `0` exactly
   * when some proposed field has unknown provenance (AF-2). Neither the protocol
   * nor any implementation defines a threshold on it.
   */
  aggregateConfidence: number;
  /**
   * The minimum confidence over the **non-`Empty`** proposed fields, or `null`
   * when there are none (AF-2). `null` rather than `0`: "there is nothing
   * populated to be confident about" is a different statement from "the populated
   * fields are worthless", and a card showing `0` would say the second.
   */
  populatedConfidence: number | null;
  /**
   * How many proposed fields are tagged `Empty` (AF-2). Without it a person
   * approving a card sees an aggregate of `0` and cannot tell how many fields are
   * empty or how good the populated ones are.
   */
  emptyFieldCount: number;
  /** The conversation turn the proposal was made on, or `null`. */
  conversationTurn: number | null;
  /** When the Affidavit was built. Passed in by the caller, never read from a clock inside the model. */
  createdAt: string;
}

/**
 * A monetary field value: a decimal string and an ISO 4217 alphabetic currency
 * code, never a binary float (SR-2).
 *
 * The reason is not fussiness about types. An Affidavit is a record a person
 * swears to and an auditor reads back years later; a binary float cannot represent
 * `0.10`, so a card showing `"4000.10"` and a store holding `4000.099999999999`
 * disagree about what was approved and nothing in the record says which one the
 * reviewer saw.
 *
 * Schema: `schemas/0.1.0/money.schema.json`.
 */
export interface Money {
  /** The amount as a decimal string: no exponent, no thousands separator, no symbol. */
  amount: string;
  /** The ISO 4217 alphabetic code: three uppercase ASCII letters. Never case-folded. */
  currency: string;
}

/**
 * The entity a write is about: its kind and, for an update, its identifier. Both
 * are the host's own vocabulary — the protocol never parses either.
 *
 * Schema: `schemas/0.1.0/entity-ref.schema.json`.
 */
export interface EntityRef {
  /** The kind of domain entity being written, named by the host. */
  entityType: string;
  /** The identifier of the entity; `null` for a create. */
  entityId: string | null;
}

/**
 * A map of reviewer amendments, keyed by {@link AffidavitField.name}.
 *
 * A `null` under a key means the reviewer explicitly **cleared** that field, which
 * is distinct from the key being absent — "left untouched" — and distinct from
 * `undefined`, which is not a JSON value and would vanish on serialization (DK-2).
 *
 * Schema: `schemas/0.1.0/amendments.schema.json`.
 */
export type AmendmentMap = { readonly [fieldName: string]: JsonValue };

// ---------------------------------------------------------------------------
// Refusals, coverage and blocking (CV-1, CV-4, AZ-4)
// ---------------------------------------------------------------------------

/**
 * The registry of reasons the gate refuses a request.
 *
 * The **code** is the contract and the message is for a human reading a log, so a
 * host that branches on the message is doing it wrong. An implementation MAY add
 * codes but MUST NOT reuse these names for other meanings. The order only ever
 * grows at the end: a reordering looks like a rename to a host's exhaustiveness
 * check and to a parity manifest.
 *
 * Schema: `schemas/0.1.0/error-code.schema.json`.
 */
export type ErrorCode =
  | "requirement-not-implemented"
  | "coverage-refused"
  | "substance-refused"
  | "decision-unauthorized"
  | "decision-not-pending"
  | "decision-expired"
  | "decision-lost-race"
  | "wireup-invalid"
  | "entry-not-found"
  | "execution-already-recorded";

/** Every {@link ErrorCode}, in registry order. */
export const ERROR_CODES = [
  "requirement-not-implemented",
  "coverage-refused",
  "substance-refused",
  "decision-unauthorized",
  "decision-not-pending",
  "decision-expired",
  "decision-lost-race",
  "wireup-invalid",
  "entry-not-found",
  "execution-already-recorded",
] as const satisfies readonly ErrorCode[];

/** Narrows an arbitrary value to a registered {@link ErrorCode}. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * How much agreement a write needs before it may execute — the policy chain's
 * verdict kind.
 *
 * `StandingOrder` approves with no person present; `ReviewerConfirmation` asks one
 * person; `ReferralRequired` hands the entry to a different reviewer and
 * `MultiParty` requires several, **neither of which v0.1 runs**: an implementation
 * records the level verbatim, files the entry pending with a blocked marker, and
 * never degrades it to a weaker requirement (AZ-4).
 *
 * Schema: `schemas/0.1.0/docket-entry.schema.json#/$defs/requirementKind`.
 */
export type RequirementKind =
  "StandingOrder" | "ReviewerConfirmation" | "ReferralRequired" | "MultiParty";

/** Every {@link RequirementKind} value. */
export const REQUIREMENT_KINDS = [
  "StandingOrder",
  "ReviewerConfirmation",
  "ReferralRequired",
  "MultiParty",
] as const satisfies readonly RequirementKind[];

/**
 * The category of write the gate cannot cover: a write-capable tool with no
 * `execute` to replace, a tool the model provider executes, or a hosted MCP
 * server-side write (CV-4).
 */
export type CoverageCategory = "no-execute" | "provider-executed" | "hosted-mcp";

/** Every {@link CoverageCategory} value. */
export const COVERAGE_CATEGORIES = [
  "no-execute",
  "provider-executed",
  "hosted-mcp",
] as const satisfies readonly CoverageCategory[];

/**
 * A requirement level this version recognises but does not run reached the
 * pipeline. In v0.1 those are `ReferralRequired` and `MultiParty`.
 */
export interface RequirementNotImplementedMarker {
  code: "requirement-not-implemented";
  /** The requirement level that is not implemented, recorded verbatim. */
  level: RequirementKind;
}

/**
 * A proposal came from a write-capable tool the host declared the gate cannot
 * intercept (CV-4). Its proposals are still recorded on the Docket — blocked,
 * never silently allowed to write.
 */
export interface CoverageRefusedMarker {
  code: "coverage-refused";
  /** The category the gate cannot cover. */
  category: CoverageCategory;
  /** The tool the uncovered proposal came from. */
  toolName: string;
}

/**
 * Why an entry cannot be decided even though it sits in `pending` (AZ-4, CV-4). A
 * blocked entry's card says so on its face and never claims a confirmation is
 * being awaited. Discriminated by its `code`; each code carries exactly the
 * context that code makes meaningful.
 *
 * Schema: `schemas/0.1.0/blocked.schema.json`.
 */
export type BlockedMarker = RequirementNotImplementedMarker | CoverageRefusedMarker;

// ---------------------------------------------------------------------------
// Attestation (AZ-1, AZ-3)
// ---------------------------------------------------------------------------

/** A human-verified session decided this entry. The only claim a machine caller can never make. */
export interface MemberAttestor {
  kind: "member";
  /** The host's id for the person. */
  id: string;
}

/**
 * A person decided this entry through a trusted relay — a machine caller that
 * asserted their identity rather than authenticating them. Both the person and the
 * relay are named, because the record must not read as though the person signed in
 * directly (AZ-3).
 */
export interface MemberViaRelayAttestor {
  kind: "member-via-relay";
  /** The host's id for the person the relay named. */
  memberId: string;
  /** The relay, and the message the decision arrived on. */
  relay: RelayRef;
}

/**
 * A policy approved this entry with no person present. The attestation is written
 * in the same operation that filed the entry approved — there is no window in
 * which an approved write has no attribution.
 */
export interface StandingOrderAttestor {
  kind: "standing-order";
  /** The host's id for the policy that fired. */
  policyId: string;
  /** The version of that policy, so a later reader can tell what it said at the time. */
  version: string;
}

/** Who agreed. The **mode** is the kind — there is no separate mode field for it to drift from. */
export type Attestor = MemberAttestor | MemberViaRelayAttestor | StandingOrderAttestor;

/**
 * Who agreed to a write, when, and to which entry (AZ-1). Every executed write
 * carries one: an implementation that cannot attribute a write refuses it.
 *
 * `entryId` is repeated here rather than left implicit because the attestation is
 * the fragment a host exports, signs or ships to an audit sink, and a record that
 * cannot name its own subject is not evidence.
 *
 * Schema: `schemas/0.1.0/attestation.schema.json`.
 */
export interface Attestation {
  /** Who agreed. */
  by: Attestor;
  /** When they agreed. */
  at: string;
  /** The Docket entry this attests to. */
  entryId: string;
}

/**
 * A write a host made outside the gate — an import, a migration, a backfill
 * (AZ-1).
 *
 * Deliberately a **different shape** from an {@link Attestation} and not a fourth
 * attestor kind: no export may render it in an attestation position, and a card
 * shows it as outside the guarantee. A system that quietly attributed a bulk
 * import to whoever ran it would make the attestation record worth less than the
 * paper it is not printed on.
 *
 * Schema: `schemas/0.1.0/outside-gate.schema.json`.
 */
export interface OutsideGateMarker {
  /** Why the write happened outside the gate, in the host's own words. */
  reason: string;
  /** Who recorded the fact — the operator or the process. Not an approver. */
  recordedBy: string;
  /** When the fact was recorded. */
  at: string;
}

// ---------------------------------------------------------------------------
// The Docket row (DK-1 … DK-5)
// ---------------------------------------------------------------------------

/**
 * Where an entry stands. `pending` is the only non-terminal state and it goes to
 * exactly **one** of the other three; every transition out of `pending` is a
 * guarded compare-and-set (DK-1).
 *
 * Schema: `schemas/0.1.0/docket-entry.schema.json#/$defs/status`.
 */
export type DocketStatus = "pending" | "approved" | "rejected" | "expired";

/** Every {@link DocketStatus} value. */
export const DOCKET_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const satisfies readonly DocketStatus[];

/**
 * What became of an approved write once the host's executor reported. A separate
 * axis rather than two more statuses because an approved-but-failed write and an
 * approved-and-committed one differ in what the **host** must do next, not in
 * whether the approval happened. The framework never performs the write — the only
 * path to `"executed"` is the host's report (AZ-7).
 *
 * Schema: `schemas/0.1.0/docket-entry.schema.json#/$defs/execution`.
 */
export type ExecutionOutcome = "unexecuted" | "executed" | "failed";

/** Every {@link ExecutionOutcome} value. */
export const EXECUTION_OUTCOMES = [
  "unexecuted",
  "executed",
  "failed",
] as const satisfies readonly ExecutionOutcome[];

/** What a reviewer decided, as it is recorded on the row. Amending is approving with an amendment map, not a third kind. */
export interface DecisionRecord {
  /** Approve or reject. */
  kind: "approve" | "reject";
  /** The reviewer's stated reason, or `null` when they gave none. */
  reason: string | null;
  /** When the decision was made. */
  at: string;
}

/**
 * What this entry replaces and what replaced it. A resubmission is a **new** entry,
 * never a reopened one: the superseded entry keeps its terminal state and records
 * its successor, so the history reads forward (DK-1, DK-4).
 */
export interface Lineage {
  /** The entry this one resubmits, or `null` for a first filing. */
  supersedes: string | null;
  /** The entry that resubmitted this one, or `null` while none has. */
  supersededBy: string | null;
}

/**
 * The amendments a **refused late** decision carried, with the act that carried
 * them (DK-1).
 *
 * The instant and the principal are here, not merely implied, because a
 * resubmission prefills these values as a person's own correction: each prefilled
 * field is tagged `UserStated` with a reviewer-act binding naming the decision the
 * correction was made on.
 */
export interface PreservedAmendments {
  /** The map the refused decision carried. DK-2 holds inside it. */
  amendments: AmendmentMap;
  /** When the refused decision was made. */
  at: string;
  /** Who made it, as the host identifies them. */
  by: string;
}

/**
 * One filed proposal: the Affidavit, what it needs before it may execute, where it
 * stands, and who agreed.
 *
 * The Docket is the **sole** record of approval authority — an executor is
 * reachable only through an entry that carries an attestation, and nothing
 * replayed from a client's history, a chat transcript or a framework checkpoint
 * stands in for that (AZ-5). A row reads **forward** (DK-4): a recorded fact is
 * never edited in place.
 *
 * Three correlations no JSON Schema can state, which an implementation enforces
 * instead: `execution` is non-null exactly when `status` is `"approved"`;
 * `decidedAt` is non-null on every terminal row and `null` while pending; and
 * `status` is what the row **says** — what it **reads** is `status` with the
 * deadline applied, so a pending entry past `expiresAt` reads `expired` whether or
 * not any sweep has run.
 *
 * Schema: `schemas/0.1.0/docket-entry.schema.json`.
 */
export interface DocketEntry {
  /** The protocol version this row's shapes conform to (SR-4). */
  protocolVersion: string;
  /**
   * The entry's id, stable for its whole lifetime; a resubmission gets a new one.
   * Derived deterministically from the tenant, the conversation, the tool and the
   * canonical form of the operation and its arguments, so a retry replays the same
   * entry (GT-4). Unique **within** a tenant, never across them.
   */
  entryId: string;
  /**
   * The tenant this entry is scoped to. The framework compares this with the
   * caller's tenant **itself** before any transition and treats a miss as
   * not-found; it does not trust a store's scope (AZ-2).
   */
  tenantId: string;
  /** The conversation the proposal came from. Passed in explicitly, never resolved from anything ambient (GT-2). */
  conversationId: string;
  /** Where the turn arrived from — `"chat"`, `"mcp"`, `"api"` or the host's own name for a surface. */
  channel: string;
  /**
   * The tool or capture source the proposal came from. On the row because a
   * resubmission re-runs the coverage lookup against the original tool (CV-4) and
   * an audit of a filed write has to be able to say which tool proposed it.
   */
  toolName: string;
  /** The sworn evidence record **as the agent proposed it**. Never edited (DK-4). */
  affidavit: Affidavit;
  /**
   * The state a reviewer's **accepted** amendments produced, or `null` while none
   * has been accepted (AF-4, DK-4). The form a host's execution grant binds to is
   * the canonical form of this if present, else of the proposal (SR-1).
   */
  amendedAffidavit: Affidavit | null;
  /** What the policy chain decided this write needs before it may execute, recorded verbatim (AZ-4). */
  requirement: RequirementKind;
  /** What the row says. */
  status: DocketStatus;
  /**
   * What became of the write. Non-null exactly when `status` is `"approved"`.
   * Recorded **once**, under a guarded transition from `"unexecuted"`; a second
   * report is refused and changes nothing (DK-1).
   */
  execution: ExecutionOutcome | null;
  /** Why this entry cannot be decided, or `null` when it can (AZ-4). */
  blocked: BlockedMarker | null;
  /**
   * The composite approval this entry is one constituent of, or `null`. Until
   * `MultiParty` semantics land at protocol v0.2, a host composes multi-party
   * approval **above** the gate (AZ-4).
   */
  compositeRef: string | null;
  /** Who agreed, or `null` while nobody has (AZ-1). */
  attestation: Attestation | null;
  /**
   * The amendments a reviewer's approval **accepted**, or `null` when the approval
   * carried none (DK-2). A map a refused late decision carried is a different fact
   * and lives under {@link DocketEntry.preservedAmendments}.
   */
  amendments: AmendmentMap | null;
  /** The amendments a decision carried **after** the deadline had passed, or `null` (DK-1). */
  preservedAmendments: PreservedAmendments | null;
  /**
   * What a reviewer chose, or `null` for a pending row or a Standing Order. The
   * attestation says who may be held to this; the decision says what they chose
   * and why. A Standing Order produces an attestation and no decision record.
   */
  decision: DecisionRecord | null;
  /** What this entry replaces and what replaced it (DK-1). */
  lineage: Lineage;
  /** When the entry was filed. Fixes the filing order rehydration reads in (DK-5). */
  filedAt: string;
  /**
   * The deadline. Stamped from the policy verdict's time-to-live **after** the
   * policy chain has run, else the policy's declared default, else the gate's
   * required default (GT-4). **Never** refreshed by a re-file. The boundary is
   * inclusive.
   */
  expiresAt: string;
  /** When the row left `pending`, or `null` while it has not. */
  decidedAt: string | null;
  /** What the executor reported, or `null` when it has not reported or had nothing to say. */
  executionDetail: string | null;
}

// ---------------------------------------------------------------------------
// The Evidence Card envelope (AF-2, AZ-4, SR-1, SR-4)
// ---------------------------------------------------------------------------

/**
 * How a reviewer surface should render one field's input, supplied by the host and
 * sworn to by nobody.
 *
 * This is **presentation, not substance**: the gate carries a hint and validates
 * nothing against it, and nothing here is part of the canonical form, which is
 * defined over the Affidavit and its accepted amendments alone (SR-1). Swearing to
 * a hint would put a rendering decision inside a hash an execution grant is checked
 * against, so that restyling an input invalidates a grant minted over evidence that
 * did not change.
 *
 * `name` must be a field the same card's Affidavit carries. That is a relation
 * between two objects inside one document and no JSON Schema can state it; the
 * rulebook's fixture lint checks it, and an implementation that consumes cards
 * should make the same check.
 */
export interface FieldPresentation {
  /** The field these hints are about. A name present in `affidavit.fields`. */
  name: string;
  /**
   * The rendering hint the field carries, repeated here so a surface reading only
   * the presentation array has it. When present it agrees with that field's own
   * `kind`; the Affidavit's copy is the one the record swears to.
   */
  kind?: AffidavitFieldKind;
  /**
   * The closed set an amendment input offers for this field, in the order a
   * surface should show them. Absent when the host declared none. The gate
   * validates no value against it: a value outside the set is still recorded.
   */
  allowedValues?: readonly JsonValue[];
  /**
   * The regular expression an amendment input is constrained by, as the host wrote
   * it. Absent when the host declared none. Carried verbatim and never compiled or
   * applied by the gate.
   */
  pattern?: string;
}

/**
 * The envelope that carries an {@link Affidavit} to a reviewer surface: the entry
 * it is filed under, the sworn record, the deadline, the amendments already made
 * on a superseded entry, and the presentation the core does not swear to.
 *
 * A producer may send the same request for the same `docketId` more than once; a
 * consumer treats a repeat as the **same** card, updating in place rather than
 * adding a second one — a re-file is an idempotent replay that re-broadcasts the
 * existing deadline, never a fresh one (GT-4).
 *
 * AF-2 requires a card to show all three confidence numbers. `aggregateConfidence`
 * is on the Affidavit and the two companions are repeated here, where the seed
 * carried them, so a consumer written against either shape finds them.
 *
 * Schema: `schemas/0.1.0/evidence-card-request.schema.json`.
 */
export interface EvidenceCardRequest {
  /** The protocol version this envelope conforms to (SR-4). */
  protocolVersion: string;
  /** The Docket entry this card is filed under — the row's own `entryId`. */
  docketId: string;
  /** The record awaiting a decision: the proposal, or the state an accepted amendment produced. */
  affidavit: Affidavit;
  /** When the review window closes — the entry's own `expiresAt` (GT-4). */
  requiredBy: string;
  /**
   * Set only when this card resubmits a review that expired: the amendments a
   * reviewer made on the original entry, so the next reviewer sees what was
   * already agreed. `null` for a first filing.
   */
  priorAmendments: AmendmentMap | null;
  /** The same number the Affidavit carries (AF-2); repeated here for one version. */
  populatedConfidence: number | null;
  /** The same number the Affidavit carries (AF-2); repeated here for one version. */
  emptyFieldCount: number;
  /**
   * Why no decision on this entry will be accepted, or `null` when it can be
   * decided (AZ-4, CV-4). On the envelope so a reviewer surface can render it
   * rather than inferring it from a warning string.
   */
  blocked: BlockedMarker | null;
  /**
   * How a reviewer surface should render each field's input. One entry per field
   * the host has a hint for; a card with no hints omits the property entirely, and
   * a card may carry hints for some of its fields and not others.
   */
  presentation?: readonly FieldPresentation[];
  /**
   * The host's own verb for the operation — `"WriteUpdate"`, `"Reprice"`,
   * `"Onboard"` — absent when the host named none.
   *
   * Presentation, like the three slots above it. {@link Affidavit.operationType} is
   * the protocol's two-valued **shape**, because a rule about shape has to be a
   * predicate a policy can test without knowing any host's vocabulary; this is the
   * word that host uses for the same act, carried so a reviewer surface can show it
   * as the heading a person recognises. Nothing swears to it and it is not part of
   * the canonical form (SR-1): a host that renames a verb has not changed the
   * evidence.
   */
  hostOperation?: string;
  /**
   * Sentences a reviewer should see beside the record: the reason a policy gave,
   * and the sentence a blocked entry shows. Absent when there are none.
   *
   * Presentation, not substance — the machine-readable half of a blocked entry is
   * {@link EvidenceCardRequest.blocked}, which a surface renders rather than
   * parsing a string out of this array. A consumer never switches on the text of a
   * warning.
   */
  warnings?: readonly string[];
  /**
   * Whether a person must confirm this write before it commits. The **policy
   * chain's** verdict, not a property of the evidence, which is why it sits on the
   * envelope and not on the Affidavit. `false` on a blocked entry: a card carrying
   * a marker that says no decision will be accepted must not also offer a reviewer
   * surface an approve button that cannot work.
   */
  requiresConfirmation: boolean;
}

/**
 * The presentation names on `card` that are not fields of the card's own
 * Affidavit — empty when the card is consistent.
 *
 * A hint for a field the record does not carry renders a control over nothing.
 * That is a relation between two objects inside one document, and JSON Schema has
 * no way to state it: as far as `evidence-card-request.schema.json` is concerned
 * `presentation[].name` is a non-empty string and a card naming a field it does not
 * have **validates**. The rulebook's fixture lint makes the check over its own
 * fixtures; this is the same check, for a consumer that has a card in hand.
 */
export function presentationNamesUnknownFields(card: EvidenceCardRequest): readonly string[] {
  if (card.presentation === undefined) return [];
  const sworn = new Set(card.affidavit.fields.map((field) => field.name));
  return card.presentation.map((hint) => hint.name).filter((name) => !sworn.has(name));
}

// ---------------------------------------------------------------------------
// What a gated tool returns (AF-5, GT-6)
// ---------------------------------------------------------------------------

/**
 * A write proposal was filed: the entry it was filed under, the status the row
 * reads at, and the card a person is shown.
 *
 * Always a **proposal**, never a completed write (GT-6): a model reading it learns
 * that the write is pending or that a Standing Order approved it, never that it
 * happened, because the gate does not execute (AZ-7).
 */
export interface WriteProposalResult {
  kind: "write";
  /** The Docket entry the proposal was filed under. */
  entryId: string;
  /** What the row reads at — `"pending"` unless a Standing Order fired. */
  status: DocketStatus;
  /** The Evidence Card the host delivers to a reviewer. */
  card: EvidenceCardRequest;
}

/**
 * A read tool ran and returned its own result, untouched. The gate passes a read
 * tool straight through: there is nothing to swear to and nothing to file.
 */
export interface ReadResult {
  kind: "read";
  /** Whatever the tool returned. The protocol says nothing about a host's read shapes. */
  result: JsonValue;
}

/**
 * The call produced neither a proposal nor a result. A refusal is an **answer**:
 * the model is told the proposal swore to nothing, or that the tool is uncovered,
 * and can say so.
 */
export interface ToolErrorResult {
  kind: "error";
  /**
   * The refusal's code from the registry, or `"tool-error"` when a **read** tool's
   * own body threw — which is not a gate refusal and is deliberately not in the
   * registry.
   */
  code: ErrorCode | "tool-error";
  /** What went wrong, in one line, for a human reading a log. Never the contract — the code is. */
  message: string;
}

/**
 * What a tool call returns once the gate stands in front of it: one discriminated
 * union of three kinds, carried on a single `kind` property (AF-5). A consumer
 * switches on the discriminator, **never** on the presence of fields. Spelled
 * `$type` in the `0.0.1-seed` wire and the shipped .NET envelope; `kind` from
 * v0.1.
 *
 * Schema: `schemas/0.1.0/tool-result.schema.json`.
 */
export type ToolResult = WriteProposalResult | ReadResult | ToolErrorResult;

// ---------------------------------------------------------------------------
// Reporting back (DK-1, DK-3, AZ-1)
// ---------------------------------------------------------------------------

/**
 * What became of a review. `"resubmitted"` is the outcome an expired entry reads
 * once a successor has superseded it.
 *
 * Schema: the `outcome` property of `schemas/0.1.0/decision-result.schema.json`.
 */
export type DecisionOutcome = "approved" | "rejected" | "expired" | "resubmitted";

/** Every {@link DecisionOutcome} value. */
export const DECISION_OUTCOMES = [
  "approved",
  "rejected",
  "expired",
  "resubmitted",
] as const satisfies readonly DecisionOutcome[];

/**
 * What became of a review, as the producer reports it back.
 *
 * A decision result is a **report**, never an authorization: the Docket row is the
 * sole record of approval authority, and nothing replayed from this envelope
 * stands in for the row (AZ-5).
 *
 * Schema: `schemas/0.1.0/decision-result.schema.json`.
 */
export interface DecisionResult {
  /** The protocol version this envelope conforms to (SR-4). */
  protocolVersion: string;
  /** The Docket entry this reports on. */
  docketId: string;
  /** What became of the review. */
  outcome: DecisionOutcome;
  /** Who agreed, or `null` when nobody did — a rejection and an expiry carry none (AZ-1). */
  attestation: Attestation | null;
  /** What became of the write, or `null` when the review did not approve it. */
  execution: ExecutionOutcome | null;
}

/**
 * A pending entry is approaching its deadline.
 *
 * **Re-sent** on every sweep while the entry stays inside the warning window, so a
 * consumer must treat repeats for the same `docketId` as idempotent — key a
 * countdown off `expiresAt` rather than counting notifications.
 */
export interface DocketExpiringNotification {
  protocolVersion: string;
  kind: "docket-expiring";
  /** The entry approaching expiry. */
  docketId: string;
  /** When the entry expires. The boundary is inclusive. */
  expiresAt: string;
}

/**
 * A pending entry lapsed without a reviewer decision. The write it carried is not
 * committed. A decision arriving after this is refused, and — when it came from a
 * principal who could have decided — its amendments are preserved on the row for a
 * resubmission (DK-1).
 */
export interface DocketExpiredNotification {
  protocolVersion: string;
  kind: "docket-expired";
  /** The entry that expired. */
  docketId: string;
}

/** An entry changed state (DK-1): the state it left, the state it reached, and the execution outcome an approved row now carries. */
export interface DocketTransitionNotification {
  protocolVersion: string;
  kind: "docket-transition";
  /** The entry that changed state. */
  docketId: string;
  /** The state the entry left. */
  from: DocketStatus;
  /** The state the entry reached. */
  to: DocketStatus;
  /** The execution outcome the row now carries, or `null` when it is not approved. */
  execution: ExecutionOutcome | null;
}

/**
 * What a producer tells a reviewer surface about a Docket entry that nobody asked
 * it about: a deadline approaching, a deadline passed, a state change (DK-1,
 * DK-3).
 *
 * One discriminated union with a `kind` property, added in v0.1 — the seed's two
 * notifications were told apart by which properties they carried, and a consumer
 * switching on the presence of fields is exactly what AF-5 forbids.
 *
 * A notification is a **hint**, never a fact a consumer may act on alone: expiry
 * is queryable state, so an entry past its deadline reads `expired` whether or not
 * any sweep has run or any notification arrived.
 *
 * Schema: `schemas/0.1.0/notification.schema.json`.
 */
export type Notification =
  DocketExpiringNotification | DocketExpiredNotification | DocketTransitionNotification;

// ---------------------------------------------------------------------------
// The telemetry-key registry (TL-1, TL-2)
// ---------------------------------------------------------------------------

/** One event the gate emits. */
export interface TelemetryKeyEntry {
  /** The event name. Never renamed and never removed, only deprecated. */
  key: string;
  /** The version of the shipping implementation the key first appeared in. */
  since: string;
  /** What the event means, in one line. */
  description: string;
  /**
   * The attribute **names** carried on this event — never values. An event is not
   * an audit record; the audit record is the Affidavit. Where a public standard
   * names the same thing the registry uses its name (TL-2). Never null.
   */
  attributes: readonly string[];
}

/**
 * The telemetry-key registry an implementation ships beside its packages (TL-1).
 * Every event the gate emits is named here; the registry is a versioned API, and
 * an operator's alerts are built on it.
 *
 * Schema: `schemas/0.1.0/telemetry-key.schema.json`.
 */
export interface TelemetryKeyRegistry {
  /** The protocol version this registry document conforms to (SR-4). */
  protocolVersion: string;
  /** The version of the registry itself, as the implementation that ships it numbers its own releases. */
  registryVersion: string;
  /** Every key, in registry order. The order only ever grows at the end. */
  keys: readonly TelemetryKeyEntry[];
}

// ---------------------------------------------------------------------------
// Host and transport vocabulary
//
// The shapes below are NOT protocol core. They are how one shipped host talks to
// its own client, recorded in the protocol's conformance fixtures as reference
// shapes. They carry no v0.1 schema, so nothing validates them; a different host is
// free to use a different vocabulary. They are typed here because their closed
// string sets are pinned in the protocol's `conformance/fixtures/enum-values.json`,
// and a TypeScript host that speaks to a .NET host over the same hub benefits from
// having them named.
// ---------------------------------------------------------------------------

/**
 * What became of a review, in the shipped host's own vocabulary.
 *
 * The same closed set as {@link DecisionOutcome}, which is the protocol's own
 * property from v0.1. Pinned set: `enum-values.json → actionDecisionResultOutcome`.
 */
export type ActionDecisionOutcome = DecisionOutcome;

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
 * Host/transport shape, not protocol core: no schema of its own. The protocol's
 * equivalent is {@link DecisionResult}. Fixture: `wire/action-decision-result`.
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
 * `enum-values.json → getActionStatusesValue`.
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
 * Host/transport shape, not protocol core. Fixture: `wire/session-rehydrated`.
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
 * Host/transport shape, not protocol core. Fixture: `wire/system-notification`.
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
 * Host/transport shape, not protocol core.
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
   * surface's own vocabulary (`"top"`, `"bottom"`, …). An open string.
   */
  side: string;
  /** Extra padding around the element's highlight, in pixels, or `null` for the default. */
  highlightPadding: number | null;
}

/**
 * A UI walkthrough: a route to navigate to and an ordered list of steps.
 *
 * Host/transport shape, not protocol core. Its meaning stays with the host surface
 * that renders it. Fixture: `wire/guide-ui`.
 */
export interface UiGuidance {
  /** The route to navigate to before the walkthrough starts. */
  navigateTo: string;
  /** The steps, in order. */
  steps: readonly UiGuidanceStep[];
  /** Why the walkthrough was offered, in the host's own words. */
  context: string;
}

// ---------------------------------------------------------------------------
// The superseded 0.0.1-seed wire
//
// The shipped .NET framework still sends the seed shape, and a TypeScript host
// reading from it needs a name for what arrives. These types describe that shape
// and nothing else: a v0.1 producer never emits one, and `@affiant/core`'s
// `fromWire` refuses a payload carrying it rather than guessing at a conversion.
// Their schemas are vendored under `protocol/schemas/seed/` and exported from
// `@affiant/contract/schemas` as `seedSchemas`.
// ---------------------------------------------------------------------------

/**
 * One provenance record in the `0.0.1-seed` wire: no `at`, no `binding`, and the
 * reviewer's line spelled `evidence` rather than `note`.
 *
 * Schema: `protocol/schemas/seed/provenance-tag.schema.json`.
 */
export interface SeedProvenanceTag {
  source: ProvenanceSource;
  confidence: number;
  /** Renamed to `note` in v0.1: the whole record is the evidence, and this is the sentence a person reads. */
  evidence: string | null;
  conversationTurn: number | null;
}

/** A field's provenance history in the `0.0.1-seed` wire. */
export interface SeedProvenanceChain {
  current: SeedProvenanceTag;
  prior: readonly SeedProvenanceTag[];
}

/**
 * One sworn field in the `0.0.1-seed` wire, carrying the two presentation
 * properties v0.1 moved onto the card envelope.
 *
 * Schema: `protocol/schemas/seed/affidavit-field.schema.json`.
 */
export interface SeedAffidavitField {
  name: string;
  value: JsonValue;
  previousValue: JsonValue;
  provenance: SeedProvenanceChain;
  isMandatory: boolean;
  kind: AffidavitFieldKind;
  /** Moved to the card envelope's `presentation` in v0.1. */
  allowedValues: readonly string[] | null;
  /** Moved to the card envelope's `presentation` in v0.1. */
  pattern: string | null;
}

/**
 * The sworn record in the `0.0.1-seed` wire: the host's own operation verb, one
 * confidence number rather than three, and the warnings and the confirmation flag
 * on the record rather than on the envelope.
 *
 * Schema: `protocol/schemas/seed/affidavit.schema.json`.
 */
export interface SeedAffidavit {
  /** The host's own name for the operation, e.g. `"WriteUpdate"`. An open string. */
  operationType: string;
  entityType: string;
  entityId: string | null;
  fields: readonly SeedAffidavitField[];
  /** A mean over the non-`Empty` fields in the shipped projection, where AF-2 requires a minimum. */
  aggregateConfidence: number;
  /** Moved to the card envelope in v0.1. */
  warnings: readonly string[];
  /** Moved to the card envelope in v0.1. */
  requiresConfirmation: boolean;
}

/**
 * The card envelope in the `0.0.1-seed` wire: four properties, and no protocol
 * version to tell it apart from a later one.
 *
 * Schema: `protocol/schemas/seed/evidence-card-request.schema.json`.
 */
export interface SeedEvidenceCardRequest {
  docketId: string;
  affidavit: SeedAffidavit;
  requiredBy: string;
  priorAmendments: AmendmentMap | null;
}
