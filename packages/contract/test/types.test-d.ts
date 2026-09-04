import { expectTypeOf } from "vitest";

import type {
  Affidavit,
  AffidavitField,
  AmendmentMap,
  Attestation,
  Attestor,
  Binding,
  BlockedMarker,
  DocketEntry,
  EvidenceCardRequest,
  ExternalRefBinding,
  FieldPresentation,
  JsonValue,
  Notification,
  ProvenanceChain,
  ProvenanceSource,
  ProvenanceTag,
  ToolResult,
} from "../src/index.js";

/**
 * Type-level assertions. Nothing here runs; `pnpm typecheck` is the check.
 *
 * What they defend: the wire spells an absent optional value as an explicit
 * `null`, never by omitting the key. A type that made such a property optional
 * would let a producer omit it and still compile, and the payload would then fail
 * schema validation at the far end of a network hop. So every property of a core
 * object is required, and "absent" lives in the value type as `| null`.
 *
 * The exceptions are the places where a property is meaningful only sometimes
 * rather than a value that is sometimes missing — the presentation slots and the
 * three properties of an `external-ref` binding a source either supports or does
 * not — and each of those is asserted optional below, on purpose.
 */

// No property of a sworn record is optional.
expectTypeOf<Required<Affidavit>>().toEqualTypeOf<Affidavit>();
expectTypeOf<Required<AffidavitField>>().toEqualTypeOf<AffidavitField>();
expectTypeOf<Required<ProvenanceTag>>().toEqualTypeOf<ProvenanceTag>();
expectTypeOf<Required<ProvenanceChain>>().toEqualTypeOf<ProvenanceChain>();
expectTypeOf<Required<DocketEntry>>().toEqualTypeOf<DocketEntry>();
expectTypeOf<Required<Attestation>>().toEqualTypeOf<Attestation>();

// Nullability follows the schema, property by property.
expectTypeOf<EvidenceCardRequest["priorAmendments"]>().toEqualTypeOf<AmendmentMap | null>();
expectTypeOf<EvidenceCardRequest["blocked"]>().toEqualTypeOf<BlockedMarker | null>();
expectTypeOf<Affidavit["entityId"]>().toEqualTypeOf<string | null>();
expectTypeOf<Affidavit["populatedConfidence"]>().toEqualTypeOf<number | null>();
expectTypeOf<ProvenanceTag["note"]>().toEqualTypeOf<string | null>();
expectTypeOf<ProvenanceTag["binding"]>().toEqualTypeOf<Binding | null>();
expectTypeOf<ProvenanceTag["conversationTurn"]>().toEqualTypeOf<number | null>();
expectTypeOf<DocketEntry["amendedAffidavit"]>().toEqualTypeOf<Affidavit | null>();

// Where the schema says "not nullable — an empty array, never null", the type says so too.
expectTypeOf<Affidavit["fields"]>().toEqualTypeOf<readonly AffidavitField[]>();
expectTypeOf<ProvenanceChain["prior"]>().toEqualTypeOf<readonly ProvenanceTag[]>();

// The presentation the record does not swear to is ABSENT rather than null: a
// producer with nothing to say says nothing, and the canonical form (SR-1) never
// sees either slot.
expectTypeOf<EvidenceCardRequest["presentation"]>().toEqualTypeOf<
  readonly FieldPresentation[] | undefined
>();
expectTypeOf<EvidenceCardRequest["warnings"]>().toEqualTypeOf<readonly string[] | undefined>();
expectTypeOf<FieldPresentation["pattern"]>().toEqualTypeOf<string | undefined>();
// An enum of numbers is a legitimate presentation hint, so the closed set is JSON
// values rather than strings.
expectTypeOf<FieldPresentation["allowedValues"]>().toEqualTypeOf<
  readonly JsonValue[] | undefined
>();
// Same reason on a binding: a source that cannot be re-fetched has no `fetchedAt`
// to report, and saying `null` would claim it had one and lost it.
expectTypeOf<ExternalRefBinding["ref"]["fetchedAt"]>().toEqualTypeOf<string | undefined>();

// A sworn field carries no presentation at all — that is the v0.1 move.
expectTypeOf<AffidavitField>().not.toHaveProperty("allowedValues");
expectTypeOf<AffidavitField>().not.toHaveProperty("pattern");
// And a sworn record carries neither the warnings nor the confirmation flag.
expectTypeOf<Affidavit>().not.toHaveProperty("warnings");
expectTypeOf<Affidavit>().not.toHaveProperty("requiresConfirmation");

// The wire applies no type constraint to a field's value beyond "it is JSON", so
// neither does the type — but `undefined` is not JSON. `unknown` would admit it,
// `JSON.stringify` would drop the key, and the payload would then fail the
// schema's `required`.
expectTypeOf<AffidavitField["value"]>().toEqualTypeOf<JsonValue>();
expectTypeOf<AffidavitField["previousValue"]>().toEqualTypeOf<JsonValue>();
expectTypeOf<undefined>().not.toMatchTypeOf<AffidavitField["value"]>();
expectTypeOf<undefined>().not.toMatchTypeOf<AffidavitField["previousValue"]>();
expectTypeOf<null>().toMatchTypeOf<AffidavitField["value"]>();

// So a field literal that spells an absent value as `undefined` does not compile.
export const undefinedValueIsRejected = {
  name: "Status",
  // @ts-expect-error `undefined` is not a JSON value.
  value: undefined,
  previousValue: null,
  provenance: {
    current: {
      source: "UserStated",
      confidence: 1,
      note: null,
      at: "2026-09-04T09:00:00.000Z",
      conversationTurn: null,
      binding: null,
    },
    prior: [],
  },
  isMandatory: true,
  kind: "text",
} satisfies AffidavitField;

// The provenance source is closed. A source outside the pinned set is a type error.
expectTypeOf<"UserStated">().toMatchTypeOf<ProvenanceSource>();
expectTypeOf<"Vibes">().not.toMatchTypeOf<ProvenanceSource>();

// Every union is discriminated on `kind` — or, for the blocked marker, on `code`.
// A consumer switches on the discriminator and never on the presence of a field
// (AF-5), and narrowing has to work for that to be a habit rather than a wish.
declare const attestor: Attestor;
if (attestor.kind === "member-via-relay") {
  expectTypeOf(attestor.memberId).toEqualTypeOf<string>();
} else if (attestor.kind === "standing-order") {
  expectTypeOf(attestor.policyId).toEqualTypeOf<string>();
}

declare const result: ToolResult;
if (result.kind === "write") {
  expectTypeOf(result.card).toEqualTypeOf<EvidenceCardRequest>();
}

declare const notification: Notification;
if (notification.kind === "docket-transition") {
  expectTypeOf(notification.from).toEqualTypeOf<DocketEntry["status"]>();
}

declare const blocked: BlockedMarker;
if (blocked.code === "coverage-refused") {
  expectTypeOf(blocked.toolName).toEqualTypeOf<string>();
  // A coverage refusal has no requirement level to report.
  expectTypeOf(blocked).not.toHaveProperty("level");
}

// Reading an amendment yields a JSON value, because a reviewer may have cleared
// the field to `null`, and `null` is a value the map legitimately carries.
expectTypeOf<AmendmentMap[string]>().toEqualTypeOf<JsonValue>();
expectTypeOf<undefined>().not.toMatchTypeOf<AmendmentMap[string]>();
