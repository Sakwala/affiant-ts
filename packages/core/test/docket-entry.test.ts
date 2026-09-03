import { describe, expect, it } from "vitest";

import {
  BLOCKED_CODES,
  DOCKET_STATUSES,
  EXECUTION_OUTCOMES,
  isTerminal,
  newEntry,
  readStatus,
  REQUIREMENT_KINDS,
} from "../src/docket/entry.js";
import { compareFilingOrder, instantMs, isDue, remainingMs } from "../src/docket/expiry.js";

import { affidavit, anEntry } from "./docket-support.js";

/**
 * DK-1 — the review-outcome state machine, and expiry as queryable state.
 *
 * The entry is the row every other rule is written about, so these are the
 * assertions everything else stands on: the defaults a filing gets, the
 * correlations the flat shape cannot express, and the deadline applied as a pure
 * function of the row and the instant.
 */
describe("newEntry defaults (DK-1)", () => {
  it("files pending, undecided, unblocked and unamended", () => {
    const entry = anEntry("entry-1");

    expect(entry.status).toBe("pending");
    expect(entry.execution).toBeNull();
    expect(entry.decision).toBeNull();
    expect(entry.decidedAt).toBeNull();
    expect(entry.attestation).toBeNull();
    expect(entry.amendments).toBeNull();
    expect(entry.blocked).toBeNull();
    expect(entry.compositeRef).toBeNull();
    expect(entry.executionDetail).toBeNull();
    expect(entry.lineage).toEqual({ supersedes: null, supersededBy: null });
  });

  it("stamps the protocol tag the wire types are pinned to", () => {
    expect(anEntry("entry-1").protocolVersion).toBe("0.0.1-seed");
    expect(anEntry("entry-2", { protocolVersion: "9.9.9" }).protocolVersion).toBe("9.9.9");
  });

  it("files a Standing Order approved and unexecuted in one write (AZ-1)", () => {
    const entry = anEntry("entry-1", {
      requirement: "StandingOrder",
      status: "approved",
      attestation: {
        by: { kind: "standing-order", policyId: "policy-7", version: "3" },
        at: "2026-09-04T09:00:00.000Z",
        entryId: "entry-1",
      },
    });

    expect(entry.status).toBe("approved");
    expect(entry.execution).toBe("unexecuted");
    expect(entry.attestation?.by).toEqual({
      kind: "standing-order",
      policyId: "policy-7",
      version: "3",
    });
    // A row filed terminal records when it left pending, defaulting to its filing.
    expect(entry.decidedAt).toBe(entry.filedAt);
  });

  it("files an unimplemented requirement pending and blocked, never degraded (AZ-4)", () => {
    const entry = anEntry("entry-1", {
      requirement: "MultiParty",
      blocked: { code: "requirement-not-implemented", level: "MultiParty" },
      compositeRef: "composite-4",
    });

    expect(entry.requirement).toBe("MultiParty");
    expect(entry.status).toBe("pending");
    expect(entry.blocked).toEqual({ code: "requirement-not-implemented", level: "MultiParty" });
    expect(entry.compositeRef).toBe("composite-4");
  });

  it("refuses a status and an execution outcome that contradict each other", () => {
    expect(() => anEntry("entry-1", { status: "approved", execution: null })).toThrow(RangeError);
    expect(() => anEntry("entry-1", { status: "rejected", execution: "executed" })).toThrow(
      RangeError,
    );
    expect(() => anEntry("entry-1", { execution: "executed" })).toThrow(RangeError);
  });

  it("refuses a pending row that claims to have left pending, and the reverse", () => {
    expect(() => anEntry("entry-1", { decidedAt: "2026-09-04T09:00:00.000Z" })).toThrow(RangeError);
    expect(() => anEntry("entry-1", { status: "rejected", decidedAt: null })).toThrow(RangeError);
  });

  it("refuses a blank identifier and an unreadable instant", () => {
    expect(() => anEntry("   ")).toThrow(RangeError);
    expect(() => anEntry("entry-1", { tenantId: "" })).toThrow(RangeError);
    expect(() => anEntry("entry-1", { expiresAt: "not a date" })).toThrow(RangeError);
    expect(() => anEntry("entry-1", { filedAt: "whenever" })).toThrow(RangeError);
  });

  it("refuses a requirement kind and a status it does not know", () => {
    expect(() =>
      newEntry({
        entryId: "entry-1",
        tenantId: "tenant-a",
        conversationId: "conv-1",
        channel: "chat",
        toolName: "update_invoice",
        affidavit: affidavit(),
        requirement: "Whatever" as never,
        filedAt: "2026-09-04T09:00:00.000Z",
        expiresAt: "2026-09-04T09:30:00.000Z",
      }),
    ).toThrow(RangeError);
    expect(() => anEntry("entry-1", { status: "deferred" as never })).toThrow(RangeError);
  });
});

