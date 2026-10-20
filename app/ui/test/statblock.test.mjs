// Statblock layouts (ADR 0099 item 3): the model's validator against the
// hostile and the odd — it never throws, lists what it left out, refuses
// patterns that backtrack without end, keys named like the prototype's, the
// huge — and the Fantasy Statblocks import, every code field dropped and
// named.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { validateLayout, readLabel, slugId } from "./src/statblock/validate";
export { checkPattern, MAX_SCAN, PROBE_MS, probeTime, probesFor, tooSlow } from "./src/statblock/regexGuard";
export { modifierOf, checkExpression, signed } from "./src/statblock/modifier";
export { diceIn, D20_RULES, PLAIN_RULES, beginDiceBudget, endDiceBudget } from "./src/statblock/dice";
export { importLayout, exportLayout } from "./src/statblock/fsInterop";
export { builtinLayouts, builtinProblems } from "./src/statblock/builtin";
export { readSheet, textOf, numberOf } from "./src/statblock/sheet";
export { setStatblockLang } from "./src/statblock/strings";
export { LIMITS } from "./src/statblock/model";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/statblock.test-bundle.mjs",
  logLevel: "error",
  external: ["yaml", "@tauri-apps/*"],
});
const m = await import("./.bundles/statblock.test-bundle.mjs");

beforeEach(() => m.setStatblockLang("en"));

