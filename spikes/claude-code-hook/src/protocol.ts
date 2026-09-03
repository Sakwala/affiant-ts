/**
 * The Claude Code hook wire, as far as this spike uses it.
 *
 * Every shape here is transcribed from the hooks reference at
 * https://code.claude.com/docs/en/hooks (read 2026-09-04). The fields this spike
 * depends on, verbatim from that page:
 *
 * - A `PreToolUse` hook receives JSON on stdin carrying the common fields
 *   (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`)
 *   plus `tool_name`, `tool_input` and `tool_use_id`.
 * - `tool_input` for `Write` is `{ file_path, content }`; for `Edit` it is
 *   `{ file_path, old_string, new_string, replace_all }`. Both `file_path` values
 *   are always absolute — Claude Code expands `~` and relative paths before hooks
 *   run.
 * - A hook returns its decision on stdout inside `hookSpecificOutput`, which must
 *   carry `hookEventName: "PreToolUse"`, and may carry `permissionDecision`
 *   (`"allow" | "deny" | "ask" | "defer"`), `permissionDecisionReason`,
 *   `updatedInput` and `additionalContext`.
 * - `updatedInput` "modifies the tool's input parameters before execution.
 *   Replaces the entire input object, so include unchanged fields alongside
 *   modified ones." It is combined with `"allow"` to auto-approve the modified
 *   call. That is how this spike applies an amendment.
 * - Exit 0 means Claude Code reads the JSON. Exit 2 blocks whether or not JSON is
 *   printed, using stderr as the reason. Any other exit code is a non-blocking
 *   error and the tool proceeds — which is why this hook only ever exits 0 or 2.
 *
 * `MultiEdit` is **not** in that page's `tool_input` table; the table lists Bash,
 * PowerShell, Write, Edit, Read, Glob and Grep. The `MultiEdit` shape below
 * (`{ file_path, edits: [{ old_string, new_string, replace_all }] }`) is the
 * tool's own documented input schema, and the parser treats it as best-effort: a
 * payload that does not match is handled as unrecognised rather than guessed at.
 */

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
