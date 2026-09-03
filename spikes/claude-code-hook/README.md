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
   with wherever you cloned it. There are four entries:

   | Event                | Matcher                  | Bin               | What it does                                       |
   | -------------------- | ------------------------ | ----------------- | -------------------------------------------------- |
   | `PreToolUse`         | `Write\|Edit\|MultiEdit` | `hook.js`         | The review card                                    |
   | `PreToolUse`         | `Bash\|PowerShell`       | `bash-hook.js`    | The shell coverage declaration                     |
   | `PostToolUse`        | `Write\|Edit\|MultiEdit` | `outcome-hook.js` | Stamps the docket row `executed`                   |
   | `PostToolUseFailure` | `Write\|Edit\|MultiEdit` | `outcome-hook.js` | Stamps it `failed`, so the two are distinguishable |

   The shell matcher is `Bash|PowerShell` because on Windows, wherever the
   PowerShell tool is enabled, Claude routes shell commands through it and a hook
   matching only `Bash` never fires. The reference's per-tool `tool_input` table
   gives PowerShell the same `command` field as Bash, which is what the bin reads.

4. **Open a Claude Code session** in any project.

5. **Ask it to edit a file.** A browser tab opens with the card. The URL is also on
   stderr, which Claude Code shows, in case no browser opened. **The URL on stderr
   is the only address that works** — it carries a per-run secret path, and the
   port is one the OS picked.

To take it off again, delete the entries. Nothing else is installed anywhere.

---

## What you will see

A tab at `http://127.0.0.1:<port>/<32 hex characters>/` holding one card, with a
countdown to the moment the review window closes.

The card lists the change **field by field**, not as a diff blob:

- **`path`** — the file the agent named, resolved to the absolute path the write
  will land on. Marked `Conversation`, confidence 1.00: the hook is quoting the
  agent, not guessing. If the resolved path differs from what the payload carried,
  the card says so in a warning and the evidence line keeps the original spelling.
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

**`content` and the `edit-N` fields can be amended**, and the page says so. Type
into one and press Approve and the decision becomes an amendment: your value goes
back to Claude Code in place of the agent's, and the tool runs with yours. `path`
and `preview` cannot be amended — `preview` is a rendering of the change rather
than a parameter of it, and `path` is refused on purpose, because a card that can
change the destination of a write is a write primitive rather than a review
surface. An amendment either of them is refused with a 400 and **the entry stays
open**, so you can correct it; the one decision an entry has is not spent on
something that could never take effect. There is also a note box; what you write
in it is what Claude is told when you reject.

---

## The boundary

What this hook can and cannot do, stated plainly, because a review tool that
overstates its reach is worse than none:

- **It sees only what Claude Code routes through `Write`, `Edit` and `MultiEdit`.**
  Those arrive as named fields, which is why they can be sworn field by field.
  `NotebookEdit` also writes files and is **not** covered: the matcher is exact
  alternation, so `Edit` will never match it, and its `tool_input` has no
  `file_path` for this hook to swear even if it did.
- **A shell command is declared, not inspected.** See the table below.
- **A decision expires to `deny`.** If the window closes with nobody there, the
  write is denied. Approval is never assumed. So is an interrupt: `SIGTERM` and
  `SIGINT` answer `deny` rather than dying with an empty stdout. `SIGKILL` cannot
  be caught by anything, so a `kill -9` still leaves no decision.
- **A failure blocks.** Anything the hook cannot do — an unwritable docket
  directory, a docket file that will not parse, a port it cannot bind, a setting it
  cannot read — exits 2 with the reason on stderr, which blocks the tool call. It
  never retries something that cannot succeed, because a hook that spins is
  cancelled at your configured `timeout`, and a cancelled hook's output is
  discarded: the gate would be off with nobody told.
- **It is not a sandbox.** It reviews tool calls. It does not stop anything that
  reaches the filesystem by another route — a subprocess Claude Code did not spawn,
  an MCP server's own tools, an editor you have open.
- **Nothing leaves the machine.** The server binds to 127.0.0.1, there is no
  account and no remote, and the Docket is a JSON file at `~/.affiant-hook/docket.json`
  (`AFFIANT_HOOK_HOME` moves it). Deleting that file deletes the record.
- **Loopback is not on its own a boundary**, and this spike does not treat it as
  one. A web page open in the same browser can reach a loopback port: a
  cross-origin POST with `Content-Type: text/plain` is a _simple_ request and needs
  no preflight, and a page that re-resolves its own hostname to 127.0.0.1 becomes
  same-origin with it. So the review server does four things together — binds a
  **random port**, puts every route under a **per-run secret path prefix** printed
  only on stderr, requires the `Host` header to be the address it bound (else 421)
  and any `Origin` to be its own (else 403), and requires
  `Content-Type: application/json` on the decision (else 415) so that a
  cross-origin POST needs a preflight it can never get, because no CORS header is
  ever sent.

---

## The shell bin, and exactly what it covers

