import { describe, expect, it } from "vitest";

import { isAffiantError, isCallerError } from "../src/errors.js";
import { amendmentTag } from "../src/model/amendments.js";
import { bindingShapeReason } from "../src/model/binding-shape.js";
import type { PreparedField } from "../src/gate/pipeline.js";
import type { Binding } from "../src/model/provenance.js";
import { chainOf, mintConversation, mintTag } from "../src/model/provenance.js";
import type { InterceptedFields, InterceptorBinding } from "../src/ports.js";

import type { DocketEntry } from "../src/docket/entry.js";

import {
  AT,
  harness,
  inferencePort,
  interceptorPort,
  plus,
  policyReturning,
  structured,
  turnContext,
  writeTool,
  type Harness,
  type Trace,
} from "./gate-support.js";

/**
 * The gate checks the shape of every binding a host writes, and refuses a malformed
 * one before anything else happens (PV-2, SR-3, PV-4).
 *
 * The binding is the one part of an Affidavit a host writes freehand, so it is the
 * one part that can reach the Docket in a shape the protocol's `binding.schema.json`
 * refuses. What is checked is where host-written provenance enters: an interceptor's
 * result, and a prepared field's chain. What is refused is refused as a caller
 * error — the host's own code built the object — with nothing filed and no port
 * after the interceptors called.
 *
 * Runs on Node, Bun and workerd alike: no filesystem, no Node global. The suite that
 * holds the checker *equal to the schema* is `test/node/binding-shape-schema.test.ts`,
 * which reads the vendored schemas off disk and so is Node-side only.
 */

/** A binding the schema refuses, cast the way an untyped host would reach the gate. */
function bad(binding: unknown): InterceptorBinding {
  return binding as InterceptorBinding;
}

/** The four malformed bindings the design record names, one per way to be wrong. */
const MALFORMED: readonly (readonly [string, unknown])[] = [
  [
    "an external-ref with an undeclared key in ref",
    { kind: "external-ref", ref: { system: "billing", recordId: "inv-1", sourceUrl: "https://x" } },
  ],
  ["a computation-ref missing rule", { kind: "computation-ref", ref: { inputs: ["amount"] } }],
  ["a kind outside the five", { kind: "screenshot", ref: { url: "https://x" } }],
  [
    "a relay with an undeclared key",
    {
      kind: "external-ref",
      ref: {
        system: "whatsapp",
        recordId: "wamid-1",
        relay: {
          principal: "relay-1",
          channelIdentity: "+94770000000",
          messageId: "wamid-1",
          verified: true,
        },
      },
    },
  ],
];

/** One well-formed binding of each of the five kinds. */
const WELL_FORMED: readonly (readonly [string, Binding])[] = [
  ["utterance-span", { kind: "utterance-span", ref: { offset: 0, length: 6, hash: "sha256:abc" } }],
  [
    "reviewer-act",
    {
      kind: "reviewer-act",
      ref: { entryId: "6f9619ff-8b86-d011-b42d-00c04fc964ff", decisionAt: AT },
    },
  ],
  ["form-input", { kind: "form-input", ref: { field: "status" } }],
  [
    "external-ref",
    {
      kind: "external-ref",
      ref: {
        system: "billing",
        recordId: "inv-1",
        fetchedAt: AT,
        contentHash: "sha256:def",
        relay: { principal: "relay-1", channelIdentity: "+94770000000", messageId: "wamid-1" },
      },
    },
  ],
  [
    "computation-ref",
    {
      kind: "computation-ref",
      ref: {
        rule: "vat-2026",
        inputs: ["amount"],
        constant: { source: "https://ird.example/vat", verifiedOn: "2026-03-01" },
      },
    },
  ],
];

/** Whatever was thrown, or `null` when nothing was. */
async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

/** The interceptor result one field resolves to, with `binding` as given. */
function resolved(binding: InterceptorBinding): InterceptedFields {
  return {
    status: {
      value: "Active",
      source: "External",
      binding,
      confidence: 0.95,
      evidence: "the billing system says Active",
    },
  };
}

/** A prepared field whose tag in force carries `binding`. */
function preparedWith(binding: unknown): PreparedField {
  return {
    name: "status",
    kind: "text",
    value: "Active",
    provenance: chainOf(
      mintTag({
        source: "External",
        confidence: 0.95,
        at: AT,
        binding: binding as Binding,
      }),
    ),
    isMandatory: false,
  };
}

