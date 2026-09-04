import { describe, expect, it } from "vitest";

import {
  AffiantError,
  ERROR_CODES,
  ErrorCode,
  isAffiantError,
  isErrorCode,
} from "../src/errors.js";

/**
 * CV-1 — a misconfiguration the framework can detect fails at wire-up with a
 * *stated* error. "Stated" is the load-bearing word: the code is the contract a
 * host branches on and a conformance fixture asserts, so the set is closed, its
 * order is pinned, and nothing here asserts on a message string.
 */
describe("ErrorCode (CV-1)", () => {
  /**
   * The registry as it shipped at 0.1.0-alpha.0. A code may be added; removing or
   * renaming one breaks every host that branches on it, so this list is a
   * tripwire, not a mirror of the implementation.
   */
  const shipped = [
    "requirement-not-implemented",
    "coverage-refused",
    "substance-refused",
    "decision-unauthorized",
    "decision-not-pending",
    "decision-expired",
    "decision-lost-race",
    "wireup-invalid",
    "entry-not-found",
  ];

  it("carries every code that shipped at 0.1.0-alpha.0", () => {
    for (const code of shipped) {
      expect(ERROR_CODES).toContain(code);
    }
  });

  /** The registry as it stands. Grows at the end; the prefix above never moves. */
  const current = [...shipped, "execution-already-recorded"];

  it("pins the registry order, and only ever appends", () => {
    // A code may be added. Inserting one among the codes that already shipped, or
    // reordering them, reads as a rename to every host branching on this list - so
    // the shipped prefix is asserted in place, and additions land after it.
    expect(ERROR_CODES.slice(0, shipped.length)).toEqual(shipped);
    expect([...ERROR_CODES]).toEqual(current);
  });

  it("keys every code by itself, so there is one spelling to remember", () => {
    for (const code of ERROR_CODES) {
      expect(ErrorCode[code]).toBe(code);
    }
    expect(Object.keys(ErrorCode)).toEqual([...ERROR_CODES]);
  });

  it("recognises its own codes and nothing else", () => {
    expect(isErrorCode("substance-refused")).toBe(true);
    expect(isErrorCode("decision-lost-race")).toBe(true);
    expect(isErrorCode("substance_refused")).toBe(false);
    expect(isErrorCode("")).toBe(false);
    expect(isErrorCode(null)).toBe(false);
    expect(isErrorCode(7)).toBe(false);
  });
});

describe("AffiantError", () => {
  it("is an Error carrying the code, and defaults its message to the code", () => {
    const error = new AffiantError("decision-unauthorized");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AffiantError");
    expect(error.code).toBe("decision-unauthorized");
    expect(error.message).toBe("decision-unauthorized");
    expect(error.details).toEqual({});
  });

  it("carries a message and structured details when the throwing site has them", () => {
    const error = new AffiantError(
      "wireup-invalid",
      "policy 'invoice-auto' declares a risk threshold but no scorer is wired",
      { policyId: "invoice-auto", threshold: 0.2 },
    );

    expect(error.code).toBe("wireup-invalid");
    expect(error.message).toContain("no scorer is wired");
    expect(error.details).toEqual({ policyId: "invoice-auto", threshold: 0.2 });
  });

  it("is catchable and narrowable", () => {
    const thrown = ((): unknown => {
      try {
        throw new AffiantError("decision-expired", "entry 42 expired at 09:00");
      } catch (error) {
        return error;
      }
    })();

    expect(isAffiantError(thrown)).toBe(true);
    if (isAffiantError(thrown)) {
      expect(thrown.code).toBe("decision-expired");
    }
  });
});

describe("isAffiantError", () => {
  it("is true for an instance", () => {
    expect(isAffiantError(new AffiantError("entry-not-found"))).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isAffiantError(new Error("decision-expired"))).toBe(false);
    expect(isAffiantError({ code: "decision-expired" })).toBe(false);
    expect(isAffiantError("decision-expired")).toBe(false);
    expect(isAffiantError(null)).toBe(false);
    expect(isAffiantError(undefined)).toBe(false);
  });

  it("recognises an error from a second copy of this package in the same process", () => {
    // A bundler, or two versions in one dependency tree, produces a second class.
    // A host catching across that boundary still needs a true answer.
    const foreign = new Error("decision-lost-race") as Error & { code: string };
    foreign.name = "AffiantError";
    foreign.code = "decision-lost-race";

    expect(isAffiantError(foreign)).toBe(true);
  });

  it("is not fooled by an error that only borrows the name", () => {
    const impostor = new Error("nope") as Error & { code: string };
    impostor.name = "AffiantError";
    impostor.code = "not-a-real-code";

    expect(isAffiantError(impostor)).toBe(false);
  });
});
