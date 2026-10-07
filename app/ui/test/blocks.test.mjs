// The blocks of a note in Edit mode (ADR 0061): what a block is, and what
// moving, duplicating, deleting and turning one writes — pure functions of
// the editor's state.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `
      export * from "./src/blocks/model";
      export { EditorState } from "@codemirror/state";
      export { markdown } from "@codemirror/lang-markdown";
      export { Table, TaskList, Strikethrough } from "@lezer/markdown";
      export { foldEffect, foldState, codeFolding } from "@codemirror/language";
    `,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/blocks.test-bundle.mjs",
  logLevel: "error",
});
const b = await import("./.bundles/blocks.test-bundle.mjs");

const state = (doc, selection) =>
  b.EditorState.create({ doc, selection, extensions: [b.markdown({ extensions: [b.Table, b.TaskList, b.Strikethrough] }), b.codeFolding()] });
const apply = (st, edit) => (edit ? st.update({ changes: edit.changes, selection: edit.selection }).state.doc.toString() : null);
const texts = (st, c) => c.children.map((x) => st.doc.sliceString(x.from, x.to));
/** The items of the list at the note's `i`th place. */
const items = (root, i = 0) => root.children[i].inner.children;

describe("what a block is (D5)", () => {
  test("a paragraph of several lines is one block; a blank line ends it", () => {
    const st = state("um\ndois\n\ntrês\n");
    assert.deepEqual(texts(st, b.outline(st)), ["um\ndois", "três"]);
  });

  test("a list item is a block with what is nested in it, and its nested items are blocks too", () => {
    const st = state("- a\n- b\n  - b1\n  - b2\n- c\n");
    const root = b.outline(st);
    // The list is one unit of the note; its items are the blocks.
    assert.deepEqual(root.children.map((x) => x.kind), ["list"]);
    assert.deepEqual(texts(st, root.children[0].inner), ["- a", "- b\n  - b1\n  - b2", "- c"]);
    assert.deepEqual(texts(st, items(root)[1].inner.children[0].inner), ["  - b1", "  - b2"]);
    assert.equal(b.blockAt(root, st.doc, st.doc.toString().indexOf("b2")).from, st.doc.toString().indexOf("  - b2"));
  });

  test("the frontmatter is never a block", () => {
    const st = state("---\ntitle: x\n---\n\nTexto\n");
    assert.deepEqual(texts(st, b.outline(st)), ["Texto"]);
  });

  test("a line holding only a ^id travels with the block before it", () => {
    const st = state("Parágrafo\n\n^abc123\n\nOutro\n");
    assert.deepEqual(texts(st, b.outline(st)), ["Parágrafo\n\n^abc123", "Outro"]);
  });

  test("a folded heading carries its section", () => {
    let st = state("# A\n\ntexto de A\n\n# B\n\ntexto de B\n");
    const end = st.doc.toString().indexOf("\n\n# B");
    st = st.update({ effects: b.foldEffect.of({ from: 3, to: end }) }).state;
    assert.deepEqual(texts(st, b.outline(st)), ["# A\n\ntexto de A", "# B", "texto de B"]);
  });

  test("a quote or a callout is one block; a table and a code block too", () => {
    const st = state("> [!note] T\n> corpo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nx\n```\n");
    assert.deepEqual(b.outline(st).children.map((x) => x.kind), ["quote", "table", "code"]);
  });
});

