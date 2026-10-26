// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Dice in a card's text (ADR 0099 item 4): a layout's dice rules — a
// pattern and the notation it makes — find `+5 to hit`, `19 (2d10 + 8)`,
// `2d6` in a value, and each becomes a die the person rolls. The plugin
// does this with a JavaScript function per rule (`diceParsing[].parser`);
// here a template, `1d20$1`, filled with the pattern's groups. What the
// template makes is read by the dice engine's own notation reader: what it
// does not read stays text. A roll is shown, never written (ADR 0088
// item 2).

import { readNotation } from "../dice/notation";
import type { DiceRule } from "./model";
import { MAX_MATCHES, MAX_SCAN, checkPattern } from "./regexGuard";

/** The dice rules of the plugin's defaults (src/parser/dice-parsing.ts,
 *  `getDiceParsingDefaults`), as patterns and templates: a bonus to hit,
 *  the dice in brackets after an average, and a signed bonus after a name
 *  (a save, a skill). For a d20 layout. */
export const D20_RULES: DiceRule[] = [
  { pattern: String.raw`([+-]\d{1,3}) (?:to hit|para acertar)`, template: "1d20$1" },
  { pattern: String.raw`\d{1,4} ?\((\d{1,3}d\d{1,4}(?: ?[+-] ?\d{1,5})?)\)`, template: "$1" },
  { pattern: String.raw`\b(\d{0,3}d\d{1,4}(?: ?[+-] ?\d{1,5})?)\b`, template: "$1" },
  { pattern: String.raw`(?<![\w+-])([+-]\d{1,2})(?![\w%])`, template: "1d20$1" },
];

/** Dice written as dice and nothing else: for a layout of no system. */
export const PLAIN_RULES: DiceRule[] = [{ pattern: String.raw`\b(\d{0,3}d(?:\d{1,4}|%|F)(?: ?[+-] ?\d{1,5})?)\b`, template: "$1" }];

/** The time one card may spend matching dice rules. */
export const CARD_BUDGET_MS = 250;
const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
let deadline = Infinity;
let spent = false;

/** Opens a card's budget: from now, rule matching stops once `ms` pass. */
export function beginDiceBudget(ms: number = CARD_BUDGET_MS): void {
  deadline = clock() + ms;
  spent = false;
}
/** Closes the budget and says whether it ran out (the card skipped rules). */
export function endDiceBudget(): boolean {
  const out = spent;
  deadline = Infinity;
  spent = false;
  return out;
}

/** A piece of a text: words, or a die found in it. */
export type Piece = { text: string } | { text: string; notation: string };

const compiled = new Map<string, RegExp | null>();
function regexOf(pattern: string): RegExp | null {
  let re = compiled.get(pattern);
  if (re === undefined) {
    const c = checkPattern(pattern);
    re = c.ok ? c.re : null;
    if (compiled.size > 500) compiled.clear();
    compiled.set(pattern, re);
  }
  return re;
}

/** The template filled with a match's groups: `$1`…`$9`, `$&` — a sign
 *  doubled by the template made one (`1d20+$1` with `-2`), and a bonus of
 *  zero left out (`1d20+0` is `1d20`). */
export function fill(template: string, m: RegExpMatchArray): string {
  return template
    .replace(/\$(\d|&)/g, (_, g: string) => (g === "&" ? m[0] : (m[Number(g)] ?? "")))
    .replace(/\s+/g, "")
    .replace(/\+-|-\+/g, "-")
    .replace(/--/g, "+")
    .replace(/[+-]0+(?=[+-]|$)/g, "");
}

/** `text` cut into words and dice by `rules`, the first rule to match at a
 *  place winning; text past MAX_SCAN and matches past MAX_MATCHES stay
 *  words. Never throws. */
export function diceIn(text: string, rules: readonly DiceRule[]): Piece[] {
  if (!text || rules.length === 0 || text.length > MAX_SCAN) return [{ text }];
  type Hit = { from: number; to: number; notation: string; rule: number };
  const hits: Hit[] = [];
  rules.forEach((rule, ri) => {
    if (spent || clock() > deadline) {
      spent = true;
      return;
    }
    const re = regexOf(rule.pattern);
    if (!re) return;
    re.lastIndex = 0;
    let n = 0;
    for (const m of text.matchAll(re)) {
      if (++n > MAX_MATCHES) break;
      if (m[0].length === 0) continue;
      const notation = readNotation(fill(rule.template, m));
      if (notation) hits.push({ from: m.index, to: m.index + m[0].length, notation, rule: ri });
    }
  });
  hits.sort((a, b) => a.from - b.from || a.rule - b.rule);
  const out: Piece[] = [];
  let at = 0;
  let taken = 0;
  for (const h of hits) {
    if (h.from < at || taken >= MAX_MATCHES) continue;
    // A bonus in brackets, `(+5)`, is one piece with its brackets: the die
    // goes after the closing one, never between the number and it. (Dice
    // written as dice, `(2d6)`, become the die in place, brackets around.)
    const bare = text.slice(h.from, h.to).replace(/\s+/g, "") === h.notation;
    if (!bare && text[h.from - 1] === "(" && text[h.to] === ")" && h.from - 1 >= at) {
      h.from -= 1;
      h.to += 1;
    }
    if (h.from > at) out.push({ text: text.slice(at, h.from) });
    out.push({ text: text.slice(h.from, h.to), notation: h.notation });
    at = h.to;
    taken++;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
