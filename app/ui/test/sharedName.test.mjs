// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The note made of what another app handed to a phone's Verso (ADR 0118
// item 5) is named by the other app's name for it, else by the text's first
// line; never with a character a link or a Windows disk cannot keep, and
// never over a note already there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

const src = readFileSync(new URL("../src/screen/sharedName.ts", import.meta.url), "utf8");
const { code } = await esbuild.transform(src, { loader: "ts", format: "esm" });
const { sharedName, freeName } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("a file keeps its name without the extension", () => {
  assert.equal(sharedName("Receitas.md", "# Bolo", "Compartilhado"), "Receitas");
  assert.equal(sharedName("notas.TXT", "x", "Compartilhado"), "notas");
  assert.equal(sharedName("plano.markdown", "", "Shared"), "plano");
});

test("a text without a name is named by its first line, without its marks", () => {
  assert.equal(sharedName("", "\n\n# Ideias para a sessão\ncorpo", "Compartilhado"), "Ideias para a sessão");
  assert.equal(sharedName("", "- comprar dados", "Compartilhado"), "comprar dados");
  assert.equal(sharedName("  ", "> citação", "Compartilhado"), "citação");
});

test("what a link or a Windows disk cannot keep is left out", () => {
  assert.equal(sharedName("", "https://exemplo.com/a?b=c", "Compartilhado"), "https exemplo.com a b=c");
  assert.equal(sharedName("[[a]]|b#c^d", "", "S"), "a b c d");
  assert.equal(sharedName("fim.", "", "S"), "fim");
  assert.equal(sharedName("CON", "", "S"), "CON 1");
});

test("nothing to name it by gives the fallback; a long line is cut", () => {
  assert.equal(sharedName("", "   \n  ", "Compartilhado"), "Compartilhado");
  assert.equal(sharedName("", "#", "Shared"), "Shared");
  assert.equal(sharedName("", "a".repeat(80), "S").length, 60);
});

test("a name taken moves on to the next free one", () => {
  assert.equal(freeName("Nota", new Set()), "Nota");
  assert.equal(freeName("Nota", new Set(["nota.md"])), "Nota 2");
  assert.equal(freeName("Nota", new Set(["nota.md", "nota 2.md"])), "Nota 3");
});
