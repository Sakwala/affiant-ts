import { describe, expect, it } from "vitest";

import type { TurnContext } from "../src/context.js";
import { AffiantError } from "../src/errors.js";
import type { DigestKey } from "../src/gate/digest-key.js";
import { deriveEntryId } from "../src/gate/pipeline.js";
import { hmacSha256Hex, sha256Hex } from "../src/model/canonical.js";
import { fixtureDigestKey, inMemoryDraftPort } from "../src/testing.js";
import type { HarnessInit } from "./gate-support.js";
import { AT, harness, plus, schemaFor, structured, turnContext } from "./gate-support.js";

/**
 * GateOptions.digestKey (PV-3, GT-4): with a key, the span hash and the digest inside
 * the entry id are HMAC-SHA-256 under it; without one, both are what they always were.
 */

const KEY_A = new Uint8Array(32).fill(0xa1);
const KEY_B = new Uint8Array(32).fill(0xb2);
const UTTERANCE = "Set the invoice status to Active";

const proposal = () => ({
  operation: {
    kind: "update" as const,
    entityType: "Invoice",
    entityId: "invoice-1",
    fields: ["status"],
  },
  toolName: "capture",
  schema: schemaFor("Invoice", ["status"]),
  args: { fields: ["status"] },
});

const idMaterial = (supersedes: string | null = null) => {
  const p = proposal();
  return {
    toolName: p.toolName,
    operation: p.operation,
    args: supersedes === null ? p.args : null,
    supersedes,
  };
};

function keyed(digestKey?: DigestKey, init: HarnessInit = {}) {
  return harness({
    ...init,
    ...(digestKey === undefined ? {} : { digestKey }),
    inferred: { status: structured("Active", "literal", 0.9) },
  });
}

const spanHashOf = (filed: {
  entry: { affidavit: { fields: readonly { provenance: { current: { binding?: unknown } } }[] } };
}): string =>
  (filed.entry.affidavit.fields[0]?.provenance.current.binding as { ref: { hash: string } }).ref
    .hash;

async function fileOnce(digestKey?: DigestKey, ctx: TurnContext = turnContext()) {
  return keyed(digestKey).gate.file(proposal(), ctx);
}

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("no digest key: today's digests (PV-3, GT-4)", () => {
  it("the span hash is SHA-256 of the span and the id is the unkeyed derivation", async () => {
    const ctx = turnContext({ utterance: UTTERANCE });
    const filed = await fileOnce(undefined, ctx);
    expect(spanHashOf(filed)).toBe(await sha256Hex(bytesOf("Active")));
    expect(filed.entry.entryId).toBe(await deriveEntryId(ctx, idMaterial()));
  });
});

