// Where statblock layouts live (ADR 0099 item 2): the built-ins, read-only;
// the folder's `.verso/layouts/<id>.json` through the folder data contract
// (an in-memory one here, with its revisions and refusals); the first
// build's device layouts moved into the folder once, on the first write —
// opening never writes.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.localStorage = win.localStorage;

await esbuild.build({
  stdin: {
    contents: `export * from "./src/statblock/store";
export { LEGACY_KEY, fromLegacy } from "./src/statblock/legacy";
export { setStatblockLang } from "./src/statblock/strings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockStore.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblockStore.test-bundle.mjs");

/** The contract's four commands over a map, as the harness answers them. */
function memoryFolder(initial = {}) {
  const files = new Map(Object.entries(initial).map(([id, v]) => [id, { text: JSON.stringify(v), revision: "r0" }]));
  let n = 0;
  const watchers = new Set();
  const calls = [];
  const api = {
    files,
    calls,
    strays: [],
    async list(kind) {
      calls.push(["list", kind]);
      return { entries: [...files].map(([id, f]) => ({ id, revision: f.revision })), strays: api.strays };
    },
    async read(kind, id) {
      calls.push(["read", kind, id]);
      const f = files.get(id);
      if (!f) throw new Error("not found");
      return { value: JSON.parse(f.text), revision: f.revision };
    },
    async write(kind, id, value, revision) {
      calls.push(["write", kind, id, revision]);
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("invalid");
      const f = files.get(id);
      if (revision === null && f) throw new Error("exists");
      if (revision !== null && (!f || f.revision !== revision)) throw new Error("stale");
      const r = `r${++n}`;
      files.set(id, { text: JSON.stringify(value), revision: r });
      return { revision: r };
    },
    async remove(kind, id, revision) {
      calls.push(["remove", kind, id, revision]);
      const f = files.get(id);
      if (!f || f.revision !== revision) throw new Error("stale");
      files.delete(id);
    },
    onChange(kind, run) {
      watchers.add(run);
      return () => watchers.delete(run);
    },
    tell() {
      for (const w of watchers) w();
    },
  };
  return api;
}
const writes = (api) => api.calls.filter((c) => c[0] === "write" || c[0] === "remove");
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  localStorage.clear();
  m.resetStoreForTests();
  m.setStatblockLang("en");
});

describe("the built-ins and the folder's own", () => {
  test("without a folder: the built-ins, and nothing can be written", async () => {
    const all = m.allLayouts();
    assert.deepEqual(all.slice(0, 2).map((s) => [s.layout.id, s.source]), [["d20-creature", "builtin"], ["facts-trackers", "builtin"]]);
    assert.ok(all.every((s) => s.source === "builtin"));
    assert.equal(m.canWriteLayouts(), false);
    const r = await m.duplicateLayout("d20-creature");
    assert.equal(r.ok, false);
  });

  test("a folder's files are read, validated, and found by name; reading writes nothing", async () => {
    const api = memoryFolder({ monster: { name: { pt: "Monstro", en: "Monster" }, blocks: [{ type: "heading", properties: ["name"] }, { type: "nope" }] }, "bad-json": 5 });
    let told = 0;
    m.onLayoutsChanged(() => told++);
    await m.attachFolder(api);
    const mine = m.allLayouts().filter((s) => s.source === "folder");
    assert.deepEqual(mine.map((s) => s.layout.id), ["monster"]);
    assert.equal(mine[0].problems.length, 1);
    assert.equal(mine[0].revision, "r0");
    assert.equal(m.resolveLayout("monstro").stored.layout.id, "monster");
    assert.ok(told >= 1);
    assert.deepEqual(writes(api), []);
  });

  test("the folder's stray names (a sync conflict copy) are kept for the page to say, and cleared when the folder is", async () => {
    const api = memoryFolder({ monster: { name: "M", blocks: [] } });
    api.strays = ["monster (conflict, Mac, 2026-10-20).json"];
    await m.attachFolder(api);
    assert.deepEqual(m.layoutStrays(), ["monster (conflict, Mac, 2026-10-20).json"]);
    assert.deepEqual(m.allLayouts().filter((s) => s.source === "folder").map((s) => s.layout.id), ["monster"]);
    await m.attachFolder(null);
    assert.deepEqual(m.layoutStrays(), []);
  });

  test("a folder file never shadows a built-in", async () => {
    await m.attachFolder(memoryFolder({ "d20-creature": { name: "Fake", blocks: [] } }));
    const d20 = m.allLayouts().filter((s) => s.layout.id === "d20-creature");
    assert.deepEqual(d20.map((s) => s.source), ["builtin"]);
  });

  test("a change elsewhere (sync, a room, another window) is read again", async () => {
    const api = memoryFolder();
    await m.attachFolder(api);
    api.files.set("late", { text: JSON.stringify({ name: "Late", blocks: [] }), revision: "r9" });
    api.tell();
    await tick();
    assert.ok(m.allLayouts().some((s) => s.layout.id === "late"));
  });
});

describe("writes go to the folder, with the stale check", () => {
  test("duplicate copies a built-in into a new file, named as a copy", async () => {
    const api = memoryFolder();
    await m.attachFolder(api);
    const r = await m.duplicateLayout("d20-creature");
    assert.equal(r.ok, true);
    assert.equal(r.value.layout.id, "d20-creature-copy");
    assert.equal(r.value.layout.name.en, "d20 creature (copy)");
    assert.deepEqual(writes(api), [["write", "layouts", "d20-creature-copy", null]]);
    const again = await m.duplicateLayout("d20-creature");
    assert.equal(again.value.layout.id, "d20-creature-copy-2");
  });

  test("a built-in's id is never written; a stale revision is refused and said", async () => {
    const api = memoryFolder({ mine: { name: "Mine", blocks: [] } });
    await m.attachFolder(api);
    const built = m.allLayouts()[0].layout;
    assert.equal((await m.saveLayout(built, null)).ok, false);
    const mine = m.allLayouts().find((s) => s.layout.id === "mine");
    const stale = await m.saveLayout(mine.layout, "r-old");
    assert.equal(stale.ok, false);
    assert.match(stale.why, /stale/);
    const ok = await m.saveLayout({ ...mine.layout, columns: 2 }, mine.revision);
    assert.equal(ok.ok, true);
    assert.equal(JSON.parse(api.files.get("mine").text).columns, 2);
  });

  test("remove takes the file's revision", async () => {
    const api = memoryFolder({ gone: { name: "Gone", blocks: [] } });
    await m.attachFolder(api);
    assert.equal((await m.removeLayout("gone")).ok, true);
    assert.equal(api.files.has("gone"), false);
    assert.equal((await m.removeLayout("d20-creature")).ok, false, "a built-in cannot be removed");
  });

  test("an import is written under a free id, its dropped code returned", async () => {
    const api = memoryFolder();
    await m.attachFolder(api);
    const fs = { name: "Basic 5e Layout", id: "basic-5e-layout", blocks: [{ type: "javascript", code: "x" }, { type: "heading", properties: ["name"] }] };
    const r = await m.importLayoutText(JSON.stringify(fs));
    assert.equal(r.ok, true);
    assert.equal(r.value.stored.layout.id, "basic-5e-layout");
    assert.equal(r.value.dropped.length, 1);
    const r2 = await m.importLayoutText(JSON.stringify(fs));
    assert.equal(r2.value.stored.layout.id, "basic-5e-layout-2");
    // Its own name now finds it before the alias to the built-in.
    assert.equal(m.resolveLayout("Basic 5e Layout").stored.source, "folder");
  });
});

describe("the first build's device layouts move into the folder once", () => {
  const legacy = [
    { id: "custom-goblins", name: "Goblins", system: "x", description: "", theme: "classic", blocks: [{ id: "h", type: "heading", properties: ["nome"] }, { id: "d", type: "divider", properties: [] }, { id: "v", type: "vitals", properties: ["pv", "ca"] }, { id: "s", type: "section", title: "Ataques", properties: ["ataques"] }] },
    { id: "dnd5e", name: "Clash", blocks: [] },
  ];

  test("they show, saving a layout never touches them, the move is the person's step", async () => {
    localStorage.setItem(m.LEGACY_KEY, JSON.stringify(legacy));
    const api = memoryFolder();
    await m.attachFolder(api);
    const device = m.allLayouts().filter((s) => s.source === "device");
    assert.deepEqual(device.map((s) => s.layout.id), ["goblins", "dnd5e"]);
    assert.equal(m.resolveLayout("Goblins").stored.layout.id, "goblins");
    assert.deepEqual(writes(api), [], "opening never writes");
    assert.equal(m.deviceNoticeDue(), true);
    await m.duplicateLayout("facts-trackers");
    assert.deepEqual(writes(api).map((c) => c[2]), ["facts-trackers-copy"], "saving writes only the person's own layout");
    assert.ok(localStorage.getItem(m.LEGACY_KEY), "and leaves the device's alone");
    const r = await m.moveDeviceLayouts();
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.map((x) => [x.id, x.ok]), [["goblins", true], ["dnd5e", true]]);
    assert.equal(localStorage.getItem(m.LEGACY_KEY), null);
    await m.reloadFolder();
    assert.deepEqual(m.allLayouts().filter((s) => s.source === "device"), []);
    assert.ok(m.allLayouts().some((s) => s.layout.id === "goblins" && s.source === "folder"));
  });

  test("a failing legacy item is reported, the others move, only those leave the device, and a save is never blocked", async () => {
    localStorage.setItem(m.LEGACY_KEY, JSON.stringify(legacy));
    const api = memoryFolder();
    const write = api.write;
    api.write = async (k, id, v, rev) => {
      if (id === "goblins") throw new Error("too big");
      return write(k, id, v, rev);
    };
    await m.attachFolder(api);
    const saved = await m.duplicateLayout("facts-trackers");
    assert.equal(saved.ok, true, "the person's own save is independent");
    const r = await m.moveDeviceLayouts();
    assert.deepEqual(r.value.map((x) => [x.id, x.ok]), [["goblins", false], ["dnd5e", true]]);
    assert.match(r.value[0].why, /too big/);
    assert.deepEqual(m.pendingDeviceLayouts().map((s) => s.layout.id), ["goblins"]);
    assert.equal(JSON.parse(localStorage.getItem(m.LEGACY_KEY)).length, 1);
  });

  test("keep stops the notice, discard removes only the chosen", async () => {
    localStorage.setItem(m.LEGACY_KEY, JSON.stringify(legacy));
    await m.attachFolder(memoryFolder());
    m.discardDeviceLayouts(["dnd5e"]);
    assert.deepEqual(m.pendingDeviceLayouts().map((s) => s.layout.id), ["goblins"]);
    m.keepDeviceLayouts();
    assert.equal(m.deviceNoticeDue(), false);
    assert.equal(m.allLayouts().filter((s) => s.source === "device").length, 1, "kept layouts still draw cards");
    m.discardDeviceLayouts();
    assert.equal(localStorage.getItem(m.LEGACY_KEY), null);
  });

  test("the old shape becomes the model's blocks", () => {
    const l = m.fromLegacy(legacy[0]);
    assert.deepEqual(l.blocks.map((b) => b.type), ["heading", "group", "traits"]);
    assert.equal(l.blocks[0].rule, true, "a divider is the rule after the block before it");
    assert.deepEqual(l.blocks[1].nested.map((b) => b.properties[0]), ["pv", "ca"]);
    assert.deepEqual(l.blocks[2].label, { pt: "Ataques", en: "Ataques" });
  });

  test("broken device storage is no layout, not a throw", async () => {
    localStorage.setItem(m.LEGACY_KEY, "{not json");
    assert.deepEqual(m.allLayouts().filter((s) => s.source === "device"), []);
  });
});
