// The data diagram's model, parsers, layout, state and search (ADR 0106),
// with no DOM and no CodeMirror; and the hostile inputs the ADR names: a
// document nested a hundred thousand levels deep, a YAML that expands into
// millions of values, a large JSON, an XML with a DOCTYPE and entities.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/datagraph/entry.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: "test/.bundles/datagraph.test-bundle.mjs",
  logLevel: "error",
});
const D = await import("./.bundles/datagraph.test-bundle.mjs");

const rows = (t, id) => t.nodes[id].rows.map((r) => `${r.key}=${r.text}`);
const ms = (f) => {
  const t0 = performance.now();
  const r = f();
  return [r, Math.round(performance.now() - t0)];
};

describe("JSON", () => {
  const text = '{"npcs":[{"name":"Rowan","hp":12},{"name":"Mira","hp":9}],"big":12345678901234567890,"ok":true,"none":null,"e":{}}';
  const t = D.parse(text, "json");
  test("a box per object and array, a row per member", () => {
    assert.equal(t.error, null);
    assert.equal(t.roots.length, 1);
    assert.deepEqual(rows(t, 0), ["npcs=[2]", "big=12345678901234567890", "ok=true", "none=null", "e={0}"]);
    assert.equal(t.nodes.length, 5); // root, npcs, two npcs, e
  });
  test("a number is kept as written", () => {
    assert.equal(t.nodes[0].rows[1].text, "12345678901234567890");
    assert.equal(t.nodes[0].rows[1].type, "number");
    assert.equal(D.parse('{"a":1.50e+3}', "json").nodes[0].rows[0].text, "1.50e+3");
  });
  test("each value knows where it sits in the text", () => {
    const hp = t.nodes[2].rows[1];
    assert.equal(text.slice(hp.from, hp.to), "12");
    assert.equal(text.slice(hp.keyFrom, hp.keyFrom + 4), '"hp"');
    const npcs = t.nodes[1];
    assert.equal(text.slice(npcs.from, npcs.to), '[{"name":"Rowan","hp":12},{"name":"Mira","hp":9}]');
  });
  test("paths are written as a query does", () => {
    assert.equal(D.pathOf(t, 0), "$");
    assert.equal(D.pathOf(t, 1), "$.npcs");
    assert.equal(D.pathOf(t, 3), "$.npcs[1]");
    assert.equal(D.rowPath(t, 3, 0), "$.npcs[1].name");
    const odd = D.parse('{"a b":{"c":1}}', "json");
    assert.equal(D.pathOf(odd, 1), '$["a b"]');
  });
  test("a path resolves back to its box", () => {
    assert.equal(D.idOf(t, D.keyOf(t, 3)), 3);
    assert.equal(D.resolve(t, ["npcs", "0"]), 2);
    assert.equal(D.resolve(t, ["nope"]), -1);
  });
  test("the box and row at a text offset", () => {
    const at = text.indexOf("Mira");
    const w = D.locate(t, at);
    assert.deepEqual(w, { node: 3, row: 0 });
    assert.deepEqual(D.locate(t, text.indexOf("12345")), { node: 0, row: 1 });
  });
  test("a root that is one value is a box with one row", () => {
    assert.deepEqual(rows(D.parse("42", "json"), 0), ["=42"]);
    assert.deepEqual(rows(D.parse('"hi"', "json"), 0), ["=hi"]);
  });
  test("strings keep their escapes decoded; keys too", () => {
    const s = D.parse('{"a\\nb":"x\\u00e9\\"y"}', "json");
    assert.equal(s.nodes[0].rows[0].key, "a\nb");
    assert.equal(s.nodes[0].rows[0].text, 'xé"y');
  });
  test("an error names its place and keeps what was read before it", () => {
    const bad = '{"a":1,"b":[1,2,}';
    const e = D.parse(bad, "json");
    assert.ok(e.error);
    assert.ok(e.error.from >= 15 && e.error.from <= 17, `at ${e.error.from}`);
    assert.equal(e.nodes[0].rows[0].text, "1");
    for (const worse of ["", "{", '{"a"}', '{"a":}', "[1 2]", "{'a':1}", '{"a":1} x', "tru", '{"a":01}']) assert.ok(D.parse(worse, "json").error, worse);
  });
  test("JSONC allows comments and trailing commas; JSON does not", () => {
    const c = '// note\n{\n  /* x */ "a": 1, // one\n  "b": [1,2,],\n}\n';
    const t2 = D.parse(c, "jsonc");
    assert.equal(t2.error, null);
    assert.deepEqual(rows(t2, 0), ["a=1", "b=[2]"]);
    assert.ok(D.parse(c, "json").error);
  });
});

