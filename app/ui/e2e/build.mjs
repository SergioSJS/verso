// The harness's site (ADR 0058): the window's build — `dist/`, from
// `npm run build` — copied to `e2e/.site/`, with the harness's script and
// page beside it. Never inside `dist/`, which the app packages (decided on
// 2026-10-01, review `board.md` §6 item 13). Run by Playwright before it
// serves the site (playwright.config.mjs).

import { build } from "esbuild";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL("..", import.meta.url));
const dist = join(ui, "dist");
const site = join(ui, "e2e", ".site");

await stat(join(dist, "index.html")).catch(() => {
  throw new Error("no window build: run `npm run build` first");
});
await rm(site, { recursive: true, force: true });
await cp(dist, site, { recursive: true });
await build({
  entryPoints: [join(ui, "src", "harness.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  splitting: true,
  outdir: site,
  chunkNames: "harness-chunks/[name]-[hash]",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: true,
  logLevel: "warning",
});
const page = await readFile(join(dist, "index.html"), "utf8");
if (!page.includes('src="main.js"')) throw new Error("index.html no longer loads main.js");
await writeFile(join(site, "harness.html"), page.replace('src="main.js"', 'src="harness.js"'));
