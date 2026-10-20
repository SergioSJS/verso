// Visual statblocks (ADR 0099): the card as it is drawn, against the hostile
// and the odd. A note's fence is written by anyone in a room, so a card that
// cannot be drawn must be a badge in its place, never an error thrown into
// the page that holds it.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    contents: `export { STATBLOCK_MAX_CHARS, parseStatblock } from "./src/statblock/parser";
export { isStatblockCode, isStatblockFence, renderStatblock, renderStatblockCard, renderStatblockHost, imageTarget } from "./src/statblock/render";
export { BUILTIN_LAYOUTS, deleteCustomLayout, duplicateLayout, getAllLayouts, getCustomLayouts, getLayout, importLayoutFromJson, importLayoutFromYaml, resolveLayout, saveCustomLayout, setCustomLayouts, uniqueLayoutId } from "./src/statblock/layouts";
export { setStatblockLang } from "./src/statblock/strings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblockRender.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblockRender.test-bundle.mjs");

const ok = (text, opts) => {
  const card = m.renderStatblock(text, undefined, opts);
  assert.ok(card instanceof win.HTMLElement, "a card");
  return card;
};
const pictograph = /\p{Extended_Pictographic}/u;
const portuguese = /Pontos de Vida|Defesa|Força|Destreza|Sabedoria|Carisma|Criatura|Ações|Habilidades|Rolar|Ver código|Testes de Resist|Perícias|Idiomas|Sentidos|Deslocamento|Clique para/;
const words = (card) => card.textContent;

beforeEach(() => {
  localStorage.clear();
  m.setStatblockLang("pt-BR");
});

describe("a card is always drawn, whatever the fence holds", () => {
  test("keys named like the prototype's do not throw: they are the note's sections", () => {
    for (const key of ["constructor", "__proto__", "prototype", "toString", "hasOwnProperty", "valueOf"]) {
      const card = ok(`name: Hostil\n${key}:\n  - boom\n  - Golpe: dano 1d6`);
      assert.match(words(card), /boom/, key);
      assert.match(words(card), /Hostil/, key);
      for (const layout of ["dnd5e", "cyberpunk-red", "Tormenta20"]) assert.ok(ok(`layout: ${layout}\nname: x\n${key}:\n  - boom`), key + layout);
    }
    // And as plain fields.
    const card = ok('name: x\n"__proto__": text\nconstructor: 3');
    assert.match(words(card), /text/);
    assert.equal(Object.prototype.polluted, undefined);
  });

  test("a layout theme with a space, or with markup, never reaches a class name", () => {
    const data = m.parseStatblock("name: x\nhp: 3");
    const layout = { id: "custom-x", name: "X", system: "S", description: "", theme: "a b <i>", tags: [], blocks: [{ id: "h", type: "heading", properties: [] }] };
    const card = m.renderStatblockCard(data, undefined, { layout });
    assert.ok(card.classList.contains("statblock-theme-classic"));
    const imported = m.importLayoutFromYaml("name: T\ntheme: 'a b'\nblocks:\n  - type: heading");
    assert.equal(imported.theme, "classic");
  });

  test("a card that fails to build is a badge with the source, not a throw", () => {
    const data = m.parseStatblock("name: x");
    const broken = { ...data, abilities: [{ get short() { throw new Error("boom"); }, name: "n", score: 1 }] };
    const card = m.renderStatblockCard(broken);
    assert.ok(card.classList.contains("statblock-error"));
    assert.ok(card.querySelector(".statblock-badge"));
    assert.match(card.querySelector("pre").textContent, /name: x/);
  });

  test("text that is not a statblock is a badge, the text kept", () => {
    const card = ok("just a random sentence\n- 1\n- 2");
    assert.ok(card.classList.contains("statblock-error"));
    assert.match(card.textContent, /just a random sentence/);
    // A top-level list is not a creature.
    assert.equal(m.parseStatblock("- 1\n- 2"), null);
    assert.equal(m.parseStatblock("[1, 2]"), null);
  });

  test("a long line of spaces in broken YAML takes milliseconds, not seconds", () => {
    for (const text of [`- ${" ".repeat(100_000)}x`, `a: b: ${" ".repeat(100_000)}`, `${" ".repeat(100_000)}k`, `k:${" ".repeat(100_000)}\n- ${" ".repeat(50_000)}\n  :`]) {
      const t0 = performance.now();
      m.parseStatblock(text);
      assert.ok(performance.now() - t0 < 1500, `${performance.now() - t0} ms`);
    }
  });

  test("a block past the size cap is not parsed: a badge says so, the source stays", () => {
    const big = `name: Big\ntraits:\n${"  - a: b\n".repeat(40_000)}`;
    assert.ok(big.length > m.STATBLOCK_MAX_CHARS);
    assert.equal(m.parseStatblock(big), null);
    const t0 = performance.now();
    const card = ok(big);
    assert.ok(performance.now() - t0 < 1500);
    assert.ok(card.classList.contains("statblock-error"));
    assert.match(card.querySelector(".statblock-badge").textContent, /256/);
    assert.equal(card.querySelectorAll(".statblock-item-row").length, 0);
  });

  test("a long list is cut and says how much is left", () => {
    const text = `name: Many\ntraits:\n${"  - x: y\n".repeat(5000)}`;
    const data = m.parseStatblock(text);
    assert.ok(data.traits.length <= 1001);
    assert.match(data.traits.at(-1).desc, /4000/);
  });
});

