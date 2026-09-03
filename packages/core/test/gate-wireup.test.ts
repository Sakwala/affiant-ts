import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import type { GateOptions } from "../src/gate/gate.js";
import { createGate } from "../src/gate/gate.js";
import { AffiantError } from "../src/errors.js";

import {
  inferencePort,
  permissiveAuthorization,
  policyReturning,
  projectionPort,
  riskScorer,
  stubClock,
  turnContext,
} from "./gate-support.js";

/**
 * CV-1 — a misconfiguration the framework can detect fails at wire-up with a stated
 * error, and there is no option that turns the gate off.
 *
 * Every case here asserts the *name* of the missing piece, not just that something
 * threw. A wire-up error a host has to bisect is a wire-up error a host works around.
 */

/** A complete set of options, from which each case removes exactly one thing. */
function options(): GateOptions {
  return {
    store: new InMemoryDocketStore({ clock: stubClock() }),
    inference: inferencePort({}),
    projection: projectionPort(null),
    authorization: permissiveAuthorization,
    policies: [],
    clock: stubClock(),
    defaultTtlMs: 30 * 60_000,
  };
}

/** The options minus `key`, as a JavaScript host could hand them in. */
function without(key: keyof GateOptions): GateOptions {
  const partial = { ...options() } as Record<string, unknown>;
  delete partial[key];
  return partial as unknown as GateOptions;
}

describe("the four ports are required, each named in its own refusal", () => {
  it.each([
    ["store", /GateOptions\.store is required/],
    ["inference", /GateOptions\.inference is required/],
    ["projection", /GateOptions\.projection is required/],
    ["authorization", /GateOptions\.authorization is required/],
  ] as const)("names %s", (key, message) => {
    let thrown: unknown;
    try {
      createGate(without(key));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AffiantError);
    expect((thrown as AffiantError).code).toBe("wireup-invalid");
    expect((thrown as AffiantError).message).toMatch(message);
    expect((thrown as AffiantError).details["option"]).toBe(key);
  });

  it("refuses a port explicitly passed as null", () => {
    expect(() =>
      createGate({ ...options(), store: null as unknown as GateOptions["store"] }),
    ).toThrow(/GateOptions\.store is required/);
  });
});

describe("defaultTtlMs is required and must be a real deadline (GT-4)", () => {
  it("refuses its absence", () => {
    expect(() => createGate(without("defaultTtlMs"))).toThrow(
      /GateOptions\.defaultTtlMs must be a positive whole number/,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s", (value) => {
    expect(() => createGate({ ...options(), defaultTtlMs: value })).toThrow(
      /defaultTtlMs must be a positive whole number/,
    );
  });

  it("accepts a positive whole number of milliseconds", () => {
    expect(() => createGate({ ...options(), defaultTtlMs: 1 })).not.toThrow();
  });
});

describe("a policy's own defaultTtlMs is a deadline too (GT-4, CV-1)", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a policy carrying %s, naming the policy",
    (value) => {
      let thrown: unknown;
      try {
        createGate({
          ...options(),
          policies: [policyReturning(null, { id: "urgent", defaultTtlMs: value })],
        });
      } catch (error) {
        thrown = error;
      }

      // Caught here rather than on the unlucky request whose verdict happens to name
      // no deadline of its own — which is where the same value would otherwise file a
      // row that reads `expired` the moment it exists.
      expect((thrown as AffiantError).code).toBe("wireup-invalid");
      expect((thrown as AffiantError).message).toMatch(/"urgent"/);
      expect((thrown as AffiantError).details["option"]).toBe("defaultTtlMs");
    },
  );

  it("accepts a policy with a whole positive default, and one with none at all", () => {
    expect(() =>
      createGate({
        ...options(),
        policies: [
          policyReturning(null, { id: "urgent", defaultTtlMs: 1 }),
          policyReturning(null, { id: "quiet" }),
        ],
      }),
    ).not.toThrow();
  });
});

describe("a policy that declares a threshold needs a scorer (GT-5, CV-1)", () => {
  it("refuses the wiring at start-up, naming the policy", () => {
    let thrown: unknown;
    try {
      createGate({
        ...options(),
        policies: [
          policyReturning(
            { requirement: "StandingOrder", threshold: 0.5 },
            {
              id: "high-value",
              declaresThreshold: true,
            },
          ),
        ],
      });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as AffiantError).code).toBe("wireup-invalid");
    expect((thrown as AffiantError).message).toMatch(/"high-value"/);
    expect((thrown as AffiantError).details["option"]).toBe("riskScorer");
  });

  it("accepts the same wiring once a scorer is supplied", () => {
    expect(() =>
      createGate({
        ...options(),
        policies: [
          policyReturning(
            { requirement: "StandingOrder", threshold: 0.5 },
            {
              declaresThreshold: true,
            },
          ),
        ],
        riskScorer: riskScorer(0.1),
      }),
    ).not.toThrow();
  });

  it("does not demand a scorer from a policy that declares no threshold", () => {
    expect(() =>
      createGate({ ...options(), policies: [policyReturning({ requirement: "StandingOrder" })] }),
    ).not.toThrow();
  });

  it("checks the static declaration, not the verdicts, so the refusal cannot be luck", () => {
    // The policy returns no verdict at all, so no evaluation would ever reach the
    // threshold branch. GT-5 still calls the wiring an error, because a check that
    // depends on which requests arrive is a silent non-fire on the ones that do not.
    expect(() =>
      createGate({
        ...options(),
        policies: [policyReturning(null, { declaresThreshold: true })],
      }),
    ).toThrow(/declares a risk threshold/);
  });
});

describe("what a gate without options still refuses", () => {
  it("refuses a proposal that carries neither prepared fields nor a schema", async () => {
    const gate = createGate(options());

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
        },
        turnContext(),
      ),
    ).rejects.toThrow(/carries neither prepared fields nor a field schema/);
  });

  it("has a decision path, and no executor to go with it (AZ-7)", () => {
    const gate = createGate(options()) as unknown as Record<string, unknown>;

    expect(typeof gate["decide"]).toBe("function");
    expect(typeof gate["resubmit"]).toBe("function");
    expect(typeof gate["markExecuted"]).toBe("function");
    // AZ-7: no package in an implementation writes to a host's store, so there is
    // nothing here that could. `markExecuted` records what the host says it did.
    expect(gate["execute"]).toBeUndefined();
    expect(gate["executor"]).toBeUndefined();
  });
});
