// Music at the table (ADR 0116 section A): the arithmetic every window
// plays by — the server's clock as NTP estimates it, where a track should be,
// the drift bands, the loop's wrap, a track's end, the gain — and the
// soundboard a note is: headings as scenes, next and previous over a scene,
// the formats an engine says it plays. The player is tried in
// e2e/table-sound.spec.mjs, the server's rules in tests_table_sound.rs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/sync"; export * from "./src/table/sound/scene"; export * from "./src/table/sound/formats"; export * from "./src/table/sound/source";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/tableSound.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/tableSound.test-bundle.mjs");

describe("the server's clock", () => {
  test("the first answer is used at once, then the one with the smallest round trip", () => {
    const c = new m.Clock();
    assert.equal(c.offset(), null);
    assert.equal(c.serverNow(1000), 1000, "its own before any answer");
    c.add({ sent: 0, received: 200, server: 5100 });
    assert.equal(c.offset(), 5000);
    c.add({ sent: 1000, received: 1020, server: 6040 });
    assert.equal(c.offset(), 5030, "the short round trip wins");
    assert.equal(c.serverNow(2000), 7030);
  });
  test("with enough samples, the median of the best half", () => {
    const c = new m.Clock();
    for (const [rtt, off] of [[10, 100], [12, 104], [14, 98], [300, 900], [11, 102], [500, -800]]) c.add({ sent: 0, received: rtt, server: off + rtt / 2 });
    // Best half by round trip: 10 (100), 11 (102), 12 (104); median 102.
    assert.equal(c.offset(), 102);
  });
  test("an answer that came before it was asked is not one", () => {
    const c = new m.Clock();
    c.add({ sent: 100, received: 50, server: 1 });
    c.add({ sent: NaN, received: 50, server: 1 });
    assert.equal(c.count, 0);
  });
});

describe("where the track should be", () => {
  const t = (over) => ({ state: "playing", positionMs: 1000, anchorMs: 10_000, looping: false, durationMs: 60_000, ...over });
  test("playing, it moves with the server's clock", () => {
    assert.equal(m.expectedMs(t(), 12_500), 3500);
    assert.equal(m.expectedMs(t(), 9_000), 1000, "never before the anchor");
  });
  test("paused stays; stopped is the start", () => {
    assert.equal(m.expectedMs(t({ state: "paused" }), 99_999), 1000);
    assert.equal(m.expectedMs(t({ state: "stopped" }), 99_999), 0);
  });
  test("a loop wraps at its length; a track that does not stops at its end, and has ended", () => {
    assert.equal(m.expectedMs(t({ looping: true }), 10_000 + 61_000), 2000);
    assert.equal(m.expectedMs(t(), 10_000 + 61_000), 60_000);
    assert.equal(m.ended(t(), 10_000 + 58_999), false);
    assert.equal(m.ended(t(), 10_000 + 59_000), true);
    assert.equal(m.ended(t({ looping: true }), 10_000 + 99_000), false, "a loop never ends");
    assert.equal(m.ended(t({ durationMs: null }), 10_000 + 99_000), false, "a length not known yet");
  });
  test("a late joiner lands where the others are", () => {
    // Joined 42 s after the master pressed play, with a clock 3 s ahead.
    const c = new m.Clock();
    c.add({ sent: 0, received: 40, server: 3020 });
    const local = 10_000 + 42_000 - 3000;
    assert.equal(m.expectedMs(t({ positionMs: 0 }), c.serverNow(local)), 42_000);
  });
});

describe("the drift bands", () => {
  test("within 60 ms nothing; to 400 ms the rate, at most 3 %; past it a seek", () => {
    assert.deepEqual(m.fix(1000, 1050), { kind: "none" });
    const slow = m.fix(1000, 1200);
    assert.equal(slow.kind, "rate");
    assert.ok(slow.rate > 1 && slow.rate <= 1.03, String(slow.rate));
    const fast = m.fix(1300, 1000);
    assert.ok(fast.rate < 1 && fast.rate >= 0.97, String(fast.rate));
    assert.deepEqual(m.fix(1000, 1401), { kind: "seek", toMs: 1401 });
  });
  test("across a loop's wrap the element is near, not a track away", () => {
    assert.deepEqual(m.fix(59_980, 20, 60_000), { kind: "none" });
    assert.equal(m.fix(59_800, 100, 60_000).kind, "rate");
  });
});

describe("the gain", () => {
  test("the master's volume times the person's own; nothing muted or not following", () => {
    assert.equal(m.gain(50, 50, false), 0.25);
    assert.equal(m.gain(100, 100, true), 0);
    assert.equal(m.gain(100, 100, false, false), 0);
    assert.equal(m.gain(200, -5, false), 0, "bounded");
    assert.equal(m.gain(NaN, 100, false), 1);
  });
  test("a position as the strip writes it", () => {
    assert.equal(m.clockText(0), "0:00");
    assert.equal(m.clockText(65_400), "1:05");
    assert.equal(m.clockText(3_725_000), "1:02:05");
  });
});

