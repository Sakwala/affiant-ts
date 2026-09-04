/**
 * The Docket entry — the row every proposed write becomes, and the only record of
 * approval authority the framework recognises.
 *
 * **Rules served: DK-1** (the review-outcome state machine, expiry as queryable
 * state, lineage), **AZ-1** (the attestation record and its three attestor kinds),
 * **AZ-4** (requirement levels and the `blocked` marker), **DK-4** (a row reads
 * forward: later facts are appended, a recorded decision is never edited).
 *
 * DK-1 in one sentence: *`pending` goes to exactly one of `approved`, `rejected`
 * or `expired`; an `approved` row carries an execution outcome so an
 * approved-but-failed write is distinguishable from an approved-and-committed one;
 * every transition out of `pending` is a guarded compare-and-set; and an entry past
 * its expiry reads `expired` whether or not any sweep has run.*
 *
 * The last clause is why {@link readStatus} exists and why nothing in this package
 * schedules a timer. Expiry is **state**, not an event: a host that never runs a
 * sweep still cannot decide an expired entry, because every read applies the
 * deadline. The sweep ({@link DocketStore.expireDue}) exists to make the state
 * durable and to drive notifications, not to make it true.
 *
 * @packageDocumentation
 */

import { PROTOCOL_VERSION } from "@affiant/contract";
// The **core** Affidavit and amendment map. The entry carried the wire shapes at
// pull request C4, because the core model and the store landed in parallel; C5
// makes the swap. The wire shapes are reached only at the boundary - `fromWire` on the way in, `toWire` on the way out
// to an Evidence Card - so a row holds provenance chains with their bindings and
// their instants, which the wire at protocol tag `0.0.1-seed` cannot carry.
import type { Affidavit } from "../model/affidavit.js";
import type { AmendmentMap } from "../model/amendments.js";

import type { ChannelIdentity, TurnContext } from "../context.js";

import { isDue, requireInstant } from "./expiry.js";

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/**
 * Where an entry stands. `pending` is the only non-terminal state, and it goes to
 * exactly one of the other three (DK-1).
 *
 * `deferred` and the referral outcome — an entry handed to another reviewer — are
 * **reserved** by the rulebook and deliberately absent: no implementation has run
 * those transitions, so naming them here would invite a host to depend on
 * semantics nobody has fixed.
 */
export type DocketStatus = "pending" | "approved" | "rejected" | "expired";

/** Every {@link DocketStatus}, pinned as data so a runtime check and a fixture read the same list. */
export const DOCKET_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const satisfies readonly DocketStatus[];

/**
 * What became of an approved write, once the host's executor reported.
 *
 * The reason this is a separate axis rather than two more statuses: an
 * approved-but-failed write and an approved-and-committed one differ in what the
 * *host* must do next, not in whether the approval happened. Collapsing them into
 * `status` loses the approval, and DK-1 requires the two be distinguishable on the
 * row.
 */
export type ExecutionOutcome = "unexecuted" | "executed" | "failed";

/** Every {@link ExecutionOutcome}, in the order a row moves through them. */
export const EXECUTION_OUTCOMES = [
  "unexecuted",
  "executed",
  "failed",
] as const satisfies readonly ExecutionOutcome[];

/**
 * Whether `status` is terminal — everything except `pending`.
 *
 * `approved` counts as terminal for the *review*, which is what this predicate is
 * about; whether the write has been executed is {@link DocketEntry.execution}, a
 * separate question with a separate answer.
 */
export function isTerminal(status: DocketStatus): boolean {
  return status !== "pending";
}

// ---------------------------------------------------------------------------
// Requirement levels and the blocked marker (AZ-4)
// ---------------------------------------------------------------------------

