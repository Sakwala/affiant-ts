#!/usr/bin/env node
/**
 * `affiant-hook` — the `PreToolUse` bin for `Write`, `Edit` and `MultiEdit`.
 *
 * The whole flow: read the proposed tool call off stdin, turn it into an Affidavit,
 * file it on the local Docket, serve one page showing it, wait for a person, and
 * answer Claude Code with what they said.
 *
 * Four rules it never bends:
 *
 * - **It always exits 0 with JSON, or exits 2.** Any other exit code is a
 *   non-blocking error and the tool call proceeds, so a hook that dies quietly
 *   would be an approval nobody gave. Every failure below the top of this file —
 *   an unwritable docket directory, a docket that will not parse, a port that
 *   cannot be bound — lands in `main().catch` and exits 2 with one line on stderr.
 *   It never spins: a hook that hangs is cancelled at Claude Code's `timeout`, and
 *   a cancelled hook's output is discarded, which is a gate that turned itself off.
 * - **Expiry denies.** A window that closes with nobody there is a denial, not a
 *   default-allow. Approval is never assumed. So is an interrupt: `SIGTERM` and
 *   `SIGINT` answer `deny` rather than dying with an empty stdout.
 * - **What it cannot swear, it refuses** — and files the refusal, so the docket
 *   shows what the hook declined to look at.
 * - **It swears where the write lands**, not the string the payload carried.
 */
import {
  applyAmendments,
  buildRequest,
  readFileState,
  refusalRequest,
  unmatchedEdits,
} from "./affidavit.js";
import { COVERAGE_REFUSED, Docket } from "./docket.js";
import type { DocketEntry } from "./docket.js";
import { isReviewedTool, parseHookInput, parseToolInput, resolveTarget } from "./protocol.js";
import { answer, failClosed, openInBrowser, readStdin, serverPort, timeoutMs } from "./runtime.js";
import { startServer } from "./server.js";

/** How often the docket is re-read while waiting, in case something else decided. */
const POLL_INTERVAL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms).unref();
  });
}

/** Files the refusal on the docket, then tells the agent it was refused. */
function refuse(docket: Docket, reason: string): never {
  docket.block(refusalRequest(reason), COVERAGE_REFUSED, reason);
  answer("deny", reason);
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

  const window = timeoutMs();
  const docket = new Docket();

  const toolInput = parseToolInput(tool, input.tool_input);
  if (toolInput === null) {
    refuse(
      docket,
      `coverage refused: this hook could not read the ${tool} payload as the fields it knows ` +
        "how to swear, so it has not reviewed it. Approve the call yourself if you want it.",
    );
  }

  // Resolved against the payload's own `cwd`, so the card is about the file the
  // tool will actually write, and reads the same file to decide create vs update.
  const target = resolveTarget(toolInput.file_path, input.cwd);
  const state = readFileState(target.resolved);

  // An edit whose `old_string` is not in the file cannot apply. Filing it anyway
  // would swear a `previousValue` the entity does not hold and render the diff as
  // "(no change)" at full confidence — two false statements on a sworn card.
  const missing = unmatchedEdits(toolInput, state);
  if (missing.length > 0) {
    const which = missing.map((index) => `edit ${String(index)}`).join(", ");
    refuse(
      docket,
      `coverage refused: ${which} of this ${tool} call does not occur in ${target.resolved}, so ` +
        "the edit cannot apply and this hook will not swear a previous value the file does not " +
        "hold. Re-read the file and propose the edit again.",
    );
  }

  const request = buildRequest(tool, toolInput, {
    timeoutMs: window,
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
    fileState: state,
  });
  docket.file(request, { toolUseId: input.tool_use_id ?? null });

  let landed: DocketEntry | null = null;
  const server = await startServer({
    docket,
    docketId: request.docketId,
    tool,
    toolInput,
    port: serverPort(),
    onDecision: (entry) => {
      landed = entry;
    },
  });

  // An interrupted hook that printed nothing is a non-blocking error, and the tool
  // call proceeds. A cancelled review is not an approval, so say so and exit 0.
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      answer(
        "deny",
        `Affiant docket ${request.docketId}: the review was interrupted before anyone decided; ` +
          "approval is never assumed.",
      );
    });
  }

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

  if (outcome.status === "rejected") {
    const note = outcome.reason;
    answer(
      "deny",
      note === null
        ? `Affiant docket ${request.docketId}: a reviewer rejected this write.`
        : `Affiant docket ${request.docketId}: a reviewer rejected this write — ${note}`,
    );
  }

  if (outcome.status !== "approved") {
    answer(
      "deny",
      `Affiant docket ${request.docketId}: this entry reads ${outcome.status}, which is not an ` +
        "approval; approval is never assumed.",
    );
  }

  const amendments = outcome.amendments;
  if (amendments === null) {
    answer("allow", `Affiant docket ${request.docketId}: approved by a reviewer.`);
  }

  // Approved with amendments. The reviewer's values replace the agent's in the
  // tool input, and the modified call is what Claude Code runs — `updatedInput`
  // replaces the whole input object, so every unchanged field is carried with it.
  // The server checked they applied before it spent the entry's one decision, so
  // this is a second guard rather than the first.
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
  // One line, because stderr is the blocking reason Claude Code shows.
  failClosed(cause instanceof Error ? cause.message : String(cause));
});
