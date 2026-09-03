/**
 * Process plumbing shared by the two bins: reading stdin, reading the environment,
 * opening a browser, and answering Claude Code.
 */
import { spawn } from "node:child_process";

import { hookOutput } from "./protocol.js";
import type { PermissionDecision } from "./protocol.js";
import { DEFAULT_PORT } from "./server.js";

/** How long a reviewer gets by default, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 240_000;

/** Reads the whole of stdin. Returns `""` when nothing is piped in. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The review window, from `AFFIANT_HOOK_TIMEOUT_MS`.
 *
 * A value that cannot be read is an error, not something to quietly replace with
 * the default: a misconfiguration a person can see is worth more than a gate that
 * silently runs on settings they did not choose.
 */
export function timeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["AFFIANT_HOOK_TIMEOUT_MS"];
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `AFFIANT_HOOK_TIMEOUT_MS must be a positive number of milliseconds, not "${raw}"`,
    );
  }
  return parsed;
}

/** The port to try, from `AFFIANT_HOOK_PORT`. `0`, the default, means "any free port". */
export function serverPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["AFFIANT_HOOK_PORT"];
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`AFFIANT_HOOK_PORT must be a port number from 0 to 65535, not "${raw}"`);
  }
  return parsed;
}

/** What the shell bin does with a command it could not classify either way. */
export type BashMode = "ask" | "allow-unknown";

/**
 * How the shell bin treats the `unknown` tier, from `AFFIANT_HOOK_BASH`.
 *
 * `ask` is the default and the honest one. `allow-unknown` passes an
 * unclassified command through with no output, which weakens the guarantee this
 * bin exists to make — see the README.
 */
export function bashMode(env: NodeJS.ProcessEnv = process.env): BashMode {
  const raw = env["AFFIANT_HOOK_BASH"];
  if (raw === undefined || raw === "") return "ask";
  if (raw === "ask" || raw === "allow-unknown") return raw;
  throw new Error(`AFFIANT_HOOK_BASH must be "ask" or "allow-unknown", not "${raw}"`);
}

/**
 * Opens the review page in whatever the platform uses.
 *
 * Best effort by design: a hook that failed because a browser would not start
 * would be a worse hook. The URL is on stderr either way, and Claude Code shows
 * a hook's stderr.
 */
export function openInBrowser(url: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env["AFFIANT_HOOK_OPEN"] === "never") return;
  const [command, args] =
    process.platform === "darwin"
      ? (["open", [url]] as const)
      : process.platform === "win32"
        ? (["cmd", ["/c", "start", "", url]] as const)
        : (["xdg-open", [url]] as const);
  try {
    const child = spawn(command, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {
      /* no opener on this machine; the URL on stderr is the fallback */
    });
    child.unref();
  } catch {
    /* same */
  }
}

/** Prints the decision on stdout and exits 0. Claude Code reads stdout, not the exit code. */
export function answer(
  decision: PermissionDecision,
  reason: string,
  updatedInput?: Record<string, unknown>,
): never {
  process.stdout.write(`${JSON.stringify(hookOutput(decision, reason, updatedInput))}\n`);
  process.exit(0);
}

/**
 * Fails closed.
 *
 * Exit 2 is the only code that blocks a tool call whatever else happens; every
 * other non-zero code is a non-blocking error and the tool proceeds. So a hook
 * that has crashed must exit 2, or a crash silently becomes an approval.
 */
export function failClosed(message: string): never {
  process.stderr.write(`affiant-hook: ${message}\n`);
  process.exit(2);
}
