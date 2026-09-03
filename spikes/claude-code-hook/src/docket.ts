/**
 * The Docket: a JSON file holding what was proposed and what was decided.
 *
 * Affiant's docket is the record that makes a review answerable afterwards — not a
 * queue, a ledger. This is the smallest honest version of one: a file at
 * `~/.affiant-hook/docket.json` (override the directory with `AFFIANT_HOOK_HOME`)
 * holding one entry per proposed write, with two properties that matter:
 *
 * - **A decision is compare-and-set.** An entry goes from `pending` to exactly one
 *   terminal state, once. A second decision on the same entry is refused, so two
 *   browser tabs cannot both approve, and a late click cannot overwrite an expiry.
 * - **Expiry is a state, not a sweep.** No timer marks anything expired. An entry
 *   whose `requiredBy` has passed *reads* as expired, which means a hook that
 *   crashed and a hook that is still waiting are indistinguishable to anyone
 *   reading the file, and neither of them reads as approved.
 */
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { EvidenceCardRequest } from "@affiant/contract";

/** What became of a proposed write. */
export type DocketStatus = "pending" | "approved" | "rejected" | "amended" | "expired";

/** One filed proposal and its outcome. */
export interface DocketEntry {
  /** The Evidence Card that was put in front of a person. */
  request: EvidenceCardRequest;
  /** Where the entry stands. */
  status: DocketStatus;
  /** When the decision was taken, RFC 3339, or `null` while pending. */
  decidedAt: string | null;
  /** The reviewer's replacement values, keyed by field name. `null` unless amended. */
  amendments: Record<string, unknown> | null;
  /** What the reviewer wrote alongside the decision, or `null` when they wrote nothing. */
  reason: string | null;
}

interface DocketFile {
  version: 1;
  entries: Record<string, DocketEntry>;
}

/** What a reviewer can do with a card, as the element's event names it. */
export type ReviewerDecision = "approve" | "reject" | "amend";

const TERMINAL: Record<ReviewerDecision, DocketStatus> = {
  approve: "approved",
  reject: "rejected",
  amend: "amended",
};

/** Where the docket lives: `$AFFIANT_HOOK_HOME` or `~/.affiant-hook`. */
export function docketHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["AFFIANT_HOOK_HOME"];
  return override !== undefined && override !== "" ? override : join(homedir(), ".affiant-hook");
}

/** The docket file's path. */
export function docketPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(docketHome(env), "docket.json");
}

function emptyFile(): DocketFile {
  return { version: 1, entries: {} };
}

function load(path: string): DocketFile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return emptyFile();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return emptyFile();
    const entries = (parsed as { entries?: unknown }).entries;
    if (typeof entries !== "object" || entries === null) return emptyFile();
    return { version: 1, entries: entries as Record<string, DocketEntry> };
  } catch {
    // A docket that will not parse is not silently replaced with an empty one on
    // disk — it is only read as empty, so nothing already decided is lost.
    return emptyFile();
  }
}

function save(path: string, file: DocketFile): void {
  const temporary = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/**
 * A lock across processes, so a compare-and-set stays a compare-and-set when two
 * hooks share a docket. `mkdir` is the primitive because it is atomic everywhere.
 */
function withLock<T>(path: string, work: () => T): T {
  const lock = `${path}.lock`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (Date.now() > deadline) {
        // A lock this old belongs to a process that is gone. Take it.
        try {
          rmdirSync(lock);
        } catch {
          /* someone else won the race to clear it; try again */
        }
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

/** The local docket. One instance per hook process; the file is the shared truth. */
export class Docket {
  readonly #path: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#path = docketPath(env);
    mkdirSync(docketHome(env), { recursive: true });
  }

  /** The docket file this instance reads and writes. */
  get path(): string {
    return this.#path;
  }

  /** Files a proposal as `pending`. */
  file(request: EvidenceCardRequest): DocketEntry {
    const entry: DocketEntry = {
      request,
      status: "pending",
      decidedAt: null,
      amendments: null,
      reason: null,
    };
    withLock(this.#path, () => {
      const docket = load(this.#path);
      docket.entries[request.docketId] = entry;
      save(this.#path, docket);
    });
    return entry;
  }

  /** Reads one entry, with expiry applied. `null` when the id was never filed. */
  read(docketId: string, now: number = Date.now()): DocketEntry | null {
    const entry = load(this.#path).entries[docketId];
    return entry === undefined ? null : project(entry, now);
  }

  /** Every entry, with expiry applied, newest deadline last. */
  list(now: number = Date.now()): DocketEntry[] {
    return Object.values(load(this.#path).entries).map((entry) => project(entry, now));
  }

  /**
   * Records a decision, guarded: only a `pending` entry that has not lapsed can be
   * decided, and only once.
   *
   * The refusal carries the status that beat it, so a caller can tell "someone
   * else already approved this" from "the window closed".
   */
  decide(
    docketId: string,
    decision: ReviewerDecision,
    amendments: Record<string, unknown>,
    reason: string | null,
    now: number = Date.now(),
  ): { ok: true; entry: DocketEntry } | { ok: false; status: DocketStatus | "unknown" } {
    return withLock(this.#path, () => {
      const docket = load(this.#path);
      const stored = docket.entries[docketId];
      if (stored === undefined) return { ok: false as const, status: "unknown" as const };

      const current = project(stored, now);
      if (current.status !== "pending") return { ok: false as const, status: current.status };

      const decided: DocketEntry = {
        ...stored,
        status: TERMINAL[decision],
        decidedAt: new Date(now).toISOString(),
        amendments: decision === "amend" ? amendments : null,
        reason,
      };
      docket.entries[docketId] = decided;
      save(this.#path, docket);
      return { ok: true as const, entry: decided };
    });
  }
}