describe("JSON Lines", () => {
  test("each line is a root; a bad line is an error row, not the end", () => {
    const text = '{"a":1}\n\nnot json\n{"b":[1,2]}\n';
    const t = D.parse(text, "jsonl");
    assert.equal(t.error, null);
    assert.equal(t.roots.length, 3);
    assert.deepEqual(rows(t, t.roots[0]), ["a=1"]);
    assert.equal(t.nodes[t.roots[1]].rows[0].type, "error");
    assert.equal(t.nodes[t.roots[1]].rows[0].text, 'Unexpected "not"');
    assert.deepEqual(rows(t, t.roots[2]), ["b=[2]"]);
    assert.equal(D.pathOf(t, t.roots[2]), "#3$");
  });
  test("ranges are those of the whole text", () => {
    const text = '{"a":1}\n{"b":22}\n';
    const t = D.parse(text, "jsonl");
    const r = t.nodes[t.roots[1]].rows[0];
    assert.equal(text.slice(r.from, r.to), "22");
  });
});

describe("YAML", () => {
  test("documents are roots; anchors, aliases, tags", () => {
    const text = "name: Rowan\nhp: 12\ntags: &t\n  - a\n  - b\nagain: *t\nid: !!str 5\n---\nsecond: true\n";
    const t = D.parse(text, "yaml");
    assert.equal(t.error, null);
    assert.equal(t.roots.length, 2);
    const root = t.nodes[t.roots[0]];
    assert.deepEqual(root.rows.map((r) => r.key), ["name", "hp", "tags", "again", "id"]);
    const tags = t.nodes[root.kids[0]];
    assert.equal(tags.anchor, "t");
    // The alias is a line to the box of its anchor, not a copy.
    const again = root.rows[3];
    assert.equal(again.type, "alias");
    assert.equal(again.link, tags.id);
    assert.equal(again.child, -1);
    assert.equal(root.rows[4].tag, "!!str");
    assert.deepEqual(rows(t, t.roots[1]), ["second=true"]);
  });
  test("numbers keep their source text; ranges point at the text", () => {
    const text = "a: 0x1F\nb: 1.0\nc: 12345678901234567890\n";
    const t = D.parse(text, "yaml");
    assert.deepEqual(rows(t, 0), ["a=0x1F", "b=1.0", "c=12345678901234567890"]);
    const c = t.nodes[0].rows[2];
    assert.equal(text.slice(c.from, c.to), "12345678901234567890");
  });
  test("an error is told, with the document before it", () => {
    const t = D.parse("a: 1\nb: [1, 2\n", "yaml");
    assert.ok(t.error);
    assert.equal(t.nodes[0].rows[0].text, "1");
  });
});

describe("TOML", () => {
  const text = 'title = "Campaign"\nhp = 12\n[party.rowan]\nclass = "fighter"\nitems = ["sword", { n = 2, kind = "potion" }]\n[[npcs]]\nname = "A"\n[[npcs]]\nname = "B"\ndate = 1979-05-27T07:32:00Z\n';
  const t = D.parse(text, "toml");
  test("tables, arrays of tables, inline tables, arrays", () => {
    assert.equal(t.error, null);
    assert.deepEqual(rows(t, 0), ["title=Campaign", "hp=12", "party={1}", "npcs=[2]"]);
    const npcs = t.nodes.find((n) => n.label === "npcs");
    assert.equal(npcs.shape, "array");
    assert.equal(npcs.kids.length, 2);
    assert.deepEqual(rows(t, npcs.kids[1]), ["name=B", "date=1979-05-27T07:32:00Z"]);
    const items = t.nodes.find((n) => n.label === "items");
    assert.deepEqual(rows(t, items.id), ["0=sword", "1={2}"]);
    assert.equal(D.pathOf(t, items.id), "$.party.rowan.items");
  });
  test("values know their place", () => {
    const r = t.nodes[0].rows[1];
    assert.equal(text.slice(r.from, r.to), "12");
  });
  test("an error names its place", () => {
    const e = D.parse("a = 1\nb 2\n", "toml");
    assert.ok(e.error);
    assert.equal(e.nodes[0].rows[0].text, "1");
  });
});

