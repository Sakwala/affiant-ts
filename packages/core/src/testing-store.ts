/**
 * The store contract — every assertion a Docket store has to pass, written once and
 * parametrised over the store under test.
 *
 * `@affiant/core` ships an in-memory reference store, and a host running on a
 * database ships its own. The two are only interchangeable if they are measured by
 * the same assertions, so the assertions live here rather than in the reference
 * store's own suite: {@link runDocketStoreContract} and
 * {@link runSessionStoreContract} register them against whatever factory they are
 * handed, and the reference store is simply the first caller.
 *
 * ```ts
 * import { describe, it, expect, beforeAll, afterAll } from "vitest";
 * import { InMemoryDocketStore } from "@affiant/core/store-memory";
 * import { runDocketStoreContract } from "@affiant/core/testing";
 *
 * runDocketStoreContract((clock) => new InMemoryDocketStore({ clock }), {
 *   api: { describe, it, expect, beforeAll, afterAll },
 * });
 * ```
 *
 * **The test runner comes in as a parameter.** Nothing here imports `vitest`, and
 * `@affiant/core` gains no dependency — runtime, peer or optional — from carrying
 * the contract. The caller passes the four functions it already has in scope, which
 * is also what lets a store built on another runner run the same assertions.
 *
 * **A store is built once per block, and every case owns a tenant.** The factory is
 * called from the block's `beforeAll`, because a store backed by a database is
 * expensive to build and a fresh instance would not give a fresh database anyway.
 * Isolation comes from tenancy instead: each case files under a tenant id of its
 * own, which is a property the contract requires regardless (AZ-2). A case that
 * needs a second tenant is handed one.
 *
 * **The clock is the case's.** A store is built with a {@link Clock} rather than
 * handed an instant per call, so the harness owns a settable one, hands it to the
 * factory, and resets it before every case.
 *
 * Rules the cases serve: DK-1 (idempotent filing, the guarded compare-and-set,
 * expiry as queryable state, preserved amendments, execution recorded once,
 * lineage), DK-2 (an amendment's `null` clears a field and an absent key leaves it
 * alone), DK-3 (a bounded, paged, host-scheduled sweep and an opaque cursor on
 * every list), DK-4 (retention, purge and export as hooks, and a row that reads
 * forward), DK-5 (rehydration order), AZ-2 (a wrong-tenant lookup is a miss),
 * AZ-5 (an approved write nobody has reported on is never aged out), GT-4 (a
 * re-file never refreshes the deadline).
 *
 * @packageDocumentation
 */

import { PROTOCOL_VERSION } from "@affiant/contract";

import type { Attestation, DocketEntry, NewEntryInit } from "./docket/entry.js";
import { newEntry } from "./docket/entry.js";
import type {
  DocketStore,
  Page,
  Scope,
  SessionStore,
  TransitionPatch,
  TransitionResult,
} from "./docket/store.js";
import type { Affidavit, AffidavitField, JsonValue } from "./model/affidavit.js";
import { withConfidence } from "./model/affidavit.js";
import { chainOf, mintConversation } from "./model/provenance.js";
import type { Clock } from "./ports.js";

// ---------------------------------------------------------------------------
// The runner, passed in
// ---------------------------------------------------------------------------

/**
 * The matchers the contract uses.
 *
 * Declared here rather than imported so that this module names no test runner. The
 * shape is a subset of what `vitest`, `jest` and `bun:test` all expose, so passing
 * any of their `expect` functions satisfies it.
 */
export interface ContractMatchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toHaveLength(length: number): void;
  toContain(item: unknown): void;
}

/** One assertion, with its negation and its rejection form. */
export interface ContractAssertion extends ContractMatchers {
  /** The same matchers, inverted. */
  readonly not: ContractMatchers;
  /** Assertions about a rejected promise. */
  readonly rejects: {
    toThrow(expected?: ErrorConstructor): Promise<unknown>;
  };
}

/** The `expect` function the contract is written against. */
export interface ContractExpect {
  (actual: unknown, message?: string): ContractAssertion;
}

/**
 * The test runner's own API, handed in by the caller.
 *
 * Every member is declared as a method so that a runner's richer signature — a
 * `describe` that also carries `.skip`, an `it` that takes a timeout — is accepted
 * as it stands.
 */
export interface ContractRunnerApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => Promise<void> | void): void;
  beforeAll(fn: () => Promise<void> | void): void;
  afterAll(fn: () => Promise<void> | void): void;
  expect: ContractExpect;
}

/** How a contract run is configured. */
export interface StoreContractOptions<TStore, TSection extends string> {
  /** The test runner's `describe`, `it`, `beforeAll`, `afterAll` and `expect`. */
  readonly api: ContractRunnerApi;
  /** A label put in front of every block, when one store runs the contract twice. */
  readonly name?: string;
  /**
   * Case ids not to register, each of which must be one this contract defines — an
   * id nothing matches is a {@link RangeError}, because a skip that silently matches
   * nothing is a case a store stopped running and nobody noticed.
   */
  readonly skip?: readonly string[];
  /**
   * The sections to register, defaulting to all of them. Same rule as `skip`: a
   * section name this contract does not define is a {@link RangeError}.
   */
  readonly sections?: readonly TSection[];
  /**
   * Released in the block's `afterAll`, once per store the factory produced — where
   * a store holds a database handle its owner has to close.
   */
  readonly dispose?: (store: TStore) => void | Promise<void>;
}

/** Builds the store under test on the harness's own clock. */
export type DocketStoreFactory = (clock: Clock) => DocketStore | Promise<DocketStore>;

/** Builds a store that is both a Docket and the rehydration surface over it. */
export type SessionStoreFactory = (
  clock: Clock,
) => (DocketStore & SessionStore) | Promise<DocketStore & SessionStore>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A {@link Clock} a test drives by hand, so a deadline can be pinned to the millisecond. */
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
export function sampleField(name: string, value: JsonValue): AffidavitField {
  return {
    name,
    value,
    previousValue: null,
    provenance: chainOf(
      mintConversation({
        confidence: 0.9,
        at: "2026-09-04T09:00:00.000Z",
        note: `User stated: ${name}`,
        conversationTurn: 1,
      }),
    ),
    isMandatory: false,
    kind: "text",
  };
}

/**
 * An Affidavit over `names`, shaped like something a pipeline would actually file.
 *
 * Built through `withConfidence` rather than as an object literal so the three
 * numbers on it are the ones AF-2 computes, never numbers a test author typed.
 */
export function sampleAffidavit(names: readonly string[] = ["status"]): Affidavit {
  return withConfidence(
    {
      protocolVersion: PROTOCOL_VERSION,
      operationType: "update",
      entityType: "Invoice",
      entityId: "invoice-1",
      conversationTurn: 1,
      createdAt: "2026-09-04T09:00:00.000Z",
    },
    names.map((name) => sampleField(name, `${name}-value`)),
  );
}

/** The defaults every Docket fixture starts from. */
const BASE = {
  tenantId: "tenant-a",
  conversationId: "conv-1",
  channel: "chat",
  requirement: "ReviewerConfirmation",
  toolName: "update_invoice",
  filedAt: "2026-09-04T09:00:00.000Z",
  expiresAt: "2026-09-04T09:30:00.000Z",
} as const;

/** A filed entry with `entryId`, overridable field by field. */
export function sampleEntry(
  entryId: string,
  overrides: Partial<Omit<NewEntryInit, "entryId">> = {},
): DocketEntry {
  return newEntry({ ...BASE, affidavit: sampleAffidavit(), entryId, ...overrides });
}

/** The ids of `entries`, in the order they were returned. */
export function entryIds(entries: readonly DocketEntry[]): string[] {
  return entries.map((entry) => entry.entryId);
}

/**
 * One object that is both a Docket and the rehydration surface over it.
 *
 * A store built on a database implements both interfaces itself; the reference
 * pair is two objects, and this is what hands them to
 * {@link runSessionStoreContract} as one.
 */
