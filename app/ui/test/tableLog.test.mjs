// The table's log (ADR 0107, phase 1): the model and the local source. Pure;
// the panel is tested in e2e/table.spec.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/model"; export * from "./src/table/store";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableLog.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableLog.test-bundle.mjs");

const roll = (over = {}) => ({
  notation: "1d20+3",
  source: null,
  terms: [{ sign: 1, sides: 20, fudge: false, kept: [14], dropped: [] }],
  modifier: 3,
  total: 17,
  by: "",
  at: "2026-10-22T12:00:00.000Z",
  ...over,
});
const at = (s) => Date.parse(`2026-10-22T12:00:${String(s).padStart(2, "0")}.000Z`);
const mk = (s, over = {}) => m.entryOfRoll("Mesa.md", roll({ at: new Date(at(s)).toISOString(), ...over }), { mine: false });

test("an entry reads a roll: kind, time in ms, the table's source", () => {
  const e = m.entryOfRoll("Mesa.md", roll(), { mine: true });
  assert.equal(e.kind, "roll");
  assert.equal(e.at, Date.parse("2026-10-22T12:00:00.000Z"));
  assert.equal(e.total, 17);
  assert.equal(m.entryOfRoll("Mesa.md", roll({ source: "[[Mesa#^t]]" }), { mine: true, row: "Lobos" }).kind, "table");
});

test("the same roll heard twice is one line (a room joined again)", () => {
  const log = new m.TableLog();
  assert.equal(log.add(mk(1, { by: "Ana" })), true);
  assert.equal(log.add(mk(1, { by: "Ana" })), false);
  assert.equal(log.all().length, 1);
});

test("the log keeps time order: a late arrival goes where it belongs", () => {
  const log = new m.TableLog();
  log.add(mk(5, { by: "Ana" }));
  log.add(mk(9, { by: "Bia" }));
  log.add(mk(7, { by: "Cris" }));
  assert.deepEqual(log.all().map((e) => e.by), ["Ana", "Cris", "Bia"]);
});

test("a server's entries of the same millisecond keep the order of their numbers, an older page included", () => {
  // 130 messages said within one ms: the join holds 31 to 130, the page asked for after it 1 to 30.
  const log = new m.TableLog();
  const said = (n) => ({ ...mk(3, { by: `n${n}` }), id: String(n) });
  for (let n = 31; n <= 130; n++) log.add(said(n));
  for (let n = 1; n <= 30; n++) log.add(said(n));
  assert.deepEqual(log.all().map((e) => e.id), Array.from({ length: 130 }, (_, i) => String(i + 1)));
  // Out of order, and across ms: time first, then the number; 9 is past 10 as text, not as a number.
  const mixed = new m.TableLog();
  for (const [n, s] of [[10, 4], [12, 3], [9, 4], [11, 3], [2, 5]]) mixed.add({ ...mk(s), id: String(n) });
  assert.deepEqual(mixed.all().map((e) => e.id), ["11", "12", "9", "10", "2"]);
  // Not a server's number (a room's roll): after the entries of its ms, as before.
  mixed.add(mk(3, { by: "Ana" }));
  assert.equal(mixed.all()[2].by, "Ana");
});

test("only the last MOST_KEPT entries are kept", () => {
  const log = new m.TableLog();
  for (let i = 0; i < m.MOST_KEPT + 25; i++) log.add(m.entryOfRoll("n.md", roll({ at: new Date(at(0) + i).toISOString(), total: i }), { mine: true }));
  assert.equal(log.all().length, m.MOST_KEPT);
  assert.equal(log.all()[0].total, 25);
});

test("unread counts others' news only, never your own or the room's history", () => {
  const log = new m.TableLog();
  log.add(mk(1, { by: "Ana" }));
  log.add(m.entryOfRoll("Mesa.md", roll({ at: new Date(at(2)).toISOString() }), { mine: true }));
  log.add(mk(3, { by: "Bia" }), false);
  assert.equal(log.unread(), 1);
  log.markSeen();
  assert.equal(log.unread(), 0);
});

test("hide up to here is cut by the entry's time, and can be undone", () => {
  const log = new m.TableLog();
  log.add(mk(1, { by: "Ana" }));
  log.add(mk(5, { by: "Bia" }));
  log.hideUpToHere();
  assert.equal(log.visible().length, 0);
  assert.equal(log.hidden(), true);
  // An entry that arrives later but is older than the cut is inside it.
  log.add(mk(3, { by: "Cris" }));
  assert.equal(log.visible().length, 0);
  // A newer one shows.
  log.add(mk(8, { by: "Dani" }));
  assert.deepEqual(log.visible().map((e) => e.by), ["Dani"]);
  assert.equal(log.undoHide(), true);
  assert.equal(log.visible().length, 4);
  assert.equal(log.hidden(), false);
  assert.equal(log.undoHide(), false);
});

test("hiding twice keeps the first cut for the undo before it, one step", () => {
  const log = new m.TableLog();
  log.add(mk(1, { by: "Ana" }));
  log.hideUpToHere();
  log.add(mk(4, { by: "Bia" }));
  log.hideUpToHere();
  assert.equal(log.visible().length, 0);
  log.undoHide();
  assert.deepEqual(log.visible().map((e) => e.by), ["Bia"]);
});

test("the roller's dice travel as a closed form: styles read field by field, none when absent", () => {
  assert.equal(m.stylesOf(roll()), null);
  const s = m.stylesOf(roll({ styles: { 1: { body: "#112233", number: "javascript:1", outline: "#000", texture: "../x", material: "glass" } } }));
  assert.equal(s["1"].body, "#112233");
  assert.notEqual(s["1"].number, "javascript:1");
  assert.equal(s["1"].texture, "none");
  assert.equal(s["1"].material, "glass");
});

test("the source merges what this window rolled, what it heard and what the room held, per folder", () => {
  let folder = "a";
  const store = m.makeStore(() => folder);
  let changes = 0;
  store.onChange(() => changes++);
  store.add(m.entryOfRoll("Mesa.md", roll({ at: new Date(at(1)).toISOString() }), { mine: true }), false);
  store.add(mk(2, { by: "Ana" }), true);
  store.add(mk(0, { by: "Bia" }), false);
  store.add(mk(2, { by: "Ana" }), true);
  assert.deepEqual(store.entries().map((e) => e.by), ["Bia", "", "Ana"]);
  assert.equal(store.unread(), 1);
  assert.equal(changes, 3);
  folder = "b";
  assert.equal(store.entries().length, 0);
  assert.equal(store.unread(), 0);
  folder = "a";
  assert.equal(store.entries().length, 3);
  store.hideUpToHere();
  assert.equal(store.entries().length, 0);
  assert.equal(store.hidden(), true);
  assert.equal(store.shared, false);
});

test("an oracle draw is its own kind", () => {
  const e = m.entryOfDraw("Mesa.md", { kind: "question", by: "Ana", mine: false, at: at(4), roll: 42, text: "Sim" });
  assert.equal(e.kind, "oracle");
  assert.equal(e.oracle, "question");
  assert.equal(e.total, 42);
});
