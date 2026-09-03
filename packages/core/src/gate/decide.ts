/**
 * Decisions: who may make one, what it attests to, what it does to the row, and how
 * a refused one is resubmitted.
 *
 * **Rules served: AZ-1** (every decided row carries an attestation record naming who
 * agreed, when, and to which entry), **AZ-2** (tenant-scoped, fail-closed decision
 * authorization, checked by the framework before any transition), **AZ-3** (what
 * identity may attest what — a machine caller may never attest `member`), **AZ-4** (a
 * blocked entry refuses every decision), **AZ-5** (the Docket is the sole record of
 * approval authority: the only way to `executed` is a report against an approved,
 * attested row), **AZ-6** (nothing here is conditional on a port, a model or a
 * transport being available, so there is no degraded path that skips a check),
 * **AZ-7** (the gate never performs the write — there is no executor port and no
 * method that calls one), **DK-1** (the guarded compare-and-set, expiry as state with
 * the late decision's amendments preserved, the execution outcome, resubmission
 * lineage), **DK-2** (`null` clears, absent leaves untouched), **DK-5** (rehydration
 * order), **AF-4** (an accepted amendment recomputes the three numbers), **PV-2** (an
 * amended field's tag carries a `reviewer-act` binding naming the decision).
 *
 * ## The order the checks run in, and why it is this order
 *
 * 1. **No resolved principal → refused, before the store is touched.** AZ-2's
 *    "fail closed, never *identity unknown, allow*" is not only about the answer; it
 *    is about not doing any work on an entry for a caller who has not been
 *    identified. A read that happened before the refusal is a read an attacker can
 *    time.
 * 2. **The entry is fetched inside the caller's tenant.** A row in another tenant is
 *    reported as `entry-not-found`, exactly as an id that never existed — never
 *    "not authorized for that tenant", which would be an oracle for guessing ids.
 * 3. **The host's authorization port.** Its answer is the host's own — role,
 *    ownership, separation of duties. A port that throws is a refusal.
 * 4. **What the entry reads *now*.** Expiry is state (DK-1): a row past its deadline
 *    reads `expired` whether or not the host's sweep has run, and a decision on it is
 *    refused with the amendments it carried preserved for a resubmission — provided
 *    the caller could have attested at all, because those values come back as a
 *    person's act on the resubmission (PV-3).
 * 5. **The attestation.** Built from the principal, and *only* from the principal:
 *    there is no parameter through which a caller can name whose signature this is.
 * 6. **The transition**, a guarded compare-and-set that is applied once or not at
 *    all.
 *
 * ## Why there is no `execute`
 *
 * AZ-7 says no package in an implementation writes to a host's store, and the gate
 * has no executor port to call. The path to `execution: "executed"` is
 * {@link markExecuted} — the host's own executor telling the Docket what happened.
 * That is also why a `service` principal is admitted there and refused as a decider
 * here: reporting an outcome is a statement of fact about work the host did, and a
 * decision is an act of authority a machine may not perform on a person's behalf
 * (AZ-3).
 *
 * @packageDocumentation
 */

import type { Principal, TurnContext } from "../context.js";
import type { Attestation, Attestor, DocketEntry, ExecutionOutcome } from "../docket/entry.js";
import { readStatus } from "../docket/entry.js";
import type { Scope, SessionStore, TransitionPatch } from "../docket/store.js";
import { AffiantError } from "../errors.js";
import type { Affidavit } from "../model/affidavit.js";
import type { AmendmentMap } from "../model/amendments.js";
import { applyAmendments, resolveAmendments } from "../model/amendments.js";
import type { Binding } from "../model/provenance.js";
import { mintTag, supersede } from "../model/provenance.js";
import type { AuthorizationPort, Operation } from "../ports.js";

import type { FiledEntry, PipelineDeps, PipelineProposal, PreparedField } from "./pipeline.js";
import { runPipeline } from "./pipeline.js";

// ---------------------------------------------------------------------------
// What a reviewer says
// ---------------------------------------------------------------------------

