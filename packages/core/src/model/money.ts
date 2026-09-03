/**
 * Money on the wire: a decimal string plus an ISO 4217 currency code.
 *
 * **Rule served: SR-2** — *a monetary field value is `{ amount: "<decimal
 * string>", currency: "<ISO 4217>" }` — the amount as a decimal string with no
 * exponent, no thousands separators, at most the currency's minor-unit scale
 * unless the host declares otherwise; never a binary float.*
 *
 * The reason is not fussiness about types. An Affidavit is a record a person swears
 * to and an auditor reads back years later; a binary float cannot represent `0.10`,
 * so a card that showed "£4,000.10" and a store that holds `4000.099999999999`
 * disagree about what was approved, and nothing in the record says which one the
 * reviewer saw. A decimal string is the value the reviewer read, byte for byte,
 * and it survives every JSON parser in every language unchanged.
 *
 * SR-2 is a **wire** rule. A host stores what it likes — integer minor units, a
 * database `decimal`, a `Money` class — and converts at the edge; the store
 * persists the wire value without reinterpreting it.
 *
 * `./affidavit.ts` re-exports {@link Money} and {@link isMoney} from here, so an
 * Affidavit and its money have one definition between them and a caller can reach
 * either through `@affiant/core`.
 *
 * This module deliberately embeds **no currency list**. ISO 4217 changes (currencies
 * are added, redenominated and withdrawn), and a hard-coded table inside a
 * serialization package would be wrong within a year and unfixable without a
 * release. What is checked here is the *shape* — three uppercase ASCII letters —
 * and the host checks membership against whatever list it keeps current.
 *
 * @packageDocumentation
 */

/**
 * A monetary value as it appears on the wire and inside an Affidavit.
 *
 * Both properties are strings on purpose: see the module header, and SR-2.
 */
export interface Money {
  /**
   * The amount as a decimal string: an optional `-`, an integer part with no
   * leading zeros, and an optional fractional part. No exponent, no thousands
   * separators, no leading `+`, no currency symbol.
   *
   * Examples: `"0"`, `"10.00"`, `"-1250.75"`, `"12345678901234567890.01"`.
   */
  readonly amount: string;
  /**
   * The ISO 4217 alphabetic code, three uppercase ASCII letters: `"GBP"`, `"LKR"`,
   * `"USD"`. Not case-folded anywhere — SR-3 fixes enum spellings as they stand.
   */
  readonly currency: string;
}

/**
 * The shape {@link Money.amount} must match.
 *
 * Read it left to right: an optional minus; then either a bare `0` or a digit
 * sequence that does not start with `0`; then, optionally, a decimal point and at
 * least one digit. That excludes exactly the forms that lose or hide information —
 * `1e3` (an exponent a reader has to evaluate), `1,000` (a separator that means a
 * decimal point in half the world), `+10` (a sign JSON numbers do not carry),
 * `010` (an integer part whose leading zero could be a truncation), `10.` (a point
 * with nothing after it) and `.5` (a point with nothing before it).
 *
 * Not anchored to a scale: SR-2's minor-unit clause is the host's to declare, and
 * {@link moneyScaleOk} is how it declares one.
 */
export const MONEY_AMOUNT_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * The shape {@link Money.currency} must match: the ISO 4217 alphabetic-code shape,
 * three uppercase ASCII letters. Membership in the standard's current list is the
 * host's check, not this package's — see the module header.
 */
export const MONEY_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Whether `value` is a plain object carrying an own `amount` and an own `currency`. */
function isMoneyShaped(
  value: unknown,
): value is { readonly amount: unknown; readonly currency: unknown } {
  if (typeof value !== "object" || value === null) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, "amount") &&
    Object.prototype.hasOwnProperty.call(value, "currency")
  );
}

/**
 * Whether `value` is a valid {@link Money}: both properties present, both strings,
 * both matching their patterns.
 *
 * A predicate, not a refusal — {@link assertMoney} is the refusing form and carries
 * the diagnosis. Use this one where a value may legitimately not be money.
 */
export function isMoney(value: unknown): value is Money {
  if (!isMoneyShaped(value)) return false;
  return (
    typeof value.amount === "string" &&
    typeof value.currency === "string" &&
    MONEY_AMOUNT_PATTERN.test(value.amount) &&
    MONEY_CURRENCY_PATTERN.test(value.currency)
  );
}

/**
 * Refuse anything that is not a valid {@link Money}, naming SR-2 and saying which
 * part is wrong.
 *
 * The message names the rule because the caller who hits this is usually a host
 * author who reached for the obvious thing — a JSON number — and the useful reply
 * is not "invalid money" but "here is the rule, and here is why a float is not
 * allowed to represent a price".
 *
 * @param value The value that should be money.
 * @param where What the value is, for the message: a field name, a JSON pointer.
 * @throws TypeError when `value` is not a valid {@link Money}.
 */
