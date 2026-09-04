/**
 * Fetch-with-retry and a narrow, dependency-free tar reader, both written for one
 * caller: `protocol-pin.test.ts` fetching a `codeload.github.com` tag or commit
 * archive of `Sakwala/affiant-protocol` and comparing it to the vendored copy.
 *
 * Why an archive instead of one request per vendored file: `codeload.github.com`
 * serves the whole ref as a single gzipped tarball, so one request (retried on a
 * transient failure) replaces 176 sequential ones — each of which was a chance for
 * `ECONNRESET` to fail the run. Node's `node:zlib` gunzips it; nothing else needed
 * decompressing is a runtime dependency. There is no tar reader already in this
 * workspace, and `protocol/` is a small tree of short text files, so this reader
 * targets exactly what `git archive` (what codeload runs) produces for that case —
 * and refuses, rather than guesses, at anything it does not recognize:
 *
 * - PAX format, one global extended header (`typeflag 'g'`) carrying the commit
 *   the ref resolved to — read and discarded; nothing here needs it.
 * - A per-entry PAX extended header (`typeflag 'x'`) only when a path does not fit
 *   the ustar `prefix`+`name` fields; this repository's current paths all do, but
 *   a `path` record is still honored if one appears.
 * - Octal (not base-256) size fields — true for every file this reader has seen
 *   from this repository, and a mismatch fails loudly rather than misreading.
 * - Exactly one archive entry per final (top-level-directory-stripped) path. Two
 *   entries landing on the same path — a literal duplicate, or two different
 *   top-level directories that each contain, say, `schemas/x.json` — throw
 *   rather than let the second one silently win.
 * - The archive's own end-of-archive marker: two consecutive zero-filled 512-byte
 *   blocks. A response cut short by a network failure has no such marker, and
 *   reading everything before the cut as a complete listing would silently pass
 *   a check whose whole job is catching a missing file.
 *
 * It does not handle GNU long-name headers (`typeflag 'L'`/`'K'`), sparse files,
 * or symlinks — `git archive` writes none of those for a schema-and-fixture
 * rulebook — and throws on any entry type it does not recognize, rather than
 * silently misreading one (a GNU long name's data, for instance) as the entry
 * that follows it.
 */
import { gunzipSync } from "node:zlib";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxRetryAfterMs?: number;
}

/**
 * Every message in an `Error`'s `.cause` chain, joined with `": "`. Node's `fetch`
 * throws a bare `TypeError: fetch failed` on a network failure — the actual detail
 * (`ECONNRESET`, `ENOTFOUND`, a timeout) is one level down in `.cause`, which
 * `.message` alone never shows; this is what lets the merge-blocking node job's
 * failure message name the real reason instead of just "fetch failed". `maxDepth`
 * guards against a cyclical cause chain, which should never happen but must not
 * hang this if it somehow does.
 */
function describeError(error: unknown, maxDepth = 5): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [error.message];
  let cause: unknown = error.cause;
  for (let depth = 0; depth < maxDepth && cause !== undefined && cause !== null; depth++) {
    if (!(cause instanceof Error)) {
      parts.push(String(cause));
      break;
    }
    parts.push(cause.message);
    cause = cause.cause;
  }
  return parts.join(": ");
}

/**
 * The `Retry-After` header on a 429 or 503 response (seconds, or an HTTP date),
 * clamped to `[0, maxMs]`. `null` if the header is absent or parses as neither.
 */
function retryAfterMs(response: Response, maxMs: number): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, maxMs));

  const when = Date.parse(header);
  if (Number.isNaN(when)) return null;
  return Math.max(0, Math.min(when - Date.now(), maxMs));
}

/**
 * `fetch`, retried on a transient failure: a thrown network error (a DNS failure,
 * a reset connection, a timeout) or a 429/5xx response. A 404, and any other 4xx
 * besides 429, is not retried — those mean the request itself will not succeed no
 * matter how many times it is repeated, so retrying only delays reporting the real
 * problem. A 429 or 503 that names a `Retry-After` waits that long instead of the
 * usual exponential backoff, capped at `maxRetryAfterMs` so a server cannot stall
 * the run past that.
 *
 * A response this function is not returning is never left unread: `fetch` (Node's
 * undici, and Bun's own implementation) does not consider a request's connection
 * free for reuse until its body is drained, and a retry loop that left several
 * unread would hold that many connections or buffers open for no reason.
 *
 * Exhausting every attempt throws, with every message in the last failure's cause
 * chain in the thrown message; it never returns a "this could not be checked"
 * result for the caller to swallow.
 */
