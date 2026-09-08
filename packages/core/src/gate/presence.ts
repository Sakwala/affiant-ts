/**
 * Where a value's text sits in the turn a person typed, if it sits there at all
 * (PV-3).
 *
 * PV-3 grades an inferred field `Conversation` when the value is literally present in
 * the utterance. That is a property of two strings, so the implementation establishes
 * it by looking, and an inference port's own `presence` claim is a hint that is
 * verified the same way or not honoured at all.
 *
 * **The rule, stated once so a second implementation can implement the same
 * sentence.** The *value text* is the text the span digest is taken over: a string is
 * itself, a number is SR-1's canonical rendering of it, a boolean is `true` or
 * `false`. A value a field cannot carry — `null`, an object, an array, the empty
 * string, or a number the runtime parsed as infinity or NaN — is *nothing reported*:
 * it has no value text, and the gate merges no such field at all. A *hit* is an
 * occurrence of the value text in the utterance under the comparison below, whose
 * neighbouring code points are absent or are none of a letter (`L*`), a mark (`M*`), a
 * decimal digit (`Nd`) or connector punctuation (`Pc`). The first hit wins, unless the
 * port supplied a span that is itself a hit — the utterance at that span says what the
 * port said it says *and* its neighbours pass the same test — in which case that span
 * is the hit. A whitespace-only value text never hits; an empty utterance is an
 * utterance, and nothing hits in it.
 *
 * **The comparison folds ASCII case and nothing else.** Two code points match when
 * they are equal, or when both are ASCII letters (`A`–`Z` against `a`–`z`) that differ
 * only in case. Every other code point compares exactly: no culture, no normalisation,
 * nothing ignorable, and no case mapping read from the runtime's Unicode data. The
 * fold stops at ASCII because no runtime's own case mapping is a single function to
 * state a rule in — .NET 10, Node 24 and `UnicodeData.txt` disagree over U+0131 and
 * over 28 Greek code points with ypogegrammeni, and two runtimes ship two Unicode
 * versions — so a fold read from a runtime would have the two implementations
 * implement two different functions. The cost is on the record: a case variant outside
 * ASCII does not hit (a port's `критический` does not find a typed `Критический`, and
 * is `Inferred`), while an exact echo in any script does.
 *
 * Offsets and lengths are in UTF-16 code units, which is what the `utterance-span`
 * binding records. A *neighbour*, though, is a whole code point: a surrogate pair is
 * read as the one character it is, so a value abutting a letter outside the Basic
 * Multilingual Plane is no more a hit than one abutting an ASCII letter, and no hit
 * ever begins or ends inside a pair. A combining mark blocks a hit for the same reason
 * as a letter — the grapheme the utterance draws there is not the word the value
 * spells (`Cafe` inside a decomposed `Café`) — and `_` blocks one because it joins an
 * identifier (`WZ_BRN`). The four categories are read from this runtime's own Unicode
 * database, and a code point it leaves unassigned is a boundary.
 *
 * `Sakwala/affiant`'s `Affiant.Core.Services.UtterancePresence` is the same sentence
 * in C#, and the two are held equivalent by the protocol's fixtures.
 *
 * @packageDocumentation
 */

import type { JsonValue } from "../model/affidavit.js";
import { canonicalNumber } from "../model/canonical.js";
import type { UtteranceSpan } from "../ports.js";

/** An occurrence of the value text in the utterance, in UTF-16 code units. */
export interface UtteranceHit {
  /** Where the occurrence starts. */
  readonly offset: number;
  /** How long it is. */
  readonly length: number;
}

/**
 * A code point that joins what stands beside it into one word: a letter (`L*`), a mark
 * (`M*`), a decimal digit (`Nd`) or connector punctuation (`Pc`). PV-3's four
 * categories, read the same way in both implementations.
 */
const JOINS_A_TOKEN = /[\p{L}\p{M}\p{Nd}\p{Pc}]/u;

/**
 * Nothing but whitespace, over the same set `char.IsWhiteSpace` reads in .NET: the
 * three separator categories (`Zs`, and the line and paragraph separators U+2028 and
 * U+2029) plus six control characters. Written out rather than left to `\s` so that
 * the sibling implementation and this one agree on which value texts never hit.
 */
const WHITESPACE_ONLY = /^[\t\n\v\f\r\u0085\u2028\u2029\p{Zs}]*$/u;

/**
 * The text a value is looked for as — a string is itself, a number is SR-1's canonical
 * rendering of it, a boolean is `true` or `false` — or `null` when the port reported
 * **nothing** for the field.
 *
 * `null`, an object, an array and the empty string are not values a field can carry,
 * and a number the runtime parsed as infinity or NaN has no canonical rendering (SR-1
 * refuses it), so for each of them the port reported nothing: the gate merges no such
 * field, mints no tag, and the field stays whatever it already was — `Empty` under
 * AF-1 where nothing else set it. A whitespace-only string **is** a value: it is filed
 * as the port reported it, and never hits.
 */
