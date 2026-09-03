/**
 * The Docket: a JSON file holding what was proposed and what was decided.
 *
 * Affiant's docket is the record that makes a review answerable afterwards — not a
 * queue, a ledger. This is the smallest honest version of one: a file at
 * `~/.affiant-hook/docket.json` (override the directory with `AFFIANT_HOOK_HOME`)
 * holding one entry per proposed write, with these properties:
 *
 * - **A decision is compare-and-set.** An entry goes from `pending` to exactly one
 *   terminal state, once. A second decision on the same entry is refused, so two
 *   browser tabs cannot both approve, and a late click cannot overwrite an expiry.
 * - **Expiry is a state, not a sweep.** No timer marks anything expired. An entry
 *   whose `requiredBy` has passed *reads* as expired, which means a hook that
 *   crashed and a hook that is still waiting are indistinguishable to anyone
 *   reading the file, and neither of them reads as approved.
 * - **An amendment is data on an approval, not a state.** `approved` carries the
 *   reviewer's replacement values; there is no fourth terminal state.
 * - **An approved write is not a finished one.** An approved row starts
 *   `unexecuted` and is stamped `executed` or `failed` afterwards, so a write that
 *   was approved and then failed is distinguishable from one that landed.
 * - **A refusal is filed too.** A call this hook could not cover is recorded as
 *   `blocked` with the code `coverage-refused`, because what the hook declined to
 *   look at is the more interesting half of the audit trail.
 * - **Nothing already decided is destroyed.** A docket file that will not parse is
 *   an error the hook fails closed on, not a file to overwrite with a fresh one.
 */
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { EvidenceCardRequest } from "@affiant/contract";

/** What became of a proposed write. */
export type DocketStatus = "pending" | "approved" | "rejected" | "expired" | "blocked";

/** Where an approved write stands once the tool has had its turn. */
export type ExecutionOutcome = "unexecuted" | "executed" | "failed";

/** The code on a `blocked` row: the hook could not cover the call, so it refused it. */
export const COVERAGE_REFUSED = "coverage-refused";

/** One filed proposal and its outcome. */
export interface DocketEntry {
  /** The Evidence Card that was put in front of a person. */
  request: EvidenceCardRequest;
  /** Where the entry stands. */
  status: DocketStatus;
  /** When the decision was taken, RFC 3339, or `null` while pending. */
  decidedAt: string | null;
  /**
   * The reviewer's replacement values, keyed by field name, or `null` when they
   * amended nothing. Kept on a refused-because-expired row too, so a resubmission
   * can start from what the reviewer had already typed.
   */
  amendments: Record<string, unknown> | null;
  /** What the reviewer wrote alongside the decision, or `null` when they wrote nothing. */
  reason: string | null;
  /** The `tool_use_id` of the call this entry reviews, so the outcome can be stamped later. */
  toolUseId: string | null;
  /** Who decided: the remote address and user agent the decision arrived from. `null` while pending. */
  decidedBy: string | null;
  /** Where an approved write stands. `null` until something is approved. */
  execution: ExecutionOutcome | null;
  /** Why a `blocked` row is blocked. `null` on every other status. */
  code: string | null;
}

interface DocketFile {
  version: 1;
  entries: Record<string, DocketEntry>;
}

/** What a reviewer can do with a card, as the element's event names it. */
export type ReviewerDecision = "approve" | "reject" | "amend";

/**
 * How long a lock is waited on before the process holding it is presumed gone,
 * in milliseconds. `AFFIANT_HOOK_LOCK_MS` moves it, which is what the tests use
 * to exercise a stale lock without waiting the full default.
 */
export const DEFAULT_LOCK_MS = 5_000;

/** Where the docket lives: `$AFFIANT_HOOK_HOME` or `~/.affiant-hook`. */
export function docketHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["AFFIANT_HOOK_HOME"];
  return override !== undefined && override !== "" ? override : join(homedir(), ".affiant-hook");
}

/** The docket file's path. */
export function docketPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(docketHome(env), "docket.json");
}

function lockMs(env: NodeJS.ProcessEnv): number {
  const raw = env["AFFIANT_HOOK_LOCK_MS"];
  if (raw === undefined || raw === "") return DEFAULT_LOCK_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`AFFIANT_HOOK_LOCK_MS must be a positive number of milliseconds, not ${raw}`);
  }
  return parsed;
}

function emptyFile(): DocketFile {
  return { version: 1, entries: {} };
}

