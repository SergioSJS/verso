// The reading view drawn block by block (leaves/note/reconcile.ts): the same
// HTML touches nothing, a change replaces only the blocks that differ, and
// what is read across blocks sends the drawing back to the whole.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const k of ["document", "Node", "Element", "HTMLElement", "MutationObserver"]) {
  Object.defineProperty(globalThis, k, { value: win[k], configurable: true, writable: true });
}
await esbuild.build({ entryPoints: ["src/leaves/note/reconcile.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/readingReconcile.test-bundle.mjs", logLevel: "error" });
const { snapshot, describes, plan, apply, crossesBlocks, scrollAnchor, keepAnchor, modeOfSig } = await import("./.bundles/readingReconcile.test-bundle.mjs");

const nodes = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return Array.from(d.childNodes);
};
const draw = (root, html) => {
  root.innerHTML = html;
  return snapshot(root);
};
/** The new drawing as paintBlocks does it: plan, (wire fresh), apply. */
const redraw = (root, blocks, html) => {
  const p = plan(blocks, nodes(html));
  const touched = apply(root, p.next, p.removed);
  return { p, touched, blocks: p.next.map((b) => ({ key: b.key, node: b.node })) };
};
const count = (n) => 1 + Array.from(n.childNodes).reduce((s, c) => s + count(c), 0);
const never = () => false;

const para = (i) => `<p data-line="${i}">Paragraph ${i} <img data-src="a${i}.png" src="verso://x/a${i}.png"></p>`;
const note = (n, tail = "") => Array.from({ length: n }, (_, i) => para(i + 1)).join("\n") + tail;

test("the same HTML touches no node", () => {
  const root = document.createElement("div");
  const html = note(120);
  const blocks = draw(root, html);
  const before = Array.from(root.childNodes);
  const seen = [];
  new MutationObserver((m) => seen.push(...m)).observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  const r = redraw(root, blocks, html);
  assert.equal(r.touched, 0);
  assert.equal(r.p.fresh.length, 0);
  assert.equal(r.p.removed.length, 0);
  assert.ok(Array.from(root.childNodes).every((n, i) => n === before[i]));
  assert.ok(describes(r.blocks, root));
});

test("typing at the end replaces only the last block", () => {
  const root = document.createElement("div");
  const blocks = draw(root, note(120));
  const before = Array.from(root.childNodes);
  const typed = note(119) + "\n<p data-line=\"120\">Paragraph 120 and more words</p>";
  const r = redraw(root, blocks, typed);
  assert.equal(r.p.fresh.length, 1);
  assert.equal(r.p.removed.length, 1);
  const now = Array.from(root.childNodes);
  for (let i = 0; i < before.length - 1; i++) assert.equal(now[i], before[i], `block ${i} is the same node`);
  assert.notEqual(now.at(-1), before.at(-1));
  assert.equal(root.lastElementChild.textContent, "Paragraph 120 and more words");
  console.log(`  whole redraw ${count(root)} nodes created; block-wise ${r.touched} nodes touched (${r.p.fresh.reduce((s, n) => s + count(n), 0)} created)`);
});

test("a paragraph inserted in the middle keeps every other node, pictures included", () => {
  const root = document.createElement("div");
  const blocks = draw(root, note(60));
  const before = Array.from(root.childNodes);
  const pics = Array.from(root.querySelectorAll("img"));
  const lines = note(60).split("\n");
  lines.splice(30, 0, "<p>Inserted by someone else</p>");
  const r = redraw(root, blocks, lines.join("\n"));
  // the paragraph and the line break the renderer writes after it
  assert.equal(r.p.fresh.filter((n) => n.nodeType === 1).length, 1);
  assert.equal(r.p.removed.length, 0);
  assert.equal(r.touched, 2);
  const now = Array.from(root.childNodes);
  assert.equal(now.length, before.length + 2);
  assert.equal(now.find((n) => n.textContent === "Inserted by someone else").nodeType, 1);
  before.forEach((n) => assert.ok(now.includes(n)));
  Array.from(root.querySelectorAll("img")).forEach((img, i) => assert.equal(img, pics[i], "the <img> is the very element"));
});

test("a block removed, and blocks reordered, are matched by what they say", () => {
  const root = document.createElement("div");
  const blocks = draw(root, "<p>a</p><p>b</p><p>c</p><p>d</p>");
  const [a, b, c, d] = Array.from(root.childNodes);
  const r = redraw(root, blocks, "<p>d</p><p>b</p><p>a</p>");
  assert.deepEqual(Array.from(root.childNodes), [d, b, a]);
  assert.deepEqual(r.p.removed, [c]);
  assert.equal(r.p.fresh.length, 0);
});

test("two equal blocks are two blocks", () => {
  const root = document.createElement("div");
  const blocks = draw(root, "<p>x</p><p>x</p>");
  const [first, second] = Array.from(root.childNodes);
  redraw(root, blocks, "<p>x</p>");
  assert.deepEqual(Array.from(root.childNodes), [first]);
  assert.ok(!second.isConnected);
});

test("a block wired into another node (a card where a code block stood) is still kept", () => {
  const root = document.createElement("div");
  let blocks = draw(root, "<p>a</p><pre><code>diagram</code></pre><p>b</p>");
  const pre = root.children[1];
  const card = document.createElement("div");
  pre.replaceWith(card);
  blocks = blocks.map((b, i) => ({ key: b.key, node: root.childNodes[i] }));
  assert.ok(describes(blocks, root));
  const r = redraw(root, blocks, "<p>a</p><pre><code>diagram</code></pre><p>b!</p>");
  assert.equal(root.children[1], card, "the card stays");
  assert.equal(r.p.fresh.length, 1);
});