export function withSessionStore(
  docket: DocketStore,
  sessions: SessionStore,
): DocketStore & SessionStore {
  return {
    file: (entry) => docket.file(entry),
    get: (entryId, scope) => docket.get(entryId, scope),
    transition: (entryId, scope, expected, patch) =>
      docket.transition(entryId, scope, expected, patch),
    preserveAmendments: (entryId, scope, amendments, act) =>
      docket.preserveAmendments(entryId, scope, amendments, act),
    recordExecution: (entryId, scope, outcome, detail, expected) =>
      docket.recordExecution(entryId, scope, outcome, detail, expected),
    recordSupersession: (entryId, scope, supersededBy) =>
      docket.recordSupersession(entryId, scope, supersededBy),
    listPending: (scope, page) => docket.listPending(scope, page),
    listApprovedUnexecuted: (scope, page) => docket.listApprovedUnexecuted(scope, page),
    expireDue: (now, scope, limit) => docket.expireDue(now, scope, limit),
    retention: (policy, scope, limit) => docket.retention(policy, scope, limit),
    purge: (tenantId) => docket.purge(tenantId),
    export: (scope) => docket.export(scope),
    rehydrate: (scope, page) => sessions.rehydrate(scope, page),
  };
}

// ---------------------------------------------------------------------------
// The instants every case shares
// ---------------------------------------------------------------------------

/** The instant a case starts at, and the instant every fixture is filed at. */
const NOON = "2026-09-04T09:00:00.000Z";
/** The deadline `sampleEntry` gives an entry filed at {@link NOON}. */
const DEADLINE = "2026-09-04T09:30:00.000Z";
/** One millisecond past {@link DEADLINE}: the boundary is inclusive (DK-1). */
const AFTER_DEADLINE = "2026-09-04T09:30:00.001Z";
/** A day later, for a retention cut. */
const LATE = "2026-09-05T09:00:00.000Z";

// ---------------------------------------------------------------------------
// What a case is given
// ---------------------------------------------------------------------------

/** What one contract case is handed. */
export interface ContractCaseContext<TStore> {
  /** The store under test, shared with the other cases of the same block. */
  readonly store: TStore;
  /** The harness's clock, reset to a fixed instant before this case. */
  readonly clock: StubClock;
  /** The runner's `expect`. */
  readonly expect: ContractExpect;
  /** This case's own tenant: nothing another case filed is visible in it. */
  readonly scope: Scope;
  /** A second tenant, for the cases that need one. */
  readonly otherScope: Scope;
  /** This case's tenant narrowed to one conversation. */
  conversation(conversationId: string): Scope;
  /** An entry in this case's tenant, overridable field by field. */
  entry(entryId: string, overrides?: Partial<Omit<NewEntryInit, "entryId">>): DocketEntry;
}

/** One assertion of the contract. */
interface ContractCase<TStore> {
  readonly id: string;
  readonly title: string;
  run(context: ContractCaseContext<TStore>): Promise<void>;
}

/** One block of cases, registered together against one store. */
interface ContractSection<TStore, TSection extends string> {
  readonly id: TSection;
  readonly title: string;
  readonly cases: readonly ContractCase<TStore>[];
}

/** An approval by a named person (AZ-1). */
function attestedBy(id: string, entryId: string, at = NOON): Attestation {
  return { by: { kind: "member", id }, at, entryId };
}

/** The patch an approval writes. */
function approval(entryId: string, patch: Partial<TransitionPatch> = {}): TransitionPatch {
  return {
    status: "approved",
    decision: { kind: "approve", reason: null, at: NOON },
    attestation: attestedBy("person-7", entryId),
    ...patch,
  };
}

/** Narrows a transition result to the entry it produced, failing the case if it refused. */
function applied(expect: ContractExpect, result: TransitionResult): DocketEntry {
  expect(typeof result).not.toBe("string");
  return result as DocketEntry;
}

/** Everything `export` yields for `scope`, collected. */
async function exported(store: DocketStore, scope: Scope): Promise<DocketEntry[]> {
  const out: DocketEntry[] = [];
  for await (const entry of store.export(scope)) out.push(entry);
  return out;
}

// ---------------------------------------------------------------------------
// The Docket contract
// ---------------------------------------------------------------------------

/** The blocks {@link runDocketStoreContract} registers. */
export type DocketContractSection =
  | "filing"
  | "transition"
  | "deadline"
  | "execution"
  | "lineage"
  | "sweep"
  | "paging"
  | "retention"
  | "purge"
  | "export"
  | "tenancy";

