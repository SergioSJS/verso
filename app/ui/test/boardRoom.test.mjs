// A board edited by several people at once (ADR 0082 item 12, decided by
// the maintainer on 2026-10-12): the entries of the room's map, the rule
// that picks among an element's versions (Excalidraw's reconciliation),
// what a window sends, how the room's elements merge into its scene, the
// file the room's state makes, and a canvas given anew as the elements it
// changes. The same keys and rule as the server's `collab_board.rs`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: 'export * from "./src/board/roomModel"; export * from "./src/board/model";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/boardRoom.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/boardRoom.test-bundle.mjs");

/** An element as a window's board holds it. */
const el = (id, version, versionNonce, more = {}) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version, versionNonce, index: `a${id}`, ...more });
/** The entries a window writes for `els`, the outranked ones removed. */
function write(map, els) {
  for (const e of els) {
    const r = m.rankOf(e);
    for (const k of m.outrankedKeys(map.keys(), e.id, r)) map.delete(k);
    map.set(m.entryKey(e.id, r), JSON.stringify(e));
  }
  return map;
}

describe("the room's entries", () => {
  test("a key names the element and its version, and reads back", () => {
    const k = m.entryKey("a-b\nc", { version: 7, nonce: 123 });
    assert.deepEqual(m.parseKey(k), { id: "a-b\nc", rank: { version: 7, nonce: 123 } });
    assert.equal(m.parseKey("no rank"), null);
  });

  test("the higher version wins; a tie goes to the lower nonce, whatever the order", () => {
    const one = el("a", 3, 70, { x: 30 });
    const two = el("a", 2, 5, { x: 20 });
    const three = el("a", 3, 9, { x: 39 });
    for (const order of [[one, two, three], [three, two, one], [two, three, one]]) {
      const entries = order.map((e) => [m.entryKey(e.id, m.rankOf(e)), JSON.stringify(e)]);
      assert.equal(m.resolve(entries).get("a").x, 39);
    }
  });

  test("a deletion is not undone by a move made meanwhile; an undo after it is", () => {
    const map = write(new Map(), [el("a", 1, 0)]);
    const held = m.resolve(map).get("a");
    // Two windows, from version 1: one deletes, the other drags it — forty
    // frames, forty versions — without having seen the deletion.
    const gone = m.sendable(el("a", 2, 8, { isDeleted: true }), held);
    assert.equal(gone.version, 2 + m.DELETE_JUMP);
    const moved = el("a", 41, 4, { x: 99 });
    for (const order of [[gone, moved], [moved, gone]]) {
      const map2 = write(new Map(map), order);
      assert.equal(m.resolve(map2).get("a").isDeleted, true);
    }
    // An undo counts from the deletion's version, and wins.
    write(map, [gone, moved]);
    write(map, [el("a", gone.version + 1, 3)]);
    assert.equal(m.resolve(map).get("a").isDeleted, false);
    // A tombstone sent again is not pushed further ahead.
    assert.equal(m.sendable(gone, gone).version, gone.version);
  });

  test("a version removes the entries of its element it outranks, and no other", () => {
    const map = write(new Map(), [el("a", 1, 0), el("b", 1, 0)]);
    write(map, [el("a", 4, 1)]);
    assert.deepEqual([...map.keys()].sort(), [m.entryKey("a", { version: 4, nonce: 1 }), m.entryKey("b", { version: 1, nonce: 0 })].sort());
  });
});

describe("what a window sends", () => {
  test("every element whose version is not the one the board last agreed on with the room", () => {
    const known = new Map([
      ["a", { version: 1, nonce: 0 }],
      ["b", { version: 5, nonce: 0 }],
      ["d", { version: 2, nonce: 9 }],
    ]);
    // a changed here; b changed here over an older version (it goes, and
    // loses to the room's); c is new; d is as agreed.
    const scene = [el("a", 2, 3), el("b", 4, 7), el("c", 1, 0), el("d", 2, 9)];
    assert.deepEqual(
      m.changedElements(scene, known).map((e) => e.id),
      ["a", "b", "c"],
    );
    assert.equal(m.unsent(el("d", 2, 9), known), false);
    assert.equal(m.unsent(el("d", 2, 8), known), true);
  });

  test("a deletion not sent yet is not undone by a drag heard meanwhile", () => {
    // The board deleted it at version 13; a drag of 40 frames arrives
    // before the deletion leaves: the deletion stays, as it will be sent.
    const known = new Map([["x", { version: 12, nonce: 1 }]]);
    const local = [el("x", 13, 5, { isDeleted: true })];
    const merged = m.mergeScene(local, [el("x", 52, 3, { x: 99 })], new Set(), (e) => m.unsent(e, known));
    assert.equal(merged[0].isDeleted, true);
  });
});