/**
 * How much agreement a write needs before it may execute — the policy chain's
 * verdict kind, recorded verbatim on the entry.
 *
 * `StandingOrder` approves with no person present. `ReviewerConfirmation` asks one
 * person. `ReferralRequired` hands the entry to a different reviewer, and
 * `MultiParty` requires several — **neither of which v0.1 runs**. AZ-4 is emphatic
 * about what an implementation does with a level it does not run: it records the
 * level verbatim, files the entry `pending` with a {@link BlockedMarker}, refuses
 * every decision on it, and **never degrades it to a weaker requirement**. A joint
 * requirement quietly satisfied by one approval is the failure this rule exists to
 * prevent.
 */
export type RequirementKind =
  "StandingOrder" | "ReviewerConfirmation" | "ReferralRequired" | "MultiParty";

/** Every {@link RequirementKind}, in the rulebook's order. */
export const REQUIREMENT_KINDS = [
  "StandingOrder",
  "ReviewerConfirmation",
  "ReferralRequired",
  "MultiParty",
] as const satisfies readonly RequirementKind[];

/**
 * Why an entry cannot be decided even though it sits in `pending`.
 *
 * Both codes are **provisional** until the protocol's `ErrorCode` registry is
 * authored with the v0.1 schemas; they match {@link ErrorCode} member for member so
 * that a refusal thrown by the gate and the marker left on the row spell the same
 * reason.
 */
export type BlockedCode = "requirement-not-implemented" | "coverage-refused";

/** Every {@link BlockedCode}. */
export const BLOCKED_CODES = [
  "requirement-not-implemented",
  "coverage-refused",
] as const satisfies readonly BlockedCode[];

/**
 * A requirement level this version recognises but does not run reached the
 * pipeline — `ReferralRequired` or `MultiParty`, whose semantics are reserved. The
 * level is recorded verbatim and never degraded to a weaker one (AZ-4).
 */
export interface RequirementNotImplementedMarker {
  readonly code: "requirement-not-implemented";
  /** The requirement level that is not implemented. */
  readonly level: RequirementKind;
}

/**
 * A proposal came from a write-capable tool the host declared the gate cannot
 * intercept (CV-4). Its proposals are still recorded — blocked, never silently
 * allowed to write — and the tool name is on the row so coverage can be
 * re-assessed on a resubmission.
 */
export interface CoverageRefusedMarker {
  readonly code: "coverage-refused";
  /** The category the gate cannot cover. */
  readonly category: "no-execute" | "provider-executed" | "hosted-mcp";
  /** The tool the uncovered proposal came from. */
  readonly toolName: string;
}

/**
 * The marker AZ-4 requires on an entry the implementation will not decide.
 *
 * Discriminated on its `code`, and each arm carries exactly the context that code
 * makes meaningful — a `coverage-refused` marker has no requirement level to
 * report, and a reader narrows on the code rather than sniffing for a property
 * (AF-5).
 */
export type BlockedMarker = RequirementNotImplementedMarker | CoverageRefusedMarker;

// ---------------------------------------------------------------------------
// Attestation (AZ-1, AZ-3)
// ---------------------------------------------------------------------------

/** What a relay asserted, as it is written onto an attestation. */
export interface AttestationRelay {
  /** The host's id for the relay service that carried the decision. */
  readonly principal: string;
  /** The identity, on the relay's own channel, the decision came from. */
  readonly channelIdentity: ChannelIdentity;
  /** The relay's id for the message that carried the decision. */
  readonly messageId: string;
}

/**
 * Who agreed to the write. The *mode* is the `kind`; there is no separate mode
 * field for it to drift from (AZ-1).
 *
 * AZ-3 is what the three arms encode. A human-verified session attests `member`. A
 * machine caller may **never** attest `member`: a decision a person makes through a
 * relay attests `member-via-relay`, naming both the person and the relay, and a
 * capture a policy auto-approves attests `standing-order`, naming the policy and
 * the version of it that fired. Making the strongest available claim explicit in
 * the type is how an implementation avoids the shortcut where a relay's assertion
 * is quietly promoted to a person's signature.
 */
