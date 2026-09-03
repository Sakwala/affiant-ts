import { describe, expect, it } from "vitest";

import type { AmendmentMap } from "@affiant/contract";

import { amendmentTag } from "../src/model/amendments.js";
import type { ReviewerAct } from "../src/model/amendments.js";
import {
  applyAmendmentsForCanonical,
  canonicalHash,
  canonicalJson,
  canonicalString,
  canonicalize,
  sha256Hex,
} from "../src/model/canonical.js";
import type { CanonicalInput, CanonicalizeOptions } from "../src/model/canonical.js";

import { canonicalVector, canonicalVectors } from "./fixtures/canonical.generated.js";
import type { CanonicalVector } from "./fixtures/canonical.generated.js";

/**
 * SR-1, SR-2 and RT-1 — the canonical form of an Affidavit and its accepted
 * amendments, the SHA-256 over it, and money as a decimal string.
 *
 * Runs unchanged on Node, on Bun and inside workerd (RT-1); the byte vectors are
 * the same vectors a conformance driver will hand a second implementation.
 *
 * **Why an independent canonicalizer lives in this file.** A test that compares an
 * implementation against expected values that implementation produced proves only
 * that it is deterministic. So the vectors are checked twice: once against the
 * committed expectations, and once against {@link independentCanonical} below — a
 * second canonicalizer written from SR-1 with no code in common with `src/`. It
 * sorts keys by comparing arrays of code points instead of stepping two iterators,
 * escapes strings character by character instead of delegating to
 * `JSON.stringify`, and places the decimal point with BigInt arithmetic instead of
 * slicing a digit string. Where the two agree, the agreement means something.
 * (`test/node/canonical-vectors.test.ts` adds a third path for the hashes:
 * `sha256sum` and `node:crypto` over the same bytes.)
 */

// ---------------------------------------------------------------------------
// The independent canonicalizer — a second reading of SR-1, sharing no code
// ---------------------------------------------------------------------------

/** Every code point of `text`, as numbers. */
function codePoints(text: string): number[] {
  return Array.from(text, (character) => character.codePointAt(0) ?? 0);
}

/** Lexicographic order over code-point arrays: SR-1's key order, computed differently. */
function byCodePointArray(left: string, right: string): number {
  const a = codePoints(left);
  const b = codePoints(right);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x - y;
  }
  return a.length - b.length;
}

const SHORT_ESCAPES: ReadonlyMap<number, string> = new Map([
  [0x08, "\\b"],
  [0x09, "\\t"],
  [0x0a, "\\n"],
  [0x0c, "\\f"],
  [0x0d, "\\r"],
  [0x22, '\\"'],
  [0x5c, "\\\\"],
]);

/** JSON string escaping, written out rather than delegated to `JSON.stringify`. */
function escapeString(text: string): string {
  let out = '"';
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    const short = SHORT_ESCAPES.get(unit);
    if (short !== undefined) {
      out += short;
    } else if (unit < 0x20) {
      out += `\\u${unit.toString(16).padStart(4, "0")}`;
    } else if (unit >= 0xd800 && unit <= 0xdfff) {
      // A surrogate: written as itself when it is half of a valid pair, escaped
      // when it is unpaired, which is what a well-formed JSON serializer does.
      const paired =
        unit <= 0xdbff
          ? isTrailSurrogate(text.charCodeAt(index + 1))
          : isLeadSurrogate(text.charCodeAt(index - 1));
      out += paired ? text[index] : `\\u${unit.toString(16).padStart(4, "0")}`;
    } else {
      out += text[index];
    }
  }
  return `${out}"`;
}

function isLeadSurrogate(unit: number): boolean {
  return Number.isInteger(unit) && unit >= 0xd800 && unit <= 0xdbff;
}

function isTrailSurrogate(unit: number): boolean {
  return Number.isInteger(unit) && unit >= 0xdc00 && unit <= 0xdfff;
}

