import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import { runDocketStoreContract } from "../src/testing-store.js";

import { DOCKET_CONTRACT_SPLIT } from "./docket-support.js";

/**
 * DK-4 — retention, purge and export are hooks the host drives, and the Docket reads
 * forward. AZ-2 — every operation is tenant-scoped, and a mismatch is a miss.
 *
 * The assertions are the store contract's, in `src/testing-store.ts`: these four
 * sections are its DK-4 and AZ-2 half, and they hold for any store a host plugs in.
 */
runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
  api: { describe, it, expect, beforeAll, afterAll },
  sections: DOCKET_CONTRACT_SPLIT["docket-retention"],
});