describe("nothing the note says is dropped", () => {
  test("keys the card does not read are shown as fields or sections", () => {
    const data = m.parseStatblock(`name: Ana
subtitle: Uma exploradora
level: 3
raca: Elfa
source: Livro Básico
carga:
  atual: 4
  max: 10
ataque: |
  Golpe forte
  com a espada
`);
    assert.equal(data.subtitle, "Uma exploradora");
    assert.equal(data.customFields.level, 3);
    assert.equal(data.customFields.raca, "Elfa");
    assert.equal(data.customFields.source, "Livro Básico");
    assert.match(String(data.customFields.ataque), /Golpe forte/);
    const carga = data.customSections.find((s) => s.key === "carga");
    assert.deepEqual(carga.items.map((i) => i.name), ["atual", "max"]);
    const text = words(m.renderStatblockCard(data));
    for (const w of ["Uma exploradora", "Elfa", "Livro Básico", "Golpe forte", "atual"]) assert.match(text, new RegExp(w), w);
  });

  test("a score of 0 stays 0, and an unreadable one stays as written", () => {
    const data = m.parseStatblock("name: x\nstats: [0, 10, 10, 10, 10, 10]");
    assert.equal(data.abilities[0].score, 0);
    const odd = m.parseStatblock("name: x\nstr: muito\ndex: 12");
    assert.deepEqual(odd.abilities.map((a) => a.score), ["muito", 12]);
    assert.equal(odd.abilities.length, 2, "only the abilities the note holds");
  });

  test("a creature with a quote in a description survives", () => {
    const data = m.parseStatblock('name: Aspas\ntraits:\n  - Fala: "Ele disse \\"oi\\""');
    assert.equal(data.traits[0].desc, 'Ele disse "oi"');
  });
});

describe("one rule for the fence name, one list of the card's text", () => {
  test("statblock and statblock-suffix, case aside, nothing else", () => {
    for (const ok of ["statblock", "Statblock", "statblock-5e", "statblock x"]) assert.equal(m.isStatblockFence(ok), true, ok);
    for (const no of ["statblocks", "statblockfoo", "", "yaml"]) assert.equal(m.isStatblockFence(no), false, no);
  });

  test("a rendered fence's code is read by the same rule", () => {
    const code = (cls) => {
      const el = document.createElement("code");
      if (cls) el.className = cls;
      return el;
    };
    assert.equal(m.isStatblockCode(code("language-statblock")), true);
    assert.equal(m.isStatblockCode(code("language-statblock-5e")), true);
    assert.equal(m.isStatblockCode(code("language-statblocks")), false);
    assert.equal(m.isStatblockCode(code("language-yaml")), false);
    assert.equal(m.isStatblockCode(code("")), false);
  });
});

