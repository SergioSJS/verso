// The server's own pages (`src/web/pages.ts`), driven in node over
// happy-dom with the API answered by the test: what a page shows, and
// what it sends, for the cases a browser run would take minutes to reach.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({
  url: "https://verso.test/",
  settings: { navigation: { disableMainFrameNavigation: true } },
});
for (const name of ["window", "document", "location", "HTMLElement", "Node", "Element", "localStorage", "addEventListener", "dispatchEvent", "CustomEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

/** What the API answers, by "METHOD path"; what was sent, in order. */
let answers = {};
let sent = [];
globalThis.fetch = async (path, init = {}) => {
  const key = `${init.method ?? "GET"} ${path}`;
  sent.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
  const queue = answers[key];
  const a = Array.isArray(queue) ? (queue.length > 1 ? queue.shift() : queue[0]) : queue;
  if (!a) return new Response(JSON.stringify({ error: "not_found", message: key }), { status: 404 });
  return new Response(JSON.stringify(a.body ?? null), { status: a.status ?? 200 });
};

await esbuild.build({
  entryPoints: ["src/web/pages.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/webPages.test-bundle.mjs",
  logLevel: "error",
});
const pages = await import("./.bundles/webPages.test-bundle.mjs");

const account = { id: "a1", email: "bia@casa.example", name: "Bia", lang: "pt", admin: false, mayCreate: false };

/** Let the page's promises and timers run. */
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Wait until `check` holds, or fail saying `what`. */
async function until(check, what, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) assert.fail(`${what}: ${document.body.textContent}`);
    await settle(5);
  }
}

beforeEach(() => {
  answers = {};
  sent = [];
  document.body.innerHTML = "";
});

describe("The device page", () => {
  // A name in a right-to-left script, inside a left-to-right sentence:
  // unisolated, its direction would carry into the words around it.
  const name = "Verso · מחשב 2";
  const asked = { code: "BCDF-GHJK", device: name, address: "203.0.113.5", asked: "2026-10-13T12:00:00Z" };

  test("puts the device's name, wherever it says it, in a <bdi> of its own", async () => {
    win.happyDOM.setURL("https://verso.test/device?code=BCDF-GHJK");
    answers["POST /api/device/describe"] = { body: asked };
    await pages.devicePage(account);
    await until(() => document.querySelector("form"), "the question is shown");
    const main = document.querySelector("main");
    const isolated = [...main.querySelectorAll("bdi")].filter((b) => b.textContent === name);
    // The lead, the facts, the approve button.
    assert.equal(isolated.length, 3, main.innerHTML);
    const outside = main.cloneNode(true);
    for (const b of outside.querySelectorAll("bdi")) b.remove();
    assert.ok(!outside.textContent.includes("מחשב"), `the name outside a <bdi>: ${outside.innerHTML}`);
    const approve = [...main.querySelectorAll("button")].find((b) => b.type === "submit");
    assert.equal(approve.textContent, `Aprovar este aparelho: ${name}`);
  });
});
