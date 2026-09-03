import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../../src/docket/memory.js";
import { createGate } from "../../src/gate/gate.js";
import type { PreparedField } from "../../src/gate/pipeline.js";
import type { Operation } from "../../src/ports.js";
import { chainOf, mintTag } from "../../src/model/provenance.js";
import {
  allowlistAuthorization,
  entityProjection,
  fixedClock,
  scriptedInference,
} from "../../src/testing.js";

/**
 * RT-2 — the **whole per-request path** fits a serverless isolate's budget: a
 * proposal through the pipeline and a decision through the guarded transition, on a
 * ten-field Affidavit, a thousand times.
 *
 * A companion to `docket-budget.test.ts`, which measures the store alone. This one
 * measures what a host actually pays per request: the interceptor and inference
 * steps, the merge, the projection, the Affidavit build with its three numbers, the
 * substance gate, the policy chain, the derived entry id (a SHA-256 through Web
 * Crypto), the filing, then the authorization checks, the amendment application with
 * its recompute, and the compare-and-set.
 *
 * It is a **regression tripwire, not a benchmark**. The bound is far above anything a
 * correct implementation approaches, because what it defends against is a shape
 * change — an accidental scan, a copy of every row per request, a hash of the whole
 * Docket — not microseconds of drift. A bound tight enough to be a benchmark would
 * flap on a loaded runner and teach everyone to ignore it.
 *
 * The rulebook's reference target is the Cloudflare Workers ceiling of 30 s of CPU
 * per request, and the v0.1 design asks the file-plus-decide path on a ten-field
 * Affidavit to stay well under 100 ms. This asserts an average under
 * {@link BUDGET_MS} and prints what it measured, so a reviewer reading CI sees the
 * real number rather than only that it passed.
 *
 * Node-only: timing on the workerd and Bun runners is noisier, and a tripwire that
 * flaps is a tripwire that gets deleted.
 */
const NOON = "2026-09-04T09:00:00.000Z";
const ITERATIONS = 1000;

/** The stated bound: the average of one file plus one decide, in milliseconds. */
const BUDGET_MS = 20;

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
] as const;

/** Ten host-tagged fields — the shape a relay capture arrives in. */
function tenFields(): PreparedField[] {
  return TEN_FIELDS.map((name) => ({
    name,
    kind: "text" as const,
    value: `${name}-value`,
    isMandatory: true,
    provenance: chainOf(mintTag({ source: "Conversation", confidence: 0.9, at: NOON })),
  }));
}

describe("the per-request gate path stays inside its budget (RT-2)", () => {
  it(`files and decides a ten-field Affidavit under ${String(BUDGET_MS)} ms, a thousand times`, async () => {
    const clock = fixedClock(NOON);
    const gate = createGate({
      store: new InMemoryDocketStore({ clock }),
      inference: scriptedInference(null),
      projection: entityProjection({}),
      authorization: allowlistAuthorization({ allow: ["*"] }),
      policies: [],
      clock,
      defaultTtlMs: 30 * 60 * 1000,
    });
    const ctx = {
      tenantId: "tenant-a",
      conversationId: "conv-1",
      channel: "chat" as const,
      principal: { kind: "member" as const, id: "ana" },
      turn: { utterance: "Pay the supplier", messageId: "msg-1", at: NOON },
    };
    const fields = tenFields();

    const started = performance.now();
    for (let index = 0; index < ITERATIONS; index += 1) {
      const operation: Operation = {
        kind: "update",
        entityType: "Invoice",
        entityId: `invoice-${String(index)}`,
        fields: [...TEN_FIELDS],
      };
      const filed = await gate.file({ operation, toolName: "update_invoice", fields }, ctx);
      expect(filed.entry.affidavit.fields).toHaveLength(10);
      await gate.decide(filed.entry.entryId, { kind: "approve" }, ctx);
    }
    const elapsed = performance.now() - started;
    const perRequest = elapsed / ITERATIONS;

    // Printed, not only asserted: a tripwire whose measurement nobody can see is a
    // tripwire that silently drifts up to just under its bound.
    console.log(
      `RT-2: file + decide on a ten-field Affidavit averaged ${perRequest.toFixed(3)} ms ` +
        `over ${String(ITERATIONS)} iterations (bound ${String(BUDGET_MS)} ms, ` +
        `${elapsed.toFixed(0)} ms total)`,
    );

    expect(perRequest).toBeLessThan(BUDGET_MS);
  });
});