describe("pt-BR and English (ADR 0035, ADR 0099 item 6)", () => {
  const sheet = `name: Goblin\nstats: [8, 14, 10, 10, 8, 8]\nhp: 7\nhit_dice: 2d6\nac: 15\nspeed: 30 ft.\nsaves: Dex +4\nskills: Stealth +6\nsenses: darkvision 60 ft.\nlanguages: Common\ncr: 1/4\nxp: 50\ntraits:\n  - Nimble Escape: Disengage.\nactions:\n  - Scimitar: "+4 to hit, 1d6+2 damage"\nreactions:\n  - Redirect: nope\nlayout: dnd5e`;

  test("in English no Portuguese is shown, and the built-in layout speaks English", () => {
    m.setStatblockLang("en");
    const card = ok(sheet);
    assert.doesNotMatch(words(card), portuguese);
    assert.match(words(card), /Hit Points \(HP\)/);
    assert.match(words(card), /Strength|STR/);
    assert.equal(m.getLayout("dnd5e").name, "D&D 5e / Classic D20");
    for (const l of m.BUILTIN_LAYOUTS) assert.doesNotMatch(`${l.name} ${l.description} ${l.blocks.map((b) => b.title ?? "").join(" ")}`, /Perícias|Ações|Habilidades|Equipamento|Magias/, l.id);
    // Titles, names and tooltips of the card, too.
    for (const e of card.querySelectorAll("[title],[aria-label]")) assert.doesNotMatch(`${e.getAttribute("title")} ${e.getAttribute("aria-label")}`, portuguese);
  });

  test("in pt-BR it is Portuguese, and a note still names a layout by its Portuguese or English name", () => {
    const card = ok(sheet);
    assert.match(words(card), /Pontos de Vida \(PV\)/);
    assert.match(words(card), /FOR/);
    assert.equal(m.getLayout("D&D 5e / D20 Clássico").id, "dnd5e");
    m.setStatblockLang("en");
    assert.equal(m.getLayout("D&D 5e / D20 Clássico").id, "dnd5e");
    assert.equal(m.getLayout("D&D 5e / Classic D20").id, "dnd5e");
    assert.match(ok("name: x\nlayout: dnd5e\nstr: 3").textContent, /STR/);
  });

  test("an unnamed creature, in each language", () => {
    assert.equal(m.parseStatblock("hp: 3").name, "Criatura Sem Nome");
    m.setStatblockLang("en");
    assert.equal(m.parseStatblock("hp: 3").name, "Unnamed Creature");
  });

  test("no emoji in an accessible name or a tooltip", () => {
    for (const lang of ["pt-BR", "en"]) {
      m.setStatblockLang(lang);
      const card = ok(sheet, {});
      for (const e of card.querySelectorAll("[title],[aria-label]")) assert.doesNotMatch(`${e.getAttribute("title")}${e.getAttribute("aria-label")}`, pictograph);
    }
  });
});

describe("keyboard and screen reader (ADR 0099 item 6)", () => {
  const card = () => ok("name: Orc\nstats: [16, 12, 16, 7, 11, 10]\nlayout: dnd5e\nactions:\n  - Machado: +5 para acertar, 1d12+3 de dano", {});

  test("the abilities are a table: a column header for each, a score under it, a modifier row", () => {
    const table = card().querySelector("table.statblock-abilities");
    assert.ok(table);
    const heads = [...table.querySelectorAll("thead th")];
    assert.equal(heads.length, 6);
    assert.ok(heads.every((th) => th.getAttribute("scope") === "col"));
    assert.deepEqual([...table.querySelectorAll("tbody tr:first-child td")].map((td) => td.textContent), ["16", "12", "16", "7", "11", "10"]);
    assert.equal(table.querySelectorAll("tbody tr").length, 2);
    assert.match(table.querySelector("tbody tr:last-child td").textContent, /\+3/);
    assert.ok(table.querySelector("caption"));
    assert.equal(heads[0].querySelector("abbr").getAttribute("title"), "Força");
  });

  test("a dice badge is a button a keyboard reaches, named for what it rolls", () => {
    const badges = [...card().querySelectorAll(".statblock-dice-badge")];
    assert.equal(badges.length, 1);
    assert.equal(badges[0].tagName, "BUTTON");
    assert.equal(badges[0].getAttribute("type"), "button");
    assert.equal(badges[0].getAttribute("aria-label"), "Rolar 1d12+3");
    const rolled = [];
    window.addEventListener("verso:roll-dice", (e) => rolled.push(e.detail.notation));
    badges[0].click();
    assert.deepEqual(rolled, ["1d12+3"]);
  });

  test("dice are looked for in short text only", () => {
    const text = `name: x\ntraits:\n  - Longo: "${"1d6 ".repeat(10)}"\n  - Absurdo: 99999d99999 e 1d6`;
    const badges = ok(text).querySelectorAll(".statblock-dice-badge");
    assert.equal(badges.length, 11);
  });

  test("the layout button and the source toggle have names", () => {
    const c = m.renderStatblock("name: Orc", () => {});
    assert.ok(c.querySelector(".statblock-toggle-btn").getAttribute("aria-label"));
    assert.ok(c.querySelector(".statblock-layout-badge").textContent.trim());
  });
});

