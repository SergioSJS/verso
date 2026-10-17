// A web page where the side has no child web views (ADR 0076 item 11):
// the page in an iframe if the site allows being framed, and a card
// with a link to open in a new tab when it does not.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:7340/", settings: { navigation: { disableMainFrameNavigation: true } } });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "getComputedStyle"]) {
  globalThis[name] = name === "window" ? win : typeof win[name] === "function" ? win[name].bind(win) : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

let frameable = {};
let asked = [];

win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === "embed_frameable") {
      asked.push(args.url);
      const answer = frameable[new URL(args.url).origin];
      if (answer === "error") throw { kind: "failed", message: "network" };
      return answer ?? false;
    }
    return null;
  },
  transformCallback: () => 0,
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;

for (const id of ["open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear", "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces", "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label"]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

await esbuild.build({
  entryPoints: ["src/screen/framed.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/framed.test-bundle.mjs",
  logLevel: "error",
});
const { framedPage } = await import("./.bundles/framed.test-bundle.mjs");

const later = () => new Promise((r) => setTimeout(r, 20));

describe("framedPage on a server without child web views", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    asked = [];
    frameable = {};
  });

  test("shows an iframe without hint line when the site allows framing", async () => {
    frameable = { "https://open.example": true };
    const box = framedPage("https://open.example/page");
    document.body.append(box);
    await later();

    const frame = box.querySelector("iframe.framed-frame");
    assert.ok(frame, "iframe is present");
    assert.equal(frame.getAttribute("src"), "https://open.example/page");
    assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
    assert.equal(box.querySelector(".framed-line"), null, "no hint line");
    assert.equal(box.querySelector(".framed-card"), null, "no card");
  });

  test("shows a card to open in a new tab when the site forbids framing", async () => {
    frameable = { "https://shut.example": false };
    const box = framedPage("https://shut.example/page");
    document.body.append(box);
    await later();

    assert.equal(box.querySelector("iframe"), null, "no iframe");
    const card = box.querySelector(".framed-card");
    assert.ok(card, "card is present");
    const link = card.querySelector("a.framed-card-btn");
    assert.ok(link, "open button is present");
    assert.equal(link.getAttribute("href"), "https://shut.example/page");
    assert.equal(link.getAttribute("target"), "_blank");
  });

  test("an error from the check treats the site as not frameable", async () => {
    frameable = { "https://err.example": "error" };
    const box = framedPage("https://err.example/page");
    document.body.append(box);
    await later();

    assert.equal(box.querySelector("iframe"), null, "no iframe");
    assert.ok(box.querySelector(".framed-card"), "card is shown on error");
  });
});