const DOCKET_SECTIONS: readonly ContractSection<DocketStore, DocketContractSection>[] = [
  {
    id: "filing",
    title: "filing is idempotent by entry id (DK-1)",
    cases: [
      {
        id: "filing/refile-keeps-the-existing-deadline",
        title: "returns the existing entry on a re-file, with its existing deadline (GT-4)",
        async run({ store, expect, entry }) {
          const first = await store.file(entry("entry-1"));
          const refiled = await store.file(
            entry("entry-1", {
              expiresAt: "2026-09-04T23:59:00.000Z",
              filedAt: "2026-09-04T09:10:00.000Z",
            }),
          );

          expect(first.created).toBe(true);
          expect(refiled.created).toBe(false);
          expect(refiled.entry.expiresAt).toBe(first.entry.expiresAt);
          expect(refiled.entry.filedAt).toBe(first.entry.filedAt);
        },
      },
      {
        id: "filing/keeps-one-entry-not-two",
        title: "keeps one entry, not two",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.file(entry("entry-1"));

          const page = await store.listPending(scope, { limit: 10 });

          expect(page.items).toHaveLength(1);
        },
      },
      {
        id: "filing/never-overwrites-the-affidavit",
        title: "never overwrites the filed Affidavit",
        async run({ store, expect, entry }) {
          await store.file(entry("entry-1", { affidavit: sampleAffidavit(["amount"]) }));
          const refiled = await store.file(
            entry("entry-1", { affidavit: sampleAffidavit(["recipient"]) }),
          );

          expect(refiled.entry.affidavit.fields.map((field) => field.name)).toEqual(["amount"]);
        },
      },
    ],
  },
  {
    id: "transition",
    title: "the guarded compare-and-set (DK-1)",
    cases: [
      {
        id: "transition/first-applies-second-is-already-decided",
        title: "applies the first transition and refuses the second as a lost race",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          const first = await store.transition("entry-1", scope, "pending", approval("entry-1"));
          const second = await store.transition("entry-1", scope, "pending", {
            status: "rejected",
            decision: { kind: "reject", reason: "too late", at: NOON },
          });

          expect(applied(expect, first).status).toBe("approved");
          expect(applied(expect, first).execution).toBe("unexecuted");
          expect(second).toBe("already-decided");

          const stored = await store.get("entry-1", scope);
          expect(stored?.status).toBe("approved");
          expect(stored?.decision).toEqual({ kind: "approve", reason: null, at: NOON });
        },
      },
      {
        id: "transition/one-of-two-interleaved-wins",
        title: "lets exactly one of two interleaved transitions win",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          const results = await Promise.all([
            store.transition("entry-1", scope, "pending", approval("entry-1")),
            store.transition("entry-1", scope, "pending", {
              status: "rejected",
              decision: { kind: "reject", reason: "no", at: NOON },
            }),
          ]);

          const refusals = results.filter((result) => typeof result === "string");
          expect(refusals).toEqual(["already-decided"]);
          expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
        },
      },
      {
        id: "transition/a-burst-has-a-single-winner",
        title: "survives a burst of interleaved decisions with a single winner",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          const results = await Promise.all(
            Array.from({ length: 25 }, (_unused, index) =>
              store.transition("entry-1", scope, "pending", {
                status: "approved",
                attestation: attestedBy(`person-${index}`, "entry-1"),
              }),
            ),
          );

          expect(results.filter((result) => typeof result !== "string")).toHaveLength(1);
          expect(results.filter((result) => result === "already-decided")).toHaveLength(24);
        },
      },
      {
        id: "transition/records-the-approver",
        title: "records the approver on the row (AZ-1)",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));

          const stored = await store.get("entry-1", scope);
          expect(stored?.attestation).toEqual({
            by: { kind: "member", id: "person-7" },
            at: NOON,
            entryId: "entry-1",
          });
          expect(stored?.decidedAt).toBe(NOON);
        },
      },
      {
        id: "transition/records-a-relay-as-member-via-relay",
        title: "records a relayed decision as member-via-relay, never as member (AZ-3)",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1", { channel: "mcp" }));
          const decided = applied(
            expect,
            await store.transition("entry-1", scope, "pending", {
              status: "approved",
              attestation: {
                by: {
                  kind: "member-via-relay",
                  memberId: "person-7",
                  relay: {
                    principal: "relay-desk",
                    channelIdentity: "slack:U024BE7LH",
                    messageId: "relay-msg-9",
                  },
                },
                at: NOON,
                entryId: "entry-1",
              },
            }),
          );

          expect(decided.attestation?.by.kind).toBe("member-via-relay");
        },
      },
      {
        id: "transition/refuses-a-self-contradicting-patch",
        title: "refuses a patch that contradicts its own status",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          await expect(
            store.transition("entry-1", scope, "pending", { status: "approved", execution: null }),
          ).rejects.toThrow(RangeError);
          await expect(
            store.transition("entry-1", scope, "pending", {
              status: "rejected",
              execution: "executed",
            }),
          ).rejects.toThrow(RangeError);
          await expect(
            store.transition("entry-1", scope, "pending", { status: "pending" as never }),
          ).rejects.toThrow(RangeError);
        },
      },
      {
        id: "transition/not-found-for-an-id-outside-the-scope",
        title: "says not-found for an id nothing in scope carries",
        async run({ store, expect, scope }) {
          expect(await store.transition("nope", scope, "pending", approval("nope"))).toBe(
            "not-found",
          );
        },
      },
      {
        id: "transition/amendment-null-is-cleared-absent-is-untouched",
        title:
          "carries an amendment map whose null is a cleared field and whose absent key is not (DK-2)",
        async run({ store, expect, scope, entry }) {
          // DK-2 lives inside the map, so it has to survive whatever a store
          // serialises that map as: a `null` value is the fact that the reviewer
          // cleared the field, and a key that is not there says nothing about the
          // field at all. A store that dropped null-valued keys on the way to the
          // database would turn "clear it" into "leave it alone".
          await store.file(entry("amended"));
          await store.file(entry("untouched"));

          await store.transition(
            "amended",
            scope,
            "pending",
            approval("amended", { amendments: { status: "paid", note: null } }),
          );
          await store.transition("untouched", scope, "pending", approval("untouched"));

          const amended = await store.get("amended", scope);
          expect(amended?.amendments).toEqual({ status: "paid", note: null });
          expect(Object.keys(amended?.amendments ?? {}).sort()).toEqual(["note", "status"]);
          expect(amended?.amendments?.["note"]).toBeNull();
          expect(Object.keys(amended?.amendments ?? {})).not.toContain("reference");

          // A patch that names no amendments leaves the row's map as it stands.
          expect((await store.get("untouched", scope))?.amendments).toBeNull();
        },
      },
    ],
  },
  {
    id: "deadline",
    title: "a decision that arrives after the deadline (DK-1)",
    cases: [
      {
        id: "deadline/reads-expired-without-a-sweep",
        title: "reads expired without any sweep, and refuses the transition as expired",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          expect((await store.get("entry-1", scope))?.status).toBe("pending");
          clock.set(AFTER_DEADLINE);

          const read = await store.get("entry-1", scope);
          expect(read?.status).toBe("expired");
          // The row left pending at its own deadline, not at the instant somebody looked.
          expect(read?.decidedAt).toBe(DEADLINE);

          expect(await store.transition("entry-1", scope, "pending", approval("entry-1"))).toBe(
            "expired",
          );
        },
      },
      {
        id: "deadline/preserves-a-late-decisions-amendments",
        title: "preserves the amendments the late decision carried, for a resubmission",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          clock.set(AFTER_DEADLINE);

          const refused = await store.transition("entry-1", scope, "pending", approval("entry-1"));
          expect(refused).toBe("expired");

          const preserved = await store.preserveAmendments(
            "entry-1",
            scope,
            { status: "paid", note: null },
            { at: AFTER_DEADLINE, by: "person-7" },
          );

          expect(typeof preserved).not.toBe("string");
          const row = preserved as DocketEntry;
          // The refused decision's own act, not the store's clock reading: a
          // resubmission binds the prefilled values to the moment the person typed
          // them (DK-1, PV-2).
          expect(row.preservedAmendments).toEqual({
            amendments: { status: "paid", note: null },
            at: AFTER_DEADLINE,
            by: "person-7",
          });
          // DK-2: a null value is a cleared field, and the key is present to say so.
          expect(Object.keys(row.preservedAmendments?.amendments ?? {})).toContain("note");
          // Nobody accepted anything, so the accepted-amendment map stays empty.
          expect(row.amendments).toBeNull();
          // The refusal stands: nothing about the decision was recorded.
          expect(row.status).toBe("expired");
          expect(row.decision).toBeNull();
          expect(row.attestation).toBeNull();
        },
      },
      {
        id: "deadline/refuses-to-preserve-on-a-live-row",
        title: "refuses to preserve amendments on a row that has not expired",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          const act = { at: NOON, by: "person-7" };

          expect(await store.preserveAmendments("entry-1", scope, { status: "paid" }, act)).toBe(
            "not-expired",
          );
          expect(await store.preserveAmendments("missing", scope, {}, act)).toBe("not-found");
        },
      },
      {
        id: "deadline/reads-the-same-swept-or-not",
        title: "reads the same whether or not the sweep has caught up",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.file(entry("entry-2"));
          clock.set(AFTER_DEADLINE);

          const unswept = await store.get("entry-1", scope);
          await store.expireDue(AFTER_DEADLINE, scope, 10);
          const swept = await store.get("entry-1", scope);

          expect(swept).toEqual(unswept);
        },
      },
      {
        id: "deadline/the-boundary-instant-reads-expired",
        title: "reads a row at exactly its deadline as expired, on every surface (DK-1)",
        async run({ store, clock, expect, scope, entry }) {
          // The deadline is inclusive of the instant itself. Half-open the other way
          // would leave a one-millisecond window in which a row is still decidable at
          // its own deadline, and every surface that reports a status would disagree
          // with the transition guard for exactly that long. The clock sits on the
          // deadline for the whole case, so a store that compared strictly would read
          // every one of these as `pending`.
          await store.file(entry("at-the-deadline"));
          clock.set(DEADLINE);

          const read = await store.get("at-the-deadline", scope);
          expect(read?.status).toBe("expired");
          expect(read?.decidedAt).toBe(DEADLINE);

          expect((await store.listPending(scope, { limit: 10 })).items).toHaveLength(0);

          expect(
            await store.transition(
              "at-the-deadline",
              scope,
              "pending",
              approval("at-the-deadline"),
            ),
          ).toBe("expired");
        },
      },
      {
        id: "deadline/sweep-dates-the-row-to-its-own-deadline",
        title: "records a swept row as having left pending at its deadline, not at the sweep",
        async run({ store, clock, expect, scope, entry }) {
          // A swept row and an unswept one past the same deadline have to be the
          // same value, or a host learns to tell whether the sweep has caught up and
          // comes to depend on it. The sweep instant is deliberately later than the
          // deadline here, so a store that stamped `now` would be caught.
          const sweptAt = "2026-09-04T11:00:00.000Z";
          await store.file(entry("entry-1"));
          clock.set(sweptAt);

          const swept = await store.expireDue(sweptAt, scope, 10);
          expect(swept.expired).toEqual(["entry-1"]);

          const row = await store.get("entry-1", scope);
          expect(row?.status).toBe("expired");
          expect(row?.decidedAt).toBe(DEADLINE);
          expect(row?.decidedAt).not.toBe(sweptAt);
        },
      },
    ],
  },
  {
    id: "execution",
    title: "execution outcome on an approved row (DK-1)",
    cases: [
      {
        id: "execution/moves-execution-without-touching-the-approval",
        title: "moves execution without touching the approval",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));

          const executed = (await store.recordExecution(
            "entry-1",
            scope,
            "executed",
            "wrote 1 row",
            "unexecuted",
          )) as DocketEntry;

          expect(executed.status).toBe("approved");
          expect(executed.execution).toBe("executed");
          expect(executed.executionDetail).toBe("wrote 1 row");
          expect(executed.attestation).not.toBeNull();
        },
      },
      {
        id: "execution/committed-is-distinguishable-from-failed",
        title: "distinguishes approved-and-committed from approved-but-failed",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.file(entry("entry-2"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));
          await store.transition("entry-2", scope, "pending", approval("entry-2"));

          await store.recordExecution("entry-1", scope, "executed", null, "unexecuted");
          await store.recordExecution(
            "entry-2",
            scope,
            "failed",
            "unique constraint",
            "unexecuted",
          );

          expect((await store.get("entry-1", scope))?.execution).toBe("executed");
          const failed = await store.get("entry-2", scope);
          expect(failed?.status).toBe("approved");
          expect(failed?.execution).toBe("failed");
          expect(failed?.executionDetail).toBe("unique constraint");
        },
      },
      {
        id: "execution/refuses-an-outcome-on-an-unapproved-row",
        title: "refuses an execution outcome on a row nobody approved",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          expect(
            await store.recordExecution("entry-1", scope, "executed", null, "unexecuted"),
          ).toBe("not-approved");
          expect(
            await store.recordExecution("missing", scope, "executed", null, "unexecuted"),
          ).toBe("not-found");
        },
      },
      {
        id: "execution/records-once-refusing-a-flip",
        title: "records an outcome once, refusing a report that would flip a committed row",
        async run({ store, expect, scope, entry }) {
          // DK-4: a recorded fact is appended to, never edited in place. DK-1: an
          // approved-and-committed write has to stay distinguishable from an
          // approved-but-failed one - which it does not, if the last caller wins.
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));
          await store.recordExecution("entry-1", scope, "executed", "invoice row 41", "unexecuted");

          const second = await store.recordExecution(
            "entry-1",
            scope,
            "failed",
            "actually it blew up",
            "unexecuted",
          );

          expect(second).toBe("execution-already-recorded");
          const row = await store.get("entry-1", scope);
          expect(row?.execution).toBe("executed");
          expect(row?.executionDetail).toBe("invoice row 41");
          expect(row?.status).toBe("approved");
        },
      },
      {
        id: "execution/refuses-the-flip-in-the-other-direction",
        title: "refuses the flip in the other direction too: failed does not become executed",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));
          await store.recordExecution(
            "entry-1",
            scope,
            "failed",
            "unique constraint",
            "unexecuted",
          );

          const second = await store.recordExecution(
            "entry-1",
            scope,
            "executed",
            "retried and it worked",
            "unexecuted",
          );

          // A host that retries a write reports once, when it knows the outcome. The
          // retries are the host's business; the Docket carries the one fact.
          expect(second).toBe("execution-already-recorded");
          const row = await store.get("entry-1", scope);
          expect(row?.execution).toBe("failed");
          expect(row?.executionDetail).toBe("unique constraint");
        },
      },
      {
        id: "execution/one-of-two-interleaved-reports-wins",
        title: "lets exactly one of two interleaved execution reports win",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));

          // Two executors reporting at once - an outbox and a retry, say. The guard
          // is a compare-and-set, so one applies and the other is refused; neither is
          // queued and neither is written on top of the other.
          const results = await Promise.all([
            store.recordExecution("entry-1", scope, "executed", "first", "unexecuted"),
            store.recordExecution("entry-1", scope, "failed", "second", "unexecuted"),
          ]);

          const refused = results.filter((result) => result === "execution-already-recorded");
          expect(refused).toHaveLength(1);
          const row = await store.get("entry-1", scope);
          expect(["executed", "failed"]).toContain(row?.execution);
          expect(row?.executionDetail).toBe(row?.execution === "executed" ? "first" : "second");
        },
      },
      {
        id: "execution/already-recorded-is-not-not-found",
        title: "refuses a second report on a row whose outcome was recorded, not a missing one",
        async run({ store, expect, scope, entry }) {
          // The three refusals are distinct answers a caller acts on differently: no
          // such row, a row nobody approved, and a row that already said what happened.
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));
          await store.recordExecution("entry-1", scope, "executed", null, "unexecuted");

          expect(await store.recordExecution("missing", scope, "failed", null, "unexecuted")).toBe(
            "not-found",
          );
          expect(await store.recordExecution("entry-1", scope, "failed", null, "unexecuted")).toBe(
            "execution-already-recorded",
          );
        },
      },
      {
        id: "execution/approved-leaves-pending-and-joins-the-executors-list",
        title: "leaves an approved row out of the pending list and in the executor's list",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", approval("entry-1"));

          expect((await store.listPending(scope, { limit: 10 })).items).toHaveLength(0);
          expect((await store.listApprovedUnexecuted(scope, { limit: 10 })).items).toHaveLength(1);

          await store.recordExecution("entry-1", scope, "executed", null, "unexecuted");
          expect((await store.listApprovedUnexecuted(scope, { limit: 10 })).items).toHaveLength(0);
        },
      },
    ],
  },
  {
    id: "lineage",
    title: "resubmission lineage (DK-1)",
    cases: [
      {
        id: "lineage/names-successor-and-predecessor",
        title: "names the successor on the superseded row and the predecessor on the new one",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.transition("entry-1", scope, "pending", {
            status: "rejected",
            decision: { kind: "reject", reason: "wrong amount", at: NOON },
          });
          await store.file(entry("entry-2", { supersedes: "entry-1" }));

          const superseded = (await store.recordSupersession(
            "entry-1",
            scope,
            "entry-2",
          )) as DocketEntry;

          expect(superseded.status).toBe("rejected");
          expect(superseded.lineage).toEqual({ supersedes: null, supersededBy: "entry-2" });
          expect((await store.get("entry-2", scope))?.lineage).toEqual({
            supersedes: "entry-1",
            supersededBy: null,
          });
        },
      },
      {
        id: "lineage/refuses-to-supersede-an-open-row",
        title: "refuses to supersede a row that is still open for a decision",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          expect(await store.recordSupersession("entry-1", scope, "entry-2")).toBe("not-terminal");
          expect(await store.recordSupersession("missing", scope, "entry-2")).toBe("not-found");
        },
      },
      {
        id: "lineage/supersedes-a-row-that-expired-unswept",
        title: "supersedes an entry that expired without ever being swept",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          clock.set(AFTER_DEADLINE);

          const superseded = (await store.recordSupersession(
            "entry-1",
            scope,
            "entry-2",
          )) as DocketEntry;

          expect(superseded.status).toBe("expired");
          expect(superseded.lineage.supersededBy).toBe("entry-2");
        },
      },
    ],
  },
  {
    id: "sweep",
    title: "expireDue is bounded and reports what is left (DK-3)",
    cases: [
      {
        id: "sweep/expires-at-most-the-limit",
        title: "expires at most the limit and says more remain",
        async run({ store, clock, expect, scope, entry }) {
          clock.set(AFTER_DEADLINE);
          await fileDueEntries(store, entry, 5);

          const first = await store.expireDue(AFTER_DEADLINE, scope, 2);

          expect(first.expired).toEqual(["entry-1", "entry-2"]);
          expect(first.more).toBe(true);
        },
      },
      {
        id: "sweep/drains-in-bounded-calls",
        title: "drains five due entries in three bounded calls",
        async run({ store, clock, expect, scope, entry }) {
          clock.set(AFTER_DEADLINE);
          await fileDueEntries(store, entry, 5);

          const first = await store.expireDue(AFTER_DEADLINE, scope, 2);
          const second = await store.expireDue(AFTER_DEADLINE, scope, 2);
          const third = await store.expireDue(AFTER_DEADLINE, scope, 2);
          const fourth = await store.expireDue(AFTER_DEADLINE, scope, 2);

          expect(first.expired).toEqual(["entry-1", "entry-2"]);
          expect(second.expired).toEqual(["entry-3", "entry-4"]);
          expect(third.expired).toEqual(["entry-5"]);
          expect(third.more).toBe(false);
          // Nothing is expired twice: a swept row is no longer due.
          expect(fourth).toEqual({ expired: [], more: false });
        },
      },
      {
        id: "sweep/expires-in-filing-order",
        title: "expires in filing order",
        async run({ store, clock, expect, scope, entry }) {
          clock.set(AFTER_DEADLINE);
          await fileDueEntries(store, entry, 4);

          const swept = await store.expireDue(AFTER_DEADLINE, scope, 10);

          expect(swept.expired).toEqual(["entry-1", "entry-2", "entry-3", "entry-4"]);
        },
      },
      {
        id: "sweep/leaves-entries-that-are-not-due",
        title: "leaves entries that are not due alone",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("due", { expiresAt: "2026-09-04T09:10:00.000Z" }));
          await store.file(entry("later", { expiresAt: "2026-09-04T23:00:00.000Z" }));

          const swept = await store.expireDue("2026-09-04T09:15:00.000Z", scope, 10);

          expect(swept.expired).toEqual(["due"]);
          expect((await store.get("later", scope))?.status).toBe("pending");
        },
      },
      {
        id: "sweep/never-sweeps-a-row-that-left-pending",
        title: "never sweeps an entry that already left pending",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("approved-1", { status: "approved" }));
          await store.file(entry("rejected-1", { status: "rejected" }));
          clock.set(AFTER_DEADLINE);

          expect(await store.expireDue(AFTER_DEADLINE, scope, 10)).toEqual({
            expired: [],
            more: false,
          });
        },
      },
      {
        id: "sweep/sweeps-only-the-scope-asked-for",
        title: "sweeps only the scope it was asked for",
        async run({ store, clock, expect, scope, entry, conversation }) {
          clock.set(AFTER_DEADLINE);
          await fileDueEntries(store, entry, 2);
          await store.file(entry("other-conv", { conversationId: "conv-2" }));

          const swept = await store.expireDue(AFTER_DEADLINE, conversation("conv-2"), 10);

          expect(swept.expired).toEqual(["other-conv"]);
          expect((await store.get("entry-1", scope))?.status).toBe("expired");
        },
      },
      {
        id: "sweep/refuses-an-unbounded-sweep",
        title: "refuses an unbounded sweep",
        async run({ store, clock, expect, scope, entry }) {
          clock.set(AFTER_DEADLINE);
          await fileDueEntries(store, entry, 1);

          await expect(store.expireDue(AFTER_DEADLINE, scope, 0)).rejects.toThrow(RangeError);
          await expect(store.expireDue(AFTER_DEADLINE, scope, -1)).rejects.toThrow(RangeError);
          await expect(store.expireDue(AFTER_DEADLINE, scope, 1.5)).rejects.toThrow(RangeError);
        },
      },
    ],
  },
  {
    id: "paging",
    title: "every list is paged with an opaque cursor (DK-3, RT-2)",
    cases: [
      {
        id: "paging/walks-the-pending-list-a-page-at-a-time",
        title: "walks the pending list a page at a time",
        async run({ store, expect, scope, entry }) {
          for (let index = 1; index <= 5; index += 1) await store.file(entry(`entry-${index}`));

          const first = await store.listPending(scope, { limit: 2 });
          const second = await store.listPending(scope, { cursor: first.cursor, limit: 2 });
          const third = await store.listPending(scope, { cursor: second.cursor, limit: 2 });

          expect(entryIds(first.items)).toEqual(["entry-1", "entry-2"]);
          expect(first.more).toBe(true);
          expect(entryIds(second.items)).toEqual(["entry-3", "entry-4"]);
          expect(entryIds(third.items)).toEqual(["entry-5"]);
          expect(third.more).toBe(false);
          expect(third.cursor).toBeNull();
        },
      },
      {
        id: "paging/the-cursor-is-opaque",
        title: "hands back a cursor a caller cannot read or guess",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          await store.file(entry("entry-2"));

          const page = await store.listPending(scope, { limit: 1 });

          expect(page.cursor).not.toBeNull();
          expect(page.cursor).not.toContain("entry-1");
        },
      },
      {
        id: "paging/refuses-a-cursor-from-another-list",
        title: "refuses a cursor minted for a different list",
        async run({ store, expect, scope, entry }) {
          // A cursor is bound to the list that produced it, so a pending cursor
          // handed to the executor's list is a caller error and not a silently
          // different page (DK-3).
          await store.file(entry("entry-1"));
          await store.file(entry("entry-2"));
          const pending = await store.listPending(scope, { limit: 1 });

          await expect(
            store.listApprovedUnexecuted(scope, { cursor: pending.cursor, limit: 1 }),
          ).rejects.toThrow(RangeError);
        },
      },
      {
        id: "paging/refuses-a-cursor-nobody-minted",
        title: "refuses a cursor nobody minted",
        async run({ store, expect, scope }) {
          await expect(
            store.listPending(scope, { cursor: "not-a-cursor", limit: 1 }),
          ).rejects.toThrow(RangeError);
        },
      },
      {
        id: "paging/refuses-an-unbounded-page",
        title: "refuses an unbounded page",
        async run({ store, expect, scope }) {
          await expect(store.listPending(scope, { limit: 0 })).rejects.toThrow(RangeError);
        },
      },
      {
        id: "paging/drops-a-row-the-moment-it-reads-expired",
        title: "drops an entry out of the pending list the moment it reads expired",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));

          expect((await store.listPending(scope, { limit: 10 })).items).toHaveLength(1);
          clock.set(AFTER_DEADLINE);
          expect((await store.listPending(scope, { limit: 10 })).items).toHaveLength(0);
        },
      },
      {
        id: "paging/a-conversation-narrows-every-list",
        title: "narrows both lists to one conversation when the scope names one",
        async run({ store, expect, scope, entry, conversation }) {
          await store.file(entry("here-pending", { conversationId: "conv-2" }));
          await store.file(entry("elsewhere-pending", { conversationId: "conv-3" }));
          await store.file(entry("here-approved", { conversationId: "conv-2" }));
          await store.file(entry("elsewhere-approved", { conversationId: "conv-3" }));
          await store.transition("here-approved", scope, "pending", approval("here-approved"));
          await store.transition(
            "elsewhere-approved",
            scope,
            "pending",
            approval("elsewhere-approved"),
          );

          const narrowed = conversation("conv-2");

          expect(entryIds((await store.listPending(narrowed, { limit: 10 })).items)).toEqual([
            "here-pending",
          ]);
          expect(
            entryIds((await store.listApprovedUnexecuted(narrowed, { limit: 10 })).items),
          ).toEqual(["here-approved"]);
          // The rows outside the conversation are still the tenant's.
          expect((await store.listPending(scope, { limit: 10 })).items).toHaveLength(2);
          expect((await store.listApprovedUnexecuted(scope, { limit: 10 })).items).toHaveLength(2);
        },
      },
    ],
  },
  {
    id: "retention",
    title: "retention ages out terminal entries in bounded pages (DK-4)",
    cases: [
      {
        id: "retention/removes-at-most-the-limit",
        title: "removes at most the limit and says whether more remain",
        async run({ store, clock, expect, scope, entry }) {
          for (const entryId of ["old-1", "old-2", "old-3"]) {
            await decide(store, clock, scope, entry, entryId, "reject", NOON);
          }
          clock.set(LATE);

          const first = await store.retention({ olderThan: LATE }, scope, 2);
          const second = await store.retention({ olderThan: LATE }, scope, 2);
          const third = await store.retention({ olderThan: LATE }, scope, 2);

          expect(first).toEqual({ removed: 2, more: true });
          expect(second).toEqual({ removed: 1, more: false });
          expect(third).toEqual({ removed: 0, more: false });
          expect(await exported(store, scope)).toHaveLength(0);
        },
      },
      {
        id: "retention/leaves-pending-and-newer-terminal-rows",
        title: "leaves a pending entry and a newer terminal one alone",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("still-open", { expiresAt: "2026-09-06T09:00:00.000Z" }));
          await decide(store, clock, scope, entry, "old", "reject", NOON);
          await decide(store, clock, scope, entry, "recent", "reject", "2026-09-05T08:59:59.000Z");
          clock.set(LATE);

          const result = await store.retention(
            { olderThan: "2026-09-04T12:00:00.000Z" },
            scope,
            10,
          );

          expect(result).toEqual({ removed: 1, more: false });
          expect(entryIds(await exported(store, scope))).toEqual(["still-open", "recent"]);
        },
      },
      {
        id: "retention/never-ages-out-an-approved-unexecuted-row",
        title: "never ages out an approved write the executor has not reported on (AZ-5)",
        async run({ store, clock, expect, scope, entry }) {
          // It is the only record that a write was authorised and has not yet
          // happened, and the Docket is the sole record of approval authority.
          await store.file(entry("awaiting-executor", { expiresAt: "2026-09-06T23:59:00.000Z" }));
          await store.transition("awaiting-executor", scope, "pending", {
            status: "approved",
            decidedAt: NOON,
          });
          clock.set(LATE);

          const result = await store.retention({ olderThan: LATE }, scope, 10);

          expect(result).toEqual({ removed: 0, more: false });
          const row = await store.get("awaiting-executor", scope);
          expect(row).not.toBeNull();
          expect(row?.execution).toBe("unexecuted");
        },
      },
      {
        id: "retention/ages-out-a-row-that-expired-unswept",
        title: "ages out an entry that expired without ever being swept",
        async run({ store, clock, expect, scope, entry }) {
          clock.set(LATE);
          await store.file(entry("never-decided"));

          const result = await store.retention({ olderThan: LATE }, scope, 10);

          expect(result).toEqual({ removed: 1, more: false });
        },
      },
      {
        id: "retention/narrows-to-one-conversation",
        title: "removes only the named conversation's rows when the scope names one (DK-4, AZ-2)",
        async run({ store, clock, expect, scope, entry, conversation }) {
          // Retention is scoped like every other operation, not by tenant alone: a
          // host ageing out one conversation's record would otherwise take the
          // tenant's whole Docket with it.
          const rows = [
            ["a-1", "conv-1"],
            ["a-2", "conv-1"],
            ["b-1", "conv-2"],
          ] as const;
          for (const [entryId, conversationId] of rows) {
            await store.file(
              entry(entryId, {
                conversationId,
                filedAt: NOON,
                expiresAt: "2026-09-06T23:59:00.000Z",
              }),
            );
            await store.transition(entryId, scope, "pending", {
              status: "rejected",
              decision: { kind: "reject", reason: null, at: NOON },
              decidedAt: NOON,
            });
          }
          clock.set(LATE);

          const result = await store.retention({ olderThan: LATE }, conversation("conv-1"), 10);

          expect(result).toEqual({ removed: 2, more: false });
          expect(entryIds(await exported(store, scope))).toEqual(["b-1"]);
        },
      },
      {
        id: "retention/refuses-an-unbounded-pass",
        title: "refuses an unbounded retention pass",
        async run({ store, clock, expect, scope }) {
          clock.set(LATE);

          await expect(store.retention({ olderThan: LATE }, scope, 0)).rejects.toThrow(RangeError);
          await expect(store.retention({ olderThan: "whenever" }, scope, 5)).rejects.toThrow(
            RangeError,
          );
        },
      },
    ],
  },
  {
    id: "purge",
    title: "purge removes a tenant and nothing else (DK-4)",
    cases: [
      {
        id: "purge/removes-the-tenant-and-nothing-else",
        title: "removes every row the tenant has and leaves the others untouched",
        async run({ store, expect, scope, otherScope, entry }) {
          await store.file(entry("a-1"));
          await store.file(entry("a-2"));
          await store.file(entry("b-1", { tenantId: otherScope.tenantId }));

          const purged = await store.purge(scope.tenantId);

          expect(purged).toEqual({ removed: 2 });
          expect(await exported(store, scope)).toHaveLength(0);
          expect(entryIds(await exported(store, otherScope))).toEqual(["b-1"]);
        },
      },
      {
        id: "purge/is-a-no-op-for-an-empty-tenant",
        title: "is a no-op for a tenant that has filed nothing",
        async run({ store, expect, scope }) {
          expect(await store.purge(`${scope.tenantId}#nobody`)).toEqual({ removed: 0 });
        },
      },
    ],
  },
  {
    id: "export",
    title: "export streams the Docket in filing order (DK-4)",
    cases: [
      {
        id: "export/yields-every-row-oldest-first",
        title: "yields every row of the scope, oldest first",
        async run({ store, expect, scope, entry }) {
          await store.file(entry("first"));
          await store.file(entry("second", { status: "approved" }));
          await store.file(entry("third", { status: "rejected" }));

          expect(entryIds(await exported(store, scope))).toEqual(["first", "second", "third"]);
        },
      },
      {
        id: "export/narrows-to-one-conversation",
        title: "narrows to one conversation when the scope names one",
        async run({ store, expect, entry, conversation }) {
          await store.file(entry("in-1"));
          await store.file(entry("elsewhere", { conversationId: "conv-2" }));
          await store.file(entry("in-2"));

          const rows = await exported(store, conversation("conv-1"));

          expect(entryIds(rows)).toEqual(["in-1", "in-2"]);
        },
      },
      {
        id: "export/applies-the-deadline",
        title: "applies the deadline to what it yields",
        async run({ store, clock, expect, scope, entry }) {
          await store.file(entry("entry-1"));
          clock.set(AFTER_DEADLINE);

          const rows = await exported(store, scope);

          expect(rows[0]?.status).toBe("expired");
        },
      },
      {
        id: "export/yields-nothing-for-an-empty-tenant",
        title: "yields nothing for a tenant that has filed nothing",
        async run({ store, expect, otherScope }) {
          expect(await exported(store, otherScope)).toHaveLength(0);
        },
      },
      {
        id: "export/yields-the-scope-and-nothing-outside-it",
        title: "yields every row the scope covers and no row outside it",
        async run({ store, expect, scope, otherScope, entry, conversation }) {
          // Both halves matter. A store that yielded a subset would let a tenant
          // asking for their record receive part of it and be told it was all of it;
          // a store that yielded a superset would hand them somebody else's.
          await store.file(entry("in-1"));
          await store.file(entry("in-2", { status: "approved" }));
          await store.file(entry("in-3", { status: "rejected" }));
          await store.file(entry("other-conversation", { conversationId: "conv-9" }));
          await store.file(entry("other-tenant", { tenantId: otherScope.tenantId }));

          expect(entryIds(await exported(store, scope))).toEqual([
            "in-1",
            "in-2",
            "in-3",
            "other-conversation",
          ]);
          expect(entryIds(await exported(store, conversation("conv-1")))).toEqual([
            "in-1",
            "in-2",
            "in-3",
          ]);
          expect(entryIds(await exported(store, otherScope))).toEqual(["other-tenant"]);
        },
      },
    ],
  },
  {
    id: "tenancy",
    title: "a tenant mismatch is a miss, not another tenant's row (AZ-2)",
    cases: [
      {
        id: "tenancy/get-in-the-wrong-tenant-is-null",
        title: "returns null for the right id in the wrong tenant",
        async run({ store, expect, scope, otherScope, entry }) {
          // A caller outside the tenant learns nothing about whether the id exists:
          // the answer is the same one a missing id gets.
          await store.file(entry("entry-1"));

          expect(await store.get("entry-1", scope)).not.toBeNull();
          expect(await store.get("entry-1", otherScope)).toBeNull();
          expect(await store.get("no-such-entry", otherScope)).toBeNull();
        },
      },
      {
        id: "tenancy/two-tenants-keep-the-same-id-apart",
        title: "keeps two tenants' entries with the same id apart",
        async run({ store, expect, scope, otherScope, entry }) {
          await store.file(entry("shared-id", { conversationId: "conv-a" }));
          await store.file(
            entry("shared-id", { tenantId: otherScope.tenantId, conversationId: "conv-b" }),
          );

          expect((await store.get("shared-id", scope))?.conversationId).toBe("conv-a");
          expect((await store.get("shared-id", otherScope))?.conversationId).toBe("conv-b");
        },
      },
      {
        id: "tenancy/every-write-from-the-wrong-tenant-is-not-found",
        title: "refuses every write from the wrong tenant as not-found",
        async run({ store, expect, scope, otherScope, entry }) {
          await store.file(entry("entry-1"));

          expect(
            await store.transition("entry-1", otherScope, "pending", { status: "rejected" }),
          ).toBe("not-found");
          expect(
            await store.preserveAmendments("entry-1", otherScope, {}, { at: NOON, by: "person-7" }),
          ).toBe("not-found");
          expect(
            await store.recordExecution("entry-1", otherScope, "executed", null, "unexecuted"),
          ).toBe("not-found");
          expect(await store.recordSupersession("entry-1", otherScope, "entry-2")).toBe(
            "not-found",
          );
          expect((await store.get("entry-1", scope))?.status).toBe("pending");
        },
      },
      {
        id: "tenancy/lists-and-exports-nothing-for-the-wrong-tenant",
        title: "lists and exports nothing for the wrong tenant",
        async run({ store, expect, otherScope, entry }) {
          await store.file(entry("entry-1"));
          await store.file(entry("entry-2", { status: "approved" }));

          expect((await store.listPending(otherScope, { limit: 10 })).items).toHaveLength(0);
          expect(
            (await store.listApprovedUnexecuted(otherScope, { limit: 10 })).items,
          ).toHaveLength(0);
          expect(await exported(store, otherScope)).toHaveLength(0);
          expect(await store.expireDue("2027-01-01T00:00:00.000Z", otherScope, 10)).toEqual({
            expired: [],
            more: false,
          });
        },
      },
      {
        id: "tenancy/narrows-to-one-conversation-within-the-tenant",
        title: "narrows to one conversation within the tenant",
        async run({ store, expect, entry, conversation }) {
          await store.file(entry("entry-1", { conversationId: "conv-1" }));
          await store.file(entry("entry-2", { conversationId: "conv-2" }));

          const narrowed = conversation("conv-2");

          expect(await store.get("entry-1", narrowed)).toBeNull();
          expect(entryIds((await store.listPending(narrowed, { limit: 10 })).items)).toEqual([
            "entry-2",
          ]);
        },
      },
    ],
  },
];

