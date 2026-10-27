// A board out of its room (a synced folder's link dropped) while the file
// is changed from outside (sync bringing the players' drawings down): the
// board's save must not write over them (invariant 11; the loss of
// 2026-10-26, a game master's edit wrote the old board over seven
// drawn elements).

import { test } from "node:test";
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
          ? "export const invoke = (cmd, args) => globalThis.__invoke(cmd, args);"
          : a.path === "@tauri-apps/api/event"
            ? "export const listen = async () => () => {}; export const emit = async () => {};"
            : "export const getCurrentWebviewWindow = () => ({ label: 'w' });",
      loader: "js",
    }));
  },
};
await esbuild.build({
  stdin: { contents: 'export * from "./src/boardRoom"; export * from "./src/board/roomModel"; export * from "./src/board/outside"; export { toElements } from "./src/board/model";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["yjs"],
  plugins: [stub],
  outfile: "test/.bundles/boardOutside.test-bundle.mjs",
  logLevel: "error",
});
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.__invoke = async () => null;
const b = await import("./.bundles/boardOutside.test-bundle.mjs");

const drawn = (id, extra = {}) => ({ id, type: "freedraw", x: 0, y: 0, width: 5, height: 5, isDeleted: false, version: 1, versionNonce: 7, index: `a${id}`, groupIds: [], frameId: null, ...extra });
const card = (text) => ({ id: "c1", type: "text", x: 0, y: 0, width: 100, height: 50, text });
const canvas = (text, drawing) => ({ nodes: [card(text)], edges: [], verso: { version: 1, drawing } });
const b64 = (u) => Buffer.from(u).toString("base64");

function session(base) {
  const doc = new Y.Doc();
  doc.getMap("meta").set("base", JSON.stringify(base));
  const s = new b.BoardSession("Mesa.canvas", { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r1", user: "Ana", epoch: "e1" }, { saved() {}, conflict() {}, closed() {}, remote() {} }, true);
  s.seed(b.toElements(base));
  return s;
}
const nonce = () => 99;
const ids = (c) => (c.verso?.drawing ?? []).map((d) => d.id).sort();

test("the old save: the room's board, written over the file, lacks what sync brought down", () => {
  const s = session(canvas("antes", []));
  s.goLocal("offline");
  // The GM edits the text on the board while the link is down.
  s.patch(b.patchFromCanvas(s.resolved(), b.toElements(canvas("depois", [])), canvas("antes", []), canvas("depois", []), nonce));
  // This is what the save wrote: no drawing of the players.
  assert.deepEqual(ids(s.canvas()), []);
  s.leave();
});

test("outside news are taken in, the local edit kept: the save holds both", () => {
  const was = canvas("antes", []);
  const s = session(was);
  s.goLocal("offline");
  const disk = canvas("antes", [drawn("d1"), drawn("d2"), drawn("r1", { type: "rectangle" })]);
  const text = JSON.stringify(disk);
  assert.equal(b.changedOutside("r1", "r2"), true);
  assert.equal(b.takeOutsideIn(s, b.toElements, JSON.stringify(was), text, nonce).ok, true);
  s.patch(b.patchFromCanvas(s.resolved(), b.toElements(canvas("depois", disk.verso.drawing)), disk, canvas("depois", disk.verso.drawing), nonce));
  const out = s.canvas();
  assert.deepEqual(ids(out), ["d1", "d2", "r1"]);
  assert.equal(out.nodes.find((n) => n.id === "c1").text, "depois");
  s.leave();
});

test("an element the room holds just so is not touched again", () => {
  const was = canvas("antes", [drawn("d1")]);
  const s = session(was);
  const before = s.resolved().get("d1").version;
  assert.equal(b.takeOutsideIn(s, b.toElements, JSON.stringify(canvas("antes", [])), JSON.stringify(was), nonce).ok, true);
  assert.equal(s.resolved().get("d1").version, before);
  s.leave();
});

test("a file that is not a board is not taken in", () => {
  const s = session(canvas("antes", []));
  assert.equal(b.takeOutsideIn(s, b.toElements, "{}", "not json", nonce).ok, false);
  s.leave();
});

test("an element deleted outside is deleted in the board, one the board changed stays", () => {
  const was = canvas("antes", [drawn("d1"), drawn("d2")]);
  const s = session(was);
  s.goLocal("offline");
  const disk = canvas("antes", [drawn("d1")]);
  assert.equal(b.takeOutsideIn(s, b.toElements, JSON.stringify(was), JSON.stringify(disk), nonce).ok, true);
  assert.deepEqual(ids(s.canvas()), ["d1"]);
  s.leave();
});
