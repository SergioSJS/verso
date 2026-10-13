// A board's session (boardRoom.ts) with the room played here and the
// board played by a pane that does what Excalidraw does when it is handed
// elements: it puts them in order by their fractional index and, where two
// share a place, gives one a new index — a new version of it, with a new
// nonce, made in place on the object it was handed (`syncInvalidIndices`).
// Every window does that to the same element, each with its own nonce;
// the versions must go to the room, and the windows settle on one (seen on
// macOS, 2026-10-13: each window drew two elements one version ahead of
// the room, never sent, for good).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

/** The host's contract, played here: a room that relays. */
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
  stdin: { contents: 'export * from "./src/boardRoom"; export * from "./src/collab"; export * from "./src/board/roomModel";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["yjs"],
  plugins: [stub],
  outfile: "test/.bundles/boardSession.test-bundle.mjs",
  logLevel: "error",
});
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
const b = await import("./.bundles/boardSession.test-bundle.mjs");

const b64 = (u) => Buffer.from(u).toString("base64");

/** The room: its document, and what it relays to each session, late. */
function room() {
  const doc = new Y.Doc();
  doc.getMap("meta").set("base", '{"nodes":[],"edges":[]}');
  const sessions = [];
  const queue = [];
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "collab_update") {
      api.sent++;
      Y.applyUpdate(doc, Buffer.from(args.update, "base64"));
      for (const s of sessions) if (s !== current) queue.push([s, args.update]);
    }
    return null;
  };
  let current = null;
  const api = {
    doc,
    join(n) {
      const s = new b.BoardSession(`Mesa.canvas`, { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r1", user: "Ana", epoch: "e1" }, { saved() {}, conflict() {}, closed() {}, remote() {} });
      s.n = n;
      sessions.push(s);
      return s;
    },
    /** `s` acts: what it sends is relayed as from it. */
    as(s, act) {
      current = s;
      act();
      current = null;
    },
    /** Everything relayed reaches its session. */
    sent: 0,
    async deliver() {
      // The sessions' beats (`PUSH_EVERY`), as from each.
      const beat = async () => {
        for (const s of sessions) {
          current = s;
          s.push();
          current = null;
        }
        await new Promise((r) => setTimeout(r, 0));
      };
      await beat();
      // At most so many at a time: two boards answering each other for
      // ever show as a count that keeps growing, not as a hang.
      for (let n = 0; queue.length && n < 50; n++) {
        const [s, u] = queue.shift();
        s.applyRemote(u);
        await beat();
      }
    },
  };
  return api;
}

/** A board, as Excalidraw keeps one: handed elements, it orders them and
 *  gives a new index — a new version, in place — to one that shares its
 *  place with the one before. */
function pane(session, r, layOut = null) {
  const p = {
    scene: [],
    apply(remote) {
      const merged = b.mergeScene(p.scene, remote, new Set(), (e) => session.mine(e));
      let prev = "";
      for (const e of merged) {
        if (e.isDeleted) continue;
        if (e.index <= prev) {
          e.index = `${prev}V`;
          e.version += 1;
          e.versionNonce = Math.floor(Math.random() * 2 ** 31);
        }
        prev = e.index;
        // An engine of its own: a text laid out its way, a new version.
        if (layOut && e.type === "text" && e.width !== layOut) {
          e.width = layOut;
          e.version += 1;
          e.versionNonce = Math.floor(Math.random() * 2 ** 31);
        }
      }
      p.scene = merged;
      const now = new Set(merged);
      // The board changed: it tells its room, as onChange does; what it
      // changed goes out on the session's own beat.
      session.scene(p.scene, "transparent", false);
      return remote.filter((e) => now.has(e)).map((e) => e.id);
    },
    people() {},
  };
  session.attach(p, []);
  return p;
}

const el = (id, index, nonce) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 1, versionNonce: nonce, index, groupIds: [], frameId: null });

test("a version a board makes of a remote element by itself goes to the room, and every window settles on one", async () => {
  const r = room();
  const sessions = [0, 1, 2, 3].map((n) => r.join(n));
  // Three windows draw the board; a fourth changes it with no board of its
  // own (a text face's edit, a rename's rewrite).
  const panes = sessions.slice(0, 3).map((s) => pane(s, r));
  try {
  r.as(sessions[0], () => sessions[0].seed([]));
  await r.deliver();
  // Two elements put in the same place: every board, handed both, gives
  // the second a place of its own — in place, its own nonce each.
  r.as(sessions[3], () => sessions[3].patch([el("x1", "a5", 11), el("x2", "a5", 22)]));
  for (let i = 0; i < 6; i++) await r.deliver();
  const roomEls = b.resolve(r.doc.getMap("elements").entries());
  const ranks = (els) => JSON.stringify([...els].filter((e) => e.id.startsWith("x")).map((e) => `${e.id}:${e.version}:${e.versionNonce}:${e.index}`).sort());
  const want = ranks(roomEls.values());
  if (process.env.DEBUG) { console.log("room", want); for (const p of panes) console.log("pane", ranks(p.scene)); }
  for (const [i, p] of panes.entries()) assert.equal(ranks(p.scene), want, `window ${i} draws what the room does not hold`);
  for (const [i, s] of sessions.entries()) assert.equal(ranks(s.resolved().values()), want, `window ${i} holds another room`);
  // Settled on one: the second element in a place of its own.
  const x = [...roomEls.values()].filter((e) => e.id.startsWith("x")).sort((a, c) => (a.index < c.index ? -1 : 1));
  assert.notEqual(x[0].index, x[1].index);
  } finally {
    for (const s of sessions) s.leave();
  }
});

test("two engines that lay a text out each their own way settle: the room's version stands, and the sending stops", async () => {
  const r = room();
  const sessions = [0, 1, 2].map((n) => r.join(n));
  // Two engines: one lays the text out 100 wide, the other 102.
  const panes = sessions.slice(0, 2).map((s, i) => pane(s, r, i === 0 ? 100 : 102));
  try {
    r.as(sessions[0], () => sessions[0].seed([]));
    await r.deliver();
    r.as(sessions[2], () => sessions[2].patch([{ ...el("t1", "a1", 5), type: "text", text: "olá", width: 90 }]));
    for (let i = 0; i < 40; i++) await r.deliver();
    const after = r.sent;
    for (let i = 0; i < 20; i++) await r.deliver();
    assert.equal(r.sent, after, "the two engines still answer each other");
    assert.ok(after < 40, `${after} updates for one text`);
    // The file is the room's, whatever each board shows.
    const roomEls = b.resolve(r.doc.getMap("elements").entries());
    assert.ok(roomEls.get("t1"));
  } finally {
    for (const s of sessions) s.leave();
    void panes;
  }
});
