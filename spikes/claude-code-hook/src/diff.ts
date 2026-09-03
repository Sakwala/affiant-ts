/**
 * A dependency-free unified diff, good enough to read on a card.
 *
 * The Evidence Card shows a field's proposed value beside the value it replaces,
 * which answers "what changes" for a short field and not at all for a file. So an
 * edit also swears a `preview` field: the whole file's change as a unified diff,
 * computed here from the bytes on disk and the bytes the agent proposed.
 */

const CONTEXT_LINES = 3;

/**
 * The two file lines a unified diff opens with.
 *
 * Not `a/` and `b/`: a hook payload's `file_path` is always absolute, and
 * `--- a//home/…` is a path that does not exist. These say which side is which in
 * words instead, because the reader is a person on a card and not `patch`.
 */
function header(path: string): [string, string] {
  return [`--- ${path}  (on disk)`, `+++ ${path}  (proposed)`];
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  // A trailing newline yields a final empty element that is not a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

type Op = { kind: "equal" | "insert" | "delete"; line: string };

/**
 * Longest common subsequence over lines, walked back into an edit script.
 *
 * O(n·m) in time and memory, which is fine for a file a person is about to read
 * and wrong for a very large one — {@link unifiedDiff} bails out before it gets
 * here when the inputs are big.
 */
function editScript(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i -= 1) {
    const row = table[i]!;
    const next = table[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: "equal", line: before[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      ops.push({ kind: "delete", line: before[i]! });
      i += 1;
    } else {
      ops.push({ kind: "insert", line: after[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", line: before[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "insert", line: after[j]! });
    j += 1;
  }
  return ops;
}

interface Hunk {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
  lines: string[];
}

/** The largest input this will diff line by line before falling back to a summary. */
export const DIFF_LINE_BUDGET = 4000;

/**
 * A unified diff of `before` → `after`, with three lines of context.
 *
 * Returns `"(no change)"` when the two are identical, and a one-line summary
 * instead of a diff when either side is longer than {@link DIFF_LINE_BUDGET} —
 * a card is not the place to read ten thousand lines, and the quadratic walk
 * above is not the way to produce them.
 */
export function unifiedDiff(before: string, after: string, path: string): string {
  if (before === after) return "(no change)";

  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  if (beforeLines.length > DIFF_LINE_BUDGET || afterLines.length > DIFF_LINE_BUDGET) {
    return [
      ...header(path),
      `(too large to diff on a card: ${String(beforeLines.length)} lines before, ` +
        `${String(afterLines.length)} lines after)`,
    ].join("\n");
  }

  const ops = editScript(beforeLines, afterLines);

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let beforeLine = 1;
  let afterLine = 1;
  let trailingContext = 0;
  /** Equal lines seen since the last change, held back as leading context. */
  let pending: { line: string; beforeLine: number; afterLine: number }[] = [];

  for (const op of ops) {
    if (op.kind === "equal") {
      if (current !== null && trailingContext < CONTEXT_LINES) {
        current.lines.push(` ${op.line}`);
        current.beforeCount += 1;
        current.afterCount += 1;
        trailingContext += 1;
      } else {
        if (current !== null && trailingContext >= CONTEXT_LINES) current = null;
        pending.push({ line: op.line, beforeLine, afterLine });
        if (pending.length > CONTEXT_LINES) pending.shift();
      }
      beforeLine += 1;
      afterLine += 1;
      continue;
    }

    if (current === null) {
      const first = pending[0];
      current = {
        beforeStart: first?.beforeLine ?? beforeLine,
        afterStart: first?.afterLine ?? afterLine,
        beforeCount: 0,
        afterCount: 0,
        lines: [],
      };
      for (const held of pending) {
        current.lines.push(` ${held.line}`);
        current.beforeCount += 1;
        current.afterCount += 1;
      }
      hunks.push(current);
    }
    pending = [];
    trailingContext = 0;

    if (op.kind === "delete") {
      current.lines.push(`-${op.line}`);
      current.beforeCount += 1;
      beforeLine += 1;
    } else {
      current.lines.push(`+${op.line}`);
      current.afterCount += 1;
      afterLine += 1;
    }
  }

  const body = hunks.map((hunk) => {
    const hunkHeader =
      `@@ -${String(hunk.beforeCount === 0 ? hunk.beforeStart - 1 : hunk.beforeStart)},` +
      `${String(hunk.beforeCount)} ` +
      `+${String(hunk.afterCount === 0 ? hunk.afterStart - 1 : hunk.afterStart)},` +
      `${String(hunk.afterCount)} @@`;
    return [hunkHeader, ...hunk.lines].join("\n");
  });

  return [...header(path), ...body].join("\n");
}
