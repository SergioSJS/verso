// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Inheritance between statblocks (ADR 0099 item 1, 0099.1 = A, decided
// 2026-10-21): `monster:` and `extends:` as the Fantasy Statblocks plugin
// documents and implements them (src/view/statblock.ts `build`, and
// src/bestiary/bestiary.ts `getExtensions`, MIT, Jeremy Valentine; read at
// main on 2026-10-21):
//
//   * precedence, highest first: the block's own keys; the creature of
//     `monster:` (or `creature:`) with its own `extends`; then `extends`,
//     the first name listed before the second, each with its own chain;
//   * a scalar (or any value) is replaced as a whole;
//   * a list the layout draws as traits is merged BY NAME across the
//     layers, furthest first: a same-named trait is overridden by the nearer
//     layer, `key-:` removes a named trait, `key~:` replaces a named trait
//     only if it exists, `key+:` always adds;
//   * any other key with a `key+:` beside it has the two appended.
//
// A base is found by the caller (`Lookup`): this module is pure — no DOM, no
// IO — and read-only: nothing is written to either note. A cycle (A extends
// B extends A) and a chain past MAX_DEPTH stop with a problem the card shows;
// the walk is bounded, so it never hangs.

import { present, type Sheet } from "./sheet";

/** The deepest chain followed; a base past it is not read. */
export const MAX_DEPTH = 8;
const MAX_REFS = 8;
const MAX_LAYERS = 64;

/** A reference to a base. `name`: a creature named so; `link`: the note a
 *  `[[wikilink]]` names. `via` is the key it came from. */
export interface Ref {
  kind: "name" | "link";
  text: string;
  via: "monster" | "extends";
}

/** A base found: `id` tells two statblocks of one note apart (a cycle is
 *  the same id met twice). */
export interface Found {
  id: string;
  path: string;
  name: string;
  sheet: Sheet;
}

/** `null`: no such base. `"pending"`: not read yet; the caller redraws once
 *  it is. */
export type Lookup = (ref: Ref) => Found | "pending" | null;

export type ProblemKind = "missing" | "cycle" | "depth" | "pending";
export interface Problem {
  kind: ProblemKind;
  /** The name or target written. */
  ref: string;
}

export interface Composed {
  sheet: Sheet;
  /** The direct bases of the block, for the "based on" link. */
  bases: { name: string; path: string }[];
  problems: Problem[];
}

const WIKI = /^\[\[([^\]|#]*)(?:[#|][^\]]*)?\]\]$/;

function refOf(raw: unknown, via: Ref["via"]): Ref | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 200);
  if (t === "") return null;
  const m = WIKI.exec(t);
  if (m) {
    const target = (m[1] ?? "").trim();
    return target === "" ? null : { kind: "link", text: target, via };
  }
  return { kind: "name", text: t, via };
}

/** What a sheet inherits from, in precedence order: `monster:` or
 *  `creature:`, then each of `extends:`. */
export function refsOf(sheet: Sheet): Ref[] {
  const out: Ref[] = [];
  for (const k of ["monster", "creature"]) {
    const r = Object.hasOwn(sheet, k) ? refOf(sheet[k], "monster") : null;
    if (r) {
      out.push(r);
      break;
    }
  }
  if (Object.hasOwn(sheet, "extends")) {
    const e = sheet["extends"];
    for (const x of Array.isArray(e) ? e : [e]) {
      const r = refOf(x, "extends");
      if (r) out.push(r);
    }
  }
  return out.slice(0, MAX_REFS);
}

/** Whether a sheet inherits at all. */
export const inherits = (sheet: Sheet): boolean => refsOf(sheet).length > 0;

/** A trait of a list: `{name, desc}`, or the plugin's `[name, ...desc]`. */
function named(item: unknown): { name: string; item: unknown } | null {
  if (item && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "name")) {
    const n = (item as Sheet)["name"];
    return typeof n === "string" || typeof n === "number" ? { name: String(n), item } : null;
  }
  if (Array.isArray(item) && item.length >= 1 && (typeof item[0] === "string" || typeof item[0] === "number")) {
    return { name: String(item[0]), item: { name: String(item[0]), desc: item.slice(1).join("") } };
  }
  return null;
}

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function append(a: unknown, b: unknown): unknown {
  if (Array.isArray(a)) return [...a, ...listOf(b)];
  if (typeof a === "string" && (typeof b === "string" || typeof b === "number")) return a.trim() === "" ? String(b) : `${a}, ${b}`;
  if (a && typeof a === "object" && b && typeof b === "object" && !Array.isArray(b)) {
    const out: Sheet = Object.create(null) as Sheet;
    Object.assign(out, a, b);
    return out;
  }
  return a;
}

