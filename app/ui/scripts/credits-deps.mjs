// Writes src/creditsDeps.json: the version and licence of the main npm
// libraries the window ships, read from their own package.json in
// node_modules (never typed by hand). The result is checked in so tests and
// type checks see it, and `npm test` fails when it is stale (credits.test.mjs
// runs the check), so a dependency bump cannot leave the Credits page behind.
// Usage:
//   node scripts/credits-deps.mjs          write the file
//   node scripts/credits-deps.mjs --check  fail if it is stale
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
/** package -> the name shown and the project's address. */
const MAIN = {
  "@codemirror/view": ["CodeMirror", "https://codemirror.net"],
  "@excalidraw/excalidraw": ["Excalidraw", "https://excalidraw.com"],
  yjs: ["Yjs", "https://yjs.dev"],
  "pdfjs-dist": ["PDF.js", "https://mozilla.github.io/pdf.js/"],
  katex: ["KaTeX", "https://katex.org"],
  "maplibre-gl": ["MapLibre GL JS", "https://maplibre.org"],
  mermaid: ["Mermaid", "https://mermaid.js.org"],
  react: ["React", "https://react.dev"],
  three: ["three.js", "https://threejs.org"],
  "cannon-es": ["cannon-es", "https://pmndrs.github.io/cannon-es/"],
};
const out = Object.entries(MAIN).map(([pkg, [name, link]]) => {
  const j = JSON.parse(readFileSync(`${root}node_modules/${pkg}/package.json`, "utf8"));
  if (typeof j.license !== "string" || !j.license) throw new Error(`${pkg}: no licence in package.json`);
  return { name, pkg, version: j.version, license: j.license, link };
});
const file = `${root}src/creditsDeps.json`;
const text = `${JSON.stringify(out, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let now = "";
  try {
    now = readFileSync(file, "utf8");
  } catch {
    // Missing: stale.
  }
  if (now !== text) {
    console.error("src/creditsDeps.json is stale: run `node scripts/credits-deps.mjs` in app/ui");
    process.exit(1);
  }
} else {
  writeFileSync(file, text);
}
