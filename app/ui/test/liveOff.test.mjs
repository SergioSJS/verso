// The notice of a synced folder whose live editing is off: shown only for
// synced + off, follows the sync-state event, its control opens the setting.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import * as esbuild from "esbuild";

const win = new Window();
for (const k of ["document", "addEventListener", "removeEventListener", "dispatchEvent", "CustomEvent", "Event"]) {
  Object.defineProperty(globalThis, k, { value: win[k].bind ? win[k].bind(win) : win[k], configurable: true, writable: true });
}
await esbuild.build({
  entryPoints: ["src/liveOff.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/liveOff.test-bundle.mjs",
  logLevel: "error",
});
const { liveOffNotice, liveOffShown } = await import("./.bundles/liveOff.test-bundle.mjs");

const tell = (detail) => dispatchEvent(new CustomEvent("verso:sync-state", { detail }));

describe("live editing off, said in the tab", () => {
  test("shown only for a synced folder with the setting off", () => {
    assert.equal(liveOffShown({ on: true, live: false }), true);
    assert.equal(liveOffShown({ on: true, live: true }), false);
    assert.equal(liveOffShown({ on: false, live: false }), false);
    assert.equal(liveOffShown(null), false);
  });

  test("follows the sync state: hidden, shown, hidden again", () => {
    document.documentElement.lang = "en";
    let opened = 0;
    const el = liveOffNotice(() => opened++);
    document.body.append(el);
    assert.equal(el.hidden, true);
    tell({ on: true, state: "connected", role: "writer", live: true });
    assert.equal(el.hidden, true);
    tell({ on: true, state: "connected", role: "writer", live: false });
    assert.equal(el.hidden, false);
    tell({ on: false, state: "off", role: "", live: false });
    assert.equal(el.hidden, true);
    tell({ on: true, state: "connected", role: "writer", live: false });
    assert.equal(el.hidden, false);
    tell({ on: true, state: "connected", role: "writer", live: true });
    assert.equal(el.hidden, true);
  });

  test("a notice made while the setting is off starts shown; words in both languages", () => {
    tell({ on: true, state: "connected", role: "writer", live: false });
    document.documentElement.lang = "en";
    const en = liveOffNotice(() => {});
    assert.equal(en.hidden, false);
    assert.equal(en.textContent, "Live editing is off for this folder");
    document.documentElement.lang = "pt-BR";
    const pt = liveOffNotice(() => {});
    assert.equal(pt.textContent, "Edição ao vivo desligada nesta pasta");
  });

  test("the control is a labelled button that opens the setting", () => {
    document.documentElement.lang = "en";
    let opened = 0;
    const el = liveOffNotice(() => opened++);
    assert.equal(el.tagName, "BUTTON");
    assert.equal(el.type, "button");
    assert.match(el.getAttribute("aria-label"), /Live editing is off for this folder\. Open the setting/);
    el.click();
    assert.equal(opened, 1);
  });
});