/** How a case builds an entry in its own tenant. */
type EntryBuilder = (
  entryId: string,
  overrides?: Partial<Omit<NewEntryInit, "entryId">>,
) => DocketEntry;

/** `count` entries filed in filing order, all of them due at {@link AFTER_DEADLINE}. */
async function fileDueEntries(
  store: DocketStore,
  entry: EntryBuilder,
  count: number,
): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await store.file(entry(`entry-${index}`, { filedAt: `2026-09-04T09:00:0${index}.000Z` }));
  }
}

/**
 * An entry filed and decided at `at` — and, for an approval, reported on by the
 * executor, so that it is eligible for retention at all (AZ-5).
 *
 * The clock is moved to `at` for the decision and left there; a caller ages the
 * store forward afterwards.
 */
async function decide(
  store: DocketStore,
  clock: StubClock,
  scope: Scope,
  entry: EntryBuilder,
  entryId: string,
  kind: "approve" | "reject",
  at: string,
): Promise<void> {
  clock.set(at);
  await store.file(entry(entryId, { filedAt: at, expiresAt: "2026-09-06T23:59:00.000Z" }));
  await store.transition(entryId, scope, "pending", {
    status: kind === "approve" ? "approved" : "rejected",
    decision: { kind, reason: null, at },
    decidedAt: at,
  });
  if (kind === "approve") {
    await store.recordExecution(entryId, scope, "executed", null, "unexecuted");
  }
}

