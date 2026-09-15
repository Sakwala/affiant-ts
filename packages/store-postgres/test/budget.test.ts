import { sampleAffidavit, sampleEntry, stubClock } from "@affiant/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDocketStore } from "../src/store.js";
import type { PostgresDocketStore } from "../src/store.js";
import type { TestDatabase } from "./setup.js";
import { adminReachable, createTestDatabase } from "./setup.js";

/**
 * The budget tripwire.
 *
 * RT-2 pins file-plus-decide on a ten-field Affidavit at under 100 ms on a per-request
 * path. This store is one hop inside that envelope, so its own tripwire is set at
 * **25 ms per operation**, which leaves the network between a host and its database
 * the rest. It is a tripwire and not a benchmark: it is here to fail loudly the day a
 * statement turns into a sequential scan, not to report a number anybody tunes.
 *
 * It measures the local development server, so it is skipped — with a printed reason —
 * where no server answers. A tripwire that fails because nothing is listening teaches
 * people to ignore it.
 *
 * It is retried, for the same reason. The whole workspace's suites share a machine and
 * this one shares a database server with them, so a round that lost the CPU for a
 * moment is scheduling noise and not the thing being watched for. A statement that has
 * turned into a sequential scan fails every attempt; a stall fails one. Each attempt
 * files under a tenant of its own so the retry measures an empty Docket, as the first
 * attempt did.
 */
const ITERATIONS = 200;
/** Milliseconds per operation, above which something has gone structurally wrong. */
const BUDGET_MS = 25;
/** How many attempts a stalled round gets before the tripwire stands. */
const ATTEMPTS = 3;

/** Which attempt this is, so each one files into a Docket of its own. */
let attempt = 0;

let database: TestDatabase | null = null;
let store: PostgresDocketStore | null = null;

const clock = stubClock("2026-09-04T09:00:00.000Z");

beforeAll(async () => {
  if (!(await adminReachable())) {
    console.warn(
      "budget: skipped — no Postgres answered at AFFIANT_PG_ADMIN_URL, so there is nothing to measure",
    );
    return;
  }
  database = await createTestDatabase({ max: 1 });
  store = createPostgresDocketStore({ sql: database.sql, clock });
}, 120_000);

afterAll(async () => {
  if (database !== null) await database.close();
});

describe("file and decide stay inside the store's share of the envelope (RT-2)", () => {
  it(
    `averages under ${BUDGET_MS} ms per operation over ${ITERATIONS} iterations`,
    { timeout: 120_000, retry: ATTEMPTS - 1 },
    async () => {
      if (store === null) {
        expect(database).toBeNull();
        return;
      }

      attempt += 1;
      const scope = { tenantId: `tenant-budget-${attempt}` };
      const affidavit = sampleAffidavit([
        "status",
        "amount",
        "currency",
        "recipient",
        "reference",
        "dueDate",
        "category",
        "note",
        "approver",
        "source",
      ]);
      expect(affidavit.fields).toHaveLength(10);

      // One warm pass, so the measurement is of the statements rather than of the
      // first connection and the first plan.
      await run(store, scope.tenantId, "warm-up", affidavit);

      const started = Date.now();
      for (let index = 0; index < ITERATIONS; index += 1) {
        await run(store, scope.tenantId, `budget-${index}`, affidavit);
      }
      const perOperation = (Date.now() - started) / (ITERATIONS * 2);

      console.info(
        `budget: ${perOperation.toFixed(2)} ms per operation over ${ITERATIONS} rounds ` +
          `(attempt ${attempt} of ${ATTEMPTS})`,
      );
      expect(perOperation).toBeLessThan(BUDGET_MS);
    },
  );
});

/** One file and one decision — the two operations the budget is stated over. */
async function run(
  store: PostgresDocketStore,
  tenantId: string,
  entryId: string,
  affidavit: ReturnType<typeof sampleAffidavit>,
): Promise<void> {
  await store.file(sampleEntry(entryId, { tenantId, affidavit }));
  await store.transition(entryId, { tenantId }, "pending", {
    status: "approved",
    decision: { kind: "approve", reason: null, at: "2026-09-04T09:00:00.000Z" },
    attestation: {
      by: { kind: "member", id: "person-7" },
      at: "2026-09-04T09:00:00.000Z",
      entryId,
    },
  });
}
