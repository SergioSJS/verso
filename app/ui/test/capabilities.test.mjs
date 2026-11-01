// The features switches (ADR 0103, revised 2026-10-20)
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "location", "localStorage", "addEventListener", "dispatchEvent", "CustomEvent", "Event", "HTMLElement", "KeyboardEvent"]) {
  globalThis[name] = name === "window" ? win : win[name];
}

const invoked = [];
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd) => {
    invoked.push(cmd);
    return null;
  },
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
    contents: `export * from "./src/capabilities";
export * from "./src/featureList";
export { settings, loadSettings, saveSettings } from "./src/settings";
export { featureItems, offNotice } from "./src/dialogs/settings/featureItems";`,
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

const m = await import("./.bundles/capabilities.test-bundle.mjs");
const { hasCapability, setFeature, applyShortcut, currentShortcut, shortcutChanges, migratePreset, shortcutOf, allOn, allOff, readFeatures, loadSettings, featureItems, offNotice, FEATURE_IDS } = m;

/** The settings page's own item, as the dialog draws it. */
const ctx = {
  item(title, desc, control) {
    const row = document.createElement("div");
    row.className = "setting";
    const t = document.createElement("div");
    t.id = `t-${title}`;
    t.textContent = title;
    const d = document.createElement("div");
    d.id = `d-${title}`;
    d.textContent = desc;
    row.append(t, d);
    const field = control.matches("input") ? control : control.querySelector("input");
    if (field) {
      field.setAttribute("aria-labelledby", t.id);
      field.setAttribute("aria-describedby", d.id);
    }
    row.append(control);
    return row;
  },
  select: () => document.createElement("select"),
  toggle(value, onChange) {
    const l = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = value;
    box.addEventListener("change", () => onChange(box.checked));
    l.append(box);
    return l;
  },
  paint() {},
};

