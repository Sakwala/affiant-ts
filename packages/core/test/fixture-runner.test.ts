import { describe, expect, it } from "vitest";

import type { Fixture, FixtureResult } from "../src/testing.js";
import { runFixture } from "../src/testing.js";

import { fixture } from "./fixtures/fixtures.generated.js";

/**
 * The fixture runner as a **negative oracle**.
 *
 * The rulebook accepts a conformance fixture only through the negative oracle: it
 * must fail against a release known to violate its rule, because *a fixture a broken
 * implementation passes is not a test*. That clause is about fixtures; this suite is
 * about the thing that runs them. `@affiant/core/testing` is published, is what a
 * host checks its own ports against, and is what a conformance driver will run
 * against a second implementation to derive that implementation's parity manifest.
 * A runner that answers "pass" to a document asserting nothing, or that silently
 * ignores a misspelled expectation key, produces a green parity manifest for an
 * implementation nobody checked.
 *
 * So every shape below is a fixture that *must not pass*, and the suite asserts both
 * that it fails and the path it fails at - a failure with no path tells a fixture
 * author nothing. Two controls sit at the top: an untouched fixture passes, and a
 * correctly declared refusal on the step under test passes. Without them a runner
 * that failed everything would read green here.
 *
 * Runs on Node, Bun and workerd alike: it reads no files and touches no Node API.
 */

/** A deep, mutable copy of a fixture, for a case that breaks one thing in it. */
function copyOf(id: string): Record<string, never> & Fixture {
  return JSON.parse(JSON.stringify(fixture(id))) as Record<string, never> & Fixture;
}

/** The paths a result failed at. */
function pathsOf(result: FixtureResult): string[] {
  return result.failures.map((failure) => failure.at);
}

/** A fixture with a row expectation, an Affidavit and fields. */
const APPROVE = "decide/approve";
/** A fixture that also states a card, for the card-side key checks. */
const CARD = "sequence-a/typed-inputs-on-the-card";

