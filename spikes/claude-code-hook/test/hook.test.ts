/**
 * The bin, end to end: a real `PreToolUse` payload on stdin, a real loopback
 * server, a real decision posted to it, and the JSON Claude Code would read.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DocketEntry } from "../src/docket.js";
import { spawnBin } from "./harness.js";

let home: string;
let workspace: string;

/** A directory this process cannot write into is not a thing root can make. */
const asRoot = process.getuid?.() === 0;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "affiant-hook-home-"));
  workspace = mkdtempSync(join(tmpdir(), "affiant-hook-work-"));
});

afterEach(() => {
  try {
    chmodSync(home, 0o755);
  } catch {
    /* it was never made read-only */
  }
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

/** The environment a hook run gets: its own docket, a free port, no browser. */
function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    AFFIANT_HOOK_HOME: home,
    // 0 asks the OS for a free port, so parallel runs never collide.
    AFFIANT_HOOK_PORT: "0",
    AFFIANT_HOOK_OPEN: "never",
    AFFIANT_HOOK_TIMEOUT_MS: "20000",
    ...extra,
  };
}

function writePayload(filePath: string, content: string): Record<string, unknown> {
  return {
    session_id: "test-session",
    transcript_path: "/dev/null",
    cwd: workspace,
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_use_id: "toolu_test",
    tool_input: { file_path: filePath, content },
  };
}

