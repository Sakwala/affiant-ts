import type { DocketContractSection } from "../src/testing-store.js";

/**
 * Fixtures shared by the Docket suites.
 *
 * Not a suite itself — `vitest.config.ts` collects `test/**\/*.test.ts`, so this
 * module is only ever imported. It runs on Node, Bun and workerd alike: no
 * filesystem, no Node global, nothing but the package's own types.
 *
 * The builders themselves live in `src/testing-store.ts`, beside the store contract
 * that uses them, so a store outside this package files the same shapes the
 * reference store is measured on. This module is the name the suites here already
 * import them under.
 */

export {
  entryIds as ids,
  sampleAffidavit as affidavit,
  sampleEntry as anEntry,
  sampleField as field,
  stubClock,
} from "../src/testing-store.js";
export type { StubClock } from "../src/testing-store.js";

/**
 * Which suite runs which block of the store contract.
 *
 * The contract is one document; the suites here are four, each carrying the note
 * that says what its rules are for. The split lives in one place so that
 * `docket-contract.test.ts` can assert it covers every block — a block no suite
 * named would be a set of assertions that quietly stopped running.
 */
export const DOCKET_CONTRACT_SPLIT = {
  "docket-store": ["filing", "transition", "deadline", "execution", "lineage"],
  "docket-sweep": ["sweep", "paging"],
  "docket-retention": ["retention", "purge", "export", "tenancy"],
} as const satisfies Record<string, readonly DocketContractSection[]>;
