/**
 * The published surface, used by somebody who is not in this repository.
 *
 * An in-repo suite sees `src/`, the workspace's path mapping and this package's own
 * `tsconfig`. A consumer sees a tarball, the emitted `.d.ts`, the `exports` map, and
 * its own `tsc --strict`. Those are different programs, and an export that is
 * comfortable in the first can be unreachable in the second — a name the emitted
 * declaration does not carry, a subpath the map does not reach, an argument type a
 * host cannot satisfy. None of that is visible from inside.
 *
 * So this packs the package, installs the tarball into a scratch project, and does
 * two things there: it *runs* the read-side producers a review queue needs —
 * `cardFor`, `decisionResultOf`, `isCallerError` — against a gate over the in-memory
 * store, and it compiles the consumer a host would write with `tsc --strict`. A
 * non-zero exit from either fails the test.
 *
 * Node-only: it packs, installs and spawns, and a Worker does none of those.
 * Excluded from the workerd run by `vitest.workers.config.ts`, which matches
 * `test/*.test.ts` and so cannot see this directory. It needs the registry for
 * `@types/node`, and it asks the registry whether it is there before it packs
 * anything: a silent registry skips the suite, and an install that fails against a
 * registry that answered is a failure, because that is a manifest a consumer cannot
 * resolve.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceRoot = join(packageRoot, "..", "..");

/** Run a command, returning its output, or `null` with nothing when it failed. */
function run(command: string, args: readonly string[], cwd: string): string | null {
  try {
    return execFileSync(command, [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AFFIANT_ALLOW_PUBLISH: "1" },
    });
  } catch {
    return null;
  }
}

/** The single `.tgz` in `directory`, or `null`. */
function tarballIn(directory: string): string | null {
  const found = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
  return found.length === 1 && found[0] !== undefined ? join(directory, found[0]) : null;
}

/**
 * Whether the npm registry answers at all.
 *
 * The install below needs the registry, and a machine without one should not report a
 * failure it cannot attribute. But "the install failed" and "the registry is
 * unreachable" are different facts, and conflating them is how a published manifest
 * that cannot be resolved passes as a skip. So the registry is asked one question of
 * its own first: only a silent registry skips this suite, and an install that fails
 * against a registry that answered is a failure.
 */
