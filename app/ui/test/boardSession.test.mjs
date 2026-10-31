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
    /** What is relayed so far reaches its session, at once, in this task. */
    deliverNow() {
      while (queue.length) {
        const [s, u] = queue.shift();
        s.applyRemote(u);
      }
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
function pane(session, r, layOut = null, layOutTimes = Infinity) {
  let laidOut = 0;
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
        if (layOut && e.type === "text" && e.width !== layOut && laidOut++ < layOutTimes) {
          e.width = layOut;
          e.version += 1;
          e.versionNonce = Math.floor(Math.random() * 2 ** 31);
        }
      }
      p.scene = merged;
      const now = new Map(merged.map((e) => [e.id, e]));
      // The board changed: it tells its room, as onChange does; what it
      // changed goes out on the session's own beat.
      session.scene(p.scene, "transparent", false);
      // Taken: the room's version, or a copy of it with its index repaired.
      return remote.filter((e) => now.get(e.id) === e || (now.get(e.id)?.version === e.version && now.get(e.id)?.versionNonce === e.versionNonce)).map((e) => e.id);
    },
    people() {},
  };
  session.attach(p, []);
  return p;
}

const el = (id, index, nonce) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 1, versionNonce: nonce, index, groupIds: [], frameId: null });

test("two elements in one place: every window draws them repaired alike, at the room's versions, and nothing is sent for it", async () => {
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
  const before = r.sent;
  r.as(sessions[3], () => sessions[3].patch([el("x1", "a5", 11), el("x2", "a5", 22)]));
  for (let i = 0; i < 6; i++) await r.deliver();
  const roomEls = b.resolve(r.doc.getMap("elements").entries());
  const ranks = (els) => JSON.stringify([...els].filter((e) => e.id.startsWith("x")).map((e) => `${e.id}:${e.version}:${e.versionNonce}`).sort());
  const drawn = (els) => JSON.stringify([...els].filter((e) => e.id.startsWith("x")).map((e) => `${e.id}:${e.index}`));
  const want = ranks(roomEls.values());
  if (process.env.DEBUG) { console.log("room", want); for (const p of panes) console.log("pane", ranks(p.scene), drawn(p.scene)); }
  // Every window draws the room's versions — none made one of its own —
  // and the same repaired order.
  for (const [i, p] of panes.entries()) assert.equal(ranks(p.scene), want, `window ${i} draws what the room does not hold`);
  for (const [i, s] of sessions.entries()) assert.equal(ranks(s.resolved().values()), want, `window ${i} holds another room`);
  assert.equal(want, JSON.stringify(["x1:1:11", "x2:1:22"]), "a version made for the repair");
  for (const p of panes.slice(1)) assert.equal(drawn(p.scene), drawn(panes[0].scene));
  const x = panes[0].scene.filter((e) => e.id.startsWith("x"));
  assert.deepEqual(x.map((e) => e.id), ["x1", "x2"]);
  assert.ok(x[0].index < x[1].index, `${x[0].index} < ${x[1].index}`);
  // Only the patch went to the room.
  assert.equal(r.sent - before, 1, "the repair was sent");
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

test("when the guard lets an engine's own layout stand, the board is handed the room's version once more and draws it", async () => {
  const r = room();
  const sessions = [0, 1, 2].map((n) => r.join(n));
  // Two engines lay the text out each its own way, answering each other,
  // on their first four intakes; after that each takes what it is handed.
  // The guard stops the sending, and the board is handed the room's
  // version once more: it draws it, not a layout of its own.
  const panes = [pane(sessions[0], r, 100, 4), pane(sessions[1], r, 102, 4)];
  try {
    r.as(sessions[0], () => sessions[0].seed([]));
    await r.deliver();
    r.as(sessions[2], () => sessions[2].patch([{ ...el("t1", "a1", 5), type: "text", text: "olá", width: 90 }]));
    for (let i = 0; i < 40; i++) await r.deliver();
    const roomT = b.resolve(r.doc.getMap("elements").entries()).get("t1");
    for (const [i, p] of panes.entries()) {
      const t = p.scene.find((e) => e.id === "t1");
      assert.equal(`${t.version}:${t.versionNonce}`, `${roomT.version}:${roomT.versionNonce}`, `window ${i} keeps a version of its own`);
    }
  } finally {
    for (const s of sessions) s.leave();
  }
});

/** A board as Excalidraw keeps its selection: changed at once by the
 *  board's own scene, and by a person's action (a key, a press) only when
 *  React renders, in a task of its own already queued. */
function selectingPane(session) {
  const p = {
    scene: [],
    selected: new Set(),
    /** A press selects `id`: drawn in a task to come. */
    press(id) {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => {
        port1.close();
        p.selected.add(id);
      };
      port2.postMessage(null);
    },
    apply(remote) {
      const merged = b.mergeScene(p.scene, remote, new Set(), (e) => session.mine(e));
      // view.tsx: what the room deleted leaves the selection first.
      for (const e of merged) if (e.isDeleted) p.selected.delete(e.id);
      p.scene = merged;
      session.scene(p.scene, "transparent", false);
      const now = new Map(merged.map((e) => [e.id, e]));
      return remote.filter((e) => now.get(e.id)?.version === e.version && now.get(e.id)?.versionNonce === e.versionNonce).map((e) => e.id);
    },
    people() {},
  };
  session.attach(p, []);
  return p;
}

test("an element another deletes as this person's own press selects it is never drawn selected and deleted", async () => {
  const r = room();
  const [a, other] = [0, 1].map((n) => r.join(n));
  const pane = selectingPane(a);
  try {
    r.as(a, () => a.seed([]));
    r.as(other, () => other.patch([el("x", "a1", 5)]));
    await r.deliver();
    assert.ok(pane.scene.some((e) => e.id === "x" && !e.isDeleted));
    // The press selects x, to be drawn in a task already queued; the other
    // window's deletion of x arrives in this very task.
    pane.press("x");
    r.as(other, () => other.patch([{ ...el("x", "a1", 6), version: 9, isDeleted: true }]));
    r.deliverNow();
    for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 5));
    assert.ok(pane.scene.some((e) => e.id === "x" && e.isDeleted), "the deletion was drawn");
    assert.ok(!pane.selected.has("x"), "a deleted element left selected");
  } finally {
    for (const s of [a, other]) s.leave();
  }
});

