import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import type { AffidavitField } from "@affiant/contract";

import {
  applyAmendments,
  buildRequest,
  CONTENT_FIELD,
  PATH_FIELD,
  PREVIEW_FIELD,
  readFileState,
} from "../src/affidavit.js";
import { DIFF_LINE_BUDGET, unifiedDiff } from "../src/diff.js";
import type { EditToolInput, MultiEditToolInput, WriteToolInput } from "../src/protocol.js";

const workspace = mkdtempSync(join(tmpdir(), "affiant-affidavit-"));
afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function fileWith(name: string, content: string): string {
  const path = join(workspace, name);
  writeFileSync(path, content, "utf8");
  return path;
}

function byName(fields: readonly AffidavitField[], name: string): AffidavitField {
  const found = fields.find((field) => field.name === name);
  if (found === undefined) throw new Error(`no field named ${name}`);
  return found;
}

const OPTIONS = { timeoutMs: 60_000, now: Date.parse("2026-09-04T09:00:00.000Z") } as const;

describe("buildRequest", () => {
  it("swears a Write to a path that is not there as a create", () => {
    const path = join(workspace, "brand-new.ts");
    const input: WriteToolInput = { file_path: path, content: "export const a = 1;\n" };

    const { affidavit, requiredBy, docketId } = buildRequest("Write", input, OPTIONS);

    expect(affidavit.operationType).toBe("FileCreate");
    expect(affidavit.entityType).toBe("file");
    expect(affidavit.entityId).toBeNull();
    expect(affidavit.requiresConfirmation).toBe(true);
    expect(affidavit.warnings).toEqual([]);

    const content = byName(affidavit.fields, CONTENT_FIELD);
    expect(content.value).toBe("export const a = 1;\n");
    // A create replaces nothing, so the previous value is an explicit null.
    expect(content.previousValue).toBeNull();

    // The deadline is the window added to the moment the card was built.
    expect(requiredBy).toBe("2026-09-04T09:01:00.000Z");
    expect(docketId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("carries the bytes on disk as the previous value, and warns that a whole-file write drops them", () => {
    const path = fileWith("existing.ts", "export const a = 1;\n");
    const input: WriteToolInput = { file_path: path, content: "export const a = 2;\n" };

    const { affidavit } = buildRequest("Write", input, OPTIONS);

    expect(affidavit.operationType).toBe("FileUpdate");
    expect(affidavit.entityId).toBe(path);
    expect(byName(affidavit.fields, CONTENT_FIELD).previousValue).toBe("export const a = 1;\n");
    expect(affidavit.warnings.join(" ")).toContain("whole-file write");
  });

  it("swears an Edit to an existing file as an update carrying what it replaces", () => {
    const path = fileWith("edit-me.ts", "const port = 3000;\nconst host = 'x';\n");
    const input: EditToolInput = {
      file_path: path,
      old_string: "const port = 3000;",
      new_string: "const port = 8080;",
    };

    const { affidavit } = buildRequest("Edit", input, OPTIONS);

    expect(affidavit.operationType).toBe("FileUpdate");
    expect(affidavit.entityId).toBe(path);

    const edit = byName(affidavit.fields, "edit-1");
    expect(edit.value).toBe("const port = 8080;");
    expect(edit.previousValue).toBe("const port = 3000;");

    const preview = byName(affidavit.fields, PREVIEW_FIELD);
    expect(preview.value).toContain("-const port = 3000;");
    expect(preview.value).toContain("+const port = 8080;");
    // The diff is computed, so it says nothing about how good the proposal is.
    expect(preview.provenance.current.source).toBe("Computed");
  });

  it("swears one field per edit of a MultiEdit, plus a preview of the whole change", () => {
    const path = fileWith("multi.ts", "one\ntwo\nthree\n");
    const input: MultiEditToolInput = {
      file_path: path,
      edits: [
        { old_string: "one", new_string: "ONE" },
        { old_string: "three", new_string: "THREE" },
      ],
    };

    const { affidavit } = buildRequest("MultiEdit", input, OPTIONS);

    const names = affidavit.fields.map((field) => field.name);
    expect(names).toEqual([PATH_FIELD, "edit-1", "edit-2", PREVIEW_FIELD]);

    const preview = String(byName(affidavit.fields, PREVIEW_FIELD).value);
    // Both edits land in the same preview, applied in order against the file.
    expect(preview).toContain("-one");
    expect(preview).toContain("+ONE");
    expect(preview).toContain("-three");
    expect(preview).toContain("+THREE");
    // An untouched line survives as context, not as a change.
    expect(preview).toContain(" two");
  });

  it("warns when an edit has no file to match against", () => {
    const input: EditToolInput = {
      file_path: join(workspace, "absent.ts"),
      old_string: "a",
      new_string: "b",
    };

    const { affidavit } = buildRequest("Edit", input, OPTIONS);

    expect(affidavit.entityId).toBeNull();
    expect(affidavit.warnings.join(" ")).toContain("not on disk");
  });

  it("takes the aggregate as the minimum across fields, never the mean", () => {
    const path = fileWith("aggregate.ts", "a\n");
    const { affidavit } = buildRequest(
      "Edit",
      { file_path: path, old_string: "a", new_string: "b" },
      OPTIONS,
    );

    const confidences = affidavit.fields.map((field) => field.provenance.current.confidence);
    // path 1.0, edit-1 0.5, preview 1.0 — a mean would read 0.83.
    expect(confidences).toEqual([1, 0.5, 1]);
    expect(affidavit.aggregateConfidence).toBe(Math.min(...confidences));
    expect(affidavit.aggregateConfidence).toBe(0.5);
  });

  it("gives the path Conversation provenance and the proposal Inferred provenance", () => {
    const { affidavit } = buildRequest(
      "Write",
      { file_path: join(workspace, "provenance.ts"), content: "x" },
      OPTIONS,
    );

    expect(byName(affidavit.fields, PATH_FIELD).provenance.current).toMatchObject({
      source: "Conversation",
      confidence: 1,
    });
    expect(byName(affidavit.fields, CONTENT_FIELD).provenance.current).toMatchObject({
      source: "Inferred",
      confidence: 0.5,
      evidence: "proposed by the coding agent",
    });
  });

  it("reads a missing path as absent rather than as an error", () => {
    const state = readFileState(join(workspace, "definitely-not-here"));
    expect(state).toEqual({ exists: false, content: "", unreadable: null });
  });
});

describe("applyAmendments", () => {
  it("folds an amended content back into a Write's tool input", () => {
    const input: WriteToolInput = { file_path: "/tmp/a.ts", content: "agent wrote this" };
    const applied = applyAmendments("Write", input, { content: "a person wrote this" });

    expect(applied).toEqual({
      ok: true,
      updatedInput: { file_path: "/tmp/a.ts", content: "a person wrote this" },
    });
  });

  it("folds an amended edit back into the right entry of a MultiEdit", () => {
    const input: MultiEditToolInput = {
      file_path: "/tmp/a.ts",
      edits: [
        { old_string: "one", new_string: "ONE" },
        { old_string: "two", new_string: "TWO" },
      ],
    };
    const applied = applyAmendments("MultiEdit", input, { "edit-2": "deux" });

    expect(applied).toEqual({
      ok: true,
      updatedInput: {
        file_path: "/tmp/a.ts",
        edits: [
          { old_string: "one", new_string: "ONE" },
          { old_string: "two", new_string: "deux" },
        ],
      },
    });
  });

  it("refuses an amendment to a field that is not a parameter of the call", () => {
    const input: EditToolInput = { file_path: "/tmp/a.ts", old_string: "a", new_string: "b" };
    const applied = applyAmendments("Edit", input, { preview: "not a parameter" });

    // Silently dropping it would make the approval mean something the reviewer
    // did not agree to, so it is refused instead.
    expect(applied).toEqual({ ok: false, unapplicable: ["preview"] });
  });

  it("refuses an edit index that the call does not have", () => {
    const input: EditToolInput = { file_path: "/tmp/a.ts", old_string: "a", new_string: "b" };
    expect(applyAmendments("Edit", input, { "edit-4": "x" })).toEqual({
      ok: false,
      unapplicable: ["edit-4"],
    });
  });
});

describe("unifiedDiff", () => {
  it("names which side is on disk and which is proposed, without an a/ b/ prefix", () => {
    // A hook payload's file_path is always absolute, so `--- a//home/…` would be
    // a path that does not exist.
    const diff = unifiedDiff("a\n", "b\n", "/home/me/x.ts");
    expect(diff.split("\n").slice(0, 2)).toEqual([
      "--- /home/me/x.ts  (on disk)",
      "+++ /home/me/x.ts  (proposed)",
    ]);
  });

  it("says so plainly when nothing changes", () => {
    expect(unifiedDiff("same\n", "same\n", "/x")).toBe("(no change)");
  });

  it("keeps three lines of context around a change and counts the hunk", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n");
    const after = ["1", "2", "3", "4", "FOUR-AND-A-HALF", "5", "6", "7", "8", "9"].join("\n");

    const diff = unifiedDiff(before, after, "/x");
    // Six lines shown from the file on disk, seven after the insertion.
    expect(diff).toContain("@@ -2,6 +2,7 @@");
    expect(diff).toContain("+FOUR-AND-A-HALF");
    // Line 1 is more than three lines away from the change, so it is not shown.
    expect(diff.split("\n")).not.toContain(" 1");
  });

  it("refuses to render a file too large to read on a card", () => {
    const huge = Array.from({ length: DIFF_LINE_BUDGET + 1 }, (_, i) => String(i)).join("\n");
    expect(unifiedDiff(huge, `${huge}\nextra`, "/x")).toContain("too large to diff on a card");
  });
});
