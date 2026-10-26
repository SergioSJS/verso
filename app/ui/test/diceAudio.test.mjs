// The dice's audio context (audio.ts, sound.ts): made only inside a gesture,
// never by the idle preload, and one INFO line per roll.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const stub = {
  name: "stub-bindings",
  setup(b) {
    b.onResolve({ filter: /bindings$/ }, () => ({ path: "bindings", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const commands = { logWrite: (l, m) => { globalThis.__logs.push([l, m]); return Promise.resolve(null); } };", loader: "js" }));
  },
};
await esbuild.build({
  stdin: { contents: `export * from "./src/dice3d/audio"; export * from "./src/dice3d/sound";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [stub],
  outfile: "test/.bundles/diceAudio.test-bundle.mjs",
  logLevel: "error",
});

globalThis.__logs = [];
const listeners = new Map();
globalThis.document = {
  baseURI: "http://x/",
  hidden: false,
  addEventListener: (t, f) => listeners.set(t, [...(listeners.get(t) ?? []), f]),
  removeEventListener: (t, f) => listeners.set(t, (listeners.get(t) ?? []).filter((g) => g !== f)),
};
let made = 0;
let inGesture = false;
let madeOutside = 0;
let resumed = 0;
class FakeCtx {
  constructor() {
    made++;
    if (!inGesture) madeOutside++;
    this.state = "suspended";
    this.currentTime = 0;
  }
  resume() {
    resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  decodeAudioData() {
    return Promise.resolve({ fake: true });
  }
  createBufferSource() {
    const n = { start: (t) => started.push(t), stop() {}, connect: (x) => x, disconnect() {} };
    return n;
  }
  createGain() {
    return { gain: { value: 1 }, connect: (x) => x, disconnect() {} };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(4) };
  }
  get destination() {
    return {};
  }
}
const started = [];
globalThis.window = { AudioContext: FakeCtx };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const gesture = (type) => {
  inGesture = true;
  for (const f of listeners.get(type) ?? []) f();
  inGesture = false;
};

const m = await import("./.bundles/diceAudio.test-bundle.mjs");

test("the idle preload makes no AudioContext; a gesture makes exactly one, resumed inside it", async () => {
  m.preloadSounds();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(made, 0);
  assert.equal(m.audioContext(), null);
  m.armAudio(() => true);
  gesture("pointerdown");
  gesture("keydown");
  gesture("click");
  assert.equal(made, 1);
  assert.equal(madeOutside, 0);
  assert.equal(resumed, 1);
  assert.ok(m.audioContext());
});

test("no gesture, no context: the kit is null and the reason is logged once", async () => {
  m.resetAudioForTests();
  const before = made;
  assert.equal(await m.loadSounds(["plastic"]), null);
  assert.equal(await m.loadSounds(["plastic"]), null);
  assert.equal(made, before);
  assert.equal(globalThis.__logs.filter(([l, t]) => l === "WARN" && /no audio context/.test(t)).length, 1);
});

test("a roll writes one INFO diagnostic line with the state and the tally", async () => {
  m.resetAudioForTests();
  m.unlockAudio();
  const kit = await m.loadSounds(["plastic"], 50);
  globalThis.__logs.length = 0;
  kit.diagnose({ played: 3, lost: 1, silent: 2, late: 4 });
  const info = globalThis.__logs.filter(([l]) => l === "INFO");
  assert.equal(info.length, 1);
  assert.match(info[0][1], /^dice sound: ctx=running buffers=\d+ played=3 lost=1 silent=2 late=4 stalled=0 first=none end=running clockRate=n\/a base=n\/a out=n\/a resumeMs=\d+ maxAheadMs=0$/);
});

test("clockWatch: a clock never seen to move, or standing still, is not live", () => {
  const w = m.clockWatch();
  assert.equal(w.sample(1, 0), false);
  assert.equal(w.sample(1, 20), false);
  assert.equal(w.sample(1.02, 40), true);
  assert.equal(w.sample(1.02, 60), true);
  assert.equal(w.sample(1.02, 40 + m.CLOCK_STALL_MS + 1), false);
  assert.equal(w.sample(1.5, 400), true);
});

test("a hit on a stalled audio clock is dropped as late and never queued; on a running clock it is queued", async () => {
  m.resetAudioForTests();
  const ctx = m.unlockAudio();
  const kit = await m.loadSounds(["plastic"], 50);
  // Warm-up (keep-awake noise) may have started one source: count only hits.
  started.length = 0;
  const realNow = performance.now.bind(performance);
  let wall = 1000;
  performance.now = () => wall;
  try {
    ctx.currentTime = 0;
    // First samples: the clock has never been seen to move.
    assert.equal(kit.hit("dice", "plastic", 10, 5.01), "late");
    wall += 16;
    assert.equal(kit.hit("dice", "plastic", 10, 5.01), "late");
    assert.equal(started.length, 0);
    // The clock moves: queued.
    ctx.currentTime = 5.016;
    wall += 16;
    assert.equal(kit.hit("dice", "plastic", 10, 5.03), "played");
    assert.equal(started.length, 1);
    // The device stalls for longer than the bound: dropped, nothing queued.
    wall += m.CLOCK_STALL_MS + 20;
    assert.equal(kit.hit("dice", "plastic", 10, 5.2), "late");
    assert.equal(started.length, 1);
    // It wakes: queued again.
    ctx.currentTime = 5.5;
    assert.equal(kit.hit("dice", "plastic", 10, 5.52), "played");
    assert.equal(started.length, 2);
  } finally {
    performance.now = realNow;
    m.resetAudioForTests(); // stops the keep-awake timer
  }
});

test("only a dice gesture keeps the output awake; writing notes does not", () => {
  m.resetAudioForTests();
  const before = started.length;
  m.armAudio(() => true);
  const mk = (hit) => ({ target: { closest: () => hit } });
  globalThis.document.querySelector = () => null;
  for (const f of listeners.get("keydown") ?? []) f(mk(null));
  const afterNotes = started.length;
  for (const f of listeners.get("click") ?? []) f(mk({}));
  const afterDice = started.length;
  globalThis.document.querySelector = () => ({ getClientRects: () => [{}] });
  m.resetAudioForTests(); // Table open: any gesture counts
  for (const f of listeners.get("keydown") ?? []) f(mk(null));
  const afterTable = started.length;
  globalThis.document.querySelector = undefined;
  m.resetAudioForTests();
  assert.equal(afterNotes - before, 0);
  assert.equal(afterDice - afterNotes, 1);
  assert.equal(afterTable - afterDice, 1);
});
