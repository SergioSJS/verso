// The service worker (ADR 0092 item 2), built last, once `dist/` holds the
// rest: it names the files of this build — the ones the window needs to open
// (`__CORE__`: the page, its scripts and what they import at once, the
// styles, the fonts, the icons) and the rest (`__REST__`: a board's
// Excalidraw, a map, a PDF's worker, a diagram's chunk, kept in the
// background) — and the build's version, so that a new build is a new
// worker, which drops the old build's caches.
//   node build-sw.mjs

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ui = fileURLToPath(new URL(".", import.meta.url));
const dist = join(ui, "dist");
const { version } = JSON.parse(readFileSync(join(ui, "package.json"), "utf8"));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// What the server serves of `dist/` to a browser's window: not the source
// maps, the desktop's own page, nor the harness; and not the worker itself.
// Nor the embedded terminal's screen and sheet: a browser's window never has
// a terminal (ADR 0115 item 6), so a phone keeps none of it offline.
const desktopOnly = (p) => p.startsWith("/chunks/xtermScreen-") || p.startsWith("/terminal/");
const all = walk(dist)
  .map((p) => "/" + relative(dist, p).split("\\").join("/"))
  .filter((p) => !p.endsWith(".map") && p !== "/index.html" && p !== "/web.html" && p !== "/sw.js" && !p.startsWith("/harness") && !p.includes(".test-bundle.") && !desktopOnly(p))
  .sort();

// The chunks a script imports at once, followed through the scripts that
// import them: the page cannot start without them. A `import(...)` is lazy.
const staticImports = (file) => {
  const text = readFileSync(join(dist, file), "utf8");
  const found = new Set();
  for (const m of text.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["'](\.\/[^"']+)["']/g)) found.add(m[1]);
  return [...found].map((rel) => "/" + join(file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "", rel).split("\\").join("/").replace(/^\/+/, "")).map((p) => p.replace(/\/\.\//g, "/"));
};
const core = new Set(["/web.js", "/main.js", "/style.css", "/manifest.webmanifest", "/favicon.ico", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]);
const queue = ["/web.js", "/main.js"];
while (queue.length > 0) {
  const file = queue.pop();
  for (const dep of staticImports(file.slice(1))) {
    const clean = dep.replace(/^\/\.\//, "/");
    if (all.includes(clean) && !core.has(clean)) {
      core.add(clean);
      if (clean.endsWith(".js") || clean.endsWith(".mjs")) queue.push(clean);
    }
  }
}
// The fonts and the stylesheets of the page itself.
for (const p of all) if ((p.startsWith("/fonts/") && p.endsWith(".woff2")) || (p.endsWith(".css") && p.lastIndexOf("/") === 0)) core.add(p);
const coreList = [...core].filter((p) => all.includes(p)).sort();
const rest = all.filter((p) => !core.has(p));

// What the person is told before anything is kept: the window's own code,
// at install and in the background, in bytes.
const size = (list) => list.reduce((n, p) => n + statSync(join(dist, p.replace(/^\/+/, ""))).size, 0);
writeFileSync(join(dist, "offline-size.json"), JSON.stringify({ core: size(coreList), rest: size(rest) }));

// The build itself, by what it serves: two builds of one version (a server
// redeployed between releases) are two caches, never one, so that the files
// kept of the first are not served for the second. `keep` skips what a cache
// already holds, and `web.js` has one name in every build.
const hash = createHash("sha256");
for (const p of all) hash.update(p).update("\0").update(readFileSync(join(dist, p.replace(/^\/+/, ""))));
const build_id = `${version}+${hash.digest("hex").slice(0, 12)}`;

await build({
  entryPoints: [join(ui, "src/sw/sw.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: join(dist, "sw.js"),
  define: {
    __VERSION__: JSON.stringify(build_id),
    __CORE__: JSON.stringify(coreList),
    __REST__: JSON.stringify(rest),
  },
  logLevel: "error",
});
if (process.env.VERSO_SW_LIST) console.log(coreList.join("\n"));
console.log(`sw.js: build ${build_id}, ${coreList.length} files at install, ${rest.length} kept in the background`);
