// The statblock layout editor (ADR 0099 item 8): its tree operations as
// functions of a layout — add, move, nest, delete, duplicate — undone and
// redone in a session, a run of typing one step, "changed" against what
// was saved; a layout it makes validating as itself; and the window built
// in a page: the tree a keyboard walks and moves, the options under the
// selected row, a problem's path selecting its block, a stale save shown
// and resolved, leaving with changes asking first.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&") };
globalThis.HTMLElement = win.HTMLElement;
globalThis.Element = win.Element;
for (const k of ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLButtonElement", "HTMLDetailsElement"]) globalThis[k] = win[k];
globalThis.CustomEvent = win.CustomEvent;
globalThis.localStorage = win.localStorage;

await esbuild.build({
  stdin: {
    contents: `export * from "./src/statblock/editor/state";
export { sampleSheet, sampleText, layoutKeys } from "./src/statblock/editor/sample";
export { openLayoutEditor, blockAtPath } from "./src/statblock/editor/shell";
export { rowsOf } from "./src/statblock/editor/tree";
export { validateLayout } from "./src/statblock/validate";
export { builtinLayouts } from "./src/statblock/builtin";
export { attachFolder, allLayouts, resetStoreForTests } from "./src/statblock/store";
export { setStatblockLang } from "./src/statblock/strings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockEditor.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblockEditor.test-bundle.mjs");
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v));

const base = () =>
  m.validateLayout({
    name: "T",
    id: "t",
    blocks: [
      { type: "heading", id: "h", properties: ["name"] },
      { type: "group", id: "g", nested: [{ type: "property", id: "p", properties: ["ac"] }] },
      { type: "conditional", id: "c", branches: [{ when: { op: "has", key: "x" }, nested: [] }, { nested: [] }] },
      { type: "text", id: "t1", properties: ["desc"] },
    ],
  }).layout;
const ids = (blocks) => blocks.map((b) => b.id);

beforeEach(() => {
  localStorage.clear();
  m.resetStoreForTests();
  m.setStatblockLang("en");
  document.body.replaceChildren();
});

describe("tree operations are functions of a layout", () => {
  test("add at a place, in a container, in a branch", () => {
    let l = base();
    l = m.insertAt(l, { slot: { parent: null }, index: 1 }, m.newBlock("image", "img"));
    assert.deepEqual(ids(l.blocks), ["h", "img", "g", "c", "t1"]);
    l = m.insertAt(l, { slot: { parent: "g" }, index: 99 }, m.newBlock("saves", "sv"));
    assert.deepEqual(ids(m.findBlock(l, "g").nested), ["p", "sv"]);
    l = m.insertAt(l, { slot: { parent: "c", branch: 1 }, index: 0 }, m.newBlock("text", "else"));
    assert.deepEqual(ids(m.findBlock(l, "c").branches[1].nested), ["else"]);
    assert.equal(m.insertAt(l, { slot: { parent: "h" }, index: 0 }, m.newBlock("text", "z")), null, "a heading holds nothing");
  });

  test("move up and down, out of a group at its edge, into the group above", () => {
    let l = base();
    l = m.moveBy(l, "t1", -1);
    assert.deepEqual(ids(l.blocks), ["h", "g", "t1", "c"]);
    l = m.indent(l, "t1");
    assert.deepEqual(ids(m.findBlock(l, "g").nested), ["p", "t1"]);
    l = m.moveBy(l, "p", -1);
    assert.deepEqual(ids(l.blocks), ["h", "p", "g", "c"], "up at the top of a group leaves it, before it");
    l = m.outdent(l, "t1");
    assert.deepEqual(ids(l.blocks), ["h", "p", "g", "t1", "c"]);
    assert.equal(m.moveBy(l, "h", -1), null, "nothing above the first block");
  });

  test("a drop's move: never into itself or a block it holds", () => {
    const l = base();
    assert.equal(m.moveTo(l, "g", { slot: { parent: "g" }, index: 0 }), null);
    const moved = m.moveTo(l, "h", { slot: { parent: null }, index: 4 });
    assert.deepEqual(ids(moved.blocks), ["g", "c", "t1", "h"]);
    const into = m.moveTo(l, "t1", { slot: { parent: "c", branch: 0 }, index: 0 });
    assert.deepEqual(ids(m.findBlock(into, "c").branches[0].nested), ["t1"]);
  });

  test("delete, duplicate with fresh ids throughout, update a field", () => {
    let l = base();
    const d = m.duplicate(l, "g");
    assert.equal(d.id, "g-2");
    assert.equal(m.findBlock(d.layout, "g-2").nested[0].id, "p-2");
    l = m.removeBlock(d.layout, "g");
    assert.equal(m.findBlock(l, "p"), null, "what it held goes with it");
    l = m.updateBlock(l, "t1", { label: { en: "Desc" }, id: "hacked", type: "image" });
    assert.deepEqual(m.findBlock(l, "t1").label, { en: "Desc" });
    assert.equal(m.findBlock(l, "t1").type, "text");
    l = m.updateBlock(l, "t1", { label: undefined });
    assert.equal("label" in m.findBlock(l, "t1"), false);
  });

  test("every new block validates as itself: the editor writes the model", () => {
    let l = base();
    for (const type of ["heading", "subheading", "property", "table", "saves", "traits", "text", "image", "group", "inline", "collapse", "conditional", "tracker", "roll"]) {
      l = m.insertAt(l, { slot: { parent: null }, index: 99 }, m.newBlock(type, m.freeBlockId(l, type)));
    }
    const v = m.validateLayout(plain(l), l.id);
    assert.deepEqual(v.problems, []);
    assert.deepEqual(plain(v.layout), plain(l));
  });

  test("the built-ins round-trip through the session unchanged", () => {
    for (const b of m.builtinLayouts()) {
      const s = new m.Session(b);
      assert.equal(s.dirty(), false);
      assert.deepEqual(plain(m.validateLayout(plain(s.layout), b.id).layout), plain(b));
    }
  });
});

describe("the session undoes, redoes and knows what changed", () => {
  test("steps undo and redo; back where it was saved is unchanged", () => {
    const s = new m.Session(base());
    assert.equal(s.apply(m.moveBy(s.layout, "t1", -1)), true);
    assert.equal(s.apply(m.removeBlock(s.layout, "h")), true);
    assert.equal(s.dirty(), true);
    s.undo();
    assert.deepEqual(ids(s.layout.blocks), ["h", "g", "t1", "c"]);
    s.undo();
    assert.equal(s.dirty(), false);
    assert.equal(s.canUndo(), false);
    s.redo();
    assert.deepEqual(ids(s.layout.blocks), ["h", "g", "t1", "c"]);
    s.apply(m.removeBlock(s.layout, "c"));
    assert.equal(s.canRedo(), false, "a new step drops what could be redone");
  });

  test("typing in one field is one step; another field is another", () => {
    const s = new m.Session(base());
    s.apply(m.updateBlock(s.layout, "t1", { fallback: "a" }), "t1.fallback", 1000);
    s.apply(m.updateBlock(s.layout, "t1", { fallback: "ab" }), "t1.fallback", 1500);
    s.apply(m.updateBlock(s.layout, "t1", { fallback: "abc" }), "t1.fallback", 2000);
    s.apply(m.updateBlock(s.layout, "h", { fallback: "x" }), "h.fallback", 2100);
    s.undo();
    assert.equal(m.findBlock(s.layout, "t1").fallback, "abc");
    s.undo();
    assert.equal(m.findBlock(s.layout, "t1").fallback, undefined);
    s.redo();
    s.apply(m.updateBlock(s.layout, "t1", { fallback: "later" }), "t1.fallback", 9000);
    s.undo();
    assert.equal(m.findBlock(s.layout, "t1").fallback, "abc", "a pause starts a new step");
  });

  test("a change to nothing is no step", () => {
    const s = new m.Session(base());
    assert.equal(s.apply(m.updateBlock(s.layout, "h", {})), false);
    assert.equal(s.apply(null), false);
    assert.equal(s.canUndo(), false);
  });
});

describe("the sample exercises every key the layout names", () => {
  test("of the shape each block reads", () => {
    const l = m.builtinLayouts()[0];
    const sheet = m.sampleSheet(l);
    for (const k of m.layoutKeys(l)) if (k !== "image") assert.ok(Object.hasOwn(sheet, k), k);
    assert.ok(Array.isArray(sheet.stats) && sheet.stats.length === 6);
    assert.ok(Array.isArray(sheet.actions) && sheet.actions[0].name);
    assert.match(m.sampleText(l), /name: Sample/);
  });
});

/** An in-memory folder, as the contract answers. */
function memoryFolder(initial = {}) {
  const files = new Map(Object.entries(initial).map(([id, v]) => [id, { text: JSON.stringify(v), revision: "r0" }]));
  let n = 0;
  return {
    files,
    async list() {
      return { entries: [...files].map(([id, f]) => ({ id, revision: f.revision })), strays: [] };
    },
    async read(_k, id) {
      const f = files.get(id);
      if (!f) throw { kind: "not_found", message: "not found" };
      return { value: JSON.parse(f.text), revision: f.revision };
    },
    async write(_k, id, value, revision) {
      const f = files.get(id);
      if (revision === null && f) throw { kind: "exists", message: "exists" };
      if (revision !== null && (!f || f.revision !== revision)) throw { kind: "changed", message: "changed since read" };
      const r = `r${++n}`;
      files.set(id, { text: JSON.stringify(value), revision: r });
      return { revision: r };
    },
    async remove(_k, id) {
      files.delete(id);
    },
  };
}

function deps(answer = true) {
  const asked = [];
  return {
    asked,
    ask: async (message) => (asked.push(message), answer),
    opened: () => {},
    closed: () => {},
    asDialog: (el, _label, close) => el.addEventListener("keydown", (e) => e.key === "Escape" && close()),
  };
}

async function openOn(layoutJson, d = deps()) {
  const api = memoryFolder({ mine: layoutJson });
  await m.attachFolder(api);
  const stored = m.allLayouts().find((s) => s.layout.id === "mine");
  const ed = m.openLayoutEditor({ stored, sources: [{ label: "Ogre", text: "name: Ogre\nac: 12\ndesc: big 1d6\n" }] }, d);
  return { ed, api, d };
}
const mine = { name: { en: "Mine", pt: "Meu" }, blocks: [{ type: "heading", id: "h", properties: ["name"] }, { type: "property", id: "p", properties: ["ac"], label: "AC" }, { type: "group", id: "g", nested: [] }] };
const key = (el, k, more = {}) => el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, ...more }));

describe("the editor window", () => {
  test("the tree, the card beside it, the options under the selected row", async () => {
    const { ed } = await openOn(mine);
    const tree = ed.el.querySelector('[role="tree"]');
    assert.ok(tree);
    const rows = [...tree.querySelectorAll('[role="treeitem"]')];
    assert.deepEqual(rows.map((r) => r.dataset.row), ["h", "p", "g"]);
    assert.equal(rows[0].getAttribute("aria-selected"), "true");
    assert.equal(rows[0].tabIndex, 0);
    assert.ok(tree.querySelector('.sbe-options[role="group"]'), "the selected block's options are under it");
    assert.match(ed.el.querySelector(".sbe-card").textContent, /Ogre/, "drawn from the note's statblock");
    assert.match(ed.el.querySelector(".sbe-card").textContent, /AC 12/);
    ed.el.querySelector(".sbe-source").value = "-1";
    ed.el.querySelector(".sbe-source").dispatchEvent(new win.Event("change"));
    assert.match(ed.el.querySelector(".sbe-card").textContent, /Sample/, "or from the sample");
  });

  test("the keyboard walks and moves the tree; Ctrl+Z undoes", async () => {
    const { ed } = await openOn(mine);
    const row = (id) => ed.el.querySelector(`[data-row="${id}"]`);
    key(row("h"), "ArrowDown");
    assert.equal(row("p").getAttribute("aria-selected"), "true");
    key(row("p"), "ArrowDown", { altKey: true });
    assert.deepEqual(ed.session.layout.blocks.map((b) => b.id), ["h", "g", "p"]);
    assert.equal(ed.el.querySelector(".sbe-dirty").textContent.includes("Unsaved"), true);
    key(row("p"), "ArrowRight", { altKey: false });
    key(row("p"), "ArrowUp", { altKey: true });
    key(row("p"), "ArrowRight", { altKey: true });
    assert.equal(ed.session.layout.blocks.length, 3, "nothing above to nest into is said, not done");
    key(ed.el, "z", { ctrlKey: true });
    assert.deepEqual(ed.session.layout.blocks.map((b) => b.id), ["h", "g", "p"]);
    key(ed.el, "z", { ctrlKey: true });
    assert.deepEqual(ed.session.layout.blocks.map((b) => b.id), ["h", "p", "g"]);
    assert.equal(ed.el.querySelector(".sbe-dirty").textContent, "");
    key(row("p"), "Delete");
    assert.equal(m.findBlock(ed.session.layout, "p"), null);
    await tick();
    assert.match(ed.el.querySelector('[role="status"]').textContent, /Deleted/);
  });

  test("the add menu names each type and puts it inside the selected group", async () => {
    const { ed } = await openOn(mine);
    ed.el.querySelector('[data-row="g"]').click();
    const items = [...ed.el.querySelectorAll('.sbe-menu [role="menuitem"]')];
    assert.equal(items.length, 14);
    assert.match(items[13].textContent, /Roll/);
    items.find((i) => /Tracker/.test(i.textContent)).click();
    assert.equal(m.findBlock(ed.session.layout, "g").nested[0].type, "tracker");
  });

  test("typing a label changes the card and is one undo step", async () => {
    const { ed } = await openOn(mine);
    ed.el.querySelector('[data-row="p"]').click();
    const input = ed.el.querySelector('[data-field="p.label.en"]');
    for (const v of ["A", "Ar", "Armor"]) {
      input.value = v;
      input.dispatchEvent(new win.Event("input"));
    }
    assert.equal(m.findBlock(ed.session.layout, "p").label.en, "Armor");
    await tick(200);
    assert.match(ed.el.querySelector(".sbe-card").textContent, /Armor 12/);
    key(ed.el, "z", { metaKey: true });
    assert.equal(m.findBlock(ed.session.layout, "p").label.en, "AC");
  });

  test("an expression is checked as it is typed", async () => {
    const { ed } = await openOn({ ...mine, blocks: [{ type: "table", id: "t", properties: ["stats"], modifier: { kind: "expression", expression: "(score - 10) / 2" } }] });
    const input = ed.el.querySelector('[data-field="t.expr"]');
    assert.match(input.parentElement.parentElement.textContent, /accepted/);
    input.value = "alert(1)";
    input.dispatchEvent(new win.Event("input"));
    assert.match(input.parentElement.parentElement.textContent, /refused/);
  });

  test("a problem's path selects its block", async () => {
    const { ed } = await openOn({ ...mine, blocks: [{ type: "group", id: "g", nested: [{ type: "table", id: "t", properties: ["s"], modifier: { kind: "expression", expression: "score / 2" } }] }] });
    const input = () => ed.el.querySelector('[data-field="t.expr"]');
    ed.el.querySelector('[data-row="t"]').click();
    input().value = "nope(";
    input().dispatchEvent(new win.Event("input"));
    ed.el.querySelector('[data-row="g"]').click();
    const problem = ed.el.querySelector(".sbe-problem");
    assert.match(problem.textContent, /blocks\[0\]\.nested\[0\]/);
    problem.click();
    assert.equal(ed.el.querySelector('[data-row="t"]').getAttribute("aria-selected"), "true");
    assert.equal(m.blockAtPath(ed.session.layout, "blocks[0].nested[0].modifier"), "t");
  });

  test("saving writes over the revision read; a stale save is shown, theirs or a copy", async () => {
    const { ed, api } = await openOn(mine);
    ed.session.apply(m.updateBlock(ed.session.layout, "p", { fallback: "-" }));
    assert.equal(await ed.save(), true);
    assert.equal(JSON.parse(api.files.get("mine").text).blocks[1].fallback, "-");
    assert.equal(ed.session.dirty(), false);
    // Someone else writes it.
    api.files.set("mine", { text: JSON.stringify({ ...mine, name: { en: "Theirs" } }), revision: "rX" });
    ed.session.apply(m.updateBlock(ed.session.layout, "p", { fallback: "mine" }));
    assert.equal(await ed.save(), false);
    const stale = ed.el.querySelector(".sbe-stale");
    assert.equal(stale.hidden, false);
    assert.match(stale.textContent, /changed this layout/);
    assert.equal(JSON.parse(api.files.get("mine").text).name.en, "Theirs", "nothing written over theirs");
    await ed.saveAsCopy();
    assert.ok(api.files.has("mine-copy"));
    assert.equal(JSON.parse(api.files.get("mine-copy").text).blocks[1].fallback, "mine");
    assert.equal(stale.hidden, true);
  });

  test("loading their version discards mine, said", async () => {
    const { ed, api } = await openOn(mine);
    api.files.set("mine", { text: JSON.stringify({ ...mine, name: { en: "Theirs" } }), revision: "rX" });
    ed.session.apply(m.removeBlock(ed.session.layout, "h"));
    await ed.save();
    await ed.reloadTheirs();
    assert.equal(ed.session.layout.name.en, "Theirs");
    assert.equal(ed.session.dirty(), false);
    assert.equal(ed.session.canUndo(), false);
  });

  test("a renamed id moves the file; a taken or bad id is refused", async () => {
    const { ed, api } = await openOn(mine);
    ed.session.apply(m.updateLayout(ed.session.layout, { id: "d20-creature" }));
    assert.equal(await ed.save(), false);
    ed.session.apply(m.updateLayout(ed.session.layout, { id: "Bad Id" }));
    assert.equal(await ed.save(), false);
    ed.session.apply(m.updateLayout(ed.session.layout, { id: "renamed" }));
    assert.equal(await ed.save(), true);
    assert.ok(api.files.has("renamed"));
    assert.equal(api.files.has("mine"), false);
  });

  test("a rename whose old file cannot be removed asks: retry, or keep both", async () => {
    const { ed, api } = await openOn(mine);
    const remove = api.remove;
    let failing = true;
    api.remove = async (...a) => {
      if (failing) throw new Error("locked");
      return remove(...a);
    };
    ed.session.apply(m.updateLayout(ed.session.layout, { id: "renamed" }));
    assert.equal(await ed.save(), true);
    const box = ed.el.querySelector(".sbe-stale") ?? ed.parts.stale;
    assert.equal(box.hidden, false);
    assert.match(box.textContent, /could not be removed \(.*locked/);
    assert.ok(api.files.has("mine") && api.files.has("renamed"));
    failing = false;
    [...box.querySelectorAll("button")].find((b) => /again/.test(b.textContent)).click();
    await tick();
    await tick();
    assert.equal(api.files.has("mine"), false);
    assert.equal(box.hidden, true);
    // And "keep both" closes the question, keeping both files.
    failing = true;
    ed.session.apply(m.updateLayout(ed.session.layout, { id: "again" }));
    assert.equal(await ed.save(), true);
    [...ed.parts.stale.querySelectorAll("button")].find((b) => /Keep both/.test(b.textContent)).click();
    assert.equal(ed.parts.stale.hidden, true);
    assert.ok(api.files.has("renamed") && api.files.has("again"));
  });

  test("leaving with changes asks; no keeps it open, and Escape asks too", async () => {
    const d = deps(false);
    const { ed } = await openOn(mine, d);
    assert.equal(await ed.requestClose(), true, "no changes: no question");
    const again = (await openOn(mine, d)).ed;
    again.session.apply(m.removeBlock(again.session.layout, "h"));
    assert.equal(await again.requestClose(), false);
    assert.equal(d.asked.length, 1);
    assert.ok(again.el.isConnected);
    key(again.el, "Escape");
    await tick();
    assert.equal(d.asked.length, 2);
  });

  test("a drag by the grip moves the block where the line shows", async () => {
    const { ed } = await openOn(mine);
    const grip = ed.el.querySelector('[data-row="h"] .sbe-grip');
    const target = ed.el.querySelector('[data-row="g"]');
    target.getBoundingClientRect = () => ({ top: 100, height: 20, left: 0, width: 200, bottom: 120, right: 200 });
    const real = document.elementFromPoint;
    document.elementFromPoint = () => target;
    grip.dispatchEvent(new win.PointerEvent("pointerdown", { button: 0, pointerId: 1, bubbles: true }));
    grip.dispatchEvent(new win.PointerEvent("pointermove", { clientX: 10, clientY: 110, pointerId: 1 }));
    assert.ok(target.classList.contains("sbe-drop-inside"));
    grip.dispatchEvent(new win.PointerEvent("pointerup", { pointerId: 1 }));
    document.elementFromPoint = real;
    assert.deepEqual(m.findBlock(ed.session.layout, "g").nested.map((b) => b.id), ["h"]);
  });
});

describe("the editor's controls for bands, marks and label templates", () => {
  test("a table's modifier becomes bands; rows are added, typed, checked and removed", async () => {
    const { ed } = await openOn({ ...mine, blocks: [{ type: "table", id: "t", properties: ["stats"], headers: ["A"], modifier: "none" }] });
    const sel = ed.el.querySelector('[data-field="t.mod"]');
    sel.value = "bands";
    sel.dispatchEvent(new win.Event("change"));
    assert.deepEqual(m.findBlock(ed.session.layout, "t").modifier, { kind: "bands", bands: [{ min: 1, max: 10, value: 0 }] });
    ed.el.querySelector('[data-field="t.addBand"]').click();
    assert.deepEqual(m.findBlock(ed.session.layout, "t").modifier.bands[1], { min: 11, max: 11, value: 1 });
    const min = ed.el.querySelector('[data-field="t.band1.min"]');
    min.value = "20";
    min.dispatchEvent(new win.Event("input"));
    assert.match(min.closest(".sbe-band").textContent, /past/);
    assert.ok(ed.el.querySelector(".sbe-problem"), "the validator lists the row");
    ed.el.querySelector('[data-field="t.band1.x"]').click();
    assert.equal(m.findBlock(ed.session.layout, "t").modifier.bands.length, 1);
    assert.equal(ed.el.querySelector(".sbe-problem"), null);
  });

  test("a traits list's mark is switched on, its key and label edited, and drawn on the card", async () => {
    const { ed } = await openOn({ ...mine, blocks: [{ type: "traits", id: "f", properties: ["fatos"] }] });
    ed.el.querySelector('[data-row="f"]').click();
    const box = ed.el.querySelector('[data-field="f.flag"]');
    box.checked = true;
    box.dispatchEvent(new win.Event("change"));
    assert.deepEqual(m.findBlock(ed.session.layout, "f").flag, { key: "quebrado" });
    const label = ed.el.querySelector('[data-field="f.flag.label.en"]');
    label.value = "Broken";
    label.dispatchEvent(new win.Event("input"));
    const key = ed.el.querySelector('[data-field="f.flag.key"]');
    key.value = "broken";
    key.dispatchEvent(new win.Event("input"));
    assert.deepEqual(m.findBlock(ed.session.layout, "f").flag, { key: "broken", label: { en: "Broken" } });
    const count = ed.el.querySelector('[data-field="f.flag.count.en"]');
    count.value = "{n} of {m} broken";
    count.dispatchEvent(new win.Event("input"));
    assert.deepEqual(m.findBlock(ed.session.layout, "f").flag, { key: "broken", label: { en: "Broken" }, count: { en: "{n} of {m} broken" } });
    ed.el.querySelector(".sbe-source").value = "-1";
    ed.el.querySelector(".sbe-source").dispatchEvent(new win.Event("change"));
    assert.ok(ed.el.querySelector(".sbe-card .statblock-trait-flagged"), "the sample marks an item");
  });

  test("a tracker says its label may read the sheet", async () => {
    const { ed } = await openOn({ ...mine, blocks: [{ type: "tracker", id: "r", current: "a", max: 3, label: "{nome}" }] });
    ed.el.querySelector('[data-row="r"]').click();
    assert.match(ed.el.querySelector(".sbe-options").textContent, /\{key\}/);
  });
});