export function assertMoney(value: unknown, where = "value"): asserts value is Money {
  if (typeof value === "number") {
    throw new TypeError(
      `SR-2: ${where} is a JSON number (${String(value)}) where money was expected. ` +
        `Money on the wire is { amount: "<decimal string>", currency: "<ISO 4217>" }, never a ` +
        `binary float: 0.1 has no exact double, so the amount a reviewer approved and the amount ` +
        `a store holds would differ with nothing on the record to say which was sworn to.`,
    );
  }
  if (!isMoneyShaped(value)) {
    throw new TypeError(
      `SR-2: ${where} is not money. Expected an object with an "amount" (decimal string) and a ` +
        `"currency" (ISO 4217 code); received ${describe(value)}.`,
    );
  }
  if (typeof value.amount === "number") {
    throw new TypeError(
      `SR-2: ${where}.amount is a JSON number (${String(value.amount)}). The amount is a decimal ` +
        `string — write ${JSON.stringify(String(value.amount))} — because a binary float cannot ` +
        `hold the value a reviewer read.`,
    );
  }
  if (typeof value.amount !== "string" || !MONEY_AMOUNT_PATTERN.test(value.amount)) {
    throw new TypeError(
      `SR-2: ${where}.amount is not a decimal string. Expected ${String(MONEY_AMOUNT_PATTERN)} — ` +
        `an optional "-", an integer part with no leading zeros, and an optional fractional part; ` +
        `no exponent, no thousands separators, no leading "+". Received ${describe(value.amount)}.`,
    );
  }
  if (typeof value.currency !== "string" || !MONEY_CURRENCY_PATTERN.test(value.currency)) {
    throw new TypeError(
      `SR-2: ${where}.currency is not an ISO 4217 code. Expected three uppercase ASCII letters ` +
        `(the code is never case-folded on the wire); received ${describe(value.currency)}.`,
    );
  }
}

/**
 * Validate `value` as money and return it as a {@link Money}.
 *
 * The returned object carries exactly the two properties, so a value that arrived
 * with extra keys does not smuggle them onward. The strings are returned unchanged
 * — this parses, it does not normalise: `"10.00"` stays `"10.00"` and never becomes
 * `"10"`, because the trailing zeros are what the reviewer saw and dropping them
 * would change the canonical bytes (SR-1) for a value nobody amended.
 *
 * @param value The value that should be money.
 * @param where What the value is, for the message.
 * @throws TypeError when `value` is not a valid {@link Money} — including the
 *         common case of a JSON number, which names SR-2 and says why.
 */
export function parseMoney(value: unknown, where = "value"): Money {
  assertMoney(value, where);
  return { amount: value.amount, currency: value.currency };
}

/**
 * Whether `money` fits a scale the host declares, in minor units.
 *
 * SR-2 caps a money amount at "the currency's minor-unit scale unless the host
 * declares otherwise", and this package holds no currency table, so the scale is a
 * number the caller passes: `2` for sterling and the euro, `0` for the yen, `3` for
 * the dinar, and whatever a host declares for an internal unit that needs more.
 *
 * The check is on the digits *written*, not on the value: `"10.00"` has scale 2 and
 * fails `moneyScaleOk(money, 1)` even though the amount is representable in one
 * decimal place. That is deliberate — the record is what was written.
 *
 * @param money      A valid {@link Money}.
 * @param minorUnits The number of fractional digits the host allows. A non-negative integer.
 * @throws TypeError when `minorUnits` is not a non-negative integer, or `money` is not money.
 */
export function moneyScaleOk(money: Money, minorUnits: number): boolean {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) {
    throw new TypeError(
      `SR-2: minorUnits must be a non-negative integer (2 for GBP, 0 for JPY, 3 for KWD); ` +
        `received ${describe(minorUnits)}.`,
    );
  }
  assertMoney(money, "money");
  const point = money.amount.indexOf(".");
  const scale = point === -1 ? 0 : money.amount.length - point - 1;
  return scale <= minorUnits;
}

/** A short, safe rendering of an arbitrary value for an error message. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `the string ${JSON.stringify(truncate(value))}`;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${typeof value} ${String(value)}`;
  }
  if (Array.isArray(value)) return `an array of ${String(value.length)}`;
  return `${typeof value} ${truncate(Object.prototype.toString.call(value))}`;
}

/** Error messages quote values; values can be long. */
function truncate(text: string): string {
  return text.length <= 60 ? text : `${text.slice(0, 57)}...`;
}
