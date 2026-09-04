/**
 * Turning a proposed file write into an Affidavit.
 *
 * An Affidavit is the sworn evidence behind one write: per field, the value the
 * agent wants to write, the value that is there now, where the value came from and
 * how confident its source is. That is exactly what a `PreToolUse` payload has and
 * a diff does not — so the translation is mechanical, and every choice it makes is
 * written down here rather than left to the reader of the card.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import type {
  Affidavit,
  AffidavitField,
  EvidenceCardRequest,
  JsonValue,
  ProvenanceTag,
} from "@affiant/contract";
import { PROTOCOL_VERSION } from "@affiant/contract";

import { unifiedDiff } from "./diff.js";
import { resolveTarget } from "./protocol.js";
import type {
  MultiEditToolInput,
  ResolvedTarget,
  ReviewedTool,
  ReviewedToolInput,
} from "./protocol.js";

/** The name of the field carrying the target path. */
export const PATH_FIELD = "path";
/** The name of the field carrying a `Write`'s whole proposed content. */
export const CONTENT_FIELD = "content";
/** The name of the field carrying the unified diff of an edit. */
export const PREVIEW_FIELD = "preview";
/** The prefix of the per-edit field names an `Edit` or `MultiEdit` swears. */
export const EDIT_FIELD_PREFIX = "edit-";

/** The name of the nth edit's field, one-based: `edit-1`, `edit-2`, … */
export function editFieldName(index: number): string {
  return `${EDIT_FIELD_PREFIX}${String(index)}`;
}

/**
 * The path is what the agent said, in the turn it said it — so its provenance is
 * `Conversation` at full confidence. The hook is not guessing at the path; it is
 * quoting it.
 *
 * The sworn *value* is the resolved absolute path, because that is where the
 * write lands; the literal the agent wrote stays in the evidence line, so the two
 * are both on the card when they differ.
 *
 * `note` was spelled `evidence` before v0.1 — renamed because the whole tag is
 * the evidence and this property is only the sentence a reviewer reads. `at` is
 * the instant the tag was minted, which for every tag this hook mints is the same
 * instant the Affidavit itself is built (nothing here reads a clock of its own).
 * `binding` is `null`: nothing this hook records points an auditor at a system of
 * record, a form control or a rule to re-run — the tag names where the value came
 * from, not what to go check (PV-2).
 */
function pathProvenance(tool: ReviewedTool, target: ResolvedTarget, at: string): ProvenanceTag {
  return {
    source: "Conversation",
    confidence: 1,
    note: target.rewritten
      ? `the coding agent named "${target.literal}" in this ${tool} call, resolved against the ` +
        "working directory the hook was given"
      : `the path the coding agent named in this ${tool} call`,
    at,
    conversationTurn: null,
    binding: null,
  };
}

/**
 * The content is the agent's own proposal. Nothing has checked it, so it is
 * `Inferred` at 0.5 — the value a reviewer is there to raise or refuse.
 */
function proposalProvenance(at: string): ProvenanceTag {
  return {
    source: "Inferred",
    confidence: 0.5,
    note: "proposed by the coding agent",
    at,
    conversationTurn: null,
    binding: null,
  };
}

/**
 * The diff is derived from bytes already on the card: the file on disk and the
 * proposal above it. It is `Computed` at full confidence in the arithmetic, which
 * says nothing about the proposal it renders — the proposal's own 0.5 is what
 * drags the aggregate down.
 */
function previewProvenance(at: string): ProvenanceTag {
  return {
    source: "Computed",
    confidence: 1,
    note: "unified diff computed from the file on disk and the proposed change",
    at,
    conversationTurn: null,
    binding: null,
  };
}

// `allowedValues` and `pattern` moved off the field and onto the card envelope's
// `presentation` array in v0.1 (SR-1): they are how a surface should render an
// input, not part of what the record swears to. Every field this hook swears is
// free text with no closed value set and no mask, so there is nothing for a
// `presentation` entry to say — the envelope's `presentation` property is left
// absent rather than carrying empty hints for fields that have none.
function field(
  name: string,
  value: JsonValue,
  previousValue: JsonValue,
  provenance: ProvenanceTag,
  isMandatory: boolean,
): AffidavitField {
  return {
    name,
    value,
    previousValue,
    provenance: { current: provenance, prior: [] },
    isMandatory,
    kind: "text",
  };
}