export type Attestor =
  | {
      /** A human-verified session decided this entry. */
      readonly kind: "member";
      /** The host's id for the person. */
      readonly id: string;
    }
  | {
      /** A person decided this entry through a trusted relay. */
      readonly kind: "member-via-relay";
      /** The host's id for the person the relay named. */
      readonly memberId: string;
      /** The relay, and the message the decision arrived on. */
      readonly relay: AttestationRelay;
    }
  | {
      /** A policy approved this entry with no person present. */
      readonly kind: "standing-order";
      /** The host's id for the policy that fired. */
      readonly policyId: string;
      /** The version of that policy, so a later reader can tell what it said at the time. */
      readonly version: string;
    };

/**
 * The attestation record AZ-1 requires on every write that reaches an executor: who
 * agreed, when, and to which entry.
 *
 * `entryId` is repeated here rather than left implicit because the attestation is
 * the fragment a host exports, signs or ships to an audit sink; a record that
 * cannot name its own subject is not evidence.
 */
export interface Attestation {
  /** Who agreed. */
  readonly by: Attestor;
  /** When, as an ISO 8601 instant in UTC. */
  readonly at: string;
  /** The entry this attests to. */
  readonly entryId: string;
}

// ---------------------------------------------------------------------------
// The decision record
// ---------------------------------------------------------------------------

/**
 * What a reviewer decided, as it is recorded on the row.
 *
 * Separate from {@link Attestation} because they answer different questions: the
 * attestation says *who may be held to this*, the decision says *what they chose
 * and why*. A Standing Order produces an attestation and no decision record — no
 * person chose anything.
 */
export interface DecisionRecord {
  /** Approve or reject. Amending is approving with an {@link DocketEntry.amendments} map. */
  readonly kind: "approve" | "reject";
  /** The reviewer's stated reason, or `null` when they gave none. */
  readonly reason: string | null;
  /** When the decision was made, as an ISO 8601 instant in UTC. */
  readonly at: string;
}

/**
 * How this entry relates to the entries it replaces or is replaced by (DK-1).
 *
 * A resubmission is a **new** entry, never a reopened one: the superseded entry
 * keeps its terminal state and records its successor, so the history reads forward
 * (DK-4) and nothing that was once decided is quietly edited.
 */
export interface Lineage {
  /** The entry this one resubmits, or `null` for a first filing. */
  readonly supersedes: string | null;
  /** The entry that resubmitted this one, or `null` while none has. */
  readonly supersededBy: string | null;
}

/**
 * The amendments a decision carried after the entry had already expired, with the
 * act that carried them (DK-1).
 *
 * The instant and the principal are here, and not merely implied, because a
 * resubmission prefills these values as **a person's own correction**: each
 * prefilled field is tagged `UserStated` with a `reviewer-act` binding, and PV-2
 * says that binding names the decision the correction was made on. Without the
 * instant the binding would have to point at the row's deadline — the moment the
 * gate refused, not the moment the person typed — and without the principal the
 * record could not say whose correction it is.
 */
export interface PreservedAmendments {
  /** The map the refused decision carried. DK-2 holds inside it. */
  readonly amendments: AmendmentMap;
  /** When the refused decision was made, as an ISO 8601 instant in UTC. */
  readonly at: string;
  /** Who made it, as the host identifies them. */
  readonly by: string;
}

// ---------------------------------------------------------------------------
// The entry
// ---------------------------------------------------------------------------

/**
 * One filed proposal: the Affidavit, what it needs before it may execute, where it
 * stands, and who agreed.
 *
 * Every property is `readonly`. A store never mutates a row in place — a
 * transition, a preserved amendment map, an execution outcome and a supersession
 * each produce a *new* entry value that replaces the old one under the same id.
 * That is DK-4's read-forward property expressed in the type rather than in a
 * comment nobody runs.
 *
 * Three correlations the flat shape cannot express, enforced by {@link newEntry}
 * and by the store's transition instead:
 *
 * 1. `execution` is non-`null` **exactly when** `status` is `"approved"`.
 * 2. `decidedAt` is non-`null` on every terminal row and `null` while `pending`.
 * 3. `status` is what the row *says*; what it *reads* is {@link readStatus}, which
 *    applies the expiry deadline. Every query path goes through the latter.
 */