async function post(url: string, docketId: string, body: unknown): Promise<Response> {
  return fetch(`${url}decision/${docketId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function docketEntries(): DocketEntry[] {
  const file = JSON.parse(readFileSync(join(home, "docket.json"), "utf8")) as {
    entries: Record<string, DocketEntry>;
  };
  return Object.values(file.entries);
}

describe("affiant-hook", () => {
  it("serves the card, waits, and allows once a person approves", async () => {
    const target = join(workspace, "new-file.ts");
    const run = spawnBin("hook.js", writePayload(target, "export const a = 1;\n"), env());

    const url = await run.url();
    const docketId = await run.docketId();

    // The address is unguessable: the port is one the OS picked and the path
    // carries a per-run secret, so there is nothing for a page to aim at.
    expect(new URL(url).pathname).toMatch(/^\/[0-9a-f]{32}\/$/);

    // The page a person lands on carries the element and the docket id.
    const page = await fetch(url);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<affiant-evidence-card");
    expect(html).toContain(docketId);
    // And it says which fields it will actually accept an amendment for.
    expect(html).toContain("Only content can be amended here");

    // The element the page loads is really served, not a dead link.
    expect((await fetch(`${url}element/register.js`)).status).toBe(200);

    // The card fetches the entry it is to render.
    const entry = (await (await fetch(`${url}entries/${docketId}`)).json()) as DocketEntry;
    expect(entry.status).toBe("pending");
    expect(entry.request.affidavit.entityId).toBeNull();
    expect(entry.request.affidavit.aggregateConfidence).toBe(0.5);

    expect((await post(url, docketId, { decision: "approve", amendments: {} })).status).toBe(200);

    const result = await run.done;
    expect(result.code).toBe(0);
    expect(result.json).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `Affiant docket ${docketId}: approved by a reviewer.`,
      },
    });
    // Nothing was written: the hook answers, the tool writes.
    expect(() => readFileSync(target, "utf8")).toThrow();
  });

  it("denies with the reviewer's own words when they reject", async () => {
    const run = spawnBin(
      "hook.js",
      writePayload(join(workspace, "nope.ts"), "export const a = 1;\n"),
      env(),
    );
    const url = await run.url();
    const docketId = await run.docketId();

    await post(url, docketId, {
      decision: "reject",
      amendments: {},
      reason: "wrong directory — this belongs in src/lib",
    });

    const result = await run.done;
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(
      "wrong directory — this belongs in src/lib",
    );
  });

  it("returns the reviewer's amendment as updatedInput alongside allow", async () => {
    const target = join(workspace, "amended.ts");
    const run = spawnBin("hook.js", writePayload(target, "export const a = 1;\n"), env());
    const url = await run.url();
    const docketId = await run.docketId();

    await post(url, docketId, {
      decision: "amend",
      amendments: { content: "export const a = 2;\n" },
    });

    const result = await run.done;
    const output = result.json?.hookSpecificOutput;
    expect(output?.permissionDecision).toBe("allow");
    // `updatedInput` replaces the whole input object, so file_path rides along.
    expect(output?.updatedInput).toEqual({
      file_path: target,
      content: "export const a = 2;\n",
    });
    // The row reads `approved` carrying the amendment, not a state of its own.
    expect(docketEntries()[0]).toMatchObject({
      status: "approved",
      amendments: { content: "export const a = 2;\n" },
      execution: "unexecuted",
    });
  });

  it("denies when the window closes with nobody there", async () => {
    const run = spawnBin(
      "hook.js",
      writePayload(join(workspace, "ignored.ts"), "export const a = 1;\n"),
      env({ AFFIANT_HOOK_TIMEOUT_MS: "1500" }),
    );

    const result = await run.done;
    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(
      "approval is never assumed",
    );
  });

  it("denies rather than dying silently when the review is interrupted", async () => {
    const run = spawnBin(
      "hook.js",
      writePayload(join(workspace, "interrupted.ts"), "export const a = 1;\n"),
      env(),
    );
    await run.url();

    // A hook killed mid-review printed nothing, and stdout with nothing in it is
    // a non-blocking error: the tool call proceeds. A cancelled review is not an
    // approval, so it says so and exits 0 with a decision.
    run.child.kill("SIGTERM");

    const result = await run.done;
    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("interrupted");
  });

  it("refuses a second decision on the same entry", async () => {
    const run = spawnBin(
      "hook.js",
      writePayload(join(workspace, "once.ts"), "export const a = 1;\n"),
      env(),
    );
    const url = await run.url();
    const docketId = await run.docketId();

    expect((await post(url, docketId, { decision: "approve", amendments: {} })).status).toBe(200);
    await run.done;

    // The server is gone with the hook, so the guard is checked on the docket file
    // by a second hook process reading the same home.
    const second = spawnBin(
      "hook.js",
      writePayload(join(workspace, "other.ts"), "export const b = 2;\n"),
      env({ AFFIANT_HOOK_TIMEOUT_MS: "1500" }),
    );
    const secondUrl = await second.url();
    // The second run's server only serves its own entry, so the first entry's id
    // is reached through the docket file rather than that server's route.
    const conflict = await post(secondUrl, docketId, { decision: "reject", amendments: {} });
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { status: string }).status).toBe("approved");
    await second.done;
  });

  it("says nothing about a tool it does not review", async () => {
    const result = await spawnBin(
      "hook.js",
      { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/tmp/a" } },
      env(),
    ).done;

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("refuses a payload whose shape it cannot swear, and files the refusal", async () => {
    const result = await spawnBin(
      "hook.js",
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: 42 } },
      env(),
    ).done;

    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("coverage refused");
    // A refusal that left no record would mean the docket could not show what
    // the hook declined to look at.
    expect(docketEntries()[0]).toMatchObject({ status: "blocked", code: "coverage-refused" });
  });

  it("refuses an Edit whose old_string is not in the file", async () => {
    const target = join(workspace, "no-such-string.ts");
    writeFileSync(target, "alpha\nbeta\ngamma\n", "utf8");

    const result = await spawnBin(
      "hook.js",
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        cwd: workspace,
        tool_input: { file_path: target, old_string: "NOT-THERE", new_string: "replacement" },
      },
      env(),
    ).done;

    // The old card swore `previousValue: "NOT-THERE"` — a value the file does not
    // hold — and rendered "(no change)" at confidence 1.00, which a reviewer would
    // reasonably wave through. Neither statement is true, so neither is made.
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("edit 1");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("does not occur");
    expect(docketEntries()[0]).toMatchObject({ status: "blocked", code: "coverage-refused" });
  });

  it("resolves a relative file_path against the payload's cwd and says so on the card", async () => {
    const target = join(workspace, "already-here.ts");
    writeFileSync(target, "export const a = 1;\n", "utf8");

    const run = spawnBin(
      "hook.js",
      { ...writePayload("already-here.ts", "export const a = 2;\n") },
      env(),
    );
    const url = await run.url();
    const docketId = await run.docketId();
    const entry = (await (await fetch(`${url}entries/${docketId}`)).json()) as DocketEntry;

    // Resolved against the hook process's own cwd this would have read as a
    // create, with no "every byte not in the proposal is being dropped" warning.
    expect(entry.request.affidavit.operationType).toBe("update");
    expect(entry.request.affidavit.entityId).toBe(target);
    // warnings moved from the affidavit onto the card envelope in v0.1 (SR-1).
    const warnings = (entry.request.warnings ?? []).join(" ");
    expect(warnings).toContain("not the absolute path");
    expect(warnings).toContain("whole-file write");

    run.child.kill("SIGKILL");
    await run.done;
  });

  it("fails closed on stdin that is not JSON", async () => {
    const result = await spawnBin("hook.js", "}{", env()).done;
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a JSON object");
  });

  it("fails closed on a docket file that will not parse, and leaves it untouched", async () => {
    const docket = join(home, "docket.json");
    writeFileSync(docket, "{ this is not json", "utf8");

    const result = await spawnBin("hook.js", writePayload(join(workspace, "x.ts"), "x"), env())
      .done;

    // Reading it as empty and saving over it destroyed every decision it held.
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not valid JSON");
    expect(readFileSync(docket, "utf8")).toBe("{ this is not json");
  });

  it.skipIf(asRoot)(
    "exits 2 rather than hanging when the docket home cannot be written",
    async () => {
      chmodSync(home, 0o555);

      const started = Date.now();
      const result = await spawnBin("hook.js", writePayload(join(workspace, "x.ts"), "x"), env())
        .done;

      // The old lock loop swallowed every errno and retried, so this hung until
      // Claude Code cancelled it — and a cancelled hook's output is discarded, which
      // is a gate that turned itself off after burning the whole timeout.
      expect(result.code).toBe(2);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(result.stderr).toMatch(/docket/);
    },
  );

  it("exits 2 rather than hanging when the docket home cannot be created", async () => {
    // A parent that is a file, not a directory: `mkdir -p` cannot make this, and
    // no amount of retrying will ever change that.
    const blocked = join(workspace, "not-a-directory");
    writeFileSync(blocked, "", "utf8");

    const started = Date.now();
    const result = await spawnBin(
      "hook.js",
      writePayload(join(workspace, "x.ts"), "x"),
      env({ AFFIANT_HOOK_HOME: join(blocked, "home") }),
    ).done;

    expect(result.code).toBe(2);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("makes progress past a lock left behind by a hook that died", async () => {
    mkdirSync(join(home, "docket.json.lock"));

    const run = spawnBin(
      "hook.js",
      writePayload(join(workspace, "after-stale-lock.ts"), "x"),
      env({ AFFIANT_HOOK_LOCK_MS: "200" }),
    );
    const url = await run.url();
    const docketId = await run.docketId();

    expect((await post(url, docketId, { decision: "approve" })).status).toBe(200);
    expect((await run.done).json?.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("fails closed on a setting it cannot read", async () => {
    const result = await spawnBin(
      "hook.js",
      writePayload(join(workspace, "x.ts"), "x"),
      env({ AFFIANT_HOOK_TIMEOUT_MS: "soon" }),
    ).done;

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("AFFIANT_HOOK_TIMEOUT_MS");
  });
});

describe("affiant-hook-outcome", () => {
  it("stamps an approved row with what became of the write", async () => {
    const target = join(workspace, "stamped.ts");
    const run = spawnBin("hook.js", writePayload(target, "export const a = 1;\n"), env());
    const url = await run.url();
    const docketId = await run.docketId();
    await post(url, docketId, { decision: "approve" });
    await run.done;

    expect(docketEntries()[0]?.execution).toBe("unexecuted");

    await spawnBin(
      "outcome-hook.js",
      {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_use_id: "toolu_test",
        tool_input: { file_path: target, content: "export const a = 1;\n" },
        tool_response: { filePath: target, success: true },
      },
      env(),
    ).done;

    // An approved-but-failed write must be distinguishable from an
    // approved-and-committed one on the row.
    expect(docketEntries()[0]?.execution).toBe("executed");
  });

  it("stamps a failure as failed, not as executed", async () => {
    const target = join(workspace, "failed.ts");
    const run = spawnBin("hook.js", writePayload(target, "x"), env());
    const url = await run.url();
    const docketId = await run.docketId();
    await post(url, docketId, { decision: "approve" });
    await run.done;

    const result = await spawnBin(
      "outcome-hook.js",
      {
        hook_event_name: "PostToolUseFailure",
        tool_name: "Write",
        tool_use_id: "toolu_test",
        tool_input: { file_path: target, content: "x" },
        error: "EACCES: permission denied",
      },
      env(),
    ).done;

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(docketEntries()[0]?.execution).toBe("failed");
  });

  it("says nothing about a tool it never filed", async () => {
    const result = await spawnBin(
      "outcome-hook.js",
      { hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "toolu_other" },
      env(),
    ).done;

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
