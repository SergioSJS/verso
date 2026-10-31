// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a `dice:` code in a note rolls (ADR 0088 item 1, decided
// 2026-10-14): the Obsidian Dice Roller plugin's inline form,
// `` `dice: <notation>` ``, read where Rolai's parser reads it with the
// meaning the plugin's README gives it — checked against the README
// (github.com/javalent/dice-roller, 58b3857, 2026-10-14; public
// documentation, ADR 0009):
//
//   - terms of dice `NdM`, `dM` one die, joined by `+` and `-` with whole
//     numbers, the first term a die; the README removes spaces before it
//     reads, and so does this;
//   - keep and drop with their count: `kh2`, `kl1`, `dh1`, `dl1`;
//   - the fudge die, `dF`;
//   - the percentile die, `d%`, a d100; and a die that explodes, `!` right
//     after it (`1d6!`, `4d6!kh3`): at its highest face it adds one more of
//     it, which may explode in turn, at most 100 more dice in a roll (D1,
//     answered by the maintainer on 2026-10-14; not on `dF`).
//
// What one reads and the other does not stays code, never a different
// roll: the README's `k` and counts left out (`2d20k`), `!!`, re-roll
// (`r`), conditions, `*`, `/`, `^` and parentheses; Rolai's
// `adv`, `!r<2`, groups in brackets, `vs`, cards. And a link to a table
// or a list with an `^id`, `` `dice: [[Note#^id]]` `` — the README writes
// `[[Note^id]]`, read too — rolls one of its rows (item 3).
//
// The same notation, and the same bounds, are the server's
// (crates/verso-server/src/dice.rs), which rolls in a room (item 4).

import type { DiceRoll, DiceTermRoll } from "../bindings";
import { parseNotation } from "./rolai/parser";
import { createRollState, rollDice } from "./rolai/roller";
import type { RandomSource } from "./rolai/types";

/** The bounds: Rolai's for a term and a die, Verso's for a roll. */
export const DICE_MOST = 100;
export const SIDES_MOST = 1000;
export const TERMS_MOST = 20;
export const NOTATION_MOST = 200;
const NUMBER_MOST = 999_999;

/** What a code in a note asks for: a roll of a notation, or a row of a
 *  table (`source` as written, the note and the `^id` it names). */
export type DiceCode = { kind: "roll"; notation: string } | { kind: "table"; source: string; note: string; id: string };

/** A term of dice, its parts captured; the whole notation's shape. */
const TERM = /^(\d*)d(\d+|F|%)(!)?(?:(kh|kl|dh|dl)(\d+))?$/;
const DIE = String.raw`\d*d(?:\d+|F|%)!?(?:(?:kh|kl|dh|dl)\d+)?`;
const SHAPE = new RegExp(String.raw`^${DIE}(?:[+-](?:${DIE}|\d+))*$`);

/** The notation `raw` without its spaces, when Verso reads it; null
 *  otherwise. */
export function readNotation(raw: string): string | null {
  if (raw.length > NOTATION_MOST) return null;
  const text = raw.replace(/\s+/g, "");
  if (!SHAPE.test(text)) return null;
  const parts = text.split(/(?=[+-])/);
  if (parts.length > TERMS_MOST) return null;
  let dice = 0;
  for (const part of parts) {
    const term = part.replace(/^[+-]/, "");
    const m = TERM.exec(term);
    if (!m) {
      if (Number(term) > NUMBER_MOST || term.length > 7) return null;
      continue;
    }
    const count = m[1] === "" ? 1 : Number(m[1]);
    const sides = m[2] === "F" ? 3 : m[2] === "%" ? 100 : Number(m[2]);
    if (count < 1 || count > DICE_MOST || m[1]!.length > 7) return null;
    if (m[2] !== "F" && (sides < 2 || sides > SIDES_MOST || m[2]!.length > 7)) return null;
    if (m[2] === "F" && m[3] !== undefined) return null;
    if (m[5] !== undefined && (Number(m[5]) < 1 || m[5].length > 7)) return null;
    dice += count;
    if (dice > DICE_MOST) return null;
  }
  // Rolai's parser has the last word: what it does not read stays code.
  try {
    parseNotation(text);
  } catch {
    return null;
  }
  return text;
}

/** A link to a block: `[[Note#^id]]`, the README's `[[Note^id]]`, or the
 *  note's own (`[[#^id]]`, `[[^id]]`). No alias, heading or flag. */
export function readSource(source: string): { note: string; id: string } | null {
  const m = /^\[\[([^\]|#^\n]*)#?\^([A-Za-z0-9-]+)\]\]$/.exec(source);
  if (!m) return null;
  return { note: (m[1] ?? "").trim(), id: m[2] ?? "" };
}

/** The code's text (`dice: 1d20+3`, with or without its backticks) read:
 *  null when it is not a `dice:` code Verso rolls — then it is code. */
export function readCode(code: string): DiceCode | null {
  const text = code.replace(/^`+|`+$/g, "").trim();
  const m = /^dice:\s*(.*)$/s.exec(text);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  if (rest.startsWith("[[")) {
    const target = readSource(rest);
    return target ? { kind: "table", source: rest, ...target } : null;
  }
  const notation = readNotation(rest);
  return notation ? { kind: "roll", notation } : null;
}

/** `notation` (read by `readNotation`) rolled in this window: Rolai's
 *  roller over the platform's cryptographic generator (item 7). */
export function rollHere(notation: string, source: string | null = null, rng?: RandomSource): DiceRoll {
  const ast = parseNotation(notation);
  const group = ast.groups[0];
  if (!group || ast.groups.length !== 1) throw new Error(`not a roll Verso reads: ${notation}`);
  const state = createRollState(rng ? { rng } : {});
  const terms: DiceTermRoll[] = group.terms.map((t) => {
    const rolled = rollDice(t.dice, state);
    return { sign: t.sign, sides: t.dice.sides, fudge: t.dice.fudge === true, kept: rolled.rolls, dropped: rolled.dropped ?? [] };
  });
  const modifier = group.dice.modifier;
  const total = terms.reduce((sum, t) => sum + t.sign * t.kept.reduce((a, b) => a + b, 0), modifier);
  return { notation, source, terms, modifier, total, by: "", at: new Date().toISOString() };
}

/** The die a heard roll was made on, from the first: none said (an older
 *  window) is the first. */
export const occurrenceOf = (roll: Pick<DiceRoll, "occurrence">): number => (Number.isInteger(roll.occurrence) && (roll.occurrence ?? 0) >= 0 ? (roll.occurrence ?? 0) : 0);
