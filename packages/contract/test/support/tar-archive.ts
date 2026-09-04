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
 * targets exactly what `git archive` (what codeload runs) produces for that case:
 *
 * - PAX format, one global extended header (`typeflag 'g'`) carrying the commit
 *   the ref resolved to — read and discarded; nothing here needs it.
 * - A per-entry PAX extended header (`typeflag 'x'`) only when a path does not fit
 *   the ustar `prefix`+`name` fields; this repository's current paths all do, but
 *   a `path` record is still honored if one appears.
 * - Octal (not base-256) size fields — true for every file this reader has seen
 *   from this repository, and a mismatch fails loudly rather than misreading.
 *
 * It does not handle GNU long-name headers, sparse files, or symlinks. None of
 * those are things `git archive` writes for a schema-and-fixture rulebook.
 */
import { gunzipSync } from "node:zlib";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

/**
 * `fetch`, retried on a transient failure: a thrown network error (a DNS failure,
 * a reset connection, a timeout) or a 429/5xx response. A 404 and any other 4xx are
 * not retried — those mean the request itself will not succeed no matter how many
 * times it is repeated, so retrying only delays reporting the real problem.
 *
 * Exhausting every attempt throws, with the last failure's detail in the message;
 * it never returns a "this could not be checked" result for the caller to swallow.
 */
export async function fetchWithRetry(
  url: string,
  { attempts = 3, baseDelayMs = 500 }: RetryOptions = {},
): Promise<Response> {
  let lastFailure = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (response !== undefined) {
      if (response.ok) return response;
      lastFailure = `${String(response.status)} ${response.statusText}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new Error(`${url} returned ${lastFailure}`);
      }
    }

    if (attempt === attempts) break;
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
  }

  throw new Error(`could not fetch ${url} after ${String(attempts)} attempt(s): ${lastFailure}`);
}

/**
 * Reads a `.tar.gz` archive's regular files into a map of path -> content,
 * stripping the single top-level directory `git archive` wraps every entry in
 * (e.g. `affiant-protocol-0.1.1/conformance/…` becomes `conformance/…`). Only
 * that stripped path is returned; directory entries and anything else are not.
 */
export function extractTarGz(gzipBytes: Uint8Array): Map<string, Buffer> {
  const tar = gunzipSync(gzipBytes);
  const files = new Map<string, Buffer>();
  let offset = 0;
  let pendingPath: string | null = null;

  const readField = (start: number, length: number): string => {
    const slice = tar.subarray(start, start + length);
    const nul = slice.indexOf(0);
    return (nul === -1 ? slice : slice.subarray(0, nul)).toString("utf8");
  };
  const readOctal = (start: number, length: number): number => {
    const raw = readField(start, length).trim();
    return raw === "" ? 0 : Number.parseInt(raw, 8);
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
    const header = tar.subarray(headerStart, headerStart + 512);
    if (header.every((byte) => byte === 0)) break; // end-of-archive padding

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

    const rawName = readField(headerStart, 100);
    const prefix = readField(headerStart + 345, 155);
    const name = pendingPath ?? (prefix === "" ? rawName : `${prefix}/${rawName}`);
    pendingPath = null;

    const isRegularFile = typeFlag === "0" || typeFlag === "\0" || typeFlag === "";
    if (isRegularFile) {
      const slashIndex = name.indexOf("/");
      const relativePath = slashIndex === -1 ? "" : name.slice(slashIndex + 1);
      if (relativePath !== "") {
        files.set(relativePath, Buffer.from(tar.subarray(dataStart, dataEnd)));
      }
    }
    // Directories and any other entry type carry nothing this reader needs.
  }

  return files;
}