// ---------------------------------------------------------------------------
// The Session contract
// ---------------------------------------------------------------------------

/** The blocks {@link runSessionStoreContract} registers. */
export type SessionContractSection = "rehydration";

/** The rehydration sequence DK-5 fixes, for the store the harness was handed. */
type SessionStoreUnderTest = DocketStore & SessionStore;

/** The order a mixed Docket rehydrates in. */
const REHYDRATION_ORDER = ["pending-1", "pending-2", "approved-1", "approved-2"];

/** A Docket holding, in filing order: pending, approved-executed, approved-unexecuted, rejected. */
async function fileMixedDocket(
  store: SessionStoreUnderTest,
  scope: Scope,
  entry: EntryBuilder,
): Promise<void> {
  await store.file(entry("pending-1"));
  await store.file(entry("approved-executed", { status: "approved" }));
  await store.file(entry("approved-1", { status: "approved" }));
  await store.file(entry("rejected-1", { status: "rejected" }));
  await store.file(entry("pending-2"));
  await store.file(entry("approved-2", { status: "approved" }));
  await store.recordExecution("approved-executed", scope, "executed", null, "unexecuted");
}

/** Every page of the rehydration sequence, walked with `limit`-sized pages. */
async function walkRehydration(
  store: SessionStoreUnderTest,
  scope: Scope,
  expect: ContractExpect,
  limit: number,
): Promise<string[]> {
  const out: DocketEntry[] = [];
  let page: Page = { limit };
  for (;;) {
    const result = await store.rehydrate(scope, page);
    out.push(...result.items);
    if (!result.more) {
      expect(result.cursor).toBeNull();
      break;
    }
    expect(result.cursor).not.toBeNull();
    page = { cursor: result.cursor, limit };
  }
  return entryIds(out);
}