/** File one prepared field through the Sequence C entry point. */
async function fileOne(h: Harness, field: PreparedField) {
  return h.gate.file(
    {
      operation: {
        kind: "update",
        entityType: "Invoice",
        entityId: "invoice-1",
        fields: ["status"],
      },
      toolName: "update_invoice",
      fields: [field],
      args: null,
    },
    turnContext(),
  );
}

/** Every pending row in the harness's store. */
async function pending(h: Harness) {
  return (await h.store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items;
}

// ---------------------------------------------------------------------------
// An interceptor's result, checked as it returns
// ---------------------------------------------------------------------------

describe("a malformed binding from an interceptor", () => {
  for (const [name, binding] of MALFORMED) {
    it(`is a caller error naming the field and the interceptor: ${name}`, async () => {
      const trace: Trace = [];
      const h = harness({
        interceptors: [
          interceptorPort("billing", resolved(bad(binding)), trace),
          interceptorPort("crm", resolved(bad(binding)), trace),
        ],
        inference: inferencePort({ status: structured("Active", "literal", 0.9) }, trace),
        policies: [policyReturning({ requirement: "StandingOrder" }, { trace })],
        riskScore: 0.1,
        trace,
      });

      const thrown = await thrownBy(() =>
        h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
      );

      // Still a RangeError, so a host that already caught one keeps working.
      expect(thrown).toBeInstanceOf(RangeError);
      expect(isCallerError(thrown)).toBe(true);
      expect(isAffiantError(thrown)).toBe(false);
      expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
      expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
        field: "status",
        source: "interceptor",
        interceptor: "billing",
      });
      expect(typeof (isCallerError(thrown) ? thrown.details["reason"] : null) === "string").toBe(
        true,
      );

      // GT-1's order: the interceptor that returned it is the last thing that ran.
      // No later interceptor, no inference, no projection, no policy, no scorer.
      expect(trace).toEqual(["interceptor:billing"]);
      expect(await pending(h)).toEqual([]);
    });
  }

  it("files nothing and calls nothing when the malformed tag is the only thing proposed", async () => {
    const trace: Trace = [];
    const h = harness({
      interceptors: [interceptorPort("billing", resolved(bad(MALFORMED[0]?.[1])), trace)],
      trace,
    });

    await thrownBy(() => h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }));

    expect(h.telemetry.keys()).toEqual([]);
    expect(await pending(h)).toEqual([]);
  });

  for (const [kind, binding] of WELL_FORMED.filter(
    ([, value]) => value.kind === "external-ref" || value.kind === "computation-ref",
  )) {
    it(`files a well-formed ${kind} from an interceptor`, async () => {
      const h = harness({
        interceptors: [interceptorPort("billing", resolved(binding as InterceptorBinding))],
      });

      const result = await h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

      expect(result.kind).toBe("write");
      const [entry] = await pending(h);
      expect(entry?.affidavit.fields[0]?.provenance.current.binding).toEqual(binding);
    });
  }
});

// ---------------------------------------------------------------------------
// An interceptor may mint two of the five kinds, at run time too (S-9)
// ---------------------------------------------------------------------------