describe("a digest key (PV-3, GT-4)", () => {
  it("keys the span hash and the id, and both are stable across gates", async () => {
    const ctx = turnContext({ utterance: UTTERANCE });
    const plain = await fileOnce(undefined, ctx);
    const first = await fileOnce(KEY_A, ctx);
    const second = await fileOnce(KEY_A, ctx);

    expect(spanHashOf(first)).toBe(await hmacSha256Hex(KEY_A, bytesOf("Active")));
    expect(spanHashOf(first)).not.toBe(spanHashOf(plain));
    expect(spanHashOf(second)).toBe(spanHashOf(first));

    expect(first.entry.entryId).not.toBe(plain.entry.entryId);
    expect(first.entry.entryId).toBe(await deriveEntryId(ctx, idMaterial(), KEY_A));
    expect(second.entry.entryId).toBe(first.entry.entryId);
    expect(first.entry.entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("gives two keys two ids, and a CryptoKey the same id as its raw bytes", async () => {
    const ctx = turnContext();
    const a = await deriveEntryId(ctx, idMaterial(), KEY_A);
    const b = await deriveEntryId(ctx, idMaterial(), KEY_B);
    expect(a).not.toBe(b);
    const imported = await globalThis.crypto.subtle.importKey(
      "raw",
      new Uint8Array(KEY_A),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    expect(await deriveEntryId(ctx, idMaterial(), imported)).toBe(a);
    expect((await keyed(imported).gate.file(proposal(), ctx)).entry.entryId).toBe(a);
  });

  it("replays a retried filing under the same key onto the same entry", async () => {
    const h = keyed(KEY_A);
    const first = await h.gate.file(proposal(), turnContext());
    const again = await h.gate.file(proposal(), turnContext());
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.entry.entryId).toBe(first.entry.entryId);
    const pending = await h.store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
    expect(pending.items).toHaveLength(1);
  });

  it("derives a resubmission's id under the key, and a repeat replays", async () => {
    const h = keyed(KEY_A, { defaultTtlMs: 60_000 });
    const original = await h.gate.file(proposal(), turnContext());
    h.clock.set(plus(AT, 90_000));

    const fresh = await h.gate.resubmit(original.entry.entryId, turnContext());
    expect(fresh.created).toBe(true);
    expect(fresh.entry.entryId).toBe(
      await deriveEntryId(turnContext(), idMaterial(original.entry.entryId), KEY_A),
    );
    expect(fresh.entry.entryId).not.toBe(
      await deriveEntryId(turnContext(), idMaterial(original.entry.entryId)),
    );

    const repeat = await h.gate.resubmit(original.entry.entryId, turnContext());
    expect(repeat.created).toBe(false);
    expect(repeat.entry.entryId).toBe(fresh.entry.entryId);
  });

  it("carries a drafted value's keyed hash unchanged into the filing", async () => {
    const clock = { now: () => AT } as const;
    const report: { status: ReturnType<typeof structured> } = {
      status: structured("Active", "literal", 0.9),
    };
    const h = harness({
      digestKey: KEY_A,
      draft: inMemoryDraftPort({ clock, ttlMs: 60 * 60 * 1000 }),
      inference: { infer: async () => ({ fields: { status: report.status } }) },
    });
    const drafted = await h.gate.draft(
      proposal(),
      turnContext({ utterance: UTTERANCE, messageId: "msg-1" }),
    );
    const draftedHash = (drafted?.fields[0]?.tag.binding as { ref: { hash: string } }).ref.hash;
    expect(draftedHash).toBe(await hmacSha256Hex(KEY_A, bytesOf("Active")));

    report.status = structured("active", "inferred", 0.6);
    const filed = await h.gate.file(
      proposal(),
      turnContext({ utterance: "yes, go ahead", messageId: "msg-2" }),
    );
    expect(filed.entry.affidavit.fields[0]?.provenance.current.source).toBe("Conversation");
    expect(spanHashOf(filed)).toBe(draftedHash);
  });
});

describe("a digest key the gate refuses", () => {
  const refusal = (make: () => unknown) => {
    try {
      make();
    } catch (error) {
      return error;
    }
    return null;
  };

  it("refuses raw key bytes shorter than 32 at createGate", () => {
    const error = refusal(() => keyed(new Uint8Array(31)));
    expect(error).toBeInstanceOf(AffiantError);
    expect((error as AffiantError).code).toBe("wireup-invalid");
    expect((error as AffiantError).message).toMatch(/at least 32/);
  });

  it("refuses a CryptoKey that is not HMAC SHA-256 with sign", async () => {
    const subtle = globalThis.crypto.subtle;
    const aes = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const sha512 = await subtle.importKey(
      "raw",
      new Uint8Array(KEY_A),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const verifyOnly = await subtle.importKey(
      "raw",
      new Uint8Array(KEY_A),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    for (const key of [aes, sha512, verifyOnly]) {
      const error = refusal(() => keyed(key as CryptoKey));
      expect(error).toBeInstanceOf(AffiantError);
      expect((error as AffiantError).code).toBe("wireup-invalid");
    }
  });

  it("refuses an HMAC SHA-256 CryptoKey shorter than 256 bits, at createGate and deriveEntryId", async () => {
    const short = await globalThis.crypto.subtle.importKey(
      "raw",
      new Uint8Array(16).fill(0xa1),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    expect(short.algorithm).toMatchObject({ length: 128 });
    const error = refusal(() => keyed(short));
    expect(error).toBeInstanceOf(AffiantError);
    expect((error as AffiantError).code).toBe("wireup-invalid");
    expect((error as AffiantError).message).toMatch(/at least 256 bits/);
    await expect(deriveEntryId(turnContext(), idMaterial(), short)).rejects.toThrow(
      /at least 256 bits/,
    );
  });

  it("accepts an HMAC SHA-256 CryptoKey of 256 bits", async () => {
    const full = await globalThis.crypto.subtle.importKey(
      "raw",
      new Uint8Array(KEY_A),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    expect(full.algorithm).toMatchObject({ length: 256 });
    expect(refusal(() => keyed(full))).toBeNull();
    expect(await deriveEntryId(turnContext(), idMaterial(), full)).toBe(
      await deriveEntryId(turnContext(), idMaterial(), KEY_A),
    );
  });

  it("refuses the same keys at deriveEntryId", async () => {
    await expect(deriveEntryId(turnContext(), idMaterial(), new Uint8Array(16))).rejects.toThrow(
      AffiantError,
    );
  });

  it("has CryptoKey as a global on this runtime", () => {
    expect(typeof globalThis.CryptoKey).toBe("function");
  });

  const notAKey = (): Record<string, unknown> => ({
    algorithm: { name: "HMAC", hash: { name: "SHA-256" }, length: 256 },
    usages: ["sign"],
  });

  const refusedBoth = async (key: unknown) => {
    const error = refusal(() => keyed(key as DigestKey));
    expect(error).toBeInstanceOf(AffiantError);
    expect((error as AffiantError).code).toBe("wireup-invalid");
    const derived = await deriveEntryId(turnContext(), idMaterial(), key as DigestKey).then(
      () => null,
      (rejection: unknown) => rejection,
    );
    expect(derived).toBeInstanceOf(AffiantError);
    expect((derived as AffiantError).code).toBe("wireup-invalid");
    return [error as AffiantError, derived as AffiantError] as const;
  };

  it("refuses an object that only looks like a CryptoKey, at createGate and deriveEntryId", async () => {
    for (const error of await refusedBoth(notAKey())) {
      expect(error.message).toMatch(/Uint8Array of at least 32 bytes or an HMAC-SHA-256 CryptoKey/);
    }
  });

  it("refuses null, at createGate and deriveEntryId; only undefined means no key", async () => {
    for (const error of await refusedBoth(null)) {
      expect(error.message).toMatch(/null was given/);
    }
    expect(refusal(() => keyed(undefined))).toBeNull();
    expect(await deriveEntryId(turnContext(), idMaterial(), undefined)).toBe(
      await deriveEntryId(turnContext(), idMaterial()),
    );
  });

  it("refuses a wrong kind of raw key saying what is accepted, and names no key material", async () => {
    const hex = "a1".repeat(32);
    const kinds: readonly [unknown, string][] = [
      [new Uint16Array(32).fill(0xa1a1), "Uint16Array"],
      [new Uint8Array(32).fill(0xa1).buffer, "ArrayBuffer"],
      [new DataView(new Uint8Array(32).fill(0xa1).buffer), "DataView"],
      [hex, "string"],
    ];
    for (const [key, kind] of kinds) {
      for (const error of await refusedBoth(key)) {
        expect(error.message).toMatch(
          /Uint8Array of at least 32 bytes or an HMAC-SHA-256 CryptoKey/,
        );
        expect(error.message).toContain(`a ${kind} was given`);
        expect(error.message).not.toMatch(/a1a1|161/);
        expect(JSON.stringify(error.details ?? {})).not.toMatch(/a1a1|161/);
      }
    }
  });
});

describe("a fixture's digest key (the fixture schema)", () => {
  it("accepts lowercase hex of at least 32 bytes", () => {
    expect(fixtureDigestKey("0a".repeat(32))).toEqual(new Uint8Array(32).fill(0x0a));
  });

  it("refuses uppercase hex as a malformed fixture", () => {
    expect(() => fixtureDigestKey("0A".repeat(32))).toThrow(TypeError);
  });

  it("refuses hex shorter than 32 bytes as a malformed fixture", () => {
    expect(() => fixtureDigestKey("0a".repeat(31))).toThrow(TypeError);
    expect(() => fixtureDigestKey("")).toThrow(TypeError);
  });
});
