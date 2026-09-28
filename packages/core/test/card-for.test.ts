import { describe, expect, it } from "vitest";

import type { DocketEntry } from "../src/docket/entry.js";
import { isAffiantError, isCallerError } from "../src/errors.js";
import { cardFor } from "../src/gate/card.js";
import type { EvidenceCardRequest, PreparedField } from "../src/gate/pipeline.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { chainOf, mintConversation } from "../src/model/provenance.js";
import type { FieldSchema } from "../src/ports.js";

import { AT, harness, plus, policyReturning, turnContext, type Harness } from "./gate-support.js";

/**
 * `cardFor` — the Evidence Card for an entry that is already on the Docket.
 *
 * A filing returns a card, but a review queue lists entries long after they were
 * filed and has only the row. The two must not drift, so nearly every case here is
 * the same assertion: file through a real gate, then rebuild the card from the
 * stored row and hold it against the one the filing returned.
 *
 * The one licensed difference is the policy chain's sentence. It exists only while
 * the chain is running — the row records the verdict and not the prose — so a card
 * built from the row carries the sentences the row itself determines and no others
 * (SR-1, AZ-4, CV-4).
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global. The envelope
 * is held against the rulebook's JSON Schema in `test/node/card-for-schema.test.ts`,
 * which needs a validator that compiles code and so cannot run in a Worker.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIELDS = ["status", "amount", "note"] as const;

/** A field schema with something to render: a closed set and a mask (SR-1). */
const SCHEMA: FieldSchema = {
  entityType: "Invoice",
  fields: [
    {
      name: "status",
      kind: "enum",
      description: "The status",
      required: false,
      allowedValues: ["Active", "Retired"],
      pattern: null,
    },
    {
      name: "amount",
      kind: "number",
      description: "The amount",
      required: false,
      allowedValues: null,
      pattern: "^[0-9]+$",
    },
  ],
};

/** One host-tagged field, so the substance gate has something to admit (GT-3). */
function prepared(name: string, value: JsonValue): PreparedField {
  return {
    name,
    kind: "text",
    value,
    provenance: chainOf(
      mintConversation({ confidence: 0.9, at: AT, note: `Stated: ${name}`, conversationTurn: 1 }),
    ),
    isMandatory: false,
  };
}

/** File one entry through the gate's Sequence C entry point, with the hints declared. */
async function fileOne(
  h: Harness,
  init: { readonly operationLabel?: string; readonly schema?: FieldSchema } = {},
): Promise<{ readonly entry: DocketEntry; readonly card: EvidenceCardRequest }> {
  const filed = await h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: [...FIELDS],
      },
      toolName: "update_invoice",
      fields: [prepared("status", "Active"), prepared("amount", "40"), prepared("note", "kept")],
      args: null,
      schema: init.schema ?? SCHEMA,
      ...(init.operationLabel === undefined ? {} : { operationLabel: init.operationLabel }),
    },
    turnContext(),
  );
  return { entry: filed.entry, card: filed.card };
}

/** The `kind` of the caller error `run` throws, or `null` when it throws none. */
function kindOf(run: () => unknown): string | null {
  try {
    run();
  } catch (error) {
    if (isCallerError(error)) return error.kind;
    throw error;
  }
  return null;
}

// ---------------------------------------------------------------------------
// One builder (R-6): the filing's card and the row's card are the same card
// ---------------------------------------------------------------------------

describe("cardFor rebuilds the card the filing returned (SR-1)", () => {
  it("matches a pending entry's card byte for byte", async () => {
    const h = harness();
    const { entry, card } = await fileOne(h, { operationLabel: "Reprice" });

    expect(cardFor(entry, { now: AT, schema: SCHEMA, operationLabel: "Reprice" })).toEqual(card);
  });

  it("carries the hints and the host's verb the caller supplies now, not the ones at filing", async () => {
    const h = harness();
    const { entry } = await fileOne(h, { operationLabel: "Reprice" });

    const later = cardFor(entry, {
      now: AT,
      schema: {
        entityType: "Invoice",
        fields: [
          {
            name: "status",
            kind: "enum",
            description: "The status",
            required: false,
            // The host widened the picker after this entry was filed.
            allowedValues: ["Active", "Retired", "Draft"],
            pattern: null,
          },
        ],
      },
      operationLabel: "Re-price",
    });

    expect(later.presentation).toEqual([
      { name: "status", kind: "text", allowedValues: ["Active", "Retired", "Draft"] },
    ]);
    expect(later.hostOperation).toBe("Re-price");
  });

  it("omits presentation and hostOperation when the caller supplies neither", async () => {
    const h = harness();
    const { entry } = await fileOne(h, { operationLabel: "Reprice" });

    const card = cardFor(entry, { now: AT });

    expect("presentation" in card).toBe(false);
    expect("hostOperation" in card).toBe(false);
    expect(card.docketId).toBe(entry.entryId);
  });

  it("leaves out the policy chain's sentence, and keeps every other field", async () => {
    const h = harness({
      policies: [
        policyReturning({ requirement: "ReviewerConfirmation", reason: "over the day's limit" }),
      ],
    });
    const { entry, card } = await fileOne(h);

    const rebuilt = cardFor(entry, { now: AT, schema: SCHEMA });

    expect(card.warnings).toEqual(["over the day's limit"]);
    expect(rebuilt.warnings).toBeUndefined();
    expect({ ...rebuilt, warnings: card.warnings }).toEqual(card);
  });
});