describe("XML", () => {
  test("elements are boxes, attributes @rows, text #text; a text-only element is a row", () => {
    const text = '<?xml version="1.0"?>\n<party size="2"><npc id="1"><name>Rowan &amp; co</name><hp>12</hp></npc><npc id="2"/><!-- c --><note><![CDATA[a<b]]></note></party>';
    const t = D.parse(text, "xml");
    assert.equal(t.error, null);
    assert.deepEqual(rows(t, 0), ["@size=2", "npc={3}", "npc={1}", "note=a<b"]);
    const npc = t.nodes[1];
    assert.deepEqual(rows(t, npc.id), ["@id=1", "name=Rowan & co", "hp=12"]);
    const hp = npc.rows[2];
    assert.equal(text.slice(hp.from, hp.to), "<hp>12</hp>");
    assert.equal(t.nodes[2].label, "npc[1]");
  });
  test("a DOCTYPE is not read and an entity is never expanded", () => {
    const text = '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;"><!ENTITY x SYSTEM "file:///etc/passwd">]><a>&lol2; &x; &#65; &#x42; &lt;</a>';
    const t = D.parse(text, "xml");
    assert.equal(t.error, null);
    assert.equal(t.nodes[0].rows[0].text, "&lol2; &x; A B <");
    assert.equal(t.nodes.length, 1);
  });
  test("a mismatched or unclosed tag is an error with a place", () => {
    assert.ok(D.parse("<a><b></a>", "xml").error);
    const open = D.parse("<a><b>", "xml");
    assert.ok(open.error);
    assert.ok(open.nodes.length >= 1);
    assert.ok(D.parse("<a/><b/>", "xml").error);
    assert.ok(D.parse("text", "xml").error);
  });
});

describe("CSV and TSV", () => {
  test("a list of records keyed by the header", () => {
    const text = 'name,hp,note\nRowan,12,"says ""hi"",\nand more"\nMira,9\n';
    const t = D.parse(text, "csv");
    assert.equal(t.error, null);
    assert.equal(t.nodes[0].shape, "array");
    assert.equal(t.nodes[0].kids.length, 2);
    assert.deepEqual(rows(t, 1), ["name=Rowan", "hp=12", 'note=says "hi",\nand more']);
    assert.deepEqual(rows(t, 2), ["name=Mira", "hp=9"]);
    assert.equal(D.pathOf(t, 2), "$[1]");
    const cell = t.nodes[1].rows[1];
    assert.equal(text.slice(cell.from, cell.to), "12");
  });
  test("tabs, and semicolons when the header has more of them", () => {
    assert.deepEqual(rows(D.parse("a\tb\n1\t2\n", "tsv"), 1), ["a=1", "b=2"]);
    assert.deepEqual(rows(D.parse("a;b\n1;2\n", "csv"), 1), ["a=1", "b=2"]);
  });
  test("a quote never closed is an error", () => {
    assert.ok(D.parse('a,b\n"x,y\n', "csv").error);
  });
});

/** A tree with `n` objects under an array, each with a few rows. */
const people = (n) => D.parse(JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `P${i}`, age: i, tags: ["a", "b"] }))), "json");

