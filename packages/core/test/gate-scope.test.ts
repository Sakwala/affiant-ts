import { describe, expect, it } from "vitest";

import { InMemoryDocketStore } from "../src/docket/memory.js";

import { harness, stubClock, structured, turnContext, writeTool } from "./gate-support.js";

/**
 * GT-2 — the conversation-scope contract: turn context is explicit and passed, never
 * ambient, and two conversations interleaved in one process never observe each
 * other's context, fabric, pending inference or proposals.
 *
 * The shipped .NET wiring resolves its scoped context store from the application's
 * root provider, so one process-global instance is shared by every conversation:
 * field provenance is overwritten across conversations, and where the host supplies
 * no conversation id the second and later conversations skip write-tool inference
 * silently. These suites interleave two turns on purpose — the same tool object, the
 * same gate, the same store — and look for exactly that bleed.
 */

describe("two turns interleaved through one gate share nothing", () => {
  it("files one entry per turn, each stamped with its own tenant and conversation", async () => {
    const clock = stubClock();
    const store = new InMemoryDocketStore({ clock });
    const { gate } = harness({ store, clock });
    const tool = writeTool();

    const a = gate.wrap(tool, turnContext({ tenantId: "tenant-a", conversationId: "conv-a" }));
    const b = gate.wrap(tool, turnContext({ tenantId: "tenant-b", conversationId: "conv-b" }));

    // Started together, resolved together: whichever order the runtime finishes them
    // in, neither may have seen the other's context.
    const [first, second] = await Promise.all([
      a.execute({ status: "Active" }),
      b.execute({ status: "Active" }),
    ]);

    if (first.kind !== "write" || second.kind !== "write") {
      expect.unreachable("both turns produce proposals");
    }
    expect(first.entryId).not.toBe(second.entryId);

    const inA = await store.get(first.entryId, { tenantId: "tenant-a" });
    const inB = await store.get(second.entryId, { tenantId: "tenant-b" });
    expect(inA?.conversationId).toBe("conv-a");
    expect(inB?.conversationId).toBe("conv-b");
  });

  it("keeps one tenant's entry unreachable from the other's scope", async () => {
    const clock = stubClock();
    const store = new InMemoryDocketStore({ clock });
    const { gate } = harness({ store, clock });
    const tool = writeTool();

    const filed = await gate
      .wrap(tool, turnContext({ tenantId: "tenant-a", conversationId: "conv-a" }))
      .execute({ status: "Active" });
    if (filed.kind !== "write") expect.unreachable("a write tool produces a proposal");

    expect(await gate.get(filed.entryId, turnContext({ tenantId: "tenant-a" }))).not.toBeNull();
    expect(await gate.get(filed.entryId, turnContext({ tenantId: "tenant-b" }))).toBeNull();
  });

  it("gives each turn the inference its own utterance produced", async () => {
    const clock = stubClock();
    const store = new InMemoryDocketStore({ clock });
    // One inference port serving both turns, answering from the turn it is handed.
    // If anything in the pipeline reached for a shared "current turn" instead of the
    // context it was passed, the two entries would carry the same value.
    const { gate } = harness({
      store,
      clock,
      inference: {
        async infer(turn) {
          return {
            fields: {
              status: structured(turn.utterance.split(" to ")[1] ?? "", "literal", 0.9),
            },
          };
        },
      },
    });
    const tool = writeTool();

    const [a, b] = await Promise.all([
      gate
        .wrap(
          tool,
          turnContext({ conversationId: "conv-a", utterance: "Set the status to Active" }),
        )
        .execute({ status: "x" }),
      gate
        .wrap(
          tool,
          turnContext({ conversationId: "conv-b", utterance: "Set the status to Retired" }),
        )
        .execute({ status: "y" }),
    ]);

    if (a.kind !== "write" || b.kind !== "write") expect.unreachable("both produce proposals");
    const rowA = await store.get(a.entryId, { tenantId: "tenant-a" });
    const rowB = await store.get(b.entryId, { tenantId: "tenant-a" });
    expect(rowA?.affidavit.fields[0]?.value).toBe("Active");
    expect(rowB?.affidavit.fields[0]?.value).toBe("Retired");
    expect(rowA?.conversationId).toBe("conv-a");
    expect(rowB?.conversationId).toBe("conv-b");
  });

  it("gives the same call in two conversations two entries, not one", async () => {
    const clock = stubClock();
    const store = new InMemoryDocketStore({ clock });
    const { gate } = harness({ store, clock });
    const tool = writeTool();

    const a = await gate.wrap(tool, turnContext({ conversationId: "conv-a" })).execute({
      status: "Active",
    });
    const b = await gate.wrap(tool, turnContext({ conversationId: "conv-b" })).execute({
      status: "Active",
    });

    if (a.kind !== "write" || b.kind !== "write") expect.unreachable("both produce proposals");
    // Identical arguments, identical tool, identical tenant. The conversation is part
    // of what the entry id is derived from, so a replay is scoped to its own turn.
    expect(a.entryId).not.toBe(b.entryId);
    const pending = await store.listPending({ tenantId: "tenant-a" }, { limit: 10 });
    expect(pending.items).toHaveLength(2);
  });

  it("wraps the same tool twice without the two gated tools sharing state", async () => {
    const clock = stubClock();
    const { gate } = harness({ clock });
    const tool = writeTool();

    const a = gate.wrap(tool, turnContext({ conversationId: "conv-a" }));
    const b = gate.wrap(tool, turnContext({ conversationId: "conv-b" }));

    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
    const filedA = await a.execute({ status: "Active" });
    const filedB = await b.execute({ status: "Active" });
    if (filedA.kind !== "write" || filedB.kind !== "write") {
      expect.unreachable("both produce proposals");
    }
    expect(filedA.entryId).not.toBe(filedB.entryId);
  });

  it("takes the context as a parameter at every entry point", async () => {
    const { gate } = harness();

    // `wrap`, `file` and `get` all name a context in their signature; there is no
    // accessor on the gate that would hand one back, and nothing here reads a global.
    expect(gate.wrap.length).toBeGreaterThanOrEqual(2);
    expect(gate.file.length).toBeGreaterThanOrEqual(2);
    expect(gate.get.length).toBeGreaterThanOrEqual(2);
    expect(await gate.get("nothing-here", turnContext())).toBeNull();
  });
});