function registryReachable(): boolean {
  try {
    execFileSync("npm", ["ping", "--loglevel", "error"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  }
}

const scratch = mkdtempSync(join(tmpdir(), "affiant-packed-core-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const built = existsSync(join(packageRoot, "dist", "index.d.ts"));
// Asked once, before anything is packed: a machine with no registry skips, and
// everything past this point treats a failed install as a defect in what was packed.
const online = registryReachable();

/**
 * The host's own script, run by `node` from the scratch project.
 *
 * It is plain JavaScript on purpose — what it proves is that the *runtime* exports
 * are reachable through the package name and the `store-memory` subpath, and behave
 * as the README says. The types are proved separately, by `tsc` over `consumer.ts`.
 */
const RUNNER = [
  `import assert from "node:assert/strict";`,
  ``,
  `import {`,
  `  cardFor,`,
  `  chainOf,`,
  `  createGate,`,
  `  decisionResultOf,`,
  `  isCallerError,`,
  `  mintConversation,`,
  `} from "@affiant/core";`,
  `import { InMemoryDocketStore, InMemorySessionStore } from "@affiant/core/store-memory";`,
  ``,
  `const AT = "2026-09-04T09:00:00.000Z";`,
  `const clock = { now: () => AT };`,
  `const store = new InMemoryDocketStore({ clock });`,
  ``,
  `const gate = createGate({`,
  `  store,`,
  `  sessions: new InMemorySessionStore(store),`,
  `  inference: { infer: async () => ({ fields: {} }) },`,
  `  projection: { previousValues: async () => null },`,
  `  authorization: { mayDecide: async () => true },`,
  `  policies: [],`,
  `  interceptors: [],`,
  `  clock,`,
  `  defaultTtlMs: 30 * 60 * 1000,`,
  `});`,
  ``,
  `const ctx = {`,
  `  conversationId: "conv-1",`,
  `  tenantId: "acme",`,
  `  channel: "chat",`,
  `  principal: { kind: "member", id: "ana" },`,
  `  turn: { utterance: "Set invoice INV-2 to Active", messageId: "msg-1", at: AT },`,
  `};`,
  ``,
  `const schema = {`,
  `  entityType: "Invoice",`,
  `  fields: [`,
  `    {`,
  `      name: "status",`,
  `      kind: "enum",`,
  `      description: "The invoice status",`,
  `      required: true,`,
  `      allowedValues: ["Draft", "Active", "Retired"],`,
  `      pattern: null,`,
  `    },`,
  `  ],`,
  `};`,
  ``,
  `const filed = await gate.file(`,
  `  {`,
  `    operation: {`,
  `      kind: "update",`,
  `      entityType: "Invoice",`,
  `      entityId: "invoice-1",`,
  `      fields: ["status"],`,
  `    },`,
  `    toolName: "update_invoice",`,
  `    fields: [`,
  `      {`,
  `        name: "status",`,
  `        kind: "text",`,
  `        value: "Active",`,
  `        provenance: chainOf(`,
  `          mintConversation({`,
  `            confidence: 0.9,`,
  `            at: AT,`,
  `            note: "Stated: status",`,
  `            conversationTurn: 1,`,
  `          }),`,
  `        ),`,
  `        isMandatory: true,`,
  `      },`,
  `    ],`,
  `    args: null,`,
  `    schema,`,
  `    operationLabel: "Reprice",`,
  `  },`,
  `  ctx,`,
  `);`,
  ``,
  `// (a) The review queue's card, built from the stored row long after the filing.`,
  `const stored = await gate.get(filed.entry.entryId, ctx);`,
  `const card = cardFor(stored, { now: AT, schema, operationLabel: "Reprice" });`,
  `assert.equal(card.docketId, stored.entryId);`,
  `assert.equal(card.requiresConfirmation, true);`,
  `assert.equal(card.hostOperation, "Reprice");`,
  ``,
  `// The same row read past its deadline asks for no decision (DK-1, DK-5).`,
  `const late = new Date(Date.parse(stored.expiresAt) + 1).toISOString();`,
  `assert.equal(cardFor(stored, { now: late }).requiresConfirmation, false);`,
  ``,
  `// (c) The report of a row nobody has decided is a caller error, not a report.`,
  `let pendingKind = null;`,
  `try {`,
  `  decisionResultOf(stored);`,
  `} catch (error) {`,
  `  assert.equal(isCallerError(error), true);`,
  `  assert.equal(error instanceof RangeError, true);`,
  `  pendingKind = error.kind;`,
  `}`,
  `assert.equal(pendingKind, "entry-not-decided");`,
  ``,
  `// (b) The report of the decided row.`,
  `const approved = await gate.decide(stored.entryId, { kind: "approve" }, ctx);`,
  `const result = decisionResultOf(approved);`,
  `assert.equal(result.docketId, approved.entryId);`,
  `assert.equal(result.outcome, "approved");`,
  `assert.notEqual(result.attestation, null);`,
  ``,
  `// (d) A malformed binding from an interceptor is a caller error the gate refuses`,
  `// before anything is filed (PV-2, SR-3, PV-4) — a gate over the same store, wired`,
  `// with one interceptor that returns an external-ref carrying an undeclared key.`,
  `const gated = createGate({`,
  `  store,`,
  `  sessions: new InMemorySessionStore(store),`,
  `  inference: { infer: async () => ({ fields: {} }) },`,
  `  projection: { previousValues: async () => null },`,
  `  authorization: { mayDecide: async () => true },`,
  `  policies: [],`,
  `  interceptors: [`,
  `    {`,
  `      name: "crm",`,
  `      resolve: () => ({`,
  `        status: {`,
  `          value: "Active",`,
  `          source: "External",`,
  `          binding: {`,
  `            kind: "external-ref",`,
  `            ref: { system: "crm", recordId: "42", extra: true },`,
  `          },`,
  `          confidence: 0.95,`,
  `          evidence: "the crm system says Active",`,
  `        },`,
  `      }),`,
  `    },`,
  `  ],`,
  `  clock,`,
  `  defaultTtlMs: 30 * 60 * 1000,`,
  `});`,
  ``,
  `const gatedTool = {`,
  `  name: "update_invoice_gated",`,
  `  description: "Update an invoice",`,
  `  inputSchema: schema,`,
  `  writeCapable: true,`,
  `  execute: () => {`,
  `    throw new Error("the gate called a write tool's own execute");`,
  `  },`,
  `  operation: (args) => ({`,
  `    kind: "update",`,
  `    entityType: "Invoice",`,
  `    entityId: "invoice-1",`,
  `    fields: Object.keys(args),`,
  `  }),`,
  `};`,
  ``,
  `let bindingInvalidKind = null;`,
  `try {`,
  `  await gated.wrap(gatedTool, ctx).execute({ status: "Active" });`,
  `} catch (error) {`,
  `  assert.equal(isCallerError(error), true);`,
  `  bindingInvalidKind = error.kind;`,
  `}`,
  `assert.equal(bindingInvalidKind, "binding-invalid");`,
  ``,
  `console.log("ok");`,
  ``,
].join("\n");

/**
 * The consumer a host compiles: the three exports under their published types, the
 * option and result types named explicitly, and a `kind` narrowed in a `catch`.
 */
const CONSUMER = [
  `import { cardFor, decisionResultOf, isCallerError } from "@affiant/core";`,
  `import type {`,
  `  CallerErrorKind,`,
  `  CardForOptions,`,
  `  DecisionResult,`,
  `  DocketEntry,`,
  `  EvidenceCardRequest,`,
  `} from "@affiant/core";`,
  ``,
  `declare const row: DocketEntry;`,
  `declare const superseded: DocketEntry;`,
  ``,
  `export function queueItem(now: string): EvidenceCardRequest {`,
  `  const options: CardForOptions = { now, operationLabel: "Reprice", superseded };`,
  `  return cardFor(row, options);`,
  `}`,
  ``,
  `export function report(): DecisionResult | CallerErrorKind {`,
  `  try {`,
  `    return decisionResultOf(row);`,
  `  } catch (error) {`,
  `    if (isCallerError(error)) return error.kind;`,
  `    throw error;`,
  `  }`,
  `}`,
  ``,
].join("\n");

describe.skipIf(!built || !online)("a consumer of the packed tarball", () => {
  it(
    "runs the read-side producers and compiles against the published types",
    { timeout: 300_000 },
    () => {
      const packs = join(scratch, "packs");
      const project = join(scratch, "project");
      for (const directory of [packs, project]) {
        mkdirSync(directory, { recursive: true });
      }

      const packed = run("pnpm", ["pack", "--pack-destination", packs], packageRoot);
      expect(packed, "pnpm pack failed for the core").not.toBeNull();
      const coreTarball = tarballIn(packs);
      expect(coreTarball).not.toBeNull();

      writeFileSync(
        join(project, "package.json"),
        `${JSON.stringify(
          { name: "affiant-packed-consumer", version: "0.0.0", private: true, type: "module" },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(project, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              strict: true,
              target: "ES2023",
              lib: ["ES2023", "DOM"],
              module: "NodeNext",
              moduleResolution: "NodeNext",
              noEmit: true,
              // With `skipLibCheck` on, a published `.d.ts` that names a type only
              // this repository has — `vitest`'s `Mock`, say — compiles for a
              // consumer who does not have it, and the guard is blind to exactly the
              // defect it exists to catch. So the check is on, and the scratch
              // project is given what a real consumer has.
              skipLibCheck: false,
              skipDefaultLibCheck: true,
              types: ["node"],
            },
            include: ["consumer.ts"],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(join(project, "consumer.ts"), CONSUMER);
      writeFileSync(join(project, "run.mjs"), RUNNER);

      const installed = run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          "--loglevel",
          "error",
          coreTarball as string,
          // What a host compiling under a full library check already has.
          "@types/node@22",
        ],
        project,
      );
      if (installed === null) {
        // The registry answered `npm ping` a moment ago, so this is not a network
        // that is down — it is a manifest that cannot be resolved, which is exactly
        // what a consumer would hit.
        expect.soft(registryReachable(), "the npm registry stopped answering mid-test").toBe(true);
        throw new Error(
          `installing the packed tarball into a scratch project failed against a ` +
            `registry that answered \`npm ping\`: the published manifest cannot be ` +
            `resolved by a consumer.`,
        );
      }

      let ran = "";
      let runFailed = false;
      try {
        ran = execFileSync("node", ["run.mjs"], {
          cwd: project,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        runFailed = true;
        ran = String(
          (error as { stderr?: unknown }).stderr ?? (error as { stdout?: unknown }).stdout ?? error,
        );
      }
      expect(ran.trim(), "the host script failed against the packed package").toBe("ok");
      expect(runFailed).toBe(false);

      const tsc = join(workspaceRoot, "node_modules", ".bin", "tsc");
      let output = "";
      let compileFailed = false;
      try {
        output = execFileSync(tsc, ["-p", "tsconfig.json"], {
          cwd: project,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        compileFailed = true;
        output = String((error as { stdout?: unknown }).stdout ?? error);
      }

      expect(output, "tsc --strict reported errors against the packed types").toBe("");
      expect(compileFailed).toBe(false);
    },
  );
});