/**
 * The three confidence numbers AF-2 requires (`aggregateConfidence` the minimum
 * over every field with an `Empty` tag counting as `0`, `populatedConfidence` the
 * minimum over the non-`Empty` fields or `null` when there are none,
 * `emptyFieldCount` the count of `Empty`-tagged fields).
 *
 * No field this hook mints is ever tagged `Empty` — `pathProvenance`,
 * `proposalProvenance` and `previewProvenance` always name a real source — so in
 * practice `populatedConfidence` equals `aggregateConfidence` and
 * `emptyFieldCount` is always `0`. The rule is still applied in full rather than
 * assumed, so a future field that *can* go `Empty` computes correctly without
 * anyone having to remember to revisit this. This mirrors `@affiant/core`'s own
 * `computeConfidence`, reimplemented here because this package does not depend on
 * `@affiant/core`.
 */
function confidenceNumbers(fields: readonly AffidavitField[]): {
  aggregateConfidence: number;
  populatedConfidence: number | null;
  emptyFieldCount: number;
} {
  let aggregate: number | null = null;
  let populated: number | null = null;
  let emptyFieldCount = 0;

  for (const entry of fields) {
    const tag = entry.provenance.current;
    const contribution = tag.source === "Empty" ? 0 : tag.confidence;
    aggregate = aggregate === null ? contribution : Math.min(aggregate, contribution);
    if (tag.source === "Empty") emptyFieldCount += 1;
    else populated = populated === null ? tag.confidence : Math.min(populated, tag.confidence);
  }

  return { aggregateConfidence: aggregate ?? 0, populatedConfidence: populated, emptyFieldCount };
}

/** What the file looks like now, and whether it is there at all. */
export interface FileState {
  exists: boolean;
  content: string;
  /** Set when the path exists but could not be read as text. */
  unreadable: string | null;
}