// ---------------------------------------------------------------------------
// A resubmission's prior amendments come from the superseded row (R-5, DK-2)
// ---------------------------------------------------------------------------

describe("prior amendments (DK-1, DK-2)", () => {
  /** File, let it expire under a late amendment, and resubmit. */
  async function resubmitted(): Promise<{
    readonly h: Harness;
    readonly original: DocketEntry;
    readonly fresh: DocketEntry;
    readonly card: EvidenceCardRequest;
  }> {
    const h = harness({ defaultTtlMs: 60_000 });
    const { entry } = await fileOne(h);
    h.clock.set(plus(AT, 90_000));
    await h.gate
      .decide(entry.entryId, { kind: "approve", amendments: { amount: "4000" } }, turnContext())
      .catch(() => null);
    const filed = await h.gate.resubmit(entry.entryId, turnContext());
    const original = await h.gate.get(entry.entryId, turnContext());
    if (original === null) throw new Error("the superseded entry disappeared");
    return { h, original, fresh: filed.entry, card: filed.card };
  }

  it("matches the resubmission's own card when the superseded row is passed", async () => {
    const { h, original, fresh, card } = await resubmitted();

    const rebuilt = cardFor(fresh, { now: h.clock.now(), superseded: original });

    expect(rebuilt.priorAmendments).toEqual({ amount: "4000" });
    expect(rebuilt).toEqual(card);
  });

  it("reads a first filing's prior amendments off the row itself", async () => {
    const { h, original } = await resubmitted();

    expect(original.lineage.supersedes).toBeNull();
    expect(cardFor(original, { now: h.clock.now() }).priorAmendments).toEqual({ amount: "4000" });
  });

  it("refuses to build a superseding row's card without the superseded row", async () => {
    const { h, fresh } = await resubmitted();

    expect(kindOf(() => cardFor(fresh, { now: h.clock.now() }))).toBe("superseded-entry-mismatch");
  });

  it("refuses an entry that is not the one the lineage names", async () => {
    const { h, fresh } = await resubmitted();

    expect(
      kindOf(() =>
        cardFor(fresh, { now: h.clock.now(), superseded: { ...fresh, entryId: "other" } }),
      ),
    ).toBe("superseded-entry-mismatch");
  });

  it("refuses a superseded row from another tenant", async () => {
    const { h, original, fresh } = await resubmitted();

    expect(
      kindOf(() =>
        cardFor(fresh, { now: h.clock.now(), superseded: { ...original, tenantId: "tenant-b" } }),
      ),
    ).toBe("superseded-entry-mismatch");
  });

  it("refuses a superseded row passed for an entry that supersedes nothing", async () => {
    const { h, original, fresh } = await resubmitted();

    expect(kindOf(() => cardFor(original, { now: h.clock.now(), superseded: fresh }))).toBe(
      "superseded-entry-mismatch",
    );
  });

  it("throws a RangeError that is a caller error and not a refusal", async () => {
    const { h, fresh } = await resubmitted();

    try {
      cardFor(fresh, { now: h.clock.now() });
      expect.unreachable("a superseding row with no superseded row builds no card");
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
      expect(isCallerError(error)).toBe(true);
      expect(isAffiantError(error)).toBe(false);
      expect(isCallerError(error) ? error.details : null).toMatchObject({
        entryId: fresh.entryId,
        supersedes: fresh.lineage.supersedes,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// requiresConfirmation (R-4): DK-1's reading, AZ-4's silence
// ---------------------------------------------------------------------------

describe("requiresConfirmation (DK-1, DK-5, AZ-4)", () => {
  it("is true before the deadline and false at it", async () => {
    const h = harness({ defaultTtlMs: 60_000 });
    const { entry } = await fileOne(h);

    expect(cardFor(entry, { now: plus(entry.expiresAt, -1) }).requiresConfirmation).toBe(true);
    // The deadline is inclusive of the instant itself: an entry whose `expiresAt` is
    // exactly `now` is due, which is where `isDue` puts the boundary.
    expect(cardFor(entry, { now: entry.expiresAt }).requiresConfirmation).toBe(false);
    expect(cardFor(entry, { now: plus(entry.expiresAt, 60_000) }).requiresConfirmation).toBe(false);
  });

  it("is false on a decided row, whose card is still a card", async () => {
    const h = harness();
    const { entry } = await fileOne(h);
    const rejected = await h.gate.decide(
      entry.entryId,
      { kind: "reject", reason: "not this quarter" },
      turnContext(),
    );

    expect(cardFor(rejected, { now: AT }).requiresConfirmation).toBe(false);
  });

  it("is false on a Standing Order's approval, filed with nobody present (AZ-1)", async () => {
    const h = harness({
      policies: [policyReturning({ requirement: "StandingOrder" })],
    });
    const { entry, card } = await fileOne(h);

    expect(entry.status).toBe("approved");
    expect(cardFor(entry, { now: AT, schema: SCHEMA })).toEqual(card);
    expect(card.requiresConfirmation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blocked entries (AZ-4, CV-4)
// ---------------------------------------------------------------------------

describe("a blocked entry's card says so and asks for no confirmation (AZ-4, CV-4)", () => {
  it("rebuilds the card of an entry blocked for a requirement this version does not run", async () => {
    for (const level of ["MultiParty", "ReferralRequired"] as const) {
      const h = harness({ policies: [policyReturning({ requirement: level })] });
      const { entry, card } = await fileOne(h);

      const rebuilt = cardFor(entry, { now: AT, schema: SCHEMA });

      expect(entry.blocked).toEqual({ code: "requirement-not-implemented", level });
      expect(rebuilt).toEqual(card);
      expect(rebuilt.requiresConfirmation).toBe(false);
      expect(rebuilt.warnings?.[0]).toContain(level);
    }
  });

  it("rebuilds the card of an entry from a tool the host declared uncovered", async () => {
    const h = harness({ uncovered: [["update_invoice", "no-execute"]] });
    const { entry, card } = await fileOne(h);

    const rebuilt = cardFor(entry, { now: AT, schema: SCHEMA });

    expect(entry.blocked?.code).toBe("coverage-refused");
    expect(rebuilt).toEqual(card);
    expect(rebuilt.requiresConfirmation).toBe(false);
    expect(rebuilt.warnings?.[0]).toContain("update_invoice");
  });

  it("asks for no confirmation on a blocked entry even before its deadline", async () => {
    const h = harness({ policies: [policyReturning({ requirement: "MultiParty" })] });
    const { entry } = await fileOne(h);

    expect(entry.status).toBe("pending");
    expect(cardFor(entry, { now: plus(entry.expiresAt, -1) }).requiresConfirmation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The amended record (AF-2, AF-4)
// ---------------------------------------------------------------------------

describe("an amended row's card shows the amended record (AF-2, AF-4)", () => {
  it("shows the accepted state and the numbers recomputed over it", async () => {
    const h = harness();
    const { entry } = await fileOne(h);

    const approved = await h.gate.decide(
      entry.entryId,
      { kind: "approve", amendments: { amount: "4000" } },
      turnContext(),
    );
    const card = cardFor(approved, { now: AT, schema: SCHEMA });

    expect(approved.amendedAffidavit).not.toBeNull();
    const amount = card.affidavit.fields.find((field) => field.name === "amount");
    expect(amount?.value).toBe("4000");
    expect(amount?.provenance.current.source).toBe("UserStated");
    expect(card.populatedConfidence).toBe(approved.amendedAffidavit?.populatedConfidence);
    expect(card.emptyFieldCount).toBe(approved.amendedAffidavit?.emptyFieldCount);
  });

  it("leaves a cleared optional field off the card's fields (AF-1, AF-4)", async () => {
    const h = harness();
    const { entry } = await fileOne(h);

    const approved = await h.gate.decide(
      entry.entryId,
      { kind: "approve", amendments: { note: null } },
      turnContext(),
    );
    const card = cardFor(approved, { now: AT });

    expect(card.affidavit.fields.map((field) => field.name)).toEqual(["status", "amount"]);
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("cardFor reads no store, no clock and no port", () => {
  it("builds the same card twice from a row nothing has touched", async () => {
    const h = harness();
    const { entry } = await fileOne(h);
    const events = h.telemetry.events.length;
    const steps = [...h.trace];

    const first = cardFor(entry, { now: AT, schema: SCHEMA });
    const second = cardFor(entry, { now: AT, schema: SCHEMA });

    expect(first).toEqual(second);
    // Nothing emitted, no port stepped: the filing's own trace is all there is.
    expect(h.telemetry.events.length).toBe(events);
    expect(h.trace).toEqual(steps);
  });

  it("refuses an instant no runtime can read", async () => {
    const h = harness();
    const { entry } = await fileOne(h);

    expect(() => cardFor(entry, { now: "the day before yesterday" })).toThrow(RangeError);
  });
});
