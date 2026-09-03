import { describe, expect, it } from "vitest";

import {
  buildAffidavit,
  computeConfidence,
  isJsonValue,
  isMoney,
  type AffidavitFieldInput,
} from "../src/model/affidavit.js";
import { chainOf, mintConversation, mintInferred, mintTag } from "../src/model/provenance.js";
import type { Operation } from "../src/ports.js";

const AT = "2026-09-04T10:00:00.000Z";
const META = { createdAt: AT, conversationTurn: 3 } as const;

const updateOp: Operation = {
  kind: "update",
  entityType: "Widget",
  entityId: "W-1",
  fields: ["Status", "Weight"],
};

const createOp: Operation = {
  kind: "create",
  entityType: "Widget",
  entityId: null,
  fields: ["Status", "Weight"],
};

const statusField: AffidavitFieldInput = {
  name: "Status",
  kind: "enum",
  value: "Active",
  previousValue: null,
  provenance: chainOf(mintTag({ source: "UserStated", confidence: 1, at: AT })),
  isMandatory: true,
};

const weightField: AffidavitFieldInput = {
  name: "Weight",
  kind: "number",
  value: 12.5,
  previousValue: 10,
  provenance: chainOf(mintConversation({ confidence: 0.9, at: AT, conversationTurn: 3 })),
  isMandatory: false,
};

const weightWithUnknownProvenance: AffidavitFieldInput = {
  name: "Weight",
  kind: "number",
  value: 12.5,
  previousValue: 10,
  isMandatory: false,
};

const statusWithUnknownProvenance: AffidavitFieldInput = {
  name: "Status",
  kind: "enum",
  value: "Active",
  previousValue: null,
  isMandatory: true,
};

describe("fields[] carries only the proposed fields (AF-1)", () => {
  it("tags a proposed field of unknown provenance Empty at confidence 0, never omitting it", () => {
    const affidavit = buildAffidavit(updateOp, [statusField, weightWithUnknownProvenance], META);

    const weight = affidavit.fields[1];
    expect(weight?.name).toBe("Weight");
    expect(weight?.provenance.current.source).toBe("Empty");
    expect(weight?.provenance.current.confidence).toBe(0);
    expect(weight?.provenance.prior).toEqual([]);
  });

  it("carries exactly the operation's fields, in the order they were proposed", () => {
    const affidavit = buildAffidavit(updateOp, [statusField, weightField], META);
    expect(affidavit.fields.map((field) => field.name)).toEqual(["Status", "Weight"]);
  });

  it("refuses a field the operation does not propose, rather than Empty-tagging it", () => {
    const notProposed: AffidavitFieldInput = {
      name: "Colour",
      kind: "text",
      value: "red",
      previousValue: null,
      isMandatory: false,
    };

    expect(() => buildAffidavit(updateOp, [statusField, weightField, notProposed], META)).toThrow(
      /AF-1: field "Colour" is not proposed/,
    );
  });

  it("refuses to omit a proposed field", () => {
    expect(() => buildAffidavit(updateOp, [statusField], META)).toThrow(
      /AF-1: proposed field "Weight" has no entry/,
    );
  });

  it("refuses the same field twice", () => {
    expect(() => buildAffidavit(updateOp, [statusField, weightField, statusField], META)).toThrow(
      /AF-1: field "Status" is proposed twice/,
    );
  });
});

describe("entityId non-null is an update, and updates carry previousValue (AF-3)", () => {
  it("builds an update that names its entity and swears to what it replaces", () => {
    const affidavit = buildAffidavit(updateOp, [statusField, weightField], META);

    expect(affidavit.operationType).toBe("update");
    expect(affidavit.entityId).toBe("W-1");
    expect(affidavit.fields.map((field) => field.previousValue)).toEqual([null, 10]);
  });

  it("accepts previousValue null on an update field with no stored value", () => {
    const affidavit = buildAffidavit(updateOp, [statusField, weightField], META);
    const status = affidavit.fields[0];

    expect(status?.name).toBe("Status");
    expect(status?.previousValue).toBeNull();
    // Null under the key, not the key missing: the field is sworn to have had
    // nothing stored, which is a different claim from saying nothing.
    expect(status !== undefined && "previousValue" in status).toBe(true);
  });

  it("refuses an update field that does not carry the previousValue key at all", () => {
    const noKey: AffidavitFieldInput = {
      name: "Weight",
      kind: "number",
      value: 12.5,
      provenance: chainOf(mintConversation({ confidence: 0.9, at: AT })),
      isMandatory: false,
    };

    expect(() => buildAffidavit(updateOp, [statusField, noKey], META)).toThrow(
      /AF-3: update field "Weight" must carry a previousValue key/,
    );
  });

  it("builds a create with a null entityId and null previousValue on every field", () => {
    const affidavit = buildAffidavit(
      createOp,
      [
        { name: "Status", kind: "enum", value: "Active", isMandatory: true },
        { name: "Weight", kind: "number", value: 12.5, isMandatory: false },
      ],
      META,
    );

    expect(affidavit.operationType).toBe("create");
    expect(affidavit.entityId).toBeNull();
    expect(affidavit.fields.every((field) => field.previousValue === null)).toBe(true);
  });

  it("refuses a create field that claims a previous value", () => {
    expect(() =>
      buildAffidavit(
        createOp,
        [
          {
            name: "Status",
            kind: "enum",
            value: "Active",
            previousValue: "Retired",
            isMandatory: true,
          },
          { name: "Weight", kind: "number", value: 12.5, isMandatory: false },
        ],
        META,
      ),
    ).toThrow(/AF-3: create field "Status" must have previousValue null/);
  });
});

