/**
 * The loopback server that shows the card.
 *
 * It exists for the life of one decision and binds to 127.0.0.1 only. There is no
 * account, no token and no remote: the page is served to the person sitting at the
 * machine the agent is running on, and nothing on it leaves that machine.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, normalize, resolve, sep } from "node:path";

import type { Docket, DocketEntry, ReviewerDecision } from "./docket.js";
import { ELEMENT_MOUNT, renderPage } from "./page.js";

/** The default port, overridable with `AFFIANT_HOOK_PORT`. `0` asks the OS for a free one. */
export const DEFAULT_PORT = 47331;

/** The largest decision body this will read. A decision is a few hundred bytes. */
const MAX_BODY_BYTES = 1_000_000;

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/**
 * Locates the built `@affiant/evidence-card` module tree.
 *
 * The element is a workspace sibling, so this resolves its `./register` export and
 * serves the directory it sits in — the module imports `./element.js` and
 * `./styles.js` beside it, and a browser will ask for those too.
 */
export function elementDistDir(): string {
  const require = createRequire(import.meta.url);
  try {
    return dirname(require.resolve("@affiant/evidence-card/register"));
  } catch (cause) {
    throw new Error(
      "The Evidence Card element is not built. Run `pnpm build` at the repository root, " +
        `then try again. (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  response.end(text);
}

function sendText(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
): void {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("decision body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isReviewerDecision(value: unknown): value is ReviewerDecision {
  return value === "approve" || value === "reject" || value === "amend";
}

/** What a running review server exposes to the hook that started it. */
export interface ReviewServer {
  /** The page to open, e.g. `http://127.0.0.1:47331/`. */
  url: string;
  /** The port actually bound, which is not the requested one when it was taken. */
  port: number;
  close(): Promise<void>;
}

/** Serves the built element tree, refusing anything that escapes it. */
function serveElement(root: string, urlPath: string, response: ServerResponse): void {
  const relative = normalize(urlPath.slice(ELEMENT_MOUNT.length)).replace(/^[\\/]+/, "");
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    sendText(response, 403, "text/plain; charset=utf-8", "forbidden");
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    sendText(response, 404, "text/plain; charset=utf-8", "not found");
    return;
  }
  const extension = target.slice(target.lastIndexOf("."));
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(response);
}

/**
 * Starts the review server for one docket entry.
 *
 * The requested port is tried first so the URL is predictable; if something else
 * already holds it the OS picks a free one and the caller prints whichever was
 * bound. A review that could not be shown is worse than a review on an odd port.
 */
export async function startServer(options: {
  docket: Docket;
  docketId: string;
  port: number;
  /** Called once a decision lands, so the hook can stop polling immediately. */
  onDecision?: (entry: DocketEntry) => void;
}): Promise<ReviewServer> {
  const elementRoot = elementDistDir();

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    try {
      if (request.method === "GET" && (path === "/" || path === "/index.html")) {
        sendText(response, 200, "text/html; charset=utf-8", renderPage(options.docketId));
        return;
      }

      if (request.method === "GET" && path.startsWith(`${ELEMENT_MOUNT}/`)) {
        serveElement(elementRoot, path, response);
        return;
      }

      if (request.method === "GET" && path === "/pending") {
        const entry = options.docket.read(options.docketId);
        if (entry === null) {
          sendJson(response, 404, { error: "no such docket entry" });
          return;
        }
        sendJson(response, 200, entry);
        return;
      }

      if (request.method === "GET" && path.startsWith("/entries/")) {
        const id = decodeURIComponent(path.slice("/entries/".length));
        const entry = options.docket.read(id);
        if (entry === null) {
          sendJson(response, 404, { error: "no such docket entry" });
          return;
        }
        sendJson(response, 200, entry);
        return;
      }

      if (request.method === "POST" && path.startsWith("/decision/")) {
        const id = decodeURIComponent(path.slice("/decision/".length));
        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(request));
        } catch (cause) {
          sendJson(response, 400, {
            error: cause instanceof Error ? cause.message : "malformed JSON",
          });
          return;
        }
        if (typeof payload !== "object" || payload === null) {
          sendJson(response, 400, { error: "expected a JSON object" });
          return;
        }
        const body = payload as {
          decision?: unknown;
          amendments?: unknown;
          reason?: unknown;
        };
        if (!isReviewerDecision(body.decision)) {
          sendJson(response, 400, { error: "decision must be approve, reject or amend" });
          return;
        }
        const amendments =
          typeof body.amendments === "object" && body.amendments !== null
            ? (body.amendments as Record<string, unknown>)
            : {};
        const reason = typeof body.reason === "string" && body.reason !== "" ? body.reason : null;

        const outcome = options.docket.decide(id, body.decision, amendments, reason);
        if (!outcome.ok) {
          sendJson(response, 409, {
            error: `this entry is already ${outcome.status}; a docket entry is decided once`,
            status: outcome.status,
          });
          return;
        }
        sendJson(response, 200, { status: outcome.entry.status, docketId: id });
        options.onDecision?.(outcome.entry);
        return;
      }

      sendJson(response, 404, { error: "not found" });
    } catch (cause) {
      sendJson(response, 500, { error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  const port = await new Promise<number>((resolvePort, rejectPort) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      if (error.code === "EADDRINUSE" && options.port !== 0) {
        server.removeListener("error", onError);
        server.once("error", rejectPort);
        server.listen(0, "127.0.0.1", () => {
          resolvePort((server.address() as { port: number }).port);
        });
        return;
      }
      rejectPort(error);
    };
    server.once("error", onError);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", onError);
      resolvePort((server.address() as { port: number }).port);
    });
  });

  return {
    url: `http://127.0.0.1:${String(port)}/`,
    port,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => {
          done();
        });
      }),
  };
}
