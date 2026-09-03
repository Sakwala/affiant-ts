import { expectTypeOf } from "vitest";

import type { Principal } from "../src/context.js";
import type { Attestor } from "../src/docket/entry.js";
import type { Decision, MemberAttestation, RelayAttestation } from "../src/gate/decide.js";
import { attestorOf } from "../src/gate/decide.js";
import type { Gate, GateOptions } from "../src/gate/gate.js";

/**
 * Type-level assertions for the decision path. Not a runtime suite —
 * `vitest.config.ts` collects `*.test.ts`, and this file is `*.test-d.ts`, so it is
 * checked by `tsc -p tsconfig.test.json` and never executed. What it pins is the half
 * of AZ-3 and AZ-7 that a compiler can enforce, which is the half a reviewer never has
 * to re-check.
 */

// ---------------------------------------------------------------------------
// AZ-3 — a machine caller can never attest `member`
// ---------------------------------------------------------------------------

declare const machine: Extract<Principal, { kind: "service" }>;
declare const person: Extract<Principal, { kind: "member" }>;

// The strongest thing a service principal's attestation can be is member-via-relay,
// and it can also be nothing at all. `member` is not in the type.
expectTypeOf(attestorOf(machine)).toEqualTypeOf<RelayAttestation | null>();
expectTypeOf(attestorOf(machine)).not.toEqualTypeOf<Attestor | null>();
expectTypeOf(attestorOf(machine)).not.toExtend<MemberAttestation>();

// A human-verified session attests `member`, and never has nothing to say.
expectTypeOf(attestorOf(person)).toEqualTypeOf<MemberAttestation>();

// A relayed attestation names both the person and the relay it came over.
expectTypeOf<RelayAttestation>().toHaveProperty("memberId");
expectTypeOf<RelayAttestation>().toHaveProperty("relay");

// There is no parameter on a decision through which a caller could name whose
// signature it is: the attestation comes from the principal, or from nowhere.
expectTypeOf<Decision>().not.toHaveProperty("attestation");
expectTypeOf<Decision>().not.toHaveProperty("attestor");
expectTypeOf<Decision>().not.toHaveProperty("principal");

// ---------------------------------------------------------------------------
// AZ-7 — the framework never performs the write
// ---------------------------------------------------------------------------

// No executor on the gate, and no port in the options one could be built from. The
// only way to `execution: "executed"` is `markExecuted`, a host's own report.
expectTypeOf<Gate>().not.toHaveProperty("execute");
expectTypeOf<Gate>().not.toHaveProperty("executor");
expectTypeOf<GateOptions>().not.toHaveProperty("executor");
expectTypeOf<GateOptions>().not.toHaveProperty("execute");
expectTypeOf<Gate>().toHaveProperty("markExecuted");

// ---------------------------------------------------------------------------
// DK-1 — amending is approving, not a third verb
// ---------------------------------------------------------------------------

expectTypeOf<Decision["kind"]>().toEqualTypeOf<"approve" | "reject">();

// @ts-expect-error DK-1: a rejection states its reason.
const unexplained: Decision = { kind: "reject" };
void unexplained;

// @ts-expect-error DK-1: an amendment is carried by an approval, never on its own.
const orphan: Decision = { kind: "amend", amendments: { status: "Active" } };
void orphan;
