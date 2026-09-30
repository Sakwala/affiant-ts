import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "@affiant/contract";

import type { TurnContext } from "../src/context.js";
import type { ApprovalPolicy } from "../src/gate/policy.js";
import { AffiantCallerError, AffiantError } from "../src/errors.js";
import type { JsonValue } from "../src/model/affidavit.js";
import { computeConfidence } from "../src/model/affidavit.js";
import { sha256Hex } from "../src/model/canonical.js";
import type { InferenceSource } from "../src/model/provenance.js";
import { mintInference } from "../src/model/provenance.js";
import type {
  Draft,
  DraftKey,
  DraftPort,
  InterceptedFields,
  StructuredField,
} from "../src/ports.js";

import {
  AT,
  harness,
  interceptorPort,
  plus,
  policyReturning,
  schemaFor,
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

  it("discards a span that does not fit the turn and finds the value itself", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Active", "literal", 0.9, { start: 0, end: 10_000 }) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const binding = entry?.affidavit.fields[0]?.provenance.current.binding;
    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Conversation");
    if (binding?.kind !== "utterance-span") expect.unreachable("an utterance-span binding");
    expect(binding.ref.offset).toBe("Set the invoice status to ".length);
  });

  it("tags a value the turn does not carry Inferred, with no binding", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Retired", "inferred", 0.4) },
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Retired" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Inferred");
    expect(entry?.affidavit.fields[0]?.provenance.current.binding).toBeNull();
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

