// The board's tab functions (leaves/boardLive.ts: roomsBack, joinRetried,
// joinBoardRoom) over the real collab.ts and a real board session, with the
// host's join played here: a join answered "unavailable" is asked again, and
// what the person typed or drew while a join was on its way is never
// replaced (the tab stays local, the room joined is let go, the join is
// asked again). A text or note tab's `load(path, force, retry)` carries the
// same guard (leaves/textfile.ts, note.ts); those classes cannot be built
// without the app's boot (main.ts), so the guard is read there.

import { test, mock, beforeEach } from "node:test";
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
  stdin: { contents: 'export * from "./src/leaves/boardLive"; export * from "./src/collab";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["yjs"],
  plugins: [stub],
  outfile: "test/.bundles/joinRetryLeaf.test-bundle.mjs",
  logLevel: "error",
});
const target = new EventTarget();
globalThis.window = globalThis;
globalThis.addEventListener = target.addEventListener.bind(target);
globalThis.dispatchEvent = target.dispatchEvent.bind(target);
globalThis.document ??= { documentElement: { lang: "pt-BR", style: {} }, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, append() {}, setAttribute() {} }) };
globalThis.navigator ??= { userAgent: "node" };
const b = await import("./.bundles/joinRetryLeaf.test-bundle.mjs");

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};
const sync = async (on) => {
  linkUp = on;
  dispatchEvent(new CustomEvent("verso:sync-state", { detail: { on: true, state: on ? "connected" : "offline", role: "owner", live: true } }));
  await settle();
};
const b64 = (u) => Buffer.from(u).toString("base64");
const text = JSON.stringify({ nodes: [{ id: "c1", type: "text", x: 0, y: 0, width: 100, height: 50, text: "x" }], edges: [], verso: { version: 1, drawing: [] } });

let linkUp, answers, joins, leaves, held;
beforeEach(async () => {
  // (sessions of the test before are let go, or the link's way back rejoins them)
  for (const x of b.syncedSessions()) x.leave();
  linkUp = true;
  answers = [];
  joins = 0;
  leaves = 0;
  held = null;
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "capabilities") return { can: linkUp ? ["collab"] : [], host: "desktop" };
    if (cmd === "collab_leave") return void leaves++;
    if (cmd === "collab_join") {
      joins++;
      const a = answers.shift() ?? "ok";
      if (a === "hold") await new Promise((r) => (held = r));
      else if (a !== "ok") throw { kind: a, message: a };
      const doc = new Y.Doc();
      doc.getMap("meta").set("base", text);
      return { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r1", user: "Ana", epoch: "e1", kind: "board", read_only: false, rolls: [] };
    }
    return null;
  };
  await sync(false);
  await sync(true);
});

/** A board tab as boardLive.ts sees it, with the tab's own load played as board.ts runs it. */
function leaf(path) {
  const l = {
    path,
    room: null,
    roomless: false,
    joining: false,
    loadsRunning: 0,
    torn: false,
    textEdited: false,
    pendingBoard: null,
    dirty: false,
    retryBailed: false,
    shown: 0,
    catching: false,
    liveOthers: [],
    roomHandlers: { saved() {}, conflict() {}, closed() {}, remote() {} },
    conflict: { up: false },
    layoutIsKept: () => true,
    paintLive() {},
    roomChanged() {},
    unmountBoard() {},
    async flush() {
      return true;
    },
    touchedSince() {
      return this.torn || this.textEdited || this.pendingBoard !== null || this.dirty;
    },
    async load(p, force, retry = false) {
      this.loadsRunning++;
      try {
        this.retryBailed = false;
        await b.joinBoardRoom.call(this, p, text, retry ? () => this.touchedSince() : undefined);
        // (as board.ts loadBoard: a bailed retry shows nothing over what was drawn)
        if (retry && this.room === null && this.touchedSince()) return void (this.retryBailed = true);
        this.shown++;
      } finally {
        this.loadsRunning--;
      }
    },
  };
  l.roomsBack = b.roomsBack;
  l.joinRetried = b.joinRetried;
  l.off = b.onJoinRetry((p) => l.joinRetried(p));
  return l;
}
const wait = async (ms) => {
  mock.timers.tick(ms);
  await settle();
};