describe("layout", () => {
  const state = (t) => new D.DiagramModel(t);
  test("children stand right of their parent, in order, none over another; the parent is centred on them", () => {
    const t = D.parse('{"a":{"x":1},"b":{"y":[{"z":1},{"z":2}]},"c":{"w":3}}', "json");
    const m = state(t);
    m.setBase({ kind: "depth", depth: 99 });
    const l = m.layout();
    for (const id of l.order) {
      const n = t.nodes[id];
      if (n.parent >= 0) assert.ok(l.x[id] >= l.x[n.parent] + l.w[n.parent], `box ${id} is right of its parent`);
    }
    // No two boxes overlap.
    const ids = [...l.order];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const apart = l.x[a] + l.w[a] <= l.x[b] || l.x[b] + l.w[b] <= l.x[a] || l.y[a] + l.h[a] <= l.y[b] || l.y[b] + l.h[b] <= l.y[a];
        assert.ok(apart, `boxes ${a} and ${b} overlap`);
      }
    // The root is centred on its three children.
    const kids = t.nodes[0].kids;
    const top = l.y[kids[0]];
    const bottom = l.y[kids.at(-1)] + l.h[kids.at(-1)];
    assert.ok(Math.abs(l.y[0] + l.h[0] / 2 - (top + bottom) / 2) < 40);
  });
  test("top to bottom swaps the axes", () => {
    const t = D.parse('{"a":{"x":1},"b":{"y":1}}', "json");
    const m = state(t);
    m.dir = "tb";
    const l = m.layout();
    for (const k of t.nodes[0].kids) assert.ok(l.y[k] >= l.y[0] + l.h[0]);
    assert.ok(l.x[t.nodes[0].kids[1]] > l.x[t.nodes[0].kids[0]]);
  });
  test("a folded box hides what is under it and shrinks to its title bar", () => {
    const t = D.parse('{"a":{"x":{"y":1}}}', "json");
    const m = state(t);
    m.setBase({ kind: "depth", depth: 99 });
    assert.equal(m.layout().order.length, 3);
    m.toggle(1);
    const l = m.layout();
    assert.equal(l.order.length, 2);
    assert.equal(l.h[1], D.HEAD_H);
    assert.equal(l.at[2], -1);
  });
  test("a box dragged carries what hangs under it; Alt moves it alone", () => {
    const t = D.parse('{"a":{"x":{"y":1}}}', "json");
    const m = state(t);
    m.setBase({ kind: "depth", depth: 99 });
    const before = m.layout();
    m.move(1, 100, 40);
    const moved = m.layout();
    for (const id of [1, 2]) {
      assert.equal(moved.x[id] - before.x[id], 100);
      assert.equal(moved.y[id] - before.y[id], 40);
    }
    assert.equal(moved.x[0], before.x[0]);
    m.rearrange();
    m.setBase({ kind: "depth", depth: 99 });
    const b2 = m.layout();
    m.move(1, 100, 40, true);
    const alone = m.layout();
    assert.equal(alone.x[1] - b2.x[1], 100);
    assert.equal(alone.x[2], b2.x[2]);
    assert.equal(alone.y[2], b2.y[2]);
  });
  test("more rows than a page show a page and ask for more", () => {
    const t = D.parse(JSON.stringify(Array.from({ length: 250 }, (_, i) => i)), "json");
    const m = state(t);
    let l = m.layout();
    assert.equal(l.rowsShown[0], D.ROW_PAGE);
    m.showMore(0);
    l = m.layout();
    assert.equal(l.rowsShown[0], 250);
  });
});

describe("what a diagram remembers", () => {
  test("it opens with the first levels, to about 300 boxes; the rest folded", () => {
    const t = people(500);
    const m = new D.DiagramModel(t);
    const l = m.layout();
    // The array's first page of rows is its boxes; the tree is not drawn deeper than the budget.
    assert.ok(l.order.length <= D.OPEN_BOXES + D.ROW_PAGE, `${l.order.length} boxes`);
    assert.equal(m.folded[0], 0);
  });
  test("a small file opens whole", () => {
    const t = D.parse('{"a":{"b":{"c":{"d":1}}}}', "json");
    const m = new D.DiagramModel(t);
    assert.equal(m.layout().order.length, 4);
  });
  test("read again, folds, pages and moves stay by path; a new box takes the default", () => {
    const t1 = D.parse('{"a":{"x":{"y":1}},"b":{"z":1}}', "json");
    const m = new D.DiagramModel(t1);
    m.setBase({ kind: "depth", depth: 99 });
    m.setFolded(1, true);
    m.move(3, 10, 20);
    const t2 = D.parse('{"c":[1],"a":{"x":{"y":2}},"b":{"z":1,"w":{"q":1}}}', "json");
    m.adopt(t2);
    const a = D.resolve(t2, ["a"]);
    const b = D.resolve(t2, ["b"]);
    assert.equal(m.folded[a], 1);
    assert.deepEqual(m.own.get(b), [10, 20]);
    assert.equal(m.tree, t2);
  });
  test("snapshot and restore, by path, survive a new tree", () => {
    const text = '{"a":{"x":{"y":1}},"b":{"z":1}}';
    const m = new D.DiagramModel(D.parse(text, "json"));
    m.setFolded(2, true);
    m.move(3, 5, 6);
    m.dir = "tb";
    const saved = JSON.parse(JSON.stringify(m.snapshot()));
    const m2 = new D.DiagramModel(D.parse(text, "json"));
    m2.restore(saved);
    assert.equal(m2.dir, "tb");
    assert.equal(m2.folded[2], 1);
    assert.deepEqual(m2.own.get(3), [5, 6]);
  });
  test("a kept state that is not the shape we wrote is ignored, never thrown on", () => {
    const m = new D.DiagramModel(D.parse('{"a":{"x":1}}', "json"));
    for (const bad of [{ folds: 7, moves: "x" }, { folds: [null, { p: 5, f: 1 }, { p: "0", f: 9 }], moves: [{ p: 1, d: [1, 2] }, { p: "0", d: [Infinity, 1] }, { p: "0" }] }, { base: { kind: "depth", depth: "deep" } }]) {
      assert.doesNotThrow(() => m.restore(bad));
    }
    assert.equal(m.own.size, 0);
  });
  test("arranging again drops moves and folds", () => {
    const m = new D.DiagramModel(D.parse('{"a":{"x":1}}', "json"));
    m.move(1, 5, 5);
    m.setFolded(1, true);
    m.rearrange();
    assert.equal(m.own.size, 0);
    assert.equal(m.folded[1], 0);
  });
  test("the per-device store keeps files and the last view of a type", () => {
    const mem = new Map();
    const s = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    assert.equal(D.lastView("json", s), "text");
    D.setLastView("json", "diagram", s);
    assert.equal(D.lastView("json", s), "diagram");
    assert.equal(D.lastView("yaml", s), "text");
    assert.equal(D.readFile("f", "a.json", s), null);
    const saved = { dir: "lr", base: { kind: "auto" }, folds: [], moves: [{ p: "0", d: [1, 2] }] };
    D.writeFile("f", "a.json", saved, s);
    assert.deepEqual(D.readFile("f", "a.json", s), saved);
    assert.equal(D.readFile("g", "a.json", s), null);
    D.forgetFile("f", "a.json", s);
    assert.equal(D.readFile("f", "a.json", s), null);
    assert.equal(D.lastView("json", { getItem: () => "garbage{", setItem() {} }), "text");
  });
  test("the store keeps only the most recent files", () => {
    const mem = new Map();
    const s = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    for (let i = 0; i < 230; i++) D.writeFile("f", `f${i}.json`, { dir: "lr", base: { kind: "auto" }, folds: [], moves: [] }, s, i);
    assert.equal(D.readFile("f", "f0.json", s), null);
    assert.ok(D.readFile("f", "f229.json", s));
  });
});

