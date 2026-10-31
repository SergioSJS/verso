// The table's chime (ADR 0107, 2026-10-23): which entries earn it, the notes of each sound, the readers.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const stub = {
  name: "stub",
  setup(b) {
    b.onResolve({ filter: /settings$|dice3d\/audio$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: a.path.endsWith("settings") ? "export const settings = {};" : "export const audioContext = () => globalThis.__ctx ?? null; export const armAudio = () => {}; export const unlockAudio = () => null;",
      loader: "js",
    }));
  },
};
await esbuild.build({ stdin: { contents: `export * from "./src/table/chime";`, resolveDir: ".", loader: "ts" }, bundle: true, format: "esm", platform: "node", plugins: [stub], outfile: "test/.bundles/tableChime.test-bundle.mjs", logLevel: "error" });
const m = await import("./.bundles/tableChime.test-bundle.mjs");

const entry = (o) => ({ mine: false, kind: "say", ...o });

test("only another person's message or roll earns the chime", () => {
  assert.equal(m.earnsChime(entry({}), false, false), true);
  assert.equal(m.earnsChime(entry({ kind: "roll" }), false, false), true);
  assert.equal(m.earnsChime(entry({ mine: true }), false, false), false);
  assert.equal(m.earnsChime(entry({ kind: "secret" }), false, false), false);
});

test("not while the person types in the box, and not when the dice fall for the roll", () => {
  assert.equal(m.earnsChime(entry({}), false, true), false);
  assert.equal(m.earnsChime(entry({ kind: "roll" }), true, false), false);
  assert.equal(m.earnsChime(entry({ kind: "table" }), true, false), false);
  // A message is never a fall.
  assert.equal(m.earnsChime(entry({ kind: "say" }), true, false), true);
});

test("each sound has notes, off has none; readers close what they read", () => {
  for (const c of ["soft", "bell", "pop"]) assert.ok(m.notesOf(c).length > 0, c);
  assert.deepEqual(m.notesOf("off"), []);
  assert.equal(m.readChime(undefined), "soft");
  assert.equal(m.readChime("pop"), "pop");
  assert.equal(m.readChime("x"), "soft");
  assert.equal(m.readVolume(undefined), 60);
  assert.equal(m.readVolume(150), 100);
  assert.equal(m.readVolume(-3), 0);
});

test("with no audio context, or one that is not running, the chime is silent and never queued", () => {
  globalThis.__ctx = null;
  assert.equal(m.playChime("soft", 60), false);
  globalThis.__ctx = { state: "suspended" };
  assert.equal(m.playChime("soft", 60), false);
  let started = 0;
  const node = () => ({ connect: (n) => n ?? node(), start: () => started++, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  globalThis.__ctx = { state: "running", currentTime: 1, destination: {}, createOscillator: node, createGain: node };
  assert.equal(m.playChime("soft", 60), true);
  assert.equal(started, 2);
  assert.equal(m.playChime("soft", 0), false);
  assert.equal(m.playChime("off", 60), false);
});
