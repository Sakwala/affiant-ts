import { describe, expect, it } from "vitest";

import { AffiantError } from "../src/errors.js";
import type { ApprovalPolicy } from "../src/gate/policy.js";
import { evaluatePolicies, unboundDeclaredInput } from "../src/gate/policy.js";
import { buildAffidavit } from "../src/model/affidavit.js";
import { chainOf, mintTag } from "../src/model/provenance.js";
import type { Operation } from "../src/ports.js";

import {
  AT,
  harness,
  interceptorPort,
  plus,
  policyReturning,
  turnContext,
  writeTool,
} from "./gate-support.js";
import type { Trace } from "./gate-support.js";

/**
 * The policy chain, Standing Orders and the two checks that stop a person-free
 * approval resting on something uncheckable.
 *
 * AZ-4 (the four requirement kinds; an unimplemented level is filed blocked and never
 * degraded to a weaker one), AZ-1 (a Standing Order writes its attestation in the same
 * operation as the filing), PV-4 (a Standing Order that predicates on an unbound tag
 * above `Conversation` degrades to asking a person), GT-5 (a threshold is compared
 * against a host-supplied score; the core owns no formula).
 */

const UPDATE: Operation = {
  kind: "update",
  entityType: "Invoice",
  entityId: "invoice-1",
  fields: ["status"],
};

/** An Affidavit with one field carrying `source`, bound or not. */
function affidavitWith(source: "External" | "Conversation" | "UserStated", bound: boolean) {
  return buildAffidavit(
    UPDATE,
    [
      {
        name: "status",
        kind: "text",
        value: "Active",
        previousValue: null,
        isMandatory: false,
        provenance: chainOf(
          mintTag({
            source,
            confidence: 1,
            at: AT,
            ...(bound
              ? {
                  binding: {
                    kind: "external-ref" as const,
                    ref: { system: "billing", recordId: "invoice-1" },
                  },
                }
              : {}),
          }),
        ),
      },
    ],
    { createdAt: AT },
  );
}

describe("the chain picks the first policy with an opinion", () => {
  it("takes the first non-null verdict and asks no further", async () => {
    const trace: Trace = [];
    const outcome = await evaluatePolicies(
      [
        policyReturning(null, { id: "a", trace }),
        policyReturning({ requirement: "ReferralRequired" }, { id: "b", trace }),
        policyReturning({ requirement: "StandingOrder" }, { id: "c", trace }),
      ],
      affidavitWith("Conversation", false),
      turnContext(),
      { now: AT },
    );

    expect(outcome.requirement).toBe("ReferralRequired");
    expect(outcome.policy?.id).toBe("b");
    expect(trace).toEqual(["policy:a", "policy:b"]);
  });

  it("asks a person when no policy speaks", async () => {
    const outcome = await evaluatePolicies(
      [policyReturning(null)],
      affidavitWith("Conversation", false),
      turnContext(),
      { now: AT },
    );

    expect(outcome.requirement).toBe("ReviewerConfirmation");
    expect(outcome.policy).toBeNull();
  });

  it("refuses a requirement that is not one of the four", async () => {
    await expect(
      evaluatePolicies(
        [policyReturning({ requirement: "Whatever" as unknown as "StandingOrder" })],
        affidavitWith("Conversation", false),
        turnContext(),
        { now: AT },
      ),
    ).rejects.toThrow(RangeError);
  });

  it("refuses a risk threshold on a requirement that asks a person", async () => {
    await expect(
      evaluatePolicies(
        [policyReturning({ requirement: "ReviewerConfirmation", threshold: 0.5 })],
        affidavitWith("Conversation", false),
        turnContext(),
        { now: AT },
      ),
    ).rejects.toThrow(/means nothing on a requirement that asks a person/);
  });
});

