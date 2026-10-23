// Saved rolls (ADR 0107, "saved rolls", 2026-10-23): a note's lines with a
// dice code read as named rolls, and the line "Salvar" files. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/savedRolls";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/savedRolls.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/savedRolls.test-bundle.mjs");
const names = (lines) => m.savedRollsOf(lines).map((r) => [r.name, r.notation]);

test("a list item with a name: the name is the line without marker, code and trailing colon", () => {
  assert.deepEqual(names(["- Ataque da Bia: `dice: 1d20+7`"]), [["Ataque da Bia", "1d20+7"]]);
  assert.deepEqual(names(["* Dano `dice: 2d6+4`"]), [["Dano", "2d6+4"]]);
  assert.deepEqual(names(["1. Furtividade - `dice: 1d20+9`"]), [["Furtividade", "1d20+9"]]);
  assert.deepEqual(names(["- [ ] Iniciativa: `dice: 1d20+2`"]), [["Iniciativa", "1d20+2"]]);
});

test("a heading or quote line, and a table row, are named by their words", () => {
  assert.deepEqual(names(["## Percepção: `dice: 1d20+3`"]), [["Percepção", "1d20+3"]]);
  assert.deepEqual(names(["> Sorte: `dice: 1d6`"]), [["Sorte", "1d6"]]);
  assert.deepEqual(names(["| Espada | `dice: 1d8+3` |", "| --- | --- |"]), [["Espada", "1d8+3"]]);
});

test("a line with only the code is named by its notation; spaces in the code go", () => {
  assert.deepEqual(names(["`dice: 4d6kh3`"]), [["4d6kh3", "4d6kh3"]]);
  assert.deepEqual(names(["- `dice: 1d20 + 5`"]), [["1d20+5", "1d20+5"]]);
});

test("what is not a roll is left out: other code, unreadable notation, table rolls, fenced blocks", () => {
  assert.deepEqual(names(["- `let x = 1`", "- Isto: `dice: banana`", "- Tabela: `dice: [[Encontros^e]]`", "texto solto"]), []);
  assert.deepEqual(names(["```", "- Dentro: `dice: 1d20`", "```", "- Fora: `dice: 1d4`"]), [["Fora", "1d4"]]);
});

test("two codes on one line share the words before the first and are told apart by the notation; repeats are listed once", () => {
  assert.deepEqual(names(["- Golpe: `dice: 1d20+5` e `dice: 1d8+3`"]), [
    ["Golpe 1d20+5", "1d20+5"],
    ["Golpe 1d8+3", "1d8+3"],
  ]);
  assert.deepEqual(names(["- A: `dice: 1d4`", "- A: `dice: 1d4`", "- A: `dice: 1d6`"]), [["A", "1d4"], ["A", "1d6"]]);
});

test("rollLine: name and code on one list item; a backtick, pipe or line break in the name goes", () => {
  assert.equal(m.rollLine("Ataque da Bia", "1d20+7"), "- Ataque da Bia: `dice: 1d20+7`");
  assert.equal(m.rollLine("a`b|c\nd:", "1d4"), "- a b c d: `dice: 1d4`");
  assert.equal(m.rollLine("  ", "1d4"), "- `dice: 1d4`");
  assert.deepEqual(names([m.rollLine("Ataque da Bia", "1d20+7")]), [["Ataque da Bia", "1d20+7"]]);
});

test("addRollLine: at the end after a blank line, joining a closing list of rolls, keeping line endings", () => {
  const line = "- Novo: `dice: 1d6`";
  assert.equal(m.addRollLine("# Ficha\n\nTexto.\n", line), "# Ficha\n\nTexto.\n\n- Novo: `dice: 1d6`\n");
  assert.equal(m.addRollLine("# F\n\n- A: `dice: 1d4`\n", line), "# F\n\n- A: `dice: 1d4`\n- Novo: `dice: 1d6`\n");
  assert.equal(m.addRollLine("# F\r\n\r\nTexto.\r\n", line), "# F\r\n\r\nTexto.\r\n\r\n- Novo: `dice: 1d6`\r\n");
  assert.equal(m.addRollLine("", line), "- Novo: `dice: 1d6`\n");
  assert.equal(m.addRollLine("Sem fim", line), "Sem fim\n\n- Novo: `dice: 1d6`\n");
});

test("addRollLine: a Rolagens section takes the line at its end, before the next heading", () => {
  const line = "- Novo: `dice: 1d6`";
  const text = "# F\n\n## Rolagens\n\n- A: `dice: 1d4`\n\n## Notas\n\nTexto\n";
  assert.equal(m.addRollLine(text, line), "# F\n\n## Rolagens\n\n- A: `dice: 1d4`\n- Novo: `dice: 1d6`\n\n## Notas\n\nTexto\n");
  assert.equal(m.addRollLine("## Rolls\n", line), "## Rolls\n\n- Novo: `dice: 1d6`\n");
});

test("addRollLine: a list that is not rolls is not joined", () => {
  assert.equal(m.addRollLine("- espada\n- escudo\n", "- N: `dice: 1d6`"), "- espada\n- escudo\n\n- N: `dice: 1d6`\n");
});
