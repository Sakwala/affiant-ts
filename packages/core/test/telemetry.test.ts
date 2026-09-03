import { describe, expect, it } from "vitest";

import {
  isTelemetryKey,
  noopTelemetry,
  TELEMETRY_KEYS,
  TELEMETRY_REGISTRY_VERSION,
  type TelemetryEvent,
  type TelemetryKey,
  type TelemetryPort,
} from "../src/telemetry.js";

/**
 * TL-1 — the telemetry-key registry is a versioned API: every event the gate emits
 * is named in it, and a key is never renamed or removed, only deprecated.
 *
 * The snapshot below is the enforcement. It is written out by hand rather than
 * derived from the registry, so deleting a key from `telemetry-keys.json` fails
 * here instead of silently changing the API. `test/node/telemetry-registry.test.ts`
 * checks the other direction: that the generated module still matches the JSON.
 */
describe("telemetry-key registry (TL-1)", () => {
  /** The registry as it shipped at 0.1.0-alpha.0. Append only. */
  const shipped = [
    "affidavit.filed",
    "affidavit.refused.substance",
    "coverage.refused",
    "docket.transition",
    "docket.expired",
    "decision.unauthorized",
    "standing-order.fired",
    "standing-order.blocked",
  ];

  const keys = TELEMETRY_KEYS.map((entry) => entry.key as string);

  it("still exports every key that shipped at 0.1.0-alpha.0", () => {
    for (const key of shipped) {
      expect(keys).toContain(key);
    }
  });

  it("pins the registry order", () => {
    expect(keys).toEqual(shipped);
  });

  it("names no key twice", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every key a `since` version and a one-line description", () => {
    for (const entry of TELEMETRY_KEYS) {
      expect(entry.since).toMatch(/^\d+\.\d+\.\d+/);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.attributes)).toBe(true);
    }
  });

  it("stamps every key that shipped in the first release with that version", () => {
    for (const entry of TELEMETRY_KEYS) {
      expect(entry.since).toBe("0.1.0-alpha.0");
    }
  });

  it("names the attributes a Docket transition carries (DK-1)", () => {
    const transition = TELEMETRY_KEYS.find((entry) => entry.key === "docket.transition");

    expect(transition).toBeDefined();
    expect(transition?.attributes).toEqual(["from", "to", "execution"]);
  });

  it("versions the registry itself", () => {
    expect(TELEMETRY_REGISTRY_VERSION).toBe("0.1.0-alpha.0");
  });

  it("recognises its own keys and nothing else", () => {
    expect(isTelemetryKey("affidavit.filed")).toBe(true);
    expect(isTelemetryKey("standing-order.blocked")).toBe(true);
    expect(isTelemetryKey("affidavit.field")).toBe(false);
    expect(isTelemetryKey("")).toBe(false);
    expect(isTelemetryKey(null)).toBe(false);
  });

  it("derives the TelemetryKey union from the registry", () => {
    const key: TelemetryKey = "docket.expired";
    // @ts-expect-error A key that is not in the registry is not a TelemetryKey.
    const absent: TelemetryKey = "docket.exploded";

    expect(key).toBe("docket.expired");
    expect(isTelemetryKey(absent)).toBe(false);
  });
});

describe("TelemetryPort", () => {
  it("drops events by default, and never throws", () => {
    const event: TelemetryEvent = {
      key: "affidavit.filed",
      at: "2026-09-04T09:15:00.000Z",
      attributes: { entryId: "entry-1", fieldCount: 3, autoApproved: false, reason: null },
    };

    expect(() => noopTelemetry.emit(event)).not.toThrow();
    expect(noopTelemetry.emit(event)).toBeUndefined();
  });

  it("is satisfied by a host sink that collects", () => {
    const collected: TelemetryEvent[] = [];
    const port: TelemetryPort = {
      emit(event) {
        collected.push(event);
      },
    };

    port.emit({ key: "docket.expired", at: "2026-09-04T10:00:00.000Z", attributes: {} });

    expect(collected).toHaveLength(1);
    expect(collected[0]?.key).toBe("docket.expired");
  });
});
