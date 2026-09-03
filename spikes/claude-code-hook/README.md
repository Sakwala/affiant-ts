# An Evidence Card in front of a coding agent's file write

A [Claude Code](https://code.claude.com/docs) `PreToolUse` hook that intercepts
`Write`, `Edit` and `MultiEdit` before they run. It turns the proposed change into
an Affiant **Affidavit** — per field, the value the agent wants to write, the value
that is there now, where each value came from and how confident that source is —
and serves it on a card in your browser. You approve, amend or reject; the hook
tells Claude Code what you said, and only then does the file change.

This is a **two-week spike**, opened 2026-09-04 and closing 2026-09-18. It is not
published to npm and it is not a product. It exists to answer one question, below.

---

## Install, in five steps

You need Node 22 or later, [pnpm](https://pnpm.io), and Claude Code.

1. **Clone the repository.**

   ```sh
   git clone https://github.com/Sakwala/affiant-ts.git
   cd affiant-ts
   ```

2. **Install and build.** The hook serves the Evidence Card element out of the
   workspace, so the build has to have run.

   ```sh
   pnpm install && pnpm build
   ```

3. **Add the hooks to a settings file**, with absolute paths. Copy
   [`hooks.example.json`](./hooks.example.json) into `~/.claude/settings.json` (or
   a project's `.claude/settings.json`), replacing `/ABSOLUTE/PATH/TO/affiant-ts`
   with wherever you cloned it. The snippet is:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Write|Edit|MultiEdit",
           "hooks": [
             {
               "type": "command",
               "command": "node /ABSOLUTE/PATH/TO/affiant-ts/spikes/claude-code-hook/dist/hook.js",
               "timeout": 300
             }
           ]
         },
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "command": "node /ABSOLUTE/PATH/TO/affiant-ts/spikes/claude-code-hook/dist/bash-hook.js",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```

   On Windows, where Claude Code routes shell commands through the PowerShell tool
   rather than Bash, use the matcher `Bash|PowerShell` for the second entry — the
   bin already handles both.

4. **Open a Claude Code session** in any project.

5. **Ask it to edit a file.** A browser tab opens with the card. The URL is also on
   stderr, which Claude Code shows, in case no browser opened.

To take it off again, delete the two entries. Nothing else is installed anywhere.

---

## What you will see

A tab at `http://127.0.0.1:47331/` holding one card, with a countdown to the moment
the review window closes.

The card lists the change **field by field**, not as a diff blob:

- **`path`** — the file the agent named. Marked `Conversation`, confidence 1.00:
  the hook is quoting the agent, not guessing.
- **`content`** (for a `Write`) or **`edit-1`, `edit-2`, …** (one per edit of an
  `Edit` or `MultiEdit`) — the proposed value, shown beside the value it replaces.
  Marked `Inferred`, confidence 0.50, "proposed by the coding agent": nothing has
  checked it, which is why you are looking at it.
- **`preview`** (on an edit) — the whole file's change as a unified diff, marked
  `Computed`. The arithmetic is certain; what it renders is not.

Above them sits the affidavit's aggregate confidence, which is the **minimum**
across the fields rather than the mean — an affidavit is no more trustworthy than
its least-evidenced field, so a 0.50 field pins the whole card at 0.50 no matter
how many certain ones sit beside it. Warnings sit there too: a whole-file `Write`
over a file that already exists says, in as many words, that every byte not in the
proposal is being dropped.

Every field has an **Amend** box. Type into one and press Approve and the decision
becomes an amendment: your value goes back to Claude Code in place of the agent's,
and the tool runs with yours. There is also a note box; what you write in it is what
Claude is told when you reject.

---

## The boundary

What this hook can and cannot do, stated plainly, because a review tool that
overstates its reach is worse than none:

- **It sees only what Claude Code routes through `Write`, `Edit` and `MultiEdit`.**
  Those arrive as named fields, which is why they can be sworn field by field.
- **A shell write is refused, not inspected.** `affiant-hook-bash` looks for the
  shapes a shell write takes — `>` and `>>`, `tee`, `sed -i`, `rm`, `mv`, `cp`,
  `git push`, `npm publish` — and when it sees one it **denies** with the reason
  saying it did not review the command. It never claims to have checked a shell
  command it cannot parse. Set `AFFIANT_HOOK_BASH=ask` to have it raise Claude
  Code's own permission prompt instead of denying outright. It over-refuses on
  purpose: `echo "a > b"` is declined too, because deciding what a shell would
  treat as a quote is exactly the analysis being declined.
- **A decision expires to `deny`.** If the window closes with nobody there, the
  write is denied. Approval is never assumed, and a hook that crashes exits 2,
  which blocks.
- **It is not a sandbox.** It reviews tool calls. It does not stop anything that
  reaches the filesystem by another route — a subprocess Claude Code did not spawn,
  an MCP server's own tools, an editor you have open.
- **Nothing leaves the machine.** The server binds to 127.0.0.1, there is no
  account and no remote, and the Docket is a JSON file at `~/.affiant-hook/docket.json`
  (`AFFIANT_HOOK_HOME` moves it). Deleting that file deletes the record.

---

## The question this exists to answer

**Is a field-level review card wanted inside the coding loop?**

Claude Code already asks before it writes. This replaces "allow this edit?" with
the evidence behind it, and lets you change the answer rather than only refuse it.
Whether that is worth the interruption at the speed people actually work is not
something we can settle by arguing about it, so this is here to be used and
reported on.

**Say so in the repository's
[Discussions](https://github.com/Sakwala/affiant-ts/discussions).** It is a spike:
"I turned it off after an hour" is as useful a result as any other, and if that is
the answer the spike will say so.

---

## Settings

All optional; all environment variables read by the hook process.

| Variable                  | Default              | What it does                                                                          |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `AFFIANT_HOOK_HOME`       | `~/.affiant-hook`    | Where the docket file lives                                                           |
| `AFFIANT_HOOK_PORT`       | `47331`              | The port to serve on. `0` asks the OS for a free one; a taken port falls back to that |
| `AFFIANT_HOOK_TIMEOUT_MS` | `240000` (4 minutes) | How long you have before the review expires to `deny`                                 |
| `AFFIANT_HOOK_OPEN`       | unset                | `never` stops it trying to open a browser                                             |
| `AFFIANT_HOOK_BASH`       | unset                | `ask` makes the shell refusal a permission prompt instead of a denial                 |

**Keep `AFFIANT_HOOK_TIMEOUT_MS` below the `timeout` in your settings file.** Claude
Code cancels a hook that reaches its configured `timeout` and _discards its output_,
so a hook cancelled mid-review renders no decision at all and the tool call goes
back to the normal permission flow. The hook's own window must close first, so that
a lapsed review is a denial rather than a shrug. The defaults — a 240-second window
under a 300-second `timeout` — leave a minute of headroom.

---

## The hook protocol, as verified

Every field below was read from the Claude Code hooks reference at
**<https://code.claude.com/docs/en/hooks>** on 2026-09-04, and the transcription
lives in [`src/protocol.ts`](./src/protocol.ts).

**In**, on stdin: the common fields `session_id`, `transcript_path`, `cwd`,
`permission_mode` and `hook_event_name`, plus `tool_name`, `tool_input` and
`tool_use_id`. `tool_input` is `{ file_path, content }` for `Write` and
`{ file_path, old_string, new_string, replace_all }` for `Edit`. `file_path` is
always absolute — Claude Code expands `~` and relative paths before hooks run.

**Out**, on stdout: a `hookSpecificOutput` object carrying
`hookEventName: "PreToolUse"`, `permissionDecision` (`"allow"`, `"deny"`, `"ask"`
or `"defer"`) and `permissionDecisionReason`. For `"deny"` the reason is shown to
Claude; for `"allow"` and `"ask"` it is shown to you.

**Amendments use `updatedInput`.** The reference says it "modifies the tool's input
parameters before execution. Replaces the entire input object, so include unchanged
fields alongside modified ones", and that it is combined with `"allow"` to
auto-approve the modified call. So an amendment here is a real amendment: the
reviewer's value replaces the agent's in the tool input and the tool runs with it —
not a denial carrying a suggestion. An amendment naming a field that is _not_ a
parameter of the call (`preview` is the common case) is refused rather than
silently dropped, because an approval that quietly discarded what you typed would
mean something you did not agree to.

**Exit codes.** Exit 0 and Claude Code reads the JSON. Exit 2 blocks whatever else
happens, using stderr as the reason. Every other non-zero code is a _non-blocking_
error and the tool proceeds — which is why these bins only ever exit 0 with a
decision, or 2 with an error.

**One gap worth naming:** `MultiEdit` is not in that page's `tool_input` table,
which documents Bash, PowerShell, Write, Edit, Read, Glob and Grep. The shape used
here — `{ file_path, edits: [{ old_string, new_string, replace_all }] }` — is the
tool's own input schema, and the parser treats it as best-effort: a payload that
does not match is **refused**, not guessed at.

---

## Layout

| File                                     | What is in it                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| [`src/protocol.ts`](./src/protocol.ts)   | The hook wire, transcribed from the reference, with the citation       |
| [`src/affidavit.ts`](./src/affidavit.ts) | Tool payload → Affidavit, and reviewer amendments → `updatedInput`     |
| [`src/diff.ts`](./src/diff.ts)           | The unified diff behind the `preview` field                            |
| [`src/docket.ts`](./src/docket.ts)       | The local docket: compare-and-set decisions, expiry as a state         |
| [`src/server.ts`](./src/server.ts)       | The loopback server and its four routes                                |
| [`src/page.ts`](./src/page.ts)           | The review page, which is what a host integrating the card would write |
| [`src/hook.ts`](./src/hook.ts)           | `affiant-hook` — the `Write`/`Edit`/`MultiEdit` bin                    |
| [`src/coverage.ts`](./src/coverage.ts)   | Which shell commands are write-shaped                                  |
| [`src/bash-hook.ts`](./src/bash-hook.ts) | `affiant-hook-bash` — the refusal                                      |

Run the tests with `pnpm -C spikes/claude-code-hook test`. They spawn the built
bins with real payloads and drive real decisions over HTTP, so `pnpm build` has to
have run — the suite builds on demand if it has not.