describe("the three confidence numbers (AF-2)", () => {
  it("takes the minimum, counts Empty as zero, and counts the empty fields", () => {
    const partiallyPopulated = buildAffidavit(
      {
        kind: "update",
        entityType: "Widget",
        entityId: "W-1",
        fields: ["Status", "Weight", "Colour"],
      },
      [
        { ...statusField, provenance: chainOf(mintConversation({ confidence: 0.8, at: AT })) },
        { ...weightField, provenance: chainOf(mintInferred({ confidence: 0.6, at: AT })) },
        { name: "Colour", kind: "text", value: null, previousValue: null, isMandatory: false },
      ],
      META,
    );

    expect(partiallyPopulated.aggregateConfidence).toBe(0);
    expect(partiallyPopulated.populatedConfidence).toBe(0.6);
    expect(partiallyPopulated.emptyFieldCount).toBe(1);
  });

  it("is the minimum, not the mean, when every field is populated", () => {
    const affidavit = buildAffidavit(updateOp, [statusField, weightField], META);

    // The mean of 1.0 and 0.9 is 0.95, which is what the shipped .NET projection
    // reports for this shape. AF-2 makes it the minimum.
    expect(affidavit.aggregateConfidence).toBe(0.9);
    expect(affidavit.populatedConfidence).toBe(0.9);
    expect(affidavit.emptyFieldCount).toBe(0);
  });

  it("reports populatedConfidence null when no field is populated", () => {
    const nothingKnown = buildAffidavit(
      updateOp,
      [statusWithUnknownProvenance, weightWithUnknownProvenance],
      META,
    );

    expect(nothingKnown.aggregateConfidence).toBe(0);
    expect(nothingKnown.populatedConfidence).toBeNull();
    expect(nothingKnown.emptyFieldCount).toBe(2);
  });

  it("reports zero, null and zero for an Affidavit with no fields", () => {
    expect(computeConfidence([])).toEqual({
      aggregateConfidence: 0,
      populatedConfidence: null,
      emptyFieldCount: 0,
    });
  });

  it("ignores the confidence an Empty tag claims", () => {
    const affidavit = buildAffidavit(
      updateOp,
      [
        statusField,
        {
          ...weightField,
          provenance: chainOf(mintTag({ source: "Empty", confidence: 1, at: AT })),
        },
      ],
      META,
    );

    expect(affidavit.aggregateConfidence).toBe(0);
    expect(affidavit.populatedConfidence).toBe(1);
    expect(affidavit.emptyFieldCount).toBe(1);
  });
});

describe("money is a decimal string plus a currency code (SR-2, shape)", () => {
  it("accepts the wire shape", () => {
    expect(isMoney({ amount: "4000.01", currency: "GBP" })).toBe(true);
  });

  it("rejects a binary float, a bare string and a missing currency", () => {
    expect(isMoney(4000.01)).toBe(false);
    expect(isMoney("4000.01")).toBe(false);
    expect(isMoney({ amount: "4000.01" })).toBe(false);
    expect(isMoney({ amount: 4000.01, currency: "GBP" })).toBe(false);
    expect(isMoney(null)).toBe(false);
    expect(isMoney([])).toBe(false);
  });
});

describe("field values are JSON values", () => {
  it("accepts scalars, arrays and plain objects", () => {
    expect(isJsonValue("Active")).toBe(true);
    expect(isJsonValue(12.5)).toBe(true);
    expect(isJsonValue(true)).toBe(true);
    expect(isJsonValue(null)).toBe(true);
    expect(isJsonValue([1, "two", { three: null }])).toBe(true);
    expect(isJsonValue({ amount: "1.00", currency: "GBP" })).toBe(true);
  });

  it("rejects what does not survive a round trip through JSON", () => {
    expect(isJsonValue(undefined)).toBe(false);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonValue(() => 1)).toBe(false);
    expect(isJsonValue(new Date(AT))).toBe(false);
    expect(isJsonValue(new Map())).toBe(false);
    expect(isJsonValue({ nested: { bad: undefined } })).toBe(false);
  });

  it("rejects a cycle rather than recurring forever", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(isJsonValue(cyclic)).toBe(false);
  });

  it("accepts the same object appearing twice without a cycle", () => {
    const shared = { a: 1 };
    expect(isJsonValue({ first: shared, second: shared })).toBe(true);
  });
});
