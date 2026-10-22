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
}
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
  assert.match(info[0][1], /^dice sound: ctx=running buffers=\d+ played=3 lost=1 silent=2 late=4$/);
});
