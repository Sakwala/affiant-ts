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

/** The review window, from `AFFIANT_HOOK_TIMEOUT_MS`. */
export function timeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["AFFIANT_HOOK_TIMEOUT_MS"];
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** The port to try, from `AFFIANT_HOOK_PORT`. `0` means "any free port". */
export function serverPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["AFFIANT_HOOK_PORT"];
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
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
