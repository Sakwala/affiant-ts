import { describe, expect, it } from "vitest";

import { runFixture, runFixtureDir } from "../src/testing.js";

import { fixtures, fixtureSet } from "./fixtures/fixtures.generated.js";

/**
 * Every declarative fixture, run against a real gate through `@affiant/core/testing`.
 *
 * The files under `test/fixtures/<set>/` are the record — `{ id, rules, title, given,
 * expect }`, one shape for the whole gate — and this suite is a thin wrapper: it hands
 * each document to {@link runFixture} and turns the structured result into an
 * assertion. The runner is the published one, so what a conformance driver will run
 * against a second implementation is what runs here.
 *
 * What is **not** here is what a fixture cannot state. A spy proving a write tool's own
 * `execute` was never called (GT-6), a spy proving the Docket was not read before an
 * unauthorized decision was refused (AZ-2), two decisions actually racing (DK-1), the
 * type-level halves of AZ-3 and AZ-7, the retention cut (DK-4) and the wire round-trip
 * (SR-3) all live in hand-written suites beside this one.
 */

/** Every rule the fixture set as a whole is claimed to cover. */
const CLAIMED = [
  "AF-1",
  "AF-2",
  "AF-3",
  "AF-4",
  "AZ-1",
  "AZ-2",
  "AZ-3",
  "AZ-4",
  "AZ-5",
  "AZ-6",
  "AZ-7",
  "CV-1",
  "CV-4",
  "DK-1",
  "DK-2",
  "DK-3",
  "DK-4",
  "DK-5",
  "GT-1",
  "GT-2",
  "GT-3",
  "GT-4",
  "GT-5",
  "GT-6",
  "PV-1",
  "PV-2",
  "PV-3",
  "PV-4",
  "PV-5",
  "SR-1",
  "SR-4",
] as const;

describe("the fixture set", () => {
  it("has every set populated", () => {
    expect(fixtureSet("gate").length).toBeGreaterThanOrEqual(17);
    expect(fixtureSet("decide").length).toBeGreaterThanOrEqual(17);
    expect(fixtureSet("sequence-a").length).toBeGreaterThanOrEqual(15);
    expect(fixtureSet("sequence-c").length).toBeGreaterThanOrEqual(5);
    expect(fixtures.length).toBeGreaterThanOrEqual(54);
  });

  it("gives every fixture a unique id, a rule citation and a title", () => {
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
    for (const fixture of fixtures) {
      expect(fixture.rules.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.title.length, fixture.id).toBeGreaterThan(40);
    }
  });

  it("cites every rule the set claims", () => {
    const cited = new Set(fixtures.flatMap((fixture) => fixture.rules));
    for (const rule of CLAIMED) {
      expect(cited.has(rule), `no fixture cites ${rule}`).toBe(true);
    }
  });

  it("runs as a set and reports structured results a driver can consume", async () => {
    const run = await runFixtureDir(fixtures);

    expect(run.total).toBe(fixtures.length);
    expect(run.failedIds).toEqual([]);
    expect(run.passed).toBe(run.total);
  });
});

describe.each(fixtures.map((fixture) => [fixture.id, fixture] as const))("%s", (_id, fixture) => {
  it(fixture.title, async () => {
    const result = await runFixture(fixture);

    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
  });
});
