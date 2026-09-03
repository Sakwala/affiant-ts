import { describe, expect, it } from "vitest";

import type { ChannelIdentity, Principal, TurnContext } from "../src/context.js";

/**
 * GT-2 — turn context is explicit and passed, never ambient.
 *
 * These are as much type assertions as runtime ones: every literal below is
 * `satisfies`-checked against the exported type under `strict`,
 * `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, so `pnpm typecheck`
 * fails if the shape drifts, and the `@ts-expect-error` cases fail the type-check
 * if the shape ever stops rejecting them.
 */
describe("TurnContext (GT-2)", () => {
  const chatTurn = {
    utterance: "mark the Aeronex invoice paid",
    messageId: "msg-1",
    at: "2026-09-04T09:15:00.000Z",
  } as const;

  it("accepts a member-principal context", () => {
    const ctx = {
      conversationId: "conv-1",
      tenantId: "tenant-a",
      channel: "chat",
      principal: { kind: "member", id: "person-7" },
      turn: chatTurn,
    } satisfies TurnContext;

    expect(ctx.principal).toEqual({ kind: "member", id: "person-7" });
    expect(ctx.turn.utterance).toBe("mark the Aeronex invoice paid");
  });

  it("accepts `principal: null`: unresolved is a state, not an omission", () => {
    const ctx = {
      conversationId: "conv-2",
      tenantId: "tenant-a",
      channel: "chat",
      principal: null,
      turn: chatTurn,
    } satisfies TurnContext;

    expect(ctx.principal).toBeNull();
  });

  it("accepts a relayed service principal on the mcp channel (Sequence C)", () => {
    const channelIdentity: ChannelIdentity = "slack:U024BE7LH";
    const ctx = {
      conversationId: "conv-3",
      tenantId: "tenant-a",
      channel: "mcp",
      principal: {
        kind: "service",
        id: "relay-desk",
        relay: { channelIdentity, messageId: "relay-msg-9" },
        assertedMember: "person-7",
      },
      turn: chatTurn,
    } satisfies TurnContext;

    expect(ctx.principal.kind).toBe("service");
    expect(ctx.principal.relay?.channelIdentity).toBe("slack:U024BE7LH");
  });

  it("accepts a service principal acting on its own behalf, with no relay at all", () => {
    const principal = { kind: "service", id: "nightly-import" } satisfies Principal;

    expect(principal).toEqual({ kind: "service", id: "nightly-import" });
  });

  it("accepts a host's own channel name without losing the three named ones", () => {
    const ctx = {
      conversationId: "conv-4",
      tenantId: "tenant-a",
      channel: "voice",
      principal: null,
      turn: chatTurn,
    } satisfies TurnContext;

    expect(ctx.channel).toBe("voice");
  });

  it("rejects an explicit `undefined` for an optional property (exactOptionalPropertyTypes)", () => {
    // @ts-expect-error An optional property may be absent; it may not be present and undefined.
    const principal: Principal = {
      kind: "service",
      id: "relay-desk",
      relay: undefined,
    };

    expect(principal.kind).toBe("service");
  });

  it("rejects a member principal carrying a relay assertion (AZ-3, structurally)", () => {
    const principal = {
      kind: "member",
      id: "person-7",
      // @ts-expect-error A `member` principal has no relay: a relay may never attest as the person.
      relay: { channelIdentity: "slack:U024BE7LH", messageId: "relay-msg-9" },
    } satisfies Principal;

    expect(principal.kind).toBe("member");
  });

  it("rejects a context with no principal property at all; `null` must be stated", () => {
    // @ts-expect-error `principal` is required: an unresolved identity is written `null`.
    const ctx: TurnContext = {
      conversationId: "conv-5",
      tenantId: "tenant-a",
      channel: "chat",
      turn: chatTurn,
    };

    expect(ctx.conversationId).toBe("conv-5");
  });

  it("keeps two interleaved contexts entirely separate", () => {
    const a = {
      conversationId: "conv-a",
      tenantId: "tenant-a",
      channel: "chat",
      principal: { kind: "member", id: "person-1" },
      turn: { utterance: "set status to paid", messageId: "m-a", at: "2026-09-04T09:00:00.000Z" },
    } satisfies TurnContext;
    const b = {
      conversationId: "conv-b",
      tenantId: "tenant-b",
      channel: "mcp",
      principal: null,
      turn: { utterance: "set status to void", messageId: "m-b", at: "2026-09-04T09:00:01.000Z" },
    } satisfies TurnContext;

    // Nothing in this package holds either of them: there is no registry keyed by
    // conversation id, and no default context to fall back to.
    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.turn.utterance).not.toBe(b.turn.utterance);
  });
});