describe("the validator never throws and says what it left out", () => {
  test("anything that is not a map is no layout, with a problem", () => {
    for (const v of [null, undefined, 3, "x", [], true]) {
      const r = m.validateLayout(v);
      assert.equal(r.layout, null);
      assert.equal(r.problems.length, 1);
    }
  });

  test("an empty map is a layout with defaults and a missing name", () => {
    const r = m.validateLayout({});
    assert.ok(r.layout);
    assert.equal(r.layout.version, 1);
    assert.equal(r.layout.columns, 1);
    assert.deepEqual(r.layout.blocks, []);
    assert.ok(r.problems.some((p) => p.path === "name"));
  });

  test("unknown block types and broken blocks are left out, each with its path", () => {
    const r = m.validateLayout({ name: "L", blocks: [{ type: "javascript", code: "alert(1)" }, 7, { type: "heading", properties: ["name"] }, { type: "group", nested: [{ type: "nope" }] }] });
    assert.equal(r.layout.blocks.length, 2);
    assert.deepEqual(r.problems.map((p) => p.path), ["blocks[0]", "blocks[1]", "blocks[3].nested[0]"]);
  });

  test("keys named like the prototype's are keys; nothing is polluted", () => {
    const raw = JSON.parse('{"name":"x","__proto__":{"polluted":1},"blocks":[{"type":"property","properties":["__proto__","constructor"],"__proto__":{"x":1}},{"type":"roll","inputs":{"__proto__":{"key":"a"},"constructor":{"value":2}}}]}');
    const r = m.validateLayout(raw);
    assert.deepEqual(r.layout.blocks[0].properties, ["__proto__", "constructor"]);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.x, undefined);
    // Own keys of a map with no prototype: inert.
    assert.equal(Object.getPrototypeOf(r.layout.blocks[1].inputs), null);
    assert.deepEqual(r.layout.blocks[1].inputs.constructor, { value: 2 });
  });

  test("a huge layout is cut at its bounds, said once", () => {
    const blocks = Array.from({ length: 5000 }, () => ({ type: "text", text: "x".repeat(10_000) }));
    const r = m.validateLayout({ name: "big", blocks });
    assert.equal(r.layout.blocks.length, m.LIMITS.blocks);
    assert.equal(r.layout.blocks[0].text.en.length, m.LIMITS.text);
    assert.equal(r.problems.filter((p) => p.message.includes("too many")).length, 1);
  });

  test("deep nesting stops at the depth bound", () => {
    let b = { type: "text", text: "leaf" };
    for (let i = 0; i < 50; i++) b = { type: "group", nested: [b] };
    const r = m.validateLayout({ name: "deep", blocks: [b] });
    assert.ok(r.problems.some((p) => /deep/.test(p.message)));
  });

  test("appearance takes checked colours and the app's fonts, never CSS", () => {
    const r = m.validateLayout({ name: "a", appearance: { light: { accent: "#7a200d", background: "red; background: url(x)", "--x": "#fff" }, dark: { text: "#abc" }, headingFont: "Comic Sans", bodyFont: "book" } });
    assert.deepEqual(r.layout.appearance, { light: { accent: "#7a200d" }, dark: { text: "#abc" }, bodyFont: "book" });
    assert.equal(r.problems.length, 3);
  });

  test("labels in two languages, a string for both", () => {
    assert.deepEqual(m.readLabel("HP"), { pt: "HP", en: "HP" });
    assert.deepEqual(m.readLabel({ pt: "Vida" }), { pt: "Vida" });
    assert.equal(m.readLabel({ fr: "x" }), undefined);
  });

  test("a layout id follows the folder's file names, or one is made from the name", () => {
    assert.equal(m.validateLayout({ name: "Ação Rápida!" }).layout.id, "acao-rapida");
    const bad = m.validateLayout({ id: "../../etc", name: "N" });
    assert.equal(bad.layout.id, "n");
    assert.ok(bad.problems.some((p) => p.path === "id"));
    assert.equal(m.validateLayout({ name: "N" }, "from-file").layout.id, "from-file");
  });

  test("a roll block names a known profile; a tracker needs its keys", () => {
    const r = m.validateLayout({ name: "r", profile: "nope", blocks: [{ type: "roll", profile: "fractal", inputs: { fatos_aplicaveis: { key: "facts" } } }, { type: "tracker", max: 3 }, { type: "tracker", current: "hp", max: "hp_max", style: "number" }] });
    assert.equal(r.layout.profile, undefined);
    assert.equal(r.layout.blocks.length, 2);
    assert.equal(r.layout.blocks[0].profile, "fractal");
    assert.deepEqual(r.layout.blocks[0].inputs.fatos_aplicaveis, { key: "facts" });
    assert.equal(r.layout.blocks[1].style, "number");
  });

  test("a conditional keeps branches whose test reads", () => {
    const r = m.validateLayout({ name: "c", blocks: [{ type: "conditional", branches: [{ when: { op: "above", key: "cr", value: 5 }, nested: [{ type: "text", text: "big" }] }, { when: { op: "eval", key: "x" }, nested: [] }, { nested: [{ type: "text", text: "else" }] }] }] });
    assert.equal(r.layout.blocks[0].branches.length, 2);
  });
});

