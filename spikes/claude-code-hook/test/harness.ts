/**
 * Spawning the built bins the way Claude Code does: a child process, JSON on
 * stdin, JSON on stdout.
 *
 * The bins are what ships, so the tests exercise the built files rather than the
 * source — which means they need `dist/` to exist. CI builds before it tests; for
 * a bare `pnpm test` this builds on demand, under a lock so two test files racing
 * into it do not run `tsc` over each other.
 */
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PreToolUseHookOutput } from "../src/protocol.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(packageRoot, "dist");

let ensured = false;

/** Builds `dist/` if it is not already there. Idempotent, and safe across workers. */
export function ensureBuilt(): void {
  if (ensured) return;
  const lock = join(packageRoot, ".build.lock");
  const deadline = Date.now() + 180_000;
  for (;;) {
    if (existsSync(join(distDir, "hook.js")) && existsSync(join(distDir, "bash-hook.js"))) {
      ensured = true;
      return;
    }
    try {
      mkdirSync(lock);
    } catch {
      if (Date.now() > deadline) throw new Error("timed out waiting for the spike build");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      continue;
    }
    try {
      const require = createRequire(import.meta.url);
      execFileSync(
        process.execPath,
        [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
        {
          cwd: packageRoot,
          stdio: "inherit",
        },
      );
    } finally {
      rmdirSync(lock);
    }
    ensured = true;
    return;
  }
}

/** What a finished bin left behind. */
export interface BinResult {
  code: number;
  stdout: string;
  stderr: string;
  /** `stdout` parsed, or `null` when the bin printed nothing (or nothing parseable). */
  json: PreToolUseHookOutput | null;
}

/** A bin still running, so a test can drive the review before it answers. */
export interface RunningBin {
  child: ChildProcessWithoutNullStreams;
  done: Promise<BinResult>;
  /** Resolves with the review URL the moment the bin prints it on stderr. */
  url(): Promise<string>;
  /** Resolves with the docket id the moment the bin prints it on stderr. */
  docketId(): Promise<string>;
}

function parse(stdout: string): PreToolUseHookOutput | null {
  const text = stdout.trim();
  if (text === "") return null;
  try {
    return JSON.parse(text) as PreToolUseHookOutput;
  } catch {
    return null;
  }
}

/** Starts one of the built bins with a payload on stdin. */
export function spawnBin(bin: string, stdin: unknown, env: NodeJS.ProcessEnv = {}): RunningBin {
  ensureBuilt();

  const child = spawn(process.execPath, [join(distDir, bin)], {
    env: { ...process.env, AFFIANT_HOOK_OPEN: "never", ...env },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  let stdout = "";
  let stderr = "";
  const watchers: ((text: string) => void)[] = [];

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    for (const watcher of [...watchers]) watcher(stderr);
  });

  child.stdin.end(typeof stdin === "string" ? stdin : JSON.stringify(stdin));

  const done = new Promise<BinResult>((resolveResult, rejectResult) => {
    child.on("error", rejectResult);
    child.on("close", (code) => {
      resolveResult({ code: code ?? -1, stdout, stderr, json: parse(stdout) });
    });
  });

  function waitFor(pattern: RegExp, what: string): Promise<string> {
    return new Promise<string>((resolveMatch, rejectMatch) => {
      const check = (text: string): boolean => {
        const found = pattern.exec(text);
        if (found === null) return false;
        resolveMatch(found[0]);
        return true;
      };
      if (check(stderr)) return;
      const watcher = (text: string): void => {
        if (check(text)) watchers.splice(watchers.indexOf(watcher), 1);
      };
      watchers.push(watcher);
      const timer = setTimeout(() => {
        rejectMatch(new Error(`the hook never printed ${what}; stderr was: ${stderr}`));
      }, 20_000);
      timer.unref();
      void done.then(() => {
        clearTimeout(timer);
        if (!check(stderr)) {
          rejectMatch(new Error(`the hook exited before printing ${what}; stderr was: ${stderr}`));
        }
      });
    });
  }

  return {
    child,
    done,
    // The URL carries the run's secret path prefix, so the whole of it is the
    // address — a bare `http://127.0.0.1:<port>/` reaches nothing.
    url: () => waitFor(/http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\//, "the review URL"),
    docketId: () =>
      waitFor(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, "a docket id"),
  };
}

/** Runs one of the built bins to completion. */
export async function runBin(
  bin: string,
  stdin: unknown,
  env: NodeJS.ProcessEnv = {},
): Promise<BinResult> {
  return spawnBin(bin, stdin, env).done;
}
