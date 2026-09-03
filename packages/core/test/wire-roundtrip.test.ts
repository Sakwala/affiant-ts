import type { Affidavit as WireAffidavit } from "@affiant/contract";
import { describe, expect, it } from "vitest";

import { fromWire, toWire, wireCarryOf } from "../src/model/affidavit.js";
import { isBound, isHonourable } from "../src/model/provenance.js";

import { evidenceCardRequest } from "./fixtures/evidence-card-request.js";

const AT = "2026-09-04T10:00:00.000Z";

const seed: WireAffidavit = evidenceCardRequest.affidavit;
const carry = wireCarryOf(seed);
const core = fromWire(seed, { at: AT, conversationTurn: 3 });

describe("the seed wire fixture, read into the core model", () => {
  it("derives the operation shape from entityId, not from the host's verb (AF-3)", () => {
    expect(seed.operationType).toBe("WriteUpdate");
    expect(core.operationType).toBe("update");
    expect(core.entityId).toBe("W-1");
  });

  it("carries the update's previous values, null where nothing was stored (AF-3)", () => {
    expect(core.fields.map((field) => field.name)).toEqual(["Status", "Weight"]);
    expect(core.fields[0]?.previousValue).toBeNull();
    expect(core.fields[1]?.previousValue).toBe(10);
  });

  it("carries each tag's source, confidence, note and turn", () => {
    expect(core.fields[0]?.provenance.current).toMatchObject({
      source: "UserStated",
      confidence: 1,
      note: "User stated: Status",
      conversationTurn: null,
      at: AT,
    });
    expect(core.fields[1]?.provenance.current).toMatchObject({
      source: "Conversation",
      confidence: 0.9,
      note: "Extracted from search_widget",
      conversationTurn: 3,
    });
  });

  it("leaves an asserted grade unbound, because no wire type raises a grade (PV-5)", () => {
    const status = core.fields[0]?.provenance.current;
    expect(status?.source).toBe("UserStated");
    expect(status !== undefined && isBound(status)).toBe(false);
    expect(status !== undefined && isHonourable(status)).toBe(false);
  });

  it("refuses a field value that is not a JSON value", () => {
    // The wire type says a value is a JsonValue. A payload off a network only
    // claims to be one, so the cast here is exactly the lie the guard is for.
    const broken = {
      ...seed,
      fields: [{ ...seed.fields[0]!, value: undefined }],
    } as unknown as WireAffidavit;

    expect(() => fromWire(broken, { at: AT })).toThrow(RangeError);
    expect(() => fromWire(broken, { at: AT })).toThrow(/is not a JSON value/);
  });

  it("reads a create-shaped wire Affidavit as a create", () => {
    const created: WireAffidavit = {
      ...seed,
      entityId: null,
      fields: seed.fields.map((field) => ({ ...field, previousValue: null })),
    };
    const asCore = fromWire(created, { at: AT });

    expect(asCore.operationType).toBe("create");
    expect(asCore.entityId).toBeNull();
    expect(asCore.fields.every((field) => field.previousValue === null)).toBe(true);
  });
});

describe("the aggregate the seed carries and the one AF-2 computes", () => {
  it("carries the mean of its two fields on the wire", () => {
    const confidences = seed.fields.map((field) => field.provenance.current.confidence);
    const mean = confidences.reduce((total, one) => total + one, 0) / confidences.length;

    expect(confidences).toEqual([1, 0.9]);
    expect(seed.aggregateConfidence).toBe(0.95);
    expect(mean).toBe(0.95);
  });

  it("computes the minimum instead, and reports the two companion numbers", () => {
    expect(core.aggregateConfidence).toBe(0.9);
    expect(core.populatedConfidence).toBe(0.9);
    expect(core.emptyFieldCount).toBe(0);
  });
});

describe("round trip through the wire pair", () => {
  it("returns the seed exactly, but for the aggregate the rule recomputes", () => {
    expect(toWire(core, carry)).toEqual({ ...seed, aggregateConfidence: 0.9 });
  });

  it("writes the computed aggregate, never the one it was handed", () => {
    expect(toWire(core, carry).aggregateConfidence).toBe(0.9);
  });

  it("hands presentation back to the caller rather than swearing to it", () => {
    expect(carry.operationType).toBe("WriteUpdate");
    expect(carry.warnings).toEqual([]);
    expect(carry.requiresConfirmation).toBe(true);
    expect(carry.fieldConstraints["Status"]).toEqual({
      allowedValues: ["Active", "Retired"],
      pattern: null,
    });
    expect(carry.fieldConstraints["Weight"]).toEqual({
      allowedValues: null,
      pattern: "^\\d+(\\.\\d+)?$",
    });
  });

  it("is stable: a second trip changes nothing further", () => {
    const once = toWire(core, carry);
    const twice = toWire(fromWire(once, { at: AT, conversationTurn: 3 }), wireCarryOf(once));
    expect(twice).toEqual(once);
  });
});
