// Verso's words for Excalidraw's labels (`src/board/ptBR.ts`) against the
// Excalidraw pinned in package.json: every key still Excalidraw's, with the
// same {{placeholders}} its English fills in — a build that renames one
// showed "{{arrowShortcut}}" on the board as it was.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../node_modules/@excalidraw/excalidraw/dist/prod/locales/", import.meta.url);
const enFile = readdirSync(dir).find((f) => /^en-[A-Z0-9]+\.js$/.test(f));
const ptFile = readdirSync(dir).find((f) => /^pt-BR-[A-Z0-9]+\.js$/.test(f));
const en = (await import(new URL(enFile, dir).href)).default;
const src = readFileSync(new URL("../src/board/ptBR.ts", import.meta.url), "utf8");
const ours = [...src.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1], m[2]]);
const holes = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

test("view.tsx imports the English and the pt-BR modules this Excalidraw ships", () => {
  const view = readFileSync(new URL("../src/board/view.tsx", import.meta.url), "utf8");
  assert.ok(view.includes(`locales/${enFile}`), enFile);
  assert.ok(view.includes(`locales/${ptFile}`), ptFile);
});

test("every word Verso gives Excalidraw is a key of its, with its placeholders", () => {
  // Read by a pattern of one line per entry: a fall in the count is an
  // entry the pattern stopped reading, not one that went.
  assert.ok(ours.length >= 150, `${ours.length} entries read`);
  for (const [key, text] of ours) {
    const theirs = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), en);
    assert.equal(typeof theirs, "string", `${key} is not a label of this Excalidraw`);
    assert.deepEqual(holes(text), holes(theirs), `${key}: ${text}`);
  }
});
