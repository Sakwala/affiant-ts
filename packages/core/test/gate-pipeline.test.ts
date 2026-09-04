import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "@affiant/contract";

import type { ApprovalPolicy } from "../src/gate/policy.js";
import { AffiantError } from "../src/errors.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { computeConfidence } from "../src/model/affidavit.js";
import type { InferenceSource } from "../src/model/provenance.js";
import { mintInference } from "../src/model/provenance.js";
import type { InterceptedFields } from "../src/ports.js";

import {
  AT,
  harness,
  interceptorPort,
  plus,
  policyReturning,
  structured,
  turnContext,
  writeTool,
} from "./gate-support.js";
import type { Trace } from "./gate-support.js";

/**
 * The pipeline's order, its refusals and its deadlines.
 *
 * GT-1 (the fixed order), GT-3 (runtime substance refusal), GT-4 (TTL from the policy
 * result, and a re-file that keeps the existing deadline), AF-1 and AF-3 (what the
 * Affidavit must carry), PV-1 (the merge), PV-2 (the utterance-span binding), PV-3
 * (the inference step cannot mint `UserStated`), SR-4 (the card names its protocol
 * version).
 */

const EXTERNAL: InterceptedFields = {
  status: {
    value: "Active",
    source: "External",
    binding: {
      kind: "external-ref",
      ref: { system: "billing", recordId: "invoice-1" },
    },
    confidence: 1,
    evidence: "billing system of record",
  },
};