describe("dice patterns that could hang the window are refused", () => {
  test("nested quantifiers, alternation under a quantifier, back-references", () => {
    for (const [p, why] of [
      ["(a+)+$", "nested"],
      ["(a|aa)*b", "nested"],
      ["(?:x\\d+)*", "nested"],
      ["(?:a|b){2}", "nested"],
      ["(a)\\1", "backref"],
      ["(?<n>a)\\k<n>", "backref"],
      ["a*b*c*", "tooMany"],
      ["a{1,1000}", "bigCount"],
      ["x".repeat(300), "tooLong"],
      ["a*", "empty"],
      ["(", "invalid"],
      ["[", "invalid"],
    ]) {
      const r = m.checkPattern(p);
      assert.equal(r.ok, false, p);
      assert.equal(r.why, why, p);
    }
  });

  test("polynomial blow-ups are refused (review B1)", () => {
    for (const p of ["\\w+\\w+b", "a?a?a?a?a?a?a?a?a?a?\\w+\\w+b", "(?=\\w+\\w+c)\\d", "[\\s\\S]+[\\s\\S]+x"]) {
      const r = m.checkPattern(p);
      assert.equal(r.ok, false, p);
      assert.equal(r.why, "tooMany", p);
    }
  });

  test("the timed probe refuses a slow pattern with one unbounded quantifier", () => {
    // One `+`, twelve optional atoms: the shape passes, the clock does not.
    const p = "a?a?a?a?a?a?a?a?a?a?a?\\w+b";
    assert.equal(m.checkPattern(p).ok, false);
    assert.equal(m.checkPattern(p).why, "slow");
    assert.ok(m.probesFor(p).every((x) => x.length === m.MAX_SCAN));
  });

  test("every probe of every built-in rule runs well under the bound", () => {
    for (const l of m.builtinLayouts()) for (const r of l.diceRules) {
      const c = m.checkPattern(r.pattern);
      assert.equal(c.ok, true, r.pattern);
      assert.ok(!m.tooSlow(c.re), r.pattern);
    }
  });

  test("the verdict is cached by pattern", () => {
    assert.equal(m.checkPattern("\\d+x"), m.checkPattern("\\d+x"));
  });

  test("a card's time budget stops further matching", () => {
    m.beginDiceBudget(-1);
    const out = m.diceIn("2d6", m.PLAIN_RULES);
    assert.equal(m.endDiceBudget(), true);
    assert.deepEqual(out, [{ text: "2d6" }]);
    m.beginDiceBudget();
    assert.equal(m.diceIn("2d6", m.PLAIN_RULES).length, 1);
    assert.equal(m.endDiceBudget(), false);
  });

  test("the default rules pass", () => {
    for (const r of [...m.D20_RULES, ...m.PLAIN_RULES]) assert.equal(m.checkPattern(r.pattern).ok, true, r.pattern);
  });

  test("a hostile text against the defaults finishes fast", () => {
    const text = "1".repeat(m.MAX_SCAN - 1) + "d";
    const t0 = Date.now();
    m.diceIn(text, m.D20_RULES);
    m.diceIn("+".repeat(m.MAX_SCAN - 1), m.D20_RULES);
    m.diceIn(" (".repeat(m.MAX_SCAN / 2 - 1), m.D20_RULES);
    assert.ok(Date.now() - t0 < 500);
  });

  test("past the scan bound a text is words", () => {
    const long = "2d6 ".repeat(m.MAX_SCAN);
    assert.equal(m.diceIn(long, m.D20_RULES).length, 1);
  });
});

describe("dice in a text", () => {
  test("the plugin's three cases, and plain dice", () => {
    const pieces = m.diceIn("Melee Weapon Attack: +15 to hit. Hit: 19 (2d10 + 8) piercing. Also 1d4.", m.D20_RULES);
    const dice = pieces.filter((p) => p.notation).map((p) => [p.text, p.notation]);
    assert.deepEqual(dice, [["+15 to hit", "1d20+15"], ["19 (2d10 + 8)", "2d10+8"], ["1d4", "1d4"]]);
    assert.deepEqual(m.diceIn("Dexterity +9", m.D20_RULES).filter((p) => p.notation).map((p) => p.notation), ["1d20+9"]);
  });

  test("a bonus in brackets is one piece, brackets and all; a zero bonus rolls the bare die", () => {
    const pieces = m.diceIn("Perception (+5), Stealth (+0), Hit: 4 (1d4 + 2), and (2d6) fire.", m.D20_RULES);
    assert.deepEqual(pieces.filter((p) => p.notation).map((p) => [p.text, p.notation]), [["(+5)", "1d20+5"], ["(+0)", "1d20"], ["4 (1d4 + 2)", "1d4+2"], ["2d6", "2d6"]]);
    // Nothing is lost or moved: the pieces are the text, in order.
    assert.equal(pieces.map((p) => p.text).join(""), "Perception (+5), Stealth (+0), Hit: 4 (1d4 + 2), and (2d6) fire.");
    assert.deepEqual(m.diceIn("+0 to hit", m.D20_RULES).filter((p) => p.notation).map((p) => p.notation), ["1d20"]);
    assert.deepEqual(m.diceIn("-2 to hit", m.D20_RULES).filter((p) => p.notation).map((p) => p.notation), ["1d20-2"]);
  });

  test("a layout of no system rolls only dice written as dice", () => {
    assert.deepEqual(m.diceIn("Fear +2, 2d6 harm", m.PLAIN_RULES).filter((p) => p.notation).map((p) => p.notation), ["2d6"]);
  });

  test("a template that makes no notation leaves the text", () => {
    assert.deepEqual(m.diceIn("9999d9999", m.PLAIN_RULES), [{ text: "9999d9999" }]);
  });
});

