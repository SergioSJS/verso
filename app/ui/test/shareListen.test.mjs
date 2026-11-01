// Share audio (ADR 0116 items 16, 22, 25): when a window asks the server for
// a live share's frames and when it stops — at the join with a share live, at
// a share's start, again after "behind", never for its own share, not while
// Follow the table is off — and its sound waiting for a gesture, the frames
// held meanwhile. The commands, events, audio gate and player are fakes; the
// player itself is shareDecode.test.mjs's.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/shareLife";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareListen.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareListen.test-bundle.mjs");

const share = (id, table = "") => ({ table, id, name: "Spotify", kind: "app", by: "Ana", by_id: "acc-ana", started_ms: 0, bitrate_kbps: 96, listeners: null, rate_bps: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

function world({ joined = null, ready = true, refuse = false } = {}) {
  const asked = [];
  const subs = new Map();
  const opened = [];
  const logged = [];
  let gateReady = ready;
  let onReady = null;
  let follows = true;
  let own = null;
  const api = {
    listen: async (on, table) => {
      asked.push([on, table]);
      return refuse && on ? { status: "error", error: { kind: "refused", message: "the sharer hears its source itself" } } : { status: "ok", data: null };
    },
    events: async (name, fn) => {
      subs.set(name, fn);
      return () => subs.delete(name);
    },
  };
  const s = new m.TableShare({
    api,
    table: "",
    share: joined,
    gate: { ready: () => gateReady, onReady: (fn) => (onReady = fn) },
    open: async (id, gain) => {
      const h = { share: id, gains: [gain], frames: [], restarts: 0, closed: false, frame(b) { this.frames.push(b[0]); }, setGain(g) { this.gains.push(g); }, restart() { this.restarts++; }, close() { this.closed = true; } };
      opened.push(h);
      return h;
    },
    gain: () => 0.8,
    follows: () => follows,
    own: () => own,
    changed: () => {},
    log: (l) => logged.push(l),
  });
  return {
    s,
    asked,
    opened,
    logged,
    subs,
    emit: (name, p) => subs.get(name)?.(p),
    setFollows: (v) => (follows = v),
    setOwn: (v) => (own = v),
    unlock: () => {
      gateReady = true;
      onReady?.();
    },
  };
}

describe("listening to a live share", () => {
  test("a window that joins while a share is live asks for it and hears it (the late joiner)", async () => {
    const w = world({ joined: share(0x80000001) });
    await w.s.start();
    await tick();
    assert.deepEqual(w.asked, [[true, ""]]);
    assert.equal(w.opened.length, 1);
    assert.equal(w.opened[0].share, 0x80000001);
    w.s.frame(new Uint8Array([1]));
    assert.deepEqual(w.opened[0].frames, [1]);
  });

  test("no share, nothing asked; a share starts: asked and heard; it stops: the sound goes, the want stays", async () => {
    const w = world();
    await w.s.start();
    assert.deepEqual(w.asked, []);
    w.emit("table-share-started", share(0x80000002));
    await tick();
    assert.deepEqual(w.asked, [[true, ""]]);
    assert.equal(w.opened.length, 1);
    w.emit("table-share-stopped", { table: "", id: 0x80000002, reason: "stopped" });
    assert.equal(w.opened[0].closed, true);
    assert.equal(w.s.live, null);
    w.s.frame(new Uint8Array([2]));
    assert.deepEqual(w.opened[0].frames, []);
    // Another share: asked at its start, a new player for its number.
    w.emit("table-share-started", share(0x80000003));
    await tick();
    assert.deepEqual(w.asked, [[true, ""], [true, ""]]);
    assert.equal(w.opened[1].share, 0x80000003);
  });

  test("told behind: asked again, the buffer started over", async () => {
    const w = world({ joined: share(0x80000004) });
    await w.s.start();
    await tick();
    w.emit("table-share-behind", { table: "", id: 0x80000004 });
    await tick();
    assert.deepEqual(w.asked, [[true, ""], [true, ""]]);
    assert.equal(w.opened[0].restarts, 1);
  });

  test("the window that shares never listens to its own share", async () => {
    const w = world();
    w.setOwn(0x80000005);
    await w.s.start();
    w.emit("table-share-started", share(0x80000005));
    await tick();
    assert.deepEqual(w.asked, []);
    assert.equal(w.opened.length, 0);
  });

  test("Follow the table off: asked to stop and silent; on again: asked again", async () => {
    const w = world({ joined: share(0x80000006) });
    await w.s.start();
    await tick();
    w.setFollows(false);
    w.s.evaluate();
    await tick();
    assert.deepEqual(w.asked, [[true, ""], [false, ""]]);
    assert.equal(w.opened[0].closed, true);
    w.setFollows(true);
    w.s.evaluate();
    await tick();
    assert.deepEqual(w.asked.at(-1), [true, ""]);
    assert.equal(w.opened.length, 2);
  });

  test("before a gesture: waiting (Hear the table), the frames held, then played from the first", async () => {
    const w = world({ joined: share(0x80000007), ready: false });
    await w.s.start();
    await tick();
    assert.equal(w.s.waiting, true);
    assert.equal(w.opened.length, 0);
    for (const b of [1, 2, 3]) w.s.frame(new Uint8Array([b]));
    w.unlock();
    await tick();
    assert.equal(w.s.waiting, false);
    assert.deepEqual(w.opened[0].frames, [1, 2, 3]);
  });

  test("a refusal is not asked again in a loop; the next start asks again", async () => {
    const w = world({ joined: share(0x80000008), refuse: true });
    await w.s.start();
    await tick();
    await tick();
    assert.deepEqual(w.asked, [[true, ""]]);
    assert.equal(w.s.heard, false);
    assert.equal(w.logged.length, 1);
    w.emit("table-share-started", share(0x80000009));
    await tick();
    assert.equal(w.asked.length, 2);
  });

  test("another table's share is not this window's; closing ends everything", async () => {
    const w = world();
    await w.s.start();
    w.emit("table-share-started", share(0x8000000a, "Campanha"));
    await tick();
    assert.deepEqual(w.asked, []);
    w.emit("table-share-started", share(0x8000000b));
    await tick();
    w.s.close();
    assert.equal(w.opened[0].closed, true);
    assert.equal(w.subs.size, 0);
  });
});
