/**
 * The Claude Code hook wire, as far as this spike uses it.
 *
 * Every shape here comes from the hooks reference at
 * https://code.claude.com/docs/en/hooks, re-read 2026-09-04. What that page
 * states, with the section it states it in:
 *
 * - **Common input fields.** A hook receives JSON on stdin carrying `session_id`,
 *   `transcript_path`, `cwd` ("Current working directory when the hook is
 *   invoked"), `permission_mode` and `hook_event_name`. *PreToolUse input* adds
 *   `tool_name`, `tool_input` and `tool_use_id`.
 * - **PreToolUse input** carries a per-tool `tool_input` table for Bash,
 *   PowerShell, Write, Edit, Read, Glob and Grep. `Write` is
 *   `{ file_path, content }`; `Edit` is
 *   `{ file_path, old_string, new_string, replace_all }`; both `file_path` fields
 *   are described as "Absolute path to the file". The section above the table says
 *   "For the file tools `Write`, `Edit`, and `Read`, `tool_input.file_path` is
 *   always absolute" and "Claude Code expands `~` and relative paths before hooks
 *   run".
 *
 *   This spike **does not rely on that**. A relative `file_path` would make the
 *   card silently wrong about the one thing it exists to show — create versus
 *   overwrite — so {@link resolveTarget} resolves whatever arrives against the
 *   payload's own `cwd`, swears the resolved path, and warns on the card when the
 *   two differ. A guarantee that holds costs nothing to check.
 * - **PreToolUse decision control.** A hook returns its decision on stdout inside
 *   `hookSpecificOutput`, carrying `hookEventName: "PreToolUse"` and
 *   `permissionDecision` — the reference lists `allow`, `deny`, `ask` and `defer`
 *   — plus `permissionDecisionReason`, and optionally `updatedInput` and
 *   `additionalContext`. `"defer"` is honoured "only in non-interactive mode with
 *   the `-p` flag", so this spike never returns it.
 * - **`updatedInput`** "Modified tool input object to replace the original" —
 *   it replaces the entire input object, so unchanged fields have to be included
 *   alongside modified ones. Combined with `"allow"` it runs the modified call.
 *   That is how this spike applies an amendment.
 * - **Exit codes.** Exit 0 means Claude Code reads the JSON, and "Exit code 0 with
 *   no output means the hook has no decision to report, so the tool call continues
 *   through the normal permission flow". Exit 2 blocks whether or not JSON is
 *   printed, using stderr as the reason. Any other exit code is a non-blocking
 *   error and the tool proceeds — which is why these bins only ever exit 0 or 2.
 *
 * `MultiEdit` is **not** in that `tool_input` table. The `MultiEdit` shape below
 * (`{ file_path, edits: [{ old_string, new_string, replace_all }] }`) is the
 * tool's own input schema, and the parser treats it as best-effort: a payload that
 * does not match is handled as unrecognised rather than guessed at.
 */
import { isAbsolute, resolve } from "node:path";

/** The three tools this hook reviews field by field. */
export const REVIEWED_TOOLS = ["Write", "Edit", "MultiEdit"] as const;

/** A tool this hook reviews field by field. */
export type ReviewedTool = (typeof REVIEWED_TOOLS)[number];

/** Narrows a tool name to one this hook reviews. */
export function isReviewedTool(name: unknown): name is ReviewedTool {
  return typeof name === "string" && (REVIEWED_TOOLS as readonly string[]).includes(name);
}

/** `tool_input` for the `Write` tool. */
export interface WriteToolInput {
  file_path: string;
  content: string;
}

/** `tool_input` for the `Edit` tool. */
export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/** One entry of `MultiEdit`'s `edits` array. */
export interface MultiEditEntry {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/** `tool_input` for the `MultiEdit` tool. */
export interface MultiEditToolInput {
  file_path: string;
  edits: MultiEditEntry[];
}

/** The `tool_input` of any tool this hook reviews. */
export type ReviewedToolInput = WriteToolInput | EditToolInput | MultiEditToolInput;

/** The stdin payload of a `PreToolUse` hook, narrowed to the fields this spike reads. */
export interface PreToolUseInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
}

