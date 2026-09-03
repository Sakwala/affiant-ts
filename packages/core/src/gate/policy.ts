/**
 * The approval-policy chain: what a write needs before it may execute, and the two
 * checks that stop a person-free approval from resting on something uncheckable.
 *
 * **Rules served: AZ-4** (the four requirement kinds; a level this version does not
 * run is recorded verbatim and blocked, never degraded to a weaker one), **PV-4** (a
 * verdict with no person present never depends on an unbound tag above
 * `Conversation`), **GT-5** (the risk function and its thresholds are host-supplied;
 * this package owns only the comparison), **CV-1** (a declared threshold with no
 * scorer is a wire-up error, raised in `gate.ts` before any evaluation).
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
 * When either check fails the verdict does not disappear and the proposal is not
 * thrown away: the requirement degrades to `"ReviewerConfirmation"` and a person is
 * asked. Degrading *toward* a person is always safe; AZ-4's prohibition is on
 * degrading to something weaker, which is the other direction.
 *
 * @packageDocumentation
 */

import type { TurnContext } from "../context.js";
import type { RequirementKind } from "../docket/entry.js";
import { REQUIREMENT_KINDS } from "../docket/entry.js";
import { AffiantError } from "../errors.js";
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
 * five minutes can say so. `threshold` is meaningful on a `"StandingOrder"` verdict
 * only — it is the ceiling a host-supplied {@link RiskScorer}'s score must not
 * exceed — and naming one on any other requirement is a caller bug, not a request
 * (a `RangeError`, per ledger BD-31's sixth ruling). `reason` is carried onto the
 * reviewer's card so a person can see why they are being asked.
 */
export interface Verdict {
  /** What this write needs before it may execute (AZ-4). */
  readonly requirement: RequirementKind;
  /** The policy's deadline for this write, in milliseconds. Applied by GT-4, after the chain. */
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
  /** The policy's default TTL, used when its verdict names none (GT-4). */
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
 * The two checks run **only** on a `"StandingOrder"` verdict, because they are both
 * about approving with no person present, and in this order:
 *
 * 1. **PV-4.** Every field whose tag in force names one of the policy's
 *    {@link ApprovalPolicy.declaredInputs} and sits above `Conversation` must carry
 *    a binding. The first that does not degrades the verdict. Checked first because
 *    it is a pure read of the Affidavit — there is no reason to spend a host's
 *    scorer on a verdict that is already going to a person.
 * 2. **GT-5.** A verdict that names a {@link Verdict.threshold} fires iff
 *    `score <= threshold`. The comparison is written as `!(score <= threshold)` so
 *    that a `NaN` score — a scorer that failed to produce a number — blocks rather
 *    than fires. A verdict that names no threshold fires on the verdict alone.
 *
 * Only the tag **in force** on each field is checked, not the superseded tags in the
 * chain behind it: PV-4 asks what the verdict rests on, and a verdict rests on the
 * values the Affidavit currently swears to. The displaced tags stay on the record for
 * a reviewer to read.
 *
 * @throws AffiantError `"wireup-invalid"` if a verdict names a threshold and no
 *         scorer was supplied. `createGate` refuses this at wire-up from
 *         {@link ApprovalPolicy.declaresThreshold}; this is the backstop for a policy
 *         that returned a threshold without declaring it could.
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
    const verdict = await policy.evaluate(affidavit, ctx);
    if (verdict === null || verdict === undefined) continue;
    checkVerdict(policy, verdict);

    const ttlMs = verdict.ttlMs ?? policy.defaultTtlMs ?? null;
    const base = {
      verdict,
      policy,
      ttlMs,
      reason: verdict.reason ?? null,
      degradedFrom: null,
      riskScore: null,
      unboundInput: null,
    } as const;

    if (verdict.requirement !== "StandingOrder") {
      return { ...base, requirement: verdict.requirement };
    }

    // PV-4.
    const unbound = unboundDeclaredInput(policy, affidavit);
    if (unbound !== null) {
      const reason =
        `PV-4: the Standing Order predicates on ${unbound.source}, and ` +
        `${JSON.stringify(unbound.field)} carries a ${unbound.source} tag with no binding; ` +
        `a person is asked instead`;
      emitBlocked(deps, policy, { reason, field: unbound.field, source: unbound.source });
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
        emitBlocked(deps, policy, { reason, score, threshold: verdict.threshold });
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
  };
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
 * Refuse a verdict this package cannot act on.
 *
 * `RangeError` rather than {@link AffiantError}: a policy that names a requirement
 * outside the four, or hangs a risk threshold off a requirement that has nothing to
 * compare, is a programming error in the host's policy, not a refusal the gate is
 * handing back to a model (ledger BD-31, sixth ruling).
 */
function checkVerdict(policy: ApprovalPolicy, verdict: Verdict): void {
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
}

/** Emit `standing-order.blocked`, naming the policy and why it was not honoured. */
function emitBlocked(
  deps: PolicyChainDeps,
  policy: ApprovalPolicy,
  detail: {
    readonly reason: string;
    readonly field?: string;
    readonly source?: ProvenanceSource;
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
      reason: detail.reason,
      "provenance.field": detail.field ?? null,
      "provenance.source": detail.source ?? null,
      "risk.score": detail.score ?? null,
      "risk.threshold": detail.threshold ?? null,
    },
  });
}
