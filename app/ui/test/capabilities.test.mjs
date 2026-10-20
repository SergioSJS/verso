// Feature presets and capability flags (ADR 0103)
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "location", "localStorage", "addEventListener", "dispatchEvent", "CustomEvent", "Event"]) {
  globalThis[name] = name === "window" ? win : win[name];
}

win.__TAURI_INTERNALS__ = {
  invoke: async () => null,
  transformCallback: () => 0,
  metadata: {
    currentWindow: { label: "main" },
  },
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;

for (const id of [
  "open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear",
  "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces",
  "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label"
]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

const stub = {
  name: "stub",
  setup(build) {
    build.onResolve({ filter: /^\.\/main$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export const updateLeavesLineNumbers = () => {};",
      loader: "js",
    }));
  },
};

await esbuild.build({
  stdin: {
    contents: `export { PRESETS, currentPreset, hasCapability, setPreset } from "./src/capabilities";
export { settings, loadSettings, saveSettings } from "./src/settings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/capabilities.test-bundle.mjs",
  logLevel: "error",
  plugins: [stub],
  external: ["@tauri-apps/*", "yaml"],
});

const { PRESETS, currentPreset, hasCapability, setPreset, settings } = await import("./.bundles/capabilities.test-bundle.mjs");

describe("Feature Presets and Capability Flags (ADR 0103)", () => {
  beforeEach(() => {
    settings.preset = "rpg";
  });

  test("defines all three standard presets with accurate capabilities", () => {
    assert.ok(PRESETS.writing);
    assert.ok(PRESETS.worldbuilding);
    assert.ok(PRESETS.rpg);

    // Pure Writing: all gaming flags off
    assert.equal(PRESETS.writing.capabilities.diceRolling, false);
    assert.equal(PRESETS.writing.capabilities.randomTables, false);
    assert.equal(PRESETS.writing.capabilities.oracles, false);
    assert.equal(PRESETS.writing.capabilities.statblocks, false);
    assert.equal(PRESETS.writing.capabilities.campaignBundles, false);
    assert.equal(PRESETS.writing.capabilities.threeDice, false);

    // Worldbuilding: dice, random tables, oracles, bundles on; statblocks and 3d dice off
    assert.equal(PRESETS.worldbuilding.capabilities.diceRolling, true);
    assert.equal(PRESETS.worldbuilding.capabilities.randomTables, true);
    assert.equal(PRESETS.worldbuilding.capabilities.oracles, true);
    assert.equal(PRESETS.worldbuilding.capabilities.statblocks, false);
    assert.equal(PRESETS.worldbuilding.capabilities.campaignBundles, true);
    assert.equal(PRESETS.worldbuilding.capabilities.threeDice, false);

    // Tabletop RPG: all features enabled
    assert.equal(PRESETS.rpg.capabilities.diceRolling, true);
    assert.equal(PRESETS.rpg.capabilities.randomTables, true);
    assert.equal(PRESETS.rpg.capabilities.oracles, true);
    assert.equal(PRESETS.rpg.capabilities.statblocks, true);
    assert.equal(PRESETS.rpg.capabilities.campaignBundles, true);
    assert.equal(PRESETS.rpg.capabilities.threeDice, true);
  });

  test("currentPreset returns active preset with safe fallback", () => {
    settings.preset = "writing";
    assert.equal(currentPreset(), "writing");

    settings.preset = "worldbuilding";
    assert.equal(currentPreset(), "worldbuilding");

    settings.preset = "rpg";
    assert.equal(currentPreset(), "rpg");

    // Invalid / unrecognized values fall back to rpg
    settings.preset = "invalid-preset";
    assert.equal(currentPreset(), "rpg");
  });

  test("hasCapability evaluates flags according to active preset", () => {
    settings.preset = "writing";
    assert.equal(hasCapability("diceRolling"), false);
    assert.equal(hasCapability("oracles"), false);
    assert.equal(hasCapability("statblocks"), false);
    assert.equal(hasCapability("campaignBundles"), false);

    settings.preset = "worldbuilding";
    assert.equal(hasCapability("diceRolling"), true);
    assert.equal(hasCapability("oracles"), true);
    assert.equal(hasCapability("statblocks"), false);
    assert.equal(hasCapability("campaignBundles"), true);

    settings.preset = "rpg";
    assert.equal(hasCapability("diceRolling"), true);
    assert.equal(hasCapability("oracles"), true);
    assert.equal(hasCapability("statblocks"), true);
    assert.equal(hasCapability("threeDice"), true);
  });

  test("setPreset updates settings, dispatches event, and announces to aria-live", () => {
    let eventReceived = null;
    const listener = (e) => {
      eventReceived = e.detail;
    };
    window.addEventListener("verso:preset-changed", listener);

    setPreset("writing");
    assert.equal(settings.preset, "writing");
    assert.ok(eventReceived);
    assert.equal(eventReceived.preset, "writing");

    // Live region status announcement
    // (the window's own status line, the live region every action uses)
    const statusEl = document.getElementById("status");
    assert.ok(statusEl);
    assert.ok(statusEl.textContent.includes(PRESETS.writing.name));

    window.removeEventListener("verso:preset-changed", listener);
  });
});