const SESSION_SECTIONS: readonly ContractSection<SessionStoreUnderTest, SessionContractSection>[] =
  [
    {
      id: "rehydration",
      title: "rehydration order (DK-5)",
      cases: [
        {
          id: "rehydration/pending-before-approved-unexecuted",
          title: "returns pending entries before approved and unexecuted ones",
          async run({ store, expect, scope, entry }) {
            await fileMixedDocket(store, scope, entry);

            const page = await store.rehydrate(scope, { limit: 10 });

            expect(entryIds(page.items)).toEqual(REHYDRATION_ORDER);
            expect(page.more).toBe(false);
          },
        },
        {
          id: "rehydration/leaves-out-settled-rows",
          title: "leaves out rows that need neither a decision nor execution",
          async run({ store, expect, scope, entry }) {
            await fileMixedDocket(store, scope, entry);

            const page = await store.rehydrate(scope, { limit: 10 });

            expect(entryIds(page.items)).not.toContain("rejected-1");
            expect(entryIds(page.items)).not.toContain("approved-executed");
          },
        },
        {
          id: "rehydration/holds-the-order-at-every-page-size",
          title: "holds the order at every page size",
          async run({ store, expect, scope, entry }) {
            await fileMixedDocket(store, scope, entry);

            for (const limit of [1, 2, 3, 4, 5, 10]) {
              expect(await walkRehydration(store, scope, expect, limit)).toEqual(REHYDRATION_ORDER);
            }
          },
        },
        {
          id: "rehydration/resumes-in-the-second-group",
          title: "resumes in the second group when a page boundary drains the first",
          async run({ store, expect, scope, entry }) {
            await fileMixedDocket(store, scope, entry);

            const first = await store.rehydrate(scope, { limit: 2 });
            const second = await store.rehydrate(scope, { cursor: first.cursor, limit: 2 });

            expect(entryIds(first.items)).toEqual(["pending-1", "pending-2"]);
            expect(first.more).toBe(true);
            expect(entryIds(second.items)).toEqual(["approved-1", "approved-2"]);
            expect(second.more).toBe(false);
          },
        },
        {
          id: "rehydration/drops-a-row-that-expired-while-away",
          title: "drops an entry that expired while the client was away",
          async run({ store, clock, expect, scope, entry }) {
            await store.file(entry("pending-1"));
            await store.file(entry("approved-1", { status: "approved" }));
            clock.set(AFTER_DEADLINE);

            const page = await store.rehydrate(scope, { limit: 10 });

            expect(entryIds(page.items)).toEqual(["approved-1"]);
          },
        },
        {
          id: "rehydration/the-boundary-instant-leaves-the-pending-group",
          title: "leaves a row out of the pending group at exactly its deadline (DK-1, DK-5)",
          async run({ store, clock, expect, scope, entry }) {
            // The deadline is inclusive of the instant itself, and rehydration reports
            // what a row reads as rather than what it says: a client reconnecting on the
            // millisecond of the deadline is not offered a decision it can no longer
            // make.
            await store.file(entry("pending-1"));
            await store.file(entry("approved-1", { status: "approved" }));
            clock.set(DEADLINE);

            const page = await store.rehydrate(scope, { limit: 10 });

            expect(entryIds(page.items)).toEqual(["approved-1"]);
          },
        },
        {
          id: "rehydration/narrows-to-one-conversation",
          title: "rehydrates one conversation when the scope names one",
          async run({ store, expect, scope, entry, conversation }) {
            await store.file(entry("here", { conversationId: "conv-2" }));
            await store.file(entry("elsewhere", { conversationId: "conv-3" }));
            await store.file(
              entry("here-approved", { conversationId: "conv-2", status: "approved" }),
            );

            const page = await store.rehydrate(conversation("conv-2"), { limit: 10 });

            expect(entryIds(page.items)).toEqual(["here", "here-approved"]);
            // The row in the other conversation is still the tenant's to rehydrate.
            expect(entryIds((await store.rehydrate(scope, { limit: 10 })).items)).toEqual([
              "here",
              "elsewhere",
              "here-approved",
            ]);
          },
        },
        {
          id: "rehydration/nothing-outstanding",
          title: "returns nothing for a session with nothing outstanding",
          async run({ store, expect, scope }) {
            const page = await store.rehydrate(scope, { limit: 10 });

            expect(page).toEqual({ items: [], cursor: null, more: false });
          },
        },
        {
          id: "rehydration/refuses-a-foreign-cursor-and-an-unbounded-page",
          title: "refuses a cursor from another list and an unbounded page",
          async run({ store, expect, scope, entry }) {
            await fileMixedDocket(store, scope, entry);
            const pending = await store.listPending(scope, { limit: 1 });

            await expect(
              store.rehydrate(scope, { cursor: pending.cursor, limit: 2 }),
            ).rejects.toThrow(RangeError);
            await expect(store.rehydrate(scope, { limit: 0 })).rejects.toThrow(RangeError);
          },
        },
      ],
    },
  ];

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Every block {@link runDocketStoreContract} registers, in registration order. */
export const DOCKET_CONTRACT_SECTIONS: readonly DocketContractSection[] = DOCKET_SECTIONS.map(
  (section) => section.id,
);