`affiant-hook-bash` reviews nothing, and that is the point. A `Write` arrives as
named fields; a shell command that writes to a file arrives as one opaque string.
So it **declares its coverage** in three tiers rather than pattern-matching its way
to "looks fine":

| Tier            | What it is                                                                     | Decision                    |
| --------------- | ------------------------------------------------------------------------------ | --------------------------- |
| **Write shape** | A shape this bin recognises as writing to disk                                 | `deny`, naming what matched |
| **Read-only**   | A small allowlist of reading programs, with no redirection and no shell escape | no output at all            |
| **Unknown**     | Everything else — not classified either way                                    | `ask`                       |

The third tier is what makes the claim true. Without it, a command the bin did not
recognise produced no output, which reads as "checked and fine" and actually meant
"never looked at".

**Tier one — denied.** Redirection in every spelling (`>`, `>>`, `1>`, `2>`,
`2>>`, `&>`, `>|`, `exec 3>`, `>&file`, and a heredoc into a file such as
`cat <<EOF > f`) but **not** descriptor duplication (`2>&1`, `>&2`), which
redirects a stream into a stream; then `tee`, `sed -i`, `perl -pi`, `dd of=`,
`truncate`, `install`, `ln`, `chmod`, `chown`, `touch`, `rm`, `mv`, `cp`, `rsync`,
`git push`, `git reset --hard`, `git clean`, `git checkout --`, `git restore`,
`npm|pnpm|yarn publish`, `curl -o|-O`, `wget`, `tar -x`, `unzip`, `patch`,
`find -delete`, `find -exec rm`, a `python -c` one-liner that opens a file for
writing, and a `node -e` one-liner that calls a filesystem write.

**Tier two — passed through.** `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `grep`,
`rg`, `find` without `-delete`/`-exec`, `git status|diff|log|show|branch|blame`,
`dotnet test|build`, `npm|pnpm|yarn test` and `run <script>` (never `publish`),
`node -e` with no write API in it, `echo` with no redirection, `env`, `which`,
`date`. Every segment of a chain has to be on the list, and the whole command has
to be free of `$( )`, backticks and `<`; anything behind `sudo`, `eval`, `exec`,
`xargs` or `source` is not read-only, because the allowlist cannot vouch for what
runs after them.

**Tier three — asked.** Everything else, with the reason "the Affiant hook cannot
inspect a shell write field by field; approve this command yourself". `mkdir`,
`git commit`, `git checkout .`, `gh pr create`, `docker run`, `curl` without `-o`,
`make`, a script by path — none of them is on either list, and naming every
write-capable program on a machine is exactly the enumeration this bin declines.
Asking is not approving.

It over-refuses on purpose in one direction: `echo "a > b"` is denied, because
deciding what a shell would treat as a quote is exactly the analysis being
declined. Over-refusing costs a person one approval; under-refusing costs them the
guarantee.

**`AFFIANT_HOOK_BASH=allow-unknown` turns tier three back into silence, and
weakens the guarantee this bin exists to make.** With it set, a command the bin
does not recognise produces no output and goes through Claude Code's normal
permission flow — which is where every unrecognised write went before this tier
existed. Set it only if you know why you want it. `AFFIANT_HOOK_BASH=ask` is the
default and needs no setting.

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

All optional; all environment variables read by the hook process. A value any of
them cannot read is a **hard failure with the reason on stderr**, not a silent
fall back to the default: a gate running on settings you did not choose is worse
than one that will not start.

| Variable                  | Default              | What it does                                                                                         |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `AFFIANT_HOOK_HOME`       | `~/.affiant-hook`    | Where the docket file lives                                                                          |
| `AFFIANT_HOOK_PORT`       | `0`                  | The port to serve on. `0` asks the OS for a free one; a pinned port that is taken falls back to that |
| `AFFIANT_HOOK_TIMEOUT_MS` | `240000` (4 minutes) | How long you have before the review expires to `deny`                                                |
| `AFFIANT_HOOK_LOCK_MS`    | `5000`               | How long a docket lock is waited on before the process holding it is presumed gone                   |
| `AFFIANT_HOOK_OPEN`       | unset                | `never` stops it trying to open a browser                                                            |
| `AFFIANT_HOOK_BASH`       | `ask`                | `allow-unknown` passes an unclassified shell command through — see the warning above                 |

**Keep `AFFIANT_HOOK_TIMEOUT_MS` below the `timeout` in your settings file.** Claude
Code cancels a hook that reaches its configured `timeout` and _discards its output_,
so a hook cancelled mid-review renders no decision at all and the tool call goes
back to the normal permission flow. The hook's own window must close first, so that
a lapsed review is a denial rather than a shrug. The defaults — a 240-second window
under a 300-second `timeout` — leave a minute of headroom.

---

## The hook protocol, as verified

Every field below was read from the Claude Code hooks reference at
**<https://code.claude.com/docs/en/hooks>**, re-read 2026-09-04, and the
transcription lives in [`src/protocol.ts`](./src/protocol.ts) with the section each
claim comes from.

**In**, on stdin: the common fields `session_id`, `transcript_path`, `cwd`
("Current working directory when the hook is invoked"), `permission_mode` and
`hook_event_name`, plus `tool_name`, `tool_input` and `tool_use_id`. The
_PreToolUse input_ section carries a per-tool `tool_input` table for Bash,
PowerShell, Write, Edit, Read, Glob and Grep: `tool_input` is `{ file_path, content }`
for `Write` and `{ file_path, old_string, new_string, replace_all }` for `Edit`,
with `file_path` described as "Absolute path to the file". The section above that
table says "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path`
is always absolute" and "Claude Code expands `~` and relative paths before hooks
run".

