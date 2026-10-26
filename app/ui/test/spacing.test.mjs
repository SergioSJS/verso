// Blank lines and the horizontal rule in Edit mode (ADR 0061, revised
// 2026-10-22): which blank lines are drawn as a gap, and what Enter after a
// typed `---` writes. Pure functions of the editor's state.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `
      export { blankGaps } from "./src/live/gaps";
      export { ruleEnter } from "./src/editor/rule";
      export { frontmatterEnd } from "./src/live/frontmatter";
      export { EditorState } from "@codemirror/state";
      export { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
      export { markdown } from "@codemirror/lang-markdown";
      export { Table, TaskList, Strikethrough } from "@lezer/markdown";
    `,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/spacing.test-bundle.mjs",
  logLevel: "error",
});
const b = await import("./.bundles/spacing.test-bundle.mjs");

const state = (doc, head) =>
  b.EditorState.create({ doc, selection: { anchor: head ?? doc.length }, extensions: [b.markdown({ extensions: [b.Table, b.TaskList, b.Strikethrough] })] });
const gaps = (doc) => {
  const st = state(doc);
  const tree = b.ensureSyntaxTree(st, st.doc.length, 1000);
  return Object.fromEntries(b.blankGaps(st.doc, tree, 0, st.doc.length, b.frontmatterEnd(st.doc)));
};
/** The text and the caret after Enter on a line typed at `head`, or null. */
const enter = (doc, head) => {
  const st = state(doc, head);
  const spec = b.ruleEnter(st);
  if (!spec) return null;
  const tr = st.update(spec);
  return { text: tr.newDoc.toString(), caret: tr.newSelection.main.head, line: tr.newDoc.lineAt(tr.newSelection.main.head).number };
};

describe("which blank lines are a gap", () => {
  test("the blank line between two paragraphs is a gap", () => {
    assert.deepEqual(gaps("um\n\ndois\n"), { 2: "gap" });
  });
  test("a further blank line of the same run is extra", () => {
    assert.deepEqual(gaps("um\n\n\n\ndois\n"), { 2: "gap", 3: "extra", 4: "extra" });
  });
  test("the last line of the note is kept whole", () => {
    assert.deepEqual(gaps("um\n\n"), { 2: "gap" });
  });
  test("a blank line inside a fenced code block is content", () => {
    assert.deepEqual(gaps("antes\n\n```\na\n\nb\n```\n\ndepois\n"), { 2: "gap", 8: "gap" });
  });
  test("a blank line in an HTML block is content", () => {
    // CommonMark ends a type-6 HTML block at the blank line, so this one is not content.
    assert.equal(gaps("<!--\na\n\nb\n-->\n\nfim\n")[3], undefined);
  });
  test("the frontmatter's blank lines are not drawn at all", () => {
    assert.deepEqual(gaps("---\na: 1\n---\n\ntexto\n"), { 4: "gap" });
  });
  test("a blank line between list items is a gap", () => {
    assert.deepEqual(gaps("- a\n\n- b\n"), { 2: "gap" });
  });
  test("a blank line around a rule is a gap on each side", () => {
    assert.deepEqual(gaps("um\n\n---\n\ndois\n"), { 2: "gap", 4: "gap" });
  });
});

describe("--- then Enter", () => {
  test("after a blank line: the blank line after, the caret one line below it", () => {
    const r = enter("um\n\n---", 7);
    assert.equal(r.text, "um\n\n---\n\n");
    assert.equal(r.line, 5);
  });
  test("under a paragraph line: a blank line before as well, so it is no setext heading", () => {
    const r = enter("um\n---", 6);
    assert.equal(r.text, "um\n\n---\n\n");
    assert.equal(r.line, 5);
  });
  test("under a heading it is a rule already: nothing before", () => {
    const r = enter("# T\n---", 7);
    assert.equal(r.text, "# T\n---\n\n");
    assert.equal(r.line, 4);
  });
  test("*** and ___ get the blank line after, and none before", () => {
    assert.equal(enter("um\n\n***", 7).text, "um\n\n***\n\n");
    assert.equal(enter("um\n___", 6).text, "um\n___\n\n");
  });
  test("with text right after, it is kept apart from the caret's line", () => {
    const r = enter("um\n\n---\ndois", 7);
    assert.equal(r.text, "um\n\n---\n\n\n\ndois");
    assert.equal(r.line, 5);
  });
  test("a rule that already has its blank lines gets only the caret's place", () => {
    const r = enter("um\n\n---\n\n\n\ndois", 7);
    assert.equal(r.text, "um\n\n---\n\n\n\ndois");
    assert.equal(r.line, 5);
  });
  test("the first line of the note is left alone (it may open a frontmatter)", () => {
    assert.equal(enter("---", 3), null);
  });
  test("the frontmatter's closing line is left alone", () => {
    assert.equal(enter("---\ntitle: a\n---", 16), null);
    assert.equal(enter("---\ntitle: a\n---\n\ntexto", 16), null);
  });
  test("in a fenced code block it is only text", () => {
    assert.equal(enter("```\n---", 7), null);
  });
  test("in a table, a list item or a quote it is not a rule line", () => {
    assert.equal(enter("| a | b |\n|---|---|\n---", 22), null);
    assert.equal(enter("- ---", 5), null);
    assert.equal(enter("> ---", 5), null);
  });
  test("a longer line, or the caret not at its end, is not for it", () => {
    assert.equal(enter("um\n\n----", 8), null);
    assert.equal(enter("um\n\n--- x", 9), null);
    assert.equal(enter("um\n\n---", 6), null);
  });
  test("a selection is not for it", () => {
    const st = b.EditorState.create({ doc: "um\n\n---", selection: { anchor: 4, head: 7 }, extensions: [b.markdown()] });
    assert.equal(b.ruleEnter(st), null);
  });
});