/** Every block {@link runSessionStoreContract} registers, in registration order. */
export const SESSION_CONTRACT_SECTIONS: readonly SessionContractSection[] = SESSION_SECTIONS.map(
  (section) => section.id,
);

/**
 * One case of a contract, as a caller sees it from outside.
 *
 * `id` is what `skip` names; `block` and `title` are the two names the case is
 * registered under, which is what lets a caller check that a suite registered the
 * cases it was supposed to rather than that it meant to.
 */
export interface ContractCaseSummary {
  /** The id `skip` names. Stable across releases. */
  readonly id: string;
  /** The block the case belongs to, which `sections` names. */
  readonly section: string;
  /** The name of the `describe` the case is registered under, without any label. */
  readonly block: string;
  /** The name the case is registered as. */
  readonly title: string;
}

/** Every case {@link runDocketStoreContract} registers, in registration order. */
export const DOCKET_CONTRACT_CASES: readonly ContractCaseSummary[] = DOCKET_SECTIONS.flatMap(
  (section) =>
    section.cases.map((one) => ({
      id: one.id,
      section: section.id,
      block: section.title,
      title: one.title,
    })),
);

/** Every case {@link runSessionStoreContract} registers, in registration order. */
export const SESSION_CONTRACT_CASES: readonly ContractCaseSummary[] = SESSION_SECTIONS.flatMap(
  (section) =>
    section.cases.map((one) => ({
      id: one.id,
      section: section.id,
      block: section.title,
      title: one.title,
    })),
);

