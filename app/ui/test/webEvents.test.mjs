// The web window's events (the maintainer's console on a player's page,
// 2026-11-05: "[TAURI] Couldn't find callback id …" ~47 times). Tauri's
// mock forgot no listener on `unlisten`; the bridge answers the event
// plugin itself (src/web/events.ts): a listener gone is gone, `once`
// leaves nothing behind, and nothing is warned of over a session.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

globalThis.window = globalThis;
await esbuild.build({
  stdin: {
    contents: `
      import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
      import { emit, listen, once } from "@tauri-apps/api/event";
      import { eventCall, listenersOf } from "./src/web/events";
      export function install() {
        mockWindows("main");
        mockIPC(async (cmd, args) => {
          const heard = eventCall(cmd, args ?? {});
          return heard.handled ? heard.value : null;
        });
      }
      export { emit, listen, once, listenersOf };
    `,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: "test/.bundles/webEvents.test-bundle.mjs",
  logLevel: "error",
});
const { install, emit, listen, once, listenersOf } = await import("./.bundles/webEvents.test-bundle.mjs");

test("listeners come and go over a session with nothing warned", async () => {
  const warned = [];
  const was = console.warn;
  console.warn = (...a) => warned.push(a.join(" "));
  try {
    install();
    const got = [];
    const stop = await listen("folder-changed", (e) => got.push(e.payload));
    await emit("folder-changed", 1);
    await stop();
    assert.equal(listenersOf("folder-changed"), 0);
    for (let i = 0; i < 50; i++) await emit("folder-changed", i);
    assert.deepEqual(got, [1]);

    const onceGot = [];
    await once("server-back", (e) => onceGot.push(e.payload));
    await emit("server-back", "a");
    await emit("server-back", "b");
    assert.deepEqual(onceGot, ["a"]);
    assert.equal(listenersOf("server-back"), 0);

    // Two listeners of one event: the one left still hears, with its event.
    const a = [];
    const b = [];
    const stopA = await listen("table-entry", (e) => a.push(e));
    await listen("table-entry", (e) => b.push(e.payload));
    await stopA();
    await emit("table-entry", { text: "oi" });
    assert.deepEqual(a, []);
    assert.deepEqual(b, [{ text: "oi" }]);
    assert.equal(listenersOf("table-entry"), 1);
  } finally {
    console.warn = was;
  }
  assert.deepEqual(warned, []);
});
