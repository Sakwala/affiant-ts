/**
 * The coverage boundary, in miniature.
 *
 * Affiant's rule is that a system which cannot inspect a write must refuse it, not
 * wave it through. `Write`, `Edit` and `MultiEdit` arrive as named fields, so the
 * hook can swear them field by field. A shell command does not: `sh -c` can write
 * a file a hundred ways, several of them unparseable without running the shell,
 * and a hook that pattern-matched its way to "looks fine" would be claiming a
 * coverage it does not have.
 *
 * So this classifier is deliberately blunt and deliberately over-broad. It looks
 * for the shapes a shell write takes, and when it sees one it refuses — the write
 * is not inspected, it is declined, with the reason saying so. `echo "a > b"`
 * being refused is the correct failure: over-refusing costs a person one approval,
 * under-refusing costs them the guarantee.
 */

/** One recognisable shape of a shell write. */
export interface WritePattern {
  /** The name used in the refusal, so a person can see what was matched. */
  name: string;
  test: RegExp;
}

/**
 * File-descriptor duplication (`2>&1`, `>&2`) redirects one stream into another,
 * not into a file, so it is not on its own a write.
 */
const FD_DUPLICATION = /\d?>&\s*\d/g;

/** The shapes a shell write takes, in the order they are reported. */
export const WRITE_PATTERNS: readonly WritePattern[] = [
  { name: "output redirection (> or >>)", test: /(?:^|[^\d>&])>{1,2}(?!&)/ },
  { name: "tee", test: /(?:^|[\s;&|(])tee(?=$|[\s;&|)])/ },
  { name: "in-place sed", test: /(?:^|[\s;&|(])sed\b[^;&|]*\s-[a-zA-Z]*i\b/ },
  { name: "rm", test: /(?:^|[\s;&|(])rm(?=$|[\s;&|)])/ },
  { name: "mv", test: /(?:^|[\s;&|(])mv(?=$|[\s;&|)])/ },
  { name: "cp", test: /(?:^|[\s;&|(])cp(?=$|[\s;&|)])/ },
  // Anything between the program and the verb — `git -C /repo push`, `npm --silent
  // publish` — is stepped over rather than enumerated, because a flag list that
  // fails to anticipate one spelling under-refuses, which is the failure that costs.
  { name: "git push", test: /(?:^|[\s;&|(])git\s[^;&|]*\bpush(?=$|[\s;&|)])/ },
  { name: "npm publish", test: /(?:^|[\s;&|(])npm\s[^;&|]*\bpublish(?=$|[\s;&|)])/ },
];

/** What a command was found to be. */
export interface Coverage {
  /** True when the command matched at least one write shape. */
  writes: boolean;
  /** The names of the shapes matched, in {@link WRITE_PATTERNS} order. */
  matched: string[];
}

/** Classifies one shell command. */
export function classifyCommand(command: string): Coverage {
  // Drop only fd duplication before matching: everything else, including quoted
  // text, is left in place, because deciding what a shell would treat as a quote
  // is the very analysis this hook is declining to perform.
  const scrubbed = command.replace(FD_DUPLICATION, " ");
  const matched = WRITE_PATTERNS.filter((pattern) => pattern.test.test(scrubbed)).map(
    (pattern) => pattern.name,
  );
  return { writes: matched.length > 0, matched };
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