/** The sheet a block draws: its own keys over its bases'. `traitKeys` says,
 *  from the scalar-merged sheet (whose `layout:` may itself be inherited),
 *  which keys the layout draws as traits. */
export function compose(
  own: Sheet,
  lookup: Lookup,
  traitKeys: (merged: Sheet) => ReadonlySet<string>,
  /** The block's own note and name: meeting them again among the bases is a cycle at once, not one walk later. */
  self?: { path: string; name: string },
): Composed {
  const problems: Problem[] = [];
  const bases: { name: string; path: string }[] = [];
  const layers: Sheet[] = [];
  const note = (p: Problem): void => {
    if (!problems.some((q) => q.kind === p.kind && q.ref === p.ref)) problems.push(p);
  };

  // Depth first, nearest first: the sheet, its `monster:` chain, then each
  // `extends:` chain in the order written — the plugin's order of layers.
  const walk = (sheet: Sheet, depth: number, stack: readonly string[]): void => {
    layers.push(sheet);
    for (const ref of refsOf(sheet)) {
      if (layers.length >= MAX_LAYERS) return note({ kind: "depth", ref: ref.text });
      if (depth + 1 > MAX_DEPTH) {
        note({ kind: "depth", ref: ref.text });
        continue;
      }
      const found = lookup(ref);
      if (found === null) {
        note({ kind: "missing", ref: ref.text });
        continue;
      }
      if (found === "pending") {
        note({ kind: "pending", ref: ref.text });
        continue;
      }
      if (stack.includes(found.id) || (self && self.name !== "" && found.path === self.path && found.name === self.name)) {
        note({ kind: "cycle", ref: ref.text });
        continue;
      }
      if (depth === 0) bases.push({ name: found.name || ref.text, path: found.path });
      walk(found.sheet, depth + 1, [...stack, found.id]);
    }
  };
  walk(own, 0, []);

  if (layers.length === 1) return { sheet: own, bases, problems };

  const merged: Sheet = Object.create(null) as Sheet;
  for (let i = layers.length - 1; i >= 0; i--) Object.assign(merged, layers[i]);

  // Traits, by name, furthest layer first.
  for (const key of traitKeys(merged)) {
    const touched = layers.filter((l) => [key, `${key}+`, `${key}-`, `${key}~`].some((k) => Object.hasOwn(l, k)));
    if (touched.length === 0) continue;
    const map = new Map<string, unknown>();
    const added: unknown[] = [];
    let loose = 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]!;
      for (const item of listOf(Object.hasOwn(l, key) ? l[key] : undefined)) {
        const n = named(item);
        // An item with no name (a plain string) cannot be overridden by
        // name: it is kept, in order.
        map.set(n ? n.name : `\0${loose++}`, n ? n.item : item);
      }
      for (const item of listOf(Object.hasOwn(l, `${key}-`) ? l[`${key}-`] : undefined)) {
        const n = named(item) ?? (typeof item === "string" ? { name: item, item } : null);
        if (n) map.delete(n.name);
      }
      for (const item of listOf(Object.hasOwn(l, `${key}~`) ? l[`${key}~`] : undefined)) {
        const n = named(item);
        if (n && map.has(n.name)) map.set(n.name, n.item);
      }
      for (const item of listOf(Object.hasOwn(l, `${key}+`) ? l[`${key}+`] : undefined)) added.push(named(item)?.item ?? item);
    }
    merged[key] = [...map.values(), ...added];
    for (const s of ["+", "-", "~"]) delete merged[`${key}${s}`];
  }

  // `key+:` on any other key: appended to the key's value.
  for (const k of Object.keys(merged)) {
    if (!k.endsWith("+") || k.length < 2) continue;
    const base = k.slice(0, -1);
    if (Object.hasOwn(merged, base) && present(merged[k])) merged[base] = append(merged[base], merged[k]);
    delete merged[k];
  }
  return { sheet: merged, bases, problems };
}