describe("presence is established from the utterance, not from the port's claim (PV-3)", () => {
  /** The Meridian turn the framework defect was found on (`Sakwala/affiant#123`). */
  const MERIDIAN =
    "Create an AOG work order for WZ-BRN. Title: Left engine oil pressure fluctuation. " +
    "Priority Critical, estimated 6 hours, assign it to Rajesh Kumar, due 2026-09-08";

  it("grades a silent port's seven values Conversation, bound to where they were read", async () => {
    const values = {
      workOrderType: "AOG",
      aircraftId: "WZ-BRN",
      title: "Left engine oil pressure fluctuation",
      priority: "Critical",
      estimatedHours: 6,
      assignee: "Rajesh Kumar",
      dueDate: "2026-09-08",
    } as const;
    const names = Object.keys(values);
    const { gate, store } = harness({
      // What every shipped inference port reports: a value and a confidence, and
      // nothing about presence. At beta.3 these were seven "AI suggested" fields.
      inferred: Object.fromEntries(
        Object.entries(values).map(([name, value]) => [name, structured(value, undefined, 0.9)]),
      ),
    });

    await gate
      .wrap(
        writeTool({ entityType: "WorkOrder", fields: names }),
        turnContext({ utterance: MERIDIAN }),
      )
      .execute(Object.fromEntries(names.map((name) => [name, null])));
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    for (const field of entry?.affidavit.fields ?? []) {
      const binding = field.provenance.current.binding;
      expect(field.provenance.current.source, field.name).toBe("Conversation");
      if (binding?.kind !== "utterance-span") expect.unreachable("an utterance-span binding");
      expect(MERIDIAN.slice(binding.ref.offset, binding.ref.offset + binding.ref.length)).toBe(
        String(values[field.name as keyof typeof values]),
      );
    }
  });

  it("does not read a number out of a longer one", async () => {
    const { gate, store } = harness({
      inferred: { crewSize: structured(20, undefined, 0.5) },
    });

    await gate
      .wrap(writeTool({ fields: ["crewSize"] }), turnContext({ utterance: MERIDIAN }))
      .execute({ crewSize: 20 });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Inferred");
    expect(entry?.affidavit.fields[0]?.provenance.current.binding).toBeNull();
  });

  it("hashes the utterance's own bytes, not the port's text, where the case differs", async () => {
    const utterance = "File the expense for the client lunch";
    const { gate, store } = harness({
      inferred: { memo: structured("Client Lunch", undefined, 0.8) },
    });

    await gate
      .wrap(writeTool({ fields: ["memo"] }), turnContext({ utterance }))
      .execute({ memo: "Client Lunch" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const binding = entry?.affidavit.fields[0]?.provenance.current.binding;
    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Conversation");
    if (binding?.kind !== "utterance-span") expect.unreachable("an utterance-span binding");
    expect(utterance.slice(binding.ref.offset, binding.ref.offset + binding.ref.length)).toBe(
      "client lunch",
    );
    expect(binding.ref.hash).toBe(await sha256Hex(new TextEncoder().encode("client lunch")));
  });

  it("grades a port's unconfirmed `literal` Inferred, and drops its span", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Critical", "literal", 0.7, { start: 0, end: 8 }) },
    });

    await gate
      .wrap(writeTool(), turnContext({ utterance: "Raise a work order for the left engine" }))
      .execute({ status: "Critical" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Inferred");
    expect(entry?.affidavit.fields[0]?.provenance.current.binding).toBeNull();
  });

  it("binds to the port's span when the utterance at it says what the port said", async () => {
    const utterance = "Critical, and I mean Critical";
    const { gate, store } = harness({
      inferred: { status: structured("Critical", "literal", 0.7, { start: 21, end: 29 }) },
    });

    await gate.wrap(writeTool(), turnContext({ utterance })).execute({ status: "Critical" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    const binding = entry?.affidavit.fields[0]?.provenance.current.binding;
    if (binding?.kind !== "utterance-span") expect.unreachable("an utterance-span binding");
    expect(binding.ref.offset).toBe(21);
  });

  it("merges nothing for a value a field cannot carry, so the field stays Empty", async () => {
    // The port reported nothing for `note`: an empty string, `null`, an object and an
    // array are not values a field can carry. `status` keeps the proposal in substance
    // so GT-3 does not refuse it, and `note` is left with the Empty tag AF-1 writes.
    const nothings: readonly JsonValue[] = ["", null, { a: 1 }, [1, 2]];
    for (const nothing of nothings) {
      const { gate, store } = harness({
        inferred: {
          status: structured("Active", undefined, 0.9),
          note: structured(nothing, undefined, 0.9),
        },
      });

      await gate
        .wrap(writeTool({ fields: ["status", "note"] }), turnContext())
        .execute({ status: "Active", note: null });
      const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;
      const note = entry?.affidavit.fields.find((field) => field.name === "note");

      expect(note?.provenance.current.source, JSON.stringify(nothing)).toBe("Empty");
      expect(note?.value, JSON.stringify(nothing)).toBeNull();
    }
  });

  it("merges nothing for a number the runtime parsed as infinity or NaN", async () => {
    // SR-1 has no canonical rendering for either, so neither is a value the step can
    // file — and neither is an exception out of the inference step.
    for (const nothing of [Number.POSITIVE_INFINITY, Number.NaN]) {
      const { gate, store } = harness({
        inferred: {
          status: structured("Active", undefined, 0.9),
          hours: structured(nothing, undefined, 0.9),
        },
      });

      const result = await gate
        .wrap(writeTool({ fields: ["status", "hours"] }), turnContext())
        .execute({ status: "Active", hours: null });
      const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;
      const hours = entry?.affidavit.fields.find((field) => field.name === "hours");

      expect(result.kind, String(nothing)).not.toBe("error");
      expect(hours?.provenance.current.source, String(nothing)).toBe("Empty");
    }
  });

  it("keeps a whitespace-only value, which is a value, and files it as reported", async () => {
    const { gate, store } = harness({ inferred: { status: structured("   ", undefined, 0.4) } });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "   " });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Inferred");
    expect(entry?.affidavit.fields[0]?.provenance.current.binding).toBeNull();
  });

  it("refuses the proposal under GT-3 when the only field's value is nothing reported", async () => {
    const { gate } = harness({ inferred: { status: structured("", undefined, 0.9) } });

    const result = await gate.wrap(writeTool(), turnContext()).execute({ status: null });

    // A port's confidence is not a substitute for a value.
    expect(result).toMatchObject({
      kind: "error",
      code: "substance-refused",
      message: expect.stringContaining("no proposed field carries provenance other than Empty"),
    });
  });

  it("reads a turn that carries no utterance as an empty one, and does not throw", async () => {
    // An untyped host — plain JavaScript, or one that built the turn from a wire
    // message with no text — can hand the gate a turn without `utterance`. There is no
    // port-trusting path to fall back to, so the finder reads "": nothing hits, the
    // field is `Inferred` and unbound, and the gate returns a card rather than a
    // `TypeError` out of the finder.
    for (const missing of [undefined, null, 42]) {
      const context = turnContext({ utterance: "Priority Critical please" });
      const untyped = {
        ...context,
        turn: { ...context.turn, utterance: missing },
      } as unknown as TurnContext;
      const { gate, store } = harness({
        inferred: { status: structured("Critical", "literal", 0.9, { start: 9, end: 17 }) },
      });

      const result = await gate.wrap(writeTool(), untyped).execute({ status: "Critical" });
      const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

      expect(result.kind, String(missing)).not.toBe("error");
      expect(entry?.affidavit.fields[0]?.provenance.current.source, String(missing)).toBe(
        "Inferred",
      );
      expect(entry?.affidavit.fields[0]?.provenance.current.binding, String(missing)).toBeNull();
    }
  });

  it("grades a value the port called `inferred` Conversation when the turn carries it", async () => {
    const { gate, store } = harness({
      inferred: { status: structured("Critical", "inferred", 0.6) },
    });

    await gate
      .wrap(writeTool(), turnContext({ utterance: "Priority Critical please" }))
      .execute({ status: "Critical" });
    const [entry] = (await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;

    expect(entry?.affidavit.fields[0]?.provenance.current.source).toBe("Conversation");
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
    const { gate } = harness({
      policies: [policyReturning({ requirement: { kind: "ReferralRequired" } })],
    });

    const filed = await gate.file(proposal(), turnContext());

    // The row is `pending` and refuses every decision (AZ-4). A card that also said
    // `requiresConfirmation: true` would hand a reviewer surface an approve button
    // that cannot work, on the same card whose warning says so.
    expect(filed.entry.status).toBe("pending");
    expect(filed.card.requiresConfirmation).toBe(false);
    expect(filed.card.blocked).toEqual({
      code: "requirement-not-implemented",
      level: "ReferralRequired",
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

  it("carries the host's own verb for the operation, beside the shape and never instead of it", async () => {
    const { gate } = harness();

    const filed = await gate.file({ ...proposal(), operationLabel: "Reprice" }, turnContext());

    // `operationType` stays the protocol's two-valued SHAPE, because a rule about
    // shape has to be a predicate a policy can test without knowing any host's
    // vocabulary. The host's own word for the same act travels beside it on the
    // envelope, where a reviewer surface can head the card with the term a person
    // recognises and no hash is taken over it (SR-1).
    expect(filed.card.hostOperation).toBe("Reprice");
    expect(filed.card.affidavit.operationType).toBe("update");
    expect(filed.entry.affidavit.operationType).toBe("update");
  });

  it("omits the host's verb entirely where the host named none", async () => {
    const filed = await harness().gate.file(proposal(), turnContext());

    // Absent, never null: nothing swears to it, so a producer with nothing to say
    // says nothing — the same rule the two hint slots beside it follow.
    expect(filed.card.hostOperation).toBeUndefined();
    expect("hostOperation" in filed.card).toBe(false);
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

// ---------------------------------------------------------------------------
// GT-7 / PV-3 *Across turns* — the conversation draft
// ---------------------------------------------------------------------------

describe("the conversation draft across turns (GT-7, PV-3)", () => {
  /** A ten-line in-memory port that counts what the gate asks of it. */
  function memoryDraftPort() {
    const held = new Map<string, Draft>();
    const calls = { get: 0, put: 0, consume: 0 };
    const id = (k: DraftKey): string => JSON.stringify([k.tenantId, k.conversationId, k.toolName]);
    const port: DraftPort = {
      async get(k) {
        calls.get += 1;
        return held.get(id(k)) ?? null;
      },
      async put(k, d) {
        calls.put += 1;
        held.set(id(k), d);
      },
      async consume(k) {
        calls.consume += 1;
        held.delete(id(k));
      },
    };
    return { port, held, calls, key: JSON.stringify(["tenant-a", "conv-1", "capture"]) };
  }

  /** A gate whose inference answer the test sets per turn. */
  function drafting(fields: readonly string[] = ["status"]) {
    const draftPort = memoryDraftPort();
    const report: { fields: { [name: string]: StructuredField } } = { fields: {} };
    const h = harness({
      draft: draftPort.port,
      inference: { infer: async () => ({ fields: report.fields }) },
    });
    const proposal = {
      operation: {
        kind: "update" as const,
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: [...fields],
      },
      toolName: "capture",
      schema: schemaFor("Invoice", fields),
      args: { fields: [...fields] },
    };
    return { ...h, draftPort, report, proposal };
  }

  const spanOf = (filed: { entry: { affidavit: { fields: readonly any[] } } }, i = 0) =>
    filed.entry.affidavit.fields[i]?.provenance.current;

  it("carries a Conversation tag across turns with the drafted messageId, and none on a same-turn hit", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    const written = await t.gate.draft(
      t.proposal,
      turnContext({ utterance: "Set the invoice status to Active", messageId: "msg-1" }),
    );
    expect(written?.fields).toHaveLength(1);
    expect((written?.fields[0]?.tag.binding as any).ref.messageId).toBe("msg-1");

    t.report.fields = { status: structured("active", "inferred", 0.6) };
    const filed = await t.gate.file(
      t.proposal,
      turnContext({ utterance: "yes, go ahead", messageId: "msg-2" }),
    );
    const tag = spanOf(filed);
    expect(tag?.source).toBe("Conversation");
    expect(tag?.confidence).toBe(0.6);
    expect((tag?.binding as any).ref.messageId).toBe("msg-1");

    // The same turn's own hit binds this turn: no messageId on the Affidavit's binding.
    const own = drafting();
    own.report.fields = { status: structured("Active", "literal", 0.9) };
    const ownFiled = await own.gate.file(
      own.proposal,
      turnContext({ utterance: "Set the invoice status to Active", messageId: "msg-9" }),
    );
    expect(spanOf(ownFiled)?.source).toBe("Conversation");
    expect((spanOf(ownFiled)?.binding as any).ref).not.toHaveProperty("messageId");
  });

  it("a changed value carries nothing: the field is Inferred", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));

    t.report.fields = { status: structured("Retired", "inferred", 0.6) };
    const filed = await t.gate.file(
      t.proposal,
      turnContext({ utterance: "ok", messageId: "msg-2" }),
    );

    expect(spanOf(filed)?.source).toBe("Inferred");
    expect(spanOf(filed)?.binding ?? null).toBeNull();
  });

  it("merges by field name: a value unheard this turn removes nothing, a later hit replaces", async () => {
    const t = drafting(["status", "note"]);
    t.report.fields = {
      status: structured("Active", "literal", 0.9),
      note: structured("late", "literal", 0.9),
    };
    await t.gate.draft(
      t.proposal,
      turnContext({ utterance: "status Active, note late", messageId: "msg-1" }),
    );

    t.report.fields = {
      status: structured("Retired", "literal", 0.9),
      note: structured("early", "inferred", 0.5),
    };
    const second = await t.gate.draft(
      t.proposal,
      turnContext({ utterance: "make it Retired", messageId: "msg-2" }),
    );

    expect(second?.fields.map((f) => f.name)).toEqual(["status", "note"]);
    expect(second?.fields[0]?.value).toBe("Retired");
    expect((second?.fields[0]?.tag.binding as any).ref.messageId).toBe("msg-2");
    expect(second?.fields[1]?.value).toBe("late");
    expect((second?.fields[1]?.tag.binding as any).ref.messageId).toBe("msg-1");
  });

  it("a draft turn that grades nothing writes nothing and returns the existing record or null", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "inferred", 0.5) };
    expect(await t.gate.draft(t.proposal, turnContext({ utterance: "hm" }))).toBeNull();
    expect(t.draftPort.calls.put).toBe(0);

    t.report.fields = { status: structured("Active", "literal", 0.9) };
    const first = await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));
    t.report.fields = {};
    const again = await t.gate.draft(
      t.proposal,
      turnContext({ utterance: "hm", messageId: "msg-2" }),
    );
    expect(again).toEqual(first);
    expect(t.draftPort.calls.put).toBe(1);
  });

  it("a file consumes the draft when it files, created or replayed alike", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));
    const ctx2 = turnContext({ utterance: "yes", messageId: "msg-2" });
    t.report.fields = { status: structured("Active", "inferred", 0.6) };

    const first = await t.gate.file(t.proposal, ctx2);
    expect(first.created).toBe(true);
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(false);

    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(true);
    const replay = await t.gate.file(t.proposal, ctx2);
    expect(replay.created).toBe(false);
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(false);
  });

  it("a file refused before filing leaves the draft", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));

    t.report.fields = {};
    await expect(t.gate.file(t.proposal, turnContext({ utterance: "hm" }))).rejects.toMatchObject({
      code: "substance-refused",
    });
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(true);
    expect(t.draftPort.calls.consume).toBe(0);
  });

  it("a resubmission neither reads nor consumes the draft", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    const filed = await t.gate.file(t.proposal, turnContext());
    t.clock.set(plus(AT, 31 * 60_000));
    await t.gate
      .decide(
        filed.entry.entryId,
        { kind: "approve", amendments: { status: "Retired" } },
        turnContext(),
      )
      .catch(() => undefined);
    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));
    const before = { ...t.draftPort.calls };

    await t.gate.resubmit(filed.entry.entryId, turnContext());

    expect(t.draftPort.calls).toEqual(before);
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(true);
  });

  it("the wrapped-tool path reads the draft and consumes it on filing", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ messageId: "msg-1" }));
    t.report.fields = { status: structured("Active", "inferred", 0.6) };

    const result = await t.gate
      .wrap(writeTool({ name: "capture" }), turnContext({ utterance: "yes", messageId: "msg-2" }))
      .execute({ status: "Active" });

    if (result.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const tag = result.card.affidavit.fields[0]?.provenance.current;
    expect(tag?.source).toBe("Conversation");
    expect((tag?.binding as any).ref.messageId).toBe("msg-1");
    expect(t.draftPort.held.has(t.draftPort.key)).toBe(false);
  });

  it("refuses draft on a blank messageId before any port call", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    const thrown = await t.gate
      .draft(t.proposal, turnContext({ utterance: "status Active", messageId: "" }))
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AffiantCallerError);
    expect((thrown as AffiantCallerError).kind).toBe("turn-context-invalid");
    expect(t.draftPort.calls).toEqual({ get: 0, put: 0, consume: 0 });
  });

  it("grades Inferred a field the port returns with a binding that has no messageId", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ utterance: "status Active", messageId: "msg-1" }));
    const stored = t.draftPort.held.get(t.draftPort.key)!;
    const stripped: Draft = {
      ...stored,
      fields: stored.fields.map((field) => {
        const binding = field.tag.binding as any;
        const { messageId: _dropped, ...ref } = binding.ref;
        return { ...field, tag: { ...field.tag, binding: { ...binding, ref } } };
      }),
    };
    t.draftPort.held.set(t.draftPort.key, stripped);
    t.report.fields = { status: structured("Active", "inferred", 0.6) };
    const filed = await t.gate.file(
      t.proposal,
      turnContext({ utterance: "ok", messageId: "msg-2" }),
    );
    expect(spanOf(filed)?.source).toBe("Inferred");
  });

  it("emits affidavit.filed before a throwing consume surfaces its error", async () => {
    const draftPort = memoryDraftPort();
    const failing: DraftPort = {
      ...draftPort.port,
      consume: async () => {
        throw new Error("the draft store is down");
      },
    };
    const report: { fields: { [name: string]: StructuredField } } = { fields: {} };
    const h = harness({
      draft: failing,
      inference: { infer: async () => ({ fields: report.fields }) },
    });
    const proposal = {
      operation: {
        kind: "update" as const,
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: ["status"],
      },
      toolName: "capture",
      schema: schemaFor("Invoice", ["status"]),
      args: { fields: ["status"] },
    };
    report.fields = { status: structured("Active", "literal", 0.9) };
    const thrown = await h.gate
      .file(proposal, turnContext({ utterance: "status Active", messageId: "msg-1" }))
      .catch((error: unknown) => error);
    expect((thrown as Error).message).toBe("the draft store is down");
    expect(h.telemetry.keys()).toContain("affidavit.filed");
  });

  it("holds two drafts for keys that collide when joined with a separator", async () => {
    const draftPort = memoryDraftPort();
    const record = (tenantId: string, conversationId: string): Draft => ({
      protocolVersion: "0.5.0",
      tenantId,
      conversationId,
      toolName: "capture",
      fields: [],
      updatedAt: "2026-09-30T09:00:00.000Z",
    });
    const ctx = turnContext();
    const first = { tenantId: "t|x", conversationId: "c", toolName: "capture" };
    const second = { tenantId: "t", conversationId: "x|c", toolName: "capture" };
    await draftPort.port.put(first, record("t|x", "c"), ctx);
    expect(await draftPort.port.get(second, ctx)).toBeNull();
    await draftPort.port.put(second, record("t", "x|c"), ctx);
    expect((await draftPort.port.get(first, ctx))?.tenantId).toBe("t|x");
    expect((await draftPort.port.get(second, ctx))?.tenantId).toBe("t");
  });

  it("ignores a draft the port answers under another key", async () => {
    const t = drafting();
    t.report.fields = { status: structured("Active", "literal", 0.9) };
    await t.gate.draft(t.proposal, turnContext({ utterance: "status Active", messageId: "msg-1" }));
    const stored = t.draftPort.held.get(t.draftPort.key)!;
    t.draftPort.held.set(t.draftPort.key, { ...stored, toolName: "pay" });
    t.report.fields = { status: structured("Active", "inferred", 0.6) };
    const filed = await t.gate.file(
      t.proposal,
      turnContext({ utterance: "ok", messageId: "msg-2" }),
    );
    expect(spanOf(filed)?.source).toBe("Inferred");
  });
});
