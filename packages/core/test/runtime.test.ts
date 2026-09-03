import { describe, expect, it } from "vitest";

/**
 * RT-1 — the core is runtime-neutral: Node, Cloudflare workerd and Bun, with no
 * Node-only API, no filesystem and Web Crypto only.
 *
 * This suite runs unchanged on all three (the Bun and workerd CI jobs run it), so
 * every assertion here is a statement about the runtime the suite happens to be on.
 * Two complementary checks cover what a load cannot: `tsconfig.json` type-checks
 * `src/` as a program of its own with `types: []`, where `process`, `Buffer` and
 * `node:fs` do not resolve at all, and `test/node/runtime-surface.test.ts` reads
 * the same sources and fails on a bare Node global the compiler cannot see.
 */
describe("runtime envelope (RT-1)", () => {
  it("has Web Crypto, whose digest is asynchronous on every runtime", () => {
    expect(typeof globalThis.crypto).toBe("object");
    expect(typeof globalThis.crypto.subtle.digest).toBe("function");
  });

  it("computes a SHA-256 digest through the Web Crypto path the core will use", async () => {
    const bytes = new TextEncoder().encode("affiant");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

    expect(digest.byteLength).toBe(32);
  });

  it("resolves the public entry point on this runtime", async () => {
    const core = await import("@affiant/core");

    expect(core.CORE_VERSION).toBe("0.1.0-alpha.0");
    expect(typeof core.PROTOCOL_VERSION).toBe("string");
    expect(typeof core.AffiantError).toBe("function");
    expect(typeof core.defaultClock.now).toBe("function");
    expect(Array.isArray(core.TELEMETRY_KEYS)).toBe(true);
  });

  it("resolves the subpath entry points on this runtime", async () => {
    await expect(import("@affiant/core/store-memory")).resolves.toBeDefined();
    await expect(import("@affiant/core/testing")).resolves.toBeDefined();
  });

  it("exports exactly the public surface of 0.1.0-alpha.0", async () => {
    const core = await import("@affiant/core");

    expect(Object.keys(core).sort()).toEqual([
      "AFFIDAVIT_FIELD_KINDS",
      "AffiantError",
      "BINDING_KINDS",
      "CORE_VERSION",
      "ERROR_CODES",
      "ErrorCode",
      "PROTOCOL_VERSION",
      "PROVENANCE_LADDER",
      "TELEMETRY_KEYS",
      "TELEMETRY_REGISTRY_VERSION",
      "applyAmendments",
      "buildAffidavit",
      "chainOf",
      "computeConfidence",
      "defaultClock",
      "determinismRank",
      "emptyTag",
      "fromWire",
      "hasAmendment",
      "isAffiantError",
      "isBound",
      "isErrorCode",
      "isHonourable",
      "isJsonValue",
      "isMoney",
      "isTelemetryKey",
      "merge",
      "mintConversation",
      "mintInference",
      "mintInferred",
      "mintTag",
      "noopTelemetry",
      "requiresBinding",
      "resolveAmendments",
      "supersede",
      "tagsOf",
      "toWire",
      "wireCarryOf",
      "withConfidence",
    ]);
  });

  it("reads the clock through the Web-standard Date, with no timer of its own", async () => {
    const { defaultClock } = await import("@affiant/core");
    const now = defaultClock.now();

    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(now))).toBe(false);
  });
});