describe("the soundboard is a note", () => {
  const files = ["Música/taverna.mp3", "Música/chuva.ogg", "Música/batalha.m4a", "Música/fim.wav", "Sons/porta.mp3"];
  const resolve = (target) => files.find((f) => f === target || f.endsWith(`/${target}`) || f.replace(/\.[^.]+$/, "").endsWith(`/${target}`)) ?? null;
  const note = [
    "Links before any heading [[Sons/porta.mp3]]",
    "# Taverna",
    "- [[Música/taverna.mp3]]",
    "- ![[chuva.ogg]] and [[Notes]]",
    "- [a link](Música/batalha.m4a)",
    "```",
    "[[Música/fim.wav]] in a code block is not a track",
    "```",
    "`[[Música/fim.wav]]` in code neither",
    "## Batalha",
    "- [[Música/batalha.m4a|the fight]]",
    "- [[Música/fim.wav#x]]",
    "- [[https://example.com/a.mp3]]",
    "# Empty",
    "nothing",
  ].join("\n");
  test("headings name scenes; the scene's tracks are its links and embeds, each once", () => {
    const scenes = m.scenesOf(note, resolve);
    assert.deepEqual(scenes, [
      { name: "", tracks: ["Sons/porta.mp3"] },
      { name: "Taverna", tracks: ["Música/taverna.mp3", "Música/chuva.ogg", "Música/batalha.m4a"] },
      { name: "Batalha", tracks: ["Música/batalha.m4a", "Música/fim.wav"] },
    ]);
  });
  test("next and previous walk the scene; at the end, nothing, or the first with loop", () => {
    const scene = m.sceneWith(m.scenesOf(note, resolve), "Música/chuva.ogg");
    assert.equal(scene.name, "Taverna");
    assert.equal(m.nextIn(scene, "Música/chuva.ogg"), "Música/batalha.m4a");
    assert.equal(m.nextIn(scene, "Música/batalha.m4a"), null);
    assert.equal(m.nextIn(scene, "Música/batalha.m4a", true), "Música/taverna.mp3");
    assert.equal(m.previousIn(scene, "Música/taverna.mp3"), null);
    assert.equal(m.previousIn(scene, "Música/taverna.mp3", true), "Música/batalha.m4a");
    assert.equal(m.previousIn(scene, "Música/chuva.ogg"), "Música/taverna.mp3");
    assert.equal(m.nextIn(null, "x.mp3"), null);
    assert.equal(m.nextIn(scene, "Sons/porta.mp3"), null, "not in this scene");
  });
  test("a file linked in two scenes plays in the one its button is under", () => {
    const text = "# A\n- [[x.mp3]]\n- [[y.mp3]]\n```\n# Not a heading\n```\n# B\n- [[y.mp3]]\n";
    const scenes = m.scenesOf(text, (t) => t);
    assert.equal(m.sceneUnder(scenes, "y.mp3", "B").name, "B");
    assert.equal(m.sceneUnder(scenes, "y.mp3", "A").name, "A");
    assert.equal(m.sceneUnder(scenes, "y.mp3", "Elsewhere").name, "A", "the first that holds it");
    assert.equal(m.headingBefore(text, text.indexOf("[[y.mp3]]")), "A");
    assert.equal(m.headingBefore(text, text.lastIndexOf("[[y.mp3]]")), "B");
    assert.equal(m.headingBefore(text, text.indexOf("Not a heading") + 3), "A", "a fenced block's line is no heading");
    assert.equal(m.headingBefore("- [[x.mp3]]", 3), null);
  });
  test("a sound file by its name; a track's name is the file's", () => {
    assert.equal(m.isAudio("a/b.MP3"), true);
    assert.equal(m.isAudio("a/b.flac|x"), true);
    assert.equal(m.isAudio("a/b.md"), false);
    assert.equal(m.trackName("Música/A taverna.mp3"), "A taverna");
  });
});

describe("the formats an engine plays", () => {
  test("canPlayType's maybe and probably are a yes, nothing is a no", () => {
    const engine = (mime) => (mime === "audio/mpeg" ? "probably" : mime === "audio/mp4" ? "maybe" : "");
    assert.equal(m.canPlay("a.mp3", engine), true);
    assert.equal(m.canPlay("a.m4a", engine), true);
    assert.equal(m.canPlay("a.ogg", engine), false);
    assert.equal(m.canPlay("a.txt", engine), false);
    assert.equal(m.canPlay("a.mp3", () => { throw new Error("x"); }), false);
  });
  test("a WAV or FLAC over 30 MB is large; an MP3 never", () => {
    assert.equal(m.large("a.wav", 31 * 1024 * 1024), true);
    assert.equal(m.large("a.flac", 10), false);
    assert.equal(m.large("a.mp3", 300 * 1024 * 1024), false);
    assert.equal(m.large("a.wav", null), false);
  });
});

