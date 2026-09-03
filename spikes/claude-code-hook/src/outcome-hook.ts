#!/usr/bin/env node
/**
 * `affiant-hook-outcome` — the `PostToolUse` / `PostToolUseFailure` bin.
 *
 * An approved write is not a finished write. Without this bin the docket says a
 * person approved a change and then stops, so it cannot answer the question the
 * whole record exists for: did the change actually land? An approved row starts
 * `unexecuted` and ends `executed` or `failed`, so an approved-but-failed write is
 * distinguishable from an approved-and-committed one.
 *
 * The correlation is `tool_use_id`, which both events carry and which
 * `affiant-hook` records on the row when it files the proposal. This bin reopens
 * the docket by that id, stamps the outcome, and says nothing on stdout — there is
 * no decision to make after a tool has already run.
 */
import { Docket } from "./docket.js";
import { parseHookInput } from "./protocol.js";
import { failClosed, readStdin } from "./runtime.js";

/** The tools `affiant-hook` files, and so the only rows this bin can stamp. */
const REVIEWED_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

async function main(): Promise<void> {
  const input = parseHookInput(await readStdin());
  if (input === null) {
    failClosed("stdin was not a JSON object; the docket row could not be stamped");
  }

  if (input.tool_name === undefined || !REVIEWED_TOOLS.has(input.tool_name)) process.exit(0);

  const toolUseId = input.tool_use_id;
  // Nothing to correlate on: the row stays `unexecuted`, which is honest — this
  // bin does not know what happened, so it does not write that it does.
  if (typeof toolUseId !== "string" || toolUseId === "") process.exit(0);

  const outcome = input.hook_event_name === "PostToolUseFailure" ? "failed" : "executed";
  new Docket().stamp(toolUseId, outcome);
  process.exit(0);
}

main().catch((cause: unknown) => {
  // On `PostToolUse`, exit 2 is how stderr reaches Claude. The write has already
  // happened; what is being reported is that the record of it is incomplete.
  failClosed(cause instanceof Error ? cause.message : String(cause));
});