describe("Features switches (ADR 0103)", () => {
  beforeEach(() => {
    m.settings.features = allOn();
    invoked.length = 0;
  });

  test("by default every feature is on, but the 3D dice (ADR 0101 item 7)", () => {
    for (const id of FEATURE_IDS) assert.equal(hasCapability(id), id !== "dice3d", id);
    m.settings.features = undefined;
    for (const id of FEATURE_IDS) assert.equal(hasCapability(id), id !== "dice3d", `${id} with nothing stored`);
    assert.equal(hasCapability("not-a-feature"), true);
  });

  test("the 3D dice: only an explicit true turns them on; 'Everything' leaves them as they are", () => {
    // Stored odd values never turn it on.
    for (const odd of [undefined, null, 1, "true", {}]) assert.equal(readFeatures({ dice3d: odd }).dice3d, false, String(odd));
    assert.equal(readFeatures({ dice3d: true }).dice3d, true);
    // "Everything" is every other switch on, with 3D either way.
    assert.equal(shortcutOf({ ...allOn(), dice3d: true }), "everything");
    assert.equal(shortcutOf(allOn()), "everything");
    assert.equal(m.shortcutFeatures("everything").dice3d, false);
    assert.equal(m.shortcutFeatures("everything", { ...allOn(), dice3d: true }).dice3d, true);
    // From "Writing only", "Everything" says it does not turn 3D on, and does not.
    m.settings.features = allOff();
    assert.equal(m.shortcutKeepsOff("everything").length, 1);
    assert.match(m.shortcutKeepsOff("everything")[0], /3D/);
    assert.deepEqual(m.shortcutKeepsOff("writing"), []);
    assert.equal(shortcutChanges("everything").on.some((n) => /3D/.test(n)), false);
    applyShortcut("everything");
    assert.equal(hasCapability("dice3d"), false);
    assert.equal(hasCapability("diceRolling"), true);
    // Turned on by hand, it stays through "Everything", and "Writing only" turns it off.
    setFeature("dice3d", true);
    assert.equal(currentShortcut(), "everything");
    assert.deepEqual(m.shortcutKeepsOff("everything"), []);
    applyShortcut("writing");
    assert.equal(hasCapability("dice3d"), false);
    assert.deepEqual(m.settings.features, allOff());
  });

  test("hasCapability follows each switch alone", () => {
    m.settings.features = { ...allOn(), oracles: false };
    assert.equal(hasCapability("oracles"), false);
    assert.equal(hasCapability("diceRolling"), true);
    assert.equal(hasCapability("statblocks"), true);
  });

  test("the old preset migrates to switches", () => {
    assert.deepEqual(migratePreset("writing"), allOff());
    assert.deepEqual(migratePreset("worldbuilding"), { ...allOn(), statblocks: false });
    assert.deepEqual(migratePreset("rpg"), allOn());
    assert.deepEqual(migratePreset(undefined), allOn());
    assert.deepEqual(migratePreset("whatever"), allOn());
  });

  test("the suggestion's letters and capital switch: defaults, clamping", () => {
    localStorage.setItem("verso.settings", JSON.stringify({ theme: "dark" }));
    loadSettings();
    assert.equal(m.settings.suggestMinLetters, 3);
    assert.equal(m.settings.suggestCapitalOnly, true);
    for (const [stored, want] of [[0, 1], [-4, 1], [1, 1], [5, 5], [10, 10], [99, 10], [2.7, 2], ["4", 3], [null, 3]]) {
      localStorage.setItem("verso.settings", JSON.stringify({ suggestMinLetters: stored, suggestCapitalOnly: false }));
      loadSettings();
      assert.equal(m.settings.suggestMinLetters, want, String(stored));
      assert.equal(m.settings.suggestCapitalOnly, false);
    }
  });

  test("loading settings migrates the preset and deletes the old key", () => {
    localStorage.setItem("verso.settings", JSON.stringify({ theme: "dark", preset: "worldbuilding" }));
    loadSettings();
    assert.deepEqual(m.settings.features, { ...allOn(), statblocks: false });
    assert.equal("preset" in m.settings, false);
    localStorage.setItem("verso.settings", JSON.stringify({ preset: "writing" }));
    loadSettings();
    assert.deepEqual(m.settings.features, allOff());
    // Switches already stored win over a stale preset.
    localStorage.setItem("verso.settings", JSON.stringify({ preset: "writing", features: { ...allOn(), dice: 1, oracles: false } }));
    loadSettings();
    assert.equal(m.settings.features.oracles, false);
    assert.equal(m.settings.features.diceRolling, true);
    localStorage.setItem("verso.settings", JSON.stringify({ theme: "dark" }));
    loadSettings();
    assert.deepEqual(m.settings.features, allOn());
    localStorage.clear();
  });

  test("the switches match a shortcut, or are Custom", () => {
    assert.equal(shortcutOf(allOn()), "everything");
    assert.equal(shortcutOf(allOff()), "writing");
    assert.equal(shortcutOf({ ...allOn(), dice: false, oracles: false }), "custom");
    assert.equal(shortcutOf({ ...allOff(), statblocks: true }), "custom");
    m.settings.features = { ...allOn(), oracles: false };
    assert.equal(currentShortcut(), "custom");
    assert.deepEqual(readFeatures({ oracles: false }), { ...allOn(), oracles: false });
  });

  test("a shortcut says what it changes before it does", () => {
    m.settings.features = { ...allOn(), oracles: false };
    const toWriting = shortcutChanges("writing");
    assert.equal(toWriting.on.length, 0);
    assert.equal(toWriting.off.length, 8);
    const toAll = shortcutChanges("everything");
    assert.equal(toAll.on.length, 1);
    assert.equal(toAll.off.length, 0);
    // Asking changed nothing.
    assert.equal(hasCapability("oracles"), false);
    assert.equal(hasCapability("diceRolling"), true);
    applyShortcut("writing");
    assert.deepEqual(m.settings.features, allOff());
  });

  test("a switch applies at once, announces, and writes no file", () => {
    let got = null;
    const listener = (e) => (got = e.detail);
    window.addEventListener("verso:features-changed", listener);
    setFeature("statblocks", false);
    window.removeEventListener("verso:features-changed", listener);
    assert.equal(hasCapability("statblocks"), false);
    assert.equal(got.features.statblocks, false);
    assert.ok(document.getElementById("status").textContent.length > 0);
    // Only the person's settings were stored; the core was never called.
    assert.deepEqual(invoked, []);
    assert.equal(JSON.parse(localStorage.getItem("verso.settings")).features.statblocks, false);
    assert.equal("preset" in JSON.parse(localStorage.getItem("verso.settings")), false);
  });
});