/**
 * Reads the docket.
 *
 * A file that is not there is an empty docket — the first write of a session is
 * the ordinary case. A file that is there and will not parse is an **error**: the
 * old code read it as empty and the next `save()` renamed a fresh file over it,
 * destroying every decision it held. Failing here means the hook exits 2 and the
 * file is left exactly as it was, for a person to look at.
 */
function load(path: string): DocketFile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return emptyFile();
    throw cause;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(
      `the docket at ${path} is not valid JSON, so nothing can be filed on it without ` +
        "overwriting decisions it may already hold; move it aside and look at it " +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`the docket at ${path} is not a JSON object; move it aside and look at it`);
  }
  const entries = (parsed as { entries?: unknown }).entries;
  if (typeof entries !== "object" || entries === null) {
    throw new Error(`the docket at ${path} has no entries object; move it aside and look at it`);
  }
  return { version: 1, entries: entries as Record<string, DocketEntry> };
}

function save(path: string, file: DocketFile): void {
  const temporary = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/**
 * A lock across processes, so a compare-and-set stays a compare-and-set when two
 * hooks share a docket. `mkdir` is the primitive because it is atomic everywhere.
 *
 * The loop retries **only** on "the lock already exists". Every other errno —
 * `EACCES` on a read-only home, `EROFS`, `ENOSPC`, `ENOENT` on a parent that
 * cannot be created — will never start succeeding, so retrying it spins forever;
 * and a hook that spins is cancelled at Claude Code's `timeout`, whose output is
 * discarded, which turns the gate off silently. Those throw immediately instead,
 * and the bin exits 2, which blocks.
 *
 * A lock older than the deadline belongs to a process that is gone, so it is
 * stolen — **once**. If the steal fails, or the lock is taken again before this
 * process can have it, that is an error too, not another lap.
 */
function withLock<T>(path: string, deadlineMs: number, work: () => T): T {
  const lock = `${path}.lock`;
  const deadline = Date.now() + deadlineMs;
  let stolen = false;

  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw new Error(
          `the docket lock at ${lock} could not be taken (${code ?? "unknown error"}); ` +
            "the docket directory is not writable by this process",
          { cause },
        );
      }
      if (Date.now() > deadline) {
        if (stolen) {
          throw new Error(
            `the docket lock at ${lock} was taken again immediately after a stale one was ` +
              "cleared; another process is holding it",
          );
        }
        stolen = true;
        try {
          rmdirSync(lock);
        } catch (removal) {
          throw new Error(`a stale docket lock at ${lock} could not be removed`, {
            cause: removal,
          });
        }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }

  try {
    return work();
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      /* already gone */
    }
  }
}

/** Projects an entry's stored status through the clock: a lapsed pending entry is expired. */
function project(entry: DocketEntry, now: number): DocketEntry {
  if (entry.status !== "pending") return entry;
  const deadline = Date.parse(entry.request.requiredBy);
  if (Number.isNaN(deadline) || now < deadline) return entry;
  return { ...entry, status: "expired" };
}

/** Fills in the fields an older docket file will not have, so a row always reads forward. */
function normalise(entry: DocketEntry): DocketEntry {
  // A row written by an earlier build simply will not have these keys, whatever
  // the type says, so they are read defensively rather than spread over.
  const stored = entry as Partial<DocketEntry>;
  return {
    ...entry,
    toolUseId: stored.toolUseId ?? null,
    decidedBy: stored.decidedBy ?? null,
    execution: stored.execution ?? null,
    code: stored.code ?? null,
  };
}

/** What a filing needs beyond the Evidence Card itself. */
export interface FileOptions {
  /** The `tool_use_id` of the call, so a `PostToolUse` bin can stamp the outcome on this row. */
  toolUseId?: string | null;
}

