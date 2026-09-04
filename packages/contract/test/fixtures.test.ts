import { describe, expect, it } from "vitest";

import type {
  ActionDecisionResult,
  Affidavit,
  AffidavitField,
  Attestation,
  Binding,
  BlockedMarker,
  DecisionResult,
  DocketEntry,
  EvidenceCardRequest,
  Money,
  Notification,
  OutsideGateMarker,
  ProvenanceChain,
  ProvenanceTag,
  SeedAffidavit,
  SeedEvidenceCardRequest,
  SessionRehydrated,
  SystemNotification,
  TelemetryKeyRegistry,
  ToolResult,
  UiGuidance,
} from "../src/index.js";
import { PROTOCOL_VERSION } from "../src/index.js";
import {
  manifest,
  v01Fixtures,
  wireActionDecisionResult,
  wireEvidenceCardRequest,
  wireEvidenceCardRequestResubmission,
  wireFixtures,
  wireGuideUi,
  wireSessionRehydrated,
  wireSystemNotification,
} from "./fixtures.generated.js";

type V01ManifestFixture = (typeof manifest)["0.1.0"]["fixtures"][number];

/**
 * Compile-time half of the contract: every positive fixture the rulebook promotes
 * must be assignable to the hand-written type that claims to describe it. These
 * lines are checked by `pnpm typecheck`; a type that drifts from a schema fails the
 * build before any assertion runs.
 *
 * The v0.1 fixtures are typed `unknown` in the generated module — a negative
 * fixture is by construction not assignable to the type its schema describes — so
 * each positive is named here with the type it claims, which is the assertion.
 */
function positive<T>(id: string): T {
  const fixture = v01Fixtures[id];
  if (fixture === undefined) throw new Error(`no v0.1 fixture ${id}`);
  return fixture as T;
}

const v01Affidavit = positive<Affidavit>("v0.1/affidavit/01-update-shaped");
const v01Field = positive<AffidavitField>("v0.1/affidavit-field/02-external-bound");
const v01Card = positive<EvidenceCardRequest>("v0.1/evidence-card-request/04-presentation-hints");
const v01Row = positive<DocketEntry>("v0.1/docket-entry/03-amended-on-approval");
const v01Tag = positive<ProvenanceTag>("v0.1/provenance-tag/02-user-stated-reviewer-act");
const v01Chain = positive<ProvenanceChain>("v0.1/provenance-chain/02-superseded");
const v01Binding = positive<Binding>("v0.1/binding/01-external-ref");
const v01Attestation = positive<Attestation>("v0.1/attestation/03-member-via-relay");
const v01Blocked = positive<BlockedMarker>("v0.1/blocked/01-coverage-refused");
const v01OutsideGate = positive<OutsideGateMarker>("v0.1/outside-gate/01-migration");
const v01Money = positive<Money>("v0.1/money/01-decimal-string");
const v01ToolResult = positive<ToolResult>("v0.1/tool-result/01-write-proposal");
const v01Decision = positive<DecisionResult>("v0.1/decision-result/02-executed");
const v01Transition = positive<Notification>("v0.1/notification/03-docket-transition");
const v01Registry = positive<TelemetryKeyRegistry>("v0.1/telemetry-key/01-registry");

// The superseded seed wire, typed by the `Seed*` shapes and by nothing else: a
// seed card is not an `EvidenceCardRequest`, and saying so is the point.
wireEvidenceCardRequest satisfies SeedEvidenceCardRequest;
wireEvidenceCardRequestResubmission satisfies SeedEvidenceCardRequest;
wireEvidenceCardRequest.affidavit satisfies SeedAffidavit;
wireActionDecisionResult satisfies ActionDecisionResult;
wireSessionRehydrated satisfies SessionRehydrated;
wireSystemNotification satisfies SystemNotification;
wireGuideUi satisfies UiGuidance;

