// What an embed of a block renders (spec Q3, Q21): the block's lines with
// the depth they had in the note taken off, so a nested item is a list and
// not an indented code block.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { dedent, blockOfTarget } from "./src/blockEmbed";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/blockEmbed.test-bundle.mjs",
  logLevel: "error",
  // The bindings reach the host; nothing here calls them.
  external: ["@tauri-apps/*"],
});
const { dedent, blockOfTarget } = await import("./.bundles/blockEmbed.test-bundle.mjs");

test("a nested item loses its depth, its children keep theirs", () => {
  assert.equal(dedent(["\t- filho ^tab", "\t\t- neto"]), "- filho ^tab\n\t- neto");
  assert.equal(dedent(["    - c ^c", "        - d"]), "- c ^c\n    - d");
});

test("a block at the margin, or a blank line in it, is left as it is", () => {
  assert.equal(dedent(["- um ^solto", "", "  - dentro"]), "- um ^solto\n\n  - dentro");
  assert.equal(dedent(["| a |", "| - |"]), "| a |\n| - |");
  assert.equal(dedent([]), "");
});

test("a line indented less than the first keeps what it has", () => {
  assert.equal(dedent(["\t\t- neto ^n", "\t- fora"]), "- neto ^n\n- fora");
});

test("the id of an embed's target", () => {
  assert.equal(blockOfTarget("Nota#^abc-1"), "abc-1");
  assert.equal(blockOfTarget("Nota#^abc|alias"), "abc");
  assert.equal(blockOfTarget("Nota#Título"), null);
});