/**
 * What a reviewer decided.
 *
 * Amending is not a third kind: it is an approval carrying an
 * {@link AmendmentMap} (DK-2). Modelling it as a separate verb would let an
 * implementation record an amendment that approved nothing, and a reviewer who
 * corrects a field has, by correcting it, said what they are prepared to approve.
 *
 * A rejection requires a reason and an approval does not, for the asymmetric reason
 * that a person who declines a machine's proposal is the only one who knows why,
 * whereas an approval's reason is the Affidavit.
 */
export type Decision =
  | {
      /** Approve the write, as proposed or as amended. */
      readonly kind: "approve";
      /** The reviewer's corrections. `null` under a key clears the field; an absent key leaves it untouched (DK-2). */
      readonly amendments?: AmendmentMap;
      /** Why, for the record. Optional: the Affidavit is the reason. */
      readonly reason?: string;
    }
  | {
      /** Refuse the write. */
      readonly kind: "reject";
      /** Why. Required — a refusal nobody explained teaches the host nothing. */
      readonly reason: string;
    };

/**
 * What a host's executor reports back: the write happened, or it did not.
 *
 * `"unexecuted"` is excluded because it is the state a row is *filed* in, never a
 * report — an executor that has nothing to say says nothing.
 */
export type ExecutionReport = Exclude<ExecutionOutcome, "unexecuted">;

/** Everything the decision path needs from the host, assembled once by `createGate`. */
export interface DecideDeps extends PipelineDeps {
  /** Who may decide an entry (AZ-2). The gate has already refused the cases this port must not be asked about. */
  readonly authorization: AuthorizationPort;
  /** The rehydration surface (DK-5), or `null` when the host supplied none. */
  readonly sessions: SessionStore | null;
}

/** Which entry point a refusal came from, for the host's telemetry. */
type DecisionPath = "decide" | "mark-executed" | "resubmit";

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

/**
 * Approve, amend or reject the entry `entryId` names, as `ctx.principal` (DK-1,
 * AZ-1, AZ-2, AZ-3).
 *
 * @returns The row as it stands after the transition.
 * @throws AffiantError `"decision-unauthorized"` when the context carries no
 *         resolved principal, when the host's authorization port says no, or when a
 *         machine caller with nothing to relay tries to attest (AZ-2, AZ-3);
 *         `"entry-not-found"` when no entry with that id is visible in the caller's
 *         tenant; `"decision-expired"` when the entry has passed its deadline — the
 *         decision's amendments are preserved on the row first (DK-1);
 *         `"decision-not-pending"` when it has already been decided or is blocked
 *         (AZ-4); `"decision-lost-race"` when a competing decision won the guarded
 *         compare-and-set.
 * @throws RangeError when an amendment map holds `undefined` under a key, or names a
 *         field the Affidavit does not propose. Neither is a refusal the gate hands
 *         back to a caller: they are caller programming errors, and an `AffiantError`
 *         code would invite a host to catch and continue.
 */
