// The UniVerso's own Cloudflare link in the console (ADR 0117 D4 item 2,
// R5): the words the panel says of where the link stands, in both
// languages. The routes behind it are tested in the server's own suite
// (crates/verso-server/src/tests_tunnel.rs).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/web/consoleLink.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/consoleLink.test-bundle.mjs", logLevel: "error" });
const { linkWords } = await import("./.bundles/consoleLink.test-bundle.mjs");

const view = (over) => ({ state: "off", origin: null, until: null, own: false, ended: null, protocol: null, download: null, hostname: null, port: 7341, atStart: "off", tokenSet: false, publicUrl: false, ...over });

describe("What the console says of the link", () => {
  test("off, and why it last ended", () => {
    assert.equal(linkWords(view({}))[0].length > 0, true);
    const ceiling = linkWords(view({ ended: "ceiling" }))[0];
    assert.match(ceiling, /12/);
  });
  test("starting: the download's progress, when there is one", () => {
    const words = linkWords(view({ state: "starting", download: { done: 1024, total: 40 * 1024 * 1024 } }))[0];
    assert.match(words, /cloudflared/);
    assert.match(words, /40/);
  });
  test("on: a quick link's time left and its testing mode; an own address has neither", () => {
    const now = 1_700_000_000_000;
    const quick = linkWords(view({ state: "on", origin: "https://a-b.trycloudflare.com", until: now + (11 * 60 + 59) * 60000 }), now);
    assert.equal(quick.length, 3);
    assert.match(quick[1], /11 h 59 min/);
    const own = linkWords(view({ state: "on", origin: "https://mesa.example.com", own: true }), now);
    assert.equal(own.length, 1);
  });
  test("offline says to turn it on again", () => {
    assert.equal(linkWords(view({ state: "offline" })).length, 1);
  });
});