test("a board opened while the join answers unavailable joins by itself, once", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const l = leaf("Mesa0.canvas");
  await l.load("Mesa0.canvas", false);
  assert.equal(l.room, null);
  await wait(1500);
  assert.ok(l.room);
  assert.equal(joins, 2);
  await wait(200000);
  assert.equal(joins, 2);
  l.off();
});

test("typed meanwhile: the join on its way is let go, the text stays, the join is asked again and lands", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "hold"];
  const l = leaf("Mesa1.canvas");
  await l.load("Mesa1.canvas", false);
  await wait(1500);
  assert.equal(joins, 2, "the retry's join is on its way");
  l.textEdited = true; // the person types on the text face
  held();
  await settle();
  assert.equal(l.room, null, "no room replaced what was typed");
  assert.equal(leaves, 1, "the session joined is let go");
  assert.equal(l.textEdited, true);
  l.textEdited = false; // saved meanwhile
  await wait(4000);
  assert.ok(l.room, "asked again, it lands");
  l.off();
});

test("drawn meanwhile (a pending board) is never replaced either", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "hold"];
  const l = leaf("Mesa2.canvas");
  await l.load("Mesa2.canvas", false);
  await wait(1500);
  l.pendingBoard = "{}";
  held();
  await settle();
  assert.equal(l.room, null);
  l.pendingBoard = null;
  await wait(4000);
  assert.ok(l.room);
  l.off();
});

test("drawn during the held join: the board is not reloaded from the disk's text, the drawing stays pending, the next ask joins", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "hold"];
  const l = leaf("Drawn.canvas");
  await l.load("Drawn.canvas", false);
  const shownBefore = l.shown;
  await wait(1500);
  l.pendingBoard = "J";
  held();
  await settle();
  assert.equal(l.room, null);
  assert.equal(l.shown, shownBefore, "showBoard (board.load of the disk's text) did not run");
  assert.equal(l.pendingBoard, "J", "the drawing is still pending, to be saved");
  l.pendingBoard = null; // saved
  await wait(4000);
  assert.ok(l.room);
  l.off();
});

test("a busy split-view tab is asked again after the other joined, and shares its room", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "unavailable"];
  const one = leaf("Busy.canvas");
  const two = leaf("Busy.canvas");
  await one.load("Busy.canvas", false);
  await two.load("Busy.canvas", false);
  two.textEdited = true;
  await wait(1500);
  assert.ok(one.room);
  assert.equal(two.room, null, "the busy tab kept its text");
  two.textEdited = false;
  await wait(4000);
  assert.equal(two.room, one.room, "it shares the room once it rests");
  one.off();
  two.off();
});

test("a tab destroyed while the join is on its way takes no room", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "hold"];
  const l = leaf("Mesa3.canvas");
  await l.load("Mesa3.canvas", false);
  await wait(1500);
  l.torn = true;
  l.off();
  held();
  await settle();
  assert.equal(l.room, null);
  assert.equal(leaves, 1);
  await wait(200000);
  assert.equal(joins, 2, "nothing asked again");
});

test("a board with unsaved text when the wait ends is asked again, never given up", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const l = leaf("Mesa4.canvas");
  await l.load("Mesa4.canvas", false);
  l.textEdited = true;
  await wait(1500);
  assert.equal(joins, 1);
  l.textEdited = false;
  await wait(4000);
  assert.ok(l.room);
  l.off();
});

test("split view: two tabs of one board join one after the other, one room, one join", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "unavailable"];
  const one = leaf("Split.canvas");
  const two = leaf("Split.canvas");
  await one.load("Split.canvas", false);
  await two.load("Split.canvas", false);
  assert.equal(joins, 2, "both asked once, one after the other");
  await wait(1500);
  assert.ok(one.room && two.room);
  assert.equal(one.room, two.room, "one session for both tabs");
  assert.equal(joins, 3, "the retry made one join, the second tab shared it");
  one.off();
  two.off();
});

test("a tab with no pending join is not reloaded when the link comes back", async () => {
  const l = leaf("Mesa6.canvas");
  const before = joins; // (this tab never tried a join: nothing is pending for it)
  await sync(false);
  await sync(true);
  assert.equal(joins, before);
  assert.equal(l.loadsRunning, 0);
  l.off();
});