describe("the scene merge", () => {
  test("different elements both land; the same one takes the winning version", () => {
    const local = [el("a", 2, 1, { x: 1 }), el("b", 1, 0)];
    const remote = [el("b", 3, 0, { x: 33 }), el("c", 1, 0)];
    const merged = m.mergeScene(local, remote, new Set(), () => false);
    assert.deepEqual(merged.map((e) => [e.id, e.x]), [["a", 1], ["b", 33], ["c", 0]]);
  });

  test("an element being changed here stays as it is, and so does one of this window's own on its way that wins", () => {
    const local = [el("a", 5, 1, { x: 5 }), el("b", 4, 1, { x: 4 })];
    const remote = [el("a", 9, 1, { x: 9 }), el("b", 3, 1, { x: 3 })];
    const busy = new Set(["a"]);
    const mine = (e) => e.id === "b";
    assert.deepEqual(m.mergeScene(local, remote, busy, mine).map((e) => e.x), [5, 4]);
    // Not this window's (a reader's board): the room's version comes in.
    assert.deepEqual(m.mergeScene(local, remote, new Set(), () => false).map((e) => e.x), [9, 3]);
  });

  test("the order is the board's: the fractional index, then the id", () => {
    const merged = m.mergeScene([el("x", 1, 0, { index: "a2" })], [el("y", 1, 0, { index: "a1" }), el("z", 1, 0, { index: "a1" })], new Set(), () => false);
    assert.deepEqual(merged.map((e) => e.id), ["y", "z", "x"]);
  });
});

describe("the file the room's state makes", () => {
  const base = { nodes: [], edges: [], "x-kept": 1 };
  test("the board's converter over the room's elements, its other keys kept, deleted ones left out", () => {
    const els = [el("b", 1, 0, { index: "a2" }), el("a", 1, 0, { index: "a1" }), el("gone", 3, 0, { isDeleted: true, index: "a3" })];
    const doc = m.canvasOf(els, base, null);
    assert.equal(doc["x-kept"], 1);
    assert.deepEqual(doc.verso.drawing.map((d) => d.id), ["a", "b"]);
    // The same state makes the same file, whatever order the window holds.
    assert.deepEqual(JSON.stringify(m.canvasOf([...els].reverse(), base, null)), JSON.stringify(doc));
  });
});

describe("a canvas given anew", () => {
  const nonce = () => 42;
  const card = (id, x) => ({ id, type: "text", text: id, x, y: 0, width: 100, height: 50 });
  test("only what differs from the canvas it was made over goes in, above the room's version", () => {
    const was = { nodes: [card("n1", 0), card("n2", 0)], edges: [] };
    const next = { nodes: [card("n1", 0), card("n2", 500)], edges: [] };
    // The room moved n1 meanwhile (version 7): a rewrite that did not touch it leaves it.
    const room = new Map([
      ["n1", el("n1", 7, 1)],
      ["n2", el("n2", 2, 1, { index: "a9" })],
    ]);
    const drawn = m.toElements(next).map((e) => ({ ...e, version: 1, versionNonce: 0 }));
    const out = m.patchFromCanvas(room, drawn, was, next, nonce);
    assert.deepEqual(out.map((e) => e.id), ["n2"]);
    assert.equal(out[0].version, 3);
    assert.equal(out[0].versionNonce, 42);
    assert.equal(out[0].index, "a9");
    assert.equal(out[0].x, 500);
  });

  test("a card taken out is a tombstone at a version that wins", () => {
    const was = { nodes: [card("n1", 0)], edges: [] };
    const next = { nodes: [], edges: [] };
    const room = new Map([["n1", el("n1", 4, 1)]]);
    const out = m.patchFromCanvas(room, [], was, next, nonce);
    assert.equal(out.length, 1);
    assert.equal(out[0].isDeleted, true);
    assert.equal(out[0].version, 5 + m.DELETE_JUMP);
  });
});

