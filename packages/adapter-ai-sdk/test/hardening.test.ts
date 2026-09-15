/**
 * The edges: what the seam accepts, what it refuses, and what cannot be undone once
 * `affiantTools` has returned.
 *
 * Each suite here stands for one way the guarantee could be lost quietly rather than
 * loudly — a read whose host function is dropped, a definition mutated after wire-up, a
 * blank tenant, an approval flag set from outside, a generation the caller abandoned.
 * Every one runs on Node, under Bun and inside workerd.
 */

import { AffiantError, isAffiantError, type ToolDefinition, type TurnContext } from "@affiant/core";
import { describe, expect, it } from "vitest";

import { affiantTools, affiantToolsContext } from "../src/index.js";

import {
  callTool,
  docketRows,
  readTool,
  summaryOf,
  testGate,
  turnContext,
  writeTool,
  type WriteArgs,
} from "./support.js";

describe("a read definition is gated however the host exposes it (CV-4)", () => {
  it("wraps a read the host exposes as a dynamic tool, and calls the host's function", async () => {
    const gate = testGate();
    const seen: TurnContext[] = [];
    const tools = affiantTools(gate, [readTool(seen, "find_ticket", { sdkKind: "dynamic" })]);

    const result = await callTool(tools, "find_ticket", { query: "open" }, { turn: turnContext() });

    expect(result).toEqual({ kind: "read", result: "ticket-1 matches open" });
    expect(seen).toHaveLength(1);
  });

  it("wraps a read the host marks hostedMcp, and calls the host's function", async () => {
    const gate = testGate();
    const seen: TurnContext[] = [];
    const tools = affiantTools(gate, [readTool(seen, "find_ticket", { hostedMcp: true })]);

    const result = await callTool(tools, "find_ticket", { query: "open" }, { turn: turnContext() });

    expect(result).toEqual({ kind: "read", result: "ticket-1 matches open" });
    expect(seen).toHaveLength(1);
  });

  it("still declares a read with no execute and runs nobody's code for it", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [
      {
        name: "client_side_read",
        description: "A read the client runs.",
        inputSchema: { entityType: "Ticket", fields: [] },
        writeCapable: false,
        sdkKind: "provider" as const,
      },
    ]);

    expect(tools["client_side_read"]?.execute).toBeUndefined();
  });
});

describe("a definition mutated after wire-up changes nothing (GT-6, CV-1)", () => {
  it("does not reach the host's execute when writeCapable flips to false after the build", async () => {
    const gate = testGate();
    let called = 0;
    let writeCapable = true;
    const definition: ToolDefinition<WriteArgs, string> = {
      ...writeTool({
        execute: () => {
          called += 1;
          return "written";
        },
      }),
      get writeCapable(): boolean {
        return writeCapable;
      },
    };

    const tools = affiantTools(gate, [definition]);
    writeCapable = false;

    const result = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext() },
    );

    expect(called).toBe(0);
    expect(result.kind).toBe("write");
  });
});

describe("the whole turn context is checked at the seam (GT-2, CV-2)", () => {
  const base = turnContext();
  const cases: readonly (readonly [string, unknown])[] = [
    ["a blank tenant", { ...base, tenantId: "" }],
    ["a blank conversation", { ...base, conversationId: "   " }],
    ["a blank channel", { ...base, channel: "" }],
    ["a blank message id", { ...base, turn: { ...base.turn, messageId: "" } }],
    ["a blank instant", { ...base, turn: { ...base.turn, at: "" } }],
  ];

  for (const [what, turn] of cases) {
    it(`refuses ${what} on the write path, before the gate is touched`, async () => {
      const gate = testGate();
      const tools = affiantTools(gate, [writeTool()]);

      const failure = await callTool(tools, "update_ticket", { priority: "High" }, { turn }).catch(
        (error: unknown) => error,
      );

      expect(isAffiantError(failure)).toBe(true);
      expect((failure as AffiantError).code).toBe("wireup-invalid");
      expect((failure as AffiantError).details["toolName"]).toBe("update_ticket");
      expect(await docketRows(gate)).toHaveLength(0);
    });
  }

  it("refuses a context with no principal at all, on the read path too", async () => {
    const gate = testGate();
    const seen: TurnContext[] = [];
    const tools = affiantTools(gate, [readTool(seen)]);
    const { principal: _dropped, ...withoutPrincipal } = base;

    const failure = await callTool(
      tools,
      "find_ticket",
      { query: "open" },
      { turn: withoutPrincipal },
    ).catch((error: unknown) => error);

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect(seen).toHaveLength(0);
  });

  it("accepts a principal of null, which is the host saying no identity was resolved", async () => {
    const gate = testGate();
    const seen: TurnContext[] = [];
    const tools = affiantTools(gate, [readTool(seen)]);

    const result = await callTool(
      tools,
      "find_ticket",
      { query: "open" },
      { turn: { ...base, principal: null } },
    );

    expect(result.kind).toBe("read");
    expect(seen[0]?.principal).toBeNull();
  });
});