describe("the state a window plays from", () => {
  test("the contract's playback read: numbers that may be null are numbers; an unknown state is stopped", () => {
    const wire = { table: "", channel: "music", revision: 3, source: { kind: "file", path: "a.mp3" }, unseen: false, state: "playing", position_ms: null, anchor_ms: 5, master: 70, looping: true, duration_ms: null, by: "Ana", by_id: "a", unheard: ["Bia"], cannot: [] };
    const p = m.readPlayback(wire);
    assert.equal(p.revision, 3);
    assert.equal(p.positionMs, 0);
    assert.equal(p.anchorMs, 5);
    assert.equal(p.path, "a.mp3");
    assert.deepEqual(p.unheard, ["Bia"]);
    assert.equal(m.readPlayback({ ...wire, state: "odd" }).state, "stopped");
    assert.equal(m.readPlayback({ ...wire, unseen: true, source: null }).path, null);
  });
  test("alone in a folder of this computer the state is the window's: play, pause, seek, loop, stop", () => {
    let now = 1000;
    const s = m.localSound(() => now);
    assert.equal(s.shared, false);
    assert.equal(s.controls(), true);
    assert.equal(s.music(), null);
    void s.play("a.mp3", { durationMs: 10_000 });
    assert.equal(s.music().state, "playing");
    assert.equal(s.music().revision, 1);
    now = 4000;
    void s.change("pause");
    assert.equal(s.music().positionMs, 3000);
    void s.change("seek", 500);
    assert.equal(s.music().positionMs, 500);
    void s.change("loop", null, true);
    assert.equal(s.music().looping, true);
    void s.change("master", 30);
    assert.equal(s.music().master, 30);
    void s.change("stop");
    assert.equal(s.music().state, "stopped");
    assert.equal(s.music().revision, 6);
  });
});

describe("the server's music", () => {
  const wire = (over) => ({ table: "", channel: "music", revision: 1, source: { kind: "file", path: "a.mp3" }, unseen: false, state: "playing", position_ms: 0, anchor_ms: 1000, master: 100, looping: false, duration_ms: 5000, by: "Mestre", by_id: "m", unheard: [], cannot: [], ...over });
  function fakeApi() {
    const heard = new Map();
    const calls = [];
    return {
      calls,
      tell: (event, payload) => heard.get(event)?.(payload),
      api: {
        play: async (path, opts, table) => {
          calls.push(["play", path, opts.ask, table]);
          return path === "hidden.mp3" && opts.ask ? { status: "ok", data: { playback: null, unheard: ["Ana"] } } : { status: "ok", data: { playback: wire({ revision: 2, source: { kind: "file", path } }), unheard: [] } };
        },
        change: async (wish, revision) => {
          calls.push(["change", wish, revision]);
          return wish === "resume" ? { status: "error", error: { kind: "refused", message: "the music changed meanwhile" } } : { status: "ok", data: wire({ revision: revision + 1, state: "paused" }) };
        },
        time: async () => ({ status: "ok", data: { now_ms: 50_000 } }),
        cannot: async (revision) => {
          calls.push(["cannot", revision]);
          return { status: "ok", data: null };
        },
        listen: async (event, fn) => {
          heard.set(event, fn);
          return () => heard.delete(event);
        },
      },
    };
  }
  test("starts from the join, takes the events of its table, never an older revision", async () => {
    const f = fakeApi();
    const s = await m.serverSound({ api: f.api, table: "", controls: true, playback: [wire({ revision: 3 })], explain: (e) => e.message, now: () => 0 });
    assert.equal(s.shared, true);
    assert.equal(s.music().revision, 3);
    f.tell("table-playback", wire({ revision: 2, state: "paused" }));
    assert.equal(s.music().state, "playing", "an older state told late");
    f.tell("table-playback", wire({ table: "Outra", revision: 9 }));
    assert.equal(s.music().revision, 3, "another table's");
    f.tell("table-playback", wire({ revision: 4, unseen: true, source: null }));
    assert.equal(s.music().path, null);
    assert.equal(s.music().unseen, true);
    s.close();
  });
  test("the clock is the server's once it answers", async () => {
    const f = fakeApi();
    const s = await m.serverSound({ api: f.api, table: "", controls: false, playback: [], explain: (e) => e.message, now: () => 10_000 });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(s.serverNow(), 50_000);
    s.close();
  });
  test("a hidden file asks first; a control names the revision it was made on; a refusal is told", async () => {
    const f = fakeApi();
    const s = await m.serverSound({ api: f.api, table: "", controls: true, playback: [], explain: (e) => e.message, now: () => 0 });
    assert.deepEqual(await s.play("hidden.mp3", { ask: true }), { unheard: ["Ana"] });
    assert.equal(s.music(), null, "nothing plays until the master decides");
    assert.deepEqual(await s.play("a.mp3", { ask: true }), {});
    assert.equal(s.music().revision, 2);
    assert.equal(await s.change("pause"), null);
    assert.deepEqual(f.calls.at(-1), ["change", "pause", 2]);
    assert.equal(s.music().state, "paused");
    assert.equal(await s.change("resume"), "the music changed meanwhile");
    s.cannotPlay(3);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(f.calls.at(-1), ["cannot", 3]);
    s.close();
  });
});
