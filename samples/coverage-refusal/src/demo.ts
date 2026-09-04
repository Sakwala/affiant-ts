/**
 * Coverage refusal, run in front of you (CV-4).
 *
 * A standalone sample — not a host, not an adopter, not the Vercel AI SDK adapter.
 * It wires `@affiant/core`'s gate to trivial in-memory ports, hands it four tools
 * shaped the way a tool object is shaped in the Vercel AI SDK, and prints what the
 * gate does with each one. Two of them never get past wire-up; one is on the record
 * and cannot be decided; one is filed for a person; the read tool passes through.
 *
 * **Rules demonstrated.**
 *
 * - **CV-4** — an implementation binds where it can intercept and *declares* the
 *   categories it cannot: tools with no `execute`, provider-executed tools,
 *   hosted-MCP server-side writes. A write-capable tool in an uncovered category is
 *   refused at wire-up, or — where wire-up cannot see it — filed `blocked` with code
 *   `coverage-refused`. It is never silently allowed to write.
 * - **CV-1** — the refusal happens at wire-up, with a stated error, and no option
 *   turns the gate off for a tool it covers.
 * - **AZ-4** — the `blocked` marker and its codes: a blocked entry stays `pending`,
 *   refuses every decision, and never degrades to a weaker requirement.
 * - **GT-6** — a write tool can only produce a proposal. The gated write path never
 *   holds a reference to the tool's own `execute`, so step 1's counter reads zero.
 *
 * ## The tool shape
 *
 * The four tools below are written as `{ description, inputSchema, execute? }`,
 * which is the Vercel AI SDK 7 tool object's own shape, plus the three declarations
 * the gate needs — `writeCapable`, `executedBy`, `hostedMcp` — and the `operation`
 * function that says what a call is about to write. **The SDK is not a dependency of
 * this sample and is not imported here**; the shape is mirrored so the seam an
 * adapter would bind at is recognisable. Two differences are worth naming: the SDK
 * carries a tool's name as the key in its `tools` record where the gate's
 * `ToolDefinition` carries it as a property, and the gate's `inputSchema` is a
 * `FieldSchema` — the field list the inference step works against — rather than a
 * Zod or JSON schema.
 *
 * ## Determinism
 *
 * Every instant comes from a pinned clock and every port answers the same thing on
 * every run, so the transcript in `README.md` is reproducible byte for byte. That is
 * what lets a test compare the two and fail when they drift.
 *
 * @packageDocumentation
 */

import { pathToFileURL } from "node:url";

import { assessCoverage, createGate, isAffiantError } from "@affiant/core";
import type {
  AuthorizationPort,
  BlockedMarker,
  Clock,
  DocketStatus,
  FieldSchema,
  Gate,
  InferencePort,
  JsonValue,
  Operation,
  ProjectionPort,
  StructuredField,
  ToolDefinition,
  TurnContext,
  UncoveredCategory,
} from "@affiant/core";
import { InMemoryDocketStore } from "@affiant/core/store-memory";

// ---------------------------------------------------------------------------
// What the demo reports
// ---------------------------------------------------------------------------

/** What happened to one tool. The discriminator is what a test asserts on. */
export type DemoOutcome =
  | {
      /** The proposal was filed for a person to decide. */
      readonly kind: "filed";
      /** The Docket entry it was filed under. */
      readonly entryId: string;
      /** What the row reads at. */
      readonly status: DocketStatus;
      /** `null` — nothing blocks this one. */
      readonly blocked: null;
      /** What the Evidence Card says, in one line. */
      readonly card: string;
    }
  | {
      /** `gate.wrap` threw before a single call could be made (CV-1). */
      readonly kind: "refused-at-wire-up";
      /** Always `"coverage-refused"` here. */
      readonly code: string;
      /** Which category the gate could not cover (CV-4). */
      readonly category: UncoveredCategory;
      /** The refusal, verbatim. */
      readonly message: string;
    }
  | {
      /** The proposal was filed, and the row says no decision will be accepted (AZ-4). */
      readonly kind: "filed-blocked";
      /** The Docket entry it was filed under. */
      readonly entryId: string;
      /** What the row reads at — `"pending"`, and it stays there. */
      readonly status: DocketStatus;
      /** The AZ-4 marker: the code, the category and the tool. */
      readonly blocked: BlockedMarker;
      /** The warning the card carries for a reviewer. */
      readonly warning: string;
    }
  | {
      /** A read tool ran and returned its own result. */
      readonly kind: "read";
      /** Whatever it returned. */
      readonly result: string;
    };

