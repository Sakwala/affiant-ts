import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { extractTarGz, fetchWithRetry } from "./tar-archive.js";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the response on a first-attempt success, with no retry", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.invalid/file", { baseDelayMs: 1 });

    expect(await response.text()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 and succeeds once the server recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.invalid/file", { baseDelayMs: 1 });

    expect(await response.text()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown network error (e.g. a reset connection) and can still succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.invalid/file", { baseDelayMs: 1 });

    expect(await response.text()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404, and its message names the URL and status", async () => {
    const fetchMock = vi.fn(
      async () => new Response("nope", { status: 404, statusText: "Not Found" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://example.invalid/missing", { baseDelayMs: 1 }),
    ).rejects.toThrow(/example\.invalid\/missing returned 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting its attempts and reports the last failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://example.invalid/file", { attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow(/could not fetch .* after 3 attempt\(s\): ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("extractTarGz", () => {
  /** Builds one 512-byte ustar header, padded to that size, no checksum computed. */
  function header(fields: {
    name: string;
    prefix?: string;
    size: number;
    typeFlag: string;
  }): Buffer {
    const block = Buffer.alloc(512);
    block.write(fields.name.slice(0, 100), 0, 100, "utf8");
    block.write("0000644", 100, 7, "ascii"); // mode
    block[107] = 0;
    block.write("0000000", 108, 7, "ascii"); // uid
    block[115] = 0;
    block.write("0000000", 116, 7, "ascii"); // gid
    block[123] = 0;
    block.write(fields.size.toString(8).padStart(11, "0"), 124, 11, "ascii"); // size
    block[135] = 0;
    block.write("00000000000", 136, 11, "ascii"); // mtime
    block[147] = 0;
    block.fill(0x20, 148, 156); // checksum placeholder; this reader never validates it
    block[156] = fields.typeFlag.charCodeAt(0);
    block.write("ustar", 257, 5, "ascii");
    block[262] = 0;
    block.write("00", 263, 2, "ascii");
    if (fields.prefix !== undefined) block.write(fields.prefix.slice(0, 155), 345, 155, "utf8");
    return block;
  }

  function fileEntry(name: string, content: string, prefix?: string): Buffer {
    const data = Buffer.from(content, "utf8");
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
    data.copy(padded);
    const options: { name: string; size: number; typeFlag: string; prefix?: string } = {
      name,
      size: data.length,
      typeFlag: "0",
    };
    if (prefix !== undefined) options.prefix = prefix;
    return Buffer.concat([header(options), padded]);
  }

  function dirEntry(name: string): Buffer {
    return header({ name, size: 0, typeFlag: "5" });
  }

  /** A PAX record: `"<length> key=value\n"`, where `<length>` counts its own digits. */
  function paxRecord(key: string, value: string): string {
    const fixed = key.length + value.length + 3; // " " + "=" + "\n"
    let length = fixed + String(fixed).length;
    for (;;) {
      const candidate = fixed + String(length).length;
      if (candidate === length) break;
      length = candidate;
    }
    return `${String(length)} ${key}=${value}\n`;
  }

  function paxHeaderEntry(path: string): Buffer {
    const data = Buffer.from(paxRecord("path", path), "utf8");
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
    data.copy(padded);
    return Buffer.concat([
      header({ name: "PaxHeaders/entry", size: data.length, typeFlag: "x" }),
      padded,
    ]);
  }

  function endOfArchive(): Buffer {
    return Buffer.alloc(1024); // two zeroed blocks
  }

  function archive(...entries: Buffer[]): Uint8Array {
    return gzipSync(Buffer.concat([...entries, endOfArchive()]));
  }

  it("strips the top-level directory and keeps regular files by their remaining path", () => {
    const tar = archive(
      dirEntry("affiant-protocol-0.1.1/"),
      dirEntry("affiant-protocol-0.1.1/schemas/"),
      fileEntry("affiant-protocol-0.1.1/schemas/affidavit.schema.json", '{"ok":true}'),
    );

    const files = extractTarGz(tar);

    expect([...files.keys()]).toEqual(["schemas/affidavit.schema.json"]);
    expect(files.get("schemas/affidavit.schema.json")?.toString("utf8")).toBe('{"ok":true}');
  });

  it("reassembles a path split across ustar's prefix and name fields", () => {
    const prefix = "affiant-protocol-0.1.1/conformance/fixtures/v0.1/evidence-card-request";
    const tar = archive(fileEntry("93-presentation-names-unknown-field.json", "{}", prefix));

    const files = extractTarGz(tar);

    expect([...files.keys()]).toEqual([
      "conformance/fixtures/v0.1/evidence-card-request/93-presentation-names-unknown-field.json",
    ]);
  });

  it("honors a PAX extended header's path override for the entry that follows it", () => {
    const longPath = "affiant-protocol-0.1.1/conformance/fixtures/deeply/nested/override.json";
    const tar = archive(
      paxHeaderEntry(longPath),
      fileEntry("ignored-short-name.json", '{"via":"pax"}'),
    );

    const files = extractTarGz(tar);

    expect([...files.keys()]).toEqual(["conformance/fixtures/deeply/nested/override.json"]);
    expect(files.get("conformance/fixtures/deeply/nested/override.json")?.toString("utf8")).toBe(
      '{"via":"pax"}',
    );
  });

  it("returns an empty map for an archive with nothing but the top-level directory", () => {
    const tar = archive(dirEntry("affiant-protocol-0.1.1/"));

    expect(extractTarGz(tar).size).toBe(0);
  });
});
