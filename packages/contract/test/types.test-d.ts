import { expectTypeOf } from "vitest";

import type {
  Affidavit,
  AffidavitField,
  AmendmentMap,
  EvidenceCardRequest,
  ProvenanceChain,
  ProvenanceSource,
  ProvenanceTag,
} from "../src/index.js";

/**
 * Type-level assertions. Nothing here runs; `pnpm typecheck` is the check.
 *
 * What they defend: the wire spells an absent optional value as an explicit
 * `null`, never by omitting the key. A type that made a property optional would
 * let a producer omit it and still compile, and the payload would then fail schema
 * validation at the far end of a network hop. So every property is required, and
 * "absent" lives in the value type as `| null`.
 */

// No property of the core envelope is optional.
expectTypeOf<Required<EvidenceCardRequest>>().toEqualTypeOf<EvidenceCardRequest>();
expectTypeOf<Required<Affidavit>>().toEqualTypeOf<Affidavit>();
expectTypeOf<Required<AffidavitField>>().toEqualTypeOf<AffidavitField>();
expectTypeOf<Required<ProvenanceTag>>().toEqualTypeOf<ProvenanceTag>();
expectTypeOf<Required<ProvenanceChain>>().toEqualTypeOf<ProvenanceChain>();

// Nullability follows the schema, property by property.
expectTypeOf<EvidenceCardRequest["priorAmendments"]>().toEqualTypeOf<AmendmentMap | null>();
expectTypeOf<Affidavit["entityId"]>().toEqualTypeOf<string | null>();
expectTypeOf<AffidavitField["allowedValues"]>().toEqualTypeOf<readonly string[] | null>();
expectTypeOf<AffidavitField["pattern"]>().toEqualTypeOf<string | null>();
expectTypeOf<ProvenanceTag["evidence"]>().toEqualTypeOf<string | null>();
expectTypeOf<ProvenanceTag["conversationTurn"]>().toEqualTypeOf<number | null>();

// Where the schema says "not nullable — an empty array, never null", the type says so too.
expectTypeOf<Affidavit["fields"]>().toEqualTypeOf<readonly AffidavitField[]>();
expectTypeOf<Affidavit["warnings"]>().toEqualTypeOf<readonly string[]>();
expectTypeOf<ProvenanceChain["prior"]>().toEqualTypeOf<readonly ProvenanceTag[]>();

// The wire applies no type constraint to a field's value, so neither does the type.
expectTypeOf<AffidavitField["value"]>().toEqualTypeOf<unknown>();
expectTypeOf<AffidavitField["previousValue"]>().toEqualTypeOf<unknown>();

// The provenance source is closed. A source outside the pinned set is a type error.
expectTypeOf<"UserStated">().toMatchTypeOf<ProvenanceSource>();
expectTypeOf<"Vibes">().not.toMatchTypeOf<ProvenanceSource>();

// Reading an amendment yields `unknown`, because a reviewer may have cleared the
// field to `null`, and `null` is a value the map legitimately carries.
expectTypeOf<AmendmentMap[string]>().toEqualTypeOf<unknown>();
