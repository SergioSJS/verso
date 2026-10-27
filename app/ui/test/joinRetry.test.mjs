// A synced folder's tab whose join found the host's live link not ready
// (the status says connected a moment before the link is) asks again with a
// growing wait, until it joins; it stops when the tab closes or moves on,
// when the link drops (the transition back takes over), or when the answer
// is a refusal of another kind.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const stub = {
  name: "stub",
  setup(build) {
    build.onResolve({ filter: /^@tauri-apps\/api\/(core|event|webviewWindow)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents:
        a.path === "@tauri-apps/api/core"
          ? "export const invoke = (cmd, args) => globalThis.__invoke(cmd, args); export const convertFileSrc = (p) => p; export const isTauri = () => false; export const addPluginListener = async () => ({}); export class Channel {}"
          : a.path === "@tauri-apps/api/event"
            ? "export const listen = async () => () => {}; export const emit = async () => {};"
            : "export const getCurrentWebviewWindow = () => ({ label: 'w' });",
      loader: "js",
      resolveDir: process.cwd(),
    }));
  },
};
await esbuild.build({
  stdin: { contents: 'export * from "./src/collab";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["yjs"],
  plugins: [stub],
  outfile: "test/.bundles/joinRetry.test-bundle.mjs",
  logLevel: "error",
});
const target = new EventTarget();
globalThis.window = globalThis;
globalThis.addEventListener = target.addEventListener.bind(target);
globalThis.dispatchEvent = target.dispatchEvent.bind(target);
globalThis.document ??= { documentElement: { lang: "pt-BR", style: {} }, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, append() {}, setAttribute() {} }) };
globalThis.navigator ??= { userAgent: "node" };
const c = await import("./.bundles/joinRetry.test-bundle.mjs");

const up = { on: true, state: "connected", role: "owner", live: true };
const down = { on: true, state: "offline", role: "owner", live: true };
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const sync = async (state) => {
  dispatchEvent(new CustomEvent("verso:sync-state", { detail: state }));
  await settle();
};

let linkUp = true;
let readOnly = false;
let side = "desktop";
let answers;
let joins;
let log;
beforeEach(async () => {
  answers = [];
  joins = 0;
  log = [];
  linkUp = true;
  side = "desktop";
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "capabilities") return { can: linkUp ? ["collab"] : [], host: side };
    if (cmd === "log_write") return void log.push(args.message);
    if (cmd === "collab_leave") return null;
    if (cmd === "collab_join") {
      joins++;
      const a = answers.shift() ?? "ok";
      if (a === "ok") return { read_only: readOnly, rolls: [], user: "Ana", kind: "text" };
      throw { kind: a, message: a };
    }
    return null;
  };
  linkUp = false;
  await sync(down);
  linkUp = true;
  await sync(up);
});

/** A tab as the leaves are: holds a room or not, joins when told. */
function tab(path) {
  const t = {
    path,
    room: null,
    closed: false,
    off: () => {},
    async join() {
      const room = await c.joinRoom(path, undefined, () => ({ release() {}, open: false }));
      if (this.closed || this.path !== path) return;
      this.room = room;
    },
    busy: false,
    joinRetried(p) {
      if (this.closed || p !== this.path || this.room || !c.joinPending(p)) return "gone";
      if (this.busy) return "busy";
      void this.join();
      return "started";
    },
  };
  t.off = c.onJoinRetry((p) => t.joinRetried(p));
  return t;
}
const wait = async (ms, mock) => {
  mock.timers.tick(ms);
  await settle();
};

import { mock } from "node:test";

test("a join answered unavailable asks again until the room is in, once live", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable", "unavailable"];
  const t = tab("a.md");
  await t.join();
  assert.equal(t.room, null);
  await wait(1500, mock);
  assert.equal(t.room, null);
  assert.equal(joins, 2);
  await wait(4000, mock);
  assert.ok(t.room);
  assert.equal(joins, 3);
  await wait(120000, mock);
  assert.equal(joins, 3, "no join after it is in");
  assert.equal(log.filter((l) => l.includes("not ready")).length, 1, "one line when retried");
  assert.equal(log.filter((l) => l.includes("joined after 2 retries")).length, 1);
  t.off();
});

