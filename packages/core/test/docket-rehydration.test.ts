import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryDocketStore, InMemorySessionStore } from "../src/docket/memory.js";
import { runSessionStoreContract, withSessionStore } from "../src/testing-store.js";

/**
 * DK-5 — rehydration order is fixed: `pending` entries, then `approved` and
 * `unexecuted` entries, each in filing order.
 *
 * The order is a rule and not a preference because the two groups ask different
 * things of the person reconnecting — the first still needs a decision, the second
 * still needs execution — and a client that interleaved them would put settled work
 * in front of work that is blocked on the reader.
 *
 * The assertions are the store contract's, in `src/testing-store.ts`. The reference
 * session store is built **on** a `DocketStore` and uses only its public interface,
 * so the pair is handed to the contract as one object.
 */
runSessionStoreContract(
  (clock) => {
    const docket = new InMemoryDocketStore({ clock });
    return withSessionStore(docket, new InMemorySessionStore(docket));
  },
  { api: { describe, it, expect, beforeAll, afterAll } },
);
