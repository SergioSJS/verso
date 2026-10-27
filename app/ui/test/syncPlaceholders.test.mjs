// Settings › Sincronizar, o cartão dos arquivos que só estão na nuvem
// (ADR 0043, decidido em 2026-10-27): o botão que baixa, o tamanho, a
// recusa por falta de espaço, o progresso, o Parar, o que falhou, e a linha
// quieta dos arquivos que o servidor já tem.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:7340/", settings: { navigation: { disableMainFrameNavigation: true } } });
for (const name of ["window", "document", "HTMLElement", "Node", "Element", "HTMLInputElement", "HTMLTextAreaElement", "localStorage", "addEventListener", "getComputedStyle"]) {
  globalThis[name] = name === "window" ? win : typeof win[name] === "function" ? win[name].bind(win) : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
class MockIntersectionObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver = MockIntersectionObserver;
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = MockResizeObserver;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&"), highlights: new Map() };

let calls = [];
let plan = { count: 3, bytes: 1572864, free: 100 * 1024 * 1024 * 1024 };
let planError = null;
let nothing = new Set();
let gate = null; // when set, fetch_file waits for it
let failing = new Map();
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === "placeholder_plan") {
      if (planError) throw planError;
      return plan;
    }
    if (cmd === "fetch_file") {
      if (gate) await gate();
      if (failing.has(args.path)) throw failing.get(args.path);
      return !nothing.has(args.path);
    }
    return null;
  },
  transformCallback: () => 0,
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;
win.localStorage.setItem("verso.settings", "{}");