describe("the compact summary carries the blocked marker (AZ-4)", () => {
  it("tells the model a declared-uncovered filing is blocked, and why", async () => {
    const gate = testGate();
    const definition = writeTool({ executedBy: "provider" });
    gate.declareUncovered(definition, "provider-executed");
    const tools = affiantTools(gate, [definition]);
    const input: WriteArgs = { priority: "High" };

    const result = await callTool(tools, "update_ticket", input, { turn: turnContext() });
    const summary = (await summaryOf(tools, "update_ticket", input, result)) as Record<
      string,
      unknown
    >;

    expect(summary["blocked"]).toEqual({
      code: "coverage-refused",
      category: "provider-executed",
      toolName: "update_ticket",
    });
    expect(summary["requiresConfirmation"]).toBe(false);
    expect(String(summary["note"])).toContain("blocked");
  });
});

describe("the approval flag cannot be put back (AZ-5, CV-1)", () => {
  it("refuses the assignment at run time, because every built tool is frozen", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const entry = tools["update_ticket"] as Record<string, unknown>;

    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      entry["needsApproval"] = true;
    }).toThrow(TypeError);
    expect(entry["needsApproval"]).toBeUndefined();
  });

  it("freezes a declared tool too", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [
      {
        name: "client_side_read",
        description: "A read the client runs.",
        inputSchema: { entityType: "Ticket", fields: [] },
        writeCapable: false,
      },
    ]);

    expect(Object.isFrozen(tools["client_side_read"])).toBe(true);
  });
});

describe("an abandoned generation does not start a filing (AZ-7)", () => {
  it("throws an abort error and files nothing when the signal is already set", async () => {
    const gate = testGate();
    const results: unknown[] = [];
    const tools = affiantTools(gate, [writeTool()], {
      onResult(result) {
        results.push(result);
      },
    });
    const controller = new AbortController();
    controller.abort();

    const failure = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext() },
      controller.signal,
    ).catch((error: unknown) => error);

    expect((failure as { name?: string }).name).toBe("AbortError");
    expect(results).toHaveLength(0);
    expect(await docketRows(gate)).toHaveLength(0);
  });

  it("files as usual when the signal is present and not aborted", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const controller = new AbortController();

    const result = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      { turn: turnContext() },
      controller.signal,
    );

    expect(result.kind).toBe("write");
  });
});

