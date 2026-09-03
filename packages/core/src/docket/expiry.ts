/**
 * Expiry, as state rather than as an event.
 *
 * **Rules served: DK-1** (an entry past `expiresAt` reads `expired` on query
 * whether or not any sweep has run), **DK-3** (the sweep is bounded, paged and
 * host-scheduled; the core owns no timer).
 *
 * There is no `setTimeout` and no `setInterval` in this package, and a test greps
 * `src/` to keep it that way. That is not tidiness — it is the rule. The shipped
 * .NET implementation runs an unbounded 30-second sweep over every pending entry on
 * every instance; a core that schedules its own work cannot run on a serverless
 * isolate at all (RT-2), and a deadline that only takes effect when a background job
 * happens to be up is a deadline a host can silently lose. So the deadline is a
 * *predicate over the row*, applied on every read, and the host's sweep
 * ({@link DocketStore.expireDue}) exists to make that state durable and to drive
 * notifications — not to make it true.
 *
 * Every function here is pure and synchronous. They take the instant as a parameter
 * rather than reading a clock, so a fixture can pin a deadline to the millisecond.
 *
 * @packageDocumentation
 */

import type { DocketEntry } from "./entry.js";

/**
 * `instant` unchanged, once it is known to be readable.
 *
 * An unreadable instant throws rather than comparing as `NaN`. A `NaN` comparison
 * is `false` in both directions, so an entry with an unparseable `expiresAt` would
 * be *permanently decidable* — the deadline would silently stop existing, which is
 * the one failure mode this module is here to prevent. A row can only acquire an
 * unreadable deadline if a caller built it by hand, and {@link newEntry} refuses to
 * do that.
 *
 * @throws RangeError when `instant` is not a date string any runtime can read.
 */
export function requireInstant(instant: string, what: string): string {
  if (Number.isNaN(Date.parse(instant))) {
    throw new RangeError(`${what} must be a readable ISO 8601 instant, got: ${instant}`);
  }
  return instant;
}

/**
 * `instant` as milliseconds since the epoch.
 *
 * @throws RangeError when `instant` is not a date string any runtime can read.
 */
export function instantMs(instant: string, what = "instant"): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) {
    throw new RangeError(`${what} must be a readable ISO 8601 instant, got: ${instant}`);
  }
  return ms;
}

/** As much of an entry as the expiry predicates read. */
export type Expirable = Pick<DocketEntry, "status" | "expiresAt">;

/**
 * Whether `entry` has passed its deadline at `now` — the predicate
 * {@link readStatus} and the sweep both apply.
 *
 * Only a `pending` entry can be due. A row that was approved or rejected before its
 * deadline stays that way forever after it, and a row already marked `expired` is
 * not due *again* — `expireDue` must not keep finding the same entries.
 *
 * The deadline is inclusive of the instant itself: an entry whose `expiresAt` is
 * exactly `now` is due. Half-open the other way would leave a one-millisecond window
 * in which the row is decidable at its own deadline, and a fixture that pins the two
 * to the same instant would then assert the wrong thing.
 *
 * @throws RangeError when `now` or `entry.expiresAt` is not a readable instant.
 */
export function isDue(entry: Expirable, now: string): boolean {
  if (entry.status !== "pending") return false;
  return instantMs(entry.expiresAt, "expiresAt") <= instantMs(now, "now");
}

/**
 * How long `entry` has left at `now`, in milliseconds.
 *
 * `0` for an entry that is due or is no longer `pending` — never a negative number.
 * A caller asking "how long is left" is deciding whether to show a countdown or to
 * stop offering the card, and a negative answer only invites a sign bug at the call
 * site.
 *
 * @throws RangeError when `now` or `entry.expiresAt` is not a readable instant.
 */
export function remainingMs(entry: Expirable, now: string): number {
  if (entry.status !== "pending") return 0;
  const left = instantMs(entry.expiresAt, "expiresAt") - instantMs(now, "now");
  return left > 0 ? left : 0;
}

/**
 * Whether `a` was filed before `b` — the total order every list, every sweep, every
 * export and the rehydration sequence (DK-5) reads in.
 *
 * `filedAt` alone is not a total order: two entries filed in the same millisecond
 * tie, and a store that let ties fall out in hash order would rehydrate a session
 * differently on each reconnect. The entry id breaks the tie, by code point, so the
 * order is the same everywhere and on every runtime.
 */
export function compareFilingOrder(
  a: Pick<DocketEntry, "filedAt" | "entryId">,
  b: Pick<DocketEntry, "filedAt" | "entryId">,
): number {
  const byInstant = instantMs(a.filedAt, "filedAt") - instantMs(b.filedAt, "filedAt");
  if (byInstant !== 0) return byInstant;
  if (a.entryId === b.entryId) return 0;
  return a.entryId < b.entryId ? -1 : 1;
}
