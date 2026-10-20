// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A ```statblock block's YAML read into a sheet: a map of free keys, as
// the Fantasy Statblocks plugin reads it (its `Monster`, every field
// optional, any key allowed — ADR 0099 item 1). A note is written by anyone
// in a room, so the reading is bounded and never throws: past
// STATBLOCK_MAX_CHARS nothing is parsed; every map comes out without a
// prototype, so a key named `__proto__` or `constructor` is a key like any
// other; depth and size are capped.

import YAML from "yaml";

/** A block longer than this is not parsed (ADR 0099 item 7). */
export const STATBLOCK_MAX_CHARS = 256 * 1024;
const MAX_DEPTH = 12;
const MAX_NODES = 20_000;
/** A line longer than this is left as written by the loose reading. */
const MAX_LOOSE_LINE = 2000;

export type Sheet = Record<string, unknown>;

export type SheetRead = { ok: true; sheet: Sheet } | { ok: false; why: "tooBig" | "invalid" | "notMap" };

const isSpace = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v";
const KEY_CHAR = /[\p{L}\p{N}_\s-]/u;
const quoted = (v: string): boolean => (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));

/** One line of loose YAML, `key: text: more`, with its value quoted — what
 *  a person writes in a trait's description. Read by position, not by a
 *  pattern (a pattern with two runs of spaces takes quadratic time). */
function looseLine(line: string): string {
  if (line.length > MAX_LOOSE_LINE) return line;
  let i = 0;
  while (isSpace(line[i])) i++;
  const indent = line.slice(0, i);
  let listItem = false;
  if (line[i] === "-" && isSpace(line[i + 1])) {
    listItem = true;
    i++;
    while (isSpace(line[i])) i++;
  }
  const colon = line.indexOf(":", i);
  if (colon <= i || !isSpace(line[colon + 1])) return line;
  const key = line.slice(i, colon);
  if (!listItem) for (const ch of key) if (!KEY_CHAR.test(ch)) return line;
  const val = line.slice(colon + 1).trim();
  if (!val.includes(":") || quoted(val) || val.startsWith("[") || val.startsWith("{")) return line;
  const lead = listItem ? line.slice(0, i) : indent;
  return `${lead}${key}: ${JSON.stringify(val)}`;
}

/** A parsed value made safe: maps without a prototype, depth and size
 *  capped, and a wikilink YAML read as a nested list (`[[Note]]` is a list
 *  holding a list) given back as the link it was, as the plugin does. */
function clean(v: unknown, depth: number, budget: { n: number }): unknown {
  if (--budget.n < 0 || depth > MAX_DEPTH) return undefined;
  if (Array.isArray(v)) {
    if (v.length === 1 && Array.isArray(v[0]) && v[0].length === 1 && typeof v[0][0] === "string") return `[[${v[0][0]}]]`;
    const out: unknown[] = [];
    for (const x of v) {
      if (budget.n < 0) break;
      out.push(clean(x, depth + 1, budget));
    }
    return out;
  }
  if (v instanceof Map) {
    const out: Sheet = Object.create(null) as Sheet;
    for (const [k, x] of v) {
      if (budget.n < 0) break;
      out[String(k)] = clean(x, depth + 1, budget);
    }
    return out;
  }
  if (typeof v === "object" && v !== null) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const out: Sheet = Object.create(null) as Sheet;
    for (const k of Object.keys(v)) {
      if (budget.n < 0) break;
      out[k] = clean((v as Record<string, unknown>)[k], depth + 1, budget);
    }
    return out;
  }
  if (typeof v === "bigint") return Number(v);
  return v;
}

function parse(text: string): unknown {
  // Maps as `Map`s, so no key ever lands on an object's prototype; aliases
  // bounded (a billion laughs is a small text).
  return YAML.parse(text, { mapAsMap: true, maxAliasCount: 100, uniqueKeys: false, prettyErrors: false, logLevel: "error" });
}

/** The YAML of a block as a sheet, or why there is none. Never throws. */
export function readSheet(text: string): SheetRead {
  if (text.length > STATBLOCK_MAX_CHARS) return { ok: false, why: "tooBig" };
  let raw: unknown;
  try {
    raw = parse(text);
  } catch {
    try {
      raw = parse(text.split("\n").map(looseLine).join("\n"));
    } catch {
      return { ok: false, why: "invalid" };
    }
  }
  if (raw === null || raw === undefined) return { ok: true, sheet: Object.create(null) as Sheet };
  const sheet = clean(raw, 0, { n: MAX_NODES });
  if (typeof sheet !== "object" || sheet === null || Array.isArray(sheet)) return { ok: false, why: "notMap" };
  return { ok: true, sheet: sheet as Sheet };
}

/** A sheet's own value of `key`. */
export function valueOf(sheet: Sheet, key: string): unknown {
  return Object.hasOwn(sheet, key) ? sheet[key] : undefined;
}

/** Whether a value counts as present (the plugin's rule): a number, a
 *  string with text, a list with something in it, a map with a key. */
export function present(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object" && v !== null) return Object.keys(v).length > 0;
  return false;
}

/** A value as the text a card shows: a scalar as it is, a list joined by
 *  commas, a map's pairs as "key value" — never "[object Object]". */
export function textOf(v: unknown, depth = 0): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (depth > 5) return "";
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? `(${textOf(x, depth + 1)})` : textOf(x, depth + 1))).filter(Boolean).join(", ");
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k} ${textOf(x, depth + 1)}`.trim()).join(", ");
  return "";
}

/** A value as a whole number, when it is one written plainly (`7`, `"7"`). */
export function wholeOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^\s*-?\d{1,6}\s*$/.test(v)) return Number(v);
  return null;
}

/** A value as a number for a table or an expression: `14`, `"14"`, and a
 *  leading number before other text (`14 (+2)`). */
export function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = /^\s*(-?\d{1,6}(?:\.\d{1,4})?)/.exec(v);
  return m ? Number(m[1]) : null;
}

/** The layout a sheet names: `layout:`, or `statblock:` as the plugin also
 *  reads it, when it is text. */
export function layoutNamed(sheet: Sheet): string | undefined {
  for (const k of ["layout", "statblock"]) {
    const v = valueOf(sheet, k);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