describe("a by-the-book Standing Order fires (GT-5, AZ-1)", () => {
  it("files approved and unexecuted with the policy's attestation in the same write", async () => {
    const { gate, telemetry } = harness({
      policies: [policyReturning({ requirement: "StandingOrder" }, { id: "auto", version: "2.1" })],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });
    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const entry = await gate.get(filed.entryId, turnContext());

    expect(entry?.status).toBe("approved");
    expect(entry?.execution).toBe("unexecuted");
    expect(entry?.attestation).toEqual({
      by: { kind: "standing-order", policyId: "auto", version: "2.1" },
      at: AT,
      entryId: filed.entryId,
    });
    expect(telemetry.keys()).toContain("standing-order.fired");
  });

  it("does not ask the reviewer surface to confirm what a policy already approved", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "StandingOrder" })],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("approved");
    expect(filed.card.affidavit.requiresConfirmation).toBe(false);
  });

  it("never attests a policy on an entry a person must confirm", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "ReviewerConfirmation" })],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const entry = await gate.get(filed.entryId, turnContext());
    expect(entry?.attestation).toBeNull();
    expect(entry?.execution).toBeNull();
  });
});

describe("a threshold is compared against the host's score (GT-5)", () => {
  const withThreshold = policyReturning(
    { requirement: "StandingOrder", threshold: 0.5 },
    { declaresThreshold: true },
  );

  it("fires when the score is at or under the threshold", async () => {
    const { gate } = harness({ policies: [withThreshold], riskScore: 0.5 });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("approved");
  });

  it("asks a person when the score is above the threshold", async () => {
    const { gate, telemetry } = harness({ policies: [withThreshold], riskScore: 0.9 });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("pending");
    const entry = await gate.get(filed.entryId, turnContext());
    expect(entry?.requirement).toBe("ReviewerConfirmation");
    expect(entry?.attestation).toBeNull();
    expect(telemetry.find("standing-order.blocked")?.attributes["risk.score"]).toBe(0.9);
  });

  it("asks a person when the scorer returns something that is not a number", async () => {
    const { gate } = harness({ policies: [withThreshold], riskScore: Number.NaN });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("pending");
  });

  it("fires on the verdict alone when no threshold is declared", async () => {
    const { gate, trace } = harness({
      policies: [policyReturning({ requirement: "StandingOrder" })],
      riskScore: 0.9,
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("approved");
    // The scorer is a host's cost; a verdict with no ceiling has nothing to compare.
    expect(trace).not.toContain("risk");
  });

  it("puts the degrade's reason on the card so a reviewer sees why they were asked", async () => {
    const { gate } = harness({ policies: [withThreshold], riskScore: 0.9 });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.card.affidavit.warnings.join(" ")).toContain("above the Standing Order's");
  });

  it("refuses a verdict that names a threshold with no scorer to compare against", async () => {
    await expect(
      evaluatePolicies(
        [policyReturning({ requirement: "StandingOrder", threshold: 0.5 })],
        affidavitWith("Conversation", false),
        turnContext(),
        { now: AT },
      ),
    ).rejects.toMatchObject({ code: "wireup-invalid" });
  });
});

describe("a Standing Order never rests on an unbound declared input (PV-4)", () => {
  const external = policyReturning(
    { requirement: "StandingOrder" },
    { id: "relay-capture", declaredInputs: ["External"] },
  );

  it("degrades to asking a person when a declared External tag has no binding", async () => {
    const { gate, telemetry } = harness({
      policies: [external],
      inferred: {},
      interceptors: [],
    });

    const filed = await gate.file(
      {
        operation: UPDATE,
        toolName: "relay_capture",
        fields: [
          {
            name: "status",
            kind: "text",
            value: "Active",
            provenance: chainOf(mintTag({ source: "External", confidence: 1, at: AT })),
          },
        ],
      },
      turnContext({ channel: "mcp" }),
    );

    expect(filed.entry.requirement).toBe("ReviewerConfirmation");
    expect(filed.entry.status).toBe("pending");
    expect(filed.entry.attestation).toBeNull();
    const blocked = telemetry.find("standing-order.blocked");
    expect(blocked?.attributes["provenance.source"]).toBe("External");
    expect(blocked?.attributes["provenance.field"]).toBe("status");
  });

  it("fires when the same capture's External tag names the record it came from", async () => {
    const { gate } = harness({
      policies: [external],
      interceptors: [
        interceptorPort("relay", {
          status: {
            value: "Active",
            source: "External",
            binding: {
              kind: "external-ref",
              ref: {
                system: "relay",
                recordId: "msg-77",
                relay: {
                  principal: "svc-relay",
                  channelIdentity: "+94770000000",
                  messageId: "msg-77",
                },
              },
            },
            confidence: 1,
            evidence: "captured over the relay",
          },
        }),
      ],
      inferred: {},
    });

    const filed = await gate
      .wrap(writeTool({ name: "relay_capture" }), turnContext({ channel: "mcp" }))
      .execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    expect(filed.status).toBe("approved");
  });

  it("is unaffected by an unbound tag the policy does not predicate on", async () => {
    const outcome = await evaluatePolicies(
      [policyReturning({ requirement: "StandingOrder" }, { declaredInputs: ["External"] })],
      affidavitWith("Conversation", false),
      turnContext(),
      { now: AT },
    );

    expect(outcome.requirement).toBe("StandingOrder");
    expect(outcome.degradedFrom).toBeNull();
  });

  it("reports the unbound input directly, without staging a verdict", () => {
    const policy = policyReturning(null, { declaredInputs: ["UserStated"] });

    expect(unboundDeclaredInput(policy, affidavitWith("UserStated", false))).toEqual({
      field: "status",
      source: "UserStated",
    });
    expect(unboundDeclaredInput(policy, affidavitWith("UserStated", true))).toBeNull();
  });

  it("keeps the policy's deadline through the degrade", async () => {
    const outcome = await evaluatePolicies(
      [
        policyReturning(
          { requirement: "StandingOrder", ttlMs: 60_000 },
          { declaredInputs: ["External"] },
        ),
      ],
      affidavitWith("External", false),
      turnContext(),
      { now: AT },
    );

    // The degrade changes who decides, not when the window closes: the policy's
    // statement about this write's urgency still stands.
    expect(outcome.requirement).toBe("ReviewerConfirmation");
    expect(outcome.ttlMs).toBe(60_000);
  });
});

describe("a policy's deadline is held to the same rule as the gate's own (GT-4, CV-1)", () => {
  /** The gate's own `defaultTtlMs` is already checked at wire-up; these are the other two sources. */
  const unusable: readonly (readonly [string, number])[] = [
    ["zero, which files an entry that is expired on the read that files it", 0],
    ["negative, which puts the deadline before the filing instant", -60_000],
    ["NaN, which has no instant to stamp at all", Number.NaN],
    ["fractional, which is not a whole number of milliseconds", 1.5],
  ];

  it.each(unusable)("refuses a verdict whose ttlMs is %s", async (_why, ttlMs) => {
    const { gate, store } = harness({
      policies: [policyReturning({ requirement: "ReviewerConfirmation", ttlMs }, { id: "urgent" })],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "error") expect.unreachable("an unusable deadline is refused");
    expect(filed.code).toBe("wireup-invalid");
    expect(filed.message).toContain('"urgent"');
    expect(filed.message).toContain("ttlMs");
    // Nothing reached the Docket: the refusal is in step 7, filing is step 9.
    expect((await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items).toHaveLength(
      0,
    );
  });

  it.each(unusable)(
    "refuses a policy default of %s when the verdict names none",
    async (_why, ttlMs) => {
      // `createGate` refuses this wiring outright, which is where a static default
      // belongs (CV-1). `evaluatePolicies` is the backstop for a policy that arrives
      // some other way — a proxy, a JavaScript host, a value read at request time.
      expect(() =>
        harness({ policies: [policyReturning(null, { id: "urgent", defaultTtlMs: ttlMs })] }),
      ).toThrow(/urgent/);

      await expect(
        evaluatePolicies(
          [
            {
              id: "urgent",
              version: "1.0.0",
              declaredInputs: [],
              defaultTtlMs: ttlMs,
              async evaluate() {
                return { requirement: "ReviewerConfirmation" as const };
              },
            },
          ],
          affidavitWith("Conversation", false),
          turnContext(),
          { now: AT },
        ),
      ).rejects.toMatchObject({ code: "wireup-invalid" });
    },
  );

  it("accepts one whole millisecond, which is the smallest deadline there is", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "ReviewerConfirmation", ttlMs: 1 })],
    });

    const filed = await gate.file(
      { operation: UPDATE, toolName: "capture", fields: preparedStatus() },
      turnContext(),
    );

    expect(filed.entry.expiresAt).toBe(plus(AT, 1));
  });

  it("puts the refusal on the telemetry port before it throws", async () => {
    const { gate, telemetry } = harness({
      policies: [policyReturning({ requirement: "ReviewerConfirmation", ttlMs: 0 })],
    });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    const event = telemetry.find("policy.invalid");
    expect(event?.attributes["policy.id"]).toBe("policy-1");
    expect(event?.attributes["option"]).toBe("ttlMs");
  });
});