describe("a table's modifier, without eval", () => {
  test("the closed list", () => {
    assert.equal(m.modifierOf({ kind: "d20" }, 15), 2);
    assert.equal(m.modifierOf({ kind: "d20" }, 9), -1);
    assert.equal(m.modifierOf({ kind: "none" }, 15), null);
  });

  test("an expression of Rolai's evaluator, floored, with the sheet's numbers", () => {
    assert.equal(m.modifierOf({ kind: "expression", expression: "(score - 10) / 2" }, 15), 2);
    assert.equal(m.modifierOf({ kind: "expression", expression: "(stat - 10) / 2" }, 7), -2);
    assert.equal(m.modifierOf({ kind: "expression", expression: "score / 10" }, 47), 4);
    assert.equal(m.modifierOf({ kind: "expression", expression: "score + level" }, 3, { level: 2 }), 5);
  });

  test("code is not an expression; out of bounds is no modifier", () => {
    for (const e of ["alert(1)", "Math.floor(score)", "score; process.exit()", "'x'", "constructor.constructor"]) assert.notEqual(m.checkExpression(e), null, e);
    assert.equal(m.modifierOf({ kind: "expression", expression: "score * 100000" }, 50), null);
    assert.equal(m.modifierOf({ kind: "expression", expression: "score / 0" }, 5), null);
    assert.equal(m.modifierOf({ kind: "expression", expression: "missing + 1" }, 5), null);
  });
});

