// Audio embeds with a player (ADR 0116, amendment of 2026-11-01): the pure
// rules the player in a note and on a board plays by — which embed names a
// sound file, the time it shows, the person's own volume kept on this
// device, the table's music lowered while a local embed plays and the local
// one paused when the table's music starts, and the hand-over of a playing
// element to the player drawn again in its place. The player itself is
// tried in e2e/audio-embed.spec.mjs; the hidden file at a table in
// e2e-server/audio-embed.spec.mjs.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/audio/state";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/audioEmbed.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/audioEmbed.test-bundle.mjs");

describe("which embed is a sound file", () => {
  test("the extensions the table plays, any case, with a heading, a size or a query after", () => {
    for (const t of ["taverna.mp3", "assets/sons/Taverna.MP3", "a.wav", "a.ogg", "a.oga", "a.opus", "a.m4a", "a.flac", "a.aac", "a.mp3#t=10", "a.mp3|300", "a%20b.mp3", "a.mp3?x=1"]) {
      assert.equal(m.audioTarget(t), true, t);
    }
  });
  test("not a picture, a note, a PDF, a video or an address on the web", () => {
    for (const t of ["mapa.png", "Taverna", "Taverna.md", "livro.pdf", "a.mp4", "mp3", "a.mp3.md", "https://example.com/a.mp3", "data:audio/mpeg;base64,AAAA", "", "   "]) {
      assert.equal(m.audioTarget(t), false, t);
    }
  });
});

describe("the time the player shows", () => {
  test("position and length; the length unknown is not drawn", () => {
    assert.equal(m.timeText(12_300, 83_000), "0:12 / 1:23");
    assert.equal(m.timeText(0, null), "0:00");
    assert.equal(m.timeText(3_725_000, 7_200_000), "1:02:05 / 2:00:00");
    assert.equal(m.timeText(Number.NaN, Number.POSITIVE_INFINITY), "0:00");
  });
});

describe("the person's own volume, kept on this device", () => {
  test("read as written, or the defaults", () => {
    assert.deepEqual(m.ownPrefs(null), { volume: 80, muted: false });
    assert.deepEqual(m.ownPrefs("not json"), { volume: 80, muted: false });
    assert.deepEqual(m.ownPrefs(JSON.stringify({ volume: 35, muted: true })), { volume: 35, muted: true });
    assert.deepEqual(m.ownPrefs(JSON.stringify({ volume: 400 })), { volume: 100, muted: false });
    assert.deepEqual(m.ownPrefs(JSON.stringify({ volume: -3, muted: "yes" })), { volume: 0, muted: false });
  });
  test("the gain: the volume, or none when muted", () => {
    assert.equal(m.ownGain({ volume: 50, muted: false }), 0.5);
    assert.equal(m.ownGain({ volume: 50, muted: true }), 0);
  });
});

describe("a local embed and the table's music do not fight", () => {
  test("the table's music is lowered while a local embed plays, and only then", () => {
    assert.equal(m.duckFactor(true, true), m.DUCK);
    assert.ok(m.DUCK > 0 && m.DUCK < 0.5, "lowered, still heard");
    assert.equal(m.duckFactor(false, true), 1);
    assert.equal(m.duckFactor(true, false), 1);
    assert.equal(m.duckFactor(false, false), 1);
  });
  test("the table's music starting pauses the local embed: a play, a resume, another track — not a seek or the volume", () => {
    const playing = (path, rev = 1) => ({ path, state: "playing", revision: rev });
    assert.equal(m.tableStarted(null, playing("a.mp3")), true, "from nothing");
    assert.equal(m.tableStarted({ path: "a.mp3", state: "paused", revision: 1 }, playing("a.mp3", 2)), true, "resumed");
    assert.equal(m.tableStarted({ path: "a.mp3", state: "stopped", revision: 1 }, playing("a.mp3", 2)), true, "played again");
    assert.equal(m.tableStarted(playing("a.mp3"), playing("b.mp3", 2)), true, "another track");
    assert.equal(m.tableStarted(playing("a.mp3"), playing("a.mp3", 2)), false, "a seek or the table's volume");
    assert.equal(m.tableStarted(playing("a.mp3"), { path: "a.mp3", state: "paused", revision: 2 }), false, "a pause");
    assert.equal(m.tableStarted(null, null), false);
    assert.equal(m.tableStarted(null, playing(null)), false, "a track this person does not see: nothing heard, nothing paused");
  });
});

describe("a player drawn again keeps the sound going", () => {
  const p = (path, shown, playing, fresh) => ({ path, shown, playing, fresh });
  test("a playing element whose player is not shown (drawn anew, the other mode of the note) goes to a fresh player of the same file that is", () => {
    const players = [p("a.mp3", false, true, false), p("b.mp3", true, false, true), p("a.mp3", true, false, true)];
    assert.deepEqual(m.handovers(players), [[0, 2]]);
  });
  test("never to a player that was used, nor to one not shown, nor twice", () => {
    assert.deepEqual(m.handovers([p("a.mp3", false, true, false), p("a.mp3", true, false, false)]), []);
    assert.deepEqual(m.handovers([p("a.mp3", false, true, false), p("a.mp3", false, false, true)]), []);
    assert.deepEqual(m.handovers([p("a.mp3", false, true, false), p("a.mp3", false, true, false), p("a.mp3", true, false, true)]), [[0, 2]]);
  });
  test("one that finds no player in its place is stopped after a grace", () => {
    assert.equal(m.orphanStops(0), false);
    assert.equal(m.orphanStops(1), false);
    assert.equal(m.orphanStops(m.GRACE_SWEEPS), true);
  });
});