describe("moving (D6)", () => {
  test("a paragraph moves byte for byte, apart from its neighbours by one blank line", () => {
    const st = state("um\ndois\n\ntrês\n\nquatro");
    const root = b.outline(st);
    const out = apply(st, b.moveBlocks(st, [root.children[0]], { container: root, index: 3 }));
    assert.equal(out, "três\n\nquatro\n\num\ndois");
  });

  test("moving up and down by one, and nothing at the edge", () => {
    const st = state("A\n\nB\n\nC\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBy(st, [root.children[1]], -1)), "B\n\nA\n\nC\n");
    assert.equal(apply(st, b.moveBy(st, [root.children[1]], 1)), "A\n\nC\n\nB\n");
    assert.equal(b.moveBy(st, [root.children[0]], -1), null);
  });

  test("a tight list stays tight", () => {
    const st = state("- a\n- b\n- c\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBy(st, [items(root)[2]], -1)), "- a\n- c\n- b\n");
  });

  test("an ordered list is renumbered, from the number it started at", () => {
    const st = state("1. um\n2. dois\n3. três\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBlocks(st, [items(root)[2]], { container: root.children[0].inner, index: 0 })), "1. três\n2. um\n3. dois\n");
    const st5 = state("5. um\n6. dois\n");
    const r5 = b.outline(st5);
    assert.equal(apply(st5, b.moveBy(st5, [items(r5)[1]], -1)), "5. dois\n6. um\n");
  });

  test("an item moves with what is nested in it", () => {
    const st = state("- a\n- b\n  - b1\n- c\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBy(st, [items(root)[1]], 1)), "- a\n- c\n- b\n  - b1\n");
  });

  test("a ^id line moves with its block", () => {
    const st = state("A\n\n^id1\n\nB\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBy(st, [root.children[0]], 1)), "B\n\nA\n\n^id1\n");
  });

  test("a block is not moved into itself", () => {
    const st = state("- a\n  - a1\n- b\n");
    const root = b.outline(st);
    assert.equal(b.moveBlocks(st, [items(root)[0]], { container: items(root)[0].inner, index: 1 }), null);
  });
});

describe("across containers (S2)", () => {
  test("an item nested deeper takes the indentation of its new place", () => {
    const st = state("- a\n- b\n");
    const root = b.outline(st);
    const a = items(root)[0];
    assert.equal(apply(st, b.moveBlocks(st, [items(root)[1]], { container: a.inner, index: 0 })), "- a\n  - b\n");
  });

  test("a nested item brought to the top level loses its indentation", () => {
    const st = state("- a\n  - a1\n- b\n");
    const root = b.outline(st);
    const a1 = items(root)[0].inner.children[0].inner.children[0];
    assert.equal(apply(st, b.moveBlocks(st, [a1], { container: root.children[0].inner, index: 2 })), "- a\n- b\n- a1\n");
  });

  test("an item joining an ordered list takes its marker and number", () => {
    const st = state("1. um\n2. dois\n\n- solto\n");
    const root = b.outline(st);
    const list = root.children[0].inner;
    assert.equal(apply(st, b.moveBlocks(st, [items(root, 1)[0]], { container: list, index: 1 })), "1. um\n2. solto\n3. dois\n");
  });

  test("a paragraph put inside a quote gains its marks", () => {
    const st = state("> citação\n\nTexto\n");
    const root = b.outline(st);
    const quote = root.children[0];
    assert.equal(apply(st, b.moveBlocks(st, [root.children[1]], { container: quote.inner, index: 0 })), "> citação\n>\n> Texto\n");
  });

  test("a paragraph moved down passes a whole list, not between its items", () => {
    const st = state("A\n\n- x\n- y\n\nB\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.moveBy(st, [root.children[0]], 1)), "- x\n- y\n\nA\n\nB\n");
  });

  test("the blocks a selection touches move together", () => {
    const doc = "A\n\nB\n\nC\n\nD\n";
    const st = state(doc, { anchor: doc.indexOf("B"), head: doc.indexOf("C") + 1 });
    const root = b.outline(st);
    const run = b.blocksOfSelection(root, st);
    assert.deepEqual(run.map((x) => st.doc.sliceString(x.from, x.to)), ["B", "C"]);
    assert.equal(apply(st, b.moveBy(st, run, 1)), "A\n\nD\n\nB\n\nC\n");
  });
});

describe("the block menu (D7)", () => {
  test("duplicate puts a copy below, without the ^id", () => {
    const st = state("A ^xyz\n\nB\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.duplicateBlocks(st, [root.children[0]])), "A ^xyz\n\nA\n\nB\n");
  });

  test("delete takes the blank line with it, and renumbers", () => {
    const st = state("1. um\n2. dois\n3. três\n");
    const root = b.outline(st);
    assert.equal(apply(st, b.deleteBlocks(st, [items(root)[0]])), "1. dois\n2. três\n");
    const st2 = state("A\n\nB\n\nC");
    const r2 = b.outline(st2);
    assert.equal(apply(st2, b.deleteBlocks(st2, [r2.children[2]])), "A\n\nB");
  });

  test("turn into keeps the text, and offers only what holds it", () => {
    const st = state("uma linha\n\nduas\nlinhas\n\n```\ncode\n```\n");
    const root = b.outline(st);
    assert.ok(b.turnTargets(st, root.children[0]).includes("h2"));
    assert.ok(!b.turnTargets(st, root.children[1]).includes("h1"));
    assert.deepEqual(b.turnTargets(st, root.children[2]), []);
    assert.equal(apply(st, b.turnInto(st, root.children[0], "h2")), "## uma linha\n\nduas\nlinhas\n\n```\ncode\n```\n");
    assert.equal(apply(st, b.turnInto(st, root.children[1], "bullet")), "uma linha\n\n- duas\n  linhas\n\n```\ncode\n```\n");
    const it = state("- [ ] tarefa\n");
    assert.equal(apply(it, b.turnInto(it, items(b.outline(it))[0], "text")), "tarefa\n");
  });

  test("copy link: a heading's text; a paragraph's ^id, written once", () => {
    const st = state("# Título\n\nTexto\n\nCom id ^abc\n");
    const root = b.outline(st);
    assert.deepEqual(b.blockLink(st, root.children[0], () => "x"), { heading: "Título" });
    const made = b.blockLink(st, root.children[1], () => "new123");
    assert.equal(made.id, "new123");
    assert.equal(st.update({ changes: made.changes }).state.doc.toString(), "# Título\n\nTexto ^new123\n\nCom id ^abc\n");
    assert.deepEqual(b.blockLink(st, root.children[2], () => "x"), { id: "abc", changes: null });
  });
});