describe("a Fantasy Statblocks layout imports, its code dropped and named", () => {
  const fs = {
    id: "Xa9_nanoid",
    name: "Homebrew (5e)",
    columns: 2,
    columnWidth: 400,
    forceColumns: true,
    diceParsing: [
      { id: "a", regex: "([\\+\\-])(\\d+) to hit", parser: "let [, sign, number] = matches; return ...", desc: "+10 to hit" },
      { id: "b", regex: "(\\w+)!", parser: "return {text: '1d6'}", desc: "custom" },
    ],
    cssProperties: { primaryColor: "#112233", fontSize: "14px", obsidian: { primaryColor: "#ddeeff" } },
    blocks: [
      { type: "heading", id: "h", properties: ["name"], conditioned: true, size: 1 },
      { type: "property", id: "p", properties: ["cr"], display: "Challenge", callback: "return monster.cr + ' XP'" },
      { type: "property", id: "hp", properties: ["hp"], display: "Hit Points", dice: true, diceProperty: "hit_dice", diceCallback: "return [{ text: monster.hit_dice }]" },
      { type: "table", id: "t", properties: ["stats"], headers: ["Str", "Dex"], calculate: true, modifier: "Math.floor(stat/3)" },
      { type: "javascript", id: "js", properties: [], code: "return document.createElement('script')" },
      { type: "action", id: "act", properties: [], icon: "sword", callback: "InitiativeTracker.newEncounter()" },
      { type: "layout", id: "lay", properties: [], layout: "other" },
      { type: "ifelse", id: "ie", properties: [], conditions: [{ condition: "return monster.cr > 5", nested: [{ type: "text", properties: ["a"] }] }, { condition: "", nested: [{ type: "text", properties: ["b"] }] }] },
      { type: "spells", id: "sp", properties: ["spells"] },
      { type: "inline", id: "in", properties: [], nested: [{ type: "image", id: "img", properties: ["image"] }] },
    ],
  };

  test("the blocks map, the code fields are listed", () => {
    const r = m.importLayout(JSON.stringify(fs));
    assert.ok(r.layout, JSON.stringify(r));
    assert.equal(r.layout.id, "homebrew-5e");
    assert.deepEqual(r.layout.blocks.map((b) => b.type), ["heading", "property", "property", "table", "group", "traits", "inline"]);
    assert.equal(r.layout.blocks[0].hideWhenEmpty, true);
    assert.deepEqual(r.layout.blocks[1].label, { pt: "Challenge", en: "Challenge" });
    assert.equal(r.layout.blocks[2].diceKey, "hit_dice");
    assert.deepEqual(r.layout.blocks[3].modifier, { kind: "none" });
    assert.equal(r.layout.blocks[4].nested[0].properties[0], "b");
    const dropped = r.dropped.join("\n");
    for (const what of ["callback", "diceCallback", "modifier", "javascript", "action", "embedded layout", "conditions", "parser .custom."]) assert.match(dropped, new RegExp(what), what);
    assert.equal(r.dropped.length, 8);
  });

  test("a default dice pattern becomes Verso's rule; colours map, the rest is said", () => {
    const r = m.importLayout(JSON.stringify(fs));
    assert.deepEqual(r.layout.diceRules, [m.D20_RULES[0]]);
    assert.deepEqual(r.layout.appearance, { light: { accent: "#112233" }, dark: { accent: "#ddeeff" } });
    assert.ok(r.converted.some((c) => /cssProperties/.test(c)));
    assert.ok(r.converted.some((c) => /spells/.test(c)));
  });

  test("nothing of the import is ever a function or code in the result", () => {
    const r = m.importLayout(JSON.stringify(fs));
    const text = m.exportLayout(r.layout);
    for (const w of ["callback", "javascript", "InitiativeTracker", "Math.floor", "document.", "parser"]) assert.ok(!text.includes(w), w);
  });

  test("Verso's own JSON round-trips", () => {
    const built = m.builtinLayouts()[0];
    const r = m.importLayout(m.exportLayout(built));
    assert.deepEqual(r.layout, built);
    assert.deepEqual(r.dropped, []);
  });

  test("not a layout, not JSON, too big: said, not thrown", () => {
    assert.ok(m.importLayout("{").error);
    assert.ok(m.importLayout('{"name":"x"}').error);
    assert.ok(m.importLayout("[]").error);
    assert.ok(m.importLayout(" ".repeat(300 * 1024)).error);
  });
});

describe("the built-in layouts", () => {
  test("each validates with no problem", () => {
    for (const b of m.builtinProblems()) assert.deepEqual(b.problems, [], b.id);
    // The two generic ones come first, in this order; the systems follow
    // (statblockBuiltin.test.mjs).
    assert.deepEqual(m.builtinLayouts().slice(0, 2).map((l) => l.id), ["d20-creature", "facts-trackers"]);
  });

  test("each has both languages on every label", () => {
    const walk = (blocks) => {
      for (const b of blocks) {
        if (b.label) assert.ok(b.label.pt && b.label.en, b.id);
        for (const h of b.headers ?? []) assert.ok(h.pt && h.en, b.id);
        if (b.nested) walk(b.nested);
      }
    };
    for (const l of m.builtinLayouts()) {
      assert.ok(l.name.pt && l.name.en && l.description.pt && l.description.en, l.id);
      walk(l.blocks);
    }
  });
});

