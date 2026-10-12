// A click on the folder button before the window's script wires it is kept
// and made once the action is there — never lost, never made twice.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/earlyClicks.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/earlyClicks.test-bundle.mjs",
  logLevel: "error",
});
const { holdClicks, ready } = await import("./.bundles/earlyClicks.test-bundle.mjs");

/** A button as the page has it: busy until wired, its listeners called on
 *  a click. */
function button() {
  const listeners = new Set();
  const attrs = new Map([["aria-busy", "true"]]);
  return {
    actions: 0,
    addEventListener: (_t, f) => listeners.add(f),
    removeEventListener: (_t, f) => listeners.delete(f),
    getAttribute: (n) => attrs.get(n) ?? null,
    removeAttribute: (n) => attrs.delete(n),
    click() {
      for (const f of [...listeners]) f();
    },
  };
}

describe("A click before the control is wired", () => {
  test("is kept and made once the action is there", () => {
    const b = button();
    const release = holdClicks(b);
    b.click();
    b.click();
    assert.equal(b.actions, 0);
    // The window's script wires it.
    b.addEventListener("click", () => b.actions++);
    ready(b);
    release();
    assert.equal(b.actions, 1, "once, however many came");
    b.click();
    assert.equal(b.actions, 2, "a later click is the control's own");
  });
  test("none made when none came, nor one made after wiring", () => {
    const b = button();
    const release = holdClicks(b);
    b.addEventListener("click", () => b.actions++);
    ready(b);
    b.click();
    release();
    assert.equal(b.actions, 1);
  });
  test("a page without the control", () => {
    assert.doesNotThrow(() => holdClicks(null)());
  });
});