describe("expiry as state (DK-1)", () => {
  const entry = anEntry("entry-1");

  it("reads expired past the deadline with no sweep in sight", () => {
    expect(readStatus(entry, "2026-09-04T09:29:59.999Z")).toBe("pending");
    expect(readStatus(entry, "2026-09-04T09:30:00.001Z")).toBe("expired");
  });

  it("treats the deadline instant itself as expired", () => {
    expect(readStatus(entry, entry.expiresAt)).toBe("expired");
    expect(isDue(entry, entry.expiresAt)).toBe(true);
  });

  it("never re-expires a row that already left pending", () => {
    const approved = anEntry("entry-2", { status: "approved" });
    const rejected = anEntry("entry-3", { status: "rejected" });

    expect(readStatus(approved, "2027-01-01T00:00:00.000Z")).toBe("approved");
    expect(readStatus(rejected, "2027-01-01T00:00:00.000Z")).toBe("rejected");
    expect(isDue(approved, "2027-01-01T00:00:00.000Z")).toBe(false);
  });

  it("counts down to the deadline and never past it", () => {
    expect(remainingMs(entry, "2026-09-04T09:00:00.000Z")).toBe(30 * 60 * 1000);
    expect(remainingMs(entry, "2026-09-04T09:30:00.000Z")).toBe(0);
    expect(remainingMs(entry, "2027-01-01T00:00:00.000Z")).toBe(0);
    expect(
      remainingMs(anEntry("entry-4", { status: "rejected" }), "2026-09-04T09:00:00.000Z"),
    ).toBe(0);
  });

  it("throws on an unreadable instant rather than silently never expiring", () => {
    expect(() => isDue(entry, "not a date")).toThrow(RangeError);
    expect(() => readStatus(entry, "")).toThrow(RangeError);
    expect(() => instantMs("2026-13-45T99:00:00Z")).toThrow(RangeError);
  });

  it("compares filing order by instant, then by entry id", () => {
    const first = anEntry("entry-b", { filedAt: "2026-09-04T09:00:00.000Z" });
    const later = anEntry("entry-a", { filedAt: "2026-09-04T09:00:01.000Z" });

    expect(compareFilingOrder(first, later)).toBeLessThan(0);
    expect(compareFilingOrder(later, first)).toBeGreaterThan(0);
    expect(compareFilingOrder(first, first)).toBe(0);
    // Same instant: the id breaks the tie, so the order is total on every runtime.
    expect(compareFilingOrder(first, anEntry("entry-c"))).toBeLessThan(0);
  });
});

describe("the state registries", () => {
  it("pins every status, execution outcome, requirement kind and blocked code", () => {
    expect(DOCKET_STATUSES).toEqual(["pending", "approved", "rejected", "expired"]);
    expect(EXECUTION_OUTCOMES).toEqual(["unexecuted", "executed", "failed"]);
    expect(REQUIREMENT_KINDS).toEqual([
      "StandingOrder",
      "ReviewerConfirmation",
      "ReferralRequired",
      "MultiParty",
    ]);
    expect(BLOCKED_CODES).toEqual(["requirement-not-implemented", "coverage-refused"]);
  });

  it("reserves deferred and the referral outcome by not naming them", () => {
    expect(DOCKET_STATUSES).not.toContain("deferred");
    expect(DOCKET_STATUSES).not.toContain("referred");
  });

  it("calls everything but pending terminal", () => {
    expect(isTerminal("pending")).toBe(false);
    expect(DOCKET_STATUSES.filter((status) => isTerminal(status))).toEqual([
      "approved",
      "rejected",
      "expired",
    ]);
  });
});