/**
 * SR-1's number form, reached a different way: the shortest round-trip digits, with
 * the decimal point placed by BigInt arithmetic when the exponent is positive and by
 * `toFixed` when it is negative.
 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("non-finite");
  if (Object.is(value, -0)) return "0";
  const shortest = `${value}`;
  const marker = shortest.indexOf("e");
  if (marker === -1) return shortest;

  const mantissa = shortest.slice(0, marker);
  const exponent = Number.parseInt(shortest.slice(marker + 1), 10);
  const point = mantissa.indexOf(".");
  const fractionLength = point === -1 ? 0 : mantissa.length - point - 1;

  if (exponent < 0) {
    const decimals = fractionLength + Math.abs(exponent);
    if (decimals > 100) throw new RangeError("beyond toFixed");
    return trimTrailingZeros(value.toFixed(decimals));
  }
  const digits = BigInt(mantissa.replace(".", ""));
  const shift = BigInt(exponent - fractionLength);
  return (digits * 10n ** shift).toString();
}

function trimTrailingZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

/** SR-1, read a second time. Throws on anything the rule gives no form for. */
function independentCanonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number") return formatNumber(value);
  if (typeof value !== "object") throw new TypeError(`no canonical form for ${typeof value}`);
  if (Array.isArray(value)) {
    return `[${value.map((element) => independentCanonical(element)).join(",")}]`;
  }
  const record = value as { readonly [key: string]: unknown };
  const pairs: string[] = [];
  for (const key of Object.keys(record).sort(byCodePointArray)) {
    const property = record[key];
    if (property === undefined) continue;
    pairs.push(`${escapeString(key)}:${independentCanonical(property)}`);
  }
  return `{${pairs.join(",")}}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const decoder = new TextDecoder();

/** The vector's input and amendments, in the shape the entry points take. */
function argumentsOf(vector: CanonicalVector): {
  input: CanonicalInput;
  amendments: AmendmentMap | null;
  options: CanonicalizeOptions | undefined;
} {
  return {
    input: vector.input as CanonicalInput,
    amendments: vector.amendments as AmendmentMap | null,
    options: vector.reviewerAct === null ? undefined : { reviewerAct: vector.reviewerAct },
  };
}

/** The same data with every object's keys inserted in the opposite order. */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (typeof value !== "object" || value === null) return value;
  const record = value as { readonly [key: string]: unknown };
  const rebuilt: { [key: string]: unknown } = {};
  for (const key of Object.keys(record).reverse()) rebuilt[key] = reverseKeyOrder(record[key]);
  return rebuilt;
}

// ---------------------------------------------------------------------------
// The vectors
// ---------------------------------------------------------------------------

describe("canonical byte vectors (SR-1)", () => {
  it("carries the seven committed vectors", () => {
    expect(canonicalVectors.length).toBe(7);
    expect(new Set(canonicalVectors.map((vector) => vector.id)).size).toBe(7);
  });

  for (const vector of canonicalVectors) {
    describe(vector.id, () => {
      const { input, amendments, options } = argumentsOf(vector);

      it("writes the committed canonical bytes", () => {
        const bytes = canonicalize(input, amendments, options);

        expect(decoder.decode(bytes)).toBe(vector.expectedBytesUtf8);
        expect(canonicalString(input, amendments, options)).toBe(vector.expectedBytesUtf8);
      });

      it("hashes to the committed SHA-256", async () => {
        await expect(canonicalHash(input, amendments, options)).resolves.toBe(
          vector.expectedSha256,
        );
      });

      it("agrees with an independently written canonicalizer", () => {
        const amended =
          amendments === null || Object.keys(amendments).length === 0
            ? input
            : applyAmendmentsForCanonical(input, amendments, vector.reviewerAct as ReviewerAct);

        expect(independentCanonical(amended)).toBe(vector.expectedBytesUtf8);
      });

      it("parses back to the value that was canonicalized", () => {
        const amended =
          amendments === null || Object.keys(amendments).length === 0
            ? input
            : applyAmendmentsForCanonical(input, amendments, vector.reviewerAct as ReviewerAct);

        expect(JSON.parse(vector.expectedBytesUtf8)).toEqual(JSON.parse(JSON.stringify(amended)));
      });

      it("is stable across a repeat and across key order", () => {
        const once = canonicalString(input, amendments, options);
        const twice = canonicalString(input, amendments, options);
        const permuted = canonicalString(
          reverseKeyOrder(input) as CanonicalInput,
          amendments,
          options,
        );

        expect(twice).toBe(once);
        expect(permuted).toBe(once);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

describe("the canonical form (SR-1)", () => {
  it("sorts keys by Unicode code point, not by UTF-16 code unit", () => {
    // U+E000 is below U+1F600 as a code point and above its leading surrogate
    // (0xD83D) as a code unit, so the two orders disagree here and nowhere in a
    // Latin-script Affidavit.
    const written = canonicalJson({ "\u{1f600}": 1, "\ue000": 2 });

    expect(written).toBe('{"\ue000":2,"\u{1f600}":1}');
    expect(written.indexOf("\ue000")).toBeLessThan(written.indexOf("\u{1f600}"));
  });

  it("writes no insignificant whitespace", () => {
    expect(canonicalJson({ b: [1, 2], a: { c: null } })).toBe('{"a":{"c":null},"b":[1,2]}');
  });

  it("writes null and omits a property whose value is undefined", () => {
    expect(canonicalJson({ kept: null, dropped: undefined, also: 1 })).toBe(
      '{"also":1,"kept":null}',
    );
  });

  it("keeps array order, which is data and never sorted", () => {
    expect(canonicalJson(["c", "a", "b"])).toBe('["c","a","b"]');
  });

  it("escapes only what JSON requires, and leaves non-ASCII as UTF-8", () => {
    const written = canonicalJson({ v: 'q" b\\ t\t n\n a/b \u0001 é \u{1f600}' });

    expect(written).toBe('{"v":"q\\" b\\\\ t\\t n\\n a/b \\u0001 é \u{1f600}"}');
    expect(written).not.toContain("\\u00e9");
    expect(written).not.toContain("\\/");
  });

  it("encodes the form as UTF-8, so one accented letter is two bytes", () => {
    const document = '{"fields":[{"name":"Note","value":"é"}]}';
    const bytes = canonicalize({ fields: [{ name: "Note", value: "é" }] });

    expect(bytes).toEqual(new TextEncoder().encode(document));
    expect(bytes.length).toBe(document.length + 1);
  });

  it("writes numbers positionally, with no exponent and no negative zero", () => {
    expect(canonicalJson({ n: 1.0 })).toBe('{"n":1}');
    expect(canonicalJson({ n: -0 })).toBe('{"n":0}');
    expect(canonicalJson({ n: 0.1 + 0.2 })).toBe('{"n":0.30000000000000004}');
    expect(canonicalJson({ n: 1e21 })).toBe('{"n":1000000000000000000000}');
    expect(canonicalJson({ n: 1e-7 })).toBe('{"n":0.0000001}');
    expect(canonicalJson({ n: -1.2345e-8 })).toBe('{"n":-0.000000012345}');
  });

  it("writes the shortest round-trip digits, not the double's exact value", () => {
    // The exact value of this double is 123456789012345685803008; the shortest
    // decimal that parses back to it is 1.2345678901234569e23. SR-1 asks for the
    // shortest, so the digits are those, with the point moved.
    expect(canonicalJson({ n: 1.2345678901234569e23 })).toBe('{"n":123456789012345690000000}');
    expect(Number(JSON.parse(canonicalJson({ n: 1.2345678901234569e23 })).n)).toBe(
      1.2345678901234569e23,
    );
  });

  it("refuses a non-finite number with a RangeError", () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(RangeError);
    expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => canonicalJson({ n: Number.NEGATIVE_INFINITY })).toThrow(/SR-1/);
  });

  it("refuses undefined in an array position rather than writing null", () => {
    expect(() => canonicalJson([1, undefined, 3])).toThrow(TypeError);
    expect(() => canonicalJson([1, undefined, 3])).toThrow(/SR-1/);
  });

  it("refuses values JSON has no form for", () => {
    expect(() => canonicalJson({ v: 1n })).toThrow(/bigint/);
    expect(() => canonicalJson({ v: new Date(0) })).toThrow(/\[object Date\]/);
    expect(() => canonicalJson({ v: new Map() })).toThrow(/\[object Map\]/);
    expect(() => canonicalJson({ v: new Uint8Array(1) })).toThrow(/\[object Uint8Array\]/);
    expect(() => canonicalJson({ v: () => 1 })).toThrow(/function/);
    expect(() => canonicalJson({ v: Symbol("s") })).toThrow(/symbol/);
  });

  it("refuses a cycle", () => {
    const looped: { self?: unknown } = {};
    looped.self = looped;

    expect(() => canonicalJson(looped)).toThrow(/cycle/);
  });

  it("ignores symbol keys and inherited properties, as JSON does", () => {
    const parent = { inherited: 1 };
    const child = Object.create(parent) as { own?: number };
    child.own = 2;

    expect(canonicalJson(child)).toBe('{"own":2}');
    expect(canonicalJson({ own: 1, [Symbol("s")]: 2 })).toBe('{"own":1}');
  });
});

// ---------------------------------------------------------------------------
// Money (SR-2)
// ---------------------------------------------------------------------------

describe("money in the canonical form (SR-2)", () => {
  it("writes money as its two strings", () => {
    expect(canonicalJson({ v: { currency: "GBP", amount: "4000.10" } })).toBe(
      '{"v":{"amount":"4000.10","currency":"GBP"}}',
    );
  });

  it("refuses a money-shaped value whose amount is a number", () => {
    expect(() => canonicalJson({ v: { amount: 4000.1, currency: "GBP" } })).toThrow(TypeError);
    expect(() => canonicalJson({ v: { amount: 4000.1, currency: "GBP" } })).toThrow(/SR-2/);
  });

  it("refuses a money-shaped value whose amount is not a decimal string", () => {
    expect(() => canonicalJson({ amount: "1e3", currency: "GBP" })).toThrow(/SR-2/);
    expect(() => canonicalJson({ amount: "1,000", currency: "GBP" })).toThrow(/SR-2/);
  });

  it("leaves an unrelated object carrying an amount alone", () => {
    // `currency` is not an ISO 4217 shape, so this is not money and not SR-2's
    // business: a rule that fired here would refuse legitimate host data.
    expect(canonicalJson({ amount: 3, currency: "widgets" })).toBe(
      '{"amount":3,"currency":"widgets"}',
    );
  });
});

// ---------------------------------------------------------------------------
// Amendments (SR-1, DK-2, PV-2)
// ---------------------------------------------------------------------------

describe("amendments in the canonical form (SR-1, DK-2, PV-2)", () => {
  const unamended = canonicalVector("canonical/wire-evidence-card-request");
  const amended = canonicalVector("canonical/wire-evidence-card-request-amended");
  const act = amended.reviewerAct as ReviewerAct;

  it("changes the bytes and the hash", async () => {
    expect(amended.expectedBytesUtf8).not.toBe(unamended.expectedBytesUtf8);
    expect(amended.expectedSha256).not.toBe(unamended.expectedSha256);

    const before = await canonicalHash(unamended.input as CanonicalInput);
    const after = await canonicalHash(
      amended.input as CanonicalInput,
      amended.amendments as AmendmentMap,
      { reviewerAct: act },
    );

    expect(before).toBe(unamended.expectedSha256);
    expect(after).toBe(amended.expectedSha256);
    expect(after).not.toBe(before);
  });

  it("gives the same bytes whether the amendments are applied before or during", () => {
    const during = canonicalString(
      amended.input as CanonicalInput,
      amended.amendments as AmendmentMap,
      { reviewerAct: act },
    );
    const before = canonicalString(
      applyAmendmentsForCanonical(
        amended.input as CanonicalInput,
        amended.amendments as AmendmentMap,
        act,
      ),
    );

    expect(before).toBe(during);
  });

  it("mints the model's own reviewer-act tag, not one of its own (PV-2, AF-4)", () => {
    // The canonical form and a Docket row's accepted state must not be able to
    // disagree about the same decision, so both call `amendmentTag`. The binding
    // names the decision *and* the instant it was made at.
    const parsed = JSON.parse(amended.expectedBytesUtf8) as {
      fields: readonly { provenance: { current: unknown } }[];
    };

    expect(parsed.fields[0]?.provenance.current).toEqual(
      JSON.parse(JSON.stringify(amendmentTag({ kind: "set", value: "Retired" }, act, null))),
    );
    expect(parsed.fields[0]?.provenance.current).toMatchObject({
      source: "UserStated",
      binding: { kind: "reviewer-act", ref: { entryId: act.entryId, decisionAt: act.decisionAt } },
    });
  });

  it("keeps a cleared mandatory field, tagged Empty, and drops a cleared optional one (AF-1)", () => {
    const input = {
      fields: [
        {
          name: "Kept",
          value: "original",
          isMandatory: true,
          provenance: { current: { source: "Inferred" } },
        },
        {
          name: "Required",
          value: "original",
          isMandatory: true,
          provenance: { current: { source: "Inferred" } },
        },
        {
          name: "Optional",
          value: "original",
          isMandatory: false,
          provenance: { current: { source: "Inferred" } },
        },
      ],
    };

    const written = canonicalString(
      input,
      { Required: null, Optional: null },
      { reviewerAct: act },
    );
    const parsed = JSON.parse(written) as {
      fields: readonly {
        name: string;
        value: unknown;
        provenance: { current: { source: string } };
      }[];
    };

    // A reviewer clearing an optional field is saying the write no longer proposes
    // it, and AF-1 says a field the operation does not propose is absent.
    expect(parsed.fields.map((field) => field.name)).toEqual(["Kept", "Required"]);
    expect(parsed.fields[0]?.value).toBe("original");
    expect(parsed.fields[1]?.value).toBeNull();
    // AF-2: an emptied field has no value to be confident in.
    expect(parsed.fields[1]?.provenance.current.source).toBe("Empty");
  });

  it("leaves an absent key untouched, byte for byte (DK-2)", () => {
    const input = {
      fields: [
        { name: "Kept", value: "original", provenance: { current: { source: "Inferred" } } },
        {
          name: "Set",
          value: "original",
          isMandatory: true,
          provenance: { current: { source: "Inferred" } },
        },
      ],
    };

    const written = canonicalString(input, { Set: "corrected" }, { reviewerAct: act });
    const parsed = JSON.parse(written) as {
      fields: readonly { name: string; value: unknown; provenance: unknown }[];
    };

    expect(parsed.fields[0]).toEqual({
      name: "Kept",
      value: "original",
      provenance: { current: { source: "Inferred" } },
    });
    expect(parsed.fields[1]).toMatchObject({ name: "Set", value: "corrected" });
  });

  it("puts the reviewer's act in force and preserves the tag it supersedes (AF-4, PV-2)", () => {
    const chain = { current: { source: "Conversation" }, prior: [{ source: "Inferred" }] };
    const amendedInput = applyAmendmentsForCanonical(
      { fields: [{ name: "F", value: 1, provenance: chain }] },
      { F: 2 },
      act,
    ) as { fields: readonly { provenance: { current: unknown; prior: readonly unknown[] } }[] };

    expect(amendedInput.fields[0]?.provenance.current).toEqual(
      amendmentTag({ kind: "set", value: 2 }, act, null),
    );
    expect(amendedInput.fields[0]?.provenance.prior).toEqual([
      { source: "Conversation" },
      { source: "Inferred" },
    ]);
  });

  it("recomputes an aggregate the document carries (AF-4)", () => {
    const written = canonicalString(
      {
        aggregateConfidence: 0.4,
        fields: [
          {
            name: "F",
            value: 1,
            isMandatory: true,
            provenance: { current: { source: "Inferred", confidence: 0.4 } },
          },
        ],
      } as unknown as CanonicalInput,
      { F: 2 },
      { reviewerAct: act },
    );

    // The reviewer's own value is confidence 1, so the summary the bytes carry has
    // to move with it: a grant binding to an Affidavit whose aggregate contradicts
    // its fields is a grant nobody can check.
    expect((JSON.parse(written) as { aggregateConfidence: number }).aggregateConfidence).toBe(1);
  });

  it("treats an empty amendment map as no amendments", () => {
    const input = { fields: [{ name: "F", value: 1 }] };

    expect(canonicalString(input, {})).toBe(canonicalString(input));
    expect(canonicalString(input, null)).toBe(canonicalString(input));
  });

  it("refuses amendments with no reviewer act (PV-2)", () => {
    const input = { fields: [{ name: "F", value: 1 }] };

    expect(() => canonicalString(input, { F: 2 })).toThrow(/PV-2/);
  });

  it("refuses an amendment naming a field the Affidavit does not carry (DK-2)", () => {
    const input = { fields: [{ name: "F", value: 1 }] };

    expect(() => canonicalString(input, { Absent: 2 }, { reviewerAct: act })).toThrow(/DK-2/);
  });

  it("refuses amendments against an input with no fields array", () => {
    expect(() => canonicalString({}, { F: 2 }, { reviewerAct: act })).toThrow(/SR-1/);
  });
});

// ---------------------------------------------------------------------------
// Hashing (RT-1)
// ---------------------------------------------------------------------------

describe("canonicalHash (SR-1, RT-1)", () => {
  const vector = canonicalVector("canonical/create-shaped");

  it("is asynchronous on every runtime, because Web Crypto has no synchronous digest", () => {
    const pending = canonicalHash(vector.input as CanonicalInput);

    expect(pending).toBeInstanceOf(Promise);
    expect(typeof globalThis.crypto.subtle.digest).toBe("function");
    return expect(pending).resolves.toBe(vector.expectedSha256);
  });

  it("returns 64 lowercase hex characters", async () => {
    const hash = await canonicalHash(vector.input as CanonicalInput);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the SHA-256 crypto.subtle computes over the same bytes", async () => {
    const bytes = canonicalize(vector.input as CanonicalInput);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const direct = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(await canonicalHash(vector.input as CanonicalInput)).toBe(direct);
    expect(await sha256Hex(bytes)).toBe(direct);
  });

  it("hashes the empty canonical object to the known SHA-256 of {}", async () => {
    // `echo -n '{}' | sha256sum`
    expect(await sha256Hex(new TextEncoder().encode("{}"))).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });
});