export async function fetchWithRetry(
  url: string,
  { attempts = 3, baseDelayMs = 500, maxRetryAfterMs = 30_000 }: RetryOptions = {},
): Promise<Response> {
  let lastFailure = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url);
    } catch (error) {
      lastFailure = describeError(error);
    }

    let delayMs: number | null = null;

    if (response !== undefined) {
      if (response.ok) return response;

      lastFailure = `${String(response.status)} ${response.statusText}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (response.status === 429 || response.status === 503) {
        delayMs = retryAfterMs(response, maxRetryAfterMs);
      }
      if (response.body !== null) {
        await response.body.cancel().catch(() => undefined);
      }
      if (!retryable) {
        throw new Error(`${url} returned ${lastFailure}`);
      }
    }

    if (attempt === attempts) break;
    await new Promise((resolve) =>
      setTimeout(resolve, delayMs ?? baseDelayMs * 2 ** (attempt - 1)),
    );
  }

  throw new Error(`could not fetch ${url} after ${String(attempts)} attempt(s): ${lastFailure}`);
}

/** Regular-file typeflags (the ustar spec allows the NUL byte or an empty field
 *  alongside `'0'`) and the directory typeflag — the only entry kinds this reader
 *  accepts as themselves rather than as a PAX header or an error. */
const KNOWN_ENTRY_TYPES = new Set(["0", "\0", "", "5"]);

/**
 * Reads a `.tar.gz` archive's regular files into a map of path -> content,
 * stripping the single top-level directory `git archive` wraps every entry in
 * (e.g. `affiant-protocol-0.1.1/conformance/…` becomes `conformance/…`). Only
 * that stripped path is returned; directory entries are not. See the module doc
 * comment for what this narrow reader does and does not handle, and throws on.
 */
export function extractTarGz(gzipBytes: Uint8Array): Map<string, Buffer> {
  const tar = gunzipSync(gzipBytes);
  const files = new Map<string, Buffer>();
  let offset = 0;
  let pendingPath: string | null = null;
  let sawEndMarker = false;

  const readField = (start: number, length: number): string => {
    const slice = tar.subarray(start, start + length);
    const nul = slice.indexOf(0);
    return (nul === -1 ? slice : slice.subarray(0, nul)).toString("utf8");
  };
  const readOctal = (start: number, length: number): number => {
    const raw = readField(start, length).trim();
    return raw === "" ? 0 : Number.parseInt(raw, 8);
  };
  const isZeroBlock = (start: number): boolean => {
    if (start + 512 > tar.length) return false;
    return tar.subarray(start, start + 512).every((byte) => byte === 0);
  };
  /** The `path` record out of a PAX extended header's `"<len> key=value\n"` list. */
  const findPaxPath = (text: string): string | null => {
    let pos = 0;
    while (pos < text.length) {
      const spaceIndex = text.indexOf(" ", pos);
      if (spaceIndex === -1) return null;
      const recordLength = Number.parseInt(text.slice(pos, spaceIndex), 10);
      if (!Number.isFinite(recordLength) || recordLength <= 0) return null;
      const record = text.slice(pos, pos + recordLength);
      const equalsIndex = record.indexOf("=");
      if (equalsIndex !== -1 && record.slice(spaceIndex - pos + 1, equalsIndex) === "path") {
        return record.slice(equalsIndex + 1, recordLength - 1); // drop the trailing "\n"
      }
      pos += recordLength;
    }
    return null;
  };

  while (offset + 512 <= tar.length) {
    const headerStart = offset;

    if (isZeroBlock(headerStart)) {
      // The spec's end-of-archive marker is two consecutive zero blocks, not one —
      // a lone zero block is exactly what a response truncated right after the
      // last real entry's data looks like, and that must fail, not pass as done.
      if (!isZeroBlock(headerStart + 512)) {
        throw new Error("malformed or truncated tar archive: incomplete end-of-archive marker");
      }
      sawEndMarker = true;
      break;
    }

    const header = tar.subarray(headerStart, headerStart + 512);
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    const size = readOctal(headerStart + 124, 12);
    const dataStart = headerStart + 512;
    const dataEnd = dataStart + size;
    if (!Number.isInteger(size) || size < 0 || dataEnd > tar.length) {
      throw new Error(`malformed or truncated tar entry at byte offset ${String(headerStart)}`);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeFlag === "x") {
      pendingPath = findPaxPath(tar.subarray(dataStart, dataEnd).toString("utf8"));
      continue;
    }
    if (typeFlag === "g") {
      continue; // the global PAX header: nothing this reader needs is carried there
    }
    if (!KNOWN_ENTRY_TYPES.has(typeFlag)) {
      // Notably a GNU long-name entry (`'L'`, or `'K'` for a long link name): its
      // "data" is the real name of the *next* header, whose own 100-byte name
      // field holds a truncated placeholder. Reading that placeholder as if it
      // were the real name — rather than refusing outright — would silently
      // vendor a file under the wrong path.
      throw new Error(`unsupported tar entry type ${typeFlag}`);
    }

    const rawName = readField(headerStart, 100);
    const prefix = readField(headerStart + 345, 155);
    const name = pendingPath ?? (prefix === "" ? rawName : `${prefix}/${rawName}`);
    pendingPath = null;

    const isRegularFile = typeFlag !== "5";
    if (isRegularFile) {
      const slashIndex = name.indexOf("/");
      const relativePath = slashIndex === -1 ? "" : name.slice(slashIndex + 1);
      if (relativePath !== "") {
        if (files.has(relativePath)) {
          throw new Error(`duplicate tar entry for "${relativePath}"`);
        }
        files.set(relativePath, Buffer.from(tar.subarray(dataStart, dataEnd)));
      }
    }
    // A directory (typeflag '5') carries nothing this reader needs.
  }

  if (!sawEndMarker) {
    throw new Error("malformed or truncated tar archive: missing end-of-archive marker");
  }

  return files;
}
