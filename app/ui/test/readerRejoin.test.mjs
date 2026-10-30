// A reader (the server says `read_only: true` with an epoch) stays in the
// room across reconnections and sends nothing; its one-shot visit leaves the
// room it was put in (night review 2026-10-30, I1, I2, M5).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

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
  outfile: "test/.bundles/readerRejoin.test-bundle.mjs",
  logLevel: "error",
});
const target = new EventTarget();
globalThis.window = globalThis;
globalThis.addEventListener = target.addEventListener.bind(target);
globalThis.dispatchEvent = target.dispatchEvent.bind(target);
globalThis.document ??= { documentElement: { lang: "pt-BR", style: {} }, getElementById: () => null, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, append() {}, setAttribute() {} }) };
globalThis.navigator ??= { userAgent: "node" };
const c = await import("./.bundles/readerRejoin.test-bundle.mjs");

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};
const b64 = (u) => Buffer.from(u).toString("base64");
const state = (text) => {
  const d = new Y.Doc();
  d.getText("verso").insert(0, text);
  return b64(Y.encodeStateAsUpdate(d));
};

let calls;
let epoch;
let readOnly;
beforeEach(() => {
  calls = [];
  epoch = "e1";
  readOnly = true;
  globalThis.__invoke = async (cmd, args) => {
    calls.push(cmd);
    if (cmd === "capabilities") return { can: ["collab"], host: "server" };
    if (cmd === "collab_join") return { read_only: readOnly, epoch, kind: "text", update: state("um\n"), revision: "r", rolls: [], user: "Ana" };
    // The server refuses a reader's update before looking at it.
    if (cmd === "collab_update" && readOnly) throw { kind: "refused", message: "refused" };
    return null;
  };
});

function handlers(log) {
  return { saved() {}, conflict() {}, remote() {}, closed: (why) => log.push(`closed:${why ?? ""}`) };
}

test("a reader rejoining the same room pushes nothing and is not thrown out", async () => {
  const log = [];
  const s = await c.joinCollab("a.md", handlers(log));
  assert.ok(s?.reader);
  dispatchEvent(new CustomEvent("verso:reconnected"));
  await settle();
  assert.equal(calls.filter((x) => x === "collab_update").length, 0, "a reader never sends");
  assert.deepEqual(log, [], "no closed, no false 'could not be kept'");
  assert.ok(s.live && s.open);
  s.leave();
});

test("a reader whose document took the disk's text is remade from the room, nothing pushed", async () => {
  const log = [];
  const s = await c.joinCollab("b.md", handlers(log));
  // What yCollab does for a `fromDisk` change outside a live room.
  s.doc.getText("verso").insert(0, "DISK");
  dispatchEvent(new CustomEvent("verso:reconnected"));
  await settle();
  assert.equal(calls.filter((x) => x === "collab_update").length, 0, "the disk's text never goes to the room");
  assert.deepEqual(log, ["closed:"], "the editor is remade, with no 'lost' line");
});

test("a writer still sends its state on a rejoin (control)", async () => {
  readOnly = false;
  const log = [];
  const s = await c.joinCollab("w.md", handlers(log));
  dispatchEvent(new CustomEvent("verso:reconnected"));
  await settle();
  assert.equal(calls.filter((x) => x === "collab_update").length, 1);
  s.leave();
});

test("a reader's visit leaves the room it was put in", async () => {
  const v = await c.roomSide.visit("v.md");
  assert.equal(v, null);
  assert.equal(calls.filter((x) => x === "collab_leave").length, 1, "left");
});

test("a visit to a file in no room (mixed line ends) has nothing to leave", async () => {
  epoch = "";
  const v = await c.roomSide.visit("m.md");
  assert.equal(v, null);
  assert.equal(calls.filter((x) => x === "collab_leave").length, 0);
});

test("a writer's visit still works and leaves once", async () => {
  readOnly = false;
  const v = await c.roomSide.visit("x.md");
  assert.ok(v);
  assert.equal(v.text(), "um\n");
  await v.leave();
  assert.equal(calls.filter((x) => x === "collab_leave").length, 1);
});