describe("search", () => {
  const t = D.parse('{"party":[{"name":"Rowan","gear":{"weapon":"sword"}},{"name":"Mira","gear":{"weapon":"bow"}}],"Name":"top"}', "json");
  test("finds keys and values anywhere, no case, in the data's order", () => {
    const f = D.searchTree(t, "name");
    assert.equal(f.matches.length, 3);
    assert.equal(D.searchTree(t, "SWORD").matches.length, 1);
    assert.equal(D.searchTree(t, "zzz").matches.length, 0);
    assert.equal(D.searchTree(t, "  ").matches.length, 0);
  });
  test("a match in a folded branch is reached by unfolding the way to it", () => {
    const m = new D.DiagramModel(t);
    m.setBase({ kind: "depth", depth: 1 });
    const hit = D.searchTree(t, "sword").matches[0];
    assert.equal(m.layout().at[hit.node], -1);
    m.revealRow(hit.node, hit.row);
    const l = m.layout();
    assert.ok(l.at[hit.node] >= 0);
    assert.equal(m.folded[hit.node], 0);
  });
  test("a match past the first page opens the rows to it", () => {
    const big = D.parse(JSON.stringify(Array.from({ length: 300 }, (_, i) => `item ${i}`)), "json");
    const m = new D.DiagramModel(big);
    const hit = D.searchTree(big, "item 250").matches[0];
    m.revealRow(hit.node, hit.row);
    assert.ok(m.layout().rowsShown[0] > 250);
  });
});

describe("Save as board", () => {
  test("a text card for each drawn box, a line for each drawn line", () => {
    const t = D.parse('{"a":{"x":1},"b":[1,2],"c":"text"}', "json");
    const m = new D.DiagramModel(t);
    const l = m.layout();
    const doc = D.boardOf(t, l, "lr", (id) => (id === 0 ? "$" : t.nodes[id].label));
    assert.equal(doc.nodes.length, 3);
    assert.equal(doc.edges.length, 2);
    assert.match(doc.nodes[0].text, /^\*\*\$\*\*/);
    assert.deepEqual(doc.edges.map((e) => e.label), ["a", "b"]);
    assert.equal(doc.nodes[1].x, Math.round(l.x[1]));
    m.toggle(1);
    assert.equal(D.boardOf(t, m.layout(), "lr", () => "t").nodes.length, 3);
    m.toggle(0);
    assert.equal(D.boardOf(t, m.layout(), "lr", () => "t").nodes.length, 1);
  });
});