export async function decide(
  entryId: string,
  decision: Decision,
  ctx: TurnContext,
  deps: DecideDeps,
): Promise<DocketEntry> {
  const now = deps.clock.now();
  const scope: Scope = { tenantId: ctx.tenantId };

  // (i) AZ-2, fail closed — before any store call at all.
  const principal = requirePrincipal(ctx, entryId, "decide", deps, now);

  // (ii) The tenant is the boundary, and a miss is a miss (AZ-2).
  const entry = await requireEntry(entryId, ctx, "decide", deps, now);

  // (iii) The host's own answer.
  await requireAuthorized(principal, entry, ctx, "decide", deps, now);

  // (iv) What the entry reads now (DK-1).
  const amendments = decision.kind === "approve" ? (decision.amendments ?? null) : null;
  const reads = readStatus(entry, now);
  if (reads === "expired") {
    throw await refuseExpired(entryId, scope, entry, amendments, principal, deps);
  }
  if (reads !== "pending") {
    throw new AffiantError(
      "decision-not-pending",
      `DK-1: Docket entry ${JSON.stringify(entryId)} reads ${reads}; a decision is accepted ` +
        `only while an entry is pending, and a recorded decision is never overwritten.`,
      { entryId, status: reads },
    );
  }
  if (entry.blocked !== null) {
    // AZ-4: an entry the implementation will not decide refuses every decision on it
    // and is never degraded to a requirement this version does know how to run.
    throw new AffiantError(
      "decision-not-pending",
      `AZ-4: Docket entry ${JSON.stringify(entryId)} is blocked ` +
        `(${entry.blocked.code}); every decision on it is refused, and it is never ` +
        `degraded to a weaker requirement.`,
      {
        entryId,
        blocked: entry.blocked.code,
        ...(entry.blocked.level === undefined ? {} : { level: entry.blocked.level }),
        ...(entry.blocked.category === undefined ? {} : { category: entry.blocked.category }),
      },
    );
  }

  // (v) Who is being held to this (AZ-1, AZ-3).
  const attestor = attestorOf(principal);
  if (attestor === null) {
    throw refuseUnauthorized(
      entryId,
      ctx,
      "decide",
      "machine-attestation",
      `AZ-3: a machine caller cannot attest a decision. A service principal decides only on ` +
        `behalf of a person it names, over a relay it names — both \`assertedMember\` and ` +
        `\`relay\` — and the result attests member-via-relay. There is no path by which a ` +
        `service attests member.`,
      deps,
      now,
    );
  }
  const attestation: Attestation = { by: attestor, at: now, entryId };

  // (vi) The amendment, if there is one (DK-2, AF-4, PV-2).
  const amended: Affidavit | null =
    decision.kind === "approve" && amendments !== null
      ? applyAmendments(entry.affidavit, amendments, {
          entryId,
          decisionAt: now,
          by: subjectOf(attestor),
        })
      : null;

  // (vii) The guarded compare-and-set (DK-1).
  const patch: TransitionPatch = {
    status: decision.kind === "approve" ? "approved" : "rejected",
    execution: decision.kind === "approve" ? "unexecuted" : null,
    decision: { kind: decision.kind, reason: decision.reason ?? null, at: now },
    amendments,
    attestation,
    decidedAt: now,
    ...(amended === null ? {} : { affidavit: amended }),
  };

  const result = await deps.store.transition(entryId, scope, "pending", patch);
  if (result === "not-found") {
    // The row was purged between the read and the write. Same answer as an id that
    // never existed: the caller learns nothing they did not already know.
    throw notFound(entryId, ctx);
  }
  if (result === "already-decided") {
    throw new AffiantError(
      "decision-lost-race",
      `DK-1: another decision on Docket entry ${JSON.stringify(entryId)} was applied first. ` +
        `A transition out of pending happens once or not at all — this one is refused, not ` +
        `queued and not applied on top.`,
      { entryId },
    );
  }
  if (result === "expired") {
    // The store's guard saw a state this function's own read did not. The only way
    // that happens is a deadline crossed in between, so re-read to say so precisely
    // rather than reporting a race that did not occur.
    const current = await deps.store.get(entryId, scope);
    if (current === null) throw notFound(entryId, ctx);
    if (readStatus(current, deps.clock.now()) === "expired") {
      throw await refuseExpired(entryId, scope, current, amendments, principal, deps);
    }
    throw new AffiantError(
      "decision-not-pending",
      `DK-1: Docket entry ${JSON.stringify(entryId)} is no longer pending.`,
      { entryId, status: readStatus(current, deps.clock.now()) },
    );
  }

  deps.telemetry.emit({
    key: "docket.transition",
    at: now,
    attributes: {
      "entry.id": entryId,
      "gen_ai.conversation.id": ctx.conversationId,
      from: "pending",
      to: result.status,
      execution: result.execution,
      "decision.kind": decision.kind,
      "attestation.kind": attestor.kind,
      amended: amended !== null,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// markExecuted
// ---------------------------------------------------------------------------

/**
 * Record what the host's executor did with an approved write (DK-1, AZ-5, AZ-7).
 *
 * `status` stays `approved` — the approval happened and is not undone by a failed
 * write; only `execution` and `executionDetail` move. This is the **only** public
 * path to `execution: "executed"`, and the gate never calls an executor to reach it:
 * a host reads its approved-and-unexecuted rows (DK-5), does the write itself, and
 * says what happened.
 *
 * A `service` principal is admitted here and refused as a decider (AZ-3). The
 * asymmetry is the point: reporting an outcome is a statement of fact about work the
 * host performed, which a machine is the right party to make, while a decision is an
 * act of authority that a machine may never make in a person's name. The tenant check
 * and the host's authorization port still apply, so "which service may report on this
 * entry" is still the host's answer and not an open door.
 *
 * @throws AffiantError `"decision-unauthorized"`, `"entry-not-found"`, or
 *         `"decision-not-pending"` when the row is not `approved`.
 */
export async function markExecuted(
  entryId: string,
  outcome: ExecutionReport,
  detail: string | null,
  ctx: TurnContext,
  deps: DecideDeps,
): Promise<DocketEntry> {
  const now = deps.clock.now();
  const scope: Scope = { tenantId: ctx.tenantId };

  const principal = requirePrincipal(ctx, entryId, "mark-executed", deps, now);
  const entry = await requireEntry(entryId, ctx, "mark-executed", deps, now);
  await requireAuthorized(principal, entry, ctx, "mark-executed", deps, now);

  const result = await deps.store.recordExecution(entryId, scope, outcome, detail);
  if (result === "not-found") throw notFound(entryId, ctx);
  if (result === "not-approved") {
    throw new AffiantError(
      "decision-not-pending",
      `DK-1, AZ-5: Docket entry ${JSON.stringify(entryId)} is not approved, so there is no ` +
        `authorised write for an executor to have performed. An execution outcome is only ` +
        `ever recorded against an approved, attested row.`,
      { entryId, status: readStatus(entry, now), outcome },
    );
  }

  deps.telemetry.emit({
    key: "docket.transition",
    at: now,
    attributes: {
      "entry.id": entryId,
      "gen_ai.conversation.id": ctx.conversationId,
      from: "approved",
      to: result.status,
      execution: result.execution,
      "decision.kind": null,
      "attestation.kind": result.attestation?.by.kind ?? null,
      amended: result.amendments !== null,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// resubmit
// ---------------------------------------------------------------------------

/**
 * File the expired entry `entryId` names again, as a **new** entry whose lineage
 * points back at it (DK-1).
 *
 * A resubmission is never a reopening. The superseded entry keeps its terminal state
 * and gains a successor link, so the history reads forward (DK-4) and nothing that
 * was once decided is quietly edited. The new proposal carries the same operation and
 * the same sworn fields, with the amendments the refused late decision left on the
 * row prefilled as values — each prefilled field tagged `UserStated` with a
 * `reviewer-act` binding naming the superseded entry (PV-2), so a reader of the new
 * card can see which values came from a person's earlier correction rather than from
 * the machine.
 *
 * The whole pipeline runs again: the policy chain gets another say, the deadline is
 * stamped afresh from that verdict (GT-4), and the substance gate applies (GT-3). A
 * resubmission is a new proposal, not a replay of an old approval.
 *
 * @throws AffiantError `"decision-unauthorized"`, `"entry-not-found"`, or
 *         `"decision-not-pending"` when the entry does not read `expired`.
 * @throws RangeError when the preserved amendment map names a field the Affidavit
 *         does not propose.
 */
export async function resubmit(
  entryId: string,
  ctx: TurnContext,
  deps: DecideDeps,
): Promise<FiledEntry> {
  const now = deps.clock.now();
  const scope: Scope = { tenantId: ctx.tenantId };

  const principal = requirePrincipal(ctx, entryId, "resubmit", deps, now);
  const entry = await requireEntry(entryId, ctx, "resubmit", deps, now);
  await requireAuthorized(principal, entry, ctx, "resubmit", deps, now);

  const reads = readStatus(entry, now);
  if (reads !== "expired") {
    throw new AffiantError(
      "decision-not-pending",
      `DK-1: Docket entry ${JSON.stringify(entryId)} reads ${reads}; only an expired entry is ` +
        `resubmitted. A pending one is still waiting for its decision, and a decided one has ` +
        `had it.`,
      { entryId, status: reads },
    );
  }

  const filed = await runPipeline(resubmissionProposal(entry, now), ctx, deps);

  // The successor link goes on afterwards and on the *other* row: an appended later
  // fact on a terminal entry (DK-4), never an edit of the decision it recorded.
  await deps.store.recordSupersession(entryId, scope, filed.entry.entryId);

  return filed;
}

/**
 * The tool name a resubmission is filed under when the row does not name one.
 *
 * A Docket entry records the Affidavit, not the tool the proposal came from, so a
 * resubmission cannot in general re-run the CV-4 coverage lookup against the original
 * tool. The one case where the name *is* on the record — an entry blocked
 * `coverage-refused`, whose marker carries it — is carried through, so an uncovered
 * tool's proposal resubmits blocked rather than resubmitting clean.
 */
const RESUBMISSION_TOOL_NAME = "affiant.resubmission";

/** The proposal a resubmission of `entry` files: same operation, amendments prefilled. */
function resubmissionProposal(entry: DocketEntry, now: string): PipelineProposal {
  const sworn = entry.affidavit;
  const fieldNames = sworn.fields.map((field) => field.name);

  if (sworn.operationType === "update" && sworn.entityId === null) {
    throw new RangeError(
      "AF-3: an update Affidavit names the entity it updates; this row names none, so there " +
        "is no write for a resubmission to propose",
    );
  }
  const operation: Operation =
    sworn.operationType === "update" && sworn.entityId !== null
      ? {
          kind: "update",
          entityType: sworn.entityType,
          entityId: sworn.entityId,
          fields: fieldNames,
        }
      : { kind: "create", entityType: sworn.entityType, entityId: null, fields: fieldNames };

  const prior = entry.amendments;
  // `resolveAmendments` is DK-2's discipline: `null` is a clear, an absent key says
  // nothing, and `undefined` under a key is refused rather than guessed at.
  const prefills = new Map(
    (prior === null ? [] : resolveAmendments(prior)).map((entry_) => [entry_.name, entry_]),
  );
  for (const name of prefills.keys()) {
    if (!fieldNames.includes(name)) {
      throw new RangeError(
        `the amendments preserved on Docket entry ${JSON.stringify(entry.entryId)} name field ` +
          `${JSON.stringify(name)}, which its Affidavit does not propose; there is nothing to ` +
          `prefill`,
      );
    }
  }

  // PV-2: the binding names the entry the correction was made on. The instant is when
  // that row left `pending` — the last moment the record can place the correction at,
  // since a decision refused as late is not itself recorded (DK-1).
  const binding: Binding = {
    kind: "reviewer-act",
    ref: { entryId: entry.entryId, decisionAt: entry.decidedAt ?? entry.expiresAt },
  };

  const preparedFields = sworn.fields.map((field): PreparedField => {
    const prefill = prefills.get(field.name);
    if (prefill === undefined) {
      return {
        name: field.name,
        kind: field.kind,
        value: field.value,
        provenance: field.provenance,
        isMandatory: field.isMandatory,
      };
    }
    return {
      name: field.name,
      kind: field.kind,
      value: prefill.amendment.kind === "clear" ? null : prefill.amendment.value,
      provenance: supersede(
        field.provenance,
        mintTag({
          source: "UserStated",
          confidence: 1,
          at: now,
          note:
            `Prefilled from the amendment carried by the decision on Docket entry ` +
            `${entry.entryId}`,
          conversationTurn: sworn.conversationTurn,
          binding,
        }),
      ),
      isMandatory: field.isMandatory,
    };
  });

  return {
    operation,
    toolName: entry.blocked?.toolName ?? RESUBMISSION_TOOL_NAME,
    schema: null,
    args: null,
    preparedFields,
    operationLabel: null,
    supersedes: entry.entryId,
    priorAmendments: prior,
  };
}

// ---------------------------------------------------------------------------
// Identity and attestation (AZ-1, AZ-2, AZ-3)
// ---------------------------------------------------------------------------

/**
 * The principal on `ctx`, or a refusal.
 *
 * Called before every store access on every entry point here. `null` means the host
 * has not resolved an identity, which is not the same as anonymous and is never
 * treated as permission (AZ-2).
 */
function requirePrincipal(
  ctx: TurnContext,
  entryId: string,
  path: DecisionPath,
  deps: DecideDeps,
  now: string,
): Principal {
  if (ctx.principal !== null) return ctx.principal;
  throw refuseUnauthorized(
    entryId,
    ctx,
    path,
    "identity-unresolved",
    `AZ-2: identity unresolved — the turn context carries no principal, so there is nobody ` +
      `to hold to a decision on Docket entry ${JSON.stringify(entryId)}. The gate fails closed ` +
      `here, before it reads the Docket: "identity unknown" is never "allow".`,
    deps,
    now,
  );
}

/** The entry inside the caller's tenant, or `entry-not-found` — never an oracle (AZ-2). */
async function requireEntry(
  entryId: string,
  ctx: TurnContext,
  path: DecisionPath,
  deps: DecideDeps,
  now: string,
): Promise<DocketEntry> {
  const entry = await deps.store.get(entryId, { tenantId: ctx.tenantId });
  if (entry !== null) return entry;
  // The host is told an attempt was made; the caller is told only that there is no
  // such entry, which is also the answer a caller in another tenant gets.
  deps.telemetry.emit({
    key: "decision.unauthorized",
    at: now,
    attributes: {
      "entry.id": entryId,
      "gen_ai.conversation.id": ctx.conversationId,
      reason: "entry-not-found",
      "principal.kind": ctx.principal?.kind ?? "unresolved",
      path,
    },
  });
  throw notFound(entryId, ctx);
}

/** The host's own answer to "may this principal act on this entry" (AZ-2). */
async function requireAuthorized(
  principal: Principal,
  entry: DocketEntry,
  ctx: TurnContext,
  path: DecisionPath,
  deps: DecideDeps,
  now: string,
): Promise<void> {
  let admitted: boolean;
  try {
    admitted = await deps.authorization.mayDecide(principal, entry);
  } catch {
    // A port that throws is a refusal, never an approval: an authorization callback
    // that fell over has not said yes.
    admitted = false;
  }
  if (admitted) return;
  throw refuseUnauthorized(
    entry.entryId,
    ctx,
    path,
    "not-authorized",
    `AZ-2: the host's authorization port did not admit this principal for Docket entry ` +
      `${JSON.stringify(entry.entryId)}.`,
    deps,
    now,
  );
}

/** A human-verified session's attestation. The only kind a `member` principal makes. */
export type MemberAttestation = Extract<Attestor, { kind: "member" }>;

/** A person's decision carried by a relay. The strongest kind a `service` principal can make. */
export type RelayAttestation = Extract<Attestor, { kind: "member-via-relay" }>;

/**
 * The strongest attestation `principal` can honestly make, or `null` when it can
 * make none (AZ-1, AZ-3).
 *
 * A `member` principal attests `member`. A `service` principal carrying both a relay
 * assertion and the person it speaks for attests `member-via-relay`, naming both — and
 * that is the *only* thing it can attest. A `service` principal with nothing to relay
 * attests nothing: it is a machine acting on its own behalf, and a machine cannot
 * agree to a write in a person's name.
 *
 * **AZ-3 is in the overloads, not only in the body.** The signature for a `service`
 * principal cannot return a `member` attestation — a compiler rejects the shortcut
 * before a reviewer has to notice it — and this is the only function in the package
 * that builds an attestation for a decision, so there is no second path to check.
 * `standing-order` is not reachable from here at all: a policy verdict writes that
 * one, in the same operation as the filing (AZ-1, GT-1 step 9).
 */
export function attestorOf(principal: Extract<Principal, { kind: "member" }>): MemberAttestation;
export function attestorOf(
  principal: Extract<Principal, { kind: "service" }>,
): RelayAttestation | null;
export function attestorOf(principal: Principal): Attestor | null;
export function attestorOf(principal: Principal): Attestor | null {
  if (principal.kind === "member") {
    return { kind: "member", id: principal.id };
  }
  const relay = principal.relay;
  const memberId = principal.assertedMember;
  if (relay === undefined || memberId === undefined) return null;
  return {
    kind: "member-via-relay",
    memberId,
    relay: {
      principal: principal.id,
      channelIdentity: relay.channelIdentity,
      messageId: relay.messageId,
    },
  };
}

/** Who an attestation is about: the person, however they reached the gate. */
function subjectOf(attestor: Attestor): string {
  switch (attestor.kind) {
    case "member":
      return attestor.id;
    case "member-via-relay":
      return attestor.memberId;
    default:
      return attestor.policyId;
  }
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** Emit the AZ-2 event and build the refusal. Thrown by the caller, so control flow reads. */
function refuseUnauthorized(
  entryId: string,
  ctx: TurnContext,
  path: DecisionPath,
  reason: string,
  message: string,
  deps: DecideDeps,
  now: string,
): AffiantError {
  deps.telemetry.emit({
    key: "decision.unauthorized",
    at: now,
    attributes: {
      "entry.id": entryId,
      "gen_ai.conversation.id": ctx.conversationId,
      reason,
      // The kind, never the id: an event stream is not an audit record, and the
      // record of who decided is the attestation on the row (AZ-1).
      "principal.kind": ctx.principal?.kind ?? "unresolved",
      path,
    },
  });
  return new AffiantError("decision-unauthorized", message, { entryId, reason });
}

/**
 * Preserve the amendments a late decision carried and refuse it (DK-1).
 *
 * The preservation is a separate store write on purpose: the compare-and-set that
 * refused the decision must not also write to the row, or "applied once or not at
 * all" stops being true. What is written is the map and nothing else — not a status,
 * not a decision record, not an attestation. Nobody decided anything here.
 *
 * Two conditions on writing it at all, both about not letting a refused call put
 * something on the record that a later resubmission would treat as a person's act:
 *
 * - the map's field names are checked against the Affidavit first, exactly as
 *   `applyAmendments` checks them on the path that was not late, so a caller learns
 *   about a bad field name here rather than in whoever resubmits the entry;
 * - the caller must be able to attest at all (AZ-3). A resubmission prefills these
 *   values with a `UserStated` tag, and PV-3 forbids a machine from putting words in
 *   a person's mouth — so a machine caller with nothing to relay leaves nothing
 *   behind, even though its refusal is the expiry, not its identity.
 */
async function refuseExpired(
  entryId: string,
  scope: Scope,
  entry: DocketEntry,
  amendments: AmendmentMap | null,
  principal: Principal,
  deps: DecideDeps,
): Promise<AffiantError> {
  let preserved = false;
  if (amendments !== null && Object.keys(amendments).length > 0) {
    requireAmendableFields(entry.affidavit, amendments);
    if (attestorOf(principal) !== null) {
      const result = await deps.store.preserveAmendments(entryId, scope, amendments);
      preserved = typeof result !== "string";
    }
  }
  return new AffiantError(
    "decision-expired",
    `DK-1: Docket entry ${JSON.stringify(entryId)} passed its deadline at ${entry.expiresAt} ` +
      `and reads expired, whether or not a sweep has run. The decision is refused` +
      (preserved
        ? `; the amendments it carried are preserved on the row for a resubmission.`
        : `.`),
    { entryId, expiresAt: entry.expiresAt, amendmentsPreserved: preserved },
  );
}

/**
 * Refuse an amendment map that names a field the Affidavit does not propose (DK-2).
 *
 * A `RangeError` and not an `AffiantError`, and the same message `applyAmendments`
 * raises: the {@link ErrorCode} registry names refusals the gate makes about a
 * proposal's substance or a decider's identity, and a field name that is not there is
 * a caller passing an index out of range.
 */
function requireAmendableFields(affidavit: Affidavit, map: AmendmentMap): void {
  for (const resolved of resolveAmendments(map)) {
    if (!affidavit.fields.some((field) => field.name === resolved.name)) {
      throw new RangeError(
        `amendment names field ${JSON.stringify(resolved.name)}, which this Affidavit does ` +
          `not propose`,
      );
    }
  }
}

/** The one answer a caller outside the tenant ever gets, and the answer a bad id gets. */
function notFound(entryId: string, ctx: TurnContext): AffiantError {
  return new AffiantError(
    "entry-not-found",
    `no Docket entry ${JSON.stringify(entryId)} is visible in this tenant.`,
    { entryId, tenantId: ctx.tenantId },
  );
}
