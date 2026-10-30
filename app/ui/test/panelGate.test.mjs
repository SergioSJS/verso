// A panel that is not on screen draws nothing and draws once, from the
// current state, when it is shown; on screen, a burst is one drawing per
// frame; the live-who marks are not rebuilt for the same people (night
// 2026-10-30: the hidden Mesa list was rebuilt 594 times in 186 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
let frames = [];
let nextId = 1;
globalThis.requestAnimationFrame = (fn) => {
  const id = nextId++;
  frames.push([id, fn]);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  frames = frames.filter(([i]) => i !== id);
};
const tick = () => {
  const run = frames;
  frames = [];
  for (const [, fn] of run) fn();
};
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, addEventListener: () => {}, localStorage: win.localStorage, matchMedia: () => ({ matches: false, addEventListener() {} }) });

await esbuild.build({ entryPoints: ["src/panel/gate.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/panelGate.test-bundle.mjs", logLevel: "error" });
const { gate } = await import("./.bundles/panelGate.test-bundle.mjs");

// A stand-in for a panel list: its state changes, its DOM work is counted.
function panel() {
  const state = { on: false, members: ["Ana"] };
  const ul = document.createElement("ul");
  let builds = 0;
  const g = gate(
    () => state.on,
    () => {
      builds++;
      ul.replaceChildren(...state.members.map((m) => Object.assign(document.createElement("li"), { textContent: m })));
    },
  );
  return { state, ul, g, builds: () => builds };
}

test("hidden: N events do no DOM work; shown: one drawing, with the current state", () => {
  const p = panel();
  for (let i = 0; i < 594; i++) {
    p.state.members = ["Ana", `Bruno${i}`];
    p.g.poke();
  }
  tick();
  assert.equal(p.builds(), 0, "before: 594 drawings; after: none while hidden");
  assert.equal(p.ul.childElementCount, 0);
  assert.equal(p.g.stale, true);
  p.state.on = true;
  p.g.reveal();
  assert.equal(p.builds(), 1);
  assert.deepEqual([...p.ul.children].map((li) => li.textContent), ["Ana", "Bruno593"]);
  p.g.reveal();
  tick();
  assert.equal(p.builds(), 1, "nothing owed after: revealing again does nothing");
});

test("shown: a burst of events is one drawing in the next frame", () => {
  const p = panel();
  p.state.on = true;
  for (let i = 0; i < 50; i++) p.g.poke();
  assert.equal(p.builds(), 0);
  tick();
  assert.equal(p.builds(), 1);
  tick();
  assert.equal(p.builds(), 1);
});

test("hidden before the frame: the pending drawing is dropped and owed", () => {
  const p = panel();
  p.state.on = true;
  p.g.poke();
  p.state.on = false;
  p.g.poke();
  tick();
  assert.equal(p.builds(), 0);
  p.state.on = true;
  p.g.reveal();
  assert.equal(p.builds(), 1);
});

test("draw() is at once when shown, owed when hidden; the late flag says events were missed", () => {
  const seen = [];
  let on = false;
  const g = gate(() => on, (late) => seen.push(late));
  g.draw();
  assert.deepEqual(seen, []);
  on = true;
  g.reveal();
  assert.deepEqual(seen, [true], "caught up on what came while hidden (so its news is not announced again)");
  g.draw();
  g.poke();
  tick();
  assert.deepEqual(seen, [true, false, false]);
});

test("the live-who marks are not rebuilt for the same people, and still follow a change", async () => {
  // dom.ts looks its page elements up by id when it loads.
  for (const id of ["open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear", "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces", "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label"]) document.body.append(Object.assign(document.createElement("div"), { id }));
  await esbuild.build({ entryPoints: ["src/leaves/liveWho.ts"], bundle: true, format: "esm", platform: "node", outfile: "test/.bundles/liveWho.test-bundle.mjs", logLevel: "error" });
  const { paintWho } = await import("./.bundles/liveWho.test-bundle.mjs");
  const owner = {};
  const host = document.createElement("div");
  const mark = document.createElement("span");
  host.append(mark);
  paintWho(owner, mark, []);
  const row = host.querySelector(".live-who");
  assert.equal(row.hidden, true);
  let writes = 0;
  const real = row.replaceChildren.bind(row);
  row.replaceChildren = (...n) => (writes++, real(...n));
  for (let i = 0; i < 30; i++) paintWho(owner, mark, ["Ana", "Bruno"]);
  assert.equal(writes, 1, "30 presence events with the same people: one drawing");
  assert.equal(row.hidden, false);
  assert.equal(row.childElementCount, 2);
  paintWho(owner, mark, ["Ana"]);
  assert.equal(writes, 2);
  assert.equal(row.childElementCount, 1);
});