describe("hostile inputs", () => {
  test("100,000 levels of nesting do not overflow the stack", () => {
    const n = 100_000;
    for (const text of ["[".repeat(n) + "]".repeat(n), '{"a":'.repeat(n) + "1" + "}".repeat(n)]) {
      const [t, parseMs] = ms(() => D.parse(text, "json"));
      assert.equal(t.error, null);
      assert.equal(t.nodes.length, n);
      const [m, openMs] = ms(() => new D.DiagramModel(t));
      const [l, layMs] = ms(() => m.layout());
      assert.ok(l.order.length <= D.OPEN_BOXES + 2);
      m.setBase({ kind: "depth", depth: Number.MAX_SAFE_INTEGER });
      const [all, allMs] = ms(() => m.layout());
      assert.equal(all.order.length, n);
      const deep = t.nodes.length - 1;
      const [path] = ms(() => D.pathOf(t, deep));
      assert.ok(path.length > n);
      assert.equal(D.idOf(t, D.keyOf(t, deep)), deep);
      assert.ok(D.searchTree(t, "1").matches.length >= 0);
      const [board] = ms(() => D.boardOf(t, all, "lr", () => "x"));
      assert.equal(board.nodes.length, n);
      console.log(`  100k levels: parse ${parseMs} ms, open ${openMs} ms, layout ${layMs} ms, layout all ${allMs} ms`);
    }
  });
  test("deep TOML arrays, XML elements and YAML do not take the page down", () => {
    const n = 20_000;
    assert.equal(D.parse("a = " + "[".repeat(n) + "]".repeat(n) + "\n", "toml").error, null);
    assert.equal(D.parse("<a>".repeat(n) + "</a>".repeat(n), "xml").error, null);
    // The yaml library itself recurses: a nesting past the bound never reaches it.
    const y = D.parse("[".repeat(200_000) + "]".repeat(200_000), "yaml");
    assert.equal(y.error?.message, "The YAML nests too deeply to draw");
    assert.equal(y.nodes.length, 0);
  });
  test("YAML up to the depth bound is drawn, past it is refused before the library recurses", () => {
    const n = D.YAML_MAX_DEPTH;
    for (const [shape, at] of [
      ["flow", (k) => "[".repeat(k) + "]".repeat(k)],
      ["maps", (k) => "{a: ".repeat(k) + "1" + "}".repeat(k)],
      ["compact", (k) => "- ".repeat(k / 2) + "x"],
      ["block", (k) => Array.from({ length: k / 2 }, (_, i) => "  ".repeat(i) + "a:").join("\n") + " 1"],
    ]) {
      assert.equal(D.parse(at(n), "yaml").error, null, `${shape} at the bound`);
      assert.equal(D.parse(at(n + 4), "yaml").error?.message, "The YAML nests too deeply to draw", `${shape} past it`);
    }
  });
  test("the depth bound skips quoted text and comments, and an apostrophe is not a quote", () => {
    assert.equal(D.yamlDepthBound('a: "[[[[" # {{{{\nb: \'[[\'\' x\''), 0);
    assert.equal(D.yamlDepthBound("name: Rowan's sword\nlist: [[1]]"), 2);
    assert.equal(D.yamlDepthBound("- - [x]"), 5);
  });
  test("a YAML 'billion laughs' draws a few boxes", () => {
    let text = 'a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]\n';
    let prev = "a";
    for (let i = 1; i < 10; i++) {
      const name = String.fromCharCode(97 + i);
      text += `${name}: &${name} [${Array.from({ length: 9 }, () => `*${prev}`).join(",")}]\n`;
      prev = name;
    }
    const [t, took] = ms(() => D.parse(text, "yaml"));
    assert.equal(t.error, null);
    assert.ok(t.nodes.length <= 12, `${t.nodes.length} boxes`);
    const [m] = ms(() => new D.DiagramModel(t));
    assert.ok(m.layout().order.length <= 12);
    assert.ok(took < 2000, `${took} ms`);
    // The last name's nine members are lines to the box before it.
    const last = t.nodes[t.nodes.length - 1];
    assert.ok(last.rows.every((r) => r.type === "alias" && r.link >= 0));
  });
  test("a 5 MB JSON lays out in reasonable time", () => {
    const items = [];
    let size = 0;
    for (let i = 0; size < 5 * 1024 * 1024; i++) {
      const o = { id: i, name: `Person number ${i}`, tags: ["alpha", "beta", "gamma"], stats: { hp: i % 97, ac: 10 + (i % 9), notes: "x".repeat(60) }, active: i % 2 === 0, ratio: i / 7 };
      const s = JSON.stringify(o);
      size += s.length + 1;
      items.push(o);
    }
    const text = JSON.stringify(items);
    assert.ok(text.length >= 5 * 1024 * 1024);
    const [t, parseMs] = ms(() => D.parse(text, "json"));
    assert.equal(t.error, null);
    const [m, openMs] = ms(() => new D.DiagramModel(t));
    const [l, layMs] = ms(() => m.layout());
    const [found, searchMs] = ms(() => D.searchTree(t, "number 4242"));
    m.setBase({ kind: "depth", depth: Number.MAX_SAFE_INTEGER });
    const [, allMs] = ms(() => m.layout());
    const [, foldMs] = ms(() => {
      m.toggle(0);
      return m.layout();
    });
    console.log(`  5 MB JSON (${t.nodes.length} boxes): parse ${parseMs} ms, first open ${openMs} ms, layout ${layMs} ms (${l.order.length} boxes), search ${searchMs} ms (${found.matches.length}), unfold all + layout ${allMs} ms, fold + layout ${foldMs} ms`);
    assert.ok(parseMs < 8000 && layMs < 2000 && searchMs < 3000, "reasonable time");
    assert.ok(found.matches.length >= 1);
  });
  test("keys and values are text: markup in them is only text to the model", () => {
    const t = D.parse('{"<img src=x onerror=alert(1)>":"<script>alert(1)</script>"}', "json");
    assert.equal(t.nodes[0].rows[0].key, "<img src=x onerror=alert(1)>");
    assert.equal(t.nodes[0].rows[0].text, "<script>alert(1)</script>");
  });
});

