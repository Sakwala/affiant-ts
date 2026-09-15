/**
 * `@affiant/adapter-ai-sdk` — Affiant tool definitions as an AI SDK `ToolSet`.
 *
 * Affiant turns every database write an LLM agent proposes into an **Affidavit**: a
 * per-field evidence record carrying the proposed value, the value it replaces, where
 * each value came from and how confident the producer is. An Affidavit is filed as a
 * **Docket** entry and shown to a person as an **Evidence Card**, which they approve,
 * amend or reject before the host commits anything. A **Standing Order** is a policy
 * verdict that approves a write with no person present.
 *
 * This package is the seam between that gate and the AI SDK. {@link affiantTools}
 * builds the `ToolSet`; {@link affiantToolsContext} builds the per-turn
 * `toolsContext` the SDK hands each `execute`; {@link stopWhenFiled} ends an agent
 * loop once an Affidavit is on the Docket. The structured-inference port the gate
 * needs is a separate entry point, `@affiant/adapter-ai-sdk/inference`, so a host
 * that supplies its own model client never loads it.
 *
 * **Supported surfaces:** `generateText`, `streamText` and `ToolLoopAgent` from `ai`
 * version 7 on the `latest` dist-tag. `WorkflowAgent` from `@ai-sdk/workflow` is not
 * supported in this version, and neither is a write-capable dynamic tool; the package
 * README says why.
 *
 * **What this package does not do:** it does not set the SDK's `needsApproval` or
 * `toolApproval`. The SDK's approval flow returns an approval request to the client
 * and reconstructs the answer from the message history the client sends back. AZ-5
 * puts approval authority on the Docket row and nowhere else, so this adapter does
 * not offer a second place for it to appear to live. A person decides through
 * `gate.decide`, and the host's own executor runs the approved row.
 *
 * @packageDocumentation
 */

/** The version of this package. */
export const ADAPTER_VERSION = "0.1.0-alpha.0";

export { affiantTools, affiantToolsContext, TURN_CONTEXT_SCHEMA } from "./tools.js";
export type {
  AdapterUncoveredCategory,
  AffiantToolContext,
  AffiantToolDefinition,
  AffiantToolSet,
  AffiantToolsOptions,
  JsonSchemaObject,
} from "./tools.js";

export { stopWhenFiled } from "./stop.js";
