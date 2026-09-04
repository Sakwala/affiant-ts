import type { Affidavit as WireAffidavit, EvidenceCardRequest } from "@affiant/contract";
import { PROTOCOL_VERSION } from "@affiant/contract";
import { describe, expect, it } from "vitest";

import type { Affidavit } from "../src/model/affidavit.js";
import {
  buildAffidavit,
  fromWire,
  presentationToWire,
  toWire,
  wireCarryOf,
} from "../src/model/affidavit.js";
import { chainOf, isBound, isHonourable, mintTag } from "../src/model/provenance.js";

import { evidenceCardRequest } from "./fixtures/evidence-card-request.js";

const AT = "2026-09-04T10:00:00.000Z";
const EARLIER = "2026-09-04T09:00:00.000Z";

/**
 * An update-shaped Affidavit with the two cases a round trip has to survive: a
 * field whose tag points at something checkable, and one whose tag does not.
 */
function sworn(): Affidavit {
  return buildAffidavit(
    {
      kind: "update",
      entityType: "Widget",
      entityId: "W-1",
      fields: ["Status", "Weight"],
    },
    [
      {
        name: "Status",
        kind: "enum",
        value: "Active",
        previousValue: null,
        isMandatory: true,
        provenance: chainOf(
          mintTag({
            source: "External",
            confidence: 1,
            note: "Read from the widget register",
            at: EARLIER,
            binding: {
              kind: "external-ref",
              ref: { system: "widget-register", recordId: "W-1" },
            },
          }),
        ),
      },
      {
        name: "Weight",
        kind: "number",
        value: 12.5,
        previousValue: 10,
        isMandatory: false,
        provenance: {
          current: mintTag({
            source: "Conversation",
            confidence: 0.9,
            note: "Extracted from search_widget",
            at: AT,
            conversationTurn: 3,
          }),
          prior: [mintTag({ source: "Default", confidence: 0.2, at: EARLIER })],
        },
      },
    ],
    { createdAt: AT, conversationTurn: 3 },
  );
}

const core = sworn();
const wire = toWire(core);

