/**
 * The coverage boundary for shell commands, as a **declaration** rather than a
 * classification.
 *
 * Affiant's rule is that a system which cannot inspect a write must refuse it, not
 * wave it through. `Write`, `Edit` and `MultiEdit` arrive as named fields, so the
 * hook can swear them field by field. A shell command does not: `sh -c` can write
 * a file a hundred ways, several of them unparseable without running the shell.
 *
 * An earlier version of this file kept a list of write shapes and said nothing
 * about everything else. That is the losing shape for a coverage claim, because
 * "nothing matched" reads as "this is safe" when it actually means "this was not
 * looked at" — and a list of shapes always misses some (`2>err.log`, `perl -pi`,
 * `dd of=`, `node -e "…writeFileSync…"`). So the classifier now sorts every
 * command into exactly one of three tiers and says which:
 *
 * 1. **`writes`** — a shape this file recognises as writing to disk. Refused with
 *    the coverage message, and the refusal names what it matched.
 * 2. **`read-only`** — a small allowlist of programs that read and do not write,
 *    with no redirection, no command substitution and no shell escape. Passed
 *    through with no output, which leaves Claude Code's normal permission flow
 *    exactly as it was.
 * 3. **`unknown`** — everything else. Not classified either way, so it is handed
 *    to the person: `ask`. This is the tier that makes the coverage claim true.
 *
 * Over-refusal is deliberate and stays: `echo "a > b"` is refused, because
 * deciding what a shell would treat as a quote is exactly the analysis being
 * declined. Over-refusing costs a person one approval; under-refusing costs them
 * the guarantee.
 */

/** Which of the three tiers a command fell into. */
export type CoverageTier = "writes" | "read-only" | "unknown";

/** One recognisable shape of a shell write. */
export interface WritePattern {
  /** The name used in the refusal, so a person can see what was matched. */
  name: string;
  test: RegExp;
}

/**
 * File-descriptor duplication (`2>&1`, `>&2`) redirects one stream into another,
 * not into a file, so it is not on its own a write. It is scrubbed before every
 * other test, which is why `>` can then be treated as a write unconditionally —
 * including `1>`, `2>`, `2>>` and `exec 3>`, all of which the previous version's
 * `[^\d>&]` guard let through.
 */
const FD_DUPLICATION = /\d?>&\s*\d+/g;

/** A command word: the program name, not a substring of another word. */
function word(name: string): RegExp {
  return new RegExp(`(?:^|[\\s;&|(])${name}(?=$|[\\s;&|)])`);
}

/**
 * A program followed by anything up to the next command separator.
 *
 * `program` carries its own trailing boundary — `\b` for a plain name, `\s` for
 * one that must be followed by a subcommand — because `\b` after `\s` only holds
 * when the next character is a word one, which `git -C /repo push` is not.
 */
function invocation(program: string, rest: string): RegExp {
  return new RegExp(`(?:^|[\\s;&|(])${program}[^;&|]*${rest}`);
}

/**
 * The shapes a shell write takes, in the order they are reported.
 *
 * Every entry here is a case that was observed slipping through the earlier
 * pattern list, or one of the original eight it already caught.
 */
