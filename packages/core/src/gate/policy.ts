/**
 * The approval-policy chain: what a write needs before it may execute, and the three
 * checks that stop a person-free approval from resting on something uncheckable or
 * incomplete.
 *
 * **Rules served: AZ-4** (the four requirement kinds; a level this version does not
 * run is recorded verbatim and blocked, never degraded to a weaker one), **PV-4** (a
 * verdict with no person present never depends on an unbound tag above
 * `Conversation`), **GT-5** (the risk function and its thresholds are host-supplied,
 * this package owns only the comparison — and a Standing Order never fires while a
 * proposed field the entity requires has no known value), **GT-4** (the deadline is
 * the policy's to name, and a deadline that is not a deadline is refused rather than
 * stamped), **CV-1** (a declared threshold with no scorer is a wire-up error, raised
 * in `gate.ts` before any evaluation).
 *
 * ## What a policy is
 *
 * A policy is a host object with an id, a version, the provenance sources it
 * predicates on, and an `evaluate` that returns a {@link Verdict} or `null` for "I
 * have no opinion". The chain runs in order and **the first non-null verdict wins**;
 * a chain that produces none defaults to {@link Verdict.requirement}
 * `"ReviewerConfirmation"` — a person confirms. That default is the fail-closed
 * direction: a gate with no policies at all asks a person about everything.
 *
 * ## Why `declaredInputs` exists
 *
 * PV-4 asks a question the Affidavit alone cannot answer: *did this verdict depend
 * on a grade a caller could have asserted with nothing behind it?* A policy that
 * predicates only on field values, or on host state, or on tags at or below
 * `Conversation`, is unaffected by the rule — the turn is its own artifact. A policy
 * that predicates on `UserStated`, `External` or `Computed` is claiming an artifact
 * outside the conversation, and the check is that the artifact is actually pointed
 * at (a binding, PV-2). So the policy declares what it predicates on, and
 * the gate checks the declaration against the tags in force. This is what the rule
 * means by "conformance fixtures assert on the policy's declared inputs, not on the
 * Affidavit alone".
 *
 * ## Why a degrade rather than a refusal
 *
 * When any of the three checks fails the verdict does not disappear and the proposal
 * is not thrown away: the requirement degrades to `"ReviewerConfirmation"` and a
 * person is asked. Degrading *toward* a person is always safe; AZ-4's prohibition is
 * on degrading to something weaker, which is the other direction.
 *
 * ## Why an empty required field blocks a person-free approval
 *
 * A field the entity requires, proposed with no value and tagged `Empty`, is the one
 * hole a confidence number cannot describe: `aggregateConfidence` is already `0.0`
 * whenever any proposed field is `Empty` (AF-2), and a host that keys its Standing
 * Order on `populatedConfidence` — the minimum over the fields that *were* filled —
 * reads a high number over a proposal that is missing something the write cannot do
 * without. PV-4 cannot reach the case either, because `Empty` sits at the bottom of
 * the ladder rather than above `Conversation`. So the rule is structural: a Standing
 * Order never fires while a proposed field marked mandatory reads `Empty`, whatever
 * the numbers say. A person may still approve — they can see the hole, and approving
 * is of what was sworn to, not a licence to invent the missing value.
 *
 * An **optional** field left `Empty` does not block a Standing Order by rule. A host
 * that wants it to can predicate its own policy on `populatedConfidence` or
 * `emptyFieldCount`, which is where a floor belongs: this package defines no
 * threshold on any of the three numbers (AF-2, GT-5).
 *
 * @packageDocumentation
 */

import type { TurnContext } from "../context.js";
import type { RequirementKind } from "../docket/entry.js";
import { REQUIREMENT_KINDS } from "../docket/entry.js";
import { AffiantError, isAffiantError } from "../errors.js";
import type { Affidavit } from "../model/affidavit.js";
import type { ProvenanceSource } from "../model/provenance.js";
import { isHonourable, requiresBinding } from "../model/provenance.js";
import type { RiskScorer, TelemetryPort } from "../ports.js";

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