describe("a policy that throws is a refusal, not an escape (CV-1)", () => {
  /** A policy whose `evaluate` throws whatever it is given. */
  function throwingPolicy(thrown: unknown): ApprovalPolicy {
    return {
      id: "broken",
      version: "1.0.0",
      declaredInputs: [],
      evaluate() {
        throw thrown;
      },
    };
  }

  it("hands the model a stated refusal instead of an unhandled TypeError", async () => {
    const { gate, store } = harness({
      policies: [throwingPolicy(new TypeError("cannot read properties of undefined"))],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "error") expect.unreachable("a broken policy is refused");
    expect(filed.code).toBe("wireup-invalid");
    expect(filed.message).toContain('"broken"');
    expect(filed.message).toContain("cannot read properties of undefined");
    expect((await store.listPending({ tenantId: "tenant-a" }, { limit: 10 })).items).toHaveLength(
      0,
    );
  });

  it("records it on the telemetry port", async () => {
    const { gate, telemetry } = harness({ policies: [throwingPolicy(new Error("boom"))] });

    await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    const event = telemetry.find("policy.invalid");
    expect(event?.attributes["policy.id"]).toBe("broken");
    expect(event?.attributes["option"]).toBe("evaluate");
  });

  it("lets a policy that refuses on purpose keep its own code", async () => {
    const { gate } = harness({
      policies: [throwingPolicy(new AffiantError("decision-unauthorized", "not this principal"))],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "error") expect.unreachable("the policy's own refusal stands");
    expect(filed.code).toBe("decision-unauthorized");
  });
});

describe("a requirement this version does not run is blocked, never weakened (AZ-4)", () => {
  it("files a MultiParty verdict pending with the requirement recorded verbatim", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "MultiParty" })],
    });

    const filed = await gate.wrap(writeTool(), turnContext()).execute({ status: "Active" });

    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");
    const entry = await gate.get(filed.entryId, turnContext());
    expect(entry?.status).toBe("pending");
    expect(entry?.requirement).toBe("MultiParty");
    expect(entry?.blocked).toEqual({
      code: "requirement-not-implemented",
      level: "MultiParty",
    });
    expect(entry?.attestation).toBeNull();
  });

  it("does the same for ReferralRequired", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "ReferralRequired" })],
    });

    const filed = await gate.file(
      { operation: UPDATE, toolName: "capture", fields: preparedStatus() },
      turnContext(),
    );

    const stored = await gate.get(filed.entry.entryId, turnContext());
    expect(stored?.status).toBe("pending");
    expect(stored?.requirement).toBe("ReferralRequired");
    expect(stored?.blocked).toEqual({
      code: "requirement-not-implemented",
      level: "ReferralRequired",
    });
  });

  it("tells a reviewer on the card that no decision will be accepted", async () => {
    const { gate } = harness({
      policies: [policyReturning({ requirement: "MultiParty" })],
    });

    const filed = await gate.file(
      { operation: UPDATE, toolName: "capture", fields: preparedStatus() },
      turnContext(),
    );

    expect(filed.card.affidavit.warnings.join(" ")).toContain("is not implemented in this version");
  });
});

/** One prepared field with a `Conversation` tag — enough substance to reach the policy chain. */
function preparedStatus() {
  return [
    {
      name: "status",
      kind: "text" as const,
      value: "Active",
      provenance: chainOf(mintTag({ source: "Conversation" as const, confidence: 0.9, at: AT })),
    },
  ];
}
