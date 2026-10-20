// The built-in layouts of ADR 0099 item 6: every file reads with no problem,
// ids and names are right, every Rolai profile named exists, each layout has
// a sample that draws without a badge, the generated sample module is fresh,
// the Fractal roll block rolls with fixed dice, and a layout's `sources` are
// read as https addresses only.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
globalThis.window = win;
globalThis.document = win.document;
globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&") };
globalThis.HTMLElement = win.HTMLElement;
globalThis.CustomEvent = win.CustomEvent;
globalThis.localStorage = win.localStorage;

await esbuild.build({
  stdin: {
    contents: `export { builtinLayouts, builtinProblems, builtinSample } from "./src/statblock/builtin";
export { SAMPLE_YAML } from "./src/statblock/builtin/samplesData";
export { renderStatblock } from "./src/statblock/render";
export { validateLayout } from "./src/statblock/validate";
export { resetStoreForTests } from "./src/statblock/store";
export { setStatblockLang } from "./src/statblock/strings";
export { listProfiles } from "./src/dice/profiles";
export { LAYOUT_ID } from "./src/statblock/model";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockBuiltin.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblockBuiltin.test-bundle.mjs");
const { build } = await import("../scripts/samplesData.mjs");
const { readFileSync } = await import("node:fs");

beforeEach(() => {
  localStorage.clear();
  m.resetStoreForTests();
  m.setStatblockLang("en");
});

const NOT_OPEN = /daggerheart|tormenta|cthulhu|savage|vampire|werewolf|hunter|mage|alien|one ring|mothership|forbidden lands|vaesen|dragonbane|tales from the loop|twilight|cyberpunk|shadowrun|warhammer|kids on bikes|brindlewood|ordem paranormal|world of darkness|year zero|apocalypse/i;

describe("the built-in layouts", () => {
  test("every file reads with zero problems; ids are unique and well formed", () => {
    for (const { id, problems } of m.builtinProblems()) assert.deepEqual(problems, [], id);
    const layouts = m.builtinLayouts();
    assert.equal(layouts.length, m.builtinProblems().length, "none is dropped");
    const ids = layouts.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, m.LAYOUT_ID);
    for (const id of ["d20-creature", "facts-trackers", "dnd5e-character", "fractal-character", "fractal-challenge", "sf2e-creature"]) assert.ok(ids.includes(id), id);
    assert.ok(!ids.includes("sf2e-character"), "Starfinder 2e ships its creature only");
  });

  test("every profile a layout or a roll block names exists", () => {
    const known = new Set(m.listProfiles("en").map((p) => p.id));
    const walk = (blocks, id) => {
      for (const b of blocks) {
        if (b.type === "roll" && b.profile) assert.ok(known.has(b.profile), `${id}: ${b.profile}`);
        if (b.nested) walk(b.nested, id);
        for (const br of b.branches ?? []) walk(br.nested, id);
      }
    };
    for (const l of m.builtinLayouts()) {
      if (l.profile) assert.ok(known.has(l.profile), `${l.id}: ${l.profile}`);
      walk(l.blocks, l.id);
    }
  });

  test("names and descriptions carry no system that is not open", () => {
    for (const l of m.builtinLayouts()) {
      assert.doesNotMatch(`${l.name.pt} ${l.name.en}`, NOT_OPEN, l.id);
      assert.ok(l.name.pt && l.name.en, l.id);
    }
    for (const l of m.builtinLayouts().filter((x) => /^(percentile|moves-2d6|d6-pool|difficulty-pool|ladder-aspects)/.test(x.id))) {
      assert.doesNotMatch(`${l.name.pt} ${l.name.en}`, /d&d|pathfinder|fate|blades|fractal|ironsworn/i, `${l.id}: a generic layout names no system`);
    }
  });

  test("a system's layouts credit their sources, https only", () => {
    for (const l of m.builtinLayouts()) {
      for (const s of l.sources ?? []) assert.match(s.url, /^https:\/\//, l.id);
      if (!/^(d20-creature|facts-trackers|percentile|moves-2d6|d6-pool|difficulty-pool|ladder-aspects)/.test(l.id)) assert.ok((l.sources ?? []).length > 0, `${l.id} has sources`);
    }
  });

  test("the generated samples module is what the YAML files give", () => {
    const now = readFileSync(new URL("../src/statblock/builtin/samplesData.ts", import.meta.url), "utf8");
    assert.equal(now, build());
  });

  test("every layout has a sample that draws with no badge, and a name", () => {
    const ids = m.builtinLayouts().map((l) => l.id).sort();
    assert.deepEqual(Object.keys(m.SAMPLE_YAML).sort(), ids);
    for (const layout of m.builtinLayouts()) {
      const text = m.builtinSample(layout.id);
      assert.ok(text, layout.id);
      const card = m.renderStatblock(text, undefined, { layout });
      assert.equal(card.querySelector(".statblock-badge"), null, `${layout.id}: a badge`);
      assert.ok(!card.classList.contains("statblock-error"), layout.id);
      assert.ok(card.querySelector(".statblock-heading-text"), `${layout.id}: no heading drawn`);
      assert.ok(card.querySelectorAll(".statblock-block").length >= 3, `${layout.id}: almost empty`);
    }
    assert.equal(m.builtinSample("__proto__"), undefined);
  });

  test("a layout name resolves to its built-in with no unknown-layout badge", () => {
    const card = m.renderStatblock("layout: Fractal — Personagem\nname: x", undefined, {});
    assert.equal(card.dataset.layout, "fractal-character");
  });
});

describe("Fractal", () => {
  test("the character rolls a risk roll with the facts taken from the sheet", async () => {
    const layout = m.builtinLayouts().find((l) => l.id === "fractal-character");
    const card = m.renderStatblock(m.builtinSample("fractal-character"), undefined, { layout, rolls: true, rollWith: { deterministic: [6, 1] } });
    const go = card.querySelector("button.statblock-roll-go");
    assert.equal(go.textContent, "Rolagem de Risco");
    // fatos_aplicaveis comes from the sheet, vantagem is asked.
    assert.equal(card.querySelectorAll(".statblock-roll-field").length, 1);
    go.click();
    await new Promise((r) => setTimeout(r, 30));
    const out = card.querySelector(".statblock-roll-out");
    // Two facts from the sheet, two dice (6 and 1): the highest is read.
    assert.match(out.textContent, /pool \[6, 1\]/);
    assert.match(out.textContent, /Success/);
    assert.equal(out.querySelector(".statblock-roll-failed"), null);
  });

  test("facts are a list, each with its Quebrado toggle; a Reserva reads by its name; a Desafio draws its obstacles, one a link", () => {
    const layout = m.builtinLayouts().find((l) => l.id === "fractal-character");
    const writes = [];
    const card = m.renderStatblock(m.builtinSample("fractal-character"), undefined, { layout, write: (at, v) => (writes.push([at, v]), { ok: true }) });
    const facts = card.querySelectorAll('[data-block="fatos"] .statblock-trait');
    assert.equal(facts.length, 3);
    const toggles = [...card.querySelectorAll('[data-block="fatos"] button.statblock-flag')];
    assert.deepEqual(toggles.map((b) => b.getAttribute("aria-pressed")), ["false", "true", "false"]);
    assert.ok(facts[1].classList.contains("statblock-trait-flagged"));
    toggles[0].click();
    assert.deepEqual(writes, [[["fatos", 0, "quebrado"], true]]);
    // Reservas: one tracker per named slot, labelled by the slot's name.
    const reservas = [...card.querySelectorAll('[data-block^="reserva-"] .statblock-tracker')];
    assert.equal(reservas.length, 2);
    assert.match(reservas[0].textContent, /^Coragem/);
    assert.match(reservas[1].textContent, /Fôlego.*2\/4/);
    const ch = m.builtinLayouts().find((l) => l.id === "fractal-challenge");
    const c = m.renderStatblock(m.builtinSample("fractal-challenge"), undefined, { layout: ch });
    assert.match(c.querySelector('[data-block="reserva-1-valor"]').textContent, /^Vida.*10\/10/);
    // Obstacles carry the Quebrado mark; the count is worked out, not stored.
    const obs = [];
    const c2 = m.renderStatblock(m.builtinSample("fractal-challenge"), undefined, { layout: ch, write: (at, v) => (obs.push([at, v]), { ok: true }) });
    const count = c2.querySelector('[data-block="obstaculos"] .statblock-flag-count');
    assert.equal(count.textContent, "1 de 3 quebrados");
    const marks = [...c2.querySelectorAll('[data-block="obstaculos"] button.statblock-flag')];
    assert.equal(marks[1].getAttribute("aria-label"), "Quebrado: Ninho de Krard");
    assert.equal(c2.querySelector('[data-block="obstaculos"] .statblock-trait:nth-child(2) a.wikilink').dataset.target, "Ninho de Krard", "the link still opens the note");
    marks[1].click();
    assert.deepEqual(obs, [[["obstaculos", 1, "quebrado"], true]]);
    assert.equal(count.textContent, "2 de 3 quebrados");
    assert.equal(c2.querySelector('[data-block="obstaculos-quebrados"]'), null, "no stored counter");
    assert.equal(c.querySelector('[data-block="reserva-3-valor"]'), null, "a slot with no name hides");
    const row = c.querySelector('[data-block="obstaculos"]');
    assert.equal(row.querySelectorAll(".statblock-trait").length, 3);
    assert.match(row.textContent, /Ninho de Krard/);
    assert.ok(row.querySelector("a, .internal-link, [data-href]"), "the [[link]] is drawn as a link");
  });
});

describe("sources of a layout", () => {
  const base = { name: "T", id: "t", blocks: [] };
  test("a label and an https address are kept", () => {
    const v = m.validateLayout({ ...base, sources: [{ label: "SRD", url: "https://example.org/srd" }] });
    assert.deepEqual(v.problems, []);
    assert.deepEqual(v.layout.sources, [{ label: "SRD", url: "https://example.org/srd" }]);
  });
  test("other schemes, missing labels and a non-list are left out and listed", () => {
    const v = m.validateLayout({ ...base, sources: [{ label: "x", url: "javascript:alert(1)" }, { label: "", url: "https://a.org/" }, "https://b.org/", { label: "ok", url: "http://c.org/" }] });
    assert.equal(v.problems.length, 4);
    assert.equal(v.layout.sources, undefined);
    assert.equal(m.validateLayout({ ...base, sources: "https://a.org" }).layout.sources, undefined);
  });
  test("an address past 300 characters is refused with a problem, not cut short", () => {
    const long = `https://a.org/${"x".repeat(300)}`;
    const v = m.validateLayout({ ...base, sources: [{ label: "SRD", url: long }, { label: "ok", url: `https://a.org/${"y".repeat(286)}` }] });
    assert.equal(v.problems.length, 1);
    assert.deepEqual(v.layout.sources.map((s) => s.label), ["ok"]);
    assert.equal(v.layout.sources[0].url.length, 300);
  });
  test("past the limit it is cut, and says so", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `s${i}`, url: `https://a.org/${i}` }));
    const v = m.validateLayout({ ...base, sources: many });
    assert.equal(v.layout.sources.length, 12);
    assert.equal(v.problems.length, 1);
  });
});