describe("a sheet is read safely", () => {
  test("prototype keys stay keys; a wikilink list is the link", () => {
    const r = m.readSheet("__proto__: 1\nconstructor: x\nimage: [[a.png]]\n");
    assert.equal(r.ok, true);
    assert.equal(r.sheet["__proto__"], 1);
    assert.equal(r.sheet.image, "[[a.png]]");
    assert.equal({}.constructor, Object);
  });

  test("loose YAML with a colon in a value reads", () => {
    const r = m.readSheet("actions:\n  - name: Bite\n    desc: Melee Weapon Attack: +4 to hit\n");
    assert.equal(r.ok, true);
    assert.equal(r.sheet.actions[0].desc, "Melee Weapon Attack: +4 to hit");
  });

  test("too big, not YAML, not a map", () => {
    assert.deepEqual(m.readSheet("a: 1\n".repeat(60_000)), { ok: false, why: "tooBig" });
    assert.equal(m.readSheet("a: [1, 2\nb: {").ok, false);
    assert.deepEqual(m.readSheet("- 1\n- 2"), { ok: false, why: "notMap" });
  });

  test("aliases are bounded", () => {
    const bomb = 'a: &a ["x","x","x","x","x","x","x","x","x"]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d]\n';
    const r = m.readSheet(bomb);
    assert.equal(r.ok, false);
  });
});

describe("a printed modifier table (bands)", () => {
  const dw = { kind: "bands", bands: [[1, 3, -3], [4, 5, -2], [6, 8, -1], [9, 12, 0], [13, 15, 1], [16, 17, 2], [18, 18, 3]].map(([min, max, value]) => ({ min, max, value })) };
  test("the row a score falls in; none outside every row", () => {
    assert.deepEqual([1, 3, 4, 8, 9, 12, 13, 16, 17, 18].map((n) => m.modifierOf(dw, n)), [-3, -3, -2, -1, 0, 0, 1, 2, 2, 3]);
    assert.equal(m.modifierOf(dw, 19), null);
    assert.equal(m.modifierOf(dw, 0), null);
  });
  test("rows are checked: whole numbers, min not past max, bounded", () => {
    const v = m.validateLayout({ name: "b", blocks: [{ type: "table", properties: ["s"], modifier: { kind: "bands", bands: [{ min: 1, max: 3, value: -3 }, { min: 5, max: 4, value: 0 }, { min: 1.5, max: 2, value: 0 }, "x", { min: 1, max: 2, value: 5000 }] } }] });
    assert.deepEqual(v.layout.blocks[0].modifier, { kind: "bands", bands: [{ min: 1, max: 3, value: -3 }] });
    assert.equal(v.problems.length, 4);
    const many = m.validateLayout({ name: "b", blocks: [{ type: "table", properties: ["s"], modifier: { kind: "bands", bands: Array.from({ length: 100 }, (_, i) => ({ min: i, max: i, value: 0 })) } }] });
    assert.equal(many.layout.blocks[0].modifier.bands.length, m.LIMITS.bands);
  });
  test("Dungeon World's and Old Dragon's tables are the sources' (statblock-sources.md)", () => {
    const table = (id) => m.builtinLayouts().find((l) => l.id === id).blocks.find((b) => b.type === "table").modifier;
    assert.deepEqual(table("dungeon-world-character"), dw);
    const od = table("old-dragon-character");
    assert.deepEqual([2, 3, 4, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => m.modifierOf(od, n)), [-3, -3, -2, -1, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("a traits list's mark", () => {
  test("a flag names a key; a bad one is said and dropped", () => {
    const v = m.validateLayout({ name: "f", blocks: [{ type: "traits", properties: ["fatos"], flag: { key: "quebrado", label: "Broken" } }, { type: "traits", properties: ["x"], flag: { key: "" } }] });
    assert.deepEqual(v.layout.blocks[0].flag, { key: "quebrado", label: { pt: "Broken", en: "Broken" } });
    assert.equal(v.layout.blocks[1].flag, undefined);
    assert.equal(v.problems.length, 1);
  });
});