/** Reads the target file. A path that is not there is a create, not an error. */
export function readFileState(path: string): FileState {
  try {
    return { exists: true, content: readFileSync(path, "utf8"), unreadable: null };
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { exists: false, content: "", unreadable: null };
    return {
      exists: true,
      content: "",
      unreadable: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/** One string replacement, exactly as the `Edit` tool describes it. */
function applyReplacement(
  source: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  if (oldString === "") return newString;
  if (replaceAll) return source.split(oldString).join(newString);
  const at = source.indexOf(oldString);
  return at === -1 ? source : source.slice(0, at) + newString + source.slice(at + oldString.length);
}

/**
 * The content the edits would leave behind, applied in order against the file on
 * disk. Used only to render the `preview` diff: nothing here is written anywhere,
 * and the tool itself does the real replacement if the reviewer approves.
 */
export function projectEdits(before: string, input: ReviewedToolInput): string {
  if ("content" in input) return input.content;
  if ("edits" in input) {
    let projected = before;
    for (const edit of input.edits) {
      projected = applyReplacement(
        projected,
        edit.old_string,
        edit.new_string,
        edit.replace_all === true,
      );
    }
    return projected;
  }
  return applyReplacement(before, input.old_string, input.new_string, input.replace_all === true);
}

/** The edits a call carries, with a lone `Edit` read as a one-entry list. */
export function editsOf(input: ReviewedToolInput): MultiEditToolInput["edits"] {
  if ("content" in input) return [];
  if ("edits" in input) return input.edits;
  return [
    {
      old_string: input.old_string,
      new_string: input.new_string,
      ...(input.replace_all === undefined ? {} : { replace_all: input.replace_all }),
    },
  ];
}

/**
 * The one-based indexes of the edits whose `old_string` is not in the file.
 *
 * The `Edit` tool errors on one of these, and `applyReplacement` returns the
 * source unchanged, so the preview would read `(no change)` at full confidence
 * while the field swore a `previousValue` the entity does not hold. Both are
 * false statements, so the caller refuses the call rather than filing them.
 */
export function unmatchedEdits(input: ReviewedToolInput, state: FileState): number[] {
  if (!state.exists || state.unreadable !== null) return [];
  let projected = state.content;
  const missing: number[] = [];
  editsOf(input).forEach((edit, index) => {
    if (edit.old_string === "") return;
    if (!projected.includes(edit.old_string)) {
      missing.push(index + 1);
      return;
    }
    projected = applyReplacement(
      projected,
      edit.old_string,
      edit.new_string,
      edit.replace_all === true,
    );
  });
  return missing;
}

/** Everything the caller must supply that is not in the tool payload. */
export interface BuildOptions {
  /** How long the reviewer has, in milliseconds. */
  timeoutMs: number;
  /** The `cwd` the hook payload carried, which a relative `file_path` resolves against. */
  cwd?: string;
  /** Overridable so a test can pin the deadline. Defaults to `Date.now()`. */
  now?: number;
  /** Overridable so a test can pin the docket id. Defaults to a fresh UUID. */
  docketId?: string;
  /** Overridable so a test can supply the file's current state without touching disk. */
  fileState?: FileState;
}

/**
 * Builds the Evidence Card request for one proposed write.
 *
 * Shape rules, all of them from the protocol rather than from taste:
 *
 * - `entityType` is `"file"`. `entityId` is the path when the file is already
 *   there — an update — and `null` when it is not, because the protocol spells a
 *   create as an affidavit with no entity id.
 * - `operationType` is `"update"` exactly when `entityId` is non-null and
 *   `"create"` otherwise (AF-3) — the protocol's own two-valued shape, not this
 *   hook's own vocabulary for what it is reviewing (`Write`, `Edit`, `MultiEdit`).
 *   That vocabulary is `tool`, which stays a parameter of this function and never
 *   lands on the wire.
 * - `aggregateConfidence` is the **minimum** across the fields, not the mean: an
 *   affidavit is no more trustworthy than its least-evidenced field.
 * - Absent means `null`, never `undefined`, and arrays are never null.
 */
export function buildRequest(
  tool: ReviewedTool,
  input: ReviewedToolInput,
  options: BuildOptions,
): EvidenceCardRequest {
  const now = options.now ?? Date.now();
  const at = new Date(now).toISOString();
  const target = resolveTarget(input.file_path, options.cwd);
  const path = target.resolved;
  const state = options.fileState ?? readFileState(path);
  const warnings: string[] = [];

  if (target.rewritten) {
    warnings.push(
      `The call named "${target.literal}", which is not the absolute path it will be written ` +
        `to. This card swears ${path}, resolved against the working directory in the hook ` +
        "payload. Check it is the file you mean.",
    );
  }

  if (state.unreadable !== null) {
    warnings.push(
      `The file at ${path} exists but could not be read (${state.unreadable}), ` +
        `so the values it would replace are not on this card.`,
    );
  }

  const fields: AffidavitField[] = [
    field(PATH_FIELD, path, null, pathProvenance(tool, target, at), true),
  ];

  // A file that exists but cannot be read has an unknown previous value, not an
  // empty one. Swearing `""` would assert that the file is empty, which is a
  // statement about the entity that nothing here has established.
  const previousContent = state.exists && state.unreadable === null ? state.content : null;

  if ("content" in input) {
    if (state.exists) {
      warnings.push(
        "This is a whole-file write over a file that already exists: every byte not in the " +
          "proposed content is being dropped.",
      );
    }
    fields.push(field(CONTENT_FIELD, input.content, previousContent, proposalProvenance(at), true));
  } else {
    const edits = editsOf(input);

    edits.forEach((edit, index) => {
      fields.push(
        field(
          editFieldName(index + 1),
          edit.new_string,
          // The value the entity holds, or `null` when the file is not there to
          // hold one. Never the `old_string` of an edit that will not apply — the
          // caller refuses those before this runs.
          state.exists && state.unreadable === null ? edit.old_string : null,
          proposalProvenance(at),
          true,
        ),
      );
    });

    if (!state.exists) {
      warnings.push(
        `The file at ${path} is not on disk, so this edit has nothing to match ` +
          "against and the preview shows the proposal alone.",
      );
    }

    fields.push(
      field(
        PREVIEW_FIELD,
        unifiedDiff(state.content, projectEdits(state.content, input), path),
        null,
        previewProvenance(at),
        false,
      ),
    );
  }

  const { aggregateConfidence, populatedConfidence, emptyFieldCount } = confidenceNumbers(fields);

  const affidavit: Affidavit = {
    protocolVersion: PROTOCOL_VERSION,
    // AF-3: the shape, not this hook's own verb for the call. See the doc comment
    // above.
    operationType: state.exists ? "update" : "create",
    entityType: "file",
    entityId: state.exists ? path : null,
    fields,
    aggregateConfidence,
    populatedConfidence,
    emptyFieldCount,
    conversationTurn: null,
    createdAt: at,
  };

  return {
    protocolVersion: PROTOCOL_VERSION,
    docketId: options.docketId ?? randomUUID(),
    affidavit,
    requiredBy: new Date(now + options.timeoutMs).toISOString(),
    priorAmendments: null,
    populatedConfidence,
    emptyFieldCount,
    // Nothing this hook files is ever undecidable in the protocol's own sense
    // (AZ-4, CV-4) — a call it cannot review is refused outright by
    // `refusalRequest` below rather than filed pending. A card built here always
    // reaches a person.
    blocked: null,
    // Absent rather than an empty array when there is nothing to say (SR-1's
    // "genuinely optional" slots) — mirrors `@affiant/core`'s `presentationToWire`.
    ...(warnings.length > 0 ? { warnings } : {}),
    requiresConfirmation: true,
  };
}

/**
 * The Evidence Card request for a call this hook could not cover.
 *
 * A refusal is still a decision about a write, so it gets a docket row: a call
 * this hook cannot cover is refused and *marked*, never silently allowed.
 * There are no sworn fields, because the whole point is that nothing was sworn;
 * the reason the hook gives the agent is a warning on the card envelope.
 *
 * `operationType` is `"create"`: `entityId` is `null` here (nothing was
 * identified well enough to write to), and AF-3 ties the two together — an
 * `"update"` names the entity it changes, and this names none. The fact that this
 * particular call was refused for *coverage* rather than proposed is not a fact
 * about the shape of an operation, so it never lived in `operationType` even
 * before v0.1; it is `detail`, carried as a warning here exactly as before, and
 * the caller (`hook.ts`, `bash-hook.ts`) separately records it as the local
 * Docket row's own `code: "coverage-refused"` — the protocol's `blocked` marker
 * on the envelope is left `null` because this row is not a proposal that reached
 * the protocol's Docket and needs its `blocked`/`pending` machinery at all; it is
 * a call this hook is refusing to review, recorded on this hook's own local file
 * for the same reason every refusal is recorded.
 */
export function refusalRequest(
  detail: string,
  options: { now?: number; docketId?: string } = {},
): EvidenceCardRequest {
  const now = options.now ?? Date.now();
  const at = new Date(now).toISOString();
  return {
    protocolVersion: PROTOCOL_VERSION,
    docketId: options.docketId ?? randomUUID(),
    affidavit: {
      protocolVersion: PROTOCOL_VERSION,
      operationType: "create",
      entityType: "tool-call",
      entityId: null,
      fields: [],
      aggregateConfidence: 0,
      populatedConfidence: null,
      emptyFieldCount: 0,
      conversationTurn: null,
      createdAt: at,
    },
    requiredBy: at,
    priorAmendments: null,
    populatedConfidence: null,
    emptyFieldCount: 0,
    blocked: null,
    warnings: [detail],
    requiresConfirmation: true,
  };
}

/** The message a `path` amendment is refused with. */
export const PATH_NOT_AMENDABLE = "the target file cannot be amended on the card";

/**
 * The fields of this call a reviewer may amend, in the order they appear on the
 * card. Everything else on the card — `path` and `preview` — is evidence about
 * the write, not a parameter of it.
 */
export function amendableFields(input: ReviewedToolInput): string[] {
  if ("content" in input) return [CONTENT_FIELD];
  return editsOf(input).map((_edit, index) => editFieldName(index + 1));
}

/**
 * Folds a reviewer's amendments back into the `tool_input` Claude Code will run.
 *
 * A field name that maps to no tool input is refused rather than dropped: the
 * reviewer typed something, and a hook that silently discards it has lied about
 * what the approval meant. `preview` is the common case — it is a rendering of the
 * change, not a parameter of it.
 *
 * `path` is refused too, and deliberately. It is a parameter of the call, but
 * letting the card change it means the page can redirect the agent's write to any
 * file at all, which turns a review surface into a write primitive. The reviewer
 * rejects and says where it should have gone.
 */
export function applyAmendments(
  tool: ReviewedTool,
  input: ReviewedToolInput,
  amendments: Record<string, unknown>,
): { ok: true; updatedInput: Record<string, unknown> } | { ok: false; unapplicable: string[] } {
  const updated: Record<string, unknown> = { ...(input as unknown as Record<string, unknown>) };
  const unapplicable: string[] = [];

  const edits = "edits" in input ? input.edits.map((edit) => ({ ...edit })) : null;

  for (const [name, raw] of Object.entries(amendments)) {
    // Every field this hook swears is `kind: "text"`, so an amendment is a string.
    // Coercing anything else with `String(raw)` put `"[object Object]"` inside an
    // `allow` — a value the reviewer never typed.
    if (typeof raw !== "string") {
      unapplicable.push(name);
      continue;
    }
    const value = raw;

    if (name === PATH_FIELD) {
      unapplicable.push(name);
      continue;
    }
    if (name === CONTENT_FIELD && "content" in input) {
      updated["content"] = value;
      continue;
    }
    if (name.startsWith(EDIT_FIELD_PREFIX)) {
      const index = Number(name.slice(EDIT_FIELD_PREFIX.length)) - 1;
      if (!Number.isInteger(index) || index < 0) {
        unapplicable.push(name);
        continue;
      }
      if (edits !== null) {
        const edit = edits[index];
        if (edit === undefined) {
          unapplicable.push(name);
          continue;
        }
        edit.new_string = value;
        continue;
      }
      if (tool === "Edit" && index === 0) {
        updated["new_string"] = value;
        continue;
      }
      unapplicable.push(name);
      continue;
    }
    unapplicable.push(name);
  }

  if (unapplicable.length > 0) return { ok: false, unapplicable };
  if (edits !== null) updated["edits"] = edits;
  return { ok: true, updatedInput: updated };
}
