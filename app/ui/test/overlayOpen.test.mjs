// A web page's native view hides while anything floats over the panes
// (ADR 0056). 2026-11-12: the folder switcher, a modal dialog made by
// `asDialog`, opened behind an open web page; any modal dialog on screen
// now counts as an overlay.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window();
globalThis.document = win.document;

await esbuild.build({
  entryPoints: ["src/layout/overlay.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/overlayOpen.test-bundle.mjs",
  logLevel: "error",
});
const { overlayOpen } = await import("./.bundles/overlayOpen.test-bundle.mjs");

/** A modal dialog as `asDialog` marks it, laid out (one box) or not. */
function dialog(laidOut) {
  const d = document.createElement("div");
  d.className = "folder-switcher";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.getClientRects = () => (laidOut ? [{ width: 300, height: 200 }] : []);
  document.body.append(d);
  return d;
}

describe("what hides a web page", () => {
  beforeEach(() => document.body.replaceChildren());

  test("nothing open: the page shows", () => {
    assert.equal(overlayOpen(), false);
  });

  test("the folder switcher open: the page hides", () => {
    dialog(true);
    assert.equal(overlayOpen(), true);
  });

  test("a modal dialog hidden or not laid out does not count", () => {
    const d = dialog(true);
    d.hidden = true;
    assert.equal(overlayOpen(), false);
    d.remove();
    dialog(false);
    assert.equal(overlayOpen(), false);
  });

  test("a menu and a confirmation still count", () => {
    const m = document.createElement("div");
    m.className = "menu";
    document.body.append(m);
    assert.equal(overlayOpen(), true);
    m.hidden = true;
    assert.equal(overlayOpen(), false);
    const c = document.createElement("div");
    c.className = "confirm";
    document.body.append(c);
    assert.equal(overlayOpen(), true);
  });
});
