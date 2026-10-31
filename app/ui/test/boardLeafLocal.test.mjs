// The board's tab (leaves/boardLive.ts) with a real board session and a
// disk played here: the room goes local (the sync link drops), the file
// changes from outside (sync bringing the players' drawings down), and the
// board is saved. Invariant 11: nothing on disk is written over, silently
// or not (the loss of 2026-10-26, a game master's edit wrote the old board
// over seven drawn elements).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

const stub = {
  name: "stub",
  setup(build) {
    build.onResolve({ filter: /^@tauri-apps\/api\/(core|event|webviewWindow)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    // What the tab leans on that is not the unit (the board's own module,
    // the layout, the status line): played here by name.
    build.onResolve({ filter: /^(\.\/board|\.\/note\/live|\.\.\/layout\/spaces|\.\.\/opening|\.\.\/dom|\.\.\/errors|\.\.\/access|\.\.\/notify\/presence)$/ }, (a) => (a.importer.endsWith("leaves/boardLive.ts") ? { path: a.path, namespace: "stub" } : undefined));
    build.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents:
        a.path === "@tauri-apps/api/core"
          ? "export const invoke = (cmd, args) => globalThis.__invoke(cmd, args); export const convertFileSrc = (p) => p; export const isTauri = () => false; export const addPluginListener = async () => ({}); export class Channel {}"
          : a.path === "@tauri-apps/api/event"
            ? "export const listen = async () => () => {}; export const emit = async () => {};"
            : a.path === "./board"
              ? 'import { toElements } from "./src/board/model"; export const loadBoardModule = async () => ({ drawnOf: toElements });'
              : a.path === "./note/live"
                ? "export const say = () => {};"
                : a.path === "../layout/spaces"
                  ? "export const leavesOf = () => [];"
                  : a.path === "../opening"
                    ? "export const opening = { readText: async (path) => { try { return { status: 'ok', data: await globalThis.__invoke('read_text', { path }) }; } catch (error) { return { status: 'error', error }; } } };"
                    : a.path === "../dom"
                      ? "export const ui = { status: { textContent: '' } };"
                      : a.path === "../errors"
                        ? "export const fail = (e) => { throw new Error(JSON.stringify(e)); };"
                        : a.path === "../access"
                          ? "export const may = () => true;"
                          : a.path === "../notify/presence"
                            ? "export const presenceOpened = () => {};"
                : "export const getCurrentWebviewWindow = () => ({ label: 'w' });",
      loader: "js",
      resolveDir: process.cwd(),
    }));
  },
};
await esbuild.build({
  stdin: { contents: 'export * from "./src/leaves/boardLive"; export { BoardSession } from "./src/boardRoom"; export * from "./src/board/roomModel"; export { toElements } from "./src/board/model";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["yjs"],
  plugins: [stub],
  outfile: "test/.bundles/boardLeafLocal.test-bundle.mjs",
  logLevel: "error",
});
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.document ??= { documentElement: { lang: "pt-BR", style: {} }, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, append() {}, setAttribute() {} }) };
const b = await import("./.bundles/boardLeafLocal.test-bundle.mjs");

const el = (id, x = 0, extra = {}) => ({ id, type: "freedraw", x, y: 0, width: 5, height: 5, isDeleted: false, version: 1, versionNonce: 7, index: `a${id}`, groupIds: [], frameId: null, ...extra });
const canvas = (...drawing) => ({ nodes: [{ id: "c1", type: "text", x: 0, y: 0, width: 100, height: 50, text: "antes" }], edges: [], verso: { version: 1, drawing } });
const b64 = (u) => Buffer.from(u).toString("base64");
const tick = () => new Promise((r) => setTimeout(r, 5));