/** What a `PreToolUse` hook may tell Claude Code to do. */
export type PermissionDecision = "allow" | "deny" | "ask";

/** The `hookSpecificOutput` object a `PreToolUse` hook prints on stdout. */
export interface PreToolUseHookSpecificOutput {
  hookEventName: "PreToolUse";
  permissionDecision: PermissionDecision;
  permissionDecisionReason: string;
  /** Present only alongside `"allow"`: the full replacement `tool_input`. */
  updatedInput?: Record<string, unknown>;
}

/** The whole stdout payload of a `PreToolUse` hook. */
export interface PreToolUseHookOutput {
  hookSpecificOutput: PreToolUseHookSpecificOutput;
}

/** Builds the stdout payload for a decision. */
export function hookOutput(
  permissionDecision: PermissionDecision,
  permissionDecisionReason: string,
  updatedInput?: Record<string, unknown>,
): PreToolUseHookOutput {
  const hookSpecificOutput: PreToolUseHookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision,
    permissionDecisionReason,
  };
  // `exactOptionalPropertyTypes` — assign the key only when there is a value.
  if (updatedInput !== undefined) hookSpecificOutput.updatedInput = updatedInput;
  return { hookSpecificOutput };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

/**
 * Narrows a raw `tool_input` to the shape its `tool_name` promises.
 *
 * Returns `null` when the payload does not match — the caller refuses rather than
 * reviewing a shape it does not understand.
 */
export function parseToolInput(tool: ReviewedTool, raw: unknown): ReviewedToolInput | null {
  if (!isRecord(raw)) return null;
  const filePath = stringAt(raw, "file_path");
  if (filePath === null || filePath === "") return null;

  if (tool === "Write") {
    const content = stringAt(raw, "content");
    return content === null ? null : { file_path: filePath, content };
  }

  if (tool === "Edit") {
    const oldString = stringAt(raw, "old_string");
    const newString = stringAt(raw, "new_string");
    if (oldString === null || newString === null) return null;
    const input: EditToolInput = {
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
    };
    if (typeof raw["replace_all"] === "boolean") input.replace_all = raw["replace_all"];
    return input;
  }

  const rawEdits = raw["edits"];
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) return null;
  const edits: MultiEditEntry[] = [];
  for (const rawEdit of rawEdits) {
    if (!isRecord(rawEdit)) return null;
    const oldString = stringAt(rawEdit, "old_string");
    const newString = stringAt(rawEdit, "new_string");
    if (oldString === null || newString === null) return null;
    const edit: MultiEditEntry = { old_string: oldString, new_string: newString };
    if (typeof rawEdit["replace_all"] === "boolean") edit.replace_all = rawEdit["replace_all"];
    edits.push(edit);
  }
  return { file_path: filePath, edits };
}

/** A `file_path` as it arrived, and as it resolves on this machine. */
export interface ResolvedTarget {
  /** Exactly what the payload carried. */
  literal: string;
  /** The absolute, normalised path the write would land on. */
  resolved: string;
  /** True when the two differ: a relative path, a `~`, or unnormalised `..` segments. */
  rewritten: boolean;
}

/**
 * Resolves a payload's `file_path` against the payload's own `cwd`.
 *
 * The reference says `file_path` is always absolute, and in practice it is. The
 * cost of checking is one `resolve()`; the cost of not checking is a card that
 * says *create* over a file that exists, with no "this drops every byte" warning
 * on it, because the hook process's own working directory is not the tool's.
 * `..` segments are normalised for the same reason: `…/work/../../../etc/hosts`
 * renders as project-local and resolves outside the project.
 */
export function resolveTarget(filePath: string, cwd: string | undefined): ResolvedTarget {
  const base = cwd !== undefined && cwd !== "" && isAbsolute(cwd) ? cwd : process.cwd();
  const resolved = resolve(base, filePath);
  return { literal: filePath, resolved, rewritten: resolved !== filePath };
}

/** Parses the stdin payload. Returns `null` when it is not a JSON object. */
export function parseHookInput(text: string): PreToolUseInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isRecord(parsed) ? (parsed as PreToolUseInput) : null;
}