describe("the runner passes a fixture that is actually a fixture", () => {
  it("runs an untouched fixture green", async () => {
    const result = await runFixture(copyOf(APPROVE));

    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("accepts a refusal correctly declared on the step under test", async () => {
    // `decide/second-decision-refused` states its refusal in `expect.error`; saying
    // the same thing again on the step is redundant but true, and true has to pass
    // or the comparison below would be a trap rather than a check.
    const broken = copyOf("decide/second-decision-refused");
    const step = broken.given.step as unknown as Record<string, unknown>;
    step["refusal"] = broken.expect.error?.code;

    const result = await runFixture(broken);

    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
  });
});

/** One way a fixture can be vacuous or malformed, and the path it must fail at. */
interface Case {
  /** What the case is, as a sentence. */
  readonly what: string;
  /** The fixture, broken. */
  readonly make: () => Fixture;
  /** The path the runner must report. */
  readonly at: string;
}

const CASES: readonly Case[] = [
  {
    what: "an expectation that states nothing at all",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken as { expect: unknown }).expect = {};
      return broken;
    },
    at: "expect",
  },
  {
    what: "an empty row matcher, which every implementation satisfies",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken as { expect: unknown }).expect = { entry: {} };
      return broken;
    },
    at: "expect",
  },
  {
    what: "an empty telemetryAbsent list, which asserts no key is absent",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken as { expect: unknown }).expect = { telemetryAbsent: [] };
      return broken;
    },
    at: "expect",
  },
  {
    what: "an unknown top-level expectation clause",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.expect as unknown as Record<string, unknown>)["nonsense"] = { status: "approved" };
      return broken;
    },
    at: "expect.nonsense",
  },
  {
    what: "a misspelled row key, which the checker would never read",
    make: () => {
      const broken = copyOf(APPROVE);
      const entry = broken.expect.entry as unknown as Record<string, unknown>;
      delete entry["status"];
      entry["statuz"] = "rejected";
      return broken;
    },
    at: "expect.entry.statuz",
  },
  {
    what: "misspelled field keys inside an Affidavit matcher",
    make: () => {
      const broken = copyOf(APPROVE);
      const entry = broken.expect.entry as unknown as Record<string, unknown>;
      const affidavit = entry["affidavit"] as Record<string, unknown>;
      const fields = affidavit["fields"] as Record<string, unknown>[];
      const first = fields[0] as Record<string, unknown>;
      delete first["value"];
      delete first["source"];
      first["valu"] = "WRONG";
      first["sorce"] = "Nonsense";
      return broken;
    },
    at: "expect.entry.affidavit.fields[0].valu",
  },
  {
    what: "a misspelled lineage key",
    make: () => {
      const broken = copyOf(APPROVE);
      const entry = broken.expect.entry as unknown as Record<string, unknown>;
      entry["lineage"] = { supersededBi: "anything" };
      return broken;
    },
    at: "expect.entry.lineage.supersededBi",
  },
  {
    what: "a misspelled card field key",
    make: () => {
      const broken = copyOf(CARD);
      const card = broken.expect.card as unknown as Record<string, unknown>;
      const fields = card["fields"] as Record<string, unknown>[];
      const first = fields[0] as Record<string, unknown>;
      delete first["allowedValues"];
      first["allowedValuez"] = ["Nonsense"];
      return broken;
    },
    at: "expect.card.fields[0].allowedValuez",
  },
  {
    what: "a misspelled key inside the error clause",
    make: () => {
      const broken = copyOf("decide/second-decision-refused");
      const error = broken.expect.error as unknown as Record<string, unknown>;
      error["messageContainz"] = "never compared";
      return broken;
    },
    at: "expect.error.messageContainz",
  },
  {
    what: "an unregistered telemetry key nobody will ever emit",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.expect as unknown as Record<string, unknown>)["telemetryAbsent"] = [
        "docket.transitionn",
      ];
      return broken;
    },
    at: "expect.telemetryAbsent[0]",
  },
  {
    what: "an unknown key in the wiring",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given.gate as unknown as Record<string, unknown>)["riskScorrer"] = 0.1;
      return broken;
    },
    at: "given.gate.riskScorrer",
  },
  {
    what: "an unknown key in the given block",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given as unknown as Record<string, unknown>)["clocks"] = "2026-09-04T09:00:00.000Z";
      return broken;
    },
    at: "given.clocks",
  },
  {
    what: "an unknown key on the turn context",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given.ctx as unknown as Record<string, unknown>)["tenant"] = "tenant-b";
      return broken;
    },
    at: "given.ctx.tenant",
  },
  {
    what: "an unknown key on the step under test",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given.step as unknown as Record<string, unknown>)["decisions"] = { kind: "reject" };
      return broken;
    },
    at: "given.step.decisions",
  },
  {
    what: "an unknown key on a prior step",
    make: () => {
      const broken = copyOf(APPROVE);
      const prior = broken.given.prior as unknown as Record<string, unknown>[];
      (prior[0] as Record<string, unknown>)["toolNames"] = "update_invoice";
      return broken;
    },
    at: "given.prior[0].toolNames",
  },
  {
    what: "a step kind the format does not define",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given.step as unknown as Record<string, unknown>)["kind"] = "decidee";
      return broken;
    },
    at: "given.step.kind",
  },
  {
    what: "a refusal claimed on the step under test that never happened",
    make: () => {
      const broken = copyOf(APPROVE);
      (broken.given.step as unknown as Record<string, unknown>)["refusal"] = "decision-expired";
      return broken;
    },
    at: "step.refusal",
  },
  {
    what: "a wire-up fixture stating a row nobody will ever check",
    make: () => {
      const broken = copyOf("gate/threshold-without-scorer");
      (broken.expect as unknown as Record<string, unknown>)["entry"] = { status: "approved" };
      return broken;
    },
    at: "entry",
  },
];

describe("the runner refuses a fixture that asserts nothing, or asserts it in a key nobody reads", () => {
  it.each(CASES.map((testCase) => [testCase.what, testCase] as const))(
    "fails on %s",
    async (_what, testCase) => {
      const result = await runFixture(testCase.make());

      expect(result.pass).toBe(false);
      expect(pathsOf(result)).toContain(testCase.at);
    },
  );

  it("covers at least eight distinct shapes, at distinct paths", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CASES.map((testCase) => testCase.what)).size).toBe(CASES.length);
    // The three vacuous shapes all fail at `expect`, because "this fixture states
    // nothing" is one fact however it is spelled; every other case names its own key.
    expect(new Set(CASES.map((testCase) => testCase.at)).size).toBeGreaterThanOrEqual(8);
  });
});