describe("indices repaired before the board takes the room's elements", () => {
  const at = (id, index, more = {}) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 3, versionNonce: 7, index, ...more });
  test("two elements in one place: the second (by id) takes a key between it and the next, at the same version", () => {
    const els = m.ordered([at("b", "a1"), at("a", "a1"), at("c", "a2")]);
    const out = m.repairedIndices(els);
    assert.deepEqual(out.map((e) => e.id), ["a", "b", "c"]);
    assert.equal(out[0].index, "a1");
    assert.ok("a1" < out[1].index && out[1].index < "a2", out[1].index);
    assert.equal(out[2].index, "a2");
    // A copy, at the room's version and nonce: nothing to send.
    assert.equal(out[1].version, 3);
    assert.equal(out[1].versionNonce, 7);
    assert.notEqual(out[1], els[1]);
    assert.equal(out[0], els[0]);
  });
  test("two windows handed the same room in other orders draw the same", () => {
    const room = [at("x1", "a5"), at("x2", "a5"), at("x3", "a5"), at("y", "a6"), at("z", null), at("w", "")];
    const one = m.repairedIndices(m.ordered(room));
    const two = m.repairedIndices(m.ordered([...room].reverse()));
    assert.deepEqual(two, one);
    const idx = one.map((e) => e.index);
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i - 1] < idx[i], `${idx[i - 1]} < ${idx[i]}`);
    // What has a good index keeps it.
    assert.equal(one.find((e) => e.id === "x1").index, "a5");
    assert.equal(one.find((e) => e.id === "y").index, "a6");
  });
  test("an order that is already good is left as it is", () => {
    const els = [at("a", "a0"), at("b", "a1"), at("c", "a1V")];
    const out = m.repairedIndices(els);
    for (let i = 0; i < els.length; i++) assert.equal(out[i], els[i]);
  });
  test("mergeScene hands the board repaired indices", () => {
    const merged = m.mergeScene([at("a", "a1")], [at("b", "a1", { version: 4 })], new Set(), () => false);
    assert.ok(merged[0].index < merged[1].index);
  });
  test("the board's own object stays where it holds the room's very version", () => {
    const mine = at("a", "a1");
    const room = { ...mine };
    const moved = { ...at("b", "a2"), version: 5 };
    const merged = m.mergeScene([mine, at("b", "a2")], [room, moved], new Set(), () => false);
    assert.equal(merged[0], mine, "drawn anew though nothing changed");
    assert.equal(merged[1], moved);
  });
});

