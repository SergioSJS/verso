// The dice composer's model (ADR 0107, the dice composer, 2026-10-23): a
// port of Rolai's composer tests (apps/web/src/__tests__/composer.test.ts),
// less the cards and the slot blocks Verso does not read. Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

await esbuild.build({
  stdin: { contents: `export * from "./src/table/composer"; export { readNotation } from "./src/dice/notation";`, resolveDir: ".", loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/composer.test-bundle.mjs",
  logLevel: "error",
});
const m = await import("./.bundles/composer.test-bundle.mjs");
const six = { terms: [{ count: 1, sides: 6 }], modifier: 0 };

test("toNotation: a simple pool, a mixed pool, the modifier, no modifier at zero", () => {
  assert.equal(m.toNotation({ terms: [{ count: 3, sides: 6 }], modifier: 0 }), "3d6");
  assert.equal(m.toNotation({ terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }], modifier: 0 }), "2d6+1d4");
  assert.equal(m.toNotation({ terms: [{ count: 1, sides: 20 }], modifier: 2 }), "1d20+2");
  assert.equal(m.toNotation({ terms: [{ count: 1, sides: 20 }], modifier: -1 }), "1d20-1");
  assert.equal(m.toNotation(m.EMPTY_COMPOSER), "");
});

test("toNotation and fromNotation round-trip", () => {
  const state = { terms: [{ count: 5, sides: 10 }, { count: 1, sides: 4 }], modifier: -3 };
  assert.deepEqual(m.fromNotation(m.toNotation(state)), state);
  for (const kind of m.COMPOSER_DICE) {
    const s = m.addDie(m.addDie(m.EMPTY_COMPOSER, kind), kind);
    assert.deepEqual(m.fromNotation(m.toNotation(s)), s);
  }
});

test("fromNotation: simple, mixed, empty", () => {
  assert.deepEqual(m.fromNotation("2d6+3"), { terms: [{ count: 2, sides: 6 }], modifier: 3 });
  assert.deepEqual(m.fromNotation("2d6+1d4"), { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 4 }], modifier: 0 });
  assert.deepEqual(m.fromNotation(""), { terms: [], modifier: 0 });
  assert.deepEqual(m.fromNotation("   "), { terms: [], modifier: 0 });
});

test("fromNotation is null for what the composer does not show", () => {
  for (const text of ["4d6kh3", "2d6!r<2", "{1d6} vs {2d10}", "1d20-1d4", "banana", "1d6!", "4d6kh2", "3d6dl1", "1dFkh1", "2c"]) {
    assert.equal(m.fromNotation(text), null, text);
  }
});

test("addDie: the same kind adds to the term, another kind makes a term", () => {
  let s = m.addDie(six, 6);
  s = m.addDie(s, 6);
  assert.equal(m.toNotation(s), "3d6");
  s = m.addDie(m.addDie(six, 6), 4);
  assert.equal(m.toNotation(s), "2d6+1d4");
  assert.equal(m.toNotation(m.addDie(s, 20)), "2d6+1d4+1d20");
});

test("addDie respects the most dice, summed over the terms", () => {
  const s = { terms: [{ count: m.MAX_COMPOSER_COUNT - 1, sides: 6 }, { count: 1, sides: 4 }], modifier: 0 };
  assert.equal(m.totalDice(s), m.MAX_COMPOSER_COUNT);
  assert.equal(m.totalDice(m.addDie(s, 6)), m.MAX_COMPOSER_COUNT);
});

test("every pool the buttons can make is a notation Verso rolls", () => {
  let s = m.EMPTY_COMPOSER;
  for (const kind of m.COMPOSER_DICE) s = m.addDie(s, kind);
  s = m.adjustModifier(s, -7);
  assert.ok(m.readNotation(m.toNotation(s)), m.toNotation(s));
  let full = m.EMPTY_COMPOSER;
  for (let i = 0; i < 150; i++) full = m.addDie(full, 6);
  assert.ok(m.readNotation(m.toNotation(full)));
});

test("the dice offered: Rolai's, without the card", () => {
  assert.deepEqual([...m.COMPOSER_DICE], [2, 3, 4, 6, 8, 10, 12, 20, 66, 100, "F"]);
});

test("removeDie: one off, the term gone at zero, a kind not in the pool ignored", () => {
  let s = m.fromNotation("2d6+1d4");
  s = m.removeDie(s, 4);
  assert.equal(m.toNotation(s), "2d6");
  s = m.removeDie(s, 6);
  assert.equal(m.toNotation(s), "1d6");
  s = m.removeDie(s, 6);
  assert.deepEqual(s.terms, []);
  assert.equal(m.toNotation(s), "");
  assert.equal(m.toNotation(m.removeDie(m.fromNotation("2d6"), 20)), "2d6");
});

test("the Fudge die is its own kind, not a d3", () => {
  const s = m.addDie(m.addDie(m.EMPTY_COMPOSER, "F"), "F");
  assert.equal(m.toNotation(s), "2dF");
  assert.deepEqual(m.fromNotation("4dF+2"), { terms: [{ count: 4, sides: 3, fudge: true }], modifier: 2 });
  let mixed = m.addDie(m.addDie(m.EMPTY_COMPOSER, "F"), 6);
  assert.equal(m.toNotation(mixed), "1dF+1d6");
  assert.equal(m.toNotation(m.removeDie(mixed, "F")), "1d6");
  mixed = m.addDie(mixed, 3);
  assert.equal(m.toNotation(mixed), "1dF+1d6+1d3");
});

