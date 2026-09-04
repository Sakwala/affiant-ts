import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { DemoOutcome, DemoResult } from "../src/demo.js";
import { renderTranscript, runDemo } from "../src/demo.js";

/**
 * The sample's five steps, asserted one at a time, and the README's recorded
 * transcript asserted against the run that produced it.
 *
 * The demonstration is only worth publishing if it fails in the direction it claims
 * to: a provider-executed write tool and a write tool with no `execute` must be
 * refused **at wire-up** with their categories named (CV-4, CV-1), and a hosted-MCP
 * write the host declared it cannot cover must reach the Docket `blocked` rather
 * than be quietly allowed (CV-4, AZ-4). A green suite here means a skeptic running
 * `node dist/demo.js` sees what the README says they will.
 *
 * Node-only: the last suite reads `README.md` off disk. The sample runs in the Node
 * job; the runtime-neutral packages are the ones CI also runs on Bun and workerd.
 */

const sampleRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The step numbered `n`, or a failure naming what was there instead. */
function step(result: DemoResult, n: number) {
  const found = result.steps.find((candidate) => candidate.step === n);
  if (found === undefined) throw new Error(`no step ${String(n)} in the run`);
  return found;
}

/** Narrow an outcome to one kind, so a failing test says which kind it got. */
function outcomeOf<K extends DemoOutcome["kind"]>(
  outcome: DemoOutcome,
  kind: K,
): Extract<DemoOutcome, { kind: K }> {
  expect(outcome.kind).toBe(kind);
  return outcome as Extract<DemoOutcome, { kind: K }>;
}

let result: DemoResult;

beforeAll(async () => {
  result = await runDemo();
});

describe("the coverage-refusal sample", () => {
  it("runs five steps and reports them in order", () => {
    expect(result.steps.map((each) => each.step)).toEqual([1, 2, 3, 4, 5]);
    expect(result.at).toBe("2026-09-04T09:00:00.000Z");
  });

  it("files the host-executed write tool's proposal, unblocked (CV-4, GT-6)", () => {
    const first = step(result, 1);
    const filed = outcomeOf(first.outcome, "filed");

    expect(first.toolName).toBe("update_ticket");
    expect(first.coverage).toContain("covered");
    expect(filed.status).toBe("pending");
    expect(filed.blocked).toBeNull();
    // A UUID, because `docketId` is a UUID string on the wire.
    expect(filed.entryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(filed.card).toContain("Ticket TKT-42");
  });

  it("refuses the provider-executed write tool at wire-up (CV-4, CV-1)", () => {
    const second = step(result, 2);
    const refusal = outcomeOf(second.outcome, "refused-at-wire-up");

    expect(second.toolName).toBe("web_search_and_save");
    expect(refusal.code).toBe("coverage-refused");
    expect(refusal.category).toBe("provider-executed");
    expect(refusal.message).toContain("provider-executed");
    // CV-1's other half: the refusal says there is no switch, not "set a flag".
    expect(refusal.message).toContain("no option that turns the gate off");
  });

  it("refuses the write tool with no execute at wire-up (CV-4, CV-1)", () => {
    const third = step(result, 3);
    const refusal = outcomeOf(third.outcome, "refused-at-wire-up");

    expect(third.toolName).toBe("save_draft_locally");
    expect(third.declared).toContain("execute: absent");
    expect(refusal.code).toBe("coverage-refused");
    expect(refusal.category).toBe("no-execute");
    expect(refusal.message).toContain("no-execute");
  });

  it("files the declared hosted-MCP write blocked, on the record (CV-4, AZ-4)", () => {
    const fourth = step(result, 4);
    const blocked = outcomeOf(fourth.outcome, "filed-blocked");

    expect(fourth.toolName).toBe("crm_update_contact");
    // AZ-4: a blocked entry stays `pending`. It is not approved, not rejected, and
    // no decision on it will be accepted.
    expect(blocked.status).toBe("pending");
    expect(blocked.blocked).toEqual({
      code: "coverage-refused",
      category: "hosted-mcp",
      toolName: "crm_update_contact",
    });
    expect(blocked.warning).toContain("declared uncovered");
    expect(blocked.warning).toContain("cannot be approved through the gate");
  });

  it("lets the read tool through untouched", () => {
    const fifth = step(result, 5);
    const read = outcomeOf(fifth.outcome, "read");

    expect(fifth.toolName).toBe("search_tickets");
    expect(fifth.declared).toContain("writeCapable: false");
    expect(read.result).toBe("3 open tickets in tenant-a: TKT-42, TKT-51, TKT-77");
  });

  it("never calls a write tool's own execute (GT-6)", () => {
    expect(result.hostWrites).toBe(0);
    expect(result.summary).toContain("0 host writes executed");
  });

  it("refuses every write-capable tool the gate cannot intercept", () => {
    // The whole claim, in one assertion: of the four write-capable tools, the one
    // the gate can intercept is filed for a person and the other three never get a
    // write. Two are stopped at wire-up; the declared one is on the record, blocked.
    const outcomes = result.steps.map((each) => each.outcome.kind);
    expect(outcomes).toEqual([
      "filed",
      "refused-at-wire-up",
      "refused-at-wire-up",
      "filed-blocked",
      "read",
    ]);
  });

  it("produces the same run twice, which is what makes the transcript recordable", async () => {
    expect(await runDemo()).toEqual(result);
  });
});

describe("the README's recorded transcript", () => {
  /** The fenced block between the transcript markers in `README.md`. */
  function recordedTranscript(): string {
    const readme = readFileSync(join(sampleRoot, "README.md"), "utf8");
    const between = /<!-- transcript:begin -->\s*```text\n([\s\S]*?)```\s*<!-- transcript:end -->/;
    const match = between.exec(readme);
    if (match === null) {
      throw new Error(
        "README.md has no transcript block; it must carry one fenced ```text block " +
          "between <!-- transcript:begin --> and <!-- transcript:end -->",
      );
    }
    return (match[1] ?? "").replace(/\n$/, "");
  }

  it("is exactly what this run prints", () => {
    // The drift guard. Edit the demo and the recorded transcript stops matching, so
    // the README cannot quietly describe a run that no longer happens.
    expect(recordedTranscript()).toBe(renderTranscript(result));
  });

  it("carries every step's number, tool and outcome from the structured result", () => {
    const transcript = recordedTranscript();
    const marker: { readonly [K in DemoOutcome["kind"]]: string } = {
      filed: "FILED - entry",
      "refused-at-wire-up": "REFUSED AT WIRE-UP",
      "filed-blocked": "FILED BLOCKED",
      read: "READ - ",
    };

    for (const each of result.steps) {
      expect(transcript).toContain(`${String(each.step)}. ${each.title}`);
      expect(transcript).toContain(each.toolName);
      expect(transcript).toContain(marker[each.outcome.kind]);
      for (const rule of each.rules) expect(transcript).toContain(rule);
    }
    expect(transcript).toContain(`Summary: ${result.summary}`);
  });
});
