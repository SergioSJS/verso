// A mention turned into a link (ADR 0089 items 2 and 3): the link written,
// the place checked against the text as it is now, and every mention of a
// note made in one text.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const esbuild = await import("esbuild");
await esbuild.build({ entryPoints: ["src/mentionLink.ts"], bundle: true, format: "esm", outfile: "test/.bundles/mentionLink.test-bundle.mjs" });
const { linkFor, placeOf, linkAll } = await import("./.bundles/mentionLink.test-bundle.mjs");

const m = (over) => ({ path: "a.md", line: 1, col: 1, text: "Porto", before: "", after: "", alias: false, table: false, secret: false, ...over });

describe("The link written for a mention", () => {
  test("the name as written: a bare link", () => {
    assert.equal(linkFor(m({}), "Porto"), "[[Porto]]");
  });
  test("another case, an alias, or a path: the text kept as the link's text", () => {
    assert.equal(linkFor(m({ text: "porto" }), "Porto"), "[[Porto|porto]]");
    assert.equal(linkFor(m({ text: "Cidade Invicta", alias: true }), "Porto"), "[[Porto|Cidade Invicta]]");
    assert.equal(linkFor(m({}), "lugares/Porto"), "[[lugares/Porto|Porto]]");
  });
  test("in a table's cell the bar is escaped", () => {
    assert.equal(linkFor(m({ text: "porto", table: true }), "Porto"), "[[Porto\\|porto]]");
    assert.equal(linkFor(m({ table: true }), "Porto"), "[[Porto]]");
  });
});

describe("Where a mention is now", () => {
  test("by line and column in characters, line endings of either kind", () => {
    const text = "Ação no\r\nAção Porto aqui.\r\n";
    const at = placeOf(text, m({ line: 2, col: 6 }));
    assert.deepEqual(at, { from: 14, to: 19 });
    assert.equal(text.slice(at.from, at.to), "Porto");
  });
  test("a character outside the basic plane counts as one column", () => {
    const text = "😀 Porto\n";
    assert.equal(text.slice(...Object.values(placeOf(text, m({ col: 3 })))), "Porto");
  });
  test("moved: the text there is not the mention's", () => {
    assert.equal(placeOf("Um Porto\n", m({ col: 1 })), null);
    assert.equal(placeOf("Porto\n", m({ line: 3 })), null);
  });
});

describe("Every mention of a note in one text", () => {
  test("made from the last to the first; a moved one left and said", () => {
    const text = "Porto e porto.\nPorto!\n";
    const all = [m({ col: 1 }), m({ col: 9, text: "porto" }), m({ line: 2, col: 2 })];
    const r = linkAll(text, all, (x) => linkFor(x, "Porto"));
    assert.equal(r.after, "[[Porto]] e [[Porto|porto]].\nPorto!\n");
    assert.equal(r.linked.length, 2);
    assert.equal(r.moved.length, 1);
  });
});