test("removeTerm takes the whole kind, keeping the others and the modifier", () => {
  assert.equal(m.toNotation(m.removeTerm(m.fromNotation("3d6+1d4+2"), 6)), "1d4+2");
});

test("adjustModifier adds and stops at the bounds; clear empties", () => {
  let s = m.adjustModifier(m.adjustModifier(six, 1), 1);
  assert.equal(s.modifier, 2);
  s = m.adjustModifier(s, -5);
  assert.equal(s.modifier, -3);
  assert.equal(m.adjustModifier(s, -m.MAX_COMPOSER_MODIFIER * 3).modifier, -m.MAX_COMPOSER_MODIFIER);
  assert.equal(m.adjustModifier(s, m.MAX_COMPOSER_MODIFIER * 3).modifier, m.MAX_COMPOSER_MODIFIER);
  assert.deepEqual(m.clearComposer(), { terms: [], modifier: 0 });
});

test("addDieToNotation: from empty, a pending operator, a notation the composer shows, one it does not", () => {
  assert.equal(m.addDieToNotation("", 6), "1d6");
  assert.equal(m.addDieToNotation("3d6 + ", 8), "3d6 + 1d8");
  assert.equal(m.addDieToNotation("3d6+", 8), "3d6+ 1d8");
  assert.equal(m.addDieToNotation("2d6", 6), "3d6");
  assert.equal(m.addDieToNotation("2d6", 4), "2d6+1d4");
  assert.equal(m.addDieToNotation("2d6+3", 4), "2d6+1d4+3");
  // Not shown by the buttons ("4d6kh3"): the pool starts again from the die clicked.
  assert.equal(m.addDieToNotation("4d6kh3", 20), "1d20");
  assert.equal(m.addDieToNotation("dF", "F"), "2dF");
});

test("removeDieFromNotation: one off; a notation the composer does not show is left as typed", () => {
  assert.equal(m.removeDieFromNotation("2d6+1d4", 4), "2d6");
  assert.equal(m.removeDieFromNotation("", 4), "");
  assert.equal(m.removeDieFromNotation("4d6kh3", 6), "4d6kh3");
});

test("the example of the brief: d6, d6, d20, then a modifier", () => {
  let n = m.addDieToNotation("", 6);
  n = m.addDieToNotation(n, 6);
  n = m.addDieToNotation(n, 20);
  assert.equal(n, "2d6+1d20");
  const s = m.adjustModifier(m.fromNotation(n), 2);
  assert.equal(m.toNotation(s), "2d6+1d20+2");
});

test("KH / KL as Foundry's Dice Tray does it: one more die and keep one; again undoes; the other switches", () => {
  const d20 = { terms: [{ count: 1, sides: 20 }], modifier: 3 };
  const kh = m.toggleKeep(d20, "kh");
  assert.equal(m.toNotation(kh), "2d20kh1+3");
  assert.equal(m.keepOf(kh), "kh");
  const kl = m.toggleKeep(kh, "kl");
  assert.equal(m.toNotation(kl), "2d20kl1+3");
  assert.equal(m.keepOf(kl), "kl");
  assert.equal(m.toNotation(m.toggleKeep(kl, "kl")), "1d20+3");
  assert.equal(m.keepOf(m.toggleKeep(kl, "kl")), null);
  // Never more than two dice when adding: 3d20 becomes 2d20kh1; and 3d20kh1 undone keeps its three.
  assert.equal(m.toNotation(m.toggleKeep({ terms: [{ count: 3, sides: 20 }], modifier: 0 }, "kh")), "2d20kh1");
  assert.equal(m.toNotation(m.toggleKeep({ terms: [{ count: 3, sides: 20, keep: "kh" }], modifier: 0 }, "kh")), "3d20");
  // No dice: nothing; the Fudge die is left alone.
  assert.deepEqual(m.toggleKeep(m.EMPTY_COMPOSER, "kh"), m.EMPTY_COMPOSER);
  assert.equal(m.toNotation(m.toggleKeep({ terms: [{ count: 2, sides: 3, fudge: true }], modifier: 0 }, "kh")), "2dF");
});

test("what KH / KL write is what Verso reads, and the model reads it back", () => {
  for (const text of ["2d20kh1", "2d20kl1+3", "3d20kh1", "2d6kh1+1d4"]) {
    assert.equal(m.readNotation(text), text, text);
    assert.equal(m.toNotation(m.fromNotation(text)), text, text);
  }
  assert.equal(m.readNotation("2d20kh"), null);
});

test("removing a die from a kept term drops the keep at one die", () => {
  const s = m.removeDie(m.fromNotation("2d20kh1+3"), 20);
  assert.equal(m.toNotation(s), "1d20+3");
});

test("the roll line of the message field: /r and its formula; the lines after it are kept", () => {
  assert.deepEqual(m.parseRollLine("/r 2d6+3"), { prefix: "/r", formula: "2d6+3", rest: "" });
  assert.deepEqual(m.parseRollLine("/roll 1d20\nolá"), { prefix: "/roll", formula: "1d20", rest: "\nolá" });
  assert.deepEqual(m.parseRollLine("/r"), { prefix: "/r", formula: "", rest: "" });
  assert.equal(m.parseRollLine("olá /r 1d6"), null);
  assert.equal(m.parseRollLine("/rolar 1d6"), null);
  assert.equal(m.withFormula("", "1d6"), "/r 1d6");
  assert.equal(m.withFormula("/roll 1d6\nolá", "2d6"), "/roll 2d6\nolá");
  assert.equal(m.withFormula("/r 1d6", ""), "");
  assert.equal(m.withFormula("/r 1d6\nolá", ""), "/r\nolá");
});
