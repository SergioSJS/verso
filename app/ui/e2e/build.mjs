// The harness's site (ADR 0058): the window's build — `dist/`, from
// `npm run build` — copied to `e2e/.site/`, with the harness's script and
// page beside it. Never inside `dist/`, which the app packages (decided on
// 2026-10-01, review `board.md` §6 item 13). Run by Playwright before it
// serves the site (playwright.config.mjs). The stylesheet is bundled again
// from `css/` into the site on every run, as "build" bundles it into
// `dist/`: a harness built after a change to the CSS alone never serves
// the stale `dist/style.css` (unstyled screenshots, 2026-10-10).

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
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
execFileSync(process.execPath, [join(ui, "css", "bundle.mjs"), join(site, "style.css")], { stdio: "inherit" });
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
// The page loads `main.js?v=<version>` (build-index.mjs); the harness's
// page loads the harness instead.
if (!/src="main\.js(\?v=[^"]*)?"/.test(page)) throw new Error("index.html no longer loads main.js");
if (!/href="style\.css(\?v=[^"]*)?"/.test(page)) throw new Error("index.html no longer loads style.css");
await writeFile(join(site, "harness.html"), page.replace(/src="main\.js(\?v=[^"]*)?"/, 'src="harness.js"'));
