import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EvidenceCardRequest } from "@affiant/contract";

import { Docket, docketPath } from "../src/docket.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "affiant-docket-"));
  env = { AFFIANT_HOOK_HOME: home };
});

afterEach(() => {
  try {
    chmodSync(home, 0o755);
  } catch {
    /* it was never made read-only */
  }
  rmSync(home, { recursive: true, force: true });
});

const NOW = Date.parse("2026-09-04T09:00:00.000Z");

/** A directory this process cannot write into is not a thing root can make. */
const asRoot = process.getuid?.() === 0;

function request(id: string, requiredBy: string): EvidenceCardRequest {
  return {
    docketId: id,
    affidavit: {
      operationType: "FileCreate",
      entityType: "file",
      entityId: null,
      fields: [],
      aggregateConfidence: 0.5,
      warnings: [],
      requiresConfirmation: true,
    },
    requiredBy,
    priorAmendments: null,
  };
}

describe("Docket", () => {
  it("files a proposal as pending under the configured home", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));

    expect(docket.path).toBe(docketPath(env));
    expect(docket.path.startsWith(home)).toBe(true);
    expect(docket.read("a", NOW)?.status).toBe("pending");
    // The file on disk is the shared truth, not the instance's memory.
    expect(JSON.parse(readFileSync(docket.path, "utf8"))).toMatchObject({ version: 1 });
  });

  it("reads an id it never filed as null", () => {
    expect(new Docket(env).read("never-filed", NOW)).toBeNull();
  });

  it("moves a pending entry to exactly one terminal state", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));

    const first = docket.decide("a", "approve", {}, null, null, NOW);
    expect(first).toMatchObject({ ok: true });
    expect(docket.read("a", NOW)).toMatchObject({
      status: "approved",
      decidedAt: "2026-09-04T09:00:00.000Z",
      amendments: null,
      // An approved write is not a finished one until something says so.
      execution: "unexecuted",
    });
  });

  it("refuses a second decision, naming the status that beat it", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "approve", {}, null, null, NOW);

    // Two tabs, two clicks: the second one loses, and the first outcome stands.
    expect(docket.decide("a", "reject", {}, "changed my mind", null, NOW)).toEqual({
      ok: false,
      status: "approved",
    });
    expect(docket.read("a", NOW)?.status).toBe("approved");
  });

  it("refuses a decision on an id it never filed", () => {
    expect(new Docket(env).decide("ghost", "approve", {}, null, null, NOW)).toEqual({
      ok: false,
      status: "unknown",
    });
  });

  it("carries an amendment on the approval rather than inventing a state for it", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "amend", { content: "mine" }, "swapped the helper", "127.0.0.1 tests", NOW);

    // A row goes pending → approved | rejected | expired. An amendment is data
    // on an approval, not a fourth terminal state.
    expect(docket.read("a", NOW)).toMatchObject({
      status: "approved",
      amendments: { content: "mine" },
      reason: "swapped the helper",
      decidedBy: "127.0.0.1 tests",
    });
  });

  it("records who decided, so the row can be read back afterwards", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "approve", {}, null, "127.0.0.1 Mozilla/5.0", NOW);

    expect(docket.read("a", NOW)?.decidedBy).toBe("127.0.0.1 Mozilla/5.0");
  });

  it("keeps the amendments of a decision that arrived after the window closed", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));

    const late = Date.parse("2026-09-04T09:06:00.000Z");
    expect(docket.decide("a", "amend", { content: "typed too late" }, null, null, late)).toEqual({
      ok: false,
      status: "expired",
    });
    // A late decision is refused, and what it carried is preserved on the row
    // for resubmission rather than thrown away with it.
    expect(docket.read("a", late)).toMatchObject({
      status: "expired",
      amendments: { content: "typed too late" },
    });
  });

  it("reads a lapsed pending entry as expired without anything having swept it", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));

    const afterDeadline = Date.parse("2026-09-04T09:05:00.001Z");
    expect(docket.read("a", afterDeadline)?.status).toBe("expired");
    // Expiry is a projection through the clock: nothing rewrote the file.
    expect(JSON.parse(readFileSync(docket.path, "utf8")).entries.a.status).toBe("pending");
  });

  it("refuses to decide an entry whose window has closed", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));

    const afterDeadline = Date.parse("2026-09-04T09:06:00.000Z");
    expect(docket.decide("a", "approve", {}, null, null, afterDeadline)).toEqual({
      ok: false,
      status: "expired",
    });
  });

  it("still reports an already-decided entry after its deadline passes", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "reject", {}, null, null, NOW);

    expect(docket.read("a", Date.parse("2026-09-04T10:00:00.000Z"))?.status).toBe("rejected");
  });

  it("keeps entries side by side and lists them", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.file(request("b", "2026-09-04T09:05:00.000Z"));
    docket.decide("b", "approve", {}, null, null, NOW);

    expect(docket.list(NOW).map((entry) => [entry.request.docketId, entry.status])).toEqual([
      ["a", "pending"],
      ["b", "approved"],
    ]);
  });

  it("treats a repeated docket id as a replay, never as a reset", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "reject", {}, "no", null, NOW);

    // Filing an id that already exists returns the stored entry's state.
    // Re-filing must not walk a terminal row back to pending.
    const replay = docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    expect(replay.status).toBe("rejected");
    expect(docket.read("a", NOW)?.status).toBe("rejected");
  });

  it("files a coverage refusal as a blocked row rather than leaving no record", () => {
    const docket = new Docket(env);
    docket.block(request("a", "2026-09-04T09:05:00.000Z"), "coverage-refused", "not inspected");

    expect(docket.read("a", NOW)).toMatchObject({
      status: "blocked",
      code: "coverage-refused",
      reason: "not inspected",
    });
  });

  it("stamps what became of an approved write, found by its tool_use_id", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"), { toolUseId: "toolu_1" });
    docket.decide("a", "approve", {}, null, null, NOW);

    expect(docket.stamp("toolu_1", "executed", NOW)?.execution).toBe("executed");
    expect(docket.read("a", NOW)?.execution).toBe("executed");
    // A row that already reads forward is not rewritten by a later stamp.
    expect(docket.stamp("toolu_1", "failed", NOW)?.execution).toBe("executed");
  });

  it("stamps a failure distinguishably from a success", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"), { toolUseId: "toolu_2" });
    docket.decide("a", "approve", {}, null, null, NOW);

    expect(docket.stamp("toolu_2", "failed", NOW)?.execution).toBe("failed");
  });

  it("stamps nothing for a tool_use_id it never filed", () => {
    expect(new Docket(env).stamp("toolu_missing", "executed", NOW)).toBeNull();
  });

  it("refuses to touch a docket file that will not parse", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "reject", {}, "the record that must survive", null, NOW);

    const before = readFileSync(docket.path, "utf8");
    writeFileSync(docket.path, `${before}}}} trailing garbage`, "utf8");

    // Reading it as empty and then saving would rename a fresh file over this one
    // and destroy the decision it holds. A decision, once recorded, is never
    // edited in place.
    expect(() => docket.file(request("b", "2026-09-04T09:05:00.000Z"))).toThrow(/not valid JSON/);
    expect(readFileSync(docket.path, "utf8")).toBe(`${before}}}} trailing garbage`);
  });

  it("rejects a lock setting it cannot read rather than quietly using the default", () => {
    expect(() => new Docket({ ...env, AFFIANT_HOOK_LOCK_MS: "soon" })).toThrow(
      /AFFIANT_HOOK_LOCK_MS/,
    );
  });

  it.skipIf(asRoot)("throws instead of spinning when the docket cannot be written", () => {
    const docket = new Docket(env);
    chmodSync(home, 0o555);

    // Every errno but EEXIST is permanent, so retrying it is an infinite loop —
    // and a hook that spins is cancelled at Claude Code's timeout, whose output is
    // discarded, which turns the gate off with nobody told.
    const started = Date.now();
    expect(() => docket.file(request("a", "2026-09-04T09:05:00.000Z"))).toThrow(
      /could not be taken/,
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("steals a lock older than the deadline, once, and then makes progress", () => {
    const docket = new Docket({ ...env, AFFIANT_HOOK_LOCK_MS: "150" });
    mkdirSync(`${docketPath(env)}.lock`);

    const started = Date.now();
    expect(docket.file(request("a", "2026-09-04T09:05:00.000Z")).status).toBe("pending");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(docket.read("a", NOW)?.status).toBe("pending");
  });
});
