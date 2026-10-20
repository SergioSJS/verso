// Statblock cards (ADR 0099): each block type drawn from the sheet, the
// card's names for a screen reader, the dice it makes, what it does with a
// block that does not read, a tracker's click written as the smallest
// change of the YAML (applied through a CodeMirror state), the reading
// view's refusals, and a roll block rolled with fixed dice.
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
    contents: `export { renderStatblock, renderStatblockHost, isStatblockFence, isStatblockCode, STATBLOCK_MAX_CHARS } from "./src/statblock/render";
export { planValueEdit, statblockFences, writeInReading, sameText } from "./src/statblock/edit";
export { validateLayout } from "./src/statblock/validate";
export { resolveLayout, resetStoreForTests } from "./src/statblock/store";
export { setStatblockLang } from "./src/statblock/strings";
export { EditorState } from "@codemirror/state";`,
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

const layoutOf = (blocks, extra = {}) => m.validateLayout({ name: "T", id: "t", diceRules: [{ pattern: String.raw`\b(\d{0,3}d\d{1,4}(?: ?[+-] ?\d{1,5})?)\b`, template: "$1" }], ...extra, blocks }).layout;
const die = (made) => (notation, look = {}) => {
  made.push(notation);
  const b = document.createElement("button");
  b.className = "dice-button";
  b.textContent = look.text ?? notation;
  b.setAttribute("aria-label", look.label ?? `Roll ${notation}`);
  return b;
};
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  m.resetStoreForTests();
  m.setStatblockLang("en");
});

const DRAGON = `layout: Basic 5e Layout
image: [[Ancient Black Dragon.jpg]]
name: Ancient Black Dragon
size: Gargantuan
type: dragon
alignment: chaotic evil
ac: 22
hp: 367
hit_dice: 21d20+147
speed: 40 ft., fly 80 ft., swim 40 ft.
stats: [27, 14, 25, 16, 15, 19]
saves:
  - dexterity: 9
  - constitution: 14
skillsaves:
  - perception: 16
senses: blindsight 60 ft., darkvision 120 ft., passive Perception 26
cr: 21
traits:
  - name: Amphibious
    desc: The dragon can breathe air and water
actions:
  - name: Bite
    desc: "Melee Weapon Attack: +15 to hit, reach 15 ft., one target. Hit: 19 (2d10 + 8) piercing damage."
`;

