/**
 * The bin, end to end: a real `PreToolUse` payload on stdin, a real loopback
 * server, a real decision posted to it, and the JSON Claude Code would read.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DocketEntry } from "../src/docket.js";
import { spawnBin } from "./harness.js";

let home: string;
let workspace: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "affiant-hook-home-"));
  workspace = mkdtempSync(join(tmpdir(), "affiant-hook-work-"));
});

afterEach(() => {
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

function writePayload(filePath: string, content: string): unknown {
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("affiant-hook", () => {
  it("serves the card, waits, and allows once a person approves", async () => {
    const target = join(workspace, "new-file.ts");
    const run = spawnBin("hook.js", writePayload(target, "export const a = 1;\n"), env());

    const url = await run.url();
    const docketId = await run.docketId();

    // The page a person lands on carries the element and the docket id.
    const page = await fetch(url);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<affiant-evidence-card");
    expect(html).toContain(docketId);

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
  });

  it("denies an amendment it cannot apply rather than dropping it", async () => {
    const target = join(workspace, "preview-amend.ts");
    writeFileSync(target, "const port = 3000;\n", "utf8");

    const run = spawnBin(
      "hook.js",
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {
          file_path: target,
          old_string: "const port = 3000;",
          new_string: "const port = 8080;",
        },
      },
      env(),
    );
    const url = await run.url();
    const docketId = await run.docketId();

    // `preview` is a rendering of the change, not a parameter of the call.
    await post(url, docketId, { decision: "amend", amendments: { preview: "@@ nonsense @@" } });

    const result = await run.done;
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("preview");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(
      "not a parameter of the Edit call",
    );
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

  it("refuses a payload whose shape it cannot swear", async () => {
    const result = await spawnBin(
      "hook.js",
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: 42 } },
      env(),
    ).done;

    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain("coverage refused");
  });

  it("fails closed on stdin that is not JSON", async () => {
    const result = await spawnBin("hook.js", "}{", env()).done;
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a JSON object");
  });
});