test("a note-like tab (text) behaves the same: the shared mechanism, no timer of its own", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const t = tab("n.md");
  await t.join();
  await wait(1500, mock);
  assert.ok(t.room);
  assert.equal(joins, 2);
  t.off();
});

test("a tab closed during the wait never joins", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const t = tab("a.md");
  await t.join();
  t.closed = true;
  t.off();
  await wait(60000, mock);
  assert.equal(joins, 1);
});

test("a tab whose path changed during the wait never joins the old one", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const t = tab("a.md");
  await t.join();
  t.path = "b.md";
  await wait(60000, mock);
  assert.equal(joins, 1);
  t.off();
});

test("the link dropping during the wait: no retry storm; the way back rejoins", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const t = tab("a.md");
  await t.join();
  linkUp = false;
  await sync(down);
  await wait(120000, mock);
  assert.equal(joins, 1, "nothing asked while down");
  linkUp = true;
  await sync(up);
  assert.ok(t.room);
  assert.equal(joins, 2);
  t.off();
});

test("a busy tab (unsaved text) is asked again after the next wait, not given up", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["unavailable"];
  const t = tab("a.md");
  await t.join();
  t.busy = true;
  await wait(1500, mock);
  assert.equal(joins, 1, "not joined while busy");
  t.busy = false;
  await wait(4000, mock);
  assert.ok(t.room, "joined once it rested");
  t.off();
});

test("a tab that never had a pending join is not told when the link comes back", async () => {
  const t = tab("m.md");
  answers = ["ok"];
  await t.join();
  const before = joins;
  linkUp = false;
  await sync(down);
  linkUp = true;
  await sync(up);
  assert.equal(joins, before);
  t.off();
});

test("a join that never ran because the link was down is pending: the way back joins it", async () => {
  linkUp = false;
  await sync(down);
  const t = tab("d.md");
  await t.join();
  assert.equal(joins, 0);
  assert.ok(c.joinPending("d.md"));
  linkUp = true;
  await sync(up);
  assert.ok(t.room);
  assert.equal(joins, 1);
  assert.equal(c.joinPending("d.md"), false);
  assert.equal(log.filter((l) => l.includes("joined after")).length, 0, "no line for a join that was never retried");
  t.off();
});

test("a side that is not the synced desktop marks nothing pending", async () => {
  linkUp = false;
  side = "web";
  await sync(down);
  await c.joinRoom("w.md", undefined, () => ({}));
  assert.equal(c.joinPending("w.md"), false);
});

test("a read_only answer is not pending and leaves nothing to retry", async () => {
  answers = ["unavailable"];
  const t = tab("r.md");
  await t.join();
  assert.ok(c.joinPending("r.md"));
  readOnly = true;
  await c.joinRoom("r.md", undefined, () => ({}));
  assert.equal(c.joinPending("r.md"), false);
  readOnly = false;
  t.off();
});

test("two tabs of one path join one after the other: one join answered, the second shares", async () => {
  let inFlight = 0;
  let most = 0;
  const base = globalThis.__invoke;
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "collab_join") {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
    }
    return base(cmd, args);
  };
  await Promise.all([c.joinRoom("s.md", undefined, () => ({ release() {}, open: false })), c.joinRoom("s.md", undefined, () => ({ release() {}, open: false }))]);
  assert.equal(most, 1, "never two joins of the path at once");
});

test("a refusal of another kind is not retried", async (tc) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  tc.after(() => mock.timers.reset());
  answers = ["forbidden"];
  const t = tab("a.md");
  await t.join();
  await wait(120000, mock);
  assert.equal(joins, 1);
  assert.equal(t.room, null);
  t.off();
});