describe("the pipeline runs its steps in the protocol order (GT-1)", () => {
  it("runs interceptors, then inference, then projection, then policy", async () => {
    const trace: Trace = [];
    const { gate } = harness({
      trace,
      interceptors: [interceptorPort("billing", EXTERNAL, trace)],
      inferred: { status: structured("Active", "literal", 0.9) },
      policies: [policyReturning(null, { trace })],
      previousValues: { status: "Draft" },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    expect(trace).toEqual(["interceptor:billing", "inference", "projection", "policy:policy-1"]);
  });

  it("files nothing until the policy chain has spoken", async () => {
    const { gate, store } = harness({
      policies: [
        {
          id: "observer",
          version: "1.0.0",
          declaredInputs: [],
          async evaluate() {
            const pending = await store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
            seenAtPolicy = pending.items.length;
            return null;
          },
        } satisfies ApprovalPolicy,
      ],
    });
    let seenAtPolicy = -1;

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    expect(seenAtPolicy).toBe(0);
    const after = await store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
    expect(after.items).toHaveLength(1);
  });

  it("does not consult a policy about a proposal that swears to nothing (GT-3 before GT-1 step 7)", async () => {
    const trace: Trace = [];
    const { gate } = harness({
      trace,
      inferred: {},
      policies: [policyReturning({ requirement: "StandingOrder" }, { trace })],
    });

    const result = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    expect(result).toMatchObject({ kind: "error", code: "substance-refused" });
    expect(trace).not.toContain("policy:policy-1");
  });
});

describe("runtime substance refusal (GT-3)", () => {
  it("refuses a proposal whose every field has Empty provenance", async () => {
    const { gate, store, telemetry } = harness({ inferred: {} });

    const result = await gate.wrap(writeTool(), turnContext()).execute({ status: null });

    expect(result).toMatchObject({
      kind: "error",
      code: "substance-refused",
      message: expect.stringContaining("no proposed field carries provenance other than Empty"),
    });
    expect(telemetry.keys()).toContain("affidavit.refused.substance");
    expect(telemetry.keys()).not.toContain("affidavit.filed");
    const pending = await store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
    expect(pending.items).toHaveLength(0);
  });

  it("refuses a hollow proposal and names the field: a value under Empty provenance", async () => {
    const { gate, store, telemetry } = harness({ inferred: {} });

    await expect(
      gate.file(
        {
          operation: {
            kind: "update",
            entityType: "Invoice",
            entityId: "invoice-1",
            fields: ["status"],
          },
          toolName: "capture",
          fields: [{ name: "status", kind: "text", value: "Active" }],
        },
        turnContext(),
      ),
    ).rejects.toThrow(/carries a value with Empty provenance/);

    expect(telemetry.find("affidavit.refused.substance")?.attributes["reason"]).toBe(
      'field "status" carries a value with Empty provenance',
    );
    const pending = await store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
    expect(pending.items).toHaveLength(0);
  });

  it("counts a blank string as no value, so an Empty tag over one is not hollow", async () => {
    const { gate } = harness({
      inferred: { status: structured("Active", "literal", 0.9) },
    });

    const result = await gate.file(
      {
        operation: {
          kind: "update",
          entityType: "Invoice",
          entityId: "invoice-1",
          fields: ["status", "note"],
        },
        toolName: "capture",
        fields: [
          {
            name: "status",
            kind: "text",
            value: "Active",
            provenance: {
              current: {
                source: "Conversation",
                confidence: 0.9,
                note: null,
                at: AT,
                conversationTurn: null,
                binding: null,
              },
              prior: [],
            },
          },
          { name: "note", kind: "text", value: "   " },
        ],
      },
      turnContext(),
    );

    expect(result.entry.status).toBe("pending");
    expect(result.entry.affidavit.emptyFieldCount).toBe(1);
  });
});

describe("the inference step and the merge (PV-1, PV-2, PV-3)", () => {
  it("tags a literal value Conversation and binds it to the span it came from", async () => {
    const utterance = "Set the invoice status to Active";
    const { gate } = harness({
      inferred: {
        status: structured("Active", "literal", 0.9, {
          start: utterance.indexOf("Active"),
          end: utterance.length,
        }),
      },
    });

    const filed = await gate.wrap(writeTool(), turnContext({ utterance })).execute({
      status: "Active",
    });
    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");

    const field = filed.card.affidavit.fields[0];
    expect(field?.provenance.current.source).toBe("Conversation");
  });

  it("keeps the binding on the stored tag, with the span's own hash", async () => {
    const utterance = "Set the invoice status to Active";
    const { gate, store } = harness({
      inferred: {
        status: structured("Active", "literal", 0.9, {
          start: utterance.indexOf("Active"),
          end: utterance.length,
        }),
      },
    });

    await gate.wrap(writeTool(), turnContext({ utterance })).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const binding = entry?.affidavit.fields[0]?.provenance.current.binding;
    expect(binding?.kind).toBe("utterance-span");
    if (binding?.kind !== "utterance-span") expect.unreachable("an utterance-span binding");
    expect(binding.ref.offset).toBe(utterance.indexOf("Active"));
    expect(binding.ref.length).toBe("Active".length);
    expect(binding.ref.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("drops a span that does not fit the turn rather than binding to nothing", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Active", "literal", 0.9, { start: 0, end: 10_000 }) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Conversation");
    expect(entry?.affidavit.fields[0]?.provenance.current.binding).toBeNull();
  });

  it("tags a reasoned value Inferred, with no binding", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Active", "inferred", 0.4) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Inferred");
    expect(entry?.affidavit.fields[0]?.provenance.current.confidence).toBe(0.4);
  });

  it("clamps a confidence the port reports outside [0, 1] (PV-1)", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Active", "inferred", 7) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.confidence).toBe(1);
  });

  it("lets a bound External interceptor beat a lower-confidence guess, keeping the loser", async () => {
    const { gate, store } = harness({
      interceptors: [interceptorPort("billing", EXTERNAL)],
      inferred: { status: structured("Draft", "inferred", 0.4) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const chain = entry?.affidavit.fields[0]?.provenance;
    expect(chain?.current.source).toBe("External");
    expect(entry?.affidavit.fields[0]?.value).toBe("Active");
    expect(chain?.prior.map((tag) => tag.source)).toEqual(["Inferred"]);
  });

  it("never mints UserStated from the inference path (PV-3)", async () => {
    const { gate, store } = harness({
      inferred: {
        status: structured("Active", "literal", 1),
        note: structured("urgent", "inferred", 1),
      },
    });

    await gate
      .wrap(writeTool({ fields: ["status", "note"] }), turnContext())
      .execute({ status: "Active", note: "urgent" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const sources = entry?.affidavit.fields.map((field) => field.provenance.current.source);
    expect(sources).toEqual(["Conversation", "Inferred"]);
    expect(sources).not.toContain("UserStated");
  });

  it("refuses a UserStated mint from an untyped caller at runtime (PV-3)", () => {
    expect(() =>
      mintInference("UserStated" as unknown as InferenceSource, { confidence: 1, at: AT }),
    ).toThrow(RangeError);
  });
});

describe("projection and the Affidavit's shape (AF-1, AF-3)", () => {
  it("carries entityId and a previousValue key on every field of an update", async () => {
    const { gate, store } = harness({
      inferred: {
        status: structured("Active", "literal", 0.9),
        note: structured("urgent", "inferred", 0.5),
      },
      previousValues: { status: "Draft" },
    });

    await gate
      .wrap(writeTool({ fields: ["status", "note"] }), turnContext())
      .execute({ status: "Active", note: "urgent" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.operationType).toBe("update");
    expect(entry?.affidavit.entityId).toBe("invoice-1");
    expect(entry?.affidavit.fields.map((field) => field.previousValue)).toEqual(["Draft", null]);
  });

  it("does not consult the projection port for a create, and nulls every previous value", async () => {
    const trace: Trace = [];
    const { gate, store } = harness({ trace, previousValues: { status: "Draft" } });

    await gate.wrap(writeTool({ entityId: null }), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(trace).not.toContain("projection");
    expect(entry?.affidavit.operationType).toBe("create");
    expect(entry?.affidavit.entityId).toBeNull();
    expect(entry?.affidavit.fields.map((field) => field.previousValue)).toEqual([null]);
  });

  it("records a proposed field the ports said nothing about as Empty, never absent (AF-1)", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Active", "literal", 0.9) },
      previousValues: null,
    });

    await gate
      .wrap(writeTool({ fields: ["status", "note"] }), turnContext())
      .execute({ status: "Active", note: "urgent" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields.map((field) => field.name)).toEqual(["status", "note"]);
    expect(entry?.affidavit.fields[1]?.provenance.current.source).toBe("Empty");
    expect(entry?.affidavit.emptyFieldCount).toBe(1);
    expect(entry?.affidavit.aggregateConfidence).toBe(0);
  });
});

describe("TTL is stamped after the policy chain (GT-4)", () => {
  it("takes the deadline from the verdict", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "ReviewerConfirmation", ttlMs: 5 * 60_000 })],
      defaultTtlMs: 30 * 60_000,
    });

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.entry.expiresAt).toBe(plus(AT, 5 * 60_000));
  });

  it("falls back to the policy's own default", async () => {
    const { gate } = harness({
      policies: [
        policyReturning({ requirement: "ReviewerConfirmation" }, { defaultTtlMs: 9 * 60_000 }),
      ],
      defaultTtlMs: 30 * 60_000,
    });

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.entry.expiresAt).toBe(plus(AT, 9 * 60_000));
  });

  it("falls back to the gate's default when nothing else names one", async () => {
    const { gate } = harness({ defaultTtlMs: 30 * 60_000 });

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.entry.expiresAt).toBe(plus(AT, 30 * 60_000));
  });

  it("keeps the existing deadline when the same call is retried", async () => {
    const { gate, clock } = harness({ defaultTtlMs: 30 * 60_000 });
    const tool = writeTool();
    const ctx = turnContext();

    const first = await gate.wrap(tool, ctx).execute({ status: "Active" });
    clock.set(plus(AT, 60_000));
    const second = await gate.wrap(tool, ctx).execute({ status: "Active" });

    if (first.kind !== "write" || second.kind !== "write") {
      expect.unreachable("both calls produce proposals");
    }
    expect(second.entryId).toBe(first.entryId);
    expect(second.card.requiredBy).toBe(first.card.requiredBy);
    expect(second.card.requiredBy).toBe(plus(AT, 30 * 60_000));
  });

  it("reports a retry as a replay rather than a second filing", async () => {
    const { gate } = harness();

    const first = await gate.file(proposal(), turnContext());
    const second = await gate.file(proposal(), turnContext());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.entryId).toBe(first.entry.entryId);
  });

  it("gives two different calls two different entries", async () => {
    const { gate } = harness();
    const tool = writeTool();
    const ctx = turnContext();

    const first = await gate.wrap(tool, ctx).execute({ status: "Active" });
    const second = await gate.wrap(tool, ctx).execute({ status: "Retired" });

    if (first.kind !== "write" || second.kind !== "write") {
      expect.unreachable("both calls produce proposals");
    }
    expect(second.entryId).not.toBe(first.entryId);
  });

  it("derives an entry id in the UUID shape the wire expects", async () => {
    const { gate } = harness();

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.entry.entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("the Evidence Card (SR-4)", () => {
  it("names the protocol version the envelope conforms to", async () => {
    const { gate } = harness();

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.card.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(filed.card.protocolVersion).toBe(filed.entry.protocolVersion);
  });

  it("carries the entry's deadline and its id", async () => {
    const { gate } = harness({ defaultTtlMs: 30 * 60_000 });

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.card.docketId).toBe(filed.entry.entryId);
    expect(filed.card.requiredBy).toBe(filed.entry.expiresAt);
    expect(filed.card.priorAmendments).toBeNull();
  });

  it("asks for confirmation on a pending entry and not on an approved one", async () => {
    const pending = await harness().gate.file(proposal(), turnContext());
    const approved = await harness({
      policies: [policyReturning({ requirement: "StandingOrder" })],
    }).gate.file(proposal(), turnContext());

    expect(pending.card.requiresConfirmation).toBe(true);
    expect(approved.card.requiresConfirmation).toBe(false);
  });

  it("does not ask for a confirmation on a blocked entry, and says why on the card", async () => {
    const { gate } = harness({ policies: [policyReturning({ requirement: "MultiParty" })] });

    const filed = await gate.file(proposal(), turnContext());

    // The row is `pending` and refuses every decision (AZ-4). A card that also said
    // `requiresConfirmation: true` would hand a reviewer surface an approve button
    // that cannot work, on the same card whose warning says so.
    expect(filed.entry.status).toBe("pending");
    expect(filed.card.requiresConfirmation).toBe(false);
    expect(filed.card.blocked).toEqual({
      code: "requirement-not-implemented",
      level: "MultiParty",
    });
  });

  it("marks a coverage-refused proposal blocked on the envelope too (CV-4)", async () => {
    const { gate } = harness({ uncovered: [["relay_capture", "provider-executed"]] });

    const filed = await gate.file(proposal(), turnContext());

    expect(filed.card.blocked).toEqual({
      code: "coverage-refused",
      category: "provider-executed",
      toolName: "relay_capture",
    });
    expect(filed.card.requiresConfirmation).toBe(false);
  });

  it("carries the host schema's per-field input constraints, pattern included", async () => {
    const { gate } = harness();

    const filed = await gate.file(
      {
        operation: {
          kind: "update" as const,
          entityType: "Invoice",
          entityId: "invoice-1",
          fields: ["status"],
        },
        toolName: "update_invoice",
        schema: {
          entityType: "Invoice",
          fields: [
            {
              name: "status",
              kind: "enum" as const,
              description: "The status",
              required: true,
              allowedValues: ["Active", "Retired"],
              pattern: "^(Active|Retired)$",
            },
          ],
        },
      },
      turnContext(),
    );

    // The hints ride the envelope, not the sworn record: a reviewer surface renders
    // them and the gate validates nothing against them, so they are no part of the
    // canonical form a host's execution grant binds to (SR-1).
    expect(filed.card.presentation).toEqual([
      {
        name: "status",
        kind: "enum",
        allowedValues: ["Active", "Retired"],
        pattern: "^(Active|Retired)$",
      },
    ]);
    const status = filed.card.affidavit.fields[0];
    expect(status).toBeDefined();
    expect(status).not.toHaveProperty("pattern");
    expect(status).not.toHaveProperty("allowedValues");
  });

  it("omits the presentation entirely where the host schema names no hint", async () => {
    const { gate } = harness();

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    // Absent rather than an array of nulls: nothing swears to a hint, so a producer
    // with nothing to say says nothing, and a consumer reads "no hint, render from
    // the field's own kind".
    expect(filed.card.presentation).toBeUndefined();
    expect("presentation" in filed.card).toBe(false);
  });

  it("carries no blocked marker on an entry a person can decide", async () => {
    const filed = await harness().gate.file(proposal(), turnContext());

    expect(filed.card.blocked).toBeNull();
    expect(filed.card.requiresConfirmation).toBe(true);
  });
});

describe("the card carries all three of AF-2's numbers", () => {
  /** One populated field at 0.9 and two the ports said nothing about. */
  function mixedProposal() {
    return {
      operation: {
        kind: "update" as const,
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: ["status", "memo", "owner"],
      },
      toolName: "relay_capture",
      fields: [
        {
          name: "status",
          kind: "text" as const,
          value: "Active",
          provenance: {
            current: {
              source: "Conversation" as const,
              confidence: 0.9,
              note: null,
              at: AT,
              conversationTurn: null,
              binding: null,
            },
            prior: [],
          },
        },
        { name: "memo", kind: "text" as const, value: null },
        { name: "owner", kind: "text" as const, value: null },
      ],
    };
  }

  it("shows the populated minimum and the empty-field count a wire Affidavit cannot", async () => {
    const { gate } = harness();

    const filed = await gate.file(mixedProposal(), turnContext());

    // Without the other two a reviewer reads `aggregateConfidence: 0` and cannot
    // tell how many fields are empty or how good the populated one is.
    expect(filed.card.affidavit.aggregateConfidence).toBe(0);
    expect(filed.card.populatedConfidence).toBe(0.9);
    expect(filed.card.emptyFieldCount).toBe(2);
  });

  it("agrees with the model on every one of the three", async () => {
    const { gate } = harness();

    const filed = await gate.file(mixedProposal(), turnContext());
    const numbers = computeConfidence(filed.entry.affidavit.fields);

    expect(filed.card.affidavit.aggregateConfidence).toBe(numbers.aggregateConfidence);
    expect(filed.card.populatedConfidence).toBe(numbers.populatedConfidence);
    expect(filed.card.emptyFieldCount).toBe(numbers.emptyFieldCount);
    expect(filed.card.affidavit.aggregateConfidence).toBe(
      filed.entry.affidavit.aggregateConfidence,
    );
    expect(filed.card.populatedConfidence).toBe(filed.entry.affidavit.populatedConfidence);
    expect(filed.card.emptyFieldCount).toBe(filed.entry.affidavit.emptyFieldCount);
  });

  it("carries all three on the card a wrapped tool's execute hands back", async () => {
    const { gate } = harness({
      inferred: { status: structured("Active", "literal", 0.9) },
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const stored = await gate.get(filed.entryId, turnContext());
    const numbers = computeConfidence(stored?.affidavit.fields ?? []);

    expect(filed.card.affidavit.aggregateConfidence).toBe(numbers.aggregateConfidence);
    expect(filed.card.populatedConfidence).toBe(numbers.populatedConfidence);
    expect(filed.card.emptyFieldCount).toBe(numbers.emptyFieldCount);
    expect(filed.card.populatedConfidence).toBe(0.9);
    expect(filed.card.emptyFieldCount).toBe(0);
  });

  it("reports null populated confidence when nothing is populated", async () => {
    const { gate } = harness();

    const filed = await gate.file(
      {
        operation: {
          kind: "update" as const,
          entityType: "Invoice",
          entityId: "invoice-1",
          fields: ["status", "memo"],
        },
        toolName: "relay_capture",
        fields: [
          {
            name: "status",
            kind: "text" as const,
            value: "Active",
            provenance: {
              current: {
                source: "Conversation" as const,
                confidence: 0.9,
                note: null,
                at: AT,
                conversationTurn: null,
                binding: null,
              },
              prior: [],
            },
          },
          { name: "memo", kind: "text" as const, value: null },
        ],
      },
      turnContext(),
    );

    // A sanity anchor for the null arm: the same shape with its one populated field
    // removed would be refused by GT-3 before it could be filed, so the null case is
    // reached through the model rather than through the pipeline.
    expect(filed.card.populatedConfidence).toBe(0.9);
    expect(computeConfidence([]).populatedConfidence).toBeNull();
  });
});

describe("port contract violations stay loud", () => {
  it("refuses a value that is not a JSON value with a RangeError, not a gate refusal", async () => {
    const { gate } = harness({
      inferred: {
        // The port's `value` is typed `JsonValue` since the review, so a typed host
        // cannot get here at all; the cast stands in for the JavaScript host that
        // still can, and the runtime check is what this asserts.
        status: {
          value: (() => "Active") as unknown as JsonValue,
          confidence: 1,
          presence: "literal",
          utteranceSpan: null,
        },
      },
    });

    await expect(
      gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
    ).rejects.toThrow(RangeError);
  });

  it("refuses an interceptor that claims a field the operation does not propose", async () => {
    const { gate } = harness({
      interceptors: [
        interceptorPort("billing", {
          elsewhere: {
            value: 1,
            source: "Computed",
            binding: { kind: "computation-ref", ref: { rule: "r", inputs: [] } },
            confidence: 1,
            evidence: null,
          },
        }),
      ],
    });

    await expect(
      gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
    ).rejects.toThrow(/does not\s+propose/);
  });

  it("keeps a gate refusal an AffiantError", async () => {
    const { gate } = harness({ inferred: {} });

    await expect(gate.file(proposal({ tagged: false }), turnContext())).rejects.toBeInstanceOf(
      AffiantError,
    );
  });
});

/** A Sequence C proposal with its provenance already settled, unless `tagged` is false. */
function proposal(init: { tagged?: boolean } = {}) {
  const tagged = init.tagged !== false;
  return {
    operation: {
      kind: "update" as const,
      entityType: "Invoice",
      entityId: "invoice-1",
      fields: ["status"],
    },
    toolName: "relay_capture",
    fields: [
      {
        name: "status",
        kind: "text" as const,
        value: "Active",
        ...(tagged
          ? {
              provenance: {
                current: {
                  source: "Conversation" as const,
                  confidence: 0.9,
                  note: null,
                  at: AT,
                  conversationTurn: null,
                  binding: null,
                },
                prior: [],
              },
            }
          : {}),
      },
    ],
  };
}