/** A shadow (ADR 0113 H): the room told this window it is in one. */
function shadowSession(refuse, unseeded = false) {
  let refusals = refuse;
  const doc = new Y.Doc();
  const els = doc.getMap("elements");
  const a = { id: "c1", type: "embeddable", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 3, versionNonce: 9, index: "a1", groupIds: [], frameId: null, customData: { canvas: { id: "c1", type: "file", file: "Nada.md" } } };
  els.set("c1\n3\n9", JSON.stringify(a));
  doc.getMap("meta").set("base", '{"nodes":[],"edges":[]}');
  doc.getMap("meta").set("shadow", true);
  if (!unseeded) doc.getMap("meta").set("seeded", true);
  const calls = [];
  globalThis.__updates = [];
  globalThis.__invoke = async (cmd, args) => {
    calls.push(cmd);
    if (cmd === "collab_update") globalThis.__updates.push(args.update);
    if (cmd === "collab_update" && refusals > 0) {
      refusals--;
      throw { kind: "refused", message: "no" };
    }
    if (cmd === "collab_join" && globalThis.__joinFails) throw new Error("link down");
    if (cmd === "collab_join" && globalThis.__joinDelay) await new Promise((r) => setTimeout(r, globalThis.__joinDelay));
    if (cmd === "collab_join") return { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r2", epoch: "e1", read_only: false, kind: "board", user: "Ana" };
    return null;
  };
  const closed = [];
  const s = new b.BoardSession("Mesa.canvas", { update: b64(Y.encodeStateAsUpdate(doc)), revision: "r1", user: "Ana", epoch: "e1" }, { saved() {}, conflict() {}, closed: (why) => closed.push(why ?? "closed"), remote() {} });
  return { s, a, calls, closed };
}

test("a shadow never sends an element the board only bumped: same substance, new version", async () => {
  const { s, a, calls } = shadowSession(0);
  try {
    const p = { apply: () => [], people() {} };
    s.attach(p, []);
    for (let i = 0; i < 5; i++) {
      s.scene([{ ...a, version: 4 + i, versionNonce: 100 + i, seed: i }], "transparent", false);
      s.push();
    }
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.filter((c) => c === "collab_update").length, 0);
    // Bringing it to the front is a change, and goes.
    s.scene([{ ...a, version: 12, versionNonce: 4, index: "zz" }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.filter((c) => c === "collab_update").length, 1);
    // A real change goes.
    s.scene([{ ...a, version: 20, versionNonce: 5, x: 50 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.filter((c) => c === "collab_update").length, 2);
  } finally {
    s.leave();
  }
});

test("a refused change in a shadow: one rejoin, the room's truth back in place, the view and the other elements kept, later edits sent", async () => {
  const { s, a, calls, closed } = shadowSession(1);
  const other = { ...a, id: "c2", index: "a2", version: 1, versionNonce: 2, customData: { canvas: { id: "c2", type: "text", text: "x" } } };
  // The room holds c1 only; c2 is the window's own, never accepted.
  const view = { scrollX: 240, scrollY: -130, zoom: 0.6 };
  let scene = [a];
  const told = [];
  const p = {
    apply(remote) {
      told.push(remote.map((e) => `${e.id}:${e.isDeleted ? "gone" : "in"}:${e.x}`));
      const m = new Map(scene.map((e) => [e.id, e]));
      for (const e of remote) m.set(e.id, e);
      scene = [...m.values()];
      s.scene(scene, "transparent", false);
      return remote.map((e) => e.id);
    },
    people() {},
  };
  try {
    s.attach(p, []);
    const moved = { ...a, version: 20, versionNonce: 5, x: 50 };
    scene = [moved, other];
    s.scene(scene, "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.filter((c) => c === "collab_join").length, 1, "one rejoin");
    assert.deepEqual(closed, [], "never closed");
    // c1 back to the room's x, c2 (never accepted) gone; the view is the board's own.
    assert.ok(told.some((t) => t.includes("c2:gone:0") && t.includes("c1:in:0")), JSON.stringify(told));
    assert.ok(scene.find((e) => e.id === "c2").isDeleted && scene.find((e) => e.id === "c1").x === 0);
    assert.deepEqual(view, { scrollX: 240, scrollY: -130, zoom: 0.6 });
    // A following change reaches the room.
    const before = calls.filter((c) => c === "collab_update").length;
    s.scene([{ ...scene.find((e) => e.id === "c1"), version: 30, versionNonce: 8, x: 70 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.filter((c) => c === "collab_update").length, before + 1, "later edits are sent");
    assert.equal(calls.filter((c) => c === "collab_join").length, 1);
  } finally {
    s.leave();
  }
});

test("refused again within moments with no change of the person's: no second rejoin, stopped and said once", async () => {
  const { s, a, calls, closed } = shadowSession(5);
  s.attach({ apply: () => [], people() {} }, []);
  s.scene([{ ...a, version: 20, versionNonce: 5, x: 50 }], "transparent", true);
  s.push();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.filter((c) => c === "collab_join").length, 1);
  // The window re-sends with no change of the person's: refused again.
  s.scene([{ ...a, version: 21, versionNonce: 6, x: 60 }], "transparent", false);
  s.push();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.filter((c) => c === "collab_join").length, 1, "no second rejoin");
  assert.deepEqual(closed, ["refused"]);
});

test("edits made while the room's state is on its way are kept, not undone, and sent after it is in", async () => {
  globalThis.__joinDelay = 60;
  const { s, a, calls, closed } = shadowSession(1);
  const mine = { ...a, id: "new1", index: "a9", version: 1, versionNonce: 3, x: 5, customData: { canvas: { id: "new1", type: "text", text: "hi" } } };
  let scene = [a];
  const p = {
    apply(remote) {
      const m = new Map(scene.map((e) => [e.id, e]));
      for (const e of remote) if (!(m.get(e.id) && s.mine(m.get(e.id)))) m.set(e.id, e);
      scene = [...m.values()];
      s.scene(scene, "transparent", false);
      return remote.map((e) => e.id);
    },
    people() {},
  };
  try {
    s.attach(p, []);
    s.scene([{ ...a, version: 20, versionNonce: 5, x: 50 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 20));
    // The refusal is answered; the room's state is still on its way.
    scene = [{ ...a, version: 20, versionNonce: 5, x: 50 }, mine];
    s.scene(scene, "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(closed, []);
    assert.equal(calls.filter((c) => c === "collab_join").length, 1);
    const sentNew = scene.find((e) => e.id === "new1");
    assert.ok(sentNew && !sentNew.isDeleted, "what the person made meanwhile is kept");
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(calls.filter((c) => c === "collab_update").length >= 2, "and sent after the state came in");
    // The batch after the rejoin carries what she did meanwhile, not the refused change.
    const later = new Y.Doc();
    Y.applyUpdate(later, Buffer.from(globalThis.__updates.at(-1), "base64"));
    const keys = [...later.getMap("elements").keys()];
    assert.ok(keys.some((k) => k.startsWith("new1\n")), keys.join("|"));
    assert.ok(!keys.some((k) => k.startsWith("c1\n20")), "the refused element is not sent again");
  } finally {
    globalThis.__joinDelay = 0;
    s.leave();
  }
});

test("a rejoin that fails is the old way out: the board is read anew, nothing stays stuck", async () => {
  globalThis.__joinFails = true;
  const { s, a, closed } = shadowSession(1);
  try {
    s.attach({ apply: () => [], people() {} }, []);
    s.scene([{ ...a, version: 20, versionNonce: 5, x: 50 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(closed, ["lost"]);
    assert.equal(s.rejoining, false);
  } finally {
    globalThis.__joinFails = false;
  }
});

test("a room not drawn into yet: the refused change is not drawn into it, and the board goes back to the file's version", async () => {
  const { s, a } = shadowSession(1, true);
  let scene = [];
  const p = {
    apply(remote) {
      const m = new Map(scene.map((e) => [e.id, e]));
      for (const e of remote) m.set(e.id, e);
      scene = [...m.values()];
      s.scene(scene, "transparent", false);
      return remote.map((e) => e.id);
    },
    people() {},
  };
  s.attach(p, [{ ...a, version: 1, versionNonce: 1 }]);
  const room = s.doc.getMap("elements");
  assert.ok(room.size >= 1, "seeded");
  scene = [{ ...a, version: 1, versionNonce: 1 }];
  s.scene(scene, "transparent", false);
  const moved = { ...a, version: 20, versionNonce: 5, x: 50 };
  scene = [moved];
  s.scene(scene, "transparent", true);
  s.push();
  await new Promise((r) => setTimeout(r, 80));
  const back = scene.find((e) => e.id === "c1");
  assert.equal(back.x, 0, "back to the file's version");
  assert.equal(back.version, 3, "the room's version");
  const held = [...s.doc.getMap("elements").values()].map((v) => JSON.parse(v));
  assert.ok(held.every((e) => e.x !== 50), "the refused change is not in the room's document");
  s.leave();
});

test("the file of a shadow's board is sent again once every update is answered: the room set aside one made while an update was on its way", async () => {
  const { s, a, calls } = shadowSession(0);
  const order = [];
  const inner = globalThis.__invoke;
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "collab_update") await new Promise((r) => setTimeout(r, 400));
    const out = await inner(cmd, args);
    order.push(cmd);
    return out;
  };
  try {
    s.attach({ apply: () => [], people() {} }, []);
    s.scene([{ ...a, version: 20, versionNonce: 5, x: 50 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 100));
    // Another change while the first is unanswered: it waits behind it.
    s.scene([{ ...a, version: 30, versionNonce: 6, x: 60 }], "transparent", true);
    s.push();
    await new Promise((r) => setTimeout(r, 1600));
    const canvases = order.filter((c) => c === "collab_canvas");
    assert.ok(canvases.length >= 2, order.join(","));
    assert.equal(order.at(-1) === "collab_canvas" || order.lastIndexOf("collab_canvas") > order.lastIndexOf("collab_update"), true, "the last file goes after the last update is answered");
    void calls;
  } finally {
    s.leave();
  }
});