describe("a core Affidavit written out to the v0.1 wire", () => {
  it("stamps the protocol version the envelope conforms to (SR-4)", () => {
    expect(wire.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(PROTOCOL_VERSION).toBe("0.1.0");
  });

  it("swears to the operation's shape, never to the host's verb (AF-3)", () => {
    expect(wire.operationType).toBe("update");
    expect(wire.entityId).toBe("W-1");
  });

  it("carries all three of AF-2's numbers on the record itself", () => {
    expect(wire.aggregateConfidence).toBe(0.9);
    expect(wire.populatedConfidence).toBe(0.9);
    expect(wire.emptyFieldCount).toBe(0);
  });

  it("carries no presentation on a sworn field", () => {
    for (const field of wire.fields) {
      expect(field).not.toHaveProperty("allowedValues");
      expect(field).not.toHaveProperty("pattern");
    }
  });

  it("carries neither the warnings nor the confirmation flag on the record", () => {
    expect(wire).not.toHaveProperty("warnings");
    expect(wire).not.toHaveProperty("requiresConfirmation");
  });

  it("writes each tag's note, instant and binding, and everything the chain displaced", () => {
    expect(wire.fields[0]?.provenance.current).toEqual({
      source: "External",
      confidence: 1,
      note: "Read from the widget register",
      at: EARLIER,
      conversationTurn: null,
      binding: { kind: "external-ref", ref: { system: "widget-register", recordId: "W-1" } },
    });
    expect(wire.fields[1]?.provenance.prior).toHaveLength(1);
    expect(wire.fields[1]?.provenance.prior[0]?.source).toBe("Default");
  });

  it("writes an unbound tag's binding as an explicit null, never as a missing key", () => {
    const weight = wire.fields[1]?.provenance.current;

    expect(weight?.binding).toBeNull();
    expect(weight !== undefined && "binding" in weight).toBe(true);
  });
});

describe("round trip through the wire pair", () => {
  it("returns the record it was handed, field for field and tag for tag", () => {
    expect(fromWire(wire, { at: AT })).toEqual(core);
  });

  it("is stable: a second trip changes nothing further", () => {
    expect(toWire(fromWire(wire, { at: AT }))).toEqual(wire);
  });

  it("derives the operation shape from entityId, not from what the record claims", () => {
    // A record whose `operationType` disagrees with its own `entityId` still lands
    // on the right side of AF-3: the shape is derived, never trusted.
    const lying = { ...wire, operationType: "create" } as WireAffidavit;

    expect(fromWire(lying, { at: AT }).operationType).toBe("update");
  });

  it("reads a create-shaped record as a create", () => {
    const created: WireAffidavit = {
      ...wire,
      entityId: null,
      operationType: "create",
      fields: wire.fields.map((field) => ({ ...field, previousValue: null })),
    };
    const asCore = fromWire(created, { at: AT });

    expect(asCore.operationType).toBe("create");
    expect(asCore.entityId).toBeNull();
    expect(asCore.fields.every((field) => field.previousValue === null)).toBe(true);
  });

  it("carries a grade without raising it (PV-4, PV-5)", () => {
    const read = fromWire(wire, { at: AT });
    const status = read.fields[0]?.provenance.current;
    const weight = read.fields[1]?.provenance.current;

    // The bound `External` tag came back bound and honourable; the `Conversation`
    // tag is below the line a binding is required at, and neither was promoted.
    expect(status !== undefined && isBound(status)).toBe(true);
    expect(status !== undefined && isHonourable(status)).toBe(true);
    expect(weight !== undefined && isBound(weight)).toBe(false);
  });

  it("refuses a field value that is not a JSON value", () => {
    // The wire type says a value is a JsonValue. A payload off a network only
    // claims to be one, so the cast here is exactly the lie the guard is for.
    const broken = {
      ...wire,
      fields: [{ ...wire.fields[0]!, value: undefined }],
    } as unknown as WireAffidavit;

    expect(() => fromWire(broken, { at: AT })).toThrow(RangeError);
    expect(() => fromWire(broken, { at: AT })).toThrow(/is not a JSON value/);
  });
});

describe("a payload from another protocol version is refused, never guessed at (SR-4)", () => {
  it("refuses the superseded 0.0.1-seed record rather than converting it", () => {
    // The seed is not a subset of v0.1: it names the host's verb where the shape
    // belongs, carries one confidence number rather than three, and puts the
    // warnings and the per-field presentation on the record. Reading it as this
    // shape would produce a record that swore to things nobody said.
    const seed = evidenceCardRequest.affidavit as unknown as WireAffidavit;

    expect(() => fromWire(seed, { at: AT })).toThrow(RangeError);
    expect(() => fromWire(seed, { at: AT })).toThrow(/SR-4/);
    expect(() => fromWire(seed, { at: AT })).toThrow(/seedSchemas/);
  });

  it("refuses a differing major", () => {
    expect(() => fromWire({ ...wire, protocolVersion: "1.0.0" }, { at: AT })).toThrow(RangeError);
  });

  it("accepts a newer minor, because a minor only adds", () => {
    // And keeps the version it arrived under (SR-4). The record is otherwise the
    // same record: restamping it with this package's own version would make
    // `toWire(fromWire(x))` a different document from `x`, and — since SR-1's
    // canonical form is over the record as the schema defines it, `protocolVersion`
    // included — a different hash for evidence nobody changed.
    const newer = fromWire({ ...wire, protocolVersion: "0.2.0" }, { at: AT });

    expect(newer).toEqual({ ...core, protocolVersion: "0.2.0" });
    expect(toWire(newer).protocolVersion).toBe("0.2.0");
  });
});

describe("the presentation the record does not swear to", () => {
  const card: EvidenceCardRequest = {
    protocolVersion: PROTOCOL_VERSION,
    docketId: "8f14e45f-ceea-467e-bd76-000000000001",
    affidavit: wire,
    requiredBy: "2026-09-04T10:30:00.000Z",
    priorAmendments: null,
    populatedConfidence: wire.populatedConfidence,
    emptyFieldCount: wire.emptyFieldCount,
    blocked: null,
    presentation: [{ name: "Status", kind: "enum", allowedValues: ["Active", "Retired"] }],
    warnings: ["Weight was read from the conversation rather than a system of record."],
    hostOperation: "WriteUpdate",
    requiresConfirmation: true,
  };

  it("comes off the envelope, not off the record", () => {
    const carry = wireCarryOf(card);

    expect(carry.requiresConfirmation).toBe(true);
    expect(carry.warnings).toHaveLength(1);
    expect(carry.presentation[0]?.allowedValues).toEqual(["Active", "Retired"]);
    // The host's word for the act, beside the shape the record swears to and never
    // instead of it: the Affidavit still says `update`.
    expect(carry.hostOperation).toBe("WriteUpdate");
    expect(card.affidavit.operationType).toBe("update");
  });

  it("hands an empty slot back as an empty array, and writes it back out as an absent one", () => {
    const { presentation: _hints, warnings: _sentences, hostOperation: _verb, ...bareCard } = card;
    const bare = wireCarryOf(bareCard);

    expect(bare.presentation).toEqual([]);
    expect(bare.warnings).toEqual([]);
    expect(bare.hostOperation).toBeNull();
    expect(presentationToWire(bare)).toEqual({});
  });

  it("round trips a card's three slots unchanged", () => {
    expect(presentationToWire(wireCarryOf(card))).toEqual({
      presentation: card.presentation,
      warnings: card.warnings,
      hostOperation: card.hostOperation,
    });
  });
});
