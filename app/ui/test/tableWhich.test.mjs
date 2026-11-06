// Which table the Mesa panel is at (ADR 0107 as amended 2026-10-23, "o chat
// deve ser 1 por mesa"): the table of the active note — the nearest up its
// path, as the chip beside the folder's name has it — else the table chosen
// last in the folder, else the only one, else a list to choose from. The
// panel is tried in e2e/table-per-table.spec.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/which";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableWhich.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableWhich.test-bundle.mjs");

test("a folder with no table has the panel it always had", () => {
  assert.deepEqual(m.whichTable([], "Notas/A.md", null, null), { kind: "none" });
  assert.deepEqual(m.whichTable([], "", "Cripta", "Sala"), { kind: "none" });
});

test("the panel is at the table that holds the active note", () => {
  const roots = ["Cripta", "Sala"];
  assert.deepEqual(m.whichTable(roots, "Cripta/Sessao.md", null, null), { kind: "table", root: "Cripta" });
  assert.deepEqual(m.whichTable(roots, "Sala/Mapas/Mapa.canvas", null, "Cripta"), { kind: "table", root: "Sala" });
  // A folder that only begins with the same letters is not inside the table.
  assert.deepEqual(m.whichTable(roots, "Cripta2/X.md", null, "Sala"), { kind: "table", root: "Sala" });
});

test("the deepest table wins, and the folder's own table holds what no other does", () => {
  assert.deepEqual(m.whichTable(["", "Cripta", "Cripta/Fundo"], "Cripta/Fundo/Nota.md", null, null), { kind: "table", root: "Cripta/Fundo" });
  assert.deepEqual(m.whichTable(["", "Cripta"], "Cripta/Nota.md", null, null), { kind: "table", root: "Cripta" });
  assert.deepEqual(m.whichTable(["", "Cripta"], "Outra/Nota.md", null, null), { kind: "table", root: "" });
  // No note open: the folder's own table, when the folder is one.
  assert.deepEqual(m.whichTable(["", "Cripta"], "", null, "Cripta"), { kind: "table", root: "" });
});

test("a note in no table: the table chosen last, the only one, or a list", () => {
  const roots = ["Sala", "Cripta"];
  assert.deepEqual(m.whichTable(roots, "Fora/N.md", null, "Cripta"), { kind: "table", root: "Cripta" });
  assert.deepEqual(m.whichTable(roots, "", null, "Sala"), { kind: "table", root: "Sala" });
  // A table remembered that is gone is not followed.
  assert.deepEqual(m.whichTable(roots, "Fora/N.md", null, "Sumiu"), { kind: "choose", roots: ["Cripta", "Sala"] });
  assert.deepEqual(m.whichTable(roots, "", null, null), { kind: "choose", roots: ["Cripta", "Sala"] });
  assert.deepEqual(m.whichTable(["Sala"], "Fora/N.md", null, null), { kind: "table", root: "Sala" });
});

test("the person's choice, made for this note, wins over the note's table", () => {
  const roots = ["Cripta", "Sala"];
  assert.deepEqual(m.whichTable(roots, "Cripta/N.md", "Sala", null), { kind: "table", root: "Sala" });
  // A choice of a table that is not there is ignored.
  assert.deepEqual(m.whichTable(roots, "Cripta/N.md", "Sumiu", null), { kind: "table", root: "Cripta" });
});

test("the panel names a table by its folder's name; the folder itself by the folder's", () => {
  assert.equal(m.tableLabel("", "Campanha"), "Campanha");
  assert.equal(m.tableLabel("Cripta", "Campanha"), "Cripta");
  assert.equal(m.tableLabel("Mundo/Cripta", "Campanha"), "Cripta");
});

// The panel's header while a join is on its way (the parity run of
// 2026-11-06: a player who landed in their folder and chose it again from
// "Trocar de pasta" had the table's name missing until they changed note):
// the same table asked again, with the window not yet at it, is still the
// table the panel names.
test("the panel names the table it is joining, not none, while the join is on its way", () => {
  const at = m.whichTable([""], "", null, null);
  assert.deepEqual(m.panelPick([""], at, null), { roots: [""], current: "", choosing: false });
  assert.deepEqual(m.panelPick([""], at, ""), { roots: [""], current: "", choosing: false });
  // The window is at the table the server gave it: that one.
  assert.deepEqual(m.panelPick(["Cripta"], m.whichTable(["Cripta"], "", null, null), "Cripta"), { roots: ["Cripta"], current: "Cripta", choosing: false });
  // A list to choose from names none.
  const two = ["Cripta", "Sala"];
  assert.deepEqual(m.panelPick(two, m.whichTable(two, "Notas.md", null, null), null), { roots: two, current: null, choosing: true });
  // A folder with no table: none.
  assert.deepEqual(m.panelPick([], { kind: "none" }, null), { roots: [], current: null, choosing: false });
});