/**
 * Register `sections` against `factory`, one block per section.
 *
 * A `skip` or `sections` entry naming nothing is a {@link RangeError} rather than a
 * silent no-op: a store that stopped running a case because its id was misspelled
 * would report a green contract run it never made.
 */
function registerContract<TStore, TSection extends string>(
  sections: readonly ContractSection<TStore, TSection>[],
  factory: (clock: Clock) => TStore | Promise<TStore>,
  options: StoreContractOptions<TStore, TSection>,
): void {
  const { api } = options;
  const known = new Set(sections.flatMap((section) => section.cases.map((one) => one.id)));
  for (const id of options.skip ?? []) {
    if (!known.has(id)) {
      throw new RangeError(`skip names ${id}, which is not a case of this contract`);
    }
  }

  const sectionIds = new Set(sections.map((section) => section.id as string));
  for (const id of options.sections ?? []) {
    if (!sectionIds.has(id)) {
      throw new RangeError(`sections names ${id}, which is not a section of this contract`);
    }
  }

  const selected =
    options.sections === undefined
      ? sections
      : sections.filter((section) => options.sections?.includes(section.id) === true);
  const skipped = new Set(options.skip ?? []);
  const label = options.name === undefined ? "" : `${options.name}: `;

  for (const section of selected) {
    const cases = section.cases.filter((one) => !skipped.has(one.id));
    if (cases.length === 0) continue;

    api.describe(`${label}${section.title}`, () => {
      // One store per block, not per case: a store backed by a database is
      // expensive to build, and a second instance would share the first one's rows
      // anyway. Cases are kept apart by tenancy, which the contract requires in any
      // event (AZ-2).
      const held: { store: TStore | null } = { store: null };
      const clock = stubClock(NOON);

      api.beforeAll(async () => {
        held.store = await factory(clock);
      });
      api.afterAll(async () => {
        const store = held.store;
        held.store = null;
        if (store !== null && options.dispose !== undefined) await options.dispose(store);
      });

      for (const one of cases) {
        api.it(one.title, async () => {
          const store = held.store;
          if (store === null) {
            throw new Error(`the store factory produced nothing for ${one.id}`);
          }
          clock.set(NOON);
          await one.run(caseContext(store, clock, api.expect, one.id));
        });
      }
    });
  }
}

/** What a case is handed: its own tenant, the harness's clock and the runner's `expect`. */
function caseContext<TStore>(
  store: TStore,
  clock: StubClock,
  expect: ContractExpect,
  caseId: string,
): ContractCaseContext<TStore> {
  const tenantId = caseId;
  const otherTenantId = `${caseId}#other`;
  return {
    store,
    clock,
    expect,
    scope: { tenantId },
    otherScope: { tenantId: otherTenantId },
    conversation: (conversationId: string) => ({ tenantId, conversationId }),
    entry: (entryId, overrides = {}) => sampleEntry(entryId, { tenantId, ...overrides }),
  };
}

/**
 * Register the Docket store contract against `factory`.
 *
 * The factory is called once per block with the harness's clock, and may be async —
 * a store backed by a database is built from a connection the caller opened. Pass
 * `dispose` to release it when the block ends.
 */
export function runDocketStoreContract(
  factory: DocketStoreFactory,
  options: StoreContractOptions<DocketStore, DocketContractSection>,
): void {
  registerContract(DOCKET_SECTIONS, factory, options);
}

/**
 * Register the rehydration contract (DK-5) against `factory`.
 *
 * The factory returns one object that is both the Docket and the rehydration
 * surface over it, because the cases file the rows they then rehydrate. A pair of
 * separate reference objects is joined by {@link withSessionStore}.
 */
export function runSessionStoreContract(
  factory: SessionStoreFactory,
  options: StoreContractOptions<SessionStoreUnderTest, SessionContractSection>,
): void {
  registerContract(SESSION_SECTIONS, factory, options);
}
