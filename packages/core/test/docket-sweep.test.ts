import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";
import { runDocketStoreContract } from "../src/testing-store.js";

import { DOCKET_CONTRACT_SPLIT } from "./docket-support.js";

/**
 * DK-3 — the expiry sweep is bounded, paged and host-scheduled.
 *
 * The shipped .NET sweep runs every 30 seconds over every pending entry, unpaged, on
 * every instance. Two things replace it here: the deadline is applied on read
 * (DK-1, so nothing depends on the sweep having run), and the sweep itself takes a
 * limit and reports whether more remain, so a host drains it in bounded steps. The
 * core schedules nothing — `test/node/docket-runtime.test.ts` greps `src/` for a
 * timer.
 *
 * The assertions are the store contract's, in `src/testing-store.ts`: these two
 * sections are the DK-3 half of it, and they hold for any store a host plugs in.
 */
runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
  api: { describe, it, expect, beforeAll, afterAll },
  sections: DOCKET_CONTRACT_SPLIT["docket-sweep"],
});