/**
 * What a policy says a write needs.
 *
 * `ttlMs` is the policy's own deadline for this write; GT-4 stamps `expiresAt` from
 * it **after** the chain has run, so a policy that knows a capture is worthless in
 * five minutes can say so. It must be a whole number of milliseconds, one or more:
 * `0` files an entry that reads `expired` on the very read that files it, and a
 * negative or `NaN` one is worse (see {@link evaluatePolicies}). `threshold` is
 * meaningful on a `"StandingOrder"` verdict only — it is the ceiling a
 * host-supplied {@link RiskScorer}'s score must not exceed — and naming one on any
 * other requirement is a caller bug, not a request (a `RangeError`). `reason` is
 * carried onto the reviewer's card so a person can see why they are being asked.
 */
export interface Verdict {
  /** What this write needs before it may execute (AZ-4). */
  readonly requirement: RequirementKind;
  /**
   * The policy's deadline for this write, in milliseconds. Applied by GT-4, after
   * the chain. A whole number, one or more; anything else is a policy contract
   * violation and refused (`wireup-invalid`).
   */
  readonly ttlMs?: number;
  /** The risk ceiling, on a `"StandingOrder"` verdict only (GT-5). */
  readonly threshold?: number;
  /** Why, in one line, for the reviewer's card. */
  readonly reason?: string;
}

/**
 * A host's approval policy.
 *
 * `declaresThreshold` is the **static** twin of {@link Verdict.threshold}: a policy
 * says up front whether any verdict it can return will name a threshold, so
 * `createGate` can refuse a gate whose policies need a scorer it was not given
 * (CV-1) — at wire-up, before a single proposal, rather than on the unlucky request
 * that first happens to reach the threshold branch. GT-5 is explicit that this is a
 * configuration error and "never a silent non-fire", and a check that only fires on
 * some inputs is a silent non-fire on the others.
 */
export interface ApprovalPolicy {
  /** The host's id for this policy. Written into a Standing Order attestation (AZ-1). */
  readonly id: string;
  /** The version of the policy that is speaking, so a later reader knows what it said. */
  readonly version: string;
  /**
   * The provenance sources this policy predicates on (PV-4). Empty for a policy that
   * looks only at values or host state.
   */
  readonly declaredInputs: readonly ProvenanceSource[];
  /** Whether any verdict this policy can return names a {@link Verdict.threshold} (GT-5, CV-1). */
  readonly declaresThreshold?: boolean;
  /**
   * The policy's default TTL, used when its verdict names none (GT-4). Held to the
   * same rule as {@link Verdict.ttlMs}: a whole number of milliseconds, one or more.
   * `createGate` refuses a policy carrying anything else at wire-up (CV-1).
   */
  readonly defaultTtlMs?: number;
  /** What this policy says about `affidavit` in `ctx`, or `null` for no opinion. */
  evaluate(affidavit: Affidavit, ctx: TurnContext): Promise<Verdict | null>;
}

/**
 * The field and grade that failed PV-4: a tag the winning policy declared it
 * predicates on, above `Conversation`, pointing at nothing.
 */
export interface UnboundInput {
  /** The field carrying the tag. */
  readonly field: string;
  /** The grade the tag claims. */
  readonly source: ProvenanceSource;
}

/**
 * What the chain decided, with everything the filing step needs to write the row.
 *
 * `requirement` rather than `verdict.requirement` because the two differ exactly
 * when a degrade happened, and the row records the requirement that is **in force**.
 * `degradedFrom` keeps the fact of the degrade visible; PV-4 and GT-5 are both
 * "asked a person instead", and a record that did not say so would look like a
 * policy that simply asked for confirmation.
 */
export interface PolicyOutcome {
  /** The verdict the winning policy returned, or the default. */
  readonly verdict: Verdict;
  /** The policy that spoke, or `null` when none did. */
  readonly policy: ApprovalPolicy | null;
  /** The requirement in force after PV-4 and GT-5 have had their say. */
  readonly requirement: RequirementKind;
  /** `verdict.ttlMs ?? policy.defaultTtlMs`, or `null` to fall through to the gate's default (GT-4). */
  readonly ttlMs: number | null;
  /** `"StandingOrder"` when a Standing Order was not honoured, else `null`. */
  readonly degradedFrom: "StandingOrder" | null;
  /** Why, in one line: the policy's own reason, or the reason the degrade happened. */
  readonly reason: string | null;
  /** The score the host's scorer returned, or `null` when no threshold was compared. */
  readonly riskScore: number | null;
  /** The tag that failed PV-4, or `null`. */
  readonly unboundInput: UnboundInput | null;
  /**
   * The proposed fields marked mandatory that read `Empty` and so stopped a Standing
   * Order from firing (GT-5), or `null` when that check did not block.
   *
   * `null` rather than an empty array, the same way {@link PolicyOutcome.unboundInput}
   * is `null`: the property says *this is why the verdict degraded*, and a list that
   * was empty on every other outcome would read as "checked and found nothing" on
   * verdicts where the check never ran.
   */
  readonly emptyMandatoryFields: readonly string[] | null;
}

