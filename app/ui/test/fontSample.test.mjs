// The font size's sample (Settings › Appearance › Text): the note's own
// text styles under the slider, fitted to the dialog and following the root.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "localStorage", "HTMLElement", "MutationObserver", "ResizeObserver", "requestAnimationFrame", "Node"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
globalThis.navigator ??= win.navigator;
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };

await esbuild.build({ entryPoints: ["src/fontSample.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/fontSample.test-bundle.mjs", logLevel: "error",
  plugins: [{
    name: "small-dom",
    setup(b) {
      b.onResolve({ filter: /\/dom$/ }, () => ({ path: "dom", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ loader: "js", contents: `export function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }` }));
    },
  }],
});
const { fontSample, fontSampleWords } = await import("./.bundles/fontSample.test-bundle.mjs");
const css = (f) => readFileSync(new URL(`../css/${f}`, import.meta.url), "utf8");
const frames = () => new Promise((r) => setTimeout(r, 60));

function mount(avail, natural, tall = 100) {
  const box = fontSample();
  const frame = box.querySelector(".font-sample-frame");
  const body = box.querySelector(".preview");
  Object.defineProperty(frame, "clientWidth", { get: () => avail, configurable: true });
  Object.defineProperty(body, "offsetWidth", { get: () => natural, configurable: true });
  Object.defineProperty(body, "offsetHeight", { get: () => tall, configurable: true });
  document.body.append(box);
  return { box, frame, body };
}

describe("the font size's sample", () => {
  test("a labelled decoration: heading, paragraph with accents, a list item", () => {
    const { box, frame, body } = mount(600, 500);
    assert.equal(box.querySelector(".font-sample-label").textContent, fontSampleWords.label);
    assert.equal(frame.getAttribute("aria-hidden"), "true");
    assert.ok(body.classList.contains("preview"), "it takes the note's text styles, so --note-scale");
    assert.ok(body.querySelector("h2") && body.querySelector("p") && body.querySelector("ul li"));
    assert.match(body.textContent, /dragão|dragon/);
  });
  test("it fits what the root says, live: a wider text is scaled down, a narrower one is true size", async () => {
    const { frame, body } = mount(400, 600);
    await frames();
    assert.equal(frame.dataset.scale, "0.67", "scaled as a whole to fit");
    assert.match(body.style.transform, /scale\(0\.6/);
    assert.equal(frame.style.height, "67px");
    Object.defineProperty(body, "offsetWidth", { get: () => 300, configurable: true });
    document.documentElement.setAttribute("data-measure", "narrow");
    await frames();
    assert.equal(frame.dataset.scale, "1");
    assert.equal(body.style.transform, "");
    document.documentElement.removeAttribute("data-measure");
  });
  test("too small to read: it wraps at the dialog's width and keeps the true size", async () => {
    const { frame, body } = mount(300, 1200);
    await frames();
    assert.equal(frame.dataset.scale, "1");
    assert.equal(body.style.width, "300px");
  });
  test("the stylesheet gives it the note's width and scale rules", () => {
    assert.match(css("reading.css"), /\.preview \{[^}]*--note-scale/);
    assert.match(css("panels.css"), /\.font-sample-frame/);
  });
});
