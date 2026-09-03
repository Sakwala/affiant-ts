import type { EvidenceCardRequest as WireEvidenceCardRequest } from "@affiant/contract";

import type { EvidenceCardRequest } from "../src/gate/pipeline.js";
import type { GatedToolResult } from "../src/gate/wrap.js";
import type { InferenceSource } from "../src/model/provenance.js";
import { mintInference } from "../src/model/provenance.js";
import type { ToolDefinition } from "../src/gate/coverage.js";

/**
 * Type-level assertions for the gate. Not a runtime suite — `vitest.config.ts` collects
 * `*.test.ts`, and this file is `*.test-d.ts`, so it is checked by
 * `tsc -p tsconfig.test.json` and never executed. What it pins is what a type error is
 * supposed to be: a rule the compiler enforces.
 */

// ---------------------------------------------------------------------------
// SR-4 — the card the gate emits is still the wire envelope, plus the version
// ---------------------------------------------------------------------------

declare const card: EvidenceCardRequest;
const asWire: WireEvidenceCardRequest = card;
void asWire;

// ---------------------------------------------------------------------------
// PV-3 — the inference step cannot name `UserStated`
// ---------------------------------------------------------------------------

// @ts-expect-error PV-3: an implementation's own inference never mints UserStated.
mintInference("UserStated", { confidence: 1, at: "2026-09-04T09:00:00.000Z" });

const allowed: readonly InferenceSource[] = ["Conversation", "Inferred"];
void allowed;

// ---------------------------------------------------------------------------
// GT-6 — a gated call returns a proposal, a read result or an error; never a write
// ---------------------------------------------------------------------------

declare const result: GatedToolResult<string>;
const kinds: "write" | "read" | "error" = result.kind;
void kinds;

// @ts-expect-error GT-6: there is no "written" arm; a write tool produces a proposal.
const impossible: GatedToolResult<string> = { kind: "written", entryId: "e" };
void impossible;

// ---------------------------------------------------------------------------
// A concrete tool is assignable to the bare ToolDefinition the gate inspects
// ---------------------------------------------------------------------------

declare const concrete: ToolDefinition<{ readonly id: string }, number>;
const inspectable: ToolDefinition = concrete;
void inspectable;
