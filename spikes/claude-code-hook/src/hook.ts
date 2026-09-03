#!/usr/bin/env node
/**
 * `affiant-hook` — the `PreToolUse` bin for `Write`, `Edit` and `MultiEdit`.
 *
 * The whole flow: read the proposed tool call off stdin, turn it into an Affidavit,
 * file it on the local Docket, serve one page showing it, wait for a person, and
 * answer Claude Code with what they said.
 *
 * Three rules it never bends:
 *
 * - **It always exits 0 with JSON, or exits 2.** Any other exit code is a
 *   non-blocking error and the tool call proceeds, so a hook that dies quietly
 *   would be an approval nobody gave.
 * - **Expiry denies.** A window that closes with nobody there is a denial, not a
 *   default-allow. Approval is never assumed.
 * - **What it cannot swear, it refuses.** A payload whose shape it does not
 *   recognise is denied with the reason saying so, not passed through.
 */
import { applyAmendments, buildRequest } from "./affidavit.js";
import { Docket } from "./docket.js";
import type { DocketEntry } from "./docket.js";
import { isReviewedTool, parseHookInput, parseToolInput } from "./protocol.js";
import { answer, failClosed, openInBrowser, readStdin, serverPort, timeoutMs } from "./runtime.js";
import { startServer } from "./server.js";

/** How often the docket is re-read while waiting, in case something else decided. */
const POLL_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms).unref();
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input = parseHookInput(raw);
  if (input === null) {
    failClosed("stdin was not a JSON object; refusing to let the tool call through unreviewed");
  }

  const tool = input.tool_name;
  // Not one of the tools this hook reviews: say nothing at all, so the tool call
  // goes through Claude Code's normal permission flow untouched.
  if (!isReviewedTool(tool)) process.exit(0);

  const toolInput = parseToolInput(tool, input.tool_input);
  if (toolInput === null) {
    answer(
      "deny",
      `coverage refused: this hook could not read the ${tool} payload as the fields it knows ` +
        "how to swear, so it has not reviewed it. Approve the call yourself if you want it.",
    );
  }

  const window = timeoutMs();
  const request = buildRequest(tool, toolInput, { timeoutMs: window });
  const docket = new Docket();
  docket.file(request);

  let landed: DocketEntry | null = null;
  const server = await startServer({
    docket,
    docketId: request.docketId,
    port: serverPort(),
    onDecision: (entry) => {
      landed = entry;
    },
  });

  process.stderr.write(
    `affiant-hook: a write is waiting for review — ${server.url}\n` +
      `affiant-hook: docket ${request.docketId} closes at ${request.requiredBy}\n`,
  );
  openInBrowser(server.url);

  const deadline = Date.parse(request.requiredBy);
  while (landed === null && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const entry = docket.read(request.docketId);
    if (entry !== null && entry.status !== "pending") landed = entry;
  }

  await server.close();

  const outcome: DocketEntry | null = landed;
  if (outcome === null || outcome.status === "expired") {
    answer(
      "deny",
      `Affiant docket ${request.docketId}: the review window expired without a decision; ` +
        "approval is never assumed.",
    );
  }

  if (outcome.status === "approved") {
    answer("allow", `Affiant docket ${request.docketId}: approved by a reviewer.`);
  }

  if (outcome.status === "rejected") {
    const note = outcome.reason;
    answer(
      "deny",
      note === null
        ? `Affiant docket ${request.docketId}: a reviewer rejected this write.`
        : `Affiant docket ${request.docketId}: a reviewer rejected this write — ${note}`,
    );
  }

  // Amended. The reviewer's values replace the agent's in the tool input, and the
  // modified call is what Claude Code runs — `updatedInput` replaces the whole
  // input object, so every unchanged field is carried across with it.
  const amendments = outcome.amendments ?? {};
  const applied = applyAmendments(tool, toolInput, amendments);
  if (!applied.ok) {
    answer(
      "deny",
      `Affiant docket ${request.docketId}: a reviewer amended ` +
        `${applied.unapplicable.join(", ")}, which is not a parameter of the ${tool} call, so ` +
        "the amendment could not be applied and nothing was written. Their values were: " +
        JSON.stringify(amendments),
    );
  }

  const changed = Object.keys(amendments).join(", ");
  answer(
    "allow",
    `Affiant docket ${request.docketId}: approved with a reviewer's amendment to ${changed}.`,
    applied.updatedInput,
  );
}

main().catch((cause: unknown) => {
  failClosed(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
});