test("a node that changed under the view (not the one recorded) makes the next drawing whole", () => {
  const root = document.createElement("div");
  const blocks = draw(root, "<p>a</p><p>b</p>");
  root.append(document.createElement("section"));
  assert.equal(describes(blocks, root), false);
  assert.equal(describes(null, root), false);
});

const crossing = (oldHtml, newHtml) => {
  const root = document.createElement("div");
  const p = plan(draw(root, oldHtml), nodes(newHtml));
  return crossesBlocks(p.fresh, p.removed, never);
};

test("what is read across blocks falls back to the whole drawing", () => {
  const body = "<p>one</p><p>two</p>";
  // footnote definitions, references, tables, folding callouts, bases
  assert.equal(crossing(body, body + '<div class="footnote-definition" id="note-1"><p>n</p></div>'), true);
  assert.equal(crossing(body, '<p>one <sup class="footnote-reference"><a href="#note-1">1</a></sup></p><p>two</p>'), true);
  assert.equal(crossing(body, body + "<table><tr><td>1</td></tr></table>"), true);
  assert.equal(crossing(body + "<table><tr><td>1</td></tr></table>", body), true, "a table removed shifts the others' order");
  assert.equal(crossing(body, body + '<blockquote class="callout" data-fold="+"><p>x</p></blockquote>'), true);
  assert.equal(crossing(body, body + '<pre><code class="language-base">views: []</code></pre>'), true);
  assert.equal(crossing(body + '<div class="embed-base"></div>', body), true, "a live base removed is torn down by the whole drawing");
  // an ordinary edit does not
  assert.equal(crossing(body, "<p>one</p><p>two and three</p>"), false);
  assert.equal(crossing(body, body + "<h2>New</h2><ul><li>x</li></ul><pre><code>plain</code></pre>"), false);
  // a statblock, by the caller's own rule
  const root = document.createElement("div");
  const p = plan(draw(root, body), nodes(body + "<pre><code>stats</code></pre>"));
  assert.equal(crossesBlocks(p.fresh, p.removed, () => true), true);
});

test("a secret block a reader is not given never appears, and goes when it is withdrawn", () => {
  const root = document.createElement("div");
  const writer = '<p>Open</p><blockquote class="callout secret"><p>GM only: the duke is the traitor</p></blockquote><p>Open too</p>';
  const reader = "<p>Open</p><p>Open too</p>";
  let blocks = draw(root, reader);
  assert.ok(!root.textContent.includes("traitor"));
  const a = root.children[0];
  // a later update, still the reader's projection
  blocks = redraw(root, blocks, reader + "<p>More</p>").blocks;
  assert.ok(!root.textContent.includes("traitor"));
  assert.equal(root.children[0], a);
  // the writer's view turned on and off again: the secret comes and goes with the HTML
  const p = plan(blocks, nodes(writer));
  apply(root, p.next, p.removed);
  assert.ok(root.textContent.includes("traitor"));
  blocks = p.next.map((b) => ({ key: b.key, node: b.node }));
  redraw(root, blocks, reader);
  assert.ok(!root.textContent.includes("traitor"));
});

test("the sheet stays where the reader was when blocks are put in above", () => {
  const sheet = { scrollTop: 500, getBoundingClientRect: () => ({ top: 0 }) };
  let top = 100;
  const node = { isConnected: true, getBoundingClientRect: () => ({ top, bottom: top + 20 }) };
  const root = { children: [{ getBoundingClientRect: () => ({ top: -50, bottom: -10 }) }, node] };
  const anchor = scrollAnchor(sheet, root);
  assert.equal(anchor.node, node);
  top = 340; // 240 px of new blocks above
  keepAnchor(sheet, anchor);
  assert.equal(sheet.scrollTop, 740);
  top = 340;
  keepAnchor(sheet, { node: { isConnected: false, getBoundingClientRect: () => ({ top: 0 }) }, top: 0 });
  assert.equal(sheet.scrollTop, 740, "an anchor that left the page changes nothing");
});

test("the anchor is the first block that stays, not one about to be replaced", () => {
  const sheet = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) };
  const replaced = { getBoundingClientRect: () => ({ top: 10, bottom: 30 }) };
  const kept = { getBoundingClientRect: () => ({ top: 40, bottom: 60 }) };
  const root = { children: [replaced, kept] };
  assert.equal(scrollAnchor(sheet, root).node, replaced, "without a kept set: the first visible");
  assert.equal(scrollAnchor(sheet, root, new Set([kept])).node, kept);
});

test("a change of mode (reader view, read-only) is told by the signature", () => {
  const sig = (mode, html) => `a.md\n${mode}\n${html}`;
  assert.equal(modeOfSig(sig("nw", "<p>x</p>\n<p>y</p>")), "nw");
  assert.notEqual(modeOfSig(sig("nw", "<p>x</p>")), modeOfSig(sig("no", "<p>x</p>")));
  assert.notEqual(modeOfSig(sig("nw", "x")), modeOfSig(sig("rw", "x")));
  assert.equal(modeOfSig(""), "", "nothing painted yet");
});
