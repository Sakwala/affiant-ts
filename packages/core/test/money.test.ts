import { describe, expect, it } from "vitest";

import {
  MONEY_AMOUNT_PATTERN,
  MONEY_CURRENCY_PATTERN,
  assertMoney,
  isMoney,
  moneyScaleOk,
  parseMoney,
} from "../src/model/money.js";

/**
 * SR-2 — money on the wire is a decimal string plus an ISO 4217 currency code.
 *
 * The rule exists because a binary float cannot hold `0.10`: a card that showed
 * "4000.10" and a store holding `4000.099999999999` disagree about what was
 * approved, with nothing on the record to say which the reviewer read. So the table
 * below is not a validation exercise — every rejected form is a way an amount can
 * arrive meaning something other than what it looks like.
 *
 * Runs on Node, Bun and workerd (RT-1).
 */

/** `[what it is, whether it is money]` — the accept and reject table. */
const AMOUNTS: readonly (readonly [string, boolean])[] = [
  ["0", true],
  ["10", true],
  ["10.00", true],
  ["0.05", true],
  ["-1250.75", true],
  ["-0", true],
  ["123456789012345678901234567890.99", true],
  ["1e3", false],
  ["1E3", false],
  ["1,000", false],
  ["+10", false],
  ["010", false],
  ["10.", false],
  [".5", false],
  ["", false],
  [" 10", false],
  ["10 ", false],
  ["1_000", false],
  ["Infinity", false],
  ["NaN", false],
  ["0x10", false],
  ["10.00 GBP", false],
];

const CURRENCIES: readonly (readonly [string, boolean])[] = [
  ["GBP", true],
  ["USD", true],
  ["LKR", true],
  ["JPY", true],
  ["XAU", true],
  ["usd", false],
  ["Gbp", false],
  ["GB", false],
  ["GBPX", false],
  ["G8P", false],
  ["G-P", false],
  ["", false],
];

describe("money amounts (SR-2)", () => {
  for (const [amount, accepted] of AMOUNTS) {
    it(`${accepted ? "accepts" : "rejects"} the amount ${JSON.stringify(amount)}`, () => {
      const candidate = { amount, currency: "GBP" };

      expect(MONEY_AMOUNT_PATTERN.test(amount)).toBe(accepted);
      expect(isMoney(candidate)).toBe(accepted);
      if (accepted) {
        expect(parseMoney(candidate)).toEqual({ amount, currency: "GBP" });
      } else {
        expect(() => parseMoney(candidate)).toThrow(TypeError);
        expect(() => parseMoney(candidate)).toThrow(/SR-2/);
      }
    });
  }
});

describe("money currencies (SR-2)", () => {
  for (const [currency, accepted] of CURRENCIES) {
    it(`${accepted ? "accepts" : "rejects"} the currency ${JSON.stringify(currency)}`, () => {
      const candidate = { amount: "10.00", currency };

      expect(MONEY_CURRENCY_PATTERN.test(currency)).toBe(accepted);
      expect(isMoney(candidate)).toBe(accepted);
      if (!accepted) expect(() => parseMoney(candidate)).toThrow(/SR-2/);
    });
  }

  it("rejects a currency symbol, which is not an alphabetic code", () => {
    expect(isMoney({ amount: "10.00", currency: "\u00a3" })).toBe(false);
    expect(() => parseMoney({ amount: "10.00", currency: "\u00a3" })).toThrow(/SR-2/);
  });

  it("does not embed a currency list, so an unfamiliar code of the right shape passes", () => {
    // ZZZ is not an allocated ISO 4217 code. Shape is this package's business;
    // membership in a list that changes every year is the host's.
    expect(isMoney({ amount: "1", currency: "ZZZ" })).toBe(true);
  });
});

describe("a JSON number where money is expected (SR-2)", () => {
  it("is a TypeError naming SR-2", () => {
    expect(() => parseMoney(10)).toThrow(TypeError);
    expect(() => parseMoney(10)).toThrow(/SR-2/);
    expect(() => parseMoney(4000.1)).toThrow(/SR-2/);
  });

  it("is a TypeError naming SR-2 when only the amount is a number", () => {
    expect(() => parseMoney({ amount: 4000.1, currency: "GBP" })).toThrow(/SR-2/);
  });

  it("says why a float is not allowed to hold a price", () => {
    // The message is not the contract, but this one has a job: the caller who hits
    // it reached for the obvious type, and "invalid money" would not tell them why.
    expect(() => parseMoney({ amount: 4000.1, currency: "GBP" })).toThrow(/decimal string/);
  });

  it("is not money by the predicate either", () => {
    expect(isMoney(10)).toBe(false);
    expect(isMoney({ amount: 10, currency: "GBP" })).toBe(false);
  });
});

describe("money shapes that are not money at all (SR-2)", () => {
  const rejected: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "10.00 GBP"],
    ["an array", ["10.00", "GBP"]],
    ["an empty object", {}],
    ["an amount with no currency", { amount: "10.00" }],
    ["a currency with no amount", { currency: "GBP" }],
    ["a null amount", { amount: null, currency: "GBP" }],
  ];

  for (const [what, value] of rejected) {
    it(`rejects ${what}`, () => {
      expect(isMoney(value)).toBe(false);
      expect(() => assertMoney(value)).toThrow(TypeError);
      expect(() => assertMoney(value)).toThrow(/SR-2/);
    });
  }

  it("names the value in the message when the caller says what it is", () => {
    expect(() => assertMoney(10, "fields[2].value")).toThrow(/fields\[2\]\.value/);
  });
});

describe("parseMoney (SR-2)", () => {
  it("returns exactly the two properties, dropping anything else that arrived", () => {
    expect(parseMoney({ amount: "10.00", currency: "GBP", note: "extra" })).toEqual({
      amount: "10.00",
      currency: "GBP",
    });
  });

  it("does not normalise, because the trailing zeros are what the reviewer read", () => {
    // Rewriting "10.00" as "10" would change the canonical bytes (SR-1) of a value
    // nobody amended, and a hash bound to those bytes with it.
    expect(parseMoney({ amount: "10.00", currency: "GBP" }).amount).toBe("10.00");
    expect(parseMoney({ amount: "-0", currency: "GBP" }).amount).toBe("-0");
  });
});

describe("moneyScaleOk (SR-2)", () => {
  it("measures the digits written, not the value", () => {
    expect(moneyScaleOk({ amount: "10.00", currency: "GBP" }, 2)).toBe(true);
    expect(moneyScaleOk({ amount: "10.00", currency: "GBP" }, 1)).toBe(false);
    expect(moneyScaleOk({ amount: "10.0", currency: "GBP" }, 1)).toBe(true);
  });

  it("handles a currency with no minor units and one with three", () => {
    expect(moneyScaleOk({ amount: "1250", currency: "JPY" }, 0)).toBe(true);
    expect(moneyScaleOk({ amount: "1250.5", currency: "JPY" }, 0)).toBe(false);
    expect(moneyScaleOk({ amount: "1.234", currency: "KWD" }, 3)).toBe(true);
  });

  it("refuses a scale that is not a non-negative integer", () => {
    expect(() => moneyScaleOk({ amount: "1", currency: "GBP" }, -1)).toThrow(TypeError);
    expect(() => moneyScaleOk({ amount: "1", currency: "GBP" }, 1.5)).toThrow(/SR-2/);
  });

  it("refuses a value that is not money before measuring it", () => {
    expect(() => moneyScaleOk({ amount: "1e3", currency: "GBP" }, 2)).toThrow(/SR-2/);
  });
});
