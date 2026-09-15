/**
 * Opaque, tagged cursors over the filing sequence.
 *
 * **Rules served: DK-3** (every list a store exposes is paged with an opaque cursor).
 *
 * Opaque has to mean *checked*, not merely *ugly*. A cursor from one list handed to
 * another, or a string a caller invented, is a loud refusal rather than a quietly
 * different page — a wrong page looks like data and a `RangeError` looks like a bug,
 * and the second is the one a caller can fix. The reference store's cursors work the
 * same way; the position inside is this store's own, so a cursor minted by one of the
 * two is not readable by the other and says so.
 *
 * @packageDocumentation
 */

/** The tag every cursor this store mints carries: the store and the cursor format. */
const CURSOR_TAG = "affiant.docket.pg.v1";

/** The lists that mint cursors. A cursor is only ever valid for the list that made it. */
export type CursorKind = "pending" | "approved-unexecuted" | "rehydrate";

/** An opaque cursor naming a position within `kind`'s list. */
export function encodeCursor(kind: CursorKind, position: string): string {
  return btoa(`${CURSOR_TAG}|${kind}|${position}`);
}

/**
 * The position `cursor` names within `kind`'s list.
 *
 * @throws RangeError when the cursor is unreadable or belongs to a different list. A
 *         `RangeError` and not an `AffiantError`: the error-code registry names the
 *         reasons the gate refuses a request, and a bad cursor is a caller's
 *         programming error rather than a request the framework declined.
 */
export function decodeCursor(cursor: string, kind: CursorKind): string {
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new RangeError("cursor is not a cursor this store minted");
  }
  const tag = `${CURSOR_TAG}|${kind}|`;
  if (!decoded.startsWith(tag)) {
    throw new RangeError(`cursor does not belong to the ${kind} list`);
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
 * @throws RangeError when the cursor is not one this list minted, or names no position.
 */
export function decodePosition(cursor: string | null | undefined, kind: CursorKind): string {
  if (cursor === undefined || cursor === null) return "0";
  return requirePosition(decodeCursor(cursor, kind));
}

/** `position` if it is a non-negative whole number written in digits. */
export function requirePosition(position: string): string {
  if (!/^\d+$/.test(position)) {
    throw new RangeError("cursor does not name a position in this list");
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
