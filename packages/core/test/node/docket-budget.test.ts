import { describe, expect, it } from "vitest";

import { newEntry } from "../../src/docket/entry.js";
import { InMemoryDocketStore } from "../../src/docket/memory.js";
import type { Scope } from "../../src/docket/store.js";

import { affidavit, stubClock } from "../docket-support.js";

/**
 * RT-2 — the per-request path fits a serverless isolate's budget.
 *
 * This is a **regression tripwire, not a benchmark**. The bound is deliberately far
 * above anything a correct implementation approaches, because what it is defending
 * against is a *shape* change — an accidental scan of the whole tenant inside a
 * transition, a copy of every row on every read, an O(n^2) list — not a few
 * microseconds of drift. A number tight enough to be a benchmark would fail on a
 * loaded CI runner and teach everyone to ignore it.
 *
 * The rulebook's reference target is the Cloudflare Workers ceiling: 30 s of CPU per
 * request. The v0.1 design asks for the file-plus-decide path on a ten-field
 * Affidavit to stay well under 100 ms; this asserts an average under 5 ms over a
 * thousand iterations, which a linear implementation clears by three orders of
 * magnitude and a quadratic one does not.
 *
 * Node-only: timing on the workerd and Bun CI runners is noisier, and a tripwire
 * that flaps is a tripwire that gets deleted.
 */
const TENANT: Scope = { tenantId: "tenant-a" };
const NOON = "2026-09-04T09:00:00.000Z";
const ITERATIONS = 1000;
const BUDGET_MS = 5;

const TEN_FIELDS = [
  "status",
  "amount",
  "currency",
  "recipient",
  "reference",
  "dueDate",
  "category",
  "note",
  "approver",
  "project",
];

describe("the per-request path stays inside its budget (RT-2)", () => {
  it("files and decides a ten-field Affidavit well under the bound, a thousand times", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    const sworn = affidavit(TEN_FIELDS);
    expect(sworn.fields).toHaveLength(10);

    const started = performance.now();
    for (let index = 0; index < ITERATIONS; index += 1) {
      const entryId = `entry-${index}`;
      await store.file(
        newEntry({
          entryId,
          tenantId: TENANT.tenantId,
          conversationId: "conv-1",
          channel: "chat",
          affidavit: sworn,
          requirement: "ReviewerConfirmation",
          filedAt: NOON,
          expiresAt: "2026-09-04T09:30:00.000Z",
        }),
      );
      await store.transition(entryId, TENANT, "pending", {
        status: "approved",
        decision: { kind: "approve", reason: null, at: NOON },
        attestation: { by: { kind: "member", id: "person-7" }, at: NOON, entryId },
      });
    }
    const perOperation = (performance.now() - started) / (ITERATIONS * 2);

    expect(perOperation).toBeLessThan(BUDGET_MS);
  });

  it("does not slow down as the Docket grows, which is what a scan would look like", async () => {
    const store = new InMemoryDocketStore({ clock: stubClock(NOON) });
    const sworn = affidavit(TEN_FIELDS);

    /** Milliseconds to file and decide `count` entries, starting at `offset`. */
    async function pass(offset: number, count: number): Promise<number> {
      const started = performance.now();
      for (let index = offset; index < offset + count; index += 1) {
        const entryId = `entry-${index}`;
        await store.file(
          newEntry({
            entryId,
            tenantId: TENANT.tenantId,
            conversationId: "conv-1",
            channel: "chat",
            affidavit: sworn,
            requirement: "ReviewerConfirmation",
            filedAt: NOON,
            expiresAt: "2026-09-04T09:30:00.000Z",
          }),
        );
        await store.transition(entryId, TENANT, "pending", { status: "approved" });
      }
      return performance.now() - started;
    }

    await pass(0, 500);
    const early = await pass(500, 500);
    await pass(1000, 3000);
    const late = await pass(4000, 500);

    // Generous: a per-row scan over a Docket eight times larger would not fit in this.
    expect(late).toBeLessThan(early * 8 + 50);
  });
});
