import type { Affidavit, AffidavitField, JsonValue } from "@affiant/contract";

import type { Clock } from "../src/ports.js";
import type { DocketEntry, NewEntryInit } from "../src/docket/entry.js";
import { newEntry } from "../src/docket/entry.js";

/**
 * Fixtures shared by the Docket suites.
 *
 * Not a suite itself — `vitest.config.ts` collects `test/**\/*.test.ts`, so this
 * module is only ever imported. It runs on Node, Bun and workerd alike: no
 * filesystem, no Node global, nothing but the package's own types.
 */

/** A clock a test drives by hand, so a deadline can be pinned to the millisecond. */
export interface StubClock extends Clock {
  /** Move the clock to `instant`. */
  set(instant: string): void;
}

/** A {@link Clock} that reads `start` until a test moves it. */
export function stubClock(start: string): StubClock {
  let current = start;
  return {
    now: () => current,
    set: (instant: string) => {
      current = instant;
    },
  };
}

/** One sworn field, filled in enough to be a real Affidavit field. */
export function field(name: string, value: JsonValue): AffidavitField {
  return {
    name,
    value,
    previousValue: null,
    provenance: {
      current: {
        source: "Conversation",
        confidence: 0.9,
        evidence: `User stated: ${name}`,
        conversationTurn: 1,
      },
      prior: [],
    },
    isMandatory: false,
    kind: "text",
    allowedValues: null,
    pattern: null,
  };
}

/** An Affidavit over `names`, shaped like something a pipeline would actually file. */
export function affidavit(names: readonly string[] = ["status"]): Affidavit {
  return {
    operationType: "WriteUpdate",
    entityType: "Invoice",
    entityId: "invoice-1",
    fields: names.map((name) => field(name, `${name}-value`)),
    aggregateConfidence: 0.9,
    warnings: [],
    requiresConfirmation: true,
  };
}

/** The defaults every Docket fixture starts from. */
const BASE = {
  tenantId: "tenant-a",
  conversationId: "conv-1",
  channel: "chat",
  requirement: "ReviewerConfirmation",
  filedAt: "2026-09-04T09:00:00.000Z",
  expiresAt: "2026-09-04T09:30:00.000Z",
} as const;

/** A filed entry with `entryId`, overridable field by field. */
export function anEntry(
  entryId: string,
  overrides: Partial<Omit<NewEntryInit, "entryId">> = {},
): DocketEntry {
  return newEntry({ ...BASE, affidavit: affidavit(), entryId, ...overrides });
}

/** The ids of `entries`, in the order they were returned. */
export function ids(entries: readonly DocketEntry[]): string[] {
  return entries.map((entry) => entry.entryId);
}
