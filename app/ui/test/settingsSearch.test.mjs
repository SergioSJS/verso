// The settings' search (the maintainer, 2026-11-05): "nome" put the
// account's *Nome* last, after every setting that only said "nome" in its
// words. A title that is the word searched comes first, then one that
// starts with it; each section stays one block.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/dialogs/settings/search.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/settingsSearch.test-bundle.mjs",
  logLevel: "error",
});
const { searched, rankOf } = await import("./.bundles/settingsSearch.test-bundle.mjs");

const items = [
  { section: "files", title: "Nota da pasta", desc: "Nome do arquivo da nota da pasta" },
  { section: "editor", title: "Pastas ignoradas", desc: "Nenhum nome aqui aparece nas sugestões" },
  { section: "editor", title: "Nomes das notas", desc: "Como os nomes aparecem" },
  { section: "server", title: "Seu nome para os jogadores", desc: "Como a mesa vê você" },
  { section: "account", title: "Senha", desc: "Doze letras" },
  { section: "account", title: "Nome", desc: "E-mail Idioma", group: "Perfil" },
];

test("the setting named by the word comes first, its section's block first", () => {
  const got = searched(items, "nome").map((i) => i.title);
  assert.equal(got[0], "Nome");
  assert.deepEqual(got.slice(1), ["Nomes das notas", "Pastas ignoradas", "Seu nome para os jogadores", "Nota da pasta"]);
});

test("case, accents and spaces around do not change the order", () => {
  assert.equal(searched(items, "  NOME ")[0].title, "Nome");
  assert.equal(rankOf({ section: "a", title: "Língua", desc: "" }, "lingua"), 0);
});

test("ranks: the title, its start, a word's start, inside it, the words around", () => {
  const r = (title, desc = "") => rankOf({ section: "s", title, desc }, "nome");
  assert.deepEqual([r("Nome"), r("Nomes"), r("Seu nome"), r("Sobrenome"), r("Outra", "um nome"), r("Outra")], [0, 1, 2, 3, 4, -1]);
});

test("nothing searched is nothing listed; among equals the page's order holds", () => {
  assert.deepEqual(searched(items, " "), []);
  const same = searched(items, "pasta").map((i) => i.title);
  assert.deepEqual(same, ["Pastas ignoradas", "Nota da pasta"]);
});
