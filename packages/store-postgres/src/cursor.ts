/**
 * Opaque, tagged cursors over the filing sequence.
 *
 * **Rules served: DK-3** (every list a store exposes is paged with an opaque cursor).
 *
 * Opaque has to mean *checked*, not merely *ugly*. A cursor from one list handed to
 * another, or a string a caller invented, is a loud refusal rather than a quietly
 * different page — a wrong page looks like data and a caller error looks like a bug,
 * and the second is the one a caller can fix. The reference store's cursors work the
 * same way; the position inside is this store's own, so a cursor minted by one of the
 * two is not readable by the other and says so.
 *
 * @packageDocumentation
 */

import { AffiantCallerError } from "@affiant/core";

/** The tag every cursor this store mints carries: the store and the cursor format. */
const CURSOR_TAG = "affiant.docket.pg.v1";

/** The lists that mint cursors. A cursor is only ever valid for the list that made it. */
export type CursorKind = "pending" | "approved-unexecuted" | "rehydrate";

/** An opaque cursor naming a position within `kind`'s list. */
export function encodeCursor(kind: CursorKind, position: string): string {
  return btoa(`${CURSOR_TAG}|${kind}|${position}`);
}

/** The list a decoded cursor names as its own, when the string says so. */
function mintedFor(decoded: string): string | undefined {
  if (!decoded.startsWith(`${CURSOR_TAG}|`)) return undefined;
  const rest = decoded.slice(CURSOR_TAG.length + 1);
  const separator = rest.indexOf("|");
  return separator === -1 ? undefined : rest.slice(0, separator);
}

/**
 * The position `cursor` names within `kind`'s list.
 *
 * @throws AffiantCallerError of kind `cursor-invalid` when the cursor is unreadable or
 *         belongs to a different list, with `details.list` naming the list it was fed
 *         to and `details.mintedFor` the list it came from where the string says. A
 *         caller error (a `RangeError` subclass) and not an `AffiantError`: the
 *         error-code registry names the reasons the gate refuses a request, and a bad
 *         cursor is a caller's programming error rather than a request the framework
 *         declined.
 */
export function decodeCursor(cursor: string, kind: CursorKind): string {
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new AffiantCallerError("cursor-invalid", "cursor is not a cursor this store minted", {
      list: kind,
    });
  }
  const tag = `${CURSOR_TAG}|${kind}|`;
  if (!decoded.startsWith(tag)) {
    const from = mintedFor(decoded);
    throw new AffiantCallerError("cursor-invalid", `cursor does not belong to the ${kind} list`, {
      list: kind,
      ...(from === undefined ? {} : { mintedFor: from }),
    });
  }
  return decoded.slice(tag.length);
}

/**
 * The filing position a plain list cursor names — rows strictly after it are the next
 * page — or `"0"` to start, which no identity column ever hands out.
 *
 * The position is kept as a string all the way through because it is a Postgres
 * `bigint`, and a value past 2^53 read through a JavaScript number would silently
 * start skipping rows.
 *
 * @throws AffiantCallerError of kind `cursor-invalid` when the cursor is not one this
 *         list minted, or names no position.
 */
export function decodePosition(cursor: string | null | undefined, kind: CursorKind): string {
  if (cursor === undefined || cursor === null) return "0";
  return requirePosition(decodeCursor(cursor, kind), kind);
}

/**
 * `position` if it is a non-negative whole number written in digits.
 *
 * @param list The list the cursor was fed to, for the caller error's `details`.
 */
export function requirePosition(position: string, list: string): string {
  if (!/^\d+$/.test(position)) {
    throw new AffiantCallerError("cursor-invalid", "cursor does not name a position in this list", {
      list,
    });
  }
  return position;
}

/** Rejects a page size that would make a list unbounded or empty (RT-2). */
export function requireLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got: ${String(limit)}`);
  }
  return limit;
}
