// An embedded page in a note (ADR 0056, revised 2026-10-15): a site the
// host says may be framed gets a real, sandboxed <iframe> in its box; a
// site that refuses (or whose answer fails) keeps the child web view. The
// host answers once per origin. Driven in node over happy-dom with the
// host's answers given by the test.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "tauri://localhost/", settings: { navigation: { disableMainFrameNavigation: true } } });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "getComputedStyle", "MutationObserver"]) {
  globalThis[name] = name === "window" ? win : typeof win[name] === "function" ? win[name].bind(win) : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

/** What the host answers to `embed_frameable`, by origin; what it was asked,
 *  and which child views it was told to open. */
let frameable = {};
let asked = [];
let opened = [];
let closed = [];
let bounds = [];
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === "embed_frameable") {
      asked.push(args.url);
      const answer = frameable[new URL(args.url).origin];
      if (answer === "error") throw { kind: "failed", message: "network" };
      return answer ?? false;
    }
    if (cmd === "web_open") {
      opened.push(args.url);
      return `web-${opened.length}`;
    }
    if (cmd === "web_bounds") bounds.push(args.place);
    if (cmd === "web_close") closed.push(args.label);
    return null;
  },
  transformCallback: () => 0,
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;
win.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.requestAnimationFrame = win.requestAnimationFrame;

// The window's `ui` looks up its elements when the module loads.
for (const id of ["open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear", "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces", "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label"]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

// `overlayOpen` lives in the pane layout, which is the whole window; here
// no overlay is open.
const noOverlay = {
  name: "no-overlay",
  setup(build) {
    build.onResolve({ filter: /layout\/drag$/ }, () => ({ path: "drag", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const overlayOpen = () => false;", loader: "js" }));
  },
};

await esbuild.build({
  plugins: [noOverlay],
  entryPoints: ["src/leaves/web.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/embedFrame.test-bundle.mjs",
  logLevel: "error",
});
const web = await import("./.bundles/embedFrame.test-bundle.mjs");

const later = () => new Promise((r) => setTimeout(r, 20));

/** A note's embed box, laid out in a pane that shows it. */
function box(url) {
  const pane = document.createElement("div");
  const el = document.createElement("div");
  el.className = "embed-web";
  el.setAttribute("data-embed-web", url);
  pane.append(el);
  document.body.append(pane);
  return el;
}

describe("an embedded page in a note", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    asked = [];
    opened = [];
    closed = [];
    bounds = [];
    frameable = {};
  });

  test("the frame is sandboxed, lent nothing, and sends no referrer", () => {
    const frame = web.embedFrame("https://site.example/page");
    assert.equal(frame.tagName, "IFRAME");
    assert.equal(frame.getAttribute("src"), "https://site.example/page");
    assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
    assert.equal(frame.getAttribute("loading"), "lazy");
    assert.equal(frame.hasAttribute("allow"), false);
    const flags = frame.getAttribute("sandbox").split(" ");
    assert.deepEqual(flags.sort(), ["allow-forms", "allow-popups", "allow-popups-to-escape-sandbox", "allow-same-origin", "allow-scripts"]);
    assert.ok(!flags.includes("allow-top-navigation"), "the page cannot steer the window");
  });

  test("a site that allows framing gets an iframe in its box, and no child view", async () => {
    frameable = { "https://open.example": true };
    const el = box("https://open.example/a");
    web.tickEmbedViews();
    await later();
    web.tickEmbedViews();
    const frame = el.querySelector("iframe");
    assert.ok(frame, "an iframe in the box");
    assert.equal(frame.getAttribute("src"), "https://open.example/a");
    assert.ok(el.hasAttribute("data-embed-framed"));
    assert.equal(el.hasAttribute("data-embed-web"), false);
    assert.deepEqual(opened, []);
  });

  test("a site that refuses framing keeps the child view", async () => {
    frameable = { "https://shut.example": false };
    const el = box("https://shut.example/a");
    web.tickEmbedViews();
    await later();
    web.tickEmbedViews();
    assert.equal(el.querySelector("iframe"), null);
    assert.ok(el.hasAttribute("data-embed-web"));
    assert.equal(web.embedViews.has(el), true, "the child view's bookkeeping started");
  });

  test("review I7: the app's own origin is never framed, and the host is not asked", async () => {
    frameable = { "http://tauri.localhost": true };
    const el = box("http://tauri.localhost/index.html");
    web.tickEmbedViews();
    await later();
    web.tickEmbedViews();
    assert.equal(el.querySelector("iframe"), null);
    assert.deepEqual(asked, []);
  });

  test("an error in the check is a no: the child view takes it", async () => {
    frameable = { "https://down.example": "error" };
    const el = box("https://down.example/");
    web.tickEmbedViews();
    await later();
    web.tickEmbedViews();
    assert.equal(el.querySelector("iframe"), null);
    assert.ok(el.hasAttribute("data-embed-web"));
  });

  test("the host is asked once per origin", async () => {
    frameable = { "https://again.example": true };
    box("https://again.example/one");
    box("https://again.example/two");
    web.tickEmbedViews();
    await later();
    web.tickEmbedViews();
    assert.equal(asked.length, 1);
    assert.equal(document.querySelectorAll("iframe").length, 2);
    box("https://again.example/three");
    web.tickEmbedViews();
    await later();
    assert.equal(asked.length, 1, "the answer is kept");
    assert.equal(document.querySelectorAll("iframe").length, 3);
  });

  test("a look applied on the root moves the box, and the child view is sent its new place", async () => {
    frameable = { "https://shut.example": false };
    web.watchEmbedLayout();
    const el = box("https://shut.example/a");
    let left = 40;
    // The box as a narrow text width would lay it out.
    el.getBoundingClientRect = () => ({ left, top: 100, right: left + 600, bottom: 400, width: 600, height: 300, x: left, y: 100 });
    for (const t of [0, 1, 2, 3]) {
      web.tickEmbedViews();
      await later();
    }
    assert.equal(opened.length, 1, "the view opened");
    await later();
    bounds = [];
    left = 90;
    document.documentElement.setAttribute("data-line-width", "narrow");
    await later();
    await later();
    assert.ok(bounds.length >= 1, "web_bounds was sent without a resize or a scroll");
    assert.equal(bounds.at(-1).slot.x, 90);
    assert.equal(bounds.at(-1).slot.w, 600);
    document.documentElement.removeAttribute("data-line-width");
  });
});