export function utteranceTextOf(value: JsonValue): string | null {
  if (typeof value === "string") return value.length === 0 ? null : value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? canonicalNumber(value) : null;
  return null;
}

/**
 * `text` with every ASCII lower-case letter written as its upper-case one, and every
 * other code point left exactly as it is.
 *
 * The fold is a function of the string alone — no runtime's case table is consulted —
 * and it maps one code unit to one code unit, so an offset into the fold is an offset
 * into the utterance.
 */
function fold(text: string): string {
  let folded = "";
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    folded +=
      unit >= 0x61 /* a */ && unit <= 0x7a /* z */
        ? String.fromCharCode(unit - 32)
        : text.charAt(index);
  }
  return folded;
}

/** Whether the code point beginning at `index` joins what stands beside it. */
function joinsAt(text: string, index: number): boolean {
  const codePoint = text.codePointAt(index);
  if (codePoint === undefined) return false;
  return JOINS_A_TOKEN.test(String.fromCodePoint(codePoint));
}

/**
 * Whether the occurrence at `[at, end)` is a hit: it splits no surrogate pair, and a
 * boundary stands on each side of it.
 *
 * A hit never begins or ends **inside** a pair. An occurrence whose first code unit is
 * the trailing half of one, or whose last is the leading half of one, names half a
 * character: the span's digest would be taken over bytes the utterance does not
 * contain, which is the opposite of what PV-2 asks a binding to point at.
 */
function isHit(utterance: string, at: number, end: number): boolean {
  return (
    !splitsASurrogatePair(utterance, at, end) &&
    isBoundaryBefore(utterance, at) &&
    (end >= utterance.length || !joinsAt(utterance, end))
  );
}

/** Whether `[at, end)` begins or ends part-way through a surrogate pair. */
function splitsASurrogatePair(utterance: string, at: number, end: number): boolean {
  return isLowSurrogatePairedBefore(utterance, at) || isLowSurrogatePairedBefore(utterance, end);
}

/** Whether the code unit at `index` is a low surrogate whose high half sits before it. */
function isLowSurrogatePairedBefore(utterance: string, index: number): boolean {
  if (index <= 0 || index >= utterance.length) return false;
  const unit = utterance.charCodeAt(index);
  const before = utterance.charCodeAt(index - 1);
  return unit >= 0xdc00 && unit <= 0xdfff && before >= 0xd800 && before <= 0xdbff;
}

/** Whether nothing, or a code point that does not join, sits immediately before `at`. */
function isBoundaryBefore(utterance: string, at: number): boolean {
  if (at <= 0) return true;
  // A code point, not a code unit: step back onto the high surrogate so the pair is
  // read as the single character it is.
  let index = at - 1;
  const unit = utterance.charCodeAt(index);
  if (unit >= 0xdc00 && unit <= 0xdfff && index > 0) {
    const before = utterance.charCodeAt(index - 1);
    if (before >= 0xd800 && before <= 0xdbff) index -= 1;
  }
  return !joinsAt(utterance, index);
}

/**
 * The span of `utterance` the value was read from, or `null` when the value is not
 * literally present.
 *
 * @param utterance The current turn's user text, unmodified. Earlier turns are not
 *        searched: the `utterance-span` binding has no message reference, so a hit in
 *        an earlier turn could not be bound.
 * @param valueText The value text, from {@link utteranceTextOf}.
 * @param hint The span the port reported, or `null`. It is used only when it is itself
 *        a hit; a span that is not — its text is not the value, or it sits inside a
 *        longer token — is discarded, and the search then runs from the start as if
 *        the port had named none.
 */
export function locateInUtterance(
  utterance: string,
  valueText: string,
  hint: UtteranceSpan | null,
): UtteranceHit | null {
  if (WHITESPACE_ONLY.test(valueText)) return null;

  const foldedUtterance = fold(utterance);
  const foldedValue = fold(valueText);

  if (hint !== null && Number.isInteger(hint.start) && Number.isInteger(hint.end)) {
    const length = hint.end - hint.start;
    if (
      hint.start >= 0 &&
      length >= 0 &&
      hint.start <= utterance.length - length &&
      foldedUtterance.slice(hint.start, hint.end) === foldedValue &&
      isHit(utterance, hint.start, hint.end)
    ) {
      return { offset: hint.start, length };
    }
  }

  for (let from = 0; from <= foldedUtterance.length - foldedValue.length;) {
    const at = foldedUtterance.indexOf(foldedValue, from);
    if (at < 0) return null;
    if (isHit(utterance, at, at + foldedValue.length)) {
      return { offset: at, length: valueText.length };
    }
    from = at + 1;
  }

  return null;
}
