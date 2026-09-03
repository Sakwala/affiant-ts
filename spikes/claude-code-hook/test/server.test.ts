/**
 * The decision endpoint, probed the way a hostile page would probe it.
 *
 * Every request here goes through `node:http` rather than `fetch`, because the
 * headers that matter — `Host` and `Origin` — are forbidden header names a
 * `fetch` caller cannot set, and those are exactly the two a rebound or
 * cross-origin caller does set.
 */
import { request as httpRequest } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DocketEntry } from "../src/docket.js";
import { spawnBin } from "./harness.js";
import type { RunningBin } from "./harness.js";

let home: string;
let workspace: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "affiant-server-home-"));
  workspace = mkdtempSync(join(tmpdir(), "affiant-server-work-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** One HTTP request with exactly the headers asked for, and nothing added. */
function raw(options: {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<RawResponse> {
  return new Promise((done, fail) => {
    const call = httpRequest(
      {
        host: "127.0.0.1",
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          done({ status: response.statusCode ?? 0, headers: response.headers, body });
        });
      },
    );
    call.on("error", fail);
    if (options.body !== undefined) call.write(options.body);
    call.end();
  });
}

/** The review server of a running hook: its port, its secret prefix, its entry. */
interface Review {
  run: RunningBin;
  port: number;
  prefix: string;
  docketId: string;
  origin: string;
}

async function review(payload?: unknown): Promise<Review> {
  const run = spawnBin(
    "hook.js",
    payload ?? {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_use_id: "toolu_server",
      cwd: workspace,
      tool_input: { file_path: join(workspace, "target.ts"), content: "export const a = 1;\n" },
    },
    {
      AFFIANT_HOOK_HOME: home,
      AFFIANT_HOOK_PORT: "0",
      AFFIANT_HOOK_OPEN: "never",
      AFFIANT_HOOK_TIMEOUT_MS: "20000",
    },
  );
  const url = new URL(await run.url());
  const docketId = await run.docketId();
  return {
    run,
    port: Number(url.port),
    prefix: url.pathname.replace(/\/$/, ""),
    docketId,
    origin: `127.0.0.1:${url.port}`,
  };
}

function decision(
  site: Review,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<RawResponse> {
  const text = JSON.stringify(body);
  return raw({
    port: site.port,
    path: `${site.prefix}/decision/${site.docketId}`,
    method: "POST",
    headers: {
      host: site.origin,
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(text)),
      ...headers,
    },
    body: text,
  });
}

describe("the decision endpoint", () => {
  it("refuses a request whose Host is not the address it bound", async () => {
    const site = await review();

    // A page that re-resolves its own hostname to 127.0.0.1 reaches this socket,
    // but it reaches it carrying its own name in Host. That is the tell.
    const response = await decision(site, { decision: "approve" }, { host: "attacker.test" });
    expect(response.status).toBe(421);

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("refuses a request carrying somebody else's Origin", async () => {
    const site = await review();

    const response = await decision(site, { decision: "approve" }, { origin: "http://evil.test" });
    expect(response.status).toBe(403);
    // And no CORS header went back with it, so nothing on that page can read this.
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("refuses a decision that is not sent as JSON", async () => {
    const site = await review();

    // `text/plain` is what makes a cross-origin POST a *simple* request, which
    // needs no preflight. Requiring JSON is what puts the preflight back.
    const response = await decision(
      site,
      { decision: "approve" },
      { "content-type": "text/plain;charset=UTF-8" },
    );
    expect(response.status).toBe(415);

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("sends no CORS headers on any route, so no preflight can ever succeed", async () => {
    const site = await review();

    const page = await raw({
      port: site.port,
      path: `${site.prefix}/`,
      headers: { host: site.origin },
    });
    expect(page.status).toBe(200);
    expect(page.headers["access-control-allow-origin"]).toBeUndefined();
    expect(page.headers["access-control-allow-methods"]).toBeUndefined();

    const preflight = await raw({
      port: site.port,
      path: `${site.prefix}/decision/${site.docketId}`,
      method: "OPTIONS",
      headers: { host: site.origin, origin: `http://${site.origin}` },
    });
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("serves nothing at all outside the run's secret prefix", async () => {
    const site = await review();

    for (const path of [
      "/",
      "/pending",
      `/decision/${site.docketId}`,
      `/entries/${site.docketId}`,
      `/${"0".repeat(32)}/entries/${site.docketId}`,
    ]) {
      const response = await raw({ port: site.port, path, headers: { host: site.origin } });
      expect([404, 405]).toContain(response.status);
    }

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("serves only this run's entry, not every row in the shared docket", async () => {
    const site = await review();

    const mine = await raw({
      port: site.port,
      path: `${site.prefix}/entries/${site.docketId}`,
      headers: { host: site.origin },
    });
    expect(mine.status).toBe(200);

    const other = await raw({
      port: site.port,
      path: `${site.prefix}/entries/00000000-0000-0000-0000-000000000000`,
      headers: { host: site.origin },
    });
    expect(other.status).toBe(404);

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("answers 404, not 409, for a docket id it never filed", async () => {
    const site = await review();

    const text = JSON.stringify({ decision: "approve" });
    const response = await raw({
      port: site.port,
      path: `${site.prefix}/decision/00000000-0000-0000-0000-000000000000`,
      method: "POST",
      headers: {
        host: site.origin,
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(text)),
      },
      body: text,
    });

    // "This entry is already unknown" was a sentence that did not parse, and 409
    // told a client it had lost a race it was never in.
    expect(response.status).toBe(404);

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("approves on the happy path and the hook prints allow", async () => {
    const site = await review();

    const response = await decision(site, { decision: "approve", amendments: {} });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: "approved", amended: false });

    const result = await site.run.done;
    expect(result.code).toBe(0);
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("refuses to let the card change the file the write lands on", async () => {
    const site = await review();

    const response = await decision(site, {
      decision: "amend",
      amendments: { path: "/tmp/redirected.txt" },
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error).toBe("the target file cannot be amended on the card");

    // The compare-and-set was not spent: the reviewer can still decide.
    const entry = JSON.parse(
      (
        await raw({
          port: site.port,
          path: `${site.prefix}/entries/${site.docketId}`,
          headers: { host: site.origin },
        })
      ).body,
    ) as DocketEntry;
    expect(entry.status).toBe("pending");

    expect((await decision(site, { decision: "reject", reason: "wrong file" })).status).toBe(200);
    const result = await site.run.done;
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("leaves the entry open when an amendment names a field that is not a parameter", async () => {
    const target = join(workspace, "preview-amend.ts");
    writeFileSync(target, "const port = 3000;\n", "utf8");
    const site = await review({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: workspace,
      tool_input: {
        file_path: target,
        old_string: "const port = 3000;",
        new_string: "const port = 8080;",
      },
    });

    // `preview` is a rendering of the change, not a parameter of it. The old code
    // committed the decision first and denied afterwards, spending the entry's one
    // decision on something that could never take effect.
    const refused = await decision(site, {
      decision: "amend",
      amendments: { preview: "@@ nonsense @@" },
    });
    expect(refused.status).toBe(400);
    expect(JSON.parse(refused.body)).toMatchObject({
      unapplicable: ["preview"],
      amendable: ["edit-1"],
    });

    // Still open, so the reviewer corrects it and their amendment lands.
    const accepted = await decision(site, {
      decision: "amend",
      amendments: { "edit-1": "const port = 9090;" },
    });
    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toMatchObject({ status: "approved", amended: true });

    const result = await site.run.done;
    expect(result.json?.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(result.json?.hookSpecificOutput.updatedInput).toEqual({
      file_path: target,
      old_string: "const port = 3000;",
      new_string: "const port = 9090;",
    });
  });

  it("refuses an amendment value that is not a string", async () => {
    const site = await review();

    const response = await decision(site, { decision: "amend", amendments: { content: 12345 } });
    expect(response.status).toBe(400);

    site.run.child.kill("SIGKILL");
    await site.run.done;
  });

  it("decides an entry once, and says which decision won", async () => {
    const site = await review();

    expect((await decision(site, { decision: "approve" })).status).toBe(200);
    const second = await decision(site, { decision: "reject" });
    expect(second.status).toBe(409);
    expect(JSON.parse(second.body)).toMatchObject({ status: "approved" });

    await site.run.done;
  });

  it("records who decided on the row", async () => {
    const site = await review();
    await decision(site, { decision: "approve" }, { "user-agent": "a-real-browser/1.0" });
    await site.run.done;

    const file = JSON.parse(readFileSync(join(home, "docket.json"), "utf8")) as {
      entries: Record<string, DocketEntry>;
    };
    expect(file.entries[site.docketId]?.decidedBy).toContain("a-real-browser/1.0");
    expect(file.entries[site.docketId]?.toolUseId).toBe("toolu_server");
  });
});
