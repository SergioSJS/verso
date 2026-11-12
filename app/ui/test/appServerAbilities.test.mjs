// The app server's three abilities (ADR 0119 A13, decided 2026-11-12):
// `link`, `discover` and `serve_away` cross as capabilities. The desktop
// and Android list them; the iOS app does not, and its window hides the
// internet link's box and says the server runs only while Verso is open.
// The side's answer is stubbed here (`can.ts`), the window's parts real.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "location", "localStorage", "navigator", "addEventListener", "dispatchEvent", "CustomEvent", "Event", "HTMLElement", "KeyboardEvent"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true, writable: true });
}
win.__TAURI_INTERNALS__ = { invoke: async () => null, transformCallback: () => 0, metadata: { currentWindow: { label: "main" } } };
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;

// The window's fixed parts the shared modules look up at load (dom.ts `ui`).
for (const id of [
  "open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear",
  "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces",
  "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label",
]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

/** The side's answer, as the test sets it. */
globalThis.__side = { host: "desktop", off: [] };

const stubCan = {
  name: "stub-can",
  setup(build) {
    build.onResolve({ filter: /^(\.\.?\/)+can$/ }, () => ({ path: "can", namespace: "stub-can" }));
    build.onResolve({ filter: /^\.\/main$/ }, () => ({ path: "main", namespace: "stub-main" }));
    build.onLoad({ filter: /.*/, namespace: "stub-main" }, () => ({ contents: "export const updateLeavesLineNumbers = () => {};", loader: "js" }));
    build.onLoad({ filter: /.*/, namespace: "stub-can" }, () => ({
      contents: `
        export const can = (what) => !globalThis.__side.off.includes(what);
        export const host = () => globalThis.__side.host;
        export const canWrite = () => can("write");
        export const onCan = () => {};
        export const refreshCan = () => {};
        export const loadCan = async () => ({ host: host(), can: [], latency_ms: null });
        export const folderAccessNow = () => null;
        export const trashCapNow = () => null;
        export const noteAddress = (p) => p;
        export const serverLink = async (l) => l;
        export const FOLDER_CAN = [];
      `,
      loader: "js",
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `export { linkBoxes } from "./src/dialogs/localServerLink";
export { localStrings } from "./src/dialogs/localServerStrings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/appServerAbilities.test-bundle.mjs",
  logLevel: "error",
  plugins: [stubCan],
});
const { linkBoxes, localStrings } = await import("./.bundles/appServerAbilities.test-bundle.mjs");

const IOS_OFF = ["link", "discover", "serve_away", "updates", "audio_share"];

/** A status of a server that is off, with no link. */
const off = {
  serving: false,
  network: true,
  link: { state: "off", own: false, url: null, qr: "", until: null, ended: null, protocol: null, download: null },
};

beforeEach(() => {
  document.documentElement.lang = "en";
  globalThis.__side = { host: "desktop", off: [] };
});

test("the desktop shows the internet link's box beside the network's", () => {
  const boxes = linkBoxes({ say: () => {}, redraw: () => {} });
  const link = boxes.el.querySelector("#ls-link");
  assert.ok(link, "the link's box is drawn");
  assert.equal(link.closest("label").hidden, false);
  assert.equal(boxes.el.querySelector("#ls-network").closest("label").hidden, false);
});

test("an app without the link shows the network's box alone, before and after a status", () => {
  globalThis.__side = { host: "mobile", off: IOS_OFF };
  const boxes = linkBoxes({ say: () => {}, redraw: () => {} });
  assert.equal(boxes.el.querySelector("#ls-link").closest("label").hidden, true);
  assert.equal(boxes.el.querySelector("#ls-link-help").hidden, true);
  assert.equal(boxes.el.querySelector("#ls-network").closest("label").hidden, false);
  boxes.draw(off);
  assert.equal(boxes.el.querySelector("#ls-link").closest("label").hidden, true);
  assert.equal(boxes.el.querySelector(".ls-link").hidden, true, "the link's panel stays hidden");
});

test("a phone that serves off the screen keeps its words; one that does not says it serves only while open", () => {
  for (const lang of ["en", "pt-BR"]) {
    document.documentElement.lang = lang;
    globalThis.__side = { host: "desktop", off: [] };
    const desk = localStrings();
    assert.notEqual(desk.lead, desk.leadPhone);

    globalThis.__side = { host: "mobile", off: [] };
    const android = localStrings();
    assert.equal(android.lead, android.leadPhone);
    assert.deepEqual(android.firstBody, android.firstBodyPhone);

    globalThis.__side = { host: "mobile", off: IOS_OFF };
    const ios = localStrings();
    assert.equal(ios.lead, ios.leadOnScreen);
    assert.deepEqual(ios.firstBody, ios.firstBodyOnScreen);
    // Nothing of Android's foreground service, nor of a link it has not.
    assert.doesNotMatch(ios.firstBody.join(" "), /notifica|link/i);
    assert.match(ios.lead, lang === "en" ? /only while Verso is open/ : /só enquanto o Verso estiver aberto/);
  }
});
