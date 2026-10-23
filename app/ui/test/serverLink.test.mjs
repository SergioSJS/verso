// A link the server made opens where the window reaches the server: a path
// is put after the server's address — the page's origin in a browser, the
// address the app is signed in to on the desktop, whose own origin is the
// app's (ADR 0076 item 11).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/serverLink.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/serverLink.test-bundle.mjs",
  logLevel: "error",
});
const { resolveServerLink, noteLink, serverBase } = await import("./.bundles/serverLink.test-bundle.mjs");

const desktop = { url: "http://192.168.3.150:7340/", folder: "f1" };

describe("a path from the server", () => {
  test("in a browser, after the page's origin", () => {
    assert.equal(resolveServerLink("/invite/abc", null, "https://mesa.casa"), "https://mesa.casa/invite/abc");
  });
  test("on the desktop, after the server's address, never the app's origin", () => {
    assert.equal(resolveServerLink("/invite/abc", desktop, "tauri://localhost"), "http://192.168.3.150:7340/invite/abc");
    assert.equal(resolveServerLink("/invite/abc", desktop, "http://tauri.localhost"), "http://192.168.3.150:7340/invite/abc");
  });
  test("a whole link stays as the server made it", () => {
    assert.equal(resolveServerLink("https://mesa.casa/invite/abc", desktop, "tauri://localhost"), "https://mesa.casa/invite/abc");
  });
  test("a protocol-relative path is no path of the server's", () => {
    assert.equal(resolveServerLink("//evil.example/x", desktop, "tauri://localhost"), "//evil.example/x");
  });
});

describe("a note's address", () => {
  test("in a browser: the origin and the tab's folder", () => {
    assert.equal(noteLink("A b.md", "f9", null, "https://mesa.casa"), "https://mesa.casa/?folder=f9&note=A%20b.md");
  });
  test("on the desktop: the server's address and the folder there", () => {
    assert.equal(noteLink("A b.md", "", desktop, "tauri://localhost"), "http://192.168.3.150:7340/?folder=f1&note=A%20b.md");
    assert.equal(serverBase(desktop, "tauri://localhost"), "http://192.168.3.150:7340");
  });
});