export const WRITE_PATTERNS: readonly WritePattern[] = [
  // Any `>` left after the fd-duplication scrub redirects into a file: `>`, `>>`,
  // `1>`, `2>`, `2>>`, `&>`, `>|`, and `cat <<EOF > f`.
  { name: "output redirection (>, >>, 1>, 2>, 2>>, &>, exec 3>)", test: />{1,2}(?!&)/ },
  // `>&name` writes both streams to a file; `>&2` is duplication and was scrubbed.
  { name: "redirection to a named file (>&file)", test: />&\s*[A-Za-z_./~$]/ },
  { name: "tee", test: word("tee") },
  { name: "in-place sed", test: invocation("sed\\b", "\\s-[a-zA-Z]*i\\b") },
  { name: "in-place perl", test: invocation("perl\\b", "\\s-[a-zA-Z]*i\\b") },
  { name: "dd of=", test: invocation("dd\\b", "\\bof=") },
  { name: "truncate", test: word("truncate") },
  { name: "install", test: word("install") },
  { name: "ln", test: word("ln") },
  { name: "chmod", test: word("chmod") },
  { name: "chown", test: word("chown") },
  { name: "touch", test: word("touch") },
  { name: "rm", test: word("rm") },
  { name: "mv", test: word("mv") },
  { name: "cp", test: word("cp") },
  { name: "rsync", test: word("rsync") },
  // Anything between the program and the verb — `git -C /repo push`, `npm --silent
  // publish` — is stepped over rather than enumerated, because a flag list that
  // fails to anticipate one spelling under-refuses, which is the failure that costs.
  { name: "git push", test: invocation("git\\s", "\\bpush(?=$|[\\s;&|)])") },
  { name: "git reset --hard", test: invocation("git\\s", "\\breset\\b[^;&|]*--hard\\b") },
  { name: "git clean", test: invocation("git\\s", "\\bclean(?=$|[\\s;&|)])") },
  { name: "git checkout --", test: invocation("git\\s", "\\bcheckout\\b[^;&|]*\\s--(?=$|\\s)") },
  { name: "git restore", test: invocation("git\\s", "\\brestore(?=$|[\\s;&|)])") },
  {
    name: "npm/pnpm/yarn publish",
    test: invocation("(?:npm|pnpm|yarn)\\s", "\\bpublish(?=$|[\\s;&|)])"),
  },
  { name: "curl -o/-O", test: invocation("curl\\b", "\\s-(?:o|O|-output|-remote-name)\\b") },
  { name: "wget", test: word("wget") },
  { name: "tar -x", test: invocation("tar\\b", "(?:\\s-{0,2}[A-Za-z]*x|\\s--extract)") },
  { name: "unzip", test: word("unzip") },
  { name: "patch", test: word("patch") },
  { name: "find -delete", test: invocation("find\\b", "\\s-delete\\b") },
  { name: "find -exec rm", test: invocation("find\\b", "\\s-exec(?:dir)?\\b[^;&|]*\\brm\\b") },
  // Interpreter one-liners. The shell hands these an opaque program, so the only
  // honest thing to look for is the write API by name.
  {
    name: "python one-liner that opens a file for writing",
    test: invocation(
      "python[\\d.]*\\b",
      "\\s-c\\b[\\s\\S]*(?:\\bopen\\s*\\([^)]*['\"][wax]|\\bos\\.(?:remove|unlink|rmdir|makedirs|rename)|\\bshutil\\.(?:copy|move|rmtree)|\\bwrite_text\\b|\\bwrite_bytes\\b)",
    ),
  },
  {
    name: "node one-liner that calls a filesystem write",
    test: invocation(
      "node\\b",
      "\\s-(?:e|-eval)\\b[\\s\\S]*\\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rmSync|rmdirSync|unlink|unlinkSync|mkdirSync|renameSync|copyFileSync|truncateSync)\\b",
    ),
  },
];

/**
 * Programs that read and do not write, with the extra condition each one needs.
 *
 * `true` means the program is read-only however it is invoked. A function gets
 * the invocation's tokens (the program itself at index 0) and answers whether
 * *this* invocation is read-only. When it is not, the command is not refused
 * outright — it falls to `unknown`, which asks.
 */
const READ_ONLY: Record<string, true | ((tokens: readonly string[]) => boolean)> = {
  ls: true,
  pwd: true,
  cat: true,
  head: true,
  tail: true,
  wc: true,
  grep: true,
  rg: true,
  which: true,
  // `env` on its own prints the environment. `env FOO=bar rm x` runs another
  // program, which this file cannot vouch for, so only the bare form is allowed.
  env: (tokens) =>
    tokens
      .slice(1)
      .every((token) => token.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)),
  date: true,
  echo: true,
  // `find` reads until it is told to act: `-delete`, `-exec`, `-ok` and the
  // `-fprint` family all write, and the first two are refused outright above.
  find: (tokens) =>
    !tokens.some((token) =>
      ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"].includes(
        token,
      ),
    ),
  git: (tokens) => {
    const subcommand = subcommandOf(tokens, new Set(["-C", "-c", "--git-dir", "--work-tree"]));
    return (
      subcommand !== null &&
      ["status", "diff", "log", "show", "branch", "blame"].includes(subcommand)
    );
  },
  dotnet: (tokens) => {
    const subcommand = subcommandOf(tokens, new Set());
    return subcommand === "test" || subcommand === "build";
  },
  npm: packageManager,
  pnpm: packageManager,
  yarn: packageManager,
  // `node -e` with no write API in it. `node script.js` is not read-only: this
  // file has not read the script, so it does not know what the script does.
  node: (tokens) => tokens.includes("-e") || tokens.includes("--eval"),
};

