// A board edited hard by several windows at once, with the window's own
// code (ADR 0082 item 12; the maintainer, 2026-10-12: "tenho receio de
// quebrar algo em edições conjuntas"): each window keeps an Excalidraw
// scene and a Yjs document as boardRoom.ts does — what it changed sent by
// `changedElements`, a deletion jumped ahead by `sendable`, what the
// others changed merged by `mergeScene` around the element it is busy
// with — and a relay plays the server, delivering late and out of order.
// After each seed: every window holds the same elements and the same
// scene; the file the room's state makes (`canvasOf`, the board's own
// converter) is a JSON Canvas — ids unique, every node's fields, every
// edge's ends among the nodes — and reads back through `toElements` and
// `fromElements` as the same file. The server's side, with the network
// and the disk, is `tests_board_stress.rs`.
//
// `npm test` runs a few seeds; `BOARD_STRESS_SEEDS=200 BOARD_STRESS_OPS=200
// node --test test/boardStress.test.mjs` the long run.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

await esbuild.build({
  stdin: { contents: 'export * from "./src/board/roomModel"; export * from "./src/board/model";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/boardStress.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/boardStress.test-bundle.mjs");

const SEEDS = Number(process.env.BOARD_STRESS_SEEDS ?? 12);
const OPS = Number(process.env.BOARD_STRESS_OPS ?? 150);
const WINDOWS = 5;
const BASE = { nodes: [], edges: [], "x-kept": "by every write" };

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  return { below: (n) => (n > 0 ? next() % n : 0), chance: (p) => next() % 100 < p, nonce: () => next() % 2 ** 31, shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = next() % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
}

/** A window: its scene, its document, and what its board last agreed on
 *  with the room (`known`), as boardRoom.ts keeps them. */
function windowOf(n) {
  const doc = new Y.Doc();
  const w = { n, doc, entries: doc.getMap("elements"), scene: [], known: new Map(), busy: null, out: [], inbox: [], made: 0 };
  doc.on("update", (u, origin) => {
    if (origin !== "remote") w.out.push(u);
  });
  w.entries.observe((ev) => {
    if (ev.transaction.origin !== "remote") return;
    const ids = new Set([...ev.keysChanged].map((k) => m.parseKey(k)?.id).filter(Boolean));
    const all = m.resolve(w.entries.entries());
    take(w, [...ids].map((id) => all.get(id)).filter(Boolean));
  });
  return w;
}

/** The room's elements into the board (BoardSession.pull and the board's
 *  pane): merged around what is the window's own or busy; what was taken
 *  in is agreed on. */
function take(w, remote) {
  if (process.env.DEBUG_ID) for (const r of remote) if (r.id === process.env.DEBUG_ID) { const l = w.scene.find((x) => x.id === r.id); console.log(`w${w.n} hears v${r.version}/${r.isDeleted} local v${l?.version}/${l?.isDeleted} busy=${w.busy}`); }
  w.scene = m.mergeScene(w.scene, remote, new Set(w.busy ? [w.busy] : []), (e) => m.unsent(e, w.known));
  const now = new Set(w.scene);
  for (const r of remote) if (now.has(r)) w.known.set(r.id, m.rankOf(r));
}

/** What the window changed goes to the room, as BoardSession.push does;
 *  then what the board shows behind the room takes the room's. */
function push(w) {
  const held = m.resolve(w.entries.entries());
  const changed = m.changedElements(w.scene, w.known);
  w.doc.transact(() => {
    for (const raw of changed) {
      const e = m.sendable(raw, held.get(raw.id));
      if (process.env.DEBUG_ID === e.id) console.log(`w${w.n} push v${e.version} del=${e.isDeleted} held=${held.get(raw.id)?.version}/${held.get(raw.id)?.isDeleted}`);
      const r = m.rankOf(e);
      for (const k of m.outrankedKeys(w.entries.keys(), e.id, r)) w.entries.delete(k);
      w.entries.set(m.entryKey(e.id, r), JSON.stringify(e));
      w.known.set(e.id, m.rankOf(raw));
    }
  }, "board");
  const room = m.resolve(w.entries.entries());
  const behind = w.scene
    .filter((e) => !m.unsent(e, w.known) && room.has(e.id))
    .map((e) => room.get(e.id))
    .filter((r) => { const l = w.scene.find((x) => x.id === r.id); return m.rankOf(l).version !== m.rankOf(r).version || m.rankOf(l).nonce !== m.rankOf(r).nonce; });
  if (behind.length) take(w, behind);
}

/** The element as Excalidraw makes a new version of it. */
const bump = (e, k, nonce, more = {}) => ({ ...e, version: (e.version ?? 1) + k, versionNonce: nonce, ...more });
/** Every deletion and every undo of one, by element. */
const deleted = new Set();
const restored = new Set();
const full = (e, nonce, index) => ({ isDeleted: false, version: 1, versionNonce: nonce, index, groupIds: [], frameId: null, ...e });

function act(w, r) {
  const live = w.scene.filter((e) => !e.isDeleted);
  const cards = live.filter((e) => m.isNode(e) && e.type === "embeddable");
  const arrows = live.filter((e) => e.type === "arrow");
  const gone = w.scene.filter((e) => e.isDeleted);
  const pick = (list) => (list.length ? list[r.below(list.length)] : null);
  const id = `w${w.n}e${++w.made}`;
  const index = `a${String(w.made * 7 + r.below(5)).padStart(6, "0")}${w.n}`;
  const nonce = r.nonce();
  const at = [r.below(2000) - 1000, r.below(2000) - 1000];
  const put = (e) => {
    if (process.env.DEBUG_ID === e.id) console.log(`w${w.n} put v${e.version} n${e.versionNonce} del=${e.isDeleted}`);
    const i = w.scene.findIndex((x) => x.id === e.id);
    if (i >= 0) w.scene[i] = e;
    else w.scene.push(e);
  };
  const what = r.below(100);
  if (what < 10) put(full({ id, type: r.chance(50) ? "rectangle" : "ellipse", x: at[0], y: at[1], width: 100, height: 60 }, nonce, index));
  else if (what < 16) put(full({ id, type: "text", x: at[0], y: at[1], width: 80, height: 20, text: `texto ${id}`, originalText: `texto ${id}` }, nonce, index));
  else if (what < 26) {
    const kind = ["text", "file", "link"][r.below(3)];
    const node = m.newNode(kind, kind === "file" ? "assets/foto.png" : kind === "link" ? "https://exemplo.org" : `cartão ${id}`, at, id);
    put(full(m.toElements({ nodes: [node], edges: [] })[0], nonce, index));
  } else if (what < 29) {
    const node = { id, type: "group", label: "Grupo", x: at[0], y: at[1], width: 600, height: 400 };
    put(full(m.toElements({ nodes: [node], edges: [] })[0], nonce, index));
  } else if (what < 36 && cards.length >= 2) {
    const [a, b] = [pick(cards), pick(cards)];
    const nodes = [a.customData.canvas, b.customData.canvas].map((n, i) => ({ ...n, id: [a, b][i].id, x: Math.round([a, b][i].x), y: Math.round([a, b][i].y), width: Math.round([a, b][i].width), height: Math.round([a, b][i].height) }));
    const els = m.toElements({ nodes: nodes[0].id === nodes[1].id ? [nodes[0]] : nodes, edges: [{ id, fromNode: a.id, toNode: b.id }] });
    const arrow = els.find((e) => e.id === id);
    if (arrow) put(full(arrow, nonce, index));
  } else if (what < 40 && arrows.length > 0) {
    // A label on an arrow: the text, and the arrow listing it.
    const a = pick(arrows);
    if (!(a.boundElements ?? []).some((b) => b.type === "text")) {
      put(full({ id: `${a.id}-l${w.made}`, type: "text", x: a.x, y: a.y, width: 30, height: 20, text: "liga", originalText: "liga", containerId: a.id }, nonce, index));
      put(bump(a, 1, r.nonce(), { boundElements: [...(a.boundElements ?? []), { id: `${a.id}-l${w.made}`, type: "text" }] }));
    }
  } else if (what < 58) {
    const e = pick(live);
    if (e) put(bump(e, 1 + r.below(40), nonce, { x: e.x + r.below(300) - 150, y: e.y + r.below(300) - 150 }));
  } else if (what < 63) {
    const e = pick(live);
    if (e) put(bump(e, 1 + r.below(8), nonce, { width: 20 + r.below(400), height: 20 + r.below(300) }));
  } else if (what < 67) {
    const e = pick(live.filter((x) => x.type === "text"));
    if (e) put(bump(e, 1, nonce, { text: `${e.text} +${w.n}`, originalText: `${e.text} +${w.n}` }));
  } else if (what < 71) {
    const e = pick(live);
    if (e) put(bump(e, 1, nonce, { strokeColor: ["#e03131", "#2f9e44", "#1971c2"][r.below(3)] }));
  } else if (what < 75) {
    const e = pick(live.filter((x) => x.type !== "frame"));
    const f = pick(live.filter((x) => x.type === "frame"));
    if (e && f) put(bump(e, 1, nonce, { frameId: e.frameId ? null : f.id, groupIds: r.chance(50) ? [`g${w.n}`] : [] }));
  } else if (what < 79) {
    const a = pick(arrows);
    const c = pick(cards);
    if (a && c) put(bump(a, 1 + r.below(5), nonce, { endBinding: { elementId: c.id, fixedPoint: [0.5, 0.0001], mode: "orbit" } }));
  } else if (what < 89) {
    const e = r.chance(50) ? pick(cards) : pick(live);
    if (e) {
      deleted.add(e.id);
      put(bump(e, 1, nonce, { isDeleted: true }));
    }
  } else if (what < 94) {
    const e = pick(gone);
    if (e) {
      restored.add(e.id);
      put(bump(e, 1, nonce, { isDeleted: false }));
    }
  } else {
    // Busy with an element a while (a text typed, a shape dragged): the
    // room's versions of it wait; done, its own goes out.
    if (w.busy) {
      const e = w.scene.find((x) => x.id === w.busy);
      w.busy = null;
      if (e) put(bump(e, 1, nonce, { x: e.x + 1 }));
    } else w.busy = pick(live)?.id ?? null;
  }
}

/** A JSON Canvas, read as a strict reader would. */
function valid(doc, seed) {
  assert.ok(Array.isArray(doc.nodes) && Array.isArray(doc.edges), `seed ${seed}: no nodes or edges`);
  const ids = new Set();
  for (const n of doc.nodes) {
    for (const k of ["id", "type"]) assert.equal(typeof n[k], "string", `seed ${seed}: node ${JSON.stringify(n)}`);
    for (const k of ["x", "y", "width", "height"]) assert.ok(Number.isFinite(n[k]), `seed ${seed}: node ${JSON.stringify(n)}`);
    assert.ok(!ids.has(n.id), `seed ${seed}: id twice ${n.id}`);
    ids.add(n.id);
  }
  const nodes = new Set(ids);
  for (const e of doc.edges) {
    assert.ok(nodes.has(e.fromNode) && nodes.has(e.toNode), `seed ${seed}: edge to no node ${JSON.stringify(e)}`);
    assert.ok(!ids.has(e.id), `seed ${seed}: id twice ${e.id}`);
    ids.add(e.id);
  }
  for (const d of doc.verso?.drawing ?? []) {
    assert.ok(typeof d.id === "string" && typeof d.type === "string", `seed ${seed}: drawn ${JSON.stringify(d)}`);
    assert.ok(!ids.has(d.id), `seed ${seed}: id twice ${d.id}`);
    ids.add(d.id);
  }
}

function runSeed(seed) {
  deleted.clear();
  restored.clear();
  const r = rng(seed);
  const room = new Y.Doc();
  const windows = Array.from({ length: WINDOWS }, (_, n) => windowOf(n));
  /** The relay: what a window sent reaches the room, and the others late
   *  and in any order. */
  const send = (w) => {
    const out = r.shuffle(w.out.splice(0));
    for (const u of out) {
      Y.applyUpdate(room, u, "remote");
      for (const o of windows) if (o !== w) o.inbox.push(u);
    }
  };
  const hear = (w, all) => {
    const heard = r.shuffle(w.inbox.splice(0));
    const later = all ? [] : heard.splice(0, r.below(heard.length + 1));
    for (const u of heard) Y.applyUpdate(w.doc, u, "remote");
    w.inbox.push(...later);
  };
  for (let op = 0; op < OPS; op++) {
    const w = windows[r.below(WINDOWS)];
    for (let k = 0; k <= r.below(3); k++) act(w, r);
    if (r.chance(70)) push(w);
    if (r.chance(60)) send(w);
    if (r.chance(50)) hear(w, false);
  }
  for (const w of windows) {
    if (w.busy) {
      const e = w.scene.find((x) => x.id === w.busy);
      w.busy = null;
      if (e) w.scene = w.scene.map((x) => (x.id === e.id ? bump(e, 1, r.nonce()) : x));
    }
  }
  for (let round = 0; round < 3; round++) {
    for (const w of windows) push(w), send(w);
    for (const w of windows) hear(w, true);
  }
  // Every window holds the room's elements, and draws them.
  const roomEls = m.resolve(room.getMap("elements").entries());
  const canon = (map) => JSON.stringify([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  for (const w of windows) {
    assert.equal(canon(m.resolve(w.entries.entries())), canon(roomEls), `seed ${seed}: window ${w.n} holds another board`);
    const scene = new Map(w.scene.map((e) => [e.id, `${m.rankOf(e).version}:${m.rankOf(e).nonce}:${e.isDeleted === true}`]));
    const expect = new Map([...roomEls.values()].map((e) => [e.id, `${m.rankOf(e).version}:${m.rankOf(e).nonce}:${e.isDeleted === true}`]));
    if (canon(scene) !== canon(expect)) for (const [id, v] of expect) if (scene.get(id) !== v) console.log(`seed ${seed} w${w.n} ${id}: scene ${scene.get(id)} room ${v}`);
    assert.equal(canon(scene), canon(expect), `seed ${seed}: window ${w.n} draws another board`);
  }
  // A deletion no one undid stands, whatever was done to the element
  // meanwhile — a drag made without seeing it above all.
  for (const id of deleted) if (!restored.has(id)) assert.equal(roomEls.get(id)?.isDeleted, true, `seed ${seed}: ${id} came back`);
  // The file of the room's state: a JSON Canvas, read back as itself.
  const file = m.canvasOf(roomEls.values(), BASE, null);
  valid(file, seed);
  assert.equal(file["x-kept"], "by every write");
  const again = m.fromElements(m.toElements(file).map((e) => ({ isDeleted: false, ...e })), file, null);
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(file)), `seed ${seed}: the file does not read back as itself`);
  return roomEls.size;
}

test(`a board edited hard by ${WINDOWS} windows: ${SEEDS} seeds × ${OPS} changes converge, and the file holds`, () => {
  const started = Date.now();
  let elements = 0;
  for (let seed = 1; seed <= SEEDS; seed++) elements += runSeed(seed);
  if (process.env.BOARD_STRESS_SEEDS) console.log(`board stress (window): ${SEEDS} seeds × ${OPS} ops, ${WINDOWS} windows, in ${((Date.now() - started) / 1000).toFixed(1)} s; ${elements} elements`);
});