/** One numbered step of the demonstration. */
export interface DemoStep {
  /** Its position in the transcript, from 1. */
  readonly step: number;
  /** What the step is showing, in a few words. */
  readonly title: string;
  /** The rulebook ids the step demonstrates. */
  readonly rules: readonly string[];
  /** The tool the step is about. */
  readonly toolName: string;
  /** The tool's own declarations, as the host wrote them. */
  readonly declared: string;
  /** Whether the gate can intercept it, and why not when it cannot. */
  readonly coverage: string;
  /** What the gate did. */
  readonly outcome: DemoOutcome;
}

/** Everything one run of the demonstration produced. */
export interface DemoResult {
  /** The pinned instant every record in this run is stamped with. */
  readonly at: string;
  /** The five steps, in order. */
  readonly steps: readonly DemoStep[];
  /**
   * How many times a write tool's own `execute` ran. Always `0`: the gated write
   * path does not hold a reference to it (GT-6).
   */
  readonly hostWrites: number;
  /** The one-line closing line. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// The turn, and the ports the gate asks the host for
// ---------------------------------------------------------------------------

/** The instant this sample pins every record to, so the transcript reproduces. */
export const DEMO_AT = "2026-09-04T09:00:00.000Z";

/** How long a filed entry stays open here: thirty minutes (GT-4). */
const DEMO_TTL_MS = 30 * 60 * 1000;

/** What the person in this sample said. Every provenance tag traces back to it. */
const UTTERANCE = "Set ticket TKT-42 to Active and hand it to Ana";

/** The clock. A port, not `Date.now()`, which is what makes the run reproducible. */
const clock: Clock = { now: () => DEMO_AT };

/** Where in {@link UTTERANCE} `needle` sits, as the offsets an inference reports. */
function spanOf(needle: string): { readonly start: number; readonly end: number } {
  const start = UTTERANCE.indexOf(needle);
  if (start === -1) throw new RangeError(`${JSON.stringify(needle)} is not in the utterance`);
  return { start, end: start + needle.length };
}

/**
 * The fixed structured result this sample's inference returns, keyed by field name.
 *
 * A real host calls a model here. The gate ships no model client by rule, so what
 * a sample supplies is a function of the same shape that answers the same way every
 * time — which is all the gate needs to file an Affidavit with substance in it.
 */
const INFERRED: { readonly [name: string]: StructuredField } = {
  status: {
    value: "Active",
    confidence: 0.9,
    presence: "literal",
    utteranceSpan: spanOf("Active"),
  },
  owner: {
    value: "ana@example.com",
    confidence: 0.72,
    presence: "inferred",
    utteranceSpan: null,
  },
};

/** One tool-free structured extraction over the unmodified turn (GT-1 step 3). */
const inference: InferencePort = {
  async infer(_turn, schema) {
    const fields: { [name: string]: StructuredField } = {};
    for (const field of schema.fields) {
      const value = INFERRED[field.name];
      if (value !== undefined) fields[field.name] = value;
    }
    return { fields };
  },
};

/**
 * The previous-value lookup (AF-3), with nothing to look up.
 *
 * A real host answers this from its database, and that is the only reason a card can
 * say "was £40, becomes £4,000". This sample has no database, so it returns `null`
 * and every field's `previousValue` reads `null` — honest, and visibly less than a
 * host would show.
 */
const projection: ProjectionPort = {
  async previousValues() {
    return null;
  },
};

/** The member this sample's authorization admits. */
const DEMO_MEMBER = "ana";

/**
 * Who may decide an entry (AZ-2). The gate fails closed on this answer.
 *
 * Nothing in this demonstration decides anything — the point is what happens before
 * a decision is possible — but the port is required at wire-up, so it is written out
 * rather than stubbed to `true`.
 */
const authorization: AuthorizationPort = {
  async mayDecide(principal) {
    return principal.kind === "member" && principal.id === DEMO_MEMBER;
  },
};

/** The turn context, explicit in every property and passed at every call site (GT-2). */
const ctx: TurnContext = {
  conversationId: "conv-1",
  tenantId: "tenant-a",
  channel: "chat",
  principal: { kind: "member", id: DEMO_MEMBER },
  turn: { utterance: UTTERANCE, messageId: "msg-1", at: DEMO_AT },
};

// ---------------------------------------------------------------------------
// The four tools, shaped like the AI SDK's
// ---------------------------------------------------------------------------

/** The arguments this sample's tools take: a flat bag of field values. */
type WriteArgs = { readonly [field: string]: JsonValue };

/** A one-field schema, in the shape the inference step and the card both read. */
function schemaFor(
  entityType: string,
  name: string,
  kind: "text" | "enum",
  allowedValues: readonly string[] | null,
): FieldSchema {
  return {
    entityType,
    fields: [
      {
        name,
        kind,
        description: `The ${entityType.toLowerCase()}'s ${name}`,
        required: true,
        allowedValues,
        pattern: null,
      },
    ],
  };
}

/** An update of one entity, with the fields the call actually carried. */
function updateOf(entityType: string, entityId: string) {
  return (args: WriteArgs): Operation => ({
    kind: "update",
    entityType,
    entityId,
    fields: Object.keys(args),
  });
}

/**
 * How many times a write tool's own `execute` ran. GT-6 says: never.
 *
 * The counter is the tripwire. `wrapTool` does not capture a write tool's `execute`
 * on the gated path at all, so there is no branch that could increment this — and a
 * number printed at the end is a claim a reader can check rather than take.
 */
let hostWrites = 0;

/** (a) A host-executed write tool. `execute` is present, so the gate can replace it. */
const updateTicket: ToolDefinition<WriteArgs, string> = {
  name: "update_ticket",
  description: "Set a support ticket's status.",
  inputSchema: schemaFor("Ticket", "status", "enum", ["Draft", "Active", "Retired"]),
  writeCapable: true,
  executedBy: "host",
  operationLabel: "WriteUpdate",
  operation: updateOf("Ticket", "TKT-42"),
  execute(args: WriteArgs): string {
    // Never reached. If GT-6 ever stopped holding, this line is where it would show.
    hostWrites += 1;
    return `wrote ${JSON.stringify(args)}`;
  },
};

/**
 * (b) A provider-executed write tool: the model provider runs the search and the
 * save on its own side, so the call never reaches this process.
 *
 * It carries a local `execute` on purpose. `assessCoverage` reports the *first*
 * category that matches, and a tool with no `execute` reads as `"no-execute"`
 * whatever else is true of it — because that is the fact a host can check without
 * knowing anything about the provider. Giving this one a local stub is what isolates
 * the `"provider-executed"` category so it can be shown on its own.
 */
const webSearchAndSave: ToolDefinition<WriteArgs, string> = {
  name: "web_search_and_save",
  description: "Search the web and save the best answer onto the ticket.",
  inputSchema: schemaFor("Ticket", "status", "text", null),
  writeCapable: true,
  executedBy: "provider",
  operationLabel: "WriteUpdate",
  operation: updateOf("Ticket", "TKT-42"),
  execute(): string {
    return "the provider ran this, not us";
  },
};

/** (c) A write tool with no `execute`: the client runs it, wherever the client is. */
const saveDraftLocally: ToolDefinition<WriteArgs, string> = {
  name: "save_draft_locally",
  description: "Save the draft in the browser and sync it later.",
  inputSchema: schemaFor("Ticket", "status", "text", null),
  writeCapable: true,
  operationLabel: "WriteUpdate",
  operation: updateOf("Ticket", "TKT-42"),
};

/** The fields and the write the hosted-MCP tool proposes, named once and reused. */
const CRM_SCHEMA = schemaFor("Contact", "owner", "text", null);
const crmOperation = updateOf("Contact", "contact-7");
const CRM_ARGS: WriteArgs = { owner: "ana@example.com" };

/** (d) A hosted-MCP write tool: the write happens server-side, past the seam. */
const crmUpdateContact: ToolDefinition<WriteArgs, string> = {
  name: "crm_update_contact",
  description: "Set the owner on a CRM contact.",
  inputSchema: CRM_SCHEMA,
  writeCapable: true,
  hostedMcp: true,
  operationLabel: "WriteUpdate",
  operation: crmOperation,
  execute(): string {
    return "the hosted MCP server ran this, not us";
  },
};

/** (e) A read tool. Nothing to gate: it is wrapped and passes straight through. */
const searchTickets: ToolDefinition<WriteArgs, string> = {
  name: "search_tickets",
  description: "Find tickets matching a query.",
  inputSchema: schemaFor("Ticket", "query", "text", null),
  writeCapable: false,
  execute(_args: WriteArgs, turn: TurnContext): string {
    // The same explicit context the seam was given, at the bottom of the call path
    // (GT-2) — nothing here reached for an ambient conversation.
    return `3 open tickets in ${turn.tenantId}: TKT-42, TKT-51, TKT-77`;
  },
};

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** A gate wired to this sample's ports, with nothing that could turn it off. */
function buildGate(): Gate {
  return createGate({
    store: new InMemoryDocketStore({ clock }),
    inference,
    projection,
    authorization,
    clock,
    defaultTtlMs: DEMO_TTL_MS,
  });
}

/** How a tool's own declarations read, for the transcript. */
function declarationsOf(tool: ToolDefinition): string {
  const parts = [`writeCapable: ${String(tool.writeCapable)}`];
  if (tool.executedBy !== undefined) parts.push(`executedBy: ${JSON.stringify(tool.executedBy)}`);
  if (tool.hostedMcp !== undefined) parts.push(`hostedMcp: ${String(tool.hostedMcp)}`);
  parts.push(typeof tool.execute === "function" ? "execute: present" : "execute: absent");
  return parts.join(", ");
}

/** What {@link assessCoverage} found, in a line a reader can act on. */
function coverageOf(tool: ToolDefinition): string {
  const assessment = assessCoverage(tool);
  if (assessment.covered) return "covered - there is a function for the gate to stand in front of";
  return `uncovered (${assessment.category}) - ${WHY[assessment.category]}`;
}

/** One line per category, saying what the gate cannot see. */
const WHY: { readonly [K in UncoveredCategory]: string } = {
  "no-execute": "no function to replace; whatever writes, writes out of sight",
  "provider-executed": "the model provider runs it; the call never reaches this process",
  "hosted-mcp": "the write happens on the MCP server, past the seam an adapter binds at",
};

/** Wrap `tool` and report what wire-up did with it (CV-1, CV-4). */
function wireUp(gate: Gate, tool: ToolDefinition<WriteArgs, string>): DemoOutcome | null {
  try {
    gate.wrap(tool, ctx);
    return null;
  } catch (error) {
    if (!isAffiantError(error)) throw error;
    const category = error.details["category"];
    if (!isUncovered(category)) throw error;
    return {
      kind: "refused-at-wire-up",
      code: error.code,
      category,
      message: error.message,
    };
  }
}

/** Whether `value` is one of the three uncovered categories. */
function isUncovered(value: unknown): value is UncoveredCategory {
  return value === "no-execute" || value === "provider-executed" || value === "hosted-mcp";
}

/** The Evidence Card's substance, in one line: the entity, the field, the numbers. */
function cardLine(
  affidavit: {
    readonly entityType: string;
    readonly entityId: string | null;
    readonly fields: readonly { readonly name: string; readonly value: JsonValue }[];
    readonly aggregateConfidence: number;
  },
  requiredBy: string,
): string {
  const fields = affidavit.fields
    .map((field) => `${field.name}=${JSON.stringify(field.value)}`)
    .join(" ");
  return (
    `${affidavit.entityType} ${affidavit.entityId ?? "(new)"} ${fields} ` +
    `aggregate ${affidavit.aggregateConfidence} decide by ${requiredBy}`
  );
}

/**
 * Run the five steps and report what each one did.
 *
 * Pure with respect to the process: it builds its own gate over its own in-memory
 * store, so a caller can run it twice and get the same answer both times.
 */
export async function runDemo(): Promise<DemoResult> {
  hostWrites = 0;
  const gate = buildGate();
  const steps: DemoStep[] = [];

  // --- 1. A host-executed write tool: wrapped, called, filed ----------------
  const gatedUpdate = gate.wrap(updateTicket, ctx);
  const filed = await gatedUpdate.execute({ status: "Active" });
  if (filed.kind !== "write") throw new Error(`step 1 expected a proposal, got ${filed.kind}`);
  steps.push({
    step: 1,
    title: "A host-executed write tool is intercepted, and the write becomes a proposal",
    rules: ["CV-4", "GT-6"],
    toolName: updateTicket.name,
    declared: declarationsOf(updateTicket),
    coverage: coverageOf(updateTicket),
    outcome: {
      kind: "filed",
      entryId: filed.entryId,
      status: filed.status,
      blocked: null,
      card: cardLine(filed.card.affidavit, filed.card.requiredBy),
    },
  });

  // --- 2. A provider-executed write tool: refused at wire-up ----------------
  const providerRefusal = wireUp(gate, webSearchAndSave);
  if (providerRefusal === null) throw new Error("step 2 expected a wire-up refusal");
  steps.push({
    step: 2,
    title: "A provider-executed write tool is refused when the host wires it",
    rules: ["CV-4", "CV-1"],
    toolName: webSearchAndSave.name,
    declared: declarationsOf(webSearchAndSave),
    coverage: coverageOf(webSearchAndSave),
    outcome: providerRefusal,
  });

  // --- 3. A write tool with no `execute`: refused at wire-up ----------------
  const clientRefusal = wireUp(gate, saveDraftLocally);
  if (clientRefusal === null) throw new Error("step 3 expected a wire-up refusal");
  steps.push({
    step: 3,
    title: "A write tool with no execute of its own is refused when the host wires it",
    rules: ["CV-4", "CV-1"],
    toolName: saveDraftLocally.name,
    declared: declarationsOf(saveDraftLocally),
    coverage: coverageOf(saveDraftLocally),
    outcome: clientRefusal,
  });

  // --- 4. A hosted-MCP write tool: declared, then filed blocked -------------
  // The host cannot intercept it and says so. The declaration does not grant the
  // tool anything: it converts a wire-up refusal into a Docket record, and AZ-4
  // says a blocked entry refuses every decision and never executes.
  const assessment = assessCoverage(crmUpdateContact);
  if (assessment.covered) throw new Error("step 4 expected an uncovered tool");
  gate.declareUncovered(crmUpdateContact, assessment.category);
  const blockedEntry = await gate.file(
    {
      toolName: crmUpdateContact.name,
      operation: crmOperation(CRM_ARGS),
      schema: CRM_SCHEMA,
      args: CRM_ARGS,
      operationLabel: "WriteUpdate",
    },
    ctx,
  );
  const marker = blockedEntry.entry.blocked;
  if (marker === null) throw new Error("step 4 expected a blocked entry");
  steps.push({
    step: 4,
    title: "A hosted-MCP write the host cannot cover is filed blocked, on the record",
    rules: ["CV-4", "AZ-4"],
    toolName: crmUpdateContact.name,
    declared: declarationsOf(crmUpdateContact),
    coverage: coverageOf(crmUpdateContact),
    outcome: {
      kind: "filed-blocked",
      entryId: blockedEntry.entry.entryId,
      status: blockedEntry.entry.status,
      blocked: marker,
      warning: blockedEntry.card.affidavit.warnings.join(" "),
    },
  });

  // --- 5. A read tool: nothing to gate -------------------------------------
  const gatedRead = gate.wrap(searchTickets, ctx);
  const read = await gatedRead.execute({ query: "open" });
  if (read.kind !== "read") throw new Error(`step 5 expected a read result, got ${read.kind}`);
  steps.push({
    step: 5,
    title: "A read tool is wrapped and passes straight through",
    rules: ["CV-4"],
    toolName: searchTickets.name,
    declared: declarationsOf(searchTickets),
    coverage: coverageOf(searchTickets),
    outcome: { kind: "read", result: read.result },
  });

  const counts = tally(steps);
  return {
    at: DEMO_AT,
    steps,
    hostWrites,
    summary:
      `${String(steps.length)} steps - ${String(counts.filed)} filed, ` +
      `${String(counts.refused)} refused at wire-up, ${String(counts.blocked)} filed blocked, ` +
      `${String(counts.read)} read; ${String(hostWrites)} host writes executed.`,
  };
}

/** How many steps ended each way. */
function tally(steps: readonly DemoStep[]): {
  readonly filed: number;
  readonly refused: number;
  readonly blocked: number;
  readonly read: number;
} {
  const count = (kind: DemoOutcome["kind"]): number =>
    steps.filter((step) => step.outcome.kind === kind).length;
  return {
    filed: count("filed"),
    refused: count("refused-at-wire-up"),
    blocked: count("filed-blocked"),
    read: count("read"),
  };
}

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------

/** The label column's width, so every step reads as a table. */
const LABEL = 10;

/** One `label  value` line, with `value` wrapped and hung under itself. */
function row(label: string, value: string): string[] {
  const indent = " ".repeat(LABEL + 2);
  const width = 96 - indent.length;
  const [first = "", ...rest] = wrap(value, width);
  return [`  ${label.padEnd(LABEL)}${first}`, ...rest.map((line) => `${indent}${line}`)];
}

/** `text` broken into lines of at most `width` characters, on spaces. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current === "") current = word;
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

/** The lines describing what the gate did, per outcome kind. */
function outcomeRows(outcome: DemoOutcome): string[] {
  switch (outcome.kind) {
    case "filed":
      return [
        ...row(
          "outcome",
          `FILED - entry ${outcome.entryId}, status ${outcome.status}, not blocked`,
        ),
        ...row("card", outcome.card),
      ];
    case "refused-at-wire-up":
      return [
        ...row("outcome", `REFUSED AT WIRE-UP - ${outcome.code}, category ${outcome.category}`),
        ...row("reason", outcome.message),
      ];
    case "filed-blocked":
      return [
        ...row(
          "outcome",
          `FILED BLOCKED - entry ${outcome.entryId}, status ${outcome.status}, ` +
            `blocked ${JSON.stringify(outcome.blocked)}`,
        ),
        ...row("card", outcome.warning),
      ];
    case "read":
      return row("outcome", `READ - ${JSON.stringify(outcome.result)}`);
  }
}

/** The whole transcript, exactly as `node dist/demo.js` prints it. */
export function renderTranscript(result: DemoResult): string {
  const lines: string[] = [
    "Affiant - coverage refusal (CV-4), a standalone sample",
    `Clock pinned to ${result.at}. In-memory Docket. Nothing here writes to anything.`,
    "",
  ];
  for (const step of result.steps) {
    lines.push(`${String(step.step)}. ${step.title}  [${step.rules.join(", ")}]`);
    lines.push(...row("tool", `${step.toolName} - ${step.declared}`));
    lines.push(...row("coverage", step.coverage));
    lines.push(...outcomeRows(step.outcome));
    lines.push("");
  }
  lines.push(`Summary: ${result.summary}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

/** Print the run: the transcript, or JSON when `AFFIANT_DEMO_JSON=1`. */
export async function main(): Promise<void> {
  const result = await runDemo();
  const asJson = process.env["AFFIANT_DEMO_JSON"] === "1";
  console.log(asJson ? JSON.stringify(result, null, 2) : renderTranscript(result));
}

// Run only when this module is the process entry point, so the suite can import
// `runDemo` without the script printing over its own output.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