describe("the parsers' messages in pt-BR", () => {
  const bad = { json: '{"a": ', jsonc: '{"a" 1}', toml: "a = ", xml: "<a><b></a>", csv: '"x', yaml: "a: [1" };
  for (const [format, text] of Object.entries(bad)) {
    test(`${format}: the message of a text that does not parse is told in pt-BR`, () => {
      const e = D.parse(text, format).error;
      assert.ok(e, "it should not parse");
      if (format !== "yaml") assert.notEqual(D.parseErrorPt(e.message), e.message, e.message);
    });
  }
  test("a YAML nested past the library's stack says so in our words", () => {
    const e = D.parse("[".repeat(200000) + "]".repeat(200000), "yaml").error;
    assert.equal(e?.message, "The YAML nests too deeply to draw");
  });
  test("a message with a name or a snippet keeps it", () => {
    assert.equal(D.parseErrorPt('Unexpected "foo"'), 'Inesperado "foo"');
    assert.equal(D.parseErrorPt("</b> closes <a>"), "</b> fecha <a>");
    assert.equal(D.parseErrorPt("something else"), "something else");
  });
});

describe("review I5: YAML aliases resolve in linear time", () => {
  test("aliases grow linearly: ten times the aliases cost about ten times, not a hundred", () => {
    // A ratio, not a wall-clock bound: the machine's load moves both runs
    // alike (the rule for timing tests decided on 2026-10-10). Quadratic
    // resolution made 10x the aliases cost ~100x.
    const doc = (n) => "base: &a x\nlist:\n" + "  - *a\n".repeat(n);
    D.parse(doc(2_000), "yaml"); // warm the parser up
    // The fastest of three runs each: a single run caught a load spike on a
    // busy machine (2026-10-31: 10k 87 ms, 100k 3130 ms); the bound is unchanged.
    const best = (n) => {
      let out = null;
      for (let i = 0; i < 3; i++) {
        const [r, took] = ms(() => D.parse(doc(n), "yaml"));
        if (!out || took < out[1]) out = [r, took];
      }
      return out;
    };
    const [, small] = best(10_000);
    const [t, large] = best(100_000);
    assert.equal(t.error, null);
    assert.equal(t.nodes[1].rows[0].text, "*a = x");
    assert.ok(large < Math.max(small, 1) * 35, `10k: ${small} ms, 100k: ${large} ms`);
  });
  test("an anchor on a box still gets a line, and a redefined anchor resolves to the nearest before", () => {
    const t = D.parse("a: &x [1]\nb: *x\nc: &x [2]\nd: *x\n", "yaml");
    const root = t.nodes[0];
    const b = root.rows.find((r) => r.key === "b");
    const d = root.rows.find((r) => r.key === "d");
    assert.equal(b.link, 1);
    assert.equal(d.link, 2);
  });
});

