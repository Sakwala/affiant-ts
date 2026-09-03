import { describe, expect, it } from "vitest";

import { buildAffidavit, type AffidavitFieldInput } from "../src/model/affidavit.js";
import {
  applyAmendments,
  hasAmendment,
  resolveAmendments,
  type AmendmentMap,
  type ReviewerAct,
} from "../src/model/amendments.js";
import { chainOf, mintConversation, mintTag } from "../src/model/provenance.js";
import type { Operation } from "../src/ports.js";

const AT = "2026-09-04T10:00:00.000Z";
const DECIDED_AT = "2026-09-04T11:30:00.000Z";

const act: ReviewerAct = { entryId: "entry-1", decisionAt: DECIDED_AT, by: "person-7" };

const op: Operation = {
  kind: "update",
  entityType: "Widget",
  entityId: "W-1",
  fields: ["Status", "Weight"],
};

const fields: readonly AffidavitFieldInput[] = [
  {
    name: "Status",
    kind: "enum",
    value: "Active",
    previousValue: null,
    provenance: chainOf(mintTag({ source: "UserStated", confidence: 1, at: AT })),
    isMandatory: true,
  },
  {
    name: "Weight",
    kind: "number",
    value: 12.5,
    previousValue: 10,
    provenance: chainOf(mintConversation({ confidence: 0.9, at: AT, conversationTurn: 3 })),
    isMandatory: false,
  },
];

const proposal = buildAffidavit(op, fields, { createdAt: AT, conversationTurn: 3 });

describe("null clears, absent leaves untouched (DK-2)", () => {
  it("clears the field a null names", () => {
    const amended = applyAmendments(proposal, { Status: null }, act);
    const status = amended.fields[0];

    expect(status?.value).toBeNull();
    expect(status?.provenance.current.note).toBe("Cleared by person-7 on Docket entry entry-1");
  });

  it("leaves a field the map does not name completely untouched", () => {
    const amended = applyAmendments(proposal, { Status: "Retired" }, act);

    expect(amended.fields[1]).toBe(proposal.fields[1]);
    expect(amended.fields[1]?.value).toBe(12.5);
    expect(amended.fields[1]?.provenance.current.source).toBe("Conversation");
    expect(amended.fields[1]?.provenance.prior).toEqual([]);
  });

  it("never conflates a cleared field with an untouched one", () => {
    const cleared = applyAmendments(proposal, { Status: null }, act);
    const untouched = applyAmendments(proposal, { Weight: 15 }, act);

    expect(cleared.fields[0]?.value).toBeNull();
    // Status is mandatory, so it stays — with nothing behind it (AF-1).
    expect(cleared.fields[0]?.provenance.current.source).toBe("Empty");
    expect(untouched.fields[0]?.value).toBe("Active");
    expect(untouched.fields[0]?.provenance.prior).toEqual([]);
  });

  it("resolves a map into explicit set and clear amendments", () => {
    expect(resolveAmendments({ Status: null, Weight: 15 })).toEqual([
      { name: "Status", amendment: { kind: "clear" } },
      { name: "Weight", amendment: { kind: "set", value: 15 } },
    ]);
  });

  it("reports whether the map says anything at all about a field", () => {
    const map: AmendmentMap = { Status: null };
    expect(hasAmendment(map, "Status")).toBe(true);
    expect(hasAmendment(map, "Weight")).toBe(false);
  });

  it("refuses undefined under a key, which is neither meaning", () => {
    const smuggled = { Status: undefined } as unknown as AmendmentMap;
    expect(() => resolveAmendments(smuggled)).toThrow(/DK-2/);
    expect(() => applyAmendments(proposal, smuggled, act)).toThrow(RangeError);
  });

  it("returns the Affidavit unchanged when the map is empty", () => {
    expect(applyAmendments(proposal, {}, act)).toBe(proposal);
  });
});

describe("an amended field carries the reviewer's act (PV-2, AF-4)", () => {
  it("puts a UserStated tag with a reviewer-act binding in force", () => {
    const amended = applyAmendments(proposal, { Weight: 15 }, act);
    const weight = amended.fields[1];

    expect(weight?.value).toBe(15);
    expect(weight?.provenance.current.source).toBe("UserStated");
    expect(weight?.provenance.current.confidence).toBe(1);
    expect(weight?.provenance.current.at).toBe(DECIDED_AT);
    expect(weight?.provenance.current.binding).toEqual({
      kind: "reviewer-act",
      ref: { entryId: "entry-1", decisionAt: DECIDED_AT },
    });
  });

  it("keeps the machine's tag in the chain rather than replacing it", () => {
    const amended = applyAmendments(proposal, { Weight: 15 }, act);
    const weight = amended.fields[1];

    expect(weight?.provenance.prior).toHaveLength(1);
    expect(weight?.provenance.prior[0]?.source).toBe("Conversation");
    expect(weight?.provenance.prior[0]?.confidence).toBe(0.9);
  });

  it("wins even where the machine was more confident", () => {
    const lowConfidence = buildAffidavit(
      op,
      [
        fields[0] as AffidavitFieldInput,
        {
          name: "Weight",
          kind: "number",
          value: 12.5,
          previousValue: 10,
          provenance: chainOf(mintTag({ source: "External", confidence: 1, at: AT })),
          isMandatory: false,
        },
      ],
      { createdAt: AT, conversationTurn: 3 },
    );

    const amended = applyAmendments(lowConfidence, { Weight: 15 }, act);
    expect(amended.fields[1]?.provenance.current.source).toBe("UserStated");
    expect(amended.fields[1]?.provenance.prior[0]?.source).toBe("External");
  });

  it("does not move previousValue: an amendment changes the proposal, not the stored value", () => {
    const amended = applyAmendments(proposal, { Weight: 15 }, act);
    expect(amended.fields[1]?.previousValue).toBe(10);
  });

  it("refuses an amendment naming a field the Affidavit does not propose", () => {
    expect(() => applyAmendments(proposal, { Colour: "red" }, act)).toThrow(RangeError);
    expect(() => applyAmendments(proposal, { Colour: "red" }, act)).toThrow(
      /amendment names field "Colour", which this Affidavit does not propose/,
    );
  });
});