describe("The Features settings page", () => {
  beforeEach(() => {
    m.settings.features = allOn();
  });

  test("shows every switch with its description, in a labelled group, split over two pages", () => {
    const [general, rpg] = featureItems(ctx);
    assert.equal(general.section, "features");
    assert.equal(rpg.section, "rpgfeatures");
    const nodes = [general.node(), rpg.node()];
    for (const n of nodes) document.body.append(n);
    let total = 0;
    for (const node of nodes) {
      assert.equal(node.tagName, "FIELDSET");
      assert.ok(node.querySelector("legend")?.textContent);
      const boxes = [...node.querySelectorAll("input[type=checkbox]")];
      total += boxes.length;
      for (const box of boxes) {
        // Every switch is on but the 3D dice, off by default.
        const label = document.getElementById(box.getAttribute("aria-labelledby"));
        const desc = document.getElementById(box.getAttribute("aria-describedby"));
        assert.equal(box.checked, !/Dados 3D|3D dice/.test(label.textContent), label.textContent);
        assert.ok(desc.textContent.length > 10, "each switch says what it adds");
      }
    }
    assert.equal(total, FEATURE_IDS.length);
    const shortcuts = [...nodes[0].querySelectorAll("button[aria-pressed]")];
    assert.equal(shortcuts.length, 2);
    assert.equal(shortcuts[0].getAttribute("aria-pressed"), "true");
    assert.equal(shortcuts[1].getAttribute("aria-pressed"), "false");
    assert.equal(nodes[1].querySelectorAll("button[aria-pressed]").length, 0, "the shortcuts are on the general page only");
  });

  test("the general page keeps the general switches; the RPG ones are on their own page", () => {
    const names = (node) => [...node.querySelectorAll("input[type=checkbox]")].map((b) => document.getElementById(b.getAttribute("aria-labelledby")).textContent);
    const general = featureItems(ctx)[0].node();
    const rpg = featureItems(ctx)[1].node();
    assert.equal(general.querySelectorAll("fieldset").length, 0, "one group needs no sub-heading");
    assert.equal(rpg.dataset.group, "rpg");
    assert.ok(names(general).some((n) => /Diagrama de dados|Data diagram/.test(n)));
    assert.equal(names(general).some((n) => /Dados 3D|3D dice|Oráculos|Oracles/.test(n)), false);
    for (const re of [/Oráculos|Oracles/, /Fichas|Statblocks/, /Dados 3D|3D dice/, /Assistente|wizard/]) assert.ok(names(rpg).some((n) => re.test(n)), String(re));
    assert.equal(names(general).length + names(rpg).length, FEATURE_IDS.length);
  });

  test("the general page links to the RPG page", () => {
    let went = "";
    const node = featureItems({ ...ctx, open: (s) => { went = s; } })[0].node();
    node.querySelector(".features-rpg-line button").click();
    assert.equal(went, "rpgfeatures");
  });

  test("the RPG 'all' links change only the RPG features; 3D dice is not turned on", () => {
    const rpg = featureItems(ctx)[1].node();
    assert.equal(featureItems(ctx)[0].node().querySelector(".features-bulk"), null, "the general page has no all-links");
    const [on, off] = rpg.querySelectorAll(".features-bulk button");
    off.click();
    assert.equal(m.settings.features.oracles, false);
    assert.equal(m.settings.features.diceRolling, false);
    assert.equal(m.settings.features.dataDiagram, true);
    on.click();
    assert.equal(m.settings.features.oracles, true);
    assert.equal(m.settings.features.dice3d, false);
    assert.equal(m.settings.features.dataDiagram, true);
  });

  test("a switch of a feature with its own page carries a link to it", () => {
    let went = "";
    const node = featureItems({ ...ctx, open: (s) => { went = s; } })[1].node();
    const links = [...node.querySelectorAll(".features-own-link")];
    assert.equal(links.length, 2);
    links[0].click();
    assert.equal(went, "oracles");
    links[1].click();
    assert.equal(went, "statblocks");
  });

  test("a switch changes the feature and the shortcut shows Custom", () => {
    const node = featureItems(ctx)[1].node();
    const box = [...node.querySelectorAll("input[type=checkbox]")].find((b) => /Oráculos|Oracles/.test(document.getElementById(b.getAttribute("aria-labelledby")).textContent));
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    assert.equal(m.settings.features.oracles, false);
    // The shortcut's mark is on the general page, drawn again on its next paint.
    for (const b of featureItems(ctx)[0].node().querySelectorAll("button[aria-pressed]")) assert.equal(b.getAttribute("aria-pressed"), "false");
  });

  test("a shortcut asks first: cancel changes nothing, yes applies it", async () => {
    const node = featureItems(ctx)[0].node();
    const writing = node.querySelectorAll("button[aria-pressed]")[1];
    writing.click();
    await new Promise((r) => setTimeout(r, 5));
    const box = document.querySelector(".confirm-box");
    assert.ok(box, "the in-page dialog is shown");
    assert.ok(box.querySelector("p").textContent.includes("Dados") || box.querySelector("p").textContent.includes("Dice"));
    box.querySelector("button.ghost").click();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(m.settings.features, allOn());
    writing.click();
    await new Promise((r) => setTimeout(r, 5));
    document.querySelector(".confirm-box button.save").click();
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(m.settings.features, allOff());
    assert.equal([...node.querySelectorAll("input")].some((b) => b.checked), false);
  });

  test("a feature's own page says it is off, with a way back", () => {
    assert.deepEqual(offNotice(ctx, "oracles", "oracles"), []);
    m.settings.features = { ...allOn(), oracles: false };
    const [n] = offNotice(ctx, "oracles", "oracles");
    const row = n.node();
    row.querySelector("button").click();
    assert.equal(hasCapability("oracles"), true);
  });
});
