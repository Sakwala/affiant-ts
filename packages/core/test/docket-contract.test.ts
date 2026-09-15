import { describe, expect, it } from "vitest";

import { InMemoryDocketStore, InMemorySessionStore } from "../src/docket/memory.js";
import type { ContractRunnerApi } from "../src/testing-store.js";
import {
  DOCKET_CONTRACT_CASES,
  DOCKET_CONTRACT_SECTIONS,
  SESSION_CONTRACT_CASES,
  SESSION_CONTRACT_SECTIONS,
  runDocketStoreContract,
  runSessionStoreContract,
  withSessionStore,
} from "../src/testing-store.js";

import { DOCKET_CONTRACT_SPLIT } from "./docket-support.js";

/**
 * The store contract is only worth what it registers.
 *
 * The four Docket suites are thin callers of one parametrised contract, and each
 * asks for a named block of it. That arrangement has one failure mode: a block or a
 * case that stops being registered reports nothing at all — a green run that
 * measured less than the run before it. These assertions close that hole from both
 * ends: the split across the suites covers every block exactly once, and a `skip` or
 * a `sections` entry that matches nothing is refused rather than ignored.
 */

/** A runner that records what a contract registers instead of running it. */
function recorder(): { api: ContractRunnerApi; blocks: string[]; titles: string[] } {
  const blocks: string[] = [];
  const titles: string[] = [];
  return {
    blocks,
    titles,
    api: {
      describe(name, fn) {
        blocks.push(name);
        fn();
      },
      it(name) {
        titles.push(name);
      },
      beforeAll() {},
      afterAll() {},
      expect,
    },
  };
}

/** The whole Docket contract, registered against a recorder. */
function registeredDocket(options: { skip?: readonly string[] } = {}): string[] {
  const recording = recorder();
  runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
    api: recording.api,
    ...options,
  });
  return recording.titles;
}

describe("every block of the contract is run by some suite", () => {
  it("splits the Docket contract across the suites with nothing left over", () => {
    const named = Object.values(DOCKET_CONTRACT_SPLIT).flat();

    expect([...named].sort()).toEqual([...DOCKET_CONTRACT_SECTIONS].sort());
    // Exactly once, not merely at least once: a block named twice would run its
    // assertions twice and hide the block that went missing.
    expect(new Set(named).size).toBe(named.length);
  });

  it("registers one case per id, and the ids are unique", () => {
    expect(registeredDocket()).toHaveLength(DOCKET_CONTRACT_CASES.length);
    expect(new Set(DOCKET_CONTRACT_CASES).size).toBe(DOCKET_CONTRACT_CASES.length);
    expect(new Set(SESSION_CONTRACT_CASES).size).toBe(SESSION_CONTRACT_CASES.length);
    expect(SESSION_CONTRACT_SECTIONS).toEqual(["rehydration"]);
  });

  it("registers the whole rehydration contract from one block", () => {
    const recording = recorder();
    runSessionStoreContract(
      (clock) => {
        const docket = new InMemoryDocketStore({ clock });
        return withSessionStore(docket, new InMemorySessionStore(docket));
      },
      { api: recording.api },
    );

    expect(recording.blocks).toHaveLength(1);
    expect(recording.titles).toHaveLength(SESSION_CONTRACT_CASES.length);
  });
});

describe("a skip is deliberate, never a typo", () => {
  it("drops exactly the case it names", () => {
    const skipped = DOCKET_CONTRACT_CASES[0];
    if (skipped === undefined) throw new Error("the contract registers no case");

    expect(registeredDocket({ skip: [skipped] })).toHaveLength(DOCKET_CONTRACT_CASES.length - 1);
  });

  it("refuses a case id the contract does not define", () => {
    expect(() => registeredDocket({ skip: ["filing/no-such-case"] })).toThrow(RangeError);
  });

  it("refuses a block the contract does not define", () => {
    const recording = recorder();

    expect(() =>
      runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
        api: recording.api,
        sections: ["no-such-section" as never],
      }),
    ).toThrow(RangeError);
  });

  it("labels the blocks when a caller runs the contract more than once", () => {
    const recording = recorder();
    runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
      api: recording.api,
      name: "over a pool",
      sections: ["purge"],
    });

    expect(recording.blocks).toEqual([
      "over a pool: purge removes a tenant and nothing else (DK-4)",
    ]);
  });
});
