// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A table's modifier (ADR 0099 item 3), in place of the plugin's
// `modifier`, which it runs as JavaScript: a closed list — the d20 rule,
// floor((score − 10) / 2), or none — or an expression of Rolai's restricted
// evaluator (dice/rolai/expression.ts: its own parser, no `eval`). That
// evaluator answers true or false; the modifier is the largest whole number
// m for which `(expression) >= m` holds — the expression floored — found by
// halving the bounds, so an expression never runs more than a few dozen
// times and a value out of bounds is no modifier at all. Or a printed
// table's rows (`bands`): the row the score falls in.
//
// In an expression, `score` (or `stat`, the plugin's name) is the cell's value and any other name a
// number of the sheet: `(score - 10) / 2`, `score / 10`, `score + level`.

import { evaluateExpression, parseExpression, type ExpressionScope } from "../dice/rolai/expression";
import { LIMITS, type Modifier } from "./model";

/** The bounds of a modifier. */
const LOW = -1000;
const HIGH = 1000;
const WORDS = new Set(["and", "or", "xor", "not", "count", "max", "min"]);

/** The expression as the evaluator reads it: every bare name `n` becomes
 *  `n.total`, the number a field holds. */
function rewrite(expression: string): string {
  return expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name, at: number, all: string) => {
    if (WORDS.has(name)) return name;
    const next = all.slice(at + name.length).trimStart()[0];
    const before = all[at - 1];
    if (next === "(" || next === "." || before === ".") return name;
    return `${name}.total`;
  });
}

/** Why an expression cannot be a modifier, or null when it can. Never throws. */
export function checkExpression(expression: unknown): string | null {
  if (typeof expression !== "string" || !expression.trim()) return "empty";
  if (expression.length > LIMITS.expression) return "tooLong";
  if (/'/.test(expression)) return "quote";
  // Names are the sheet's numbers: no member of one, and no call but the
  // evaluator's max and min.
  if (/[A-Za-z0-9_\])]\s*[.[]/.test(expression.replace(/\d+\.\d+/g, "0"))) return "member";
  for (const call of expression.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) if (call[1] !== "max" && call[1] !== "min") return "call";
  try {
    parseExpression(`(${rewrite(expression)}) >= 0`);
    return null;
  } catch {
    return "syntax";
  }
}

/** The modifier of `score` by `modifier`, with the sheet's numbers for an
 *  expression's other names; null when there is none. Never throws. */
export function modifierOf(modifier: Modifier, score: number, numbers: Record<string, number> = {}): number | null {
  if (!Number.isFinite(score)) return null;
  if (modifier.kind === "none") return null;
  if (modifier.kind === "d20") return Math.floor((score - 10) / 2);
  if (modifier.kind === "bands") {
    const n = Math.floor(score);
    return modifier.bands.find((b) => n >= b.min && n <= b.max)?.value ?? null;
  }
  if (checkExpression(modifier.expression) !== null) return null;
  const scope: ExpressionScope = Object.create(null) as ExpressionScope;
  for (const [k, v] of Object.entries(numbers)) if (Number.isFinite(v) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) scope[k] = { rolls: [v], total: v };
  // `score`, or `stat` as the plugin names it.
  scope["score"] = { rolls: [score], total: score };
  scope["stat"] = { rolls: [score], total: score };
  const expr = rewrite(modifier.expression);
  const atLeast = (m: number): boolean | null => {
    try {
      return evaluateExpression(`(${expr}) >= ${m}`, scope);
    } catch {
      return null;
    }
  };
  // Out of bounds (or not a number, which holds for no bound): none.
  if (atLeast(LOW) !== true || atLeast(HIGH + 1) !== false) return null;
  let lo = LOW;
  let hi = HIGH;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const ok = atLeast(mid);
    if (ok === null) return null;
    if (ok) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A modifier as a card writes it: `+3`, `-1`, `+0`. */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** The d20 roll of a modifier: `1d20+3`, `1d20-1`, and `1d20` for none. */
export function d20Of(n: number): string {
  return n === 0 ? "1d20" : `1d20${signed(n)}`;
}