for (const id of ["open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear", "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces", "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label", "toggle-side", "toggle-right", "right-divider", "side-divider", "keys-commands", "right", "right-tabs", "right-body"]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

const stubMain = {
  name: "stub-main",
  setup(build) {
    build.onResolve({ filter: /(^|\/)main$/ }, () => ({ path: "main", namespace: "stub-main" }));
    build.onLoad({ filter: /.*/, namespace: "stub-main" }, () => ({
      contents: [
        "export const noLayout = () => {};",
        "export const updateLeavesLineNumbers = () => {};",
        "export const panel = null;",
        "export const ribbon = null;",
        "export const plan = null;",
        "export const updateController = null;",
        "export const settingsDialog = null;",
        "export const paletteDialog = null;",
        "export const replaceDialog = null;",
        "export const quick = null;",
        "export const bugDialog = null;",
        "export const armDrag = () => {};",
        "export const landIn = () => {};",
        "export const persistSoon = () => {};",
        "export const orderToggle = () => {};",
        "export const closeWhereNoTab = () => {};",
        "export const focusSwitcher = () => {};",
        "export const openConsole = () => {};",
        "export const notesHeadingReset = () => {};",
        "export const notesHeadingText = () => {};"
      ].join("\n"),
      loader: "js",
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: 'export * from "./src/dialogs/syncView"; export * from "./src/dialogs/syncPlaceholders";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [stubMain],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  outfile: "test/.bundles/syncPlaceholders.test-bundle.mjs",
  logLevel: "error",
});
const { drawSyncOn, marginFor, holds, isOldForm } = await import("./.bundles/syncPlaceholders.test-bundle.mjs");

const GiB = 1 << 30;
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

function status(extra = {}) {
  return {
    key: "k1",
    state: "synced",
    folder: "test",
    server: "https://example.com",
    last: null,
    problem: null,
    deletions: 0,
    conflicts: [],
    refused: [
      { path: "Mapas/a.png", reason: "placeholder", message: "" },
      { path: "Mapas/b.png", reason: "placeholder", message: "" },
      { path: "c.md", reason: "placeholder", message: "" },
    ],
    cloud_only: [],
    log: [],
    ...extra,
  };
}

function draw(st) {
  const box = document.createElement("div");
  document.body.append(box);
  drawSyncOn(box, st, async () => {}, () => null, () => {});
  return box;
}

const fetched = () => calls.filter(([c]) => c === "fetch_file").map(([, a]) => a.path);
const label = (box) => box.querySelector(".sync-download .btn.primary")?.textContent;

describe("the card of files only in the cloud", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.documentElement.lang = "en";
    calls = [];
    plan = { count: 3, bytes: 1572864, free: 100 * 1024 * 1024 * 1024 };
    planError = null;
    nothing = new Set();
    gate = null;
    failing = new Map();
  });

  test("the margin is a gibibyte, or a tenth of the files when that is more", () => {
    assert.equal(marginFor(100), GiB);
    assert.equal(marginFor(50 * GiB), 5 * GiB);
    assert.equal(holds(null, 5 * GiB), false, "room nobody could tell is not known to hold them");
    assert.equal(holds(2 * GiB + 50, 1 * GiB), true);
    assert.equal(holds(2 * GiB - 1, 1 * GiB), false);
    assert.equal(isOldForm("Pasta/.Mapa.png.icloud"), true);
    assert.equal(isOldForm("Pasta/Mapa.png"), false);
  });

  test("the button says how many files and how big, in both languages", async () => {
    let box = draw(status());
    await wait();
    assert.equal(label(box), "Download 3 files (1.5 MB)");
    document.documentElement.lang = "pt-BR";
    box = draw(status({ key: "k2", refused: [{ path: "um.md", reason: "placeholder", message: "" }] }));
    plan = { count: 1, bytes: 2048, free: 100 * GiB };
    await wait();
    assert.match(label(box), /^Baixar 1 arquivo/);
  });

  test("it downloads one file at a time, then asks for a pass", async () => {
    const box = draw(status({ key: "k3" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    assert.deepEqual(fetched(), ["Mapas/a.png", "Mapas/b.png", "c.md"]);
    assert.equal(calls.filter(([c]) => c === "folder_sync_now").length, 1);
    const ran = calls.findIndex(([c]) => c === "folder_sync_now");
    assert.ok(calls.findLastIndex(([c]) => c === "fetch_file") < ran, "the pass is asked after the last file");
  });

  test("with the disk too full it says so and downloads nothing", async () => {
    plan = { count: 3, bytes: 1572864, free: GiB };
    const box = draw(status({ key: "k4" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait();
    assert.deepEqual(fetched(), []);
    const said = box.querySelector(".sync-download .sync-live");
    assert.ok(said, "the refusal is announced");
    assert.match(said.textContent, /Not enough room on the disk/);
    assert.ok(label(box), "the button stays, for another try");
  });

  test("progress is announced, Stop ends the run after the file in hand", async () => {
    let release;
    gate = () => new Promise((r) => (release = r));
    const box = draw(status({ key: "k5" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait();
    const live = box.querySelector(".sync-download [aria-live=polite]");
    assert.ok(live, "progress sits in a live region");
    assert.equal(live.textContent, "Downloading 0 of 3…");
    assert.ok(box.querySelector(".sync-download progress"));
    const stop = [...box.querySelectorAll(".sync-download button")].find((b) => b.textContent === "Stop");
    assert.ok(stop, "a Stop button");
    stop.click();
    release();
    await wait(40);
    assert.deepEqual(fetched(), ["Mapas/a.png"]);
    assert.ok(calls.some(([c]) => c === "folder_sync_now"), "what came down is picked up");
    assert.match(box.querySelector(".sync-download .sync-live").textContent, /Stopped: 1 of 3 downloaded/);
  });

  test("a file that cannot come down stays listed with its reason", async () => {
    failing.set("c.md", { kind: "unavailable", message: "cloud" });
    const box = draw(status({ key: "k6" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    assert.match(box.querySelector(".sync-download .sync-live").textContent, /2 files downloaded; 1 could not be/);
    // The next draw (a status arrived) still lists why.
    const again = draw(status({ key: "k6" }));
    const row = [...again.querySelectorAll(".sync-file-row")].find((r) => r.textContent.includes("c.md"));
    assert.match(row.textContent, /did not give the content/);
  });

  test("the older iCloud form is listed with its reason and never fetched", async () => {
    const box = draw(status({ key: "k7", refused: [{ path: ".Velho.md.icloud", reason: "placeholder", message: "" }, { path: "novo.md", reason: "placeholder", message: "" }] }));
    plan = { count: 1, bytes: 10, free: 100 * GiB };
    await wait();
    assert.match(box.querySelector(".sync-file-row").textContent, /older form/);
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    assert.deepEqual(fetched(), ["novo.md"]);
    const only = draw(status({ key: "k8", refused: [{ path: ".Velho.md.icloud", reason: "placeholder", message: "" }] }));
    assert.equal(only.querySelector(".sync-download .btn"), null, "nothing to offer for the old form alone");
  });

  test("files only in the cloud that the server has are a quiet line, not a task", () => {
    let box = draw(status({ key: "k9", refused: [], cloud_only: ["a.md", "b.md"] }));
    const quiet = box.querySelector(".sync-quiet");
    assert.equal(quiet.textContent, "2 files are only in the cloud; the server has them.");
    assert.ok(box.querySelector(".sync-calm"), "nothing waits for the person");
    assert.equal(box.querySelector(".sync-item"), null);
    assert.equal(box.querySelector(".sync-download"), null);
    box = draw(status({ key: "k9", refused: [], cloud_only: ["a.md"] }));
    assert.equal(box.querySelector(".sync-quiet").textContent, "1 file is only in the cloud; the server has it.");
    document.documentElement.lang = "pt-BR";
    box = draw(status({ key: "k9", refused: [], cloud_only: ["a.md", "b.md"] }));
    assert.equal(box.querySelector(".sync-quiet").textContent, "2 arquivos estão só na nuvem; o servidor tem a cópia.");
    box = draw(status({ key: "k9", refused: [], cloud_only: ["a.md"] }));
    assert.equal(box.querySelector(".sync-quiet").textContent, "1 arquivo está só na nuvem; o servidor tem a cópia.");
  });

  test("a double click starts one run, not two", async () => {
    let release;
    gate = () => new Promise((r) => (release = r));
    const box = draw(status({ key: "k10" }));
    await wait();
    const go = box.querySelector(".sync-download .btn.primary");
    go.click();
    go.click();
    await wait();
    release();
    await wait(10);
    release();
    await wait(10);
    release();
    await wait(40);
    assert.equal(calls.filter(([c]) => c === "placeholder_plan").length, 2, "one for the label, one for the run");
    assert.deepEqual(fetched(), ["Mapas/a.png", "Mapas/b.png", "c.md"], "each file once");
  });

  test("a disk whose room cannot be told is a refusal, said", async () => {
    plan = { count: 3, bytes: 1572864, free: null };
    const box = draw(status({ key: "k11" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait();
    assert.deepEqual(fetched(), []);
    assert.equal(box.querySelector(".sync-download .sync-live").textContent, "Could not tell how much space the disk has free; nothing was downloaded.");
  });

  test("a plan that fails is one message, not a failure per file", async () => {
    const box = draw(status({ key: "k12" }));
    await wait();
    planError = { kind: "failed", message: "boom" };
    box.querySelector(".sync-download .btn.primary").click();
    await wait();
    assert.deepEqual(fetched(), []);
    assert.match(box.querySelector(".sync-download .sync-live").textContent, /boom/);
    const again = draw(status({ key: "k12" }));
    assert.equal(again.querySelectorAll(".sync-file-why").length, 0, "no reason under any file");
  });

  test("a file with nothing to fetch is not counted as downloaded and stays in the card", async () => {
    nothing.add("c.md");
    const box = draw(status({ key: "k13" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    assert.match(box.querySelector(".sync-download .sync-live").textContent, /2 files downloaded; 1 could not be/);
    const again = draw(status({ key: "k13" }));
    const row = [...again.querySelectorAll(".sync-file-row")].find((r) => r.textContent.includes("c.md"));
    assert.match(row.textContent, /nothing to download/);
  });

  test("the live region is one element across redraws, and takes the keyboard when a run ends", async () => {
    const box = draw(status({ key: "k14" }));
    await wait();
    const live = box.querySelector(".sync-live");
    assert.equal(live.getAttribute("aria-live"), "polite");
    assert.equal(live.tabIndex, -1);
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    assert.ok(box.querySelector(".sync-live") === live, "updated in place, not recreated");
    assert.ok(document.activeElement === live, "the keyboard is on the outcome line");
    const again = draw(status({ key: "k14" }));
    assert.ok(again.querySelector(".sync-live") === live, "the same element in the next draw");
  });

  test("when every file came down the outcome is still said, in the section", async () => {
    const box = draw(status({ key: "k15" }));
    await wait();
    box.querySelector(".sync-download .btn.primary").click();
    await wait(40);
    const after = draw(status({ key: "k15", refused: [] }));
    assert.match(after.querySelector(".sync-live").textContent, /3 files downloaded/);
  });
});
