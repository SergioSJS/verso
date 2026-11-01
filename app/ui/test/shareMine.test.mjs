// Share audio, the sharer's side (ADR 0116 section B, items 16, 21): the order of a start — the server's share first,
// then the host's capture under the number it gave — and its undoing when the capture fails; the server's "exists"
// asking before it replaces; the level meter's text state (sound arriving / silence) and its scale. The commands are
// fakes, so no DOM and no host.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/shareMine";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareMine.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareMine.test-bundle.mjs");

const share = (id = 0x8000_0001) => ({ table: "", id, name: "Spotify", kind: "app", by: "Mestre", by_id: "a", started_ms: 0, bitrate_kbps: 96, listeners: null, rate_bps: null });
const source = { id: "app:1", name: "Spotify", kind: "app" };

function deps({ server = "ok", capture = "ok" } = {}) {
  const calls = [];
  return {
    calls,
    d: {
      startShare: async (wish, table) => {
        calls.push(["start", wish, table]);
        if (server === "exists" && !wish.replace) return { status: "error", error: { kind: "exists", message: "the table shares audio already: replace it?" } };
        if (server === "refused") return { status: "error", error: { kind: "refused", message: "only the game master shares audio at the table" } };
        return { status: "ok", data: share() };
      },
      stopShare: async (table) => {
        calls.push(["stop", table]);
        return { status: "ok", data: null };
      },
      capture: async (id, kbps, n) => {
        calls.push(["capture", id, kbps, n]);
        if (capture === "fail") throw { kind: "refused", message: "no such source to share" };
        return { stop: async () => {} };
      },
      explain: (e) => `E:${e.message}`,
    },
  };
}

describe("beginShare", () => {
  test("starts the server's share first, then the capture under its number", async () => {
    const { d, calls } = deps();
    const r = await m.beginShare(d, source, 96, false, "");
    assert.equal(r.kind, "started");
    assert.deepEqual(calls.map((c) => c[0]), ["start", "capture"]);
    assert.deepEqual(calls[0][1], { name: "Spotify", kind: "app", bitrate_kbps: 96, replace: false });
    assert.deepEqual(calls[1].slice(1), ["app:1", 96, 0x8000_0001]);
  });

  test("a capture that fails undoes the server's share and says why", async () => {
    const { d, calls } = deps({ capture: "fail" });
    const r = await m.beginShare(d, source, 96, false, "");
    assert.deepEqual(r, { kind: "failed", why: "E:no such source to share" });
    assert.deepEqual(calls.map((c) => c[0]), ["start", "capture", "stop"]);
  });

  test("the server's refusal says why and starts no capture", async () => {
    const { d, calls } = deps({ server: "refused" });
    const r = await m.beginShare(d, source, 96, false, "");
    assert.equal(r.kind, "failed");
    assert.match(r.why, /game master/);
    assert.deepEqual(calls.map((c) => c[0]), ["start"]);
  });

  test("a share already live answers exists; replace goes on", async () => {
    const { d, calls } = deps({ server: "exists" });
    assert.deepEqual(await m.beginShare(d, source, 96, false, ""), { kind: "exists" });
    assert.deepEqual(calls.map((c) => c[0]), ["start"]);
    const r = await m.beginShare(d, source, 96, true, "");
    assert.equal(r.kind, "started");
    assert.equal(calls[1][1].replace, true);
  });
});

describe("LevelWatch", () => {
  test("a source that has not sounded yet is being checked, then silent", () => {
    const w = new m.LevelWatch(1000);
    w.push(0, 2000);
    assert.equal(w.state(2500), "checking");
    assert.equal(w.state(2999), "checking");
    assert.equal(w.state(3001), "silence");
  });

  test("sound makes it arriving, and a gap of silence long enough takes it back", () => {
    const w = new m.LevelWatch(1000);
    w.push(0.3, 1100);
    assert.equal(w.state(1200), "arriving");
    w.push(0, 1300);
    assert.equal(w.state(2000), "arriving");
    assert.equal(w.state(2200), "silence");
    w.push(0.2, 4300);
    assert.equal(w.state(4300), "arriving");
  });

  test("a hiss under the floor is silence", () => {
    const w = new m.LevelWatch(1000);
    w.push(0.0005, 100);
    assert.equal(w.state(5000), "silence");
  });
});

describe("the meter and the numbers", () => {
  test("the meter is a decibel scale from -60 to 0", () => {
    assert.equal(m.meterOf(0), 0);
    assert.equal(m.meterOf(1), 1);
    assert.equal(m.meterOf(2), 1);
    assert.ok(Math.abs(m.meterOf(0.1) - 2 / 3) < 0.01);
  });
  test("the rate is said in kilobits", () => {
    assert.equal(m.rateText(null), "");
    assert.equal(m.rateText(96_400), "96 kbit/s");
  });
});
