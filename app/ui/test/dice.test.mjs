// Dice and random tables (ADR 0088): the notation Verso reads — what
// Rolai's parser reads that the Dice Roller README documents with the same
// meaning — the roll's breakdown, a die with no modulo bias, and Markdown
// tables and lists as random tables.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: {
    contents: `export { readCode, readNotation, readSource, rollHere, occurrenceOf } from "./src/dice/notation";
export { readTable, rowOf, hitsOf } from "./src/dice/table";
export { rollDie } from "./src/dice/rolai/rng";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/dice.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const { occurrenceOf, readCode, readNotation, readSource, rollHere, readTable, rowOf, hitsOf, rollDie } = await import("./.bundles/dice.test-bundle.mjs");

test("the forms both read are read, spaces removed", () => {
  assert.deepEqual(readCode("dice: 1d20+3"), { kind: "roll", notation: "1d20+3" });
  assert.deepEqual(readCode("`dice: 3d4 + 3`"), { kind: "roll", notation: "3d4+3" });
  for (const n of ["d6", "1d12+1d10+5", "2d6-1d4-2", "4d6kh3", "2d20kl1", "4d6dl1", "4d6dh1", "4dF", "dF+1", "100d1000"]) {
    assert.equal(readNotation(n), n, n);
  }
});

test("a form only one of the two reads stays code (item 1)", () => {
  for (const n of [
    "", "3", "3+1d6", "-1d6", "1d20*2", "(1d6)", "2^1d4", "1d", "2d6!!", "1d6r", "4dF!", "1d6kh1!", "1d%%", "1d%6",
    "4d6!r<2", "1d20adv", "1d20dis", "2c", "[2d6]", "{2d6}", "1d6 vs 1d6", "2d20k", "2d20kh", "4d6kh3kh2",
    "4d6+3kh3", "1d[3,5]", "1dS", "4df", "2D6", "1d20>10", "0d6", "101d6", "1d1", "1d1001", "1d6|avg", "1d6+",
    "50d6+51d6", "1d6+".repeat(30), "1d6+12345678",
  ]) {
    assert.equal(readNotation(n), null, JSON.stringify(n));
  }
  assert.equal(readCode("dice-mod: 1d6"), null);
  assert.equal(readCode("dice+: 1d6"), null);
  assert.equal(readCode("dados: 1d6"), null);
  assert.equal(readCode("1d6"), null);
});

test("a link to a block is a table; any other link stays code", () => {
  assert.deepEqual(readCode("dice: [[Tabelas#^encontros]]"), { kind: "table", source: "[[Tabelas#^encontros]]", note: "Tabelas", id: "encontros" });
  assert.deepEqual(readSource("[[Tabelas^encontros]]"), { note: "Tabelas", id: "encontros" });
  assert.deepEqual(readSource("[[#^aqui]]"), { note: "", id: "aqui" });
  for (const s of ["[[Tabelas]]", "[[Tabelas#Encontros]]", "[[Tabelas#^e|alias]]", "[[a#b#^c]]"]) {
    assert.equal(readSource(s), null, s);
  }
  assert.equal(readCode("dice: 3d[[Tabelas^e]]"), null);
  assert.equal(readCode("dice: [[Tabelas^e]]|Header 2"), null);
});

test("explode and percentile, as the README writes them (D1, answered 2026-10-14)", () => {
  for (const n of ["1d%", "d%", "2d%+5", "2d6!", "d6!", "4d6!kh3", "1d20!+1d4", "1d%!"]) {
    assert.equal(readNotation(n), n, n);
  }
  assert.deepEqual(readCode("dice: 1d6!"), { kind: "roll", notation: "1d6!" });
});

/** Draws in order, as 32-bit values. */
const draws = (...values) => {
  let i = 0;
  return () => values[i++] / 2 ** 32;
};

test("a roll's breakdown: each term, kept and dropped, the numbers, the total", () => {
  // 2d6+1d4-1d8+3: 1,6 | 4 | 8.
  const r = rollHere("2d6+1d4-1d8+3", null, draws(0, 5, 3, 7));
  assert.deepEqual(r.terms.map((t) => [t.sign, t.sides, t.kept]), [[1, 6, [1, 6]], [1, 4, [4]], [-1, 8, [8]]]);
  assert.equal(r.modifier, 3);
  assert.equal(r.total, 1 + 6 + 4 - 8 + 3);
  assert.equal(r.by, "");
  // 4d6kh3: 3,6,1,6 keeps 3,6,6 and drops the 1, as the server does.
  const k = rollHere("4d6kh3", null, draws(2, 5, 0, 5));
  assert.deepEqual([k.terms[0].kept, k.terms[0].dropped, k.total], [[3, 6, 6], [1], 15]);
  const f = rollHere("3dF", null, draws(0, 1, 2));
  assert.deepEqual([f.terms[0].fudge, f.terms[0].kept, f.total], [true, [-1, 0, 1], 0]);
  assert.equal(rollHere("1d20+3", "[[T#^x]]").source, "[[T#^x]]");
});

test("a die at its highest face explodes: one more of it, which may explode in turn, at most 100 more in a roll (D1)", () => {
  // 2d6!: 6,3; the 6 adds a 6, which adds a 1.
  const r = rollHere("2d6!", null, draws(5, 2, 5, 0));
  assert.deepEqual([r.terms[0].sides, r.terms[0].kept, r.total], [6, [6, 3, 6, 1], 16]);
  // With keep: the dice the explosion added are kept or dropped as the others.
  const k = rollHere("3d6!kh2", null, draws(5, 0, 2, 3));
  assert.deepEqual([k.terms[0].kept, k.terms[0].dropped, k.total], [[6, 4], [1, 3], 10]);
  // d% is a d100.
  const p = rollHere("d%", null, draws(99));
  assert.deepEqual([p.terms[0].sides, p.total], [100, 100]);
  // Every die at its highest: 100 more dice in the whole roll, then none.
  const top = () => (2 ** 32 - 1) / 2 ** 32;
  const all = rollHere("50d2!+50d2!", null, top);
  assert.equal(all.terms.reduce((n, t) => n + t.kept.length, 0), 200);
  assert.equal(all.total, 400);
});

test("no modulo bias: a draw past the last whole multiple of the sides is drawn again (item 7)", () => {
  const limit = Math.floor(2 ** 32 / 6) * 6;
  assert.equal(rollDie(6, draws(limit, 2 ** 32 - 1, 13)), 2);
  assert.equal(rollDie(6, draws(limit - 1)), 6);
});

test("the window's dice are uniform", () => {
  const n = 60_000;
  const seen = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) seen[rollHere("1d6").total - 1]++;
  const expected = n / 6;
  const chi = seen.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  // Five degrees of freedom: past 20.5 one time in a thousand.
  assert.ok(chi < 20.5, `${seen} chi ${chi}`);
});

test("a table with a die column chooses by range; others every row alike (item 3)", () => {
  const ranged = readTable(["| d100 | Encontro |", "| --- | --- |", "| 01–50 | Nada |", "| 51-95 | [[Lobos]] |", "| 96–00 | Um dragão |", "", "^encontros"]);
  assert.equal(ranged.notation, "d100");
  assert.equal(ranged.ranged, true);
  assert.equal(rowOf(ranged, 1).text, "Nada");
  assert.equal(rowOf(ranged, 51).text, "[[Lobos]]");
  assert.equal(rowOf(ranged, 100).text, "Um dragão");
  // The README's header is read too, and a comma list of totals.
  const lookup = readTable(["| dice: 1d20 | Heading |", "| --- | --- |", "| 1-2 | Um |", "| 13,14 | Dois |"]);
  assert.equal(lookup.notation, "1d20");
  assert.equal(rowOf(lookup, 14).text, "Dois");
  assert.equal(rowOf(lookup, 7), null);
  const even = readTable(["| Header | Outra |", "| --- | --- |", "| A | 1 |", "| B | 2 |", "| C | 3 ^fim |"]);
  assert.equal(even.notation, "1d3");
  assert.equal(even.ranged, false);
  assert.equal(rowOf(even, 3).text, "C · 3");
  assert.deepEqual([...hitsOf("7", 12)], [7]);
  assert.equal(hitsOf("sete", 12), null);
});

test("a list is a random table of its top items", () => {
  const t = readTable(["- um", "  - filho", "- dois ^item", "- [ ] três", "", "^lista"]);
  assert.equal(t.notation, "1d3");
  assert.deepEqual(t.rows.map((r) => r.text), ["um", "dois", "três"]);
  assert.equal(readTable(["Um parágrafo."]), "notTable");
  assert.equal(readTable(["- só um"]), "tooFew");
  assert.equal(readTable([]), "empty");
});

test("a heard roll names the die that was clicked; an older peer's names none, and it is the first (ADR 0107)", () => {
  assert.equal(occurrenceOf({ occurrence: 1 }), 1);
  assert.equal(occurrenceOf({ occurrence: 0 }), 0);
  for (const o of [undefined, null, -1, 1.5, Number.NaN]) assert.equal(occurrenceOf({ occurrence: o }), 0, String(o));
  assert.equal(occurrenceOf(rollHere("1d20")), 0);
});
