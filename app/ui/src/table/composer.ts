// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The dice composer's model (ADR 0107, "the dice composer", 2026-10-23): a
// pool of dice and a modifier put together by buttons, shown as notation. A
// port of Rolai's composer (apps/web/src/composer.ts), the same state, the
// same limits and the same rules; the notation is the source of truth, the
// buttons only edit it. Pure: no DOM, no IO.
//
// What differs from Rolai, and why: no cards ("C"), because Verso's notation
// has none (dice/notation.ts); no slot blocks (`1[2d6]`), because they belong
// to Rolai's profiles, which Verso does not read; and a die that explodes
// (`1d6!`) is outside the composer, since Rolai's composer has no such term.

import { parseNotation } from "../dice/rolai/parser";

/** A die of the composer: its sides, or "F" for the Fudge die. */
export type DieKind = number | "F";

/** Keep the highest or the lowest die of the term (Foundry's Dice Tray KH / KL): always one die kept. */
export type Keep = "kh" | "kl";

export interface ComposerTerm {
  count: number;
  sides: number;
  fudge?: true;
  keep?: Keep;
}

export interface ComposerState {
  terms: ComposerTerm[];
  modifier: number;
}

/** Rolai's COMPOSER_DICE without the card: d2, d3, d4, d6, d8, d10, d12, d20, d66, d100, dF. */
export const COMPOSER_DICE: readonly DieKind[] = [2, 3, 4, 6, 8, 10, 12, 20, 66, 100, "F"];

/** The most dice, over all the terms: the parser's bound (dice/notation.ts DICE_MOST). */
export const MAX_COMPOSER_COUNT = 100;
export const MAX_COMPOSER_MODIFIER = 99;

/** An empty pool is a valid state: what Clear gives, and what is left when the last die goes. */
export const EMPTY_COMPOSER: ComposerState = { terms: [], modifier: 0 };

export function dieKind(term: ComposerTerm): DieKind {
  return term.fudge ? "F" : term.sides;
}

/** A kind's label: "d6", "dF". */
export function dieKindLabel(kind: DieKind): string {
  return kind === "F" ? "dF" : `d${kind}`;
}

function makeTerm(kind: DieKind, count: number): ComposerTerm {
  // The Fudge die has three faces in the parser.
  return kind === "F" ? { count, sides: 3, fudge: true } : { count, sides: kind };
}

export function totalDice(state: ComposerState): number {
  return state.terms.reduce((sum, term) => sum + term.count, 0);
}

export function termNotation(term: ComposerTerm): string {
  // Verso's reader wants the count after kh/kl (dice/notation.ts): `2d20kh1`.
  return `${term.count}${dieKindLabel(dieKind(term))}${term.keep ? `${term.keep}1` : ""}`;
}

export function toNotation(state: ComposerState): string {
  if (state.terms.length === 0) return "";
  const dice = state.terms.map(termNotation).join("+");
  if (state.modifier > 0) return `${dice}+${state.modifier}`;
  if (state.modifier < 0) return `${dice}${state.modifier}`;
  return dice;
}

/** A notation as the composer's state; null when it uses what the composer
 *  does not show (keep or drop, re-roll, explode, a subtracted die, groups,
 *  anything unreadable): then the typed text stays the source of truth. The
 *  empty string is a state: an empty pool. */
export function fromNotation(notation: string): ComposerState | null {
  const trimmed = notation.trim();
  if (trimmed === "") return { terms: [], modifier: 0 };
  let ast;
  try {
    ast = parseNotation(trimmed);
  } catch {
    return null;
  }
  if (ast.groups.length !== 1) return null;
  const group = ast.groups[0]!;
  const terms: ComposerTerm[] = [];
  for (const term of group.terms) {
    if (term.sign !== 1 || term.dice.reroll || term.dice.explode || term.dice.card) return null;
    const kd = term.dice.keepDrop;
    // Only "keep one highest / lowest" of a numbered die, which is what KH / KL write.
    if (kd && (term.dice.fudge || (kd.type !== "kh" && kd.type !== "kl") || kd.count !== 1 || term.dice.count < 2)) return null;
    const made = makeTerm(term.dice.fudge ? "F" : term.dice.sides, term.dice.count);
    if (kd) made.keep = kd.type as Keep;
    terms.push(made);
  }
  return { terms, modifier: group.dice.hasModifier ? group.dice.modifier : 0 };
}

