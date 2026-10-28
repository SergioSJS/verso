// The log keeps the cards it drew (src/table/keep.ts): a roll arriving draws one card, the others stay.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/table/keep.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/tableKeep.test-bundle.mjs", logLevel: "error" });
const k = await import("./.bundles/tableKeep.test-bundle.mjs");

test("an unchanged entry keeps its card; a changed one is drawn again", () => {
  const c = new k.Cards();
  let made = 0;
  const make = () => ({ n: ++made });
  const a = c.card("1", k.signature({ id: "1", row: null }, "x"), make);
  assert.equal(c.card("1", k.signature({ id: "1", row: null }, "x"), make), a);
  assert.equal(made, 1);
  const b = c.card("1", k.signature({ id: "1", row: "Lobos" }, "x"), make);
  assert.notEqual(b, a);
  assert.equal(made, 2);
});

test("a new roll draws one card and leaves the others", () => {
  const c = new k.Cards();
  let made = 0;
  const draw = (ids) => ids.map((id) => c.card(id, k.signature({ id }, ""), () => ({ id, n: ++made })));
  const before = draw(["1", "2", "3"]);
  const after = draw(["1", "2", "3", "4"]);
  assert.equal(made, 4);
  assert.deepEqual(after.slice(0, 3), before);
});

test("cards of entries gone are dropped and handed back", () => {
  const c = new k.Cards();
  const a = c.card("1", "s", () => ({}));
  c.card("2", "s", () => ({}));
  assert.deepEqual(c.prune(new Set(["2"])), [a]);
});

// A tiny stand-in for the DOM parts syncChildren uses.
function fake(names) {
  const p = { kids: [], firstElementChild: null };
  const link = () => {
    p.kids.forEach((n, i) => (n.nextElementSibling = p.kids[i + 1] ?? null));
    p.firstElementChild = p.kids[0] ?? null;
  };
  const mk = (name) => ({ name, nextElementSibling: null, remove() { p.kids = p.kids.filter((x) => x !== this); link(); } });
  p.insertBefore = (n, ref) => {
    p.kids = p.kids.filter((x) => x !== n);
    const i = ref ? p.kids.indexOf(ref) : p.kids.length;
    p.kids.splice(i, 0, n);
    link();
  };
  p.kids = names.map(mk);
  link();
  p.mk = mk;
  return p;
}

test("syncChildren appends a new card without moving the others", () => {
  const p = fake(["a", "b"]);
  const [a, b] = p.kids;
  const moves = [];
  const orig = p.insertBefore;
  p.insertBefore = (n, r) => (moves.push(n.name), orig(n, r));
  const c = p.mk("c");
  k.syncChildren(p, [a, b, c]);
  assert.deepEqual(p.kids.map((n) => n.name), ["a", "b", "c"]);
  assert.deepEqual(moves, ["c"]);
});

test("syncChildren removes what is gone and puts older cards above", () => {
  const p = fake(["b", "c", "d"]);
  const [b, c] = p.kids;
  const a = p.mk("a");
  k.syncChildren(p, [a, b, c]);
  assert.deepEqual(p.kids.map((n) => n.name), ["a", "b", "c"]);
});

test("every card the log lets go is released: replaced, pruned and cleared", () => {
  const dropped = [];
  const c = new k.Cards((n) => dropped.push(n));
  const a = c.card("1", "s1", () => ({ n: 1 }));
  const b = c.card("1", "s2", () => ({ n: 2 }));
  assert.deepEqual(dropped, [a]);
  const x = c.card("2", "s", () => ({ n: 3 }));
  c.prune(new Set(["2"]));
  assert.deepEqual(dropped, [a, b]);
  c.clear();
  assert.deepEqual(dropped, [a, b, x]);
});
