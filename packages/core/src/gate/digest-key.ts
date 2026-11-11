/**
 * The host's digest key (PV-3, GT-4).
 *
 * A gate given a digest key computes the span hash of an `utterance-span` binding and
 * the digest inside an entry id as HMAC-SHA-256 under it, instead of plain SHA-256.
 * Without one, both are exactly what they always were.
 */

import { AffiantError } from "../errors.js";

/**
 * A digest key as a host supplies it: at least 32 raw bytes, or an HMAC `CryptoKey`
 * whose hash is SHA-256, whose length is at least 256 bits and whose usages include `sign`.
 */
export type DigestKey = Uint8Array | CryptoKey;

/** The fewest raw key bytes a gate accepts: the output length of SHA-256. */
export const DIGEST_KEY_MIN_BYTES = 32;

/**
 * Refuse a key that is not one {@link DigestKey} describes.
 *
 * @throws AffiantError `"wireup-invalid"`, naming what is wrong and never the key.
 */
export function checkDigestKey(key: DigestKey): void {
  if (key instanceof Uint8Array) {
    if (key.length < DIGEST_KEY_MIN_BYTES) {
      throw new AffiantError(
        "wireup-invalid",
        `digestKey: raw key bytes must be at least ${DIGEST_KEY_MIN_BYTES} long; ` +
          `${key.length} were given. A short key is guessable, and a guessable key gives ` +
          `back what keying the digests was for.`,
        { option: "digestKey" },
      );
    }
    return;
  }
  // A real CryptoKey only: an object that merely looks like one would pass every check
  // below and then fail inside subtle.sign on every filing. `CryptoKey` is a global on
  // Node 22, Bun and workerd.
  if (!(typeof CryptoKey === "function" && (key as unknown) instanceof CryptoKey)) {
    throw new AffiantError(
      "wireup-invalid",
      `digestKey: must be a Uint8Array of at least ${DIGEST_KEY_MIN_BYTES} bytes or an ` +
        `HMAC-SHA-256 CryptoKey; ${kindOf(key)} was given. Pass the raw key bytes as a ` +
        `Uint8Array, or import them with subtle.importKey("raw", bytes, ` +
        `{ name: "HMAC", hash: "SHA-256" }, false, ["sign"]).`,
      { option: "digestKey" },
    );
  }
  const algorithm = (
    key as {
      readonly algorithm?: { readonly name?: unknown; readonly hash?: { readonly name?: unknown } };
    }
  ).algorithm;
  const usages = (key as { readonly usages?: unknown }).usages;
  const isHmacSha256 =
    typeof key === "object" &&
    key !== null &&
    algorithm?.name === "HMAC" &&
    algorithm.hash?.name === "SHA-256";
  const canSign = Array.isArray(usages) && usages.includes("sign");
  if (!isHmacSha256 || !canSign) {
    throw new AffiantError(
      "wireup-invalid",
      'digestKey: a CryptoKey must be an HMAC key with hash SHA-256 and usage "sign". ' +
        'Import it with subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, ' +
        'false, ["sign"]), or pass the raw bytes.',
      { option: "digestKey" },
    );
  }
  const bits = (algorithm as { readonly length?: unknown }).length;
  if (typeof bits !== "number" || bits < DIGEST_KEY_MIN_BYTES * 8) {
    throw new AffiantError(
      "wireup-invalid",
      `digestKey: a CryptoKey must be at least ${DIGEST_KEY_MIN_BYTES * 8} bits long; ` +
        `${typeof bits === "number" ? `${bits} bits were given` : "its length is not stated"}. ` +
        `A short key is guessable, and a guessable key gives back what keying the digests was for.`,
      { option: "digestKey" },
    );
  }
}

/** What kind of value a refused key is, by type alone: never its contents. */
function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return `a ${typeof value}`;
  return `a ${Object.prototype.toString.call(value).slice(8, -1)}`;
}

/**
 * The key as a `CryptoKey`, importing raw bytes once. Checks the key first.
 *
 * @throws AffiantError `"wireup-invalid"` synchronously, from {@link checkDigestKey}.
 */
export function prepareDigestKey(key: DigestKey): Promise<CryptoKey> {
  checkDigestKey(key);
  if (!(key instanceof Uint8Array)) return Promise.resolve(key);
  const subtle = (globalThis as { readonly crypto?: Crypto }).crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(
      "RT-1: this package computes HMAC through Web Crypto only (globalThis.crypto.subtle), " +
        "which is present on Node 22, Bun and workerd. There is no node:crypto fallback by design.",
    );
  }
  // Copied so a host that later overwrites its array does not change the key.
  const imported = subtle.importKey(
    "raw",
    new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // Awaited on first use; marked handled here so a gate built and never used does not
  // report an unhandled rejection.
  imported.catch(() => undefined);
  return imported;
}