describe("a Fantasy Statblocks block draws with the default layout", () => {
  test("the plugin's own example: name, defences, table with modifiers, saves, traits, dice", () => {
    const made = [];
    const card = m.renderStatblock(DRAGON, undefined, { dice: die(made) });
    assert.equal(card.dataset.layout, "d20-creature");
    assert.equal(card.getAttribute("role"), "group");
    assert.equal(card.getAttribute("aria-label"), "Ancient Black Dragon");
    assert.equal(card.querySelector("h3").textContent, "Ancient Black Dragon");
    assert.match(card.textContent, /Gargantuan, dragon, chaotic evil/);
    assert.match(card.textContent, /Armor Class 22/);
    assert.match(card.textContent, /Hit Points 367/);
    const scores = card.querySelector(".statblock-scores");
    assert.equal(scores.getAttribute("role"), "list");
    const cells = [...scores.querySelectorAll(".statblock-score")];
    assert.ok(cells.every((c) => c.getAttribute("role") === "listitem"));
    assert.deepEqual(cells.map((c) => c.querySelector(".statblock-score-name").textContent), ["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    // The modifier is its own die, "(+8)" naming the ability it rolls for;
    // no text rule reads the cell, so no die sits inside the brackets.
    assert.match(cells[0].textContent, /^STR27 \(\+8\)$/);
    const mod = cells[0].querySelector(".statblock-mod");
    assert.equal(mod.textContent, "(+8)");
    assert.equal(mod.getAttribute("aria-label"), "Roll 1d20+8 for STR");
    assert.equal(cells[0].querySelectorAll(".dice-button").length, 1);
    assert.match(card.textContent, /Saving Throws Dexterity \+9/);
    assert.match(card.textContent, /Skills Perception \+16/);
    assert.match(card.textContent, /Amphibious\./);
    assert.ok(made.includes("21d20+147"), "the hit dice beside the hit points");
    assert.ok(made.includes("1d20+15"), "to hit");
    assert.ok(made.includes("2d10+8"), "damage");
    assert.ok(made.includes("1d20+9"), "a save");
    assert.ok(made.includes("1d20+8"), "an ability check");
    assert.equal(card.querySelector(".statblock-badge-layout"), null, "the plugin's layout name is known");
  });

  test("without dice (Dice off) the same text, no die", () => {
    const card = m.renderStatblock(DRAGON);
    assert.equal(card.querySelectorAll(".dice-button").length, 0);
    assert.match(card.textContent, /\+15 to hit/);
  });

  test("in Portuguese, the layout's labels in Portuguese", () => {
    m.setStatblockLang("pt-BR");
    const card = m.renderStatblock(DRAGON);
    assert.match(card.textContent, /Classe de Armadura 22/);
    assert.deepEqual([...card.querySelectorAll(".statblock-score-name")].map((t) => t.textContent), ["FOR", "DES", "CON", "INT", "SAB", "CAR"]);
  });
});

describe("layouts are found by id or name, exactly but for case and accents", () => {
  test("by id, by either language's name, accents and case ignored", () => {
    assert.equal(m.resolveLayout("facts-trackers").stored.layout.id, "facts-trackers");
    assert.equal(m.resolveLayout("FATOS E CONTADORES").stored.layout.id, "facts-trackers");
    assert.equal(m.resolveLayout("Criatura D20").stored.layout.id, "d20-creature");
    assert.equal(m.resolveLayout("facts").known, false, "no part of a name");
  });

  test("an unknown layout draws the default with a visible badge", () => {
    const card = m.renderStatblock("layout: D&D 5e / D20 Clássico\nname: Goblin");
    assert.equal(card.dataset.layout, "d20-creature");
    assert.match(card.querySelector(".statblock-badge-layout").textContent, /D&D 5e \/ D20 Clássico/);
  });
});

describe("every block type", () => {
  const sheet = `name: Sentinel
kind: construct
note: "A guard of [[The Vault|the vault]], **brass** and *bone*; strikes for 2d6+1."
hp: 12
str: 14
dex: 9
saves: { will: 3, grit: -1 }
facts:
  - Old: It remembers the founding
  - Rusted
  - name: Wards
    desc: Three, each 1d4
    traits:
      - name: Inner ward
        desc: deeper
image: "[[sentinel.png]]"
tier: 3
`;
  const blocks = [
    { type: "inline", id: "top", nested: [{ type: "heading", id: "h", properties: ["name"], size: 2 }, { type: "image", id: "img", properties: ["image"] }] },
    { type: "subheading", id: "sub", properties: ["kind", "missing", "tier"], separator: " · " },
    { type: "property", id: "hp", properties: ["hp"], label: { pt: "Vida", en: "Health" }, rule: true },
    { type: "property", id: "tpl", properties: ["str"], template: "{str} / {dex}", label: "Arms" },
    { type: "property", id: "gone", properties: ["nothing"], label: "Gone", hideWhenEmpty: true },
    { type: "property", id: "fb", properties: ["nothing"], label: "Languages", fallback: "-" },
    { type: "table", id: "tb", properties: ["str", "dex"], headers: ["S", "D"], modifier: { kind: "expression", expression: "(score - 10) / 2" } },
    { type: "saves", id: "sv", properties: ["saves"], label: "Saves" },
    { type: "traits", id: "tr", properties: ["facts"], label: { pt: "Fatos", en: "Facts" } },
    { type: "text", id: "tx", properties: ["note"] },
    { type: "text", id: "fixed", text: { pt: "Fixo", en: "Fixed text" } },
    { type: "group", id: "g", label: "Group", nested: [{ type: "property", id: "gk", properties: ["kind"], label: "Kind" }] },
    { type: "group", id: "eg", label: "Empty", hideWhenEmpty: true, nested: [{ type: "property", id: "x", properties: ["zzz"], hideWhenEmpty: true }] },
    { type: "collapse", id: "c", label: "More", open: false, nested: [{ type: "text", id: "ct", text: "Hidden inside" }] },
    { type: "conditional", id: "cond", branches: [{ when: { op: "above", key: "tier", value: 5 }, nested: [{ type: "text", id: "big", text: "BIG" }] }, { when: { op: "equals", key: "kind", value: "Construct" }, nested: [{ type: "text", id: "cons", text: "IS CONSTRUCT" }] }, { nested: [{ type: "text", id: "else", text: "ELSE" }] }] },
  ];

  test("each draws what it reads, hides or falls back when empty", () => {
    const made = [];
    const card = m.renderStatblock(sheet, undefined, { layout: layoutOf(blocks), dice: die(made) });
    const block = (id) => card.querySelector(`[data-block="${id}"]`);
    assert.equal(block("h").querySelector("h4").textContent, "Sentinel", "size 2 is an h4");
    assert.equal(block("sub").textContent, "construct · 3");
    assert.equal(block("hp").textContent, "Health 12");
    assert.ok(block("hp").classList.contains("statblock-ruled"));
    assert.equal(block("tpl").textContent, "Arms 14 / 9");
    assert.equal(block("gone"), null);
    assert.equal(block("fb").textContent, "Languages -");
    const cells = [...block("tb").querySelectorAll(".statblock-score")].map((t) => t.textContent);
    assert.deepEqual(cells, ["S14 Modifier (+2)", "D9 Modifier (−1)"]);
    assert.equal(block("sv").textContent, "Saves Will +3, Grit -1");
    const facts = [...block("tr").querySelectorAll(":scope > .statblock-traits > .statblock-trait")].map((t) => t.textContent);
    assert.equal(facts.length, 3);
    assert.match(facts[0], /^Old\. It remembers/);
    assert.equal(facts[1], "Rusted");
    assert.match(facts[2], /^Wards\. Three, each 1d4Inner ward\. deeper$/);
    const link = block("tx").querySelector("a.wikilink");
    assert.equal(link.dataset.target, "The Vault");
    assert.equal(link.textContent, "the vault");
    assert.equal(block("tx").querySelector("strong").textContent, "brass");
    assert.equal(block("tx").querySelector("em").textContent, "bone");
    assert.deepEqual(made, ["1d4", "2d6+1"]);
    assert.equal(block("fixed").textContent, "Fixed text");
    assert.match(block("g").textContent, /Group.*Kind construct/);
    assert.equal(block("eg"), null, "a container with nothing to show hides");
    const details = block("c").querySelector("details");
    assert.equal(details.open, false);
    assert.equal(details.querySelector("summary").textContent, "More");
    assert.equal(block("cond").textContent, "IS CONSTRUCT");
    assert.ok(block("img").querySelector("img.statblock-image"));
  });

  test("nothing of the sheet becomes markup", () => {
    const card = m.renderStatblock('name: "<img src=x onerror=alert(1)>"\nnote: "<script>bad()</script> **<b>x</b>**"', undefined, { layout: layoutOf(blocks) });
    assert.equal(card.querySelectorAll("script, img[onerror], b").length, 0);
    assert.match(card.textContent, /<script>bad\(\)<\/script>/);
  });

  test("the layout's colours land as checked custom properties, columns as the layout says", () => {
    const layout = layoutOf([{ type: "heading", properties: ["name"] }], { columns: 2, appearance: { light: { accent: "#123456" }, dark: { accent: "#abcdef" }, headingFont: "ui" } });
    const card = m.renderStatblock("name: x", undefined, { layout });
    assert.equal(card.style.getPropertyValue("--sb-accent"), "light-dark(#123456, #abcdef)");
    assert.equal(card.style.getPropertyValue("--sb-heading-font"), "var(--ui)");
    assert.ok(card.querySelector(".statblock-columns"));
    const one = m.renderStatblock("name: x\ncolumns: 1", undefined, { layout });
    assert.equal(one.querySelector(".statblock-columns"), null, "the block's own columns: wins");
  });
});

describe("a block that does not read never breaks the note", () => {
  test("too big: a badge with the start of the source", () => {
    const card = m.renderStatblock("a: 1\n".repeat(60_000));
    assert.ok(card.classList.contains("statblock-error"));
    assert.match(card.querySelector(".statblock-badge").textContent, /256 KB/);
  });

  test("invalid YAML keeps the last card that read, with a badge", () => {
    const first = m.renderStatblock("name: Kept\nhp: 3", undefined, { key: "n#0" });
    assert.match(first.textContent, /Kept/);
    const broken = m.renderStatblock("name: Kept\nhp: [3", undefined, { key: "n#0" });
    assert.match(broken.textContent, /Kept/);
    assert.ok(broken.querySelector(".statblock-badge-stale"));
    const other = m.renderStatblock("name: x\nhp: [3", undefined, { key: "n#1" });
    assert.ok(other.classList.contains("statblock-error"));
  });

  test("a block inserted above does not hand its last card to another block", () => {
    m.renderStatblock("name: Alpha\nhp: 3", undefined, { key: "note" });
    m.renderStatblock("name: Beta\nhp: 4", undefined, { key: "note" });
    // A third statblock now sits above them; each broken block keeps its own.
    const beta = m.renderStatblock("name: Beta\nhp: [4", undefined, { key: "note" });
    assert.match(beta.textContent, /Beta/);
    assert.doesNotMatch(beta.textContent, /Alpha/);
    const gamma = m.renderStatblock("name: Gamma\nhp: [4", undefined, { key: "note" });
    assert.ok(gamma.classList.contains("statblock-error"));
  });

  test("prototype keys in the sheet are drawn as values", () => {
    const layout = layoutOf([{ type: "property", properties: ["__proto__"], label: "P" }, { type: "traits", properties: ["constructor"] }]);
    const card = m.renderStatblock('"__proto__": text\nconstructor:\n  - boom', undefined, { layout });
    assert.match(card.textContent, /P text/);
    assert.match(card.textContent, /boom/);
    assert.equal(Object.prototype.polluted, undefined);
  });

  test("the host toggles between card and source, focus following", () => {
    const host = m.renderStatblockHost("name: H");
    document.body.append(host);
    const [card, source] = host.children;
    assert.equal(source.hidden, true);
    card.querySelector(".statblock-toggle-btn").click();
    assert.equal(card.hidden, true);
    assert.equal(source.hidden, false);
    assert.equal(document.activeElement, source.querySelector(".statblock-back-btn"));
    host.remove();
  });
});

describe("trackers write that one value", () => {
  const tracker = (style, extra = {}) => layoutOf([{ type: "tracker", id: "tk", label: { pt: "Estresse", en: "Stress" }, current: "stress", max: "stress_max", style, ...extra }]);

  test("boxes: a labelled group of named buttons; a click writes the value", () => {
    const writes = [];
    const card = m.renderStatblock("stress: 2\nstress_max: 5", undefined, { layout: tracker("boxes"), write: (k, v) => (writes.push([k, v]), { ok: true }) });
    const group = card.querySelector('[role="group"].statblock-boxes');
    assert.ok(group);
    const label = card.querySelector(`#${group.getAttribute("aria-labelledby")}`);
    assert.equal(label.textContent, "Stress");
    const boxes = [...group.querySelectorAll("button.statblock-box")];
    assert.equal(boxes.length, 5);
    assert.deepEqual(boxes.map((b) => b.getAttribute("aria-pressed")), ["true", "true", "false", "false", "false"]);
    assert.equal(boxes[3].getAttribute("aria-label"), "Stress: mark 4 of 5");
    assert.deepEqual(boxes.map((b) => b.tabIndex), [-1, 0, -1, -1, -1], "one box takes Tab");
    boxes[3].click();
    assert.deepEqual(writes, [["stress", 4]]);
    // The last box marked, clicked, is unmarked.
    group.querySelectorAll("button.statblock-box")[3].click();
    assert.deepEqual(writes[1], ["stress", 3]);
  });

  test("keys: arrows step, Home empties, End fills", () => {
    const writes = [];
    const card = m.renderStatblock("stress: 2\nstress_max: 5", undefined, { layout: tracker("boxes"), write: (k, v) => (writes.push(v), { ok: true }) });
    const group = card.querySelector('[role="group"]');
    const key = (k) => group.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }));
    key("ArrowRight");
    key("End");
    key("Home");
    key("ArrowLeft");
    assert.deepEqual(writes, [3, 5, 0], "nothing below zero");
  });

  test("number style: named steps, disabled at the bounds", () => {
    const card = m.renderStatblock("stress: 0\nstress_max: 3", undefined, { layout: tracker("number"), write: () => ({ ok: true }) });
    const [minus, plus] = card.querySelectorAll("button.statblock-step");
    assert.equal(minus.getAttribute("aria-label"), "Stress: one less");
    assert.equal(minus.disabled, true);
    assert.equal(plus.disabled, false);
    assert.match(card.textContent, /0 \/ 3/);
  });

  test("a refusal is said in the card", () => {
    const card = m.renderStatblock("stress: 1\nstress_max: 3", undefined, { layout: tracker("boxes"), write: () => ({ ok: false, why: "readOnly" }) });
    card.querySelectorAll("button.statblock-box")[2].click();
    assert.match(card.querySelector(".statblock-tracker-note").textContent, /read-only/);
  });

  test("without a write the tracker is read-only: no buttons", () => {
    const card = m.renderStatblock("stress: 1\nstress_max: 3", undefined, { layout: tracker("boxes") });
    assert.equal(card.querySelectorAll("button.statblock-box").length, 0);
    assert.equal(card.querySelectorAll("span.statblock-box.filled").length, 1);
  });

  test("a value out of bounds shows a badge and a one-click repair", () => {
    const writes = [];
    const card = m.renderStatblock('stress: "7x"\nstress_max: 5', undefined, { layout: tracker("boxes"), write: (k, v) => (writes.push([k, v]), { ok: true }) });
    const badge = card.querySelector(".statblock-bad-value");
    assert.match(badge.textContent, /"7x" is not a number from 0 to 5/);
    badge.querySelector("button.statblock-repair").click();
    assert.deepEqual(writes, [["stress", 5]]);
    assert.equal(card.querySelector(".statblock-bad-value"), null);
  });

  test("a tracker that hides when empty", () => {
    const card = m.renderStatblock("name: x", undefined, { layout: tracker("boxes", { hideWhenEmpty: true, properties: ["stress", "stress_max"] }) });
    assert.equal(card.querySelector(".statblock-tracker"), null);
  });
});