// Another window deletes an element this one has selected: the board must
// never be handed a scene whose state still points at it — Excalidraw logs
// "[NONDELETED][INVARIANT] getSelectedElements skipping deleted selected
// element" (the board stress test, 2 runs in 16, 2026-10-14).
describe("the room's change into the scene, and what the board points at", () => {
  const alive = (els) => new Set(els.filter((e) => e.isDeleted !== true).map((e) => e.id));
  /** The selection the board holds after the change selects nothing deleted. */
  const pointsAtNothingDeleted = (elements, appState, before) => {
    const live = alive(elements);
    const ids = "selectedElementIds" in appState ? appState.selectedElementIds : before.selectedElementIds;
    for (const [id, on] of Object.entries(ids)) if (on) assert.ok(live.has(id), `${id} deleted and still selected`);
  };

  test("a selected element another window deleted leaves the selection in the same change; the others stay selected", () => {
    const local = [el("a", 2, 1), el("b", 3, 1), el("c", 1, 1)];
    const remote = [el("a", 2, 1), el("b", 4, 7, { isDeleted: true }), el("c", 1, 1)];
    const state = { selectedElementIds: { a: true, b: true }, selectedGroupIds: {} };
    const { elements, appState } = m.remoteScene(local, remote, state, () => false);
    assert.equal(elements.find((e) => e.id === "b").isDeleted, true, "the room's deletion is what the board draws");
    pointsAtNothingDeleted(elements, appState, state);
    assert.deepEqual(appState.selectedElementIds, { a: true });
  });

  test("nothing selected is deleted: the board's state is left alone", () => {
    const local = [el("a", 2, 1), el("b", 3, 1)];
    const remote = [el("a", 2, 1), el("b", 4, 7, { isDeleted: true })];
    const { appState } = m.remoteScene(local, remote, { selectedElementIds: { a: true }, selectedGroupIds: {} }, () => false);
    assert.deepEqual(appState, {});
  });

  test("a group, a line being pointed at, a crop, a hover: none of them is left on a deleted element", () => {
    const local = [el("a", 1, 1, { groupIds: ["g"] }), el("b", 1, 1, { groupIds: ["g"] }), el("l", 1, 1, { type: "arrow" }), el("k", 1, 1, { groupIds: ["h"] })];
    const remote = [
      el("a", 9, 1, { groupIds: ["g"], isDeleted: true }),
      el("b", 9, 1, { groupIds: ["g"], isDeleted: true }),
      el("l", 9, 1, { type: "arrow", isDeleted: true }),
      el("k", 1, 1, { groupIds: ["h"] }),
    ];
    const state = {
      selectedElementIds: { a: true, b: true, l: true, k: true },
      selectedGroupIds: { g: true, h: true },
      editingGroupId: "g",
      selectedLinearElement: { elementId: "l", isEditing: false },
      croppingElementId: "a",
      hoveredElementIds: { b: true, k: true },
    };
    const { elements, appState } = m.remoteScene(local, remote, state, () => false);
    pointsAtNothingDeleted(elements, appState, state);
    assert.deepEqual(appState.selectedElementIds, { k: true });
    assert.deepEqual(appState.selectedGroupIds, { h: true });
    assert.equal(appState.editingGroupId, null);
    assert.equal(appState.selectedLinearElement, null);
    assert.equal(appState.croppingElementId, null);
    assert.deepEqual(appState.hoveredElementIds, { k: true });
  });

  test("an element being dragged or typed here keeps its own version, and stays selected", () => {
    const local = [el("a", 2, 1), el("t", 2, 1, { type: "text" })];
    const remote = [el("a", 9, 1, { isDeleted: true }), el("t", 9, 1, { type: "text", isDeleted: true })];
    const dragging = { selectedElementIds: { a: true }, selectedGroupIds: {}, selectedElementsAreBeingDragged: true };
    const d = m.remoteScene(local, remote, dragging, () => false);
    assert.equal(d.elements.find((e) => e.id === "a").isDeleted, false);
    assert.deepEqual(d.appState, {});
    const typing = { selectedElementIds: {}, selectedGroupIds: {}, editingTextElement: local[1] };
    const t = m.remoteScene(local, remote, typing, () => false);
    assert.equal(t.elements.find((e) => e.id === "t").isDeleted, false);
    assert.deepEqual(t.appState, {});
  });

  test("the shape whose text is being typed stays while it is typed: Excalidraw selects it when the typing ends", () => {
    // Seen in the board stress test (WebKit, 2026-10-14): a text typed in a
    // shape, the shape deleted by another window meanwhile, Escape — and
    // Excalidraw selected the deleted shape.
    const local = [el("box", 2, 1), el("t", 3, 1, { type: "text", containerId: "box" })];
    const remote = [el("box", 9, 1, { isDeleted: true }), el("t", 9, 1, { type: "text", containerId: "box", isDeleted: true })];
    const typing = { selectedElementIds: {}, selectedGroupIds: {}, editingTextElement: { id: "t", containerId: "box" } };
    const { elements, appState } = m.remoteScene(local, remote, typing, () => false);
    assert.equal(elements.find((e) => e.id === "box").isDeleted, false);
    assert.equal(elements.find((e) => e.id === "t").isDeleted, false);
    assert.deepEqual(appState, {});
  });

  test("a text being typed or an element being drawn that is deleted in the scene is let go", () => {
    const els = [el("t", 9, 1, { type: "text", isDeleted: true }), el("n", 9, 1, { isDeleted: true })];
    const st = m.stateOver(els, { selectedElementIds: { t: true }, selectedGroupIds: {}, editingTextElement: { id: "t" }, newElement: { id: "n" } });
    assert.deepEqual(st.selectedElementIds, {});
    assert.equal(st.editingTextElement, null);
    assert.equal(st.newElement, null);
  });
});