**This hook does not lean on that.** It resolves whatever arrives against the
payload's own `cwd`, swears the resolved absolute path, and warns on the card when
the two differ. The cost of checking is one `resolve()`; the cost of not checking
is a card that says _create_ over a file that exists, with the "every byte not in
the proposal is being dropped" warning missing from the one place it matters.

**Out**, on stdout: a `hookSpecificOutput` object carrying
`hookEventName: "PreToolUse"`, `permissionDecision` — the reference lists `allow`,
`deny`, `ask` and `defer` — and `permissionDecisionReason`. For `"deny"` the reason
is shown to Claude; for `"allow"` and `"ask"` it is shown to you. `"defer"` is
honoured "only in non-interactive mode with the `-p` flag", so these bins never
return it.

**Amendments use `updatedInput`.** It is the "Modified tool input object to replace
the original", replacing the entire input object, so unchanged fields have to be
included alongside modified ones; combined with `"allow"` it runs the modified
call. So an amendment here is a real amendment: the reviewer's value replaces the
agent's in the tool input and the tool runs with it — not a denial carrying a
suggestion. An amendment naming a field that is _not_ an amendable parameter of the
call is refused rather than silently dropped, because an approval that quietly
discarded what you typed would mean something you did not agree to.

**Exit codes.** Exit 0 and Claude Code reads the JSON; "Exit code 0 with no output
means the hook has no decision to report, so the tool call continues through the
normal permission flow", which is why silence is used only for a tool this hook
does not review and for a command it has declared read-only. Exit 2 blocks whatever
else happens, using stderr as the reason. Every other non-zero code is a
_non-blocking_ error and the tool proceeds — which is why these bins only ever exit
0 with a decision, or 2 with an error.

**One gap worth naming:** `MultiEdit` is not in that page's `tool_input` table. The
shape used here — `{ file_path, edits: [{ old_string, new_string, replace_all }] }`
— is the tool's own input schema, and the parser treats it as best-effort: a
payload that does not match is **refused**, not guessed at.

---

## The Docket

`~/.affiant-hook/docket.json`, one row per proposed write.

- A row goes `pending → approved | rejected | expired`, once, under a
  compare-and-set. An **amendment is data on an approval**, not a state of its own.
- An `approved` row starts `unexecuted` and the `PostToolUse` bin stamps it
  `executed` or `failed`, so an approved-but-failed write is distinguishable from
  one that landed. The correlation is `tool_use_id`.
- A decision records **who made it** — the remote address and user agent it arrived
  from — so the row can be read back afterwards.
- A refusal is a row too: `blocked`, with the code `coverage-refused`. What the
  hook declined to look at is the more interesting half of the record.
- A decision that arrives after the window closed is refused, and whatever it
  carried is kept on the row for resubmission rather than thrown away with it.
- Re-filing an id that is already there returns the stored row untouched. A docket
  file that will not parse is an error the hook exits 2 on, and the file is left
  exactly as it was — reading it as empty and saving over it destroyed every
  decision it held.

---

## Layout

| File                                           | What is in it                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [`src/protocol.ts`](./src/protocol.ts)         | The hook wire, with the reference section behind each claim            |
| [`src/affidavit.ts`](./src/affidavit.ts)       | Tool payload → Affidavit, and reviewer amendments → `updatedInput`     |
| [`src/diff.ts`](./src/diff.ts)                 | The unified diff behind the `preview` field                            |
| [`src/docket.ts`](./src/docket.ts)             | The local docket: compare-and-set decisions, expiry as a state         |
| [`src/server.ts`](./src/server.ts)             | The loopback server and its three routes, behind the run's secret path |
| [`src/page.ts`](./src/page.ts)                 | The review page, which is what a host integrating the card would write |
| [`src/hook.ts`](./src/hook.ts)                 | `affiant-hook` — the `Write`/`Edit`/`MultiEdit` bin                    |
| [`src/coverage.ts`](./src/coverage.ts)         | The three-tier shell coverage declaration                              |
| [`src/bash-hook.ts`](./src/bash-hook.ts)       | `affiant-hook-bash` — the refusal                                      |
| [`src/outcome-hook.ts`](./src/outcome-hook.ts) | `affiant-hook-outcome` — what became of an approved write              |

Run the tests with `pnpm -C spikes/claude-code-hook test`. They spawn the built
bins with real payloads and drive real decisions over HTTP, so `pnpm build` has to
have run — the suite builds on demand if it has not.