describe("the write is the smallest change of the YAML", () => {
  const apply = (doc, plan) => m.EditorState.create({ doc }).update({ changes: plan }).state.doc.toString();

  test("only the scalar changes: comments, quotes, order and spacing kept", () => {
    const yaml = "name: Ogre   # big\nstress: 2 # marked\nquoted: \"3\"\nsingle: '1'\nlist:\n  - a\n";
    assert.equal(apply(yaml, m.planValueEdit(yaml, "stress", 4)), yaml.replace("stress: 2", "stress: 4"));
    assert.equal(apply(yaml, m.planValueEdit(yaml, "quoted", 10)), yaml.replace('"3"', '"10"'));
    assert.equal(apply(yaml, m.planValueEdit(yaml, "single", 0)), yaml.replace("'1'", "'0'"));
    const plan = m.planValueEdit(yaml, "stress", 4);
    assert.equal(plan.to - plan.from, 1);
  });

  test("a key with no value takes one; an absent key is added on its own line", () => {
    assert.equal(apply("hp:\nb: 1\n", m.planValueEdit("hp:\nb: 1\n", "hp", 5)), "hp: 5\nb: 1\n");
    assert.equal(apply("name: x\n", m.planValueEdit("name: x\n", "hp_current", 7)), "name: x\nhp_current: 7\n");
    assert.equal(apply("name: x", m.planValueEdit("name: x", "hp_current", 7)), "name: x\nhp_current: 7");
  });

  test("what cannot change alone is refused, never rewritten", () => {
    assert.deepEqual(m.planValueEdit("{stress: 1}", "stress", 2), { why: "shape" });
    assert.deepEqual(m.planValueEdit("stress: [1]", "stress", 2), { why: "shape" });
    assert.deepEqual(m.planValueEdit("stress: |\n  1\n", "stress", 2), { why: "shape" });
    assert.deepEqual(m.planValueEdit("a: [1", "stress", 2), { why: "shape" });
    assert.deepEqual(m.planValueEdit("stress: 2", "stress", 2), { why: "unchanged" });
    assert.deepEqual(m.planValueEdit("stress: 2", "stress", 2.5), { why: "shape" });
  });

  test("duplicate keys: the last one, as a reader takes it", () => {
    const yaml = "hp: 1\nhp: 2\n";
    assert.equal(apply(yaml, m.planValueEdit(yaml, "hp", 9)), "hp: 1\nhp: 9\n");
  });
});