/** A click on a die: the same kind adds one to its term; another kind makes a new term (2d6, then d4: 2d6+1d4). */
export function addDie(state: ComposerState, kind: DieKind): ComposerState {
  if (totalDice(state) >= MAX_COMPOSER_COUNT) return state;
  if (state.terms.some((t) => dieKind(t) === kind)) {
    return { ...state, terms: state.terms.map((t) => (dieKind(t) === kind ? { ...t, count: t.count + 1 } : t)) };
  }
  return { ...state, terms: [...state.terms, makeTerm(kind, 1)] };
}

/** One die of the kind off; the term goes when it reaches zero (a kept term with one die left keeps nothing). */
export function removeDie(state: ComposerState, kind: DieKind): ComposerState {
  const fix = (t: ComposerTerm): ComposerTerm => {
    if (t.keep && t.count < 2) {
      const { keep: _keep, ...rest } = t;
      return rest;
    }
    return t;
  };
  return {
    ...state,
    terms: state.terms.map((t) => (dieKind(t) === kind ? fix({ ...t, count: t.count - 1 }) : t)).filter((t) => t.count > 0),
  };
}

/** KH / KL as Foundry's Dice Tray does it (module `updateDiceKeep`), on every
 *  numbered term: a term with no keep gets one more die and keeps one (never
 *  more than two dice, "to avoid accidental super advantage"); the same button
 *  again takes it off (the extra die with it); the other button switches
 *  between highest and lowest. No dice: nothing happens. */
export function toggleKeep(state: ComposerState, keep: Keep): ComposerState {
  const terms = state.terms.map((t): ComposerTerm => {
    if (t.fudge) return t;
    if (t.keep === keep) {
      const { keep: _keep, ...rest } = t;
      return { ...rest, count: t.count > 2 ? t.count : t.count - 1 };
    }
    if (t.keep) return { ...t, keep };
    return { ...t, count: Math.min(t.count + 1, 2), keep };
  });
  return { ...state, terms };
}

/** Whether a KH or KL is on in any term. */
export function keepOf(state: ComposerState): Keep | null {
  return state.terms.find((t) => t.keep)?.keep ?? null;
}

/** The whole term of the kind off at once (the "×" of its chip). */
export function removeTerm(state: ComposerState, kind: DieKind): ComposerState {
  return { ...state, terms: state.terms.filter((t) => dieKind(t) !== kind) };
}

export function adjustModifier(state: ComposerState, delta: number): ComposerState {
  const modifier = Math.max(-MAX_COMPOSER_MODIFIER, Math.min(MAX_COMPOSER_MODIFIER, state.modifier + delta));
  return { ...state, modifier };
}

export function clearComposer(): ComposerState {
  return { terms: [], modifier: 0 };
}

/** A die added to the text: after a pending operator ("2d6 +") it is appended;
 *  for notation the composer reads, it is added to the pool; for notation it
 *  does not read ("4d6kh3"), the pool starts again from the die clicked. */
export function addDieToNotation(notation: string, kind: DieKind): string {
  const trimmed = notation.trim();
  const label = `1${dieKindLabel(kind)}`;
  if (trimmed === "") return label;
  if (/[+\-*/]\s*$/.test(trimmed)) return `${trimmed}${trimmed.endsWith(" ") ? "" : " "}${label}`;
  const state = fromNotation(trimmed);
  return state ? toNotation(addDie(state, kind)) : label;
}

/** A die taken off the text; notation the composer does not read is left as it is. */
export function removeDieFromNotation(notation: string, kind: DieKind): string {
  const trimmed = notation.trim();
  if (trimmed === "") return "";
  const state = fromNotation(trimmed);
  return state ? toNotation(removeDie(state, kind)) : trimmed;
}

/** The first line of the message field as a roll: `/r` (or `/roll`), its formula, and the text after the first line. */
export interface RollLine {
  prefix: string;
  formula: string;
  rest: string;
}

/** The field's text read as a roll line (the tray's formula lives there, as in Foundry's Dice Tray); null for a plain message. */
export function parseRollLine(value: string): RollLine | null {
  const nl = value.indexOf("\n");
  const first = nl === -1 ? value : value.slice(0, nl);
  const rest = nl === -1 ? "" : value.slice(nl);
  const m = /^(\s*\/(?:r|roll))(?:[ \t]+(.*))?$/i.exec(first);
  if (!m) return null;
  return { prefix: m[1]!.trim(), formula: (m[2] ?? "").trim(), rest };
}

/** The field's text with `formula` on its roll line (`/r` when there is none yet); an empty formula and nothing after it empties the field. */
export function withFormula(value: string, formula: string): string {
  const line = parseRollLine(value);
  const prefix = line?.prefix ?? "/r";
  const rest = line?.rest ?? "";
  if (formula === "") return rest === "" ? "" : `${prefix}${rest}`;
  return `${prefix} ${formula}${rest}`;
}
