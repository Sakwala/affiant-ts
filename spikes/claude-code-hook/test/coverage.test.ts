import { describe, expect, it } from "vitest";

import { classifyCommand, refusalReason } from "../src/coverage.js";
import { runBin } from "./harness.js";

describe("classifyCommand", () => {
  it.each([
    ["echo hi > notes.txt", "output redirection (> or >>)"],
    ["cat a >> b", "output redirection (> or >>)"],
    ["echo hi | tee /etc/hosts", "tee"],
    ["sed -i 's/a/b/' file.ts", "in-place sed"],
    ["sed -i.bak 's/a/b/' file.ts", "in-place sed"],
    ["rm -rf build", "rm"],
    ["mv a b", "mv"],
    ["cp a b", "cp"],
    ["git push origin main", "git push"],
    ["git -C /repo push", "git push"],
    ["npm publish --access public", "npm publish"],
  ])("sees %s as a write", (command, expected) => {
    const coverage = classifyCommand(command);
    expect(coverage.writes).toBe(true);
    expect(coverage.matched).toContain(expected);
  });

  it.each([
    "ls -la",
    "npm test",
    "git status",
    "grep -rn TODO src",
    // fd duplication redirects a stream into another stream, not into a file.
    "npm test 2>&1",
    "node build.js >&2",
    // Substrings of the command names are not the command names.
    "npm run remove-junk",
    "./scripts/copyright.sh",
    "git pushd",
  ])("leaves %s to the normal permission flow", (command) => {
    expect(classifyCommand(command)).toEqual({ writes: false, matched: [] });
  });

  it("over-refuses rather than under-refuses when a write shape appears inside quotes", () => {
    // Deciding what a shell would treat as a quote is the analysis this hook is
    // declining to do, so this is the correct failure: a person clicks once more.
    expect(classifyCommand('echo "a > b"').writes).toBe(true);
  });

  it("names every shape it matched, so the refusal says what it saw", () => {
    const coverage = classifyCommand("rm old.txt && echo new > new.txt");
    expect(coverage.matched).toEqual(["output redirection (> or >>)", "rm"]);
    expect(refusalReason(coverage.matched)).toContain("coverage refused");
    expect(refusalReason(coverage.matched)).toContain("rm");
  });
});

describe("affiant-hook-bash", () => {
  it("denies a shell write, saying it did not inspect it", async () => {
    const result = await runBin("bash-hook.js", {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo broken > src/index.ts" },
    });

    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    });
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(
      "cannot inspect a shell write field-by-field",
    );
  });

  it("raises the permission prompt instead when AFFIANT_HOOK_BASH=ask", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
      { AFFIANT_HOOK_BASH: "ask" },
    );

    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("says nothing at all about a command with no write shape", async () => {
    const result = await runBin("bash-hook.js", {
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("says nothing about a tool that is not a shell", async () => {
    const result = await runBin("bash-hook.js", {
      tool_name: "Read",
      tool_input: { file_path: "/tmp/a.ts" },
    });

    expect(result.stdout).toBe("");
  });

  it("covers PowerShell too, since Windows routes shell calls through it", async () => {
    const result = await runBin("bash-hook.js", {
      tool_name: "PowerShell",
      tool_input: { command: "Get-Content a.txt > b.txt" },
    });

    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("fails closed on stdin that is not JSON", async () => {
    const result = await runBin("bash-hook.js", "not json at all");

    // Exit 2 is the only code that blocks whatever else happens; every other
    // non-zero code lets the tool call proceed.
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a JSON object");
  });
});