describe("the layout a note names", () => {
  test("a name that matches nothing: the default layout and a visible badge", () => {
    const card = ok("name: x\nlayout: asdasdas");
    const badge = card.querySelector(".statblock-badge-layout");
    assert.ok(badge);
    assert.match(badge.textContent, /asdasdas/);
    assert.equal(ok("name: x\nlayout: dnd5e").querySelector(".statblock-badge-layout"), null);
    assert.equal(ok("name: x").querySelector(".statblock-badge-layout"), null, "no layout named: no badge");
  });

  test("a part of a name, or a one-letter guess, finds nothing", () => {
    assert.equal(m.resolveLayout("a").known, false);
    assert.equal(m.resolveLayout("x").known, false);
    assert.equal(m.resolveLayout("Basic").known, false);
    assert.equal(m.resolveLayout("cyberpunk-re").known, false);
  });
});

describe("custom layouts keep their identity", () => {
  const layoutJson = (extra = {}) => JSON.stringify({ name: "Ação", system: "S", blocks: [{ type: "heading" }], ...extra });

  test("importing never replaces a layout: names that slug alike get ids of their own", () => {
    const a = m.importLayoutFromJson(layoutJson({ name: "Ação" }));
    const b = m.importLayoutFromJson(layoutJson({ name: "Açao!" }));
    const c = m.importLayoutFromJson(layoutJson({ name: "Ação" }));
    assert.equal(new Set([a.id, b.id, c.id]).size, 3);
    assert.equal(m.getCustomLayouts().length, 3);
  });

  test("a layout that takes a built-in's id is saved under one of its own, and the built-in stays", () => {
    const saved = m.saveCustomLayout({ ...m.BUILTIN_LAYOUTS[0], builtIn: false, name: "Meu 5e" });
    assert.notEqual(saved.id, "dnd5e");
    const ids = m.getAllLayouts().map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, "no id twice");
    assert.equal(m.getLayout("dnd5e").name, m.BUILTIN_LAYOUTS[0].name);
    assert.equal(m.getLayout(saved.id).name, "Meu 5e");
  });

  test("a layout an older build stored under a built-in's id is no longer hidden behind it", () => {
    localStorage.setItem("verso:statblock-layouts", JSON.stringify([{ id: "dnd5e", name: "Editado", system: "S", description: "", theme: "classic", blocks: [{ id: "h", type: "heading", properties: [] }] }]));
    const ids = m.getAllLayouts().map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(m.getAllLayouts().some((l) => l.name === "Editado"));
  });

  test("stored data is cleaned: a theme, a block of an unknown type, a bad shape", () => {
    localStorage.setItem("verso:statblock-layouts", JSON.stringify([{ id: "custom-a", name: "A", theme: "x y", blocks: [{ type: "nested" }, { type: "heading" }] }, 5, null, "x"]));
    const list = m.getCustomLayouts();
    assert.equal(list.length, 1);
    assert.equal(list[0].theme, "classic");
    assert.deepEqual(list[0].blocks.map((b) => b.type), ["heading"]);
  });

  test("an import with a block of a type that does not exist says which", () => {
    assert.throws(() => m.importLayoutFromYaml("name: T\nblocks:\n  - type: group\n    nested: []"), /"group"/);
    assert.throws(() => m.importLayoutFromYaml("- a"), /map|mapa/);
    assert.throws(() => m.importLayoutFromYaml("a: [b"), /YAML/);
  });

  test("a layout holds no css: nothing a layout carries is injected", () => {
    const layout = m.importLayoutFromYaml("name: T\ncss: 'body { display: none }'\nblocks:\n  - type: heading");
    assert.equal("css" in layout, false);
    assert.doesNotMatch(JSON.stringify(layout), /display: none/);
  });
});

