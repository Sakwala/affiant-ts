#!/usr/bin/env node
/**
 * `affiant-hook-bash` — the `PreToolUse` bin for shell commands.
 *
 * It reviews nothing, and that is the point. `affiant-hook` can swear a `Write` or
 * an `Edit` because those arrive as named fields; a shell command that writes to a
 * file arrives as one opaque string. So when this sees a command shaped like a
 * write, it says so and declines, rather than approving a change it has not read.
 *
 * Set `AFFIANT_HOOK_BASH=ask` to have it raise Claude Code's own permission prompt
 * instead of denying outright — the same refusal, handed to the person rather than
 * to the agent.
 *
 * A command with no write shape in it gets no output at all, so it goes through
 * Claude Code's normal permission flow untouched.
 */
import { classifyCommand, refusalReason } from "./coverage.js";
import { parseHookInput } from "./protocol.js";
import { answer, failClosed, readStdin } from "./runtime.js";

/** The tools whose `tool_input.command` this bin classifies. */
const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

async function main(): Promise<void> {
  const input = parseHookInput(await readStdin());
  if (input === null) {
    failClosed("stdin was not a JSON object; refusing to let the command through unreviewed");
  }

  if (input.tool_name === undefined || !SHELL_TOOLS.has(input.tool_name)) process.exit(0);

  const toolInput = input.tool_input;
  const command =
    typeof toolInput === "object" && toolInput !== null
      ? (toolInput as { command?: unknown }).command
      : undefined;

  if (typeof command !== "string") {
    // A shell call whose command this cannot even read is the case for refusing.
    answer(
      "deny",
      "coverage refused: this hook could not read the command out of the tool call, so it has " +
        "not reviewed it.",
    );
  }

  const coverage = classifyCommand(command);
  if (!coverage.writes) process.exit(0);

  const decision = process.env["AFFIANT_HOOK_BASH"] === "ask" ? "ask" : "deny";
  answer(decision, refusalReason(coverage.matched));
}

main().catch((cause: unknown) => {
  failClosed(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
});
