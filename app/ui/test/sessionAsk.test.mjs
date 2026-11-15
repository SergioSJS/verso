// A browser window whose session the server ended while its connection was
// down (an admin ending the device's sessions, its expiry) is refused at
// every upgrade with 401, which a browser sees only as a close (1006), the
// same as a network that is not back. Before this, the window said
// "offline" for ever and took edits into the kept copy that the next page
// load deleted. Now a connection that closed before it ever opened asks
// `/api/state`; only the server's own answer naming no account ends the
// session, and then the window takes the path of `{"gone":"session"}`
// (ADR 0092 item 6). The bridge's side (web/bridge.ts) is checked by the
// server e2e suite (e2e-server/offline.spec.mjs, "a session ended while the connection was down").

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: 'export { askSession } from "./src/web/sessionAsk"; export { SyncLink } from "./src/web/offline/link";',
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/sessionAsk.test-bundle.mjs",
  logLevel: "error",
});
const { askSession, SyncLink } = await import("./.bundles/sessionAsk.test-bundle.mjs");

const answer = (ok, body) => async () => ({ ok, json: async () => body });

describe("Asking the server whether the session is still there", () => {
  test("a success naming no account: the session ended", async () => {
    assert.equal(await askSession(answer(true, { account: null, setup: false })), "ended");
  });
  test("a success naming the account: still signed in", async () => {
    assert.equal(await askSession(answer(true, { account: { id: "a" } })), "signed-in");
  });
  test("anything that is not the server's own answer is not known", async () => {
    assert.equal(await askSession(answer(false, { account: null })), "unknown", "an error status (a proxy's 502)");
    assert.equal(await askSession(answer(true, { other: 1 })), "unknown", "a body without the account");
    assert.equal(await askSession(answer(true, null)), "unknown", "no body");
    assert.equal(
      await askSession(async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError("html")) })),
      "unknown",
      "a page that is not JSON",
    );
    assert.equal(await askSession(async () => Promise.reject(new TypeError("Failed to fetch"))), "unknown", "no network");
  });
});

// The sync connection of a kept folder, over a WebSocket that never comes up.
const sockets = [];
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    sockets.push(this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type, ev = {}) {
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }
  send() {}
  close() {}
}
const realSetTimeout = setTimeout;
globalThis.WebSocket = FakeSocket;
globalThis.location = { protocol: "https:", host: "verso.test", origin: "https://verso.test" };
// The backoff shortened: a retry comes in milliseconds, not seconds.
globalThis.window = { setTimeout: (fn, ms) => realSetTimeout(fn, Math.min(ms, 10)) };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const settle = (ms = 80) => new Promise((r) => realSetTimeout(r, ms));
const links = [];
after(() => {
  for (const l of links) l.stop();
});

function link(ask) {
  const heard = { gone: [], down: 0, asked: 0 };
  const events = {
    open() {},
    push() {},
    down: () => heard.down++,
    gone: (what, reason) => heard.gone.push([what, reason]),
    mismatch() {},
  };
  const l = new SyncLink("f1", events, () => "", async () => {
    heard.asked++;
    return ask;
  });
  links.push(l);
  return { l, heard };
}

describe("The sync connection refused before it opened", () => {
  test("a session the server ended: gone, once, and no more tries", async () => {
    sockets.length = 0;
    const { l, heard } = link("ended");
    l.start();
    assert.equal(sockets.length, 1);
    sockets[0].fire("close", { code: 1006 });
    await settle();
    assert.deepEqual(heard.gone, [["session", null]], "the session's path, as `{gone: session}` on an open socket");
    assert.equal(sockets.length, 1, "no connection tried after the session ended");
    l.nudge();
    assert.equal(sockets.length, 1, "nor when the page comes back to the front");
  });

  test("an answer not known (no network): it goes on trying, and says nothing of the session", async () => {
    sockets.length = 0;
    const { l, heard } = link("unknown");
    l.start();
    sockets[0].fire("close", { code: 1006 });
    await settle(30);
    assert.ok(sockets.length >= 2, "tried again");
    sockets.at(-1).fire("close", { code: 1006 });
    await settle(30);
    assert.deepEqual(heard.gone, []);
    assert.ok(heard.asked >= 2, "asked at each try");
    l.stop();
  });

  test("still signed in (the server not reached through the socket): it goes on trying", async () => {
    sockets.length = 0;
    const { l, heard } = link("signed-in");
    l.start();
    sockets[0].fire("close", { code: 1006 });
    await settle(30);
    assert.deepEqual(heard.gone, []);
    assert.ok(sockets.length >= 2);
    l.stop();
  });

  test("a connection that was up and dropped is not asked about", async () => {
    sockets.length = 0;
    const { l, heard } = link("ended");
    l.start();
    sockets[0].fire("open");
    sockets[0].fire("close", { code: 1006 });
    await settle(5);
    assert.equal(heard.asked, 0, "a drop after the socket opened is the network's");
    l.stop();
  });
});
