// A read link's visitor at a computer that serves gets the table-offline
// page when the game master stops serving (ADR 0117; the re-test of
// 2026-11-04: the visitor saw only "the connection was lost… trying
// again" forever). Its page asked to hear `server-gone` before the
// bridge that carries the window's events was installed: Tauri's real
// `listen` then had nothing to speak to, and the watch died in silence.
// Here with Tauri's own `listen` and the bridge's mocked events, in that
// order: the watch must hold once the bridge is there.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://mesa.example.com/r/tok" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "Event", "CustomEvent", "addEventListener", "dispatchEvent"]) {
  globalThis[name] = name === "window" ? win : typeof win[name] === "function" && !/^[A-Z]/.test(name) ? win[name].bind(win) : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
document.documentElement.lang = "pt-BR";

await esbuild.build({
  entryPoints: ["src/web/localTable.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localTableWatch.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const T = await import("./.bundles/localTableWatch.test-bundle.mjs");
const { mockIPC } = await import("@tauri-apps/api/mocks");
const { emit } = await import("@tauri-apps/api/event");

const settle = () => new Promise((r) => setTimeout(r, 10));

test("watched before the bridge is installed, the visitor still gets the table offline", async () => {
  const asked = [];
  // The computer stopped: Cloudflare answers for the link with its page.
  const get = async (url) => {
    asked.push(String(url));
    return new Response("<html>Error 1033</html>", { status: 530, headers: { "content-type": "text/html" } });
  };
  document.body.innerHTML = "";
  // The visitor's page, as web.ts ran it: the watch first…
  assert.equal(T.watchIfLocal(true, "tok", get), true);
  await settle();
  // …then the bridge, which installs the window's events.
  mockIPC(async () => null, { shouldMockEvents: true });
  T.bridgeReady();
  await settle();
  // The connection drops: the bridge says so as the desktop's host does.
  await emit("server-gone", { url: win.location.origin, what: "connection", address: null, reason: null });
  await settle();
  assert.ok(asked.includes("/r/tok/state"), `the link's gate was asked: ${asked.join(", ")}`);
  const offline = document.querySelector(".web-offline");
  assert.ok(offline, "the table-offline page is shown");
  assert.match(offline.textContent, /A mesa está offline/);
  offline.querySelector(".web-secondary").click();
});
