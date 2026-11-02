// A share that cannot be heard in this page (plain HTTP: no AudioWorklet, and no ScriptProcessor either): logged once,
// not tried again at every evaluation, said in the tab; the next share tries again.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/sound/shareLife";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/shareDeaf.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/shareDeaf.test-bundle.mjs");

const share = (id) => ({ table: "", id, name: "Spotify", kind: "app", by: "Ana", by_id: "acc-ana", started_ms: 0, bitrate_kbps: 96, listeners: null, rate_bps: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a share with no audio path is logged once and said as deaf", async () => {
  const logged = [];
  const deaf = [];
  let opens = 0;
  const s = new m.TableShare({
    api: { listen: async () => ({ status: "ok", data: null }), events: async () => () => {} },
    table: "",
    share: share(0x80000001),
    gate: { ready: () => true, onReady: () => {} },
    open: async () => {
      opens++;
      const e = new Error("no audio path for a share in this page");
      e.name = "NoAudioPath";
      throw e;
    },
    gain: () => 1,
    follows: () => true,
    own: () => null,
    changed: () => {},
    log: (l) => logged.push(l),
    deaf: (on) => deaf.push(on),
  });
  await s.start();
  await tick();
  for (let i = 0; i < 20; i++) {
    s.evaluate();
    await tick();
  }
  assert.equal(opens, 1);
  assert.equal(logged.length, 1);
  assert.deepEqual(deaf, [true]);
});
