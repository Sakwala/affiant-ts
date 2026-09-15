import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import { runDocketStoreContract } from "../src/testing-store.js";

import { DOCKET_CONTRACT_SPLIT } from "./docket-support.js";

/**
 * DK-1 — idempotent filing, the guarded compare-and-set, expiry as queryable state,
 * preserved amendments on a late decision, execution outcome and lineage, against
 * the reference store.
 *
 * The assertions are the store contract's, in `src/testing-store.ts`, so the
 * reference store and any store a host plugs in are measured by the same ones; the
 * sections named here are the DK-1 half of it.
 *
 * The suite runs on Node, Bun and workerd unchanged: the store has no timer, no
 * filesystem and no Node API, so the same assertions hold on every runtime a host
 * might put the gate on (RT-1).
 */
runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
  api: { describe, it, expect, beforeAll, afterAll },
  sections: DOCKET_CONTRACT_SPLIT["docket-store"],
});
