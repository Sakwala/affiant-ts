/**
 * The shell bin's coverage declaration.
 *
 * The tables below are the review's own probe set: the twenty commands of the
 * original brief, and the "beyond the brief" list of writes that the previous
 * pattern-only classifier let through with no output at all. Every one of them is
 * asserted here, because a coverage claim is only worth what its counter-examples
 * say about it.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { classifyCommand, refusalReason, UNKNOWN_REASON } from "../src/coverage.js";
import type { DocketEntry } from "../src/docket.js";
import { runBin } from "./harness.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "affiant-bash-home-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/**
 * The brief's ten writes. Every one is denied: the tenth,
 * `python -c "open('f','w')"`, is the one the earlier classifier missed.
 */
const BRIEF_WRITES = [
  ["echo x > f", "output redirection (>, >>, 1>, 2>, 2>>, &>, exec 3>)"],
  ["tee f", "tee"],
  ["sed -i s/a/b/ f", "in-place sed"],
  ["rm -rf /tmp/x", "rm"],
  ["mv a b", "mv"],
  ["cp a b", "cp"],
  ["git push", "git push"],
  ["npm publish", "npm/pnpm/yarn publish"],
  ["cat <<EOF > f", "output redirection (>, >>, 1>, 2>, 2>>, &>, exec 3>)"],
  ["python -c \"open('f','w')\"", "python one-liner that opens a file for writing"],
] as const;

/**
 * Every write in the review's "beyond the brief" table, each of which the earlier
 * classifier passed through in silence. The tier-one list covers most of
 * them outright; the rest are unclassifiable by name alone and land in `unknown`,
 * which asks. Neither tier lets a write through.
 */
const BEYOND_THE_BRIEF_DENIED = [
  "npm test 2>err.log",
  "npm test 1>out.txt",
  "npm test &>all.log",
  "npm test >&all.log",
  "cat a 2>>err.log",
  "node build.js 1>build.out 2>build.err",
  "exec 3>f",
  "dd if=/dev/zero of=/tmp/f",
  "truncate -s 0 f",
  "install -m 755 a b",
  "ln -s a b",
  "chmod 777 f",
  "chown me f",
  "touch newfile",
  "perl -pi -e s/a/b/ f",
  "python3 -c \"open('f','w').write('x')\"",
  "node -e \"require('fs').writeFileSync('f','x')\"",
  "git reset --hard",
  "git clean -fd",
  "curl -o out.txt https://x",
  "wget https://x",
  "tar -xf a.tar",
  "unzip a.zip",
  "patch -p1 < d.patch",
  "find . -delete",
] as const;

/**
 * The rest of that table. None of them is on the tier-one list — naming every
 * write-capable program on a machine is the enumeration this file declines — so
 * they are `unknown` and the person is asked. Not refused, and never silent.
 */
const BEYOND_THE_BRIEF_ASKED = [
  "mkdir -p x",
  "rmdir x",
  "git commit -am x",
  "git checkout .",
  "gh pr create",
  "docker run -v /:/host img",
] as const;

/** The brief's non-writes that the read-only allowlist covers, so nothing is printed. */
const READ_ONLY = [
  "ls",
  "cat f",
  "grep -r foo .",
  "git status",
  "git diff",
  'node -e "console.log(1)"',
  "dotnet test",
  "pnpm test",
  // fd duplication redirects a stream into another stream, not into a file.
  "npm test 2>&1",
  "ls 2>&1 | grep x",
  "npm run remove-junk",
  "ls -la",
  "git log --oneline -5",
  "pnpm -C packages/core test",
  "wc -l src/index.ts",
  "pwd",
  "env",
  "which node",
  "date",
  "find . -name '*.ts'",
] as const;

describe("classifyCommand — tier one, a write shape this file knows", () => {
  it.each(BRIEF_WRITES)("denies %s", (command, expected) => {
    const coverage = classifyCommand(command);
    expect(coverage.tier).toBe("writes");
    expect(coverage.matched).toContain(expected);
  });

  it.each(BEYOND_THE_BRIEF_DENIED)(
    "denies %s, which the pattern-only version allowed",
    (command) => {
      expect(classifyCommand(command).tier).toBe("writes");
    },
  );

  it.each([
    "sudo rm /etc/x",
    "xargs rm < list",
    ": > f",
    "echo hi >> log.txt",
    "cat a >| b",
    "printf x | tee -a f",
    "ls > /dev/null 2>&1",
    "sed -i.bak 's/a/b/' file.ts",
    "echo hi | tee /etc/hosts",
    "git -C /repo push",
    "npm publish --access public",
    "git restore src/index.ts",
    "git checkout -- src/index.ts",
    "rsync -a src/ dst/",
    "find . -name '*.log' -exec rm {} +",
  ])("denies %s", (command) => {
    expect(classifyCommand(command).tier).toBe("writes");
  });

  it.each(['echo "a > b"', "echo 'x > y'", 'git commit -m "fix > bug"', "grep -n 'a>b' file"])(
    "over-refuses %s on purpose rather than parsing the quoting",
    (command) => {
      // Deciding what a shell would treat as a quote is the analysis this hook is
      // declining to do, so this is the correct failure: a person clicks once more.
      expect(classifyCommand(command).tier).toBe("writes");
    },
  );

  it("names every shape it matched, so the refusal says what it saw", () => {
    const coverage = classifyCommand("rm old.txt && echo new > new.txt");
    expect(coverage.matched).toEqual([
      "output redirection (>, >>, 1>, 2>, 2>>, &>, exec 3>)",
      "rm",
    ]);
    expect(refusalReason(coverage.matched)).toContain("coverage refused");
    expect(refusalReason(coverage.matched)).toContain("rm");
  });
});