/** What {@link evaluatePolicies} is given beyond the policies themselves. */
export interface PolicyChainDeps {
  /** The host's risk function (GT-5). Absent unless a policy declares a threshold. */
  readonly riskScorer?: RiskScorer | undefined;
  /** Where a `standing-order.blocked` event goes. */
  readonly telemetry?: TelemetryPort | undefined;
  /** The instant to stamp on a telemetry event. Passed in; nothing here reads a clock. */
  readonly now: string;
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/**
 * Run `policies` in order and return the first non-null verdict, with PV-4 and GT-5
 * applied to it; `"ReviewerConfirmation"` when no policy speaks.
 *
 * The three checks run **only** on a `"StandingOrder"` verdict, because they are all
 * about approving with no person present, and in this order:
 *
 * 1. **GT-5, the empty required field.** No proposed field marked mandatory may read
 *    `Empty`. First because it is the cheapest read and the least conditional: it
 *    depends on nothing the policy declared and nothing a host port returns, so a
 *    proposal with a hole in it degrades identically under every wiring.
 * 2. **PV-4.** Every field whose tag in force names one of the policy's
 *    {@link ApprovalPolicy.declaredInputs} and sits above `Conversation` must carry
 *    a binding. The first that does not degrades the verdict. Checked first because
 *    it is a pure read of the Affidavit — there is no reason to spend a host's
 *    scorer on a verdict that is already going to a person.
 * 3. **GT-5, the threshold.** A verdict that names a {@link Verdict.threshold} fires iff
 *    `score <= threshold`. The comparison is written as `!(score <= threshold)` so
 *    that a `NaN` score — a scorer that failed to produce a number — blocks rather
 *    than fires. A verdict that names no threshold fires on the verdict alone.
 *
 * More than one check can be true of the same proposal. The first one to fire is the
 * one the record names, and the row degrades exactly once: `requirement` reads
 * `"ReviewerConfirmation"` and `degradedFrom` reads `"StandingOrder"` however many
 * of them applied.
 *
 * Only the tag **in force** on each field is checked, not the superseded tags in the
 * chain behind it: PV-4 asks what the verdict rests on, and a verdict rests on the
 * values the Affidavit currently swears to. The displaced tags stay on the record for
 * a reviewer to read.
 *
 * @throws AffiantError `"wireup-invalid"` in three cases, all of them a policy
 *         breaking its own contract: a verdict names a threshold and no scorer was
 *         supplied (`createGate` refuses this at wire-up from
 *         {@link ApprovalPolicy.declaresThreshold}; this is the backstop for a policy
 *         that returned a threshold without declaring it could); a verdict's `ttlMs`
 *         or the policy's `defaultTtlMs` is not a whole number of milliseconds, one
 *         or more (GT-4); or the policy's `evaluate` threw. In every case nothing is
 *         filed and a `policy.invalid` event is on the telemetry port before the
 *         throw.
 * @throws RangeError if a verdict names a requirement that is not one of the four, or
 *         names a threshold on a requirement other than `"StandingOrder"`.
 */
export async function evaluatePolicies(
  policies: readonly ApprovalPolicy[],
  affidavit: Affidavit,
  ctx: TurnContext,
  deps: PolicyChainDeps,
): Promise<PolicyOutcome> {
  for (const policy of policies) {
    const verdict = await evaluateOne(deps, policy, affidavit, ctx);
    if (verdict === null || verdict === undefined) continue;
    checkVerdict(deps, policy, verdict);

    // GT-4: the fallback is read here, so it is checked here too — a policy whose
    // verdict names no deadline and whose own default is unusable must not reach the
    // filing step with a number that cannot be stamped.
    if (verdict.ttlMs === undefined) {
      checkTtlMs(deps, policy, "defaultTtlMs", policy.defaultTtlMs);
    }

    const ttlMs = verdict.ttlMs ?? policy.defaultTtlMs ?? null;
    const base = {
      verdict,
      policy,
      ttlMs,
      reason: verdict.reason ?? null,
      degradedFrom: null,
      riskScore: null,
      unboundInput: null,
      emptyMandatoryFields: null,
    } as const;

    if (verdict.requirement !== "StandingOrder") {
      return { ...base, requirement: verdict.requirement };
    }

    // GT-5: a Standing Order never fires over a required field with no known value.
    const empties = emptyMandatoryFields(affidavit);
    if (empties.length > 0) {
      const reason =
        `GT-5: ${empties.map((name) => JSON.stringify(name)).join(", ")} ` +
        `${empties.length === 1 ? "is a field" : "are fields"} the entity requires and ` +
        `${empties.length === 1 ? "it has" : "they have"} no known value; a Standing Order ` +
        `does not fire over an empty required field, and a person is asked instead`;
      emitBlocked(deps, policy, { reason, code: "mandatory-field-empty", fields: empties });
      return {
        ...base,
        requirement: "ReviewerConfirmation",
        degradedFrom: "StandingOrder",
        reason,
        emptyMandatoryFields: empties,
      };
    }

    // PV-4.
    const unbound = unboundDeclaredInput(policy, affidavit);
    if (unbound !== null) {
      const reason =
        `PV-4: the Standing Order predicates on ${unbound.source}, and ` +
        `${JSON.stringify(unbound.field)} carries a ${unbound.source} tag with no binding; ` +
        `a person is asked instead`;
      emitBlocked(deps, policy, {
        reason,
        code: "unbound-declared-input",
        field: unbound.field,
        source: unbound.source,
      });
      return {
        ...base,
        requirement: "ReviewerConfirmation",
        degradedFrom: "StandingOrder",
        reason,
        unboundInput: unbound,
      };
    }

    // GT-5.
    if (verdict.threshold !== undefined) {
      const scorer = deps.riskScorer;
      if (scorer === undefined) {
        throw new AffiantError(
          "wireup-invalid",
          `GT-5: policy ${JSON.stringify(policy.id)} returned a Standing Order with a risk ` +
            `threshold and no riskScorer was supplied; this package ships no scoring formula. ` +
            `Supply GateOptions.riskScorer, and declare \`declaresThreshold: true\` on the ` +
            `policy so the gate can refuse this at wire-up (CV-1) rather than here.`,
          { policyId: policy.id, threshold: verdict.threshold },
        );
      }
      const score = await scorer.score(affidavit, ctx);
      if (!(score <= verdict.threshold)) {
        const reason =
          `GT-5: the host's risk score ${String(score)} is above the Standing Order's ` +
          `threshold ${String(verdict.threshold)}; a person is asked instead`;
        emitBlocked(deps, policy, {
          reason,
          code: "risk-above-threshold",
          score,
          threshold: verdict.threshold,
        });
        return {
          ...base,
          requirement: "ReviewerConfirmation",
          degradedFrom: "StandingOrder",
          reason,
          riskScore: score,
        };
      }
      return { ...base, requirement: "StandingOrder", riskScore: score };
    }

    return { ...base, requirement: "StandingOrder" };
  }

  return {
    verdict: { requirement: "ReviewerConfirmation" },
    policy: null,
    requirement: "ReviewerConfirmation",
    ttlMs: null,
    degradedFrom: null,
    reason: null,
    riskScore: null,
    unboundInput: null,
    emptyMandatoryFields: null,
  };
}

/**
 * Ask one policy, turning a throw out of its `evaluate` into a stated refusal.
 *
 * A host's policy that throws is a host bug, but it reaches the gate through the tool
 * seam, and an unhandled `TypeError` out of a gated `execute` tells a host nothing it
 * can branch on and tells the model nothing at all. So it becomes an
 * {@link AffiantError} carrying `"wireup-invalid"` — the same code every other
 * "this gate is wired wrong" refusal carries — which `wrap` hands back as
 * `{ kind: "error" }`, with the original message inlined so the bug is still
 * findable. **Nothing is filed:** the throw happens in step 7, before the pipeline
 * reaches step 9.
 *
 * An {@link AffiantError} thrown by the policy itself passes through untouched, so a
 * policy that deliberately refuses keeps its own code.
 */
async function evaluateOne(
  deps: PolicyChainDeps,
  policy: ApprovalPolicy,
  affidavit: Affidavit,
  ctx: TurnContext,
): Promise<Verdict | null> {
  try {
    return await policy.evaluate(affidavit, ctx);
  } catch (cause) {
    if (isAffiantError(cause)) throw cause;
    const reason =
      `CV-1: policy ${JSON.stringify(policy.id)} threw from evaluate — ${messageOf(cause)}. ` +
      `A policy that cannot answer is a wiring the gate cannot run: nothing is filed, and the ` +
      `call is refused rather than the throw escaping through the tool seam.`;
    emitPolicyInvalid(deps, policy, "evaluate", reason);
    throw new AffiantError("wireup-invalid", reason, {
      policyId: policy.id,
      option: "evaluate",
      cause: messageOf(cause),
    });
  }
}

/**
 * The first field whose tag in force is a grade the policy predicates on, sits above
 * `Conversation`, and points at nothing (PV-4), or `null` when every declared input
 * is honourable.
 *
 * Exported because it is the whole of PV-4's runtime half and a fixture should be
 * able to ask it directly, without staging a policy that returns a Standing Order.
 */
export function unboundDeclaredInput(
  policy: ApprovalPolicy,
  affidavit: Affidavit,
): UnboundInput | null {
  const declared = new Set<ProvenanceSource>(policy.declaredInputs);
  for (const field of affidavit.fields) {
    const tag = field.provenance.current;
    if (!declared.has(tag.source)) continue;
    if (!requiresBinding(tag.source)) continue;
    if (isHonourable(tag)) continue;
    return { field: field.name, source: tag.source };
  }
  return null;
}

/**
 * The proposed fields marked mandatory whose tag in force is `Empty` — a field the
 * entity requires, sworn to with no known value — in the order the Affidavit lists
 * them. Empty when there are none.
 *
 * `Empty` is the tag AF-1 puts on a proposed field whose provenance is unknown, which
 * is what the pipeline writes when nothing — no interceptor, no inference, no host
 * argument — produced a value for it. So this is exactly "the model could not fill a
 * field the write needs", asked of the record rather than of a confidence number.
 *
 * Exported because it is the whole of the rule's runtime half and a fixture should be
 * able to ask it directly, without staging a policy that returns a Standing Order.
 */
export function emptyMandatoryFields(affidavit: Affidavit): readonly string[] {
  const out: string[] = [];
  for (const field of affidavit.fields) {
    if (!field.isMandatory) continue;
    if (field.provenance.current.source !== "Empty") continue;
    out.push(field.name);
  }
  return out;
}

/**
 * Refuse a verdict this package cannot act on.
 *
 * Two arms are a `RangeError` rather than an {@link AffiantError}: a policy that
 * names a requirement outside the four, or hangs a risk threshold off a requirement
 * that has nothing to compare, is a programming error in the host's policy and not a
 * refusal the gate is handing back to a model.
 *
 * The third arm — an unusable deadline — is an `AffiantError` carrying
 * `"wireup-invalid"`, and deliberately so. `createGate` already refuses
 * `GateOptions.defaultTtlMs` with that code (CV-1); a policy naming the *same value*
 * badly is the same misconfiguration arriving one layer down, and the failure it
 * replaces is silent — a `ttlMs` of `0` files a Docket row that satisfies every
 * invariant and reads `expired` on the read that files it, so the write the gate was
 * standing in front of simply never happens. A code a host can branch on, and that
 * `wrap` hands back as `{ kind: "error" }`, is the answer; a bare `RangeError` out of
 * the tool seam is not.
 */
function checkVerdict(deps: PolicyChainDeps, policy: ApprovalPolicy, verdict: Verdict): void {
  if (!(REQUIREMENT_KINDS as readonly string[]).includes(verdict.requirement)) {
    throw new RangeError(
      `AZ-4: policy ${JSON.stringify(policy.id)} returned an unknown requirement ` +
        `${JSON.stringify(verdict.requirement)}; the four are ${REQUIREMENT_KINDS.join(", ")}`,
    );
  }
  if (verdict.threshold !== undefined && verdict.requirement !== "StandingOrder") {
    throw new RangeError(
      `GT-5: policy ${JSON.stringify(policy.id)} put a risk threshold on a ` +
        `${verdict.requirement} verdict; a threshold is the ceiling a Standing Order fires ` +
        `under, and means nothing on a requirement that asks a person`,
    );
  }
  checkTtlMs(deps, policy, "ttlMs", verdict.ttlMs);
}

/**
 * Whether `ttlMs` is a deadline: a finite whole number of milliseconds, one or more.
 *
 * Exported so `createGate` holds {@link ApprovalPolicy.defaultTtlMs} and
 * `GateOptions.defaultTtlMs` to one definition rather than two that can drift.
 */
export function isUsableTtlMs(ttlMs: unknown): ttlMs is number {
  return typeof ttlMs === "number" && Number.isInteger(ttlMs) && ttlMs >= 1;
}

/**
 * The refusal message for a policy that named an unusable deadline. One function so
 * the wire-up refusal and the per-request one read identically.
 */
export function unusableTtlMessage(
  policyId: string,
  option: "ttlMs" | "defaultTtlMs",
  ttlMs: unknown,
): string {
  return (
    `GT-4: policy ${JSON.stringify(policyId)} named ${option} ${String(ttlMs)}; a deadline is a ` +
    `whole number of milliseconds, one or more. A zero or negative one files an entry that is ` +
    `already past its deadline, which no person can ever decide and which no rule would show as ` +
    `a failure; a fractional or non-numeric one has no instant to stamp at all.`
  );
}

/** Refuse an unusable `ttlMs` from a verdict or from the policy's own default (GT-4). */
function checkTtlMs(
  deps: PolicyChainDeps,
  policy: ApprovalPolicy,
  option: "ttlMs" | "defaultTtlMs",
  ttlMs: number | undefined,
): void {
  if (ttlMs === undefined || isUsableTtlMs(ttlMs)) return;
  const reason = unusableTtlMessage(policy.id, option, ttlMs);
  emitPolicyInvalid(deps, policy, option, reason);
  throw new AffiantError("wireup-invalid", reason, {
    policyId: policy.id,
    option,
    ttlMs: String(ttlMs),
  });
}

/** Emit `policy.invalid`, naming the policy and which half of its contract it broke. */
function emitPolicyInvalid(
  deps: PolicyChainDeps,
  policy: ApprovalPolicy,
  option: "ttlMs" | "defaultTtlMs" | "evaluate",
  reason: string,
): void {
  deps.telemetry?.emit({
    key: "policy.invalid",
    at: deps.now,
    attributes: {
      "policy.id": policy.id,
      "policy.version": policy.version,
      option,
      reason,
    },
  });
}

/** The message of a throw, without assuming it was an `Error`. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Why a Standing Order was not honoured, as a value an operator can alert on.
 *
 * Separate from the sentence in `reason`, which is written for the person reading the
 * card and is free to be rephrased. A dashboard that counted degrades by matching on
 * prose would break the first time the wording improved.
 */
export type StandingOrderBlockedReason =
  "mandatory-field-empty" | "unbound-declared-input" | "risk-above-threshold";

/** Emit `standing-order.blocked`, naming the policy and why it was not honoured. */
function emitBlocked(
  deps: PolicyChainDeps,
  policy: ApprovalPolicy,
  detail: {
    readonly reason: string;
    readonly code: StandingOrderBlockedReason;
    readonly field?: string;
    readonly source?: ProvenanceSource;
    readonly fields?: readonly string[];
    readonly score?: number;
    readonly threshold?: number;
  },
): void {
  deps.telemetry?.emit({
    key: "standing-order.blocked",
    at: deps.now,
    attributes: {
      "policy.id": policy.id,
      "policy.version": policy.version,
      "blocked.reason": detail.code,
      reason: detail.reason,
      "provenance.field": detail.field ?? null,
      "provenance.source": detail.source ?? null,
      // Field *names*, which are schema; never a field value. Telemetry is
      // operational and the audit record is the Affidavit.
      "affidavit.empty_mandatory_fields": detail.fields?.join(", ") ?? null,
      "risk.score": detail.score ?? null,
      "risk.threshold": detail.threshold ?? null,
    },
  });
}
