# Coverage refusal, run in front of you

A standalone sample. It builds an [Affiant](https://affiant.dev) gate over the in-memory
Docket and four trivial ports, hands it five tools, and prints what the gate does with each
one: two write-capable tools never get past wire-up, one reaches the Docket blocked and
cannot be decided, one is filed for a person, and the read tool passes straight through.

The point is that you can watch it fail correctly. Rule **CV-4** of the
[rulebook](https://github.com/Sakwala/affiant-protocol/blob/main/INVARIANTS.md) says an
implementation binds where it can intercept and _declares_ the categories it cannot — tools
with no `execute`, provider-executed tools, hosted-MCP server-side writes — and that a
write-capable tool in an uncovered category is refused at wire-up or filed `blocked` with
code `coverage-refused`, never silently allowed to write. That is a claim about behaviour,
so it should be runnable rather than read.

**This is not adoption.** It is not a host, not a product, and not the Vercel AI SDK
adapter — that comes later. The tool objects below are shaped like the AI SDK 7 tool object
(`{ description, inputSchema, execute? }`) so the seam an adapter would bind at is
recognisable, but the SDK is not a dependency of this sample and nothing here imports it.
Nothing in this sample writes to anything: the gate never executes a write by rule (AZ-7),
and the Docket lives in memory for the length of the process.

## Run it

```bash
pnpm install
pnpm -C samples/coverage-refusal build
node samples/coverage-refusal/dist/demo.js
```

`AFFIANT_DEMO_JSON=1 node samples/coverage-refusal/dist/demo.js` prints the same run as
JSON. The script exits `0` either way — every refusal here is the correct outcome, not a
failure of the run — and every instant comes from a pinned clock, so two runs print the
same bytes.

## What a skeptic sees

Recorded 2026-09-04, from `node samples/coverage-refusal/dist/demo.js`, verbatim. A test
asserts this block is exactly what the run prints, so it cannot drift away from the code.

<!-- transcript:begin -->

```text
Affiant - coverage refusal (CV-4), a standalone sample
Clock pinned to 2026-09-04T09:00:00.000Z. In-memory Docket. Nothing here writes to anything.

1. A host-executed write tool is intercepted, and the write becomes a proposal  [CV-4, GT-6]
  tool      update_ticket - writeCapable: true, executedBy: "host", execute: present
  coverage  covered - there is a function for the gate to stand in front of
  outcome   FILED - entry 50f4cb66-f341-8006-8e0e-dd470a296943, status pending, not blocked
  card      Ticket TKT-42 status="Active" aggregate 0.9 decide by 2026-09-04T09:30:00.000Z

2. A provider-executed write tool is refused when the host wires it  [CV-4, CV-1]
  tool      web_search_and_save - writeCapable: true, executedBy: "provider", execute: present
  coverage  uncovered (provider-executed) - the model provider runs it; the call never reaches
            this process
  outcome   REFUSED AT WIRE-UP - coverage-refused, category provider-executed
  reason    CV-4: write-capable tool "web_search_and_save" is in an uncovered category
            (provider-executed) — there is nothing for the gate to intercept, so a write through
            it would not be filed. Either make it interceptable, or call
            gate.declareUncovered(tool, "provider-executed") so every proposal from it is filed
            blocked on the Docket. There is no option that turns the gate off for a tool it
            covers (CV-1).

3. A write tool with no execute of its own is refused when the host wires it  [CV-4, CV-1]
  tool      save_draft_locally - writeCapable: true, execute: absent
  coverage  uncovered (no-execute) - no function to replace; whatever writes, writes out of
            sight
  outcome   REFUSED AT WIRE-UP - coverage-refused, category no-execute
  reason    CV-4: write-capable tool "save_draft_locally" is in an uncovered category
            (no-execute) — there is nothing for the gate to intercept, so a write through it
            would not be filed. Either make it interceptable, or call
            gate.declareUncovered(tool, "no-execute") so every proposal from it is filed blocked
            on the Docket. There is no option that turns the gate off for a tool it covers
            (CV-1).

4. A hosted-MCP write the host cannot cover is filed blocked, on the record  [CV-4, AZ-4]
  tool      crm_update_contact - writeCapable: true, hostedMcp: true, execute: present
  coverage  uncovered (hosted-mcp) - the write happens on the MCP server, past the seam an
            adapter binds at
  outcome   FILED BLOCKED - entry 9ba3a2f5-e4d9-8235-8261-c23dce75a7b9, status pending, blocked
            {"code":"coverage-refused","category":"hosted-mcp","toolName":"crm_update_contact"}
  card      CV-4: "crm_update_contact" is declared uncovered (hosted-mcp); this proposal is on
            the record and cannot be approved through the gate.

5. A read tool is wrapped and passes straight through  [CV-4]
  tool      search_tickets - writeCapable: false, execute: present
  coverage  covered - there is a function for the gate to stand in front of
  outcome   READ - "3 open tickets in tenant-a: TKT-42, TKT-51, TKT-77"

Summary: 5 steps - 1 filed, 2 refused at wire-up, 1 filed blocked, 1 read; 0 host writes executed.
```

<!-- transcript:end -->

## Why each refusal is correct

- **CV-4 — coverage refusal.** The gate binds by replacing a tool's `execute`, so a
  write-capable tool it cannot replace is a write it cannot see: step 2's tool runs on the
  model provider's side, step 3's has no `execute` at all, and step 4's writes inside a
  hosted MCP server. Each is refused or recorded under the category that names why, and
  none of them is allowed through.
- **CV-1 — hard-fail at wire-up; there is no disable switch.** Steps 2 and 3 throw from
  `gate.wrap` before a single call is made, and the message says what the two ways forward
  are: make the tool interceptable, or declare it uncovered. There is no flag that turns
  the gate off for a tool it covers, which is why the refusal has to happen when the host
  wires the tool rather than on the first request that happens to use it.
- **AZ-4 — the `blocked` marker and its codes.** Step 4's entry is filed `pending` with
  `blocked: { code: "coverage-refused", category: "hosted-mcp", toolName: … }`. A blocked
  entry refuses every decision, never executes, and never degrades to a weaker requirement
  — so declaring a tool uncovered converts a start-up refusal into a record a person can
  read, never into permission. The card says so too: it carries the warning and offers no
  confirm.

Step 1 is the control. The one write tool the gate _can_ intercept produces a proposal, not
a write — the gated path does not hold a reference to the tool's own `execute` at all
(GT-6), which is why the summary line can report zero host writes.

## What this sample is not

- **Not a host.** There is no database, no model, no transport and no reviewer surface. The
  inference port returns a fixed structured result and the projection port returns `null`,
  so every field's `previousValue` reads `null` — visibly less than a real host would show.
- **Not adoption.** Nobody is running this in production, and it is not evidence that
  anybody is.
- **Not the AI SDK adapter.** The tool objects mirror the SDK's shape for recognisability;
  binding a real `tools` record is a separate package, and its own coverage story will be
  written against these same three categories.
- **Not the whole boundary.** A tool that opens its own connection and writes inside its
  body is outside the guarantee, and no wire-up check can see it. GT-6 states that limit
  rather than pretending to enforce it.

## The tests

```bash
pnpm -C samples/coverage-refusal test
```

They assert the wire-up refusal and its category for steps 2 and 3, the blocked entry and
its marker for step 4, the filed entry for step 1, the pass-through for step 5, that no
write tool's own `execute` ever ran, and that the transcript above is exactly what
`runDemo()` produces.

## Where the rules live

`@affiant/core` implements them in [`packages/core/src/gate`](../../packages/core/src/gate)
— `coverage.ts` assesses a tool, `wrap.ts` raises the wire-up refusal, `pipeline.ts` files
the blocked entry. The rules themselves are in
[Sakwala/affiant-protocol](https://github.com/Sakwala/affiant-protocol): CV-4, CV-1, AZ-4,
GT-6 and AZ-7.