/** The disk, and the host's commands over it. */
function world(startDoc) {
  const disk = { text: JSON.stringify(startDoc), n: 1, writes: [] };
  const rev = () => `r${disk.n}`;
  disk.set = (doc) => {
    disk.text = JSON.stringify(doc);
    disk.n++;
  };
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "read_text") return { text: disk.text, revision: rev(), warnings: [] };
    if (cmd === "board_preview") return args.json;
    if (cmd === "write_board") {
      if (args.revision !== rev()) throw { kind: "changed", message: "changed" };
      disk.writes.push({ json: args.json, revision: args.revision });
      disk.text = args.json;
      disk.n++;
      return { text: disk.text, revision: rev(), warnings: [] };
    }
    return null;
  };
  return disk;
}

function tab(disk, startDoc) {
  const doc = new Y.Doc();
  doc.getMap("meta").set("base", JSON.stringify(startDoc));
  const room = new b.BoardSession("Mesa.canvas", { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r1", user: "Ana", epoch: "e1" }, { saved() {}, conflict() {}, closed() {}, remote() {} }, true);
  room.seed(b.toElements(startDoc));
  const leaf = {
    path: "Mesa.canvas",
    revision: "",
    heldText: "",
    heldRevision: "",
    room,
    saving: Promise.resolve(),
    textEdited: false,
    localTimer: undefined,
    liveOthers: [],
    roomHandlers: {},
    conflict: {
      up: false,
      shown: null,
      show(d, m) {
        this.up = true;
        this.disk = d;
        this.shown = { disk: d, mine: m };
      },
      hide() {
        this.up = false;
        this.disk = null;
      },
    },
    paintLive() {},
    setDirty() {},
    pendingBoard: null,
    showText() {},
    // The tab's board write (board.ts saveBoard): over its revision; a refusal shows both.
    async saveBoardJson(json) {
      try {
        const r = await globalThis.__invoke("write_board", { path: this.path, json, revision: this.revision });
        this.hold(r.revision, r.text);
      } catch {
        this.conflict.show({ text: disk.text, revision: `r${disk.n}` }, json);
      }
    },
  };
  for (const name of ["hold", "holdRevision", "takeOutsideIn", "saveLocalNow", "boardWentLocal", "boardConflict", "boardHandlers", "followSaved", "overwriteLocal"]) leaf[name] = b[name];
  // (Run against a boardLive.ts without `hold`, to see the loss: only the revision moves.)
  leaf.hold ??= function (revision) {
    this.revision = revision;
  };
  (globalThis.__sessions ??= []).push(room);
  leaf.hold("r1", JSON.stringify(startDoc));
  return leaf;
}

/** The board's edit of one element, as the board sends it. */
const edit = (room, id, x) => {
  const held = room.resolved().get(id);
  room.patch([{ ...held, x, version: held.version + 1, versionNonce: 5 }]);
};
const onDisk = (disk) => JSON.parse(disk.text);
const xs = (doc) => Object.fromEntries((doc.verso?.drawing ?? []).map((d) => [d.id, d.x]));

test("the loss: sync brought the players' drawings down while the board was out of its room, then the game master's edit is saved", async () => {
  const start = canvas(el("g", 0));
  const disk = world(start);
  const leaf = tab(disk, start);
  leaf.room.goLocal("offline");
  // The game master's edit of the board (moves what is drawn).
  edit(leaf.room, "g", 42);
  // Sync wrote the players' version.
  disk.set(canvas(el("g", 0), el("d1", 1), el("d2", 2), el("r1", 3, { type: "rectangle" })));
  await b.boardWentLocal.call(leaf, "offline");
  await tick();
  const out = onDisk(disk);
  assert.deepEqual(Object.keys(xs(out)).sort(), ["d1", "d2", "g", "r1"], "the players' drawings are on disk");
  assert.equal(xs(out).g, 42, "the game master's edit is on disk");
  assert.equal(leaf.conflict.up, false);
});

test("the room's saves move the base with the revision: a local edit of what a player changed in the room survives", async () => {
  const start = canvas(el("x", 0));
  const disk = world(start);
  const leaf = tab(disk, start);
  // Live: a player moves x; the room writes the file; the tab is told.
  edit(leaf.room, "x", 50);
  disk.set(canvas(el("x", 50)));
  b.boardHandlers.call(leaf).saved(`r${disk.n}`);
  await tick();
  // The link drops; the game master moves x again; sync writes a new drawing.
  leaf.room.goLocal("offline");
  edit(leaf.room, "x", 99);
  disk.set(canvas(el("x", 50), el("y", 7)));
  await b.boardWentLocal.call(leaf, "offline");
  await tick();
  const out = xs(onDisk(disk));
  assert.deepEqual(out, { x: 99, y: 7 }, "the local move stands, the new drawing came in");
  assert.equal(leaf.conflict.up, false);
});

test("an element changed on both sides is written over by neither: both are shown", async () => {
  const start = canvas(el("x", 1));
  const disk = world(start);
  const leaf = tab(disk, start);
  leaf.room.goLocal("offline");
  edit(leaf.room, "x", 2);
  disk.set(canvas(el("x", 3)));
  const text = disk.text;
  await b.boardWentLocal.call(leaf, "offline");
  await tick();
  assert.equal(disk.writes.length, 0, "nothing was written over the disk");
  assert.equal(disk.text, text);
  assert.equal(leaf.conflict.up, true);
  assert.notEqual(leaf.revision, `r${disk.n}`, "the disk's revision is not taken");
  assert.equal(xs(JSON.parse(leaf.conflict.shown.mine)).x, 2);
  assert.equal(xs(JSON.parse(leaf.conflict.shown.disk.text)).x, 3);
});

test("an element deleted outside and edited here is a conflict too", async () => {
  const start = canvas(el("x", 1), el("z", 4));
  const disk = world(start);
  const leaf = tab(disk, start);
  leaf.room.goLocal("offline");
  edit(leaf.room, "x", 2);
  disk.set(canvas(el("z", 4)));
  await b.boardWentLocal.call(leaf, "offline");
  await tick();
  assert.equal(disk.writes.length, 0);
  assert.equal(leaf.conflict.up, true);
});

test("a late read of an older revision does not set the base after a newer hold", async () => {
  const start = canvas(el("x", 0));
  const disk = world(start);
  const leaf = tab(disk, start);
  // The read for r2 is slow; the board holds r3 meanwhile.
  disk.set(canvas(el("x", 1)));
  const slow = globalThis.__invoke;
  globalThis.__invoke = async (cmd, args) => {
    const answer = await slow(cmd, args);
    if (cmd === "read_text") await new Promise((r) => setTimeout(r, 30));
    return answer;
  };
  leaf.holdRevision(`r${disk.n}`);
  leaf.hold("r9", "T9");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(leaf.heldText, "T9");
  assert.equal(leaf.heldRevision, "r9");
  assert.equal(leaf.revision, "r9");
});

test("overwrite out of the room writes the room's board over the banner's revision, and is refused if the disk moved again", async () => {
  const start = canvas(el("x", 1));
  const disk = world(start);
  const leaf = tab(disk, start);
  leaf.room.goLocal("offline");
  edit(leaf.room, "x", 2);
  disk.set(canvas(el("x", 3)));
  await b.boardWentLocal.call(leaf, "offline");
  await tick();
  assert.equal(leaf.conflict.up, true);
  // The disk moves once more before the choice: refused, both shown anew.
  disk.set(canvas(el("x", 4)));
  await b.overwriteLocal.call(leaf);
  assert.equal(disk.writes.length, 0, "nothing was written over a disk the banner did not show");
  assert.equal(leaf.conflict.up, true);
  assert.equal(xs(JSON.parse(leaf.conflict.disk.text)).x, 4);
  // Chosen over what the banner shows now: the room's board is written.
  await b.overwriteLocal.call(leaf);
  assert.equal(disk.writes.length, 1);
  assert.equal(disk.writes[0].revision, `r${disk.n - 1}`);
  assert.equal(xs(onDisk(disk)).x, 2);
  assert.equal(leaf.conflict.up, false);
  assert.equal(leaf.revision, `r${disk.n}`);
});

test("sessions closed", () => {
  for (const s of globalThis.__sessions ?? []) s.leave();
});
