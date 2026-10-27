// Settings › Sincronizar, "Esperando por você":
// a file with an invalid name (e.g. `:`) has a Renomear button beside it.

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

let renamed = [];
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === "rename_entry") {
      renamed.push(args);
      return { path: args.to, also: [], rewrites: [], skipped: [], warnings: [] };
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
  entryPoints: ["src/dialogs/syncView.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  plugins: [stubMain],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  outfile: "test/.bundles/syncRename.test-bundle.mjs",
  logLevel: "error",
});
const { drawSyncOn } = await import("./.bundles/syncRename.test-bundle.mjs");

describe("SyncView invalid file names", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    renamed = [];
  });

  test("adds a Rename button beside files with invalid names", async () => {
    const box = document.createElement("div");
    const st = {
      state: "synced",
      folder: "test",
      server: "https://example.com",
      last: null,
      problem: null,
      deletions: 0,
      conflicts: [],
      refused: [{ path: "sub/bad:name.md", reason: "name_invalid", message: null }],
      cloud_only: [],
      log: [],
    };
    drawSyncOn(box, st, async () => {}, () => null, () => {});
    const btn = box.querySelector(".sync-file-row button");
    assert.ok(btn, "rename button is rendered beside invalid file");
    assert.equal(btn.textContent, "Rename");
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    const promptBox = document.querySelector(".prompt-box");
    assert.ok(promptBox, "rename prompt opened");
    const input = promptBox.querySelector("input.prompt-field");
    assert.equal(input.value, "bad:name.md");
    input.value = "good-name.md";
    promptBox.querySelector("button.save").click();

    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(renamed, [{ from: "sub/bad:name.md", to: "sub/good-name.md" }]);
  });
});
