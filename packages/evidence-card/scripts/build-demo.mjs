#!/usr/bin/env node
/**
 * Bundles the demo page into `demo/dist/`, which is what GitHub Pages publishes.
 *
 * The output is plain static files: an HTML page, one ES module, and the fixture
 * it fetches. Every path in the page is relative, so the same directory works from
 * a local static server and from a project sub-path such as
 * https://sakwala.github.io/affiant-ts/.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = join(packageRoot, "demo");
const outDir = join(demoDir, "dist");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(demoDir, "main.ts")],
  outfile: join(outDir, "main.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  minify: true,
  sourcemap: true,
  legalComments: "none",
});

cpSync(join(demoDir, "index.html"), join(outDir, "index.html"));
cpSync(join(demoDir, "fixture.json"), join(outDir, "fixture.json"));

// Ship the compiled element next to the demo as well, so the published page is
// also a place to read the built module rather than only to click on it.
const builtElement = join(packageRoot, "dist");
const shippedElement = existsSync(builtElement);
if (shippedElement) {
  cpSync(builtElement, join(outDir, "element"), { recursive: true });
}

console.log(
  `built demo/dist: page, bundled module, fixture${shippedElement ? ", built element" : " (run `pnpm build` first to include the built element)"}`,
);
