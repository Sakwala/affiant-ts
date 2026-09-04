import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The package manifest: what a consumer can import, what a tarball would contain, and
 * the guard that stops one being made.
 *
 * A broken `exports` map is invisible to every other suite here — the suites import
 * `../src/*.js` or the workspace link, and both resolve whatever is on disk. The one
 * thing that reads `exports` is a consumer, and by then the package is published. So
 * this suite reads the manifest as a document and checks it against the built output,
 * which is the check a consumer would otherwise perform for us, once, too late.
 *
 * The publish guard is here for the same reason. "Not on npm until the parity report
 * and the conformance driver are green" is a sentence in three READMEs; a sentence
 * cannot stop `npm publish`. `prepack` can, and this suite is what keeps the sentence
 * and the script saying the same thing.
 *
 * Node-only: it reads `package.json` and `dist/` off disk.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly homepage: string;
  readonly bugs: string;
  readonly files: readonly string[];
  readonly license: string;
  readonly type: string;
  readonly exports: Record<string, Record<string, string> | string>;
  readonly publishConfig: { readonly access: string; readonly tag: string };
  readonly scripts: Record<string, string>;
};

/** The message the guard must print, verbatim. The three READMEs quote it. */
const GUARD_MESSAGE =
  "@affiant/core is not published until the parity report and the conformance driver are green";

describe("what a consumer can import", () => {
  it("exposes exactly three entry points, plus the manifest itself", () => {
    expect(Object.keys(manifest.exports).sort()).toEqual([
      ".",
      "./package.json",
      "./store-memory",
      "./testing",
    ]);
  });

  it("gives every entry point its types and its implementation, in that order", () => {
    for (const subpath of [".", "./store-memory", "./testing"]) {
      const target = manifest.exports[subpath];
      // `types` first: a resolver takes the first matching condition, and a `types`
      // listed after `default` is never reached.
      expect(Object.keys(target as Record<string, string>), subpath).toEqual(["types", "default"]);
    }
  });

  it("points every entry point at a file the build produced", () => {
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const paths = typeof target === "string" ? [target] : Object.values(target);
      for (const path of paths) {
        expect(existsSync(join(packageRoot, path)), `${subpath} -> ${path}`).toBe(true);
      }
    }
  });

  it("ships the licence, the built output and the telemetry-key registry, and nothing else", () => {
    expect([...manifest.files].sort()).toEqual(["LICENSE", "dist", "telemetry-keys.json"]);
  });

  it("carries the licence text a recipient is owed, byte for byte with the repository's", () => {
    // Apache-2.0 section 4(a): a recipient of the work gets a copy of the licence.
    // npm does not reach outside the package directory, so the repository root's copy
    // never enters the tarball - the package needs its own, and it has to be the same
    // one. `files` names it as well, so a `files` rewrite cannot drop it silently.
    const shipped = join(packageRoot, "LICENSE");
    const root = join(packageRoot, "..", "..", "LICENSE");

    expect(existsSync(shipped)).toBe(true);
    expect(readFileSync(shipped, "utf8")).toBe(readFileSync(root, "utf8"));
    expect(manifest.files).toContain("LICENSE");
    expect(manifest.license).toBe("Apache-2.0");
  });

  it("carries a README, so the npm page is not blank for a package that is a rulebook", () => {
    // npm includes README automatically; this asserts the file is there to include.
    const readme = readFileSync(join(packageRoot, "README.md"), "utf8");

    expect(readme.length).toBeGreaterThan(1000);
    expect(readme).toContain("@affiant/core");
  });

  it("gives the sibling published packages their own licence copy too", () => {
    const root = readFileSync(join(packageRoot, "..", "..", "LICENSE"), "utf8");

    for (const sibling of ["contract", "evidence-card"]) {
      const directory = join(packageRoot, "..", sibling);
      const siblingManifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
        readonly files: readonly string[];
        readonly license: string;
      };

      expect(readFileSync(join(directory, "LICENSE"), "utf8"), sibling).toBe(root);
      expect(siblingManifest.files, sibling).toContain("LICENSE");
      expect(siblingManifest.license, sibling).toBe("Apache-2.0");
      expect(existsSync(join(directory, "README.md")), sibling).toBe(true);
    }
  });

  it("is ESM, and says where to look and where to complain", () => {
    expect(manifest.type).toBe("module");
    expect(manifest.description.length).toBeGreaterThan(40);
    expect(manifest.keywords.length).toBeGreaterThanOrEqual(6);
    expect(manifest.homepage).toContain("affiant-ts");
    expect(manifest.bugs).toContain("issues");
  });
});

describe("the publish guard", () => {
  it("runs on prepack, which is what npm pack and npm publish both trigger", () => {
    expect(manifest.scripts["prepack"]).toBe("node scripts/prepack-guard.mjs");
  });

  it("would publish under the alpha tag, never latest", () => {
    // `latest` is what `npm install @affiant/core` resolves to. An alpha that claimed
    // it would be installed by everyone who typed the package name.
    expect(manifest.publishConfig.tag).toBe("alpha");
    expect(manifest.publishConfig.access).toBe("public");
  });

  it("states the condition verbatim, and names the one way past it", () => {
    const guard = readFileSync(join(packageRoot, "scripts", "prepack-guard.mjs"), "utf8");
    expect(guard).toContain(GUARD_MESSAGE);
    expect(guard).toContain("AFFIANT_ALLOW_PUBLISH");
  });

  it("says the same thing in the README a consumer reads", () => {
    const readme = readFileSync(join(packageRoot, "README.md"), "utf8");
    expect(readme).toContain("AFFIANT_ALLOW_PUBLISH=1");
    expect(readme).toContain("parity report");
    expect(readme).toContain("conformance driver");
  });
});
