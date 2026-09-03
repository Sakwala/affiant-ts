/**
 * The loopback server that shows the card.
 *
 * It exists for the life of one decision and binds to 127.0.0.1 only. There is no
 * account and no remote: the page is served to the person sitting at the machine
 * the agent is running on, and nothing on it leaves that machine.
 *
 * "Binds to loopback" is not on its own enough, though, and the earlier version of
 * this file leaned on it. A web page open in the same browser can reach a loopback
 * port: a cross-origin POST with `Content-Type: text/plain` is a *simple* request,
 * so it is sent without a preflight, and a page that re-resolves its own hostname
 * to 127.0.0.1 (DNS rebinding) becomes same-origin with a fixed, advertised port
 * and can read the docket id before it posts. Either way the decision the hook
 * reports is one no person made, which forges the single guarantee this spike
 * exists to provide. So, four things together:
 *
 * - **A random port.** `AFFIANT_HOOK_PORT` can pin one, but nothing is advertised
 *   by default, so there is no known address to aim at.
 * - **A per-run secret path prefix.** Every route lives under `/<32 hex>/`, minted
 *   fresh per hook run and printed only on stderr. A URL nobody can guess is a URL
 *   nobody can rebind onto usefully.
 * - **`Host` and `Origin` checks.** A request whose `Host` is not the bound
 *   `127.0.0.1:<port>` is 421; a request carrying any `Origin` other than this
 *   server's own is 403. Rebinding changes the `Host` a browser sends, so it is
 *   caught even if the prefix leaked.
 * - **`Content-Type: application/json` on the decision.** That takes the endpoint
 *   out of the simple-request set, so a cross-origin POST needs a preflight, and
 *   no CORS headers are ever sent, so no preflight can ever succeed.
 */
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, normalize, resolve, sep } from "node:path";

import { amendableFields, applyAmendments, PATH_FIELD, PATH_NOT_AMENDABLE } from "./affidavit.js";
import type { Docket, DocketEntry, ReviewerDecision } from "./docket.js";
import { ELEMENT_MOUNT, renderPage } from "./page.js";
import type { ReviewedTool, ReviewedToolInput } from "./protocol.js";

/**
 * The port asked for by default: `0`, meaning "any free one the OS has".
 *
 * A fixed, documented port is an address an attacker's page already knows. Set
 * `AFFIANT_HOOK_PORT` to pin one if you need a stable URL for something.
 */
export const DEFAULT_PORT = 0;

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
  /** The page to open, e.g. `http://127.0.0.1:45649/1f0c…9b/`. */
  url: string;
  /** The port actually bound, which is a free one the OS picked unless a port was pinned. */
  port: number;
  /** The per-run path prefix every route lives under, without slashes. */
  secret: string;
  close(): Promise<void>;
}