describe("one context map stands for one gate (GT-2, CV-1)", () => {
  it("refuses a tool set holding two gates' tools", () => {
    const first = affiantTools(testGate(), [writeTool({ name: "update_ticket" })]);
    const second = affiantTools(testGate(), [writeTool({ name: "update_invoice" })]);

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), { ...first, ...second });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).details["toolName"]).toBe("update_invoice");
  });

  it("refuses a copy of a gated tool, because a copy is not the object that was built", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const copied = { copied_tool: { ...(tools["update_ticket"] as object) } };

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), copied as never);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).message).toContain("is not an object this copy");
  });

  it("refuses a frozen copy carrying its own execute, which nothing but identity catches", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    let ran = 0;
    // The forgery: frozen, no `needsApproval`, keeps the mark - and runs the host's own
    // function instead of the gate. Only the register tells it from the real thing.
    const forged = Object.freeze({
      ...(tools["update_ticket"] as object),
      execute: () => {
        ran += 1;
        return "written";
      },
    });

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), { update_ticket: forged } as never);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).message).toContain("is not an object this copy");
    expect((failure as AffiantError).details["toolName"]).toBe("update_ticket");
    expect(ran).toBe(0);
    expect(await docketRows(gate)).toHaveLength(0);
  });

  it("refuses a copy that adds the SDK's approval flag (AZ-5)", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    // The exact input: a spread of a gated tool with `needsApproval` set. Without the
    // check the SDK answers the step with a tool-approval-request and files nothing —
    // approval reconstructed from client history, in front of the gate.
    const set = { update_ticket: { ...(tools["update_ticket"] as object), needsApproval: true } };

    const failure = (() => {
      try {
        affiantToolsContext(turnContext(), set as never);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("wireup-invalid");
    expect((failure as AffiantError).message).toContain("AZ-5");
    expect((failure as AffiantError).details["toolName"]).toBe("update_ticket");
  });

  it("freezes the set it returns, so a tool cannot be swapped into it in place", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);

    expect(Object.isFrozen(tools)).toBe(true);
    expect(() => {
      (tools as Record<string, unknown>)["update_ticket"] = { needsApproval: true };
    }).toThrow(TypeError);
  });

  it("says nothing about a write tool the host added to the set itself", () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);
    const foreign = { name: "ungated_write", description: "A tool nobody gated." };

    const map = affiantToolsContext(turnContext(), { ...tools, ungated_write: foreign } as never);

    // Outside the guarantee: nothing here saw it, so nothing here can refuse it.
    expect(Object.keys(map)).toEqual(["update_ticket"]);
  });
});

describe("a principal is one of the core two kinds, with non-empty ids (GT-2, AZ-3)", () => {
  const base = turnContext();
  const cases: readonly (readonly [string, unknown])[] = [
    ["an empty object", {}],
    ["an array", []],
    ["a Date", new Date()],
    ["a kind the core does not define", { kind: "robot", id: "r-1" }],
    // The next three are admitted by the core's `Principal` type, which says `string`.
    // This seam is stricter on purpose: a blank id travels onto an attestation record
    // where a reader can no longer tell it from an absent one (AZ-1).
    ["a member with a blank id", { kind: "member", id: "" }],
    ["a service with a blank assertedMember", { kind: "service", id: "svc-1", assertedMember: "" }],
    [
      "a relay assertion with a blank channel identity",
      { kind: "service", id: "relay-1", relay: { channelIdentity: "", messageId: "wamid-1" } },
    ],
    [
      "a relay assertion missing its message id",
      { kind: "service", id: "relay-1", relay: { channelIdentity: "+94770000000" } },
    ],
  ];

  for (const [what, principal] of cases) {
    it(`refuses ${what}, and files nothing`, async () => {
      const gate = testGate();
      const tools = affiantTools(gate, [writeTool()]);

      const failure = await callTool(
        tools,
        "update_ticket",
        { priority: "High" },
        { turn: { ...base, principal } },
      ).catch((error: unknown) => error);

      expect((failure as AffiantError).code).toBe("wireup-invalid");
      expect(await docketRows(gate)).toHaveLength(0);
    });
  }

  it("accepts a relay speaking for a named person", async () => {
    const gate = testGate();
    const tools = affiantTools(gate, [writeTool()]);

    const result = await callTool(
      tools,
      "update_ticket",
      { priority: "High" },
      {
        turn: {
          ...base,
          principal: {
            kind: "service",
            id: "relay-1",
            assertedMember: "member-1",
            relay: { channelIdentity: "+94770000000", messageId: "wamid-1" },
          },
        },
      },
    );

    expect(result.kind).toBe("write");
  });
});

describe("a dynamic write tool is refused whatever the host declares (CV-4)", () => {
  it("does not lift the refusal when the tool is declared uncovered under a core category", () => {
    const gate = testGate();
    const definition = { ...writeTool(), sdkKind: "dynamic" as const };
    // A declaration converts a wire-up refusal into a Docket record for the three
    // categories the rulebook names. `"dynamic"` is not one of them, and there is no
    // field schema for a record to be made from.
    gate.declareUncovered(definition, "provider-executed");
    gate.declareUncovered({ name: "update_ticket" }, "provider-executed");

    const failure = (() => {
      try {
        affiantTools(gate, [definition]);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect((failure as AffiantError).code).toBe("coverage-refused");
    expect((failure as AffiantError).details["category"]).toBe("dynamic");
  });
});
