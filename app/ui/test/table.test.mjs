// A table as a grid (ADR 0064): read from its rows, changed by place, and
// written back as an aligned Markdown table.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/table.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/table.test-bundle.mjs", logLevel: "error" });
const t = await import("./.bundles/table.test-bundle.mjs");

const rows = ["| Nome | Idade |", "| :--- | ---: |", "| Ana | 30 |"];

describe("the table as a grid", () => {
  test("read: header, alignment, body; a `\\|` is a `|`", () => {
    const g = t.parseGrid(["| a \\| b | c |", "| --- | :---: |", "| 1 | 2 |"]);
    assert.deepEqual(g, { head: ["a | b", "c"], align: [null, "center"], body: [["1", "2"]] });
  });

  test("written back aligned, its alignment kept, a typed `|` escaped", () => {
    const g = t.setCell(t.parseGrid(rows), 0, 0, "Ana | Bia");
    assert.equal(t.gridText(g), "| Nome       | Idade |\n| :--------- | ----: |\n| Ana \\| Bia | 30    |");
  });

  test("rows and columns inserted and deleted; a table keeps one column", () => {
    let g = t.parseGrid(rows);
    g = t.insertRow(g, 1);
    g = t.insertCol(g, 1);
    assert.deepEqual(g.head, ["Nome", "", "Idade"]);
    assert.deepEqual(g.body, [["Ana", "", "30"], ["", "", ""]]);
    g = t.deleteCol(t.deleteRow(g, 1), 1);
    assert.deepEqual(t.parseGrid(t.gridText(g).split("\n")), t.parseGrid(rows));
    const one = t.parseGrid(["| x |", "| --- |"]);
    assert.deepEqual(t.deleteCol(one, 0).head, ["x"]);
  });

  test("a column aligned writes its marks", () => {
    const g = t.setAlign(t.parseGrid(rows), 0, "center");
    assert.match(t.gridText(g).split("\n")[1], /^\| :-+: \| -+: \|$/);
  });

  test("a new table's header is empty", () => {
    assert.match(t.template(2, 1), /^\| {3,} \| {3,} \|\n/);
  });
});