describe("the reading view writes through the note, or says why not", () => {
  const note = "# Ogre\n\n```statblock\nname: Ogre\nstress: 1\n```\n\ntext\n\n```statblock\nname: Ogre\nstress: 1\n```\n";
  const hostOf = (doc, over = {}) => {
    const h = {
      saved: 0,
      readOnly: false,
      mode: "preview",
      conflict: { up: false },
      readerView: { on: false },
      shownText: doc,
      editor: {
        state: m.EditorState.create({ doc }),
        dispatch(spec) {
          this.state = this.state.update(spec).state;
        },
      },
      save() {
        this.saved++;
        return Promise.resolve();
      },
      ...over,
    };
    return h;
  };

  test("the fences of a note, found by their text", () => {
    const fences = m.statblockFences(note);
    assert.equal(fences.length, 2);
    assert.equal(fences[0].text, "name: Ogre\nstress: 1\n");
    assert.equal(m.statblockFences("```js\nx\n```\n~~~statblock\na: 1\n~~~\n> ```statblock\n> a: 1\n> ```\n").length, 1);
  });

  test("the second of two alike is written, and saved", () => {
    const host = hostOf(note);
    const r = m.writeInReading(host, "name: Ogre\nstress: 1\n", 1, 2, "stress", 3);
    assert.deepEqual(r, { ok: true });
    assert.equal(host.editor.state.doc.toString(), note.replace(/stress: 1\n```\n$/, "stress: 3\n```\n"));
    assert.equal(host.saved, 1);
  });

  test("read-only, a conflict, the reader's view, a stale view, a moved block: refused", () => {
    const t = "name: Ogre\nstress: 1\n";
    assert.equal(m.writeInReading(hostOf(note, { readOnly: true }), t, 0, 2, "stress", 2).why, "readOnly");
    assert.equal(m.writeInReading(hostOf(note, { conflict: { up: true } }), t, 0, 2, "stress", 2).why, "conflict");
    assert.equal(m.writeInReading(hostOf(note, { readerView: { on: true } }), t, 0, 2, "stress", 2).why, "readerView");
    assert.equal(m.writeInReading(hostOf(note, { shownText: "other" }), t, 0, 2, "stress", 2).why, "stale");
    assert.equal(m.writeInReading(hostOf(note), t, 0, 3, "stress", 2).why, "moved");
    assert.equal(m.writeInReading(hostOf(note), "name: Elsewhere\n", 0, 1, "stress", 2).why, "nested");
    const untouched = hostOf(note, { readOnly: true });
    m.writeInReading(untouched, t, 0, 2, "stress", 2);
    assert.equal(untouched.editor.state.doc.toString(), note);
  });
});

describe("a roll block rolls the system's way, shown and said, never written", () => {
  test("Fractal: facts from the sheet, the highest die read", async () => {
    const layout = layoutOf([{ type: "roll", id: "r", profile: "fractal", label: { pt: "Risco", en: "Risk roll" }, inputs: { fatos_aplicaveis: { key: "facts" } } }]);
    const card = m.renderStatblock("facts: 2", undefined, { layout, rolls: true, rollWith: { deterministic: [3, 6] } });
    const go = card.querySelector("button.statblock-roll-go");
    assert.equal(go.textContent, "Risk roll");
    // The advantage select is asked; the facts are not.
    assert.equal(card.querySelectorAll(".statblock-roll-field").length, 1);
    go.click();
    await tick(20);
    const out = card.querySelector(".statblock-roll-out");
    assert.equal(out.getAttribute("role"), "status");
    assert.match(out.textContent, /Fractal/);
    assert.match(out.textContent, /\[3, 6\]/);
  });

  test("d20 against a DC from the sheet: the outcome in words", async () => {
    const layout = layoutOf([{ type: "roll", id: "r", profile: "d20", inputs: { mod: { key: "bonus" }, dc: { value: 15 } } }]);
    const card = m.renderStatblock("bonus: 3", undefined, { layout, rolls: true, rollWith: { deterministic: [14] } });
    card.querySelector("select.statblock-roll-input").value = "";
    card.querySelector("button.statblock-roll-go").click();
    await tick(20);
    assert.match(card.querySelector(".statblock-roll-out").textContent, /17.*Success/);
  });

  test("with Dice off there is no roll block", () => {
    const layout = layoutOf([{ type: "roll", id: "r", profile: "d20", inputs: {} }]);
    assert.equal(m.renderStatblock("a: 1", undefined, { layout }).querySelector(".statblock-roll"), null);
  });
});

test("the fence names: statblock only, in any case", () => {
  assert.ok(m.isStatblockFence("statblock"));
  assert.ok(m.isStatblockFence("StatBlock extra"));
  assert.ok(!m.isStatblockFence("statblock-pf2e foo"));
  assert.ok(!m.isStatblockFence("stat"));
});

test("a card's \"Edit this layout\" names its layout and its block's text", () => {
  const seen = [];
  const card = m.renderStatblock("layout: facts-trackers\nname: X", undefined, { onEditLayout: (id, text) => seen.push([id, text]) });
  const btn = card.querySelector("button.statblock-edit-layout");
  assert.match(btn.getAttribute("aria-label"), /Edit this layout: Facts and trackers/);
  btn.click();
  assert.deepEqual(seen, [["facts-trackers", "layout: facts-trackers\nname: X"]]);
  const preview = m.renderStatblock("name: X", undefined, { layout: layoutOf([]) });
  assert.equal(preview.querySelector(".statblock-edit-layout"), null, "not on the editor's own card");
});

describe("nested values write as the top-level ones do", () => {
  const apply = (doc, plan) => m.EditorState.create({ doc }).update({ changes: plan }).state.doc.toString();
  const yaml = "name: x\nfatos:\n  - name: A\n    quebrado: false # dito\n  - name: B\n  - {name: C, quebrado: \"false\"}\n  - D\n";
  test("a list item's key: replaced in place, or added under the item at its column", () => {
    assert.equal(apply(yaml, m.planValueEdit(yaml, ["fatos", 0, "quebrado"], true)), yaml.replace("quebrado: false #", "quebrado: true #"));
    assert.equal(apply(yaml, m.planValueEdit(yaml, ["fatos", 1, "quebrado"], true)), yaml.replace("  - name: B\n", "  - name: B\n    quebrado: true\n"));
    assert.equal(apply(yaml, m.planValueEdit(yaml, ["fatos", 2, "quebrado"], true)), yaml.replace('quebrado: "false"', 'quebrado: "true"'));
  });
  test("what cannot take a key alone is refused", () => {
    assert.deepEqual(m.planValueEdit(yaml, ["fatos", 3, "quebrado"], true), { why: "shape" }, "a plain string item");
    assert.deepEqual(m.planValueEdit("fatos:\n  - {name: C}\n", ["fatos", 0, "quebrado"], true), { why: "shape" }, "a flow map takes no new key");
    assert.deepEqual(m.planValueEdit(yaml, ["fatos", 9, "quebrado"], true), { why: "shape" });
    assert.deepEqual(m.planValueEdit(yaml, ["name", 0, "x"], true), { why: "shape" });
  });
});

describe("a trait's mark and a tracker's label from the sheet", () => {
  const facts = layoutOf([{ type: "traits", id: "f", properties: ["fatos"], flag: { key: "quebrado", label: { pt: "Quebrado", en: "Broken" } } }]);
  test("read-only: the mark shows on the items that carry it, no button", () => {
    const card = m.renderStatblock("fatos:\n  - name: A\n    quebrado: sim\n  - name: B\n  - Plain", undefined, { layout: facts });
    const rows = card.querySelectorAll(".statblock-trait");
    assert.ok(rows[0].classList.contains("statblock-trait-flagged"));
    assert.equal(rows[0].querySelector(".statblock-flag-mark").textContent, "Broken");
    assert.equal(card.querySelectorAll("button.statblock-flag").length, 0);
    assert.equal(rows[1].textContent, "B");
  });
  test("a refusal is said under the item, the mark unchanged", () => {
    const card = m.renderStatblock("fatos:\n  - name: A", undefined, { layout: facts, write: () => ({ ok: false, why: "readOnly" }) });
    const btn = card.querySelector("button.statblock-flag");
    assert.equal(btn.getAttribute("aria-label"), "Broken: A");
    btn.click();
    assert.equal(btn.getAttribute("aria-pressed"), "false");
    assert.match(card.querySelector(".statblock-trait .statblock-tracker-note").textContent, /read-only/);
  });
  test("a tracker labelled {key} reads the key, and hides when it is empty", () => {
    const layout = layoutOf([{ type: "tracker", id: "r", properties: ["r_nome"], label: "{r_nome}", hideWhenEmpty: true, current: "r_atual", max: "r_total", style: "boxes" }]);
    const card = m.renderStatblock("r_nome: Vida\nr_atual: 2\nr_total: 3", undefined, { layout, write: () => ({ ok: true }) });
    assert.match(card.querySelector(".statblock-tracker").textContent, /^Vida.*2\/3/);
    assert.equal(card.querySelector(".statblock-box").getAttribute("aria-label"), "Vida: mark 1 of 3");
    assert.equal(m.renderStatblock("r_atual: 2\nr_total: 3", undefined, { layout }).querySelector(".statblock-tracker"), null);
  });
});

describe("a marked list of links (Fractal obstacles)", () => {
  const layout = layoutOf([{ type: "traits", id: "o", properties: ["obstaculos"], label: "Obstáculos", flag: { key: "quebrado", label: "Quebrado", count: "{n} de {m} quebrados" } }]);
  const yaml = 'obstaculos:\n  - nome: "[[Horda de Orcs]]"\n    quebrado: true\n  - "[[Torre]]"\n  - nome: Ponte\n';
  test("a mapping with nome carries the mark and its link; a plain string keeps its link, no mark", () => {
    const card = m.renderStatblock(yaml, undefined, { layout, write: () => ({ ok: true }) });
    const rows = card.querySelectorAll(".statblock-trait");
    assert.equal(rows[0].querySelector("a.wikilink").dataset.target, "Horda de Orcs");
    assert.equal(rows[0].querySelector("button.statblock-flag").getAttribute("aria-pressed"), "true");
    assert.ok(rows[0].classList.contains("statblock-trait-flagged"));
    assert.equal(rows[0].textContent.includes("nome"), false, "the key is not shown as a name");
    assert.equal(rows[1].querySelector("a.wikilink").dataset.target, "Torre");
    assert.equal(rows[1].querySelector("button.statblock-flag"), null);
    assert.equal(rows[2].querySelector("button.statblock-flag").getAttribute("aria-pressed"), "false");
    assert.equal(card.querySelector(".statblock-flag-count").textContent, "1 de 2 quebrados", "only items that can carry it are counted");
  });
  test("the mark of a link item writes back in place, or under it", () => {
    const apply = (doc, plan) => m.EditorState.create({ doc }).update({ changes: plan }).state.doc.toString();
    assert.equal(apply(yaml, m.planValueEdit(yaml, ["obstaculos", 0, "quebrado"], false)), yaml.replace("quebrado: true", "quebrado: false"));
    assert.equal(apply(yaml, m.planValueEdit(yaml, ["obstaculos", 2, "quebrado"], true)), yaml.replace("  - nome: Ponte\n", "  - nome: Ponte\n    quebrado: true\n"));
    assert.deepEqual(m.planValueEdit(yaml, ["obstaculos", 1, "quebrado"], true), { why: "shape" });
  });
});
