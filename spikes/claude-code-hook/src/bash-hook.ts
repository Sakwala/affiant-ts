#!/usr/bin/env node
/**
 * `affiant-hook-bash` — the `PreToolUse` bin for shell commands.
 *
 * It reviews nothing, and that is the point. `affiant-hook` can swear a `Write` or
 * an `Edit` because those arrive as named fields; a shell command that writes to a
 * file arrives as one opaque string.
 *
 * So it declares its coverage rather than guessing at it, in three tiers:
 *
 * - a **known write shape** — `>`, `2>`, `tee`, `sed -i`, `rm`, `curl -o`,
 *   `node -e "…writeFileSync…"` and the rest — is **denied**, with the reason
 *   naming what it matched;
 * - a **read-only allowlist** — `ls`, `cat`, `grep`, `git status`, `pnpm test`
 *   and a handful more, with no redirection and no command substitution — is
 *   passed through with no output, leaving Claude Code's own permission flow
 *   exactly as it was;
 * - **everything else** is neither, so it is handed to the person: `ask`.
 *
 * That third tier is what makes the claim true. The earlier version had only the
 * first two, so a command it did not recognise left no output — which reads as
 * "checked and fine" and actually meant "never looked at", and let `npm test
 * 2>err.log`, `perl -pi`, `dd of=`, `truncate`, `chmod` and a dozen more past.
 *
 * `AFFIANT_HOOK_BASH=allow-unknown` turns the third tier back into silence. It
 * weakens the guarantee, which is why it has to be asked for by name.
 */
import { refusalRequest } from "./affidavit.js";
import { classifyCommand, refusalReason, UNKNOWN_REASON } from "./coverage.js";
import { COVERAGE_REFUSED, Docket } from "./docket.js";
import { parseHookInput } from "./protocol.js";
import { answer, bashMode, failClosed, readStdin } from "./runtime.js";
import type { PermissionDecision } from "./protocol.js";

/** The tools whose `tool_input.command` this bin classifies. */
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

/** Files the refusal on the docket, then tells Claude Code what it decided. */
function refuse(decision: PermissionDecision, reason: string): never {
  new Docket().block(refusalRequest(reason), COVERAGE_REFUSED, reason);
  answer(decision, reason);
}

async function main(): Promise<void> {
  const input = parseHookInput(await readStdin());
  if (input === null) {
    failClosed("stdin was not a JSON object; refusing to let the command through unreviewed");
  }

  if (input.tool_name === undefined || !SHELL_TOOLS.has(input.tool_name)) process.exit(0);

  const mode = bashMode();
  const toolInput = input.tool_input;
  const command =
    typeof toolInput === "object" && toolInput !== null
      ? (toolInput as { command?: unknown }).command
      : undefined;

  if (typeof command !== "string") {
    // A shell call whose command this cannot even read is the case for refusing.
    refuse(
      "deny",
      "coverage refused: this hook could not read the command out of the tool call, so it has " +
        "not reviewed it.",
    );
  }

  const coverage = classifyCommand(command);

  // Read-only and nothing else: no output, so the normal permission flow decides.
  if (coverage.tier === "read-only") process.exit(0);

  if (coverage.tier === "writes") refuse("deny", refusalReason(coverage.matched));

  if (mode === "allow-unknown") process.exit(0);
  refuse("ask", `coverage refused: ${UNKNOWN_REASON}`);
}

main().catch((cause: unknown) => {
  failClosed(cause instanceof Error ? cause.message : String(cause));
});
