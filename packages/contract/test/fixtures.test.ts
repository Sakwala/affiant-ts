import { describe, expect, it } from "vitest";

import type {
  ActionDecisionResult,
  Affidavit,
  DocketExpiredNotification,
  DocketExpiringNotification,
  EvidenceCardRequest,
  SessionRehydrated,
  SystemNotification,
  UiGuidance,
} from "../src/index.js";
import { PROTOCOL_VERSION } from "../src/index.js";
import {
  fixtures,
  manifest,
  wireActionDecisionResult,
  wireDocketExpired,
  wireDocketExpiring,
  wireEvidenceCardRequest,
  wireEvidenceCardRequestResubmission,
  wireGuideUi,
  wireSessionRehydrated,
  wireSystemNotification,
} from "./fixtures.generated.js";

/**
 * Compile-time half of the contract: every fixture the rulebook seeds must be
 * assignable to the hand-written type that claims to describe it. These lines are
 * checked by `pnpm typecheck`; a type that drifts from a schema fails the build
 * before any assertion runs. `satisfies` on a `const` reference performs no
 * excess-property check, so it proves assignability, not the absence of extra
 * keys — `schema.test.ts` and `generated.test.ts` carry that half.
 */
wireEvidenceCardRequest satisfies EvidenceCardRequest;
wireEvidenceCardRequestResubmission satisfies EvidenceCardRequest;
wireEvidenceCardRequest.affidavit satisfies Affidavit;
wireDocketExpiring satisfies DocketExpiringNotification;
wireDocketExpired satisfies DocketExpiredNotification;
wireActionDecisionResult satisfies ActionDecisionResult;
wireSessionRehydrated satisfies SessionRehydrated;
wireSystemNotification satisfies SystemNotification;
wireGuideUi satisfies UiGuidance;

describe("the vendored fixtures", () => {
  it("pins the same protocol version the manifest declares", () => {
    expect(manifest.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("has one generated module export per manifest entry, and no extras", () => {
    expect(Object.keys(fixtures).sort()).toEqual(manifest.fixtures.map((f) => f.id).sort());
  });

  it.each(manifest.fixtures.map((entry) => [entry.id, entry.kind] as const))(
    "%s (%s) parses to an object and survives a JSON round trip unchanged",
    (id) => {
      const fixture = fixtures[id as keyof typeof fixtures];

      expect(fixture).toBeTypeOf("object");
      expect(fixture).not.toBeNull();
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
    },
  );
});

describe("the evidence card request pair", () => {
  it("spells a first filing's absent amendments as an explicit null", () => {
    expect(wireEvidenceCardRequest.priorAmendments).toBeNull();
    expect("priorAmendments" in wireEvidenceCardRequest).toBe(true);
  });

  it("carries the reviewer's amendments on the resubmission branch", () => {
    expect(wireEvidenceCardRequestResubmission.priorAmendments).toEqual({
      Status: "Retired",
      Weight: 15,
    });
  });

  it("differs from its first-filing twin only in docket id and amendments", () => {
    expect(wireEvidenceCardRequestResubmission.affidavit).toEqual(
      wireEvidenceCardRequest.affidavit,
    );
    expect(wireEvidenceCardRequestResubmission.docketId).not.toBe(wireEvidenceCardRequest.docketId);
  });
});

describe("an affidavit's fields", () => {
  const [status, weight] = wireEvidenceCardRequest.affidavit.fields;

  it("names an enum field's closed set and leaves its pattern null", () => {
    expect(status?.kind).toBe("enum");
    expect(status?.allowedValues).toEqual(["Active", "Retired"]);
    expect(status?.pattern).toBeNull();
  });

  it("carries a previous value only where one exists", () => {
    expect(status?.previousValue).toBeNull();
    expect(weight?.previousValue).toBe(10);
  });

  it("gives every field a provenance chain with a current tag and a prior array", () => {
    for (const field of wireEvidenceCardRequest.affidavit.fields) {
      expect(field.provenance.current.source).toBeTypeOf("string");
      expect(Array.isArray(field.provenance.prior)).toBe(true);
    }
  });
});
