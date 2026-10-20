// Writes src/creditsDeps.json: the version and licence of the main npm
// libraries the window ships, read from their own package.json in
// node_modules (never typed by hand). Run by `npm run build`; the result is
// checked in so tests and type checks see it. Usage: node scripts/credits-deps.mjs
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
};
const out = Object.entries(MAIN).map(([pkg, [name, link]]) => {
  const j = JSON.parse(readFileSync(`${root}node_modules/${pkg}/package.json`, "utf8"));
  if (typeof j.license !== "string" || !j.license) throw new Error(`${pkg}: no licence in package.json`);
  return { name, pkg, version: j.version, license: j.license, link };
});
writeFileSync(`${root}src/creditsDeps.json`, `${JSON.stringify(out, null, 2)}\n`);