describe("a text block reads fields, not the prototype", () => {
  test("{constructor} stays as written; a field of the note is filled", () => {
    const data = m.parseStatblock("name: Zé\nclasse: Mago\nraridade: raro");
    const layout = { id: "custom-t", name: "T", system: "S", description: "", theme: "classic", blocks: [{ id: "t", type: "text", properties: [], text: "{constructor} {__proto__} {name} {raridade}" }] };
    const card = m.renderStatblockCard(data, undefined, { layout });
    assert.match(card.querySelector(".statblock-text-body").textContent, /^\{constructor\} \{__proto__\} Zé raro$/);
  });
});

describe("the image block", () => {
  const layout = { id: "custom-i", name: "I", system: "S", description: "", theme: "classic", blocks: [{ id: "i", type: "image", properties: [] }] };
  const img = (text, source) => m.renderStatblockCard(m.parseStatblock(text), undefined, { layout, source });

  test("what an image: value names", () => {
    assert.equal(m.imageTarget("[[goblin.png]]"), "[[goblin.png]]");
    assert.equal(m.imageTarget("![[goblin.png|200]]"), "[[goblin.png|200]]");
    assert.equal(m.imageTarget("![orc](art/orc.png)"), "art/orc.png");
    assert.equal(m.imageTarget("art/orc.png"), "art/orc.png");
  });

  test("a folder image is asked of the core; a script address never becomes a source", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x", "file:///etc/passwd"]) {
      const card = img(`name: x\nimage: '${bad}'`, "n.md");
      assert.equal(card.querySelector("img")?.getAttribute("src") ?? null, null, bad);
    }
    const card = img("name: x\nimage: '[[goblin.png]]'", "n.md");
    assert.ok(card.querySelector("img.statblock-image"), "the picture waits for the core");
    assert.equal(card.querySelector("img").getAttribute("src"), null);
  });

  test("a web image is held until its origin is approved: no src", () => {
    const card = img("name: x\nimage: https://img.example/a.png", "n.md");
    assert.equal(card.querySelector("img")?.getAttribute("src") ?? null, null);
    assert.ok(card.querySelector(".prop-picture-held, .prop-picture-address"));
  });

  test("with no block for it, an image is a field, not a loss", () => {
    const card = m.renderStatblockCard(m.parseStatblock("name: x\nimage: '[[a.png]]'"), undefined, { layout: { ...layout, blocks: [{ id: "h", type: "heading", properties: [] }] } });
    assert.match(card.textContent, /a\.png/);
  });
});

describe("the fence in the reading view: the card and the source, both ways", () => {
  test("each view has the button that brings the other back", () => {
    const host = m.renderStatblockHost("name: Orc\nhp: 5");
    const card = host.querySelector(".statblock-card");
    const source = host.querySelector("pre");
    assert.equal(card.hidden, false);
    assert.equal(source.hidden, true);
    host.querySelector(".statblock-header .statblock-toggle-btn").click();
    assert.equal(card.hidden, true);
    assert.equal(source.hidden, false);
    assert.match(source.textContent, /name: Orc/);
    source.querySelector("button").click();
    assert.equal(card.hidden, false);
    assert.equal(source.hidden, true);
  });

  test("a broken fence is a badge; the host never throws", () => {
    const host = m.renderStatblockHost("{{{{ not: [yaml");
    assert.ok(host.querySelector(".statblock-error"));
  });
});

describe("the properties panel is out of reach of a read-only note (ADR 0076 item 11)", () => {
  const css = readFileSync(new URL("../css/panes.css", import.meta.url), "utf8");
  test("no rule of the panel's Add button or its empty state wins over [hidden]", () => {
    for (const line of css.split("\n").filter((l) => /^\.props\.empty[^{]*\{/.test(l) || /^\.props\.adding \.prop-new/.test(l))) {
      assert.doesNotMatch(line, /display:[^;]*!important/, line);
    }
  });
});