describe("an accepted amendment recomputes the three numbers (AF-4)", () => {
  it("lifts the aggregate when the reviewer corrects the least confident field", () => {
    expect(proposal.aggregateConfidence).toBe(0.9);

    const amended = applyAmendments(proposal, { Weight: 15 }, act);

    expect(amended.aggregateConfidence).toBe(1);
    expect(amended.populatedConfidence).toBe(1);
    expect(amended.emptyFieldCount).toBe(0);
  });

  it("recomputes over an Affidavit that had an empty field", () => {
    const withEmpty = buildAffidavit(
      op,
      [
        fields[0] as AffidavitFieldInput,
        { name: "Weight", kind: "number", value: null, previousValue: 10, isMandatory: false },
      ],
      { createdAt: AT, conversationTurn: 3 },
    );

    expect(withEmpty.aggregateConfidence).toBe(0);
    expect(withEmpty.emptyFieldCount).toBe(1);

    const amended = applyAmendments(withEmpty, { Weight: 15 }, act);

    expect(amended.aggregateConfidence).toBe(1);
    expect(amended.populatedConfidence).toBe(1);
    expect(amended.emptyFieldCount).toBe(0);
  });

  it("does not let clearing a mandatory field raise the numbers", () => {
    // The reviewer's act is real — they did state it — but there is no value left to
    // be confident in. Writing UserStated/1.0 over an emptied field would let a
    // reviewer wipe an Affidavit and leave it reporting perfect confidence over
    // nothing, which is the hole AF-2's minimum exists to close.
    const cleared = applyAmendments(proposal, { Status: null }, act);
    const status = cleared.fields[0];

    expect(status?.name).toBe("Status");
    expect(status?.value).toBeNull();
    expect(status?.provenance.current.source).toBe("Empty");
    expect(status?.provenance.current.confidence).toBe(0);
    expect(cleared.aggregateConfidence).toBe(0);
    expect(cleared.emptyFieldCount).toBe(1);
    expect(cleared.populatedConfidence).toBe(0.9);
  });

  it("keeps the reviewer's act on a cleared mandatory field (PV-2)", () => {
    const status = applyAmendments(proposal, { Status: null }, act).fields[0];

    expect(status?.provenance.current.note).toBe("Cleared by person-7 on Docket entry entry-1");
    expect(status?.provenance.current.binding).toEqual({
      kind: "reviewer-act",
      ref: { entryId: "entry-1", decisionAt: DECIDED_AT },
    });
    // Nothing is discarded: the machine's tag is still readable behind it.
    expect(status?.provenance.prior[0]?.source).toBe("UserStated");
  });

  it("removes a cleared optional field from fields[] rather than emptying it (AF-1)", () => {
    // A reviewer clearing an optional field is saying "do not write this one", which
    // is a field the operation no longer proposes — and AF-1 says such a field is
    // absent, never present with an Empty tag.
    const cleared = applyAmendments(proposal, { Weight: null }, act);

    expect(cleared.fields.map((field) => field.name)).toEqual(["Status"]);
    expect(cleared.emptyFieldCount).toBe(0);
    expect(cleared.aggregateConfidence).toBe(1);
    expect(cleared.populatedConfidence).toBe(1);
  });

  it("clears both kinds in one map without conflating them", () => {
    const cleared = applyAmendments(proposal, { Status: null, Weight: null }, act);

    expect(cleared.fields.map((field) => field.name)).toEqual(["Status"]);
    expect(cleared.fields[0]?.provenance.current.source).toBe("Empty");
    expect(cleared.aggregateConfidence).toBe(0);
    expect(cleared.emptyFieldCount).toBe(1);
    expect(cleared.populatedConfidence).toBeNull();
  });

  it("leaves the proposal it was given untouched", () => {
    applyAmendments(proposal, { Weight: 15 }, act);

    expect(proposal.aggregateConfidence).toBe(0.9);
    expect(proposal.fields[1]?.value).toBe(12.5);
    expect(proposal.fields[1]?.provenance.prior).toEqual([]);
  });

  it("keeps the Affidavit's identity, shape and field order", () => {
    const amended = applyAmendments(proposal, { Weight: 15 }, act);

    expect(amended.operationType).toBe("update");
    expect(amended.entityType).toBe("Widget");
    expect(amended.entityId).toBe("W-1");
    expect(amended.createdAt).toBe(AT);
    expect(amended.conversationTurn).toBe(3);
    expect(amended.fields.map((field) => field.name)).toEqual(["Status", "Weight"]);
  });
});
