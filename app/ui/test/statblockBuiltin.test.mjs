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
export { diceIn } from "./src/statblock/dice";
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

const NOT_OPEN = /daggerheart|tormenta|cthulhu|savage|mage|alien|one ring|mothership|forbidden lands|vaesen|dragonbane|tales from the loop|twilight|shadowrun|warhammer|kids on bikes|brindlewood|ordem paranormal|year zero/i;

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

describe("World of Darkness 5th edition (Dark Pack) and Cyberpunk RED (blank)", () => {
  const ids = ["vtm5-character", "vtm5-antagonist", "wta5-character", "htr5-character", "cpr-blank-character", "cpr-blank-npc"];
  const by = (id) => m.builtinLayouts().find((l) => l.id === id);
  // The full notices live on the credits page (src/credits.ts); the card
  // carries one short line that points there.
  const DARK = ["not official World of Darkness material", "Paradox Interactive AB", "Credits"];

  test("the six layouts are built in, in both languages, with sources", () => {
    for (const id of ids) {
      const l = by(id);
      assert.ok(l, id);
      assert.ok(l.name.pt && l.name.en && l.description.pt && l.description.en, id);
      assert.ok(l.sources.length >= 2, id);
    }
    assert.ok(!by("mage-character") && !m.builtinLayouts().some((l) => /mage/i.test(l.id)), "Mage stays importable only");
    assert.ok(!by("wta5-antagonist") && !by("htr5-antagonist"), "their adversary sheets are not read from a source yet");
  });

  test("the World of Darkness sheets roll a d10 pool of the wod5 profile and carry a short Dark Pack notice on the card", () => {
    for (const id of ["vtm5-character", "wta5-character", "htr5-character"]) {
      const l = by(id);
      assert.equal(l.profile, "wod5", id);
      assert.ok(l.blocks.some((b) => b.type === "roll"), id);
    }
    for (const id of ["vtm5-character", "vtm5-antagonist", "wta5-character", "htr5-character"]) {
      const card = m.renderStatblock(m.builtinSample(id), undefined, { layout: by(id) });
      const text = card.querySelector('[data-block="notice"]').textContent;
      for (const line of DARK) assert.ok(text.includes(line), `${id}: ${line}`);
      assert.match(text, /fan-made/);
      assert.ok(text.length < 200, `${id}: one short line, the full notice is on the credits page`);
      assert.doesNotMatch(text, /Portions of the materials|All rights reserved/);
    }
  });

  test("a card rolls the pool with Hunger dice as the profile counts them", async () => {
    const card = m.renderStatblock(m.builtinSample("vtm5-character"), undefined, { layout: by("vtm5-character"), rolls: true, rollWith: { deterministic: [10, 10, 7, 2] } });
    const go = card.querySelector("button.statblock-roll-go");
    assert.ok(go);
    const fields = card.querySelectorAll(".statblock-roll-field input");
    assert.equal(fields.length, 3, "regular dice, Hunger dice, difficulty");
    fields[0].value = "3";
    fields[1].value = "1";
    go.click();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(card.querySelector(".statblock-roll-failed"), null);
    assert.ok(card.querySelector(".statblock-roll-out").textContent.length > 0);
  });

  test("a Cyberpunk RED sheet is blank: field names, no stat block, a short notice that points to the credits page", () => {
    for (const id of ["cpr-blank-character", "cpr-blank-npc"]) {
      const l = by(id);
      assert.ok(!l.profile && !l.blocks.some((b) => b.type === "roll"), `${id}: no rules mechanics invented`);
      const card = m.renderStatblock(m.builtinSample(id), undefined, { layout: l });
      const text = card.querySelector('[data-block="notice"]').textContent;
      assert.match(text, /R\. Talsorian Games Homebrew Content Policy; not approved or endorsed by RTG\. See Credits/);
      assert.ok(text.length < 200, `${id}: one short line`);
      // The layout's title is a descriptive subtitle, not the game's title.
      assert.doesNotMatch(l.name.en, /^Cyberpunk/);
    }
  });

  test("the window's language picks the labels: Portuguese names in pt, English in en", () => {
    const labels = (l) => { const o = []; const w = (bs) => { for (const b of bs) { if (b.label) o.push(b.label); w(b.nested ?? []); } }; w(l.blocks); return o; };
    const pt = (id) => labels(by(id)).map((x) => x.pt);
    assert.ok(pt("vtm5-character").includes("Fome") && pt("vtm5-character").includes("Humanidade"));
    assert.ok(pt("wta5-character").includes("Fúria") && pt("htr5-character").includes("Credo"));
    assert.ok(pt("cpr-blank-character").includes("Pontos de Vida"));
    assert.ok(labels(by("vtm5-character")).some((x) => x.en === "Hunger"));
    for (const id of ids) assert.ok(labels(by(id)).filter((x) => x.pt !== x.en).length >= 3, id);
    for (const id of ["old-dragon-character", "old-dragon-monster"]) {
      const en = labels(by(id)).map((x) => x.en);
      assert.ok(!en.some((x) => /^(Atributos|Idiomas|Descrição|Utilidades|Tamanho|Alinhamento|PV atuais)$/.test(x)), id);
      assert.ok(en.includes("CA") || en.includes("QT"), `${id}: the game's abbreviations stay`);
    }
  });

  test("the layouts hold field names only: no sentence of rules in any block label", () => {
    for (const id of ids) {
      const walk = (blocks) => {
        for (const b of blocks) {
          for (const lab of [b.label?.en, b.label?.pt]) if (lab) assert.ok(lab.length <= 60 && !/[.;]/.test(lab), `${id}: ${lab}`);
          if (b.nested) walk(b.nested);
        }
      };
      walk(by(id).blocks);
    }
  });
});

