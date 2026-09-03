/**
 * The telemetry port, the event shape, and the versioned key registry.
 *
 * **Rules served: TL-1** (the telemetry-key registry is a versioned API),
 * **TL-2** (where a public standard names the same thing, the registry uses its
 * name).
 *
 * TL-1 in one sentence: *every event and attribute the gate emits is named in a
 * versioned registry; a key is never renamed, only deprecated.* The registry lives
 * beside this file as {@link https://github.com/Sakwala/affiant-ts/blob/main/packages/core/telemetry-keys.json `telemetry-keys.json`}
 * and is generated into `./telemetry-keys.ts` by `scripts/generate-telemetry-keys.mjs`,
 * the same way `@affiant/contract` generates its schema module — one record a
 * reader edits, one TypeScript module every runtime can load.
 *
 * The registry is what makes the gate's behaviour *observable* rather than
 * inferable: substance refusal (GT-3), coverage refusal (CV-4) and every Docket
 * transition (DK-1) are events with fixed names, so an operator can alert on a
 * refusal rate without reading the gate's source.
 *
 * The default port is a no-op. The gate emits whether or not a host is listening,
 * which is what keeps the emitting call sites honest.
 *
 * @packageDocumentation
 */

import { TELEMETRY_KEYS } from "./telemetry-keys.js";

export {
  TELEMETRY_KEYS,
  TELEMETRY_REGISTRY_VERSION,
  type TelemetryKeyEntry,
} from "./telemetry-keys.js";

/**
 * The name of one event the gate emits. Derived from the registry, so a key that
 * is not in `telemetry-keys.json` is a compile error at the emitting call site.
 */
export type TelemetryKey = (typeof TELEMETRY_KEYS)[number]["key"];

/** Whether `value` names an event in the registry. */
export function isTelemetryKey(value: unknown): value is TelemetryKey {
  return (
    typeof value === "string" && TELEMETRY_KEYS.some((entry) => (entry.key as string) === value)
  );
}

/**
 * The attributes carried on one event.
 *
 * Scalars only, and `null` rather than `undefined` for "no value" — the same rule
 * the wire types follow, so an event survives a JSON round trip into whatever the
 * host's collector is without a shape change. Never put a field value, an utterance
 * or a principal id in here: telemetry is operational, and the audit record is the
 * Affidavit.
 */
export type TelemetryAttributes = {
  readonly [name: string]: string | number | boolean | null;
};

/** One thing that happened, named by the registry. */
export interface TelemetryEvent {
  /** Which event this is. */
  readonly key: TelemetryKey;
  /**
   * When it happened, as an ISO 8601 instant in UTC — read from the gate's
   * `Clock` port, never from an ambient timer.
   */
  readonly at: string;
  /** The attributes for this event. `{}` when there are none. */
  readonly attributes: TelemetryAttributes;
}

/**
 * Where the gate's events go. Supplied by the host; the gate never chooses a sink.
 *
 * `emit` is synchronous and must not throw: an event is a side channel, and a
 * collector that is down cannot be allowed to fail a write. Buffer or drop inside
 * the implementation.
 */
export interface TelemetryPort {
  /** Record one event. Must not throw. */
  emit(event: TelemetryEvent): void;
}

/**
 * The port used when a host supplies none. Drops every event.
 *
 * It exists so the gate's emitting call sites are unconditional — no
 * `telemetry?.emit(...)` at each site, and no branch that could quietly stop
 * emitting.
 */
export const noopTelemetry: TelemetryPort = {
  emit(): void {
    // Intentionally empty: the default sink drops events.
  },
};
