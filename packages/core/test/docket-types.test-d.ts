import { expectTypeOf } from "vitest";

import type { AmendmentMap } from "@affiant/contract";

import type {
  Attestation,
  Attestor,
  BlockedMarker,
  DocketEntry,
  DocketStatus,
  ExecutionOutcome,
  Lineage,
  RequirementKind,
} from "../src/docket/entry.js";
import type {
  DocketStore,
  PageResult,
  Scope,
  TransitionPatch,
  TransitionResult,
} from "../src/docket/store.js";

/**
 * Type-level assertions for the shapes AZ-1, AZ-4 and DK-1 fix. Nothing here runs;
 * `pnpm typecheck` is the check.
 *
 * What they defend is the part of a shape a runtime test cannot reach: that the
 * attestation's three attestor kinds are exactly the three the rulebook names and
 * cannot be widened by accident, that a relay's attestation is structurally unable
 * to claim `member`, and that the state machine has no fourth state hiding in a
 * union.
 */

// --------------------------------------------------------------- AZ-1: attestation

// The mode is the kind of `by`; there is no separate mode field to drift from it.
expectTypeOf<Attestation>().toEqualTypeOf<{
  readonly by: Attestor;
  readonly at: string;
  readonly entryId: string;
}>();
expectTypeOf<Attestation["by"]["kind"]>().toEqualTypeOf<
  "member" | "member-via-relay" | "standing-order"
>();

// AZ-3: a relayed decision names the person and the relay, and is a different kind
// from `member`. There is no shape that carries a relay and calls itself `member`.
type MemberAttestor = Extract<Attestor, { kind: "member" }>;
type RelayAttestor = Extract<Attestor, { kind: "member-via-relay" }>;
type StandingOrderAttestor = Extract<Attestor, { kind: "standing-order" }>;

expectTypeOf<MemberAttestor>().toEqualTypeOf<{ readonly kind: "member"; readonly id: string }>();
expectTypeOf<RelayAttestor["relay"]>().toEqualTypeOf<{
  readonly principal: string;
  readonly channelIdentity: string;
  readonly messageId: string;
}>();
expectTypeOf<RelayAttestor["memberId"]>().toEqualTypeOf<string>();
expectTypeOf<StandingOrderAttestor>().toEqualTypeOf<{
  readonly kind: "standing-order";
  readonly policyId: string;
  readonly version: string;
}>();
// @ts-expect-error a member attestation carries no relay: AZ-3 in the type system.
type _RelayOnMember = MemberAttestor["relay"];

// ------------------------------------------------------------- AZ-4: blocked marker

expectTypeOf<BlockedMarker["code"]>().toEqualTypeOf<
  "requirement-not-implemented" | "coverage-refused"
>();
expectTypeOf<RequirementKind>().toEqualTypeOf<
  "StandingOrder" | "ReviewerConfirmation" | "ReferralRequired" | "MultiParty"
>();
// The context properties are optional, because a marker names only what its own
// code makes meaningful.
expectTypeOf<Required<BlockedMarker>>().not.toEqualTypeOf<BlockedMarker>();
expectTypeOf<BlockedMarker["level"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BlockedMarker["category"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BlockedMarker["toolName"]>().toEqualTypeOf<string | undefined>();

// ------------------------------------------------------- DK-1: the state machine

expectTypeOf<DocketStatus>().toEqualTypeOf<"pending" | "approved" | "rejected" | "expired">();
expectTypeOf<ExecutionOutcome>().toEqualTypeOf<"unexecuted" | "executed" | "failed">();
expectTypeOf<DocketEntry["execution"]>().toEqualTypeOf<ExecutionOutcome | null>();
expectTypeOf<DocketEntry["blocked"]>().toEqualTypeOf<BlockedMarker | null>();
expectTypeOf<DocketEntry["attestation"]>().toEqualTypeOf<Attestation | null>();
expectTypeOf<DocketEntry["amendments"]>().toEqualTypeOf<AmendmentMap | null>();
expectTypeOf<DocketEntry["lineage"]>().toEqualTypeOf<Lineage>();
expectTypeOf<DocketEntry["compositeRef"]>().toEqualTypeOf<string | null>();

// Absent is spelled `| null` in a value, never by omitting a key: nothing on the
// entry is optional, so a producer cannot leave a property out and still compile.
expectTypeOf<Required<DocketEntry>>().toEqualTypeOf<DocketEntry>();

// A transition never returns an entry to `pending`.
expectTypeOf<TransitionPatch["status"]>().toEqualTypeOf<"approved" | "rejected" | "expired">();
// Each refusal is named after the state it describes: "already-decided" for the row
// somebody else decided, "expired" for the row that passed its deadline. A store
// implementer reading the type cannot get the two the wrong way round.
expectTypeOf<TransitionResult>().toEqualTypeOf<
  DocketEntry | "not-found" | "already-decided" | "expired"
>();

// ----------------------------------------------------------- the store contract

// Every read is scoped; the tenant is never optional.
expectTypeOf<Scope["tenantId"]>().toEqualTypeOf<string>();
expectTypeOf<Scope["conversationId"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<Required<Scope>>().not.toEqualTypeOf<Scope>();

// Every list is paged, and export streams rather than returning an array.
expectTypeOf<DocketStore["listPending"]>().returns.resolves.toEqualTypeOf<
  PageResult<DocketEntry>
>();
expectTypeOf<DocketStore["listApprovedUnexecuted"]>().returns.resolves.toEqualTypeOf<
  PageResult<DocketEntry>
>();
expectTypeOf<DocketStore["export"]>().returns.toEqualTypeOf<AsyncIterable<DocketEntry>>();
expectTypeOf<DocketStore["purge"]>().parameters.toEqualTypeOf<[tenantId: string]>();