describe("a well-formed binding of a kind no interceptor may mint (S-9)", () => {
  // The type says `external-ref | computation-ref`; an untyped host reaches the same
  // port with whatever it likes, and each of these three points at something a
  // *person* did — which PV-3 forbids a machine from claiming.
  const FORBIDDEN = WELL_FORMED.filter(
    ([, binding]) => binding.kind !== "external-ref" && binding.kind !== "computation-ref",
  );

  it("covers all three kinds an interceptor may not mint", () => {
    expect(FORBIDDEN.map(([kind]) => kind)).toEqual([
      "utterance-span",
      "reviewer-act",
      "form-input",
    ]);
  });

  for (const [kind, binding] of FORBIDDEN) {
    it(`is refused as binding-invalid, with nothing filed and no later port called: ${kind}`, async () => {
      const trace: Trace = [];
      const h = harness({
        interceptors: [
          interceptorPort("billing", resolved(bad(binding)), trace),
          interceptorPort("crm", resolved(bad(binding)), trace),
        ],
        inference: inferencePort({ status: structured("Active", "literal", 0.9) }, trace),
        policies: [policyReturning({ requirement: "StandingOrder" }, { trace })],
        trace,
      });

      const thrown = await thrownBy(() =>
        h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
      );

      expect(isCallerError(thrown)).toBe(true);
      expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
      expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
        field: "status",
        source: "interceptor",
        interceptor: "billing",
      });
      // The reason says it is the *kind* that is wrong, not the shape: the object is
      // one the schema admits.
      expect(bindingShapeReason(binding)).toBeNull();
      expect(String(isCallerError(thrown) ? thrown.details["reason"] : "")).toContain(
        "an interceptor may mint",
      );

      expect(trace).toEqual(["interceptor:billing"]);
      expect(await pending(h)).toEqual([]);
    });
  }

  it("never reaches the Standing Order that would have rested on it (PV-4)", async () => {
    const trace: Trace = [];
    const h = harness({
      interceptors: [interceptorPort("billing", resolved(bad(WELL_FORMED[1]?.[1])), trace)],
      policies: [
        policyReturning(
          { requirement: "StandingOrder" },
          { id: "auto-approve", declaredInputs: ["External"], trace },
        ),
      ],
      trace,
    });

    const thrown = await thrownBy(() =>
      h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
    );

    expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
    expect(trace).toEqual(["interceptor:billing"]);
    expect(await pending(h)).toEqual([]);
    expect(h.telemetry.keys()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A prepared field's chain, checked beside the turn context
// ---------------------------------------------------------------------------

describe("a malformed binding on a prepared field", () => {
  for (const [name, binding] of MALFORMED) {
    it(`is a caller error naming the field and the source: ${name}`, async () => {
      const trace: Trace = [];
      const h = harness({ policies: [policyReturning(null, { trace })], trace });

      const thrown = await thrownBy(() => fileOne(h, preparedWith(binding)));

      expect(isCallerError(thrown)).toBe(true);
      expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
      expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
        field: "status",
        source: "prepared-field",
      });
      // A prepared field has no second identity to name, so none is claimed.
      expect(isCallerError(thrown) ? thrown.details["interceptor"] : "x").toBeUndefined();

      expect(trace).toEqual([]);
      expect(await pending(h)).toEqual([]);
    });
  }

  it("refuses a computation-ref whose inputs are a sparse array", async () => {
    // A hole is not a value: `["a", , "b"]` serializes to `["a", null, "b"]`, which
    // the schema — and this checker — refuse. A check written with
    // `Array.prototype.every` would have filed it, because `every` skips holes.
    const h = harness({ policies: [policyReturning(null)] });
    const sparse = {
      kind: "computation-ref",
      // eslint-disable-next-line no-sparse-arrays
      ref: { rule: "vat-2026", inputs: ["amount", , "region"] },
    };

    const thrown = await thrownBy(() => fileOne(h, preparedWith(sparse)));

    expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
    expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
      field: "status",
      source: "prepared-field",
    });
    expect(await pending(h)).toEqual([]);
  });

  it("checks every tag in the chain, not only the one in force", async () => {
    const h = harness();
    const field: PreparedField = {
      name: "status",
      kind: "text",
      value: "Active",
      provenance: {
        current: mintConversation({ confidence: 0.9, at: AT }),
        prior: [
          mintTag({
            source: "External",
            confidence: 0.8,
            at: AT,
            binding: MALFORMED[1]?.[1] as Binding,
          }),
        ],
      },
      isMandatory: false,
    };

    const thrown = await thrownBy(() => fileOne(h, field));

    expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
    expect(await pending(h)).toEqual([]);
  });

  for (const [kind, binding] of WELL_FORMED) {
    it(`files a well-formed ${kind} on a prepared field`, async () => {
      const h = harness();

      const filed = await fileOne(h, preparedWith(binding));

      expect(filed.entry.affidavit.fields[0]?.provenance.current.binding).toEqual(binding);
    });
  }

  it("leaves a tag with no binding alone", async () => {
    const h = harness();

    const filed = await fileOne(h, preparedWith(null));

    expect(filed.entry.affidavit.fields[0]?.provenance.current.binding).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A resubmission is a filing, and what it copies is checked (S-8)
// ---------------------------------------------------------------------------

describe("a resubmission of a row that holds a malformed binding (S-8)", () => {
  /**
   * A row as one filed before alpha.4 looks: written straight into the store, past
   * the gate's check, holding a binding the schema refuses.
   */
  async function rowWithABadBinding(h: Harness): Promise<DocketEntry> {
    const filed = await fileOne(h, preparedWith(WELL_FORMED[3]?.[1]));
    const entry = filed.entry;
    const field = entry.affidavit.fields[0] as (typeof entry.affidavit.fields)[number];
    const stale: DocketEntry = {
      ...entry,
      entryId: "11111111-2222-4333-8444-555555555555",
      affidavit: {
        ...entry.affidavit,
        fields: [
          {
            ...field,
            provenance: {
              ...field.provenance,
              current: { ...field.provenance.current, binding: bad(MALFORMED[0]?.[1]) as Binding },
            },
          },
        ],
      },
    };
    const { entry: stored } = await h.store.file(stale);
    return stored;
  }

  it("is refused as binding-invalid naming the row, not the host's prepared fields", async () => {
    const trace: Trace = [];
    const h = harness({
      defaultTtlMs: 60_000,
      policies: [policyReturning(null, { trace })],
      trace,
    });
    const stale = await rowWithABadBinding(h);
    // Past its deadline: only an expired row may be resubmitted (DK-1). Read after
    // the move, because an expired status is computed at read time rather than
    // written — so the comparison below is of the record, not of the clock.
    h.clock.set(plus(AT, 90_000));
    const before = await h.store.get(stale.entryId, { tenantId: "tenant-a" });

    const thrown = await thrownBy(() => h.gate.resubmit(stale.entryId, turnContext()));

    expect(isCallerError(thrown)).toBe(true);
    expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
    expect(isCallerError(thrown) ? thrown.details : null).toMatchObject({
      field: "status",
      // Not "prepared-field": the host never wrote this object, the Docket did.
      source: "stored-row",
      entryId: stale.entryId,
    });

    // Nothing filed, and the old row untouched — the Docket is append-only and this
    // package does not repair a record (S-4).
    const after = await h.store.get(stale.entryId, { tenantId: "tenant-a" });
    expect(after).toEqual(before);
    expect(after?.lineage.supersededBy).toBeNull();
    expect(
      (await h.store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items.map(
        (one) => one.entryId,
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The bindings this package mints itself
// ---------------------------------------------------------------------------

describe("the bindings the core mints for itself", () => {
  // Checked here rather than at run time: nothing host-written reaches these two, and
  // a check on a constructor's own output is a check on this package's tests.
  it("mints an utterance-span the checker admits (PV-2)", async () => {
    const h = harness({ inferred: { status: structured("Active", "literal", 0.9) } });

    await h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    const [entry] = await pending(h);
    const binding = entry?.affidavit.fields[0]?.provenance.current.binding;
    expect(binding?.kind).toBe("utterance-span");
    expect(bindingShapeReason(binding)).toBeNull();
  });

  it("mints a reviewer-act the checker admits, for a set and for a clear (PV-2, AF-4)", () => {
    const act = { entryId: "6f9619ff-8b86-d011-b42d-00c04fc964ff", decisionAt: AT, by: "member-1" };

    for (const amendment of [{ kind: "set", value: "Draft" }, { kind: "clear" }] as const) {
      const tag = amendmentTag(amendment, act, 1);
      expect(tag.binding?.kind).toBe("reviewer-act");
      expect(bindingShapeReason(tag.binding)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// PV-4's hole, pinned
// ---------------------------------------------------------------------------

describe("a Standing Order that would have rested on a malformed binding (PV-4)", () => {
  it("never reaches the policy: nothing is filed and nobody approved anything", async () => {
    const trace: Trace = [];
    // The policy declares `External` as an input and returns a Standing Order — a
    // write with nobody present. PV-4 lets it stand when every tag above
    // `Conversation` in its declared inputs "carries a binding"; an object in the
    // binding position that no auditor can follow is not one (PV-2), and before this
    // check the verdict would have been honoured on it.
    const h = harness({
      interceptors: [interceptorPort("billing", resolved(bad(MALFORMED[0]?.[1])), trace)],
      policies: [
        policyReturning(
          { requirement: "StandingOrder" },
          { id: "auto-approve", declaredInputs: ["External"], trace },
        ),
      ],
      trace,
    });

    const thrown = await thrownBy(() =>
      h.gate.wrap(writeTool(), turnContext()).execute({ status: "Active" }),
    );

    expect(isCallerError(thrown) ? thrown.kind : null).toBe("binding-invalid");
    expect(trace).toEqual(["interceptor:billing"]);
    expect(await pending(h)).toEqual([]);
    expect(await h.store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).toMatchObject({
      items: [],
    });
  });
});
