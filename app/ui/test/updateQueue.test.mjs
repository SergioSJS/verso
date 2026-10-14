// A room's updates leave a window one at a time (ADR 0083 item 14): the
// server takes a window's updates in the order they reach it and refuses
// one that depends on an earlier one not there yet, so the window sends
// one and waits for its answer; what is typed meanwhile goes as one
// merged update when the answer comes. The browser's single WebSocket and
// the desktop's ordered connection already keep the order; this keeps it
// whatever carries the calls.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import * as Y from "yjs";

await esbuild.build({
  stdin: { contents: 'export * from "./src/updateQueue";', resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/updateQueue.test-bundle.mjs",
  logLevel: "error",
});
const { UpdateQueue } = await import("./.bundles/updateQueue.test-bundle.mjs");

/** A server whose answers come when the test says. */
function server() {
  const s = {
    calls: [],
    answer: (r = "ok") => s.calls.find((c) => !c.done)?.resolve(r),
    send: (update) =>
      new Promise((resolve) => {
        const call = { update, done: false, resolve: (r) => ((call.done = true), resolve(r)) };
        s.calls.push(call);
      }),
  };
  return s;
}

const tick = () => new Promise((r) => setImmediate(r));

/** A window's document and the updates three quick edits make. */
function typed() {
  const doc = new Y.Doc();
  const text = doc.getText("verso");
  const updates = [];
  doc.on("update", (u) => updates.push(u));
  text.insert(0, "abc");
  text.insert(3, "def");
  text.delete(1, 3);
  return { doc, updates };
}

describe("A room's updates, one at a time", () => {
  test("three quick updates: one call in flight, then one merged, in order", async () => {
    const s = server();
    const q = new UpdateQueue(s.send, () => assert.fail("not refused"));
    const { doc, updates } = typed();
    for (const u of updates) q.push(u);
    await tick();
    assert.equal(s.calls.length, 1, "one in flight");
    assert.deepEqual(s.calls[0].update, updates[0]);
    s.answer();
    await tick();
    assert.equal(s.calls.length, 2, "the rest as one");
    s.answer();
    await tick();
    assert.equal(s.calls.length, 2);
    // What the server took, in the order taken, is the window's text.
    const room = new Y.Doc();
    for (const c of s.calls) Y.applyUpdate(room, c.update);
    assert.equal(room.getText("verso").toString(), doc.getText("verso").toString());
    assert.equal(room.getText("verso").toString(), "aef");
  });

  test("a refusal says so once and drops what waited", async () => {
    const s = server();
    let lost = 0;
    const q = new UpdateQueue(s.send, () => lost++);
    const { updates } = typed();
    for (const u of updates) q.push(u);
    await tick();
    s.answer("refused");
    await tick();
    assert.equal(lost, 1);
    assert.equal(s.calls.length, 1, "nothing more sent");
  });

  test("an unavailable answer goes on with what waits", async () => {
    const s = server();
    const q = new UpdateQueue(s.send, () => assert.fail("not refused"));
    const { updates } = typed();
    for (const u of updates) q.push(u);
    await tick();
    s.answer("unavailable");
    await tick();
    assert.equal(s.calls.length, 2);
  });

  test("a closed session sends nothing more", async () => {
    const s = server();
    let alive = true;
    const q = new UpdateQueue(s.send, () => undefined, () => alive);
    const { updates } = typed();
    for (const u of updates) q.push(u);
    await tick();
    alive = false;
    s.answer();
    await tick();
    assert.equal(s.calls.length, 1);
  });
});