/** `npm test`, `pnpm -C dir test`, `yarn run build` — never anything publishing. */
function packageManager(tokens: readonly string[]): boolean {
  if (tokens.includes("publish")) return false;
  const subcommand = subcommandOf(tokens, new Set(["-C", "--dir", "--prefix", "--filter", "-w"]));
  return subcommand === "test" || subcommand === "run";
}

/** The first non-option token after the program, stepping over options that take a value. */
function subcommandOf(tokens: readonly string[], valued: ReadonlySet<string>): string | null {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    if (valued.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return token;
  }
  return null;
}

/**
 * Shell constructions that can hide anything at all, so nothing carrying one is
 * ever called read-only. `>` is not here because a redirection is a write, and is
 * refused outright by {@link WRITE_PATTERNS} before this runs.
 */
const SHELL_ESCAPES = [/\$\(/, /`/, /\$\{/, /</, /\\\n/];

/** Programs that run another program, so the allowlist cannot vouch for them. */
const INDIRECTION = new Set(["sudo", "eval", "exec", "xargs", "source", "."]);

/** What a command was found to be. */
export interface Coverage {
  /** Which tier the command fell into. */
  tier: CoverageTier;
  /** The names of the write shapes matched, in {@link WRITE_PATTERNS} order. Empty unless `writes`. */
  matched: string[];
}

/** Splits a command line into the invocations a shell would run. */
function segments(command: string): string[] {
  return command
    .split(/[;\n]|&&|\|\||[|&]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/** Drops leading `FOO=bar` assignments, which are environment, not the program. */
function tokensOf(segment: string): string[] {
  const tokens = segment.split(/\s+/).filter((token) => token !== "");
  while (tokens.length > 0) {
    const first = tokens[0];
    if (first !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) tokens.shift();
    else break;
  }
  return tokens;
}

/** True when every invocation in the command is on the read-only allowlist. */
function isReadOnly(scrubbed: string): boolean {
  if (SHELL_ESCAPES.some((escape) => escape.test(scrubbed))) return false;

  const parts = segments(scrubbed);
  if (parts.length === 0) return false;

  for (const part of parts) {
    const tokens = tokensOf(part);
    const program = tokens[0];
    if (program === undefined) return false;
    if (INDIRECTION.has(program)) return false;
    const rule = READ_ONLY[program];
    if (rule === undefined) return false;
    if (rule !== true && !rule(tokens)) return false;
  }
  return true;
}

/**
 * Classifies one shell command into exactly one tier.
 *
 * Write shapes are tested first and on the whole command: a single `rm` in a
 * chain refuses the chain, because the chain runs as one tool call.
 */
export function classifyCommand(command: string): Coverage {
  // Drop only fd duplication before matching: everything else, including quoted
  // text, is left in place, because deciding what a shell would treat as a quote
  // is the very analysis this hook is declining to perform.
  const scrubbed = command.replace(FD_DUPLICATION, " ");

  const matched = WRITE_PATTERNS.filter((pattern) => pattern.test.test(scrubbed)).map(
    (pattern) => pattern.name,
  );
  if (matched.length > 0) return { tier: "writes", matched };

  return { tier: isReadOnly(scrubbed) ? "read-only" : "unknown", matched: [] };
}

/** The sentence a refusal carries. It says what was not done, not what was found wrong. */
export function refusalReason(matched: readonly string[]): string {
  const shapes = matched.join(", ");
  return (
    "coverage refused: this hook cannot inspect a shell write field-by-field; " +
    "run the change through Write/Edit or approve the command yourself" +
    (shapes === "" ? "" : ` (matched: ${shapes})`)
  );
}

/**
 * The sentence an unclassified command carries.
 *
 * It is not a denial and not an approval: the hook is saying it has no coverage
 * here, and handing the decision to the person Claude Code would have asked
 * anyway. That is the whole difference between this bin and one that stays quiet.
 */
export const UNKNOWN_REASON =
  "the Affiant hook cannot inspect a shell write field by field; approve this command yourself";