describe("classifyCommand — tier two, the read-only allowlist", () => {
  it.each(READ_ONLY)("passes %s through untouched", (command) => {
    expect(classifyCommand(command)).toEqual({ tier: "read-only", matched: [] });
  });
});

describe("classifyCommand — tier three, everything else", () => {
  it.each(BEYOND_THE_BRIEF_ASKED)("asks about %s", (command) => {
    expect(classifyCommand(command).tier).toBe("unknown");
  });

  it.each([
    // Reads the allowlist does not vouch for: not refused, but not waved through.
    "curl -s https://example.com",
    "./scripts/copyright.sh",
    "git pushd",
    "node build.js >&2",
    "gitpush",
    "recap",
    "make",
    "psql -c 'select 1'",
    // An allowlisted program behind something that can run anything else.
    "sudo ls",
    "eval ls",
    "xargs ls",
    "$(ls)",
    "ls `whoami`",
    "env FOO=bar ls",
    // An allowlisted program used in a way the allowlist does not cover.
    "find . -exec cat {} ;",
    "node build.js",
    "git worktree add x",
    "dotnet publish -c Release",
  ])("asks about %s", (command) => {
    expect(classifyCommand(command).tier).toBe("unknown");
  });

  it("never claims a command is read-only when it cannot see all of it", () => {
    // Every segment has to be on the allowlist; one that is not sinks the chain.
    expect(classifyCommand("ls && make").tier).toBe("unknown");
    expect(classifyCommand("ls && git status").tier).toBe("read-only");
  });
});

describe("affiant-hook-bash", () => {
  function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return { AFFIANT_HOOK_HOME: home, ...extra };
  }

  function docketEntries(): DocketEntry[] {
    const file = JSON.parse(readFileSync(join(home, "docket.json"), "utf8")) as {
      entries: Record<string, DocketEntry>;
    };
    return Object.values(file.entries);
  }

  it("denies a shell write, saying it did not inspect it", async () => {
    const result = await runBin(
      "bash-hook.js",
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo broken > src/index.ts" },
      },
      env(),
    );

    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    });
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(
      "cannot inspect a shell write field-by-field",
    );
  });

  it("files the refusal on the docket, so the record shows what it declined to read", async () => {
    await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
      env(),
    );

    const entries = docketEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: "blocked", code: "coverage-refused" });
    expect(entries[0]?.request.affidavit.warnings.join(" ")).toContain("rm");
  });

  it("asks about a command it cannot classify either way", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "gh pr create" } },
      env(),
    );

    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(result.json?.hookSpecificOutput.permissionDecisionReason).toContain(UNKNOWN_REASON);
    expect(docketEntries()[0]).toMatchObject({ status: "blocked", code: "coverage-refused" });
  });

  it("passes an unclassified command through when AFFIANT_HOOK_BASH=allow-unknown", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "gh pr create" } },
      env({ AFFIANT_HOOK_BASH: "allow-unknown" }),
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("still denies a known write under allow-unknown", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "rm -rf dist" } },
      env({ AFFIANT_HOOK_BASH: "allow-unknown" }),
    );

    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("fails closed on a setting it cannot read, rather than quietly using the default", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "ls" } },
      env({ AFFIANT_HOOK_BASH: "yes-please" }),
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("AFFIANT_HOOK_BASH");
  });

  it("says nothing at all about a read-only command", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Bash", tool_input: { command: "npm test" } },
      env(),
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("says nothing about a tool that is not a shell", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "Read", tool_input: { file_path: "/tmp/a.ts" } },
      env(),
    );

    expect(result.stdout).toBe("");
  });

  it("covers PowerShell too, since Windows routes shell calls through it", async () => {
    const result = await runBin(
      "bash-hook.js",
      { tool_name: "PowerShell", tool_input: { command: "Get-Content a.txt > b.txt" } },
      env(),
    );

    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("fails closed on stdin that is not JSON", async () => {
    const result = await runBin("bash-hook.js", "not json at all", env());

    // Exit 2 is the only code that blocks whatever else happens; every other
    // non-zero code lets the tool call proceed.
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a JSON object");
  });
});
