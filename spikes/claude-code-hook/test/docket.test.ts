import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  rmSync(home, { recursive: true, force: true });
});

const NOW = Date.parse("2026-09-04T09:00:00.000Z");

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

    const first = docket.decide("a", "approve", {}, null, NOW);
    expect(first).toMatchObject({ ok: true });
    expect(docket.read("a", NOW)).toMatchObject({
      status: "approved",
      decidedAt: "2026-09-04T09:00:00.000Z",
      amendments: null,
    });
  });

  it("refuses a second decision, naming the status that beat it", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "approve", {}, null, NOW);

    // Two tabs, two clicks: the second one loses, and the first outcome stands.
    expect(docket.decide("a", "reject", {}, "changed my mind", NOW)).toEqual({
      ok: false,
      status: "approved",
    });
    expect(docket.read("a", NOW)?.status).toBe("approved");
  });

  it("refuses a decision on an id it never filed", () => {
    expect(new Docket(env).decide("ghost", "approve", {}, null, NOW)).toEqual({
      ok: false,
      status: "unknown",
    });
  });

  it("keeps amendments only on an amend, and the note on any decision", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "amend", { content: "mine" }, "swapped the helper", NOW);

    expect(docket.read("a", NOW)).toMatchObject({
      status: "amended",
      amendments: { content: "mine" },
      reason: "swapped the helper",
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
    expect(docket.decide("a", "approve", {}, null, afterDeadline)).toEqual({
      ok: false,
      status: "expired",
    });
  });

  it("still reports an already-decided entry after its deadline passes", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.decide("a", "reject", {}, null, NOW);

    expect(docket.read("a", Date.parse("2026-09-04T10:00:00.000Z"))?.status).toBe("rejected");
  });

  it("keeps entries side by side and lists them", () => {
    const docket = new Docket(env);
    docket.file(request("a", "2026-09-04T09:05:00.000Z"));
    docket.file(request("b", "2026-09-04T09:05:00.000Z"));
    docket.decide("b", "approve", {}, null, NOW);

    expect(docket.list(NOW).map((entry) => [entry.request.docketId, entry.status])).toEqual([
      ["a", "pending"],
      ["b", "approved"],
    ]);
  });
});