describe("Fractal", () => {
  test("the character rolls a risk roll with the facts taken from the sheet", async () => {
    const layout = m.builtinLayouts().find((l) => l.id === "fractal-character");
    const card = m.renderStatblock(m.builtinSample("fractal-character"), undefined, { layout, rolls: true, rollWith: { deterministic: [6, 1] } });
    const go = card.querySelector("button.statblock-roll-go");
    assert.equal(go.textContent, "Risk roll");
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
    assert.equal(count.textContent, "1 of 3 broken");
    const marks = [...c2.querySelectorAll('[data-block="obstaculos"] button.statblock-flag')];
    assert.equal(marks[1].getAttribute("aria-label"), "Broken: Ninho de Krard");
    assert.equal(c2.querySelector('[data-block="obstaculos"] .statblock-trait:nth-child(2) a.wikilink').dataset.target, "Ninho de Krard", "the link still opens the note");
    marks[1].click();
    assert.deepEqual(obs, [[["obstaculos", 1, "quebrado"], true]]);
    assert.equal(count.textContent, "2 of 3 broken");
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
  test("the Pathfinder 2e creature rolls a strike as the book prints it: +17 [+13/+9]", () => {
    const rules = m.builtinLayouts().find((l) => l.id === "pf2e-creature").diceRules;
    const hits = (text) => m.diceIn(text, rules).filter((p) => p.notation).map((p) => [p.text, p.notation]);
    // The bonus alone is the button; the multiple-attack penalties follow it.
    assert.deepEqual(hits("hatchet +17 [+13/+9] (agile, sweep) Damage 1d6+10 slashing")[0], ["+17", "1d20+17"]);
    assert.deepEqual(hits("hatchet +17 [+13/+9] (agile) Damage 1d6+10").slice(1), [["1d6+10", "1d6+10"]]);
    // A bare modifier that is not a strike (Perception, a save) is not one.
    assert.deepEqual(hits("Perception +17; Fort +12"), []);
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