describe("review I6: a box cap", () => {
  const many = (n) => "[" + "{},".repeat(n - 1) + "{}]";
  test("at the cap the diagram is built", () => {
    const t = D.parse(many(D.MAX_BOXES - 1), "json");
    assert.equal(t.error, null);
    assert.equal(t.tooMany, undefined);
    assert.equal(t.nodes.length, D.MAX_BOXES);
  });
  test("past the cap no diagram is built and the tree says why", () => {
    for (const [text, format] of [
      [many(D.MAX_BOXES), "json"],
      ["- {}\n".repeat(D.MAX_BOXES), "yaml"],
      ["a\n" + "1\n".repeat(D.MAX_BOXES), "csv"],
      ["<a>" + "<b><c/></b>".repeat(D.MAX_BOXES) + "</a>", "xml"],
      ["[[a]]\n".repeat(D.MAX_BOXES), "toml"],
    ]) {
      const t = D.parse(text, format);
      assert.equal(t.tooMany, true, format);
      assert.equal(t.nodes.length, 0, format);
    }
  });
});

describe("review I6: a saved board is capped", () => {
  test("a board of more than MAX_BOARD_CARDS cards does not fit", () => {
    assert.ok(D.MAX_BOARD_CARDS <= D.MAX_BOXES);
    const doc = (n) => ({ nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })), edges: [] });
    assert.equal(D.boardFits(doc(D.MAX_BOARD_CARDS)), true);
    assert.equal(D.boardFits(doc(D.MAX_BOARD_CARDS + 1)), false);
  });
});

describe("review M7: an inherited name is no entity", () => {
  test("&constructor; and &toString; stay as written; the five predefined ones decode", () => {
    const t = D.parse("<a>&constructor; &toString; &__proto__; &lt;&amp;&gt;&quot;&apos;</a>", "xml");
    assert.equal(t.error, null);
    const text = JSON.stringify(t.nodes[0].rows);
    assert.ok(text.includes("&constructor; &toString; &__proto__; <&>\\\"'"), text);
  });
});

describe("review M8: Save as board writes data as literal text", () => {
  const board = (text, format) => {
    const t = D.parse(text, format);
    const m = new D.DiagramModel(t);
    return D.boardOf(t, m.layout(), "lr", (id) => (id === 0 ? "$" : t.nodes[id].label));
  };
  test("a cell with an image or a wikilink is a code span, not an embed or a link", () => {
    const doc = board("name,pic\nRowan,![](https://t.example/x.png)\nMira,[[Secret]] and ![[Img.png]]\n", "csv");
    const text = doc.nodes.map((n) => n.text).join("\n");
    assert.ok(text.includes("`![](https://t.example/x.png)`"), text);
    assert.ok(text.includes("`[[Secret]] and ![[Img.png]]`"), text);
    assert.ok(!/(^|[^`])!\[\]\(/.test(text.replace(/`[^`]*`/g, "")), "nothing active outside a code span");
  });
  test("a key or value with backticks gets a longer fence; the title is escaped", () => {
    const doc = board(JSON.stringify({ "a`b": "x``y", "[[k]]": { z: 1 } }), "json");
    assert.ok(doc.nodes[0].text.includes("``a`b`` ```x``y```"), doc.nodes[0].text);
    assert.ok(doc.nodes[0].text.startsWith("**$**"), "the root's $ stays");
    assert.ok(doc.nodes[1].text.startsWith("**\\[\\[k\\]\\]**"), doc.nodes[1].text);
  });
});

describe("review M13: the per-device store survives a full storage", () => {
  const big = (n) => ({ dir: "lr", base: { kind: "auto" }, folds: [], moves: Array.from({ length: n }, (_, i) => ({ p: String(i), d: [1, 2] })) });
  test("a quota error drops the oldest entries and the newest is still kept", () => {
    const mem = new Map();
    // A storage that holds at most 20 000 characters in all, as a full one would.
    const s = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        const total = [...mem].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + v.length;
        if (total > 20_000) throw new Error("QuotaExceededError");
        mem.set(k, v);
      },
      removeItem: (k) => mem.delete(k),
    };
    for (let i = 0; i < 40; i++) D.writeFile("f", `f${i}.json`, big(40), s, i);
    assert.ok(D.readFile("f", "f39.json", s), "the newest is kept");
    assert.equal(D.readFile("f", "f0.json", s), null, "the oldest went to make room");
  });
  test("one file larger than the whole storage loses only itself", () => {
    const mem = new Map();
    const s = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > 5_000) throw new Error("QuotaExceededError");
        mem.set(k, v);
      },
      removeItem: (k) => mem.delete(k),
    };
    D.writeFile("f", "small.json", big(2), s, 1);
    D.writeFile("f", "huge.json", big(2000), s, 2);
    assert.ok(D.readFile("f", "small.json", s), "other files keep saving");
    D.writeFile("f", "small2.json", big(2), s, 3);
    assert.ok(D.readFile("f", "small2.json", s));
  });
});