export interface DocketEntry {
  /** The entry's id. Stable for its whole lifetime; a resubmission gets a new one. */
  readonly entryId: string;
  /**
   * The tenant this entry is scoped to. Compared against `ctx.tenantId` before any
   * transition (AZ-2), and the partition every store operation is keyed by: an
   * entry id is unique within a tenant, never across them.
   */
  readonly tenantId: string;
  /** The conversation the proposal came from (GT-2). */
  readonly conversationId: string;
  /** Where the turn arrived from — `"chat"` for Sequence A, `"mcp"` for Sequence C. */
  readonly channel: TurnContext["channel"];
  /**
   * The tool or capture source the proposal came from.
   *
   * On the row because two later questions need it and neither can be answered
   * from the Affidavit: a resubmission re-runs the coverage lookup against the
   * original tool (CV-4), and an audit of a filed write has to be able to say
   * which tool proposed it.
   */
  readonly toolName: string;
  /**
   * The sworn evidence record **as the agent proposed it**. Never edited (DK-4).
   *
   * An accepted amendment does not rewrite this; it writes
   * {@link DocketEntry.amendedAffidavit} beside it. A row that overwrote its
   * proposal could not show what the agent originally said, which is the fact an
   * auditor is reading the row for.
   */
  readonly affidavit: Affidavit;
  /**
   * The state a reviewer's accepted amendments produced, or `null` while no
   * amendment has been accepted (AF-4, DK-4).
   *
   * The form a host's execution grant binds to is
   * `canonicalize(amendedAffidavit ?? affidavit)` — see `canonicalizeEntry` — which
   * is what SR-1's "the Affidavit and its accepted amendments" means on a row.
   */
  readonly amendedAffidavit: Affidavit | null;
  /** What the policy chain decided this write needs before it may execute (AZ-4). */
  readonly requirement: RequirementKind;
  /** What the row says. What it *reads* is {@link readStatus}. */
  readonly status: DocketStatus;
  /** What became of the write. Non-`null` exactly when `status` is `"approved"`. */
  readonly execution: ExecutionOutcome | null;
  /** Why this entry cannot be decided, or `null` when it can (AZ-4). */
  readonly blocked: BlockedMarker | null;
  /**
   * The composite approval this entry is one constituent of, or `null`.
   *
   * Until `MultiParty` is protocol v0.2, a host composes multi-party approval
   * *above* the gate: one entry per approver, all naming the same composite, and
   * no constituent's approval alone reaching the executor (AZ-4).
   */
  readonly compositeRef: string | null;
  /** Who agreed, or `null` while nobody has (AZ-1). */
  readonly attestation: Attestation | null;
  /**
   * The amendments a reviewer's approval **accepted**, or `null` when the approval
   * carried none.
   *
   * Within a map, DK-2 holds: a key whose value is `null` was **cleared** by the
   * reviewer, and an absent key was left untouched. The two are never conflated.
   *
   * A map a *refused* late decision carried is a different fact and lives under
   * {@link DocketEntry.preservedAmendments}: nobody accepted it, and conflating the
   * two would let a resubmission present a refused caller's corrections as an
   * approval's.
   */
  readonly amendments: AmendmentMap | null;
  /**
   * The amendments a decision carried after the deadline had passed, with the act
   * that carried them, or `null` (DK-1).
   *
   * An appended later fact on an expired row, written by the store's
   * `preserveAmendments` and read by `resubmit` to prefill the new proposal.
   */
  readonly preservedAmendments: PreservedAmendments | null;
  /** What a reviewer chose, or `null` for a pending row or a Standing Order. */
  readonly decision: DecisionRecord | null;
  /** What this entry replaces and what replaced it (DK-1). */
  readonly lineage: Lineage;
  /** When the entry was filed, as an ISO 8601 instant in UTC. Fixes the filing order. */
  readonly filedAt: string;
  /**
   * The deadline, as an ISO 8601 instant in UTC. Set from the policy verdict's TTL
   * after the policy chain has run (GT-4), and **never refreshed by a re-file**.
   */
  readonly expiresAt: string;
  /** When the row left `pending`, or `null` while it has not. */
  readonly decidedAt: string | null;
  /** What the executor reported, or `null` when it has not reported or had nothing to say. */
  readonly executionDetail: string | null;
  /** The protocol tag the entry's wire shapes are pinned to. */
  readonly protocolVersion: string;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * What {@link newEntry} needs, and the few defaults a caller may override.
 *
 * The overridable set is deliberately small: everything else on a
 * {@link DocketEntry} is a *later fact* — a decision, a preserved amendment map, an
 * execution outcome, a supersession — and later facts are appended by the store, not
 * supplied at filing. The exceptions are the ones the pipeline genuinely writes in
 * the same operation as the filing: a Standing Order verdict files `approved`,
 * `unexecuted` and its attestation in one write (GT-1 step 9, AZ-1), and an
 * unimplemented requirement files `pending` with a blocked marker (AZ-4).
 */
export interface NewEntryInit {
  /** The entry's id. Unique within the tenant. */
  readonly entryId: string;
  /** The tenant the entry is scoped to. */
  readonly tenantId: string;
  /** The conversation the proposal came from. */
  readonly conversationId: string;
  /** Where the turn arrived from. */
  readonly channel: TurnContext["channel"];
  /** The tool or capture source the proposal came from (CV-4). */
  readonly toolName: string;
  /** The sworn evidence record, as proposed. */
  readonly affidavit: Affidavit;
  /** What the policy chain decided this write needs. */
  readonly requirement: RequirementKind;
  /** When the entry is being filed, as an ISO 8601 instant in UTC. */
  readonly filedAt: string;
  /** The deadline, as an ISO 8601 instant in UTC (GT-4). */
  readonly expiresAt: string;
  /** The protocol tag. Defaults to the tag `@affiant/contract` is pinned to. */
  readonly protocolVersion?: string;
  /** Defaults to `"pending"`. A Standing Order files `"approved"`. */
  readonly status?: DocketStatus;
  /**
   * Defaults to `"unexecuted"` when `status` is `"approved"` and `null` otherwise.
   * Supplying a value that contradicts the status is a `RangeError`.
   */
  readonly execution?: ExecutionOutcome | null;
  /** The AZ-4 marker, when the entry is filed blocked. */
  readonly blocked?: BlockedMarker | null;
  /** The composite approval this entry is a constituent of. */
  readonly compositeRef?: string | null;
  /** The attestation a Standing Order writes in the same operation as the filing (AZ-1). */
  readonly attestation?: Attestation | null;
  /** The entry this one resubmits (DK-1). The successor link is written on the *other* row. */
  readonly supersedes?: string | null;
  /**
   * When the row left `pending`, for an entry filed already terminal. Defaults to
   * `filedAt` in that case, and is `null` for a `pending` filing.
   */
  readonly decidedAt?: string | null;
}

/** Rejects an identifier that is empty or blank, which no store can key by. */
function requireIdentifier(value: string, what: string): string {
  if (value.trim() === "") throw new RangeError(`${what} must be a non-empty string`);
  return value;
}

/**
 * A new Docket entry, with the defaults DK-1 fixes and the correlations it requires
 * checked.
 *
 * Refusals are `RangeError`, not `AffiantError`: the {@link ErrorCode} registry
 * names the reasons *the gate refuses a request*, and a caller who hands this
 * factory a status and an execution outcome that contradict each other has made a
 * programming error, not a request. Keeping the two apart is what stops a host from
 * catching a wiring bug as though it were a reviewer's rejection.
 *
 * @throws RangeError when an identifier is blank, an instant is unreadable, the
 *         requirement is not one of the four, or `execution` contradicts `status`.
 */
export function newEntry(init: NewEntryInit): DocketEntry {
  const status = init.status ?? "pending";
  if (!(DOCKET_STATUSES as readonly string[]).includes(status)) {
    throw new RangeError(`unknown docket status: ${String(status)}`);
  }
  if (!(REQUIREMENT_KINDS as readonly string[]).includes(init.requirement)) {
    throw new RangeError(`unknown requirement kind: ${String(init.requirement)}`);
  }

  const execution = init.execution === undefined ? defaultExecution(status) : init.execution;
  if (status === "approved" && execution === null) {
    throw new RangeError("an approved entry carries an execution outcome (DK-1)");
  }
  if (status !== "approved" && execution !== null) {
    throw new RangeError(`a ${status} entry carries no execution outcome (DK-1)`);
  }

  const filedAt = requireInstant(init.filedAt, "filedAt");
  const expiresAt = requireInstant(init.expiresAt, "expiresAt");
  const decidedAt =
    init.decidedAt === undefined ? (status === "pending" ? null : filedAt) : init.decidedAt;
  if (status === "pending" && decidedAt !== null) {
    throw new RangeError("a pending entry has no decidedAt (DK-1)");
  }
  if (status !== "pending" && decidedAt === null) {
    throw new RangeError(`a ${status} entry records when it left pending (DK-1)`);
  }

  return {
    entryId: requireIdentifier(init.entryId, "entryId"),
    tenantId: requireIdentifier(init.tenantId, "tenantId"),
    conversationId: requireIdentifier(init.conversationId, "conversationId"),
    channel: requireIdentifier(init.channel, "channel"),
    toolName: requireIdentifier(init.toolName, "toolName"),
    affidavit: init.affidavit,
    // A filing records what was proposed and nothing else: an amendment is a later
    // fact, appended by a decision, never present at birth (DK-4).
    amendedAffidavit: null,
    requirement: init.requirement,
    status,
    execution,
    blocked: init.blocked ?? null,
    compositeRef: init.compositeRef ?? null,
    attestation: init.attestation ?? null,
    amendments: null,
    preservedAmendments: null,
    decision: null,
    lineage: { supersedes: init.supersedes ?? null, supersededBy: null },
    filedAt,
    expiresAt,
    decidedAt: decidedAt === null ? null : requireInstant(decidedAt, "decidedAt"),
    executionDetail: null,
    protocolVersion: init.protocolVersion ?? PROTOCOL_VERSION,
  };
}

/** The execution outcome a freshly filed entry in `status` carries. */
function defaultExecution(status: DocketStatus): ExecutionOutcome | null {
  return status === "approved" ? "unexecuted" : null;
}

// ---------------------------------------------------------------------------
// Expiry as state (DK-1)
// ---------------------------------------------------------------------------

/**
 * What `entry` reads as at `now` — the status every query path reports.
 *
 * A `pending` entry past its `expiresAt` reads `expired` **whether or not any sweep
 * has run**. That is the whole of DK-1's expiry clause, and it is a pure function of
 * the row and the instant precisely so that no code path can forget it: there is no
 * background job to be down, no alarm to be dropped, and no window in which an entry
 * is decidable because nobody swept it yet.
 *
 * Any other status is returned unchanged. Expiry only ever consumes `pending`; a row
 * that was approved before its deadline stays approved forever after it.
 *
 * @throws RangeError when `now` or the entry's `expiresAt` is not a readable instant.
 */
export function readStatus(
  entry: Pick<DocketEntry, "status" | "expiresAt">,
  now: string,
): DocketStatus {
  return entry.status === "pending" && isDue(entry, now) ? "expired" : entry.status;
}
