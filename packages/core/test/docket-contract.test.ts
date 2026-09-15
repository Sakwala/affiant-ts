import { describe, expect, it } from "vitest";

import { InMemoryDocketStore, InMemorySessionStore } from "../src/docket/memory.js";
import type { ContractRunnerApi } from "../src/testing-store.js";
import {
  DOCKET_CONTRACT_CASES,
  SESSION_CONTRACT_CASES,
  SESSION_CONTRACT_SECTIONS,
  runDocketStoreContract,
  runSessionStoreContract,
  withSessionStore,
} from "../src/testing-store.js";

/**
 * The store contract is only worth what it registers.
 *
 * These are the assertions about the contract's own registration that can be made
 * without running it: an id registers one case, a `skip` drops the case it names,
 * and a `skip` or `sections` entry that matches nothing is refused rather than
 * ignored — a skip nobody notices is a case a store stopped running.
 *
 * Whether the four suites between them ask for the whole contract is a different
 * question, and it cannot be answered from a constant they read: the narrowing would
 * happen at their call sites. `test/node/docket-contract-coverage.test.ts` answers it
 * by collecting the suites and reading back what they registered.
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

describe("the contract registers what it says it registers", () => {
  it("registers one case per id, and the ids are unique", () => {
    expect(registeredDocket()).toHaveLength(DOCKET_CONTRACT_CASES.length);
    expect(new Set(DOCKET_CONTRACT_CASES.map((one) => one.id)).size).toBe(
      DOCKET_CONTRACT_CASES.length,
    );
    expect(new Set(SESSION_CONTRACT_CASES.map((one) => one.id)).size).toBe(
      SESSION_CONTRACT_CASES.length,
    );
    expect(SESSION_CONTRACT_SECTIONS).toEqual(["rehydration"]);
  });

  it("names every case it registers, block and title, for a caller checking a suite", () => {
    const recording = recorder();
    runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
      api: recording.api,
      sections: ["purge"],
    });

    const purge = DOCKET_CONTRACT_CASES.filter((one) => one.section === "purge");
    expect(recording.blocks).toEqual([...new Set(purge.map((one) => one.block))]);
    expect(recording.titles).toEqual(purge.map((one) => one.title));
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

    const registered = registeredDocket({ skip: [skipped.id] });

    expect(registered).toHaveLength(DOCKET_CONTRACT_CASES.length - 1);
    expect(registered).not.toContain(skipped.title);
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