/** The local docket. One instance per hook process; the file is the shared truth. */
export class Docket {
  readonly #path: string;
  readonly #lockMs: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#path = docketPath(env);
    this.#lockMs = lockMs(env);
    mkdirSync(docketHome(env), { recursive: true });
  }

  /** The docket file this instance reads and writes. */
  get path(): string {
    return this.#path;
  }

  #write<T>(work: (docket: DocketFile) => T): T {
    return withLock(this.#path, this.#lockMs, () => {
      const docket = load(this.#path);
      return work(docket);
    });
  }

  /**
   * Files a proposal as `pending`.
   *
   * A `docketId` that is already on the docket is an idempotent replay: the stored
   * entry is returned untouched, never reset to `pending` and never a second row.
   */
  file(request: EvidenceCardRequest, options: FileOptions = {}): DocketEntry {
    return this.#write((docket) => {
      const existing = docket.entries[request.docketId];
      if (existing !== undefined) return normalise(existing);

      const entry: DocketEntry = {
        request,
        status: "pending",
        decidedAt: null,
        amendments: null,
        reason: null,
        toolUseId: options.toolUseId ?? null,
        decidedBy: null,
        execution: null,
        code: null,
      };
      docket.entries[request.docketId] = entry;
      save(this.#path, docket);
      return entry;
    });
  }

  /**
   * Files a call this hook could not cover as a terminal `blocked` row.
   *
   * A refusal that left no record would mean the docket could not show what the
   * hook declined to look at, which is the half of the trail a person most wants.
   */
  block(
    request: EvidenceCardRequest,
    code: string,
    reason: string,
    now: number = Date.now(),
  ): DocketEntry {
    return this.#write((docket) => {
      const existing = docket.entries[request.docketId];
      if (existing !== undefined) return normalise(existing);

      const entry: DocketEntry = {
        request,
        status: "blocked",
        decidedAt: new Date(now).toISOString(),
        amendments: null,
        reason,
        toolUseId: null,
        decidedBy: null,
        execution: null,
        code,
      };
      docket.entries[request.docketId] = entry;
      save(this.#path, docket);
      return entry;
    });
  }

  /** Reads one entry, with expiry applied. `null` when the id was never filed. */
  read(docketId: string, now: number = Date.now()): DocketEntry | null {
    const entry = load(this.#path).entries[docketId];
    return entry === undefined ? null : project(normalise(entry), now);
  }

  /** Every entry, with expiry applied, newest deadline last. */
  list(now: number = Date.now()): DocketEntry[] {
    return Object.values(load(this.#path).entries).map((entry) => project(normalise(entry), now));
  }

  /**
   * Records a decision, guarded: only a `pending` entry that has not lapsed can be
   * decided, and only once.
   *
   * `approve` and `amend` both land on `approved` — an amendment is the reviewer's
   * values carried on the approval, not a state of its own. The refusal carries
   * the status that beat it, so a caller can tell "someone else already approved
   * this" from "the window closed"; and when the window closed, whatever the late
   * reviewer had typed is kept on the row rather than thrown away.
   */
  decide(
    docketId: string,
    decision: ReviewerDecision,
    amendments: Record<string, unknown>,
    reason: string | null,
    decidedBy: string | null = null,
    now: number = Date.now(),
  ): { ok: true; entry: DocketEntry } | { ok: false; status: DocketStatus | "unknown" } {
    return this.#write((docket) => {
      const stored = docket.entries[docketId];
      if (stored === undefined) return { ok: false as const, status: "unknown" as const };

      const current = project(normalise(stored), now);
      if (current.status !== "pending") {
        // Amendments carried by a decision that arrived too late are kept on the
        // row for resubmission rather than discarded with the refusal.
        if (current.status === "expired" && Object.keys(amendments).length > 0) {
          docket.entries[docketId] = { ...normalise(stored), amendments };
          save(this.#path, docket);
        }
        return { ok: false as const, status: current.status };
      }

      const approved = decision !== "reject";
      const decided: DocketEntry = {
        ...normalise(stored),
        status: approved ? "approved" : "rejected",
        decidedAt: new Date(now).toISOString(),
        amendments: Object.keys(amendments).length > 0 ? amendments : null,
        reason,
        decidedBy,
        execution: approved ? "unexecuted" : null,
      };
      docket.entries[docketId] = decided;
      save(this.#path, docket);
      return { ok: true as const, entry: decided };
    });
  }

  /**
   * Stamps what became of an approved write, found by the `tool_use_id` the
   * `PreToolUse` bin recorded. Only an `approved`, still-`unexecuted` row is
   * stamped, so nothing rewrites a row that already reads forward.
   */
  stamp(
    toolUseId: string,
    outcome: Exclude<ExecutionOutcome, "unexecuted">,
    now: number = Date.now(),
  ): DocketEntry | null {
    return this.#write((docket) => {
      for (const [id, stored] of Object.entries(docket.entries)) {
        const entry = normalise(stored);
        if (entry.toolUseId !== toolUseId) continue;
        if (entry.status !== "approved" || entry.execution !== "unexecuted") return entry;
        const stamped: DocketEntry = {
          ...entry,
          execution: outcome,
          decidedAt: entry.decidedAt ?? new Date(now).toISOString(),
        };
        docket.entries[id] = stamped;
        save(this.#path, docket);
        return stamped;
      }
      return null;
    });
  }
}