describe("the vendored v0.1 fixtures", () => {
  it("pins the same protocol version the package advertises", () => {
    expect(manifest["0.1.0"].protocolVersion).toBe(PROTOCOL_VERSION);
    expect(manifest.conformance.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("has one generated module entry per manifest row, and no extras", () => {
    expect(Object.keys(v01Fixtures).sort()).toEqual(
      (manifest["0.1.0"].fixtures as readonly V01ManifestFixture[]).map((entry) => entry.id).sort(),
    );
  });

  it.each(
    (manifest["0.1.0"].fixtures as readonly V01ManifestFixture[]).map(
      (entry) => [entry.id, entry.kind] as const,
    ),
  )("%s (%s) survives a JSON round trip unchanged", (id) => {
    const fixture = v01Fixtures[id];

    expect(fixture).toBeDefined();
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
  });
});

describe("every envelope carries the protocol version (SR-4)", () => {
  it.each([
    ["affidavit", v01Affidavit.protocolVersion],
    ["evidence card request", v01Card.protocolVersion],
    ["docket entry", v01Row.protocolVersion],
    ["decision result", v01Decision.protocolVersion],
    ["notification", v01Transition.protocolVersion],
    ["telemetry registry", v01Registry.protocolVersion],
  ])("%s", (_what, version) => {
    expect(version).toBe(PROTOCOL_VERSION);
  });
});

describe("the Affidavit carries all three confidence numbers (AF-2)", () => {
  it("names the two companions the seed put on the envelope", () => {
    expect(v01Affidavit.aggregateConfidence).toBeTypeOf("number");
    expect("populatedConfidence" in v01Affidavit).toBe(true);
    expect(v01Affidavit.emptyFieldCount).toBeTypeOf("number");
  });

  it("repeats the two companions on the card envelope for this one version", () => {
    expect("populatedConfidence" in v01Card).toBe(true);
    expect(v01Card.populatedConfidence).toBe(v01Card.affidavit.populatedConfidence);
    expect(v01Card.emptyFieldCount).toBe(v01Card.affidavit.emptyFieldCount);
  });

  it("swears to the operation's shape, not to the host's verb (AF-3)", () => {
    expect(v01Affidavit.operationType).toBe("update");
    expect(v01Affidavit.entityId).not.toBeNull();
  });
});

describe("presentation lives on the card envelope, never on the sworn field", () => {
  it("carries no allowedValues and no pattern on a field", () => {
    expect("allowedValues" in v01Field).toBe(false);
    expect("pattern" in v01Field).toBe(false);
  });

  it("names a closed set and a mask on the envelope instead", () => {
    const hints = v01Card.presentation ?? [];

    expect(hints.length).toBeGreaterThan(0);
    const sworn = new Set(v01Card.affidavit.fields.map((field) => field.name));
    for (const hint of hints) expect(sworn.has(hint.name), hint.name).toBe(true);
    expect(hints.some((hint) => hint.allowedValues !== undefined)).toBe(true);
  });

  it("puts the reviewer's sentences on the envelope too", () => {
    const blocked = positive<EvidenceCardRequest>(
      "v0.1/evidence-card-request/05-blocked-with-warnings",
    );

    expect(blocked.warnings?.length).toBeGreaterThan(0);
    expect(blocked.blocked).not.toBeNull();
    // A card carrying a marker that says no decision will be accepted must not
    // also offer a reviewer surface an approve button that cannot work (AZ-4).
    expect(blocked.requiresConfirmation).toBe(false);
  });

  it("omits both slots on a card that has nothing to say", () => {
    const plain = positive<EvidenceCardRequest>("v0.1/evidence-card-request/01-first-filing");

    expect("presentation" in plain).toBe(false);
    expect("warnings" in plain).toBe(false);
  });
});

describe("every discriminated union is told apart by a kind, never by a property (AF-5)", () => {
  it.each([
    ["binding", v01Binding.kind],
    ["attestor", v01Attestation.by.kind],
    ["tool result", v01ToolResult.kind],
    ["notification", v01Transition.kind],
  ])("%s", (_what, kind) => {
    expect(kind).toBeTypeOf("string");
  });

  it("discriminates a blocked marker on its code, and carries only that code's context", () => {
    expect(v01Blocked.code).toBe("coverage-refused");
    expect("level" in v01Blocked).toBe(false);
  });
});

describe("a provenance tag says when it was minted and what to check it against", () => {
  it("carries at, note and a binding", () => {
    expect(v01Tag.at).toBeTypeOf("string");
    expect("note" in v01Tag).toBe(true);
    expect(v01Tag.binding).not.toBeNull();
  });

  it("keeps everything a merge displaced, newest first", () => {
    expect(v01Chain.prior.length).toBeGreaterThan(0);
  });
});

describe("the shapes with no producer yet are still typed", () => {
  it("an outside-gate marker is not an attestation, and has no attestor", () => {
    expect(v01OutsideGate.recordedBy).toBeTypeOf("string");
    expect("by" in v01OutsideGate).toBe(false);
  });

  it("money is a decimal string and a currency code, never a float", () => {
    expect(v01Money.amount).toBeTypeOf("string");
    expect(v01Money.currency).toMatch(/^[A-Z]{3}$/);
  });
});

describe("the superseded 0.0.1-seed wire", () => {
  it("is still vendored, fixture for fixture", () => {
    expect(Object.keys(wireFixtures).sort()).toEqual(manifest.fixtures.map((f) => f.id).sort());
  });

  it("puts the presentation on the sworn field, which is what v0.1 moved", () => {
    const [status] = wireEvidenceCardRequest.affidavit.fields;

    expect(status?.allowedValues).toEqual(["Active", "Retired"]);
    expect(status?.pattern).toBeNull();
  });

  it("names the host's own operation verb, which the v0.1 record does not carry", () => {
    expect(wireEvidenceCardRequest.affidavit.operationType).toBe("WriteUpdate");
  });
});