/** Serves the built element tree, refusing anything that escapes it. */
function serveElement(root: string, relativePath: string, response: ServerResponse): void {
  const relative = normalize(relativePath).replace(/^[\\/]+/, "");
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
 * The port is bound first so that the `Host` a request must carry is known before
 * a single request is handled.
 */
export async function startServer(options: {
  docket: Docket;
  docketId: string;
  /** The tool being reviewed, so an amendment can be checked before it is committed. */
  tool: ReviewedTool;
  /** The call being reviewed, for the same reason. */
  toolInput: ReviewedToolInput;
  port: number;
  /** Called once a decision lands, so the hook can stop polling immediately. */
  onDecision?: (entry: DocketEntry) => void;
}): Promise<ReviewServer> {
  const elementRoot = elementDistDir();
  const secret = randomBytes(16).toString("hex");
  const amendable = amendableFields(options.toolInput);

  let boundPort: number | null = null;
  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (boundPort === null) {
        sendText(response, 503, "text/plain; charset=utf-8", "not listening yet");
        return;
      }
      const origin = `http://127.0.0.1:${String(boundPort)}`;

      // A rebound name reaches this socket carrying its own hostname in `Host`.
      if (request.headers.host !== `127.0.0.1:${String(boundPort)}`) {
        sendText(response, 421, "text/plain; charset=utf-8", "misdirected request");
        return;
      }
      // A same-origin page sends either no `Origin` or this one. Anything else is
      // a cross-origin caller, and no CORS header is ever sent to help it.
      const sent = request.headers.origin;
      if (sent !== undefined && sent !== origin) {
        sendText(response, 403, "text/plain; charset=utf-8", "forbidden");
        return;
      }

      const url = new URL(request.url ?? "/", origin);
      const path = url.pathname;
      const prefix = `/${secret}`;
      if (path !== prefix && !path.startsWith(`${prefix}/`)) {
        sendJson(response, 404, { error: "not found" });
        return;
      }
      const route = path.slice(prefix.length) === "" ? "/" : path.slice(prefix.length);

      if (request.method === "GET" && (route === "/" || route === "/index.html")) {
        sendText(
          response,
          200,
          "text/html; charset=utf-8",
          renderPage(options.docketId, prefix, amendable),
        );
        return;
      }

      if (request.method === "GET" && route.startsWith(`${ELEMENT_MOUNT}/`)) {
        serveElement(elementRoot, route.slice(ELEMENT_MOUNT.length), response);
        return;
      }

      // Scoped to this run's entry: a caller who reaches the port still cannot
      // read another session's pending file contents out of the shared docket.
      if (request.method === "GET" && route.startsWith("/entries/")) {
        const id = decodeURIComponent(route.slice("/entries/".length));
        const entry = id === options.docketId ? options.docket.read(id) : null;
        if (entry === null) {
          sendJson(response, 404, { error: "no such docket entry" });
          return;
        }
        sendJson(response, 200, entry);
        return;
      }

      if (request.method === "POST" && route.startsWith("/decision/")) {
        await decide(request, response, decodeURIComponent(route.slice("/decision/".length)));
        return;
      }

      sendJson(response, 404, { error: "not found" });
    } catch (cause) {
      sendJson(response, 500, { error: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  async function decide(
    request: IncomingMessage,
    response: ServerResponse,
    id: string,
  ): Promise<void> {
    // A cross-origin POST that is not JSON is a *simple* request and needs no
    // preflight, so requiring JSON here is what makes the preflight mandatory.
    const contentType = request.headers["content-type"] ?? "";
    if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      sendJson(response, 415, { error: "a decision must be sent as application/json" });
      return;
    }

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
    const body = payload as { decision?: unknown; amendments?: unknown; reason?: unknown };
    if (!isReviewerDecision(body.decision)) {
      sendJson(response, 400, { error: "decision must be approve, reject or amend" });
      return;
    }
    const amendments =
      typeof body.amendments === "object" && body.amendments !== null
        ? (body.amendments as Record<string, unknown>)
        : {};
    const reason = typeof body.reason === "string" && body.reason !== "" ? body.reason : null;

    // Applicability is checked *before* the compare-and-set, so an amendment that
    // cannot take effect leaves the entry pending and the reviewer can correct it,
    // instead of spending the one decision the entry has on a dead end.
    if (Object.keys(amendments).length > 0) {
      if (PATH_FIELD in amendments) {
        sendJson(response, 400, { error: PATH_NOT_AMENDABLE, amendable });
        return;
      }
      const applied = applyAmendments(options.tool, options.toolInput, amendments);
      if (!applied.ok) {
        sendJson(response, 400, {
          error:
            `${applied.unapplicable.join(", ")} cannot be amended on this ${options.tool} call; ` +
            `this entry is still open`,
          unapplicable: applied.unapplicable,
          amendable,
        });
        return;
      }
    }

    const decidedBy = `${request.socket.remoteAddress ?? "unknown"} ${
      request.headers["user-agent"] ?? "no user agent"
    }`;
    const outcome = options.docket.decide(id, body.decision, amendments, reason, decidedBy);
    if (!outcome.ok) {
      if (outcome.status === "unknown") {
        sendJson(response, 404, { error: "no such docket entry" });
        return;
      }
      sendJson(response, 409, {
        error: `this entry is already ${outcome.status}; a docket entry is decided once`,
        status: outcome.status,
      });
      return;
    }
    sendJson(response, 200, {
      status: outcome.entry.status,
      docketId: id,
      amended: outcome.entry.amendments !== null,
    });
    options.onDecision?.(outcome.entry);
  }

  // A pinned port that is already taken falls back to a free one, which is then
  // printed: a review that could not be shown is worse than a review on an odd
  // port, and the URL on stderr is the only address anyone needs.
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
  boundPort = port;

  return {
    url: `http://127.0.0.1:${String(port)}/${secret}/`,
    port,
    secret,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => {
          done();
        });
      }),
  };
}
