// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A Fantasy Statblocks layout JSON read into Verso's model (ADR 0099
// item 3): the plugin's export (its `Layout`, src/layouts/layout.types.ts at
// f248f4af) mapped block by block, and every field the plugin runs as
// JavaScript dropped and named in a list the person sees — `javascript`
// blocks, `callback`, `diceCallback`, a table's `modifier` code, each
// `diceParsing[].parser`, `ifelse` conditions, `action` blocks. A dice rule
// whose pattern is one of the plugin's three defaults becomes Verso's
// declarative rule for it; any other loses its parser, and so the rule.
// Verso's own JSON goes out as the model is.

import { D20_RULES } from "./dice";
import { COLUMN_WIDTH, LAYOUT_ID, LIMITS, type Layout } from "./model";
import { S } from "./strings";
import { slugId, validateLayout, type Problem } from "./validate";

export interface Imported {
  layout: Layout;
  /** What was code, and is not in the layout (the person is told). */
  dropped: string[];
  /** What was changed into Verso's form. */
  converted: string[];
  /** What the validator could not take. */
  problems: Problem[];
}

type Rec = Record<string, unknown>;
const isMap = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const nonEmpty = (v: unknown): boolean => typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null;

/** The plugin's default dice patterns (`getDiceParsingDefaults`), and the
 *  rule of Verso's that reads the same dice. */
const FS_DEFAULT_RULES: Readonly<Record<string, number>> = {
  [String.raw`([\+\-])(\d+) to hit`]: 0,
  [String.raw`(\d+)\s\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)`]: 1,
  [String.raw`([^\s]+) ([\+\-])(\d+)`]: 3,
};

/** The plugin's colour properties that have a token of Verso's. */
const COLORS: Readonly<Record<string, string>> = {
  primaryColor: "accent",
  ruleColor: "rule",
  backgroundColor: "background",
  fontColor: "text",
  barColor: "bar",
};

class Mapper {
  dropped: string[] = [];
  converted: string[] = [];

  /** A block's name for the lists: its type and what it shows. */
  name(b: Rec, path: string): string {
    const shown = own(b, "display") ?? own(b, "heading") ?? (Array.isArray(own(b, "properties")) ? (own(b, "properties") as unknown[])[0] : undefined);
    return `${path} (${String(own(b, "type"))}${typeof shown === "string" && shown ? ` "${shown.slice(0, 40)}"` : ""})`;
  }

  blocks(v: unknown, path: string): Rec[] {
    if (!Array.isArray(v)) return [];
    const out: Rec[] = [];
    v.forEach((b, i) => {
      const r = this.block(b, `${path}[${i}]`);
      if (r) out.push(r);
    });
    return out;
  }

  block(b: unknown, path: string): Rec | null {
    if (!isMap(b)) return null;
    const type = own(b, "type");
    const label = own(b, "display") ?? own(b, "heading");
    const base: Rec = {
      id: own(b, "id"),
      properties: Array.isArray(own(b, "properties")) ? own(b, "properties") : [],
      ...(typeof label === "string" && label.trim() ? { label } : {}),
      ...(own(b, "conditioned") === true ? { hideWhenEmpty: true } : {}),
      ...(typeof own(b, "fallback") === "string" ? { fallback: own(b, "fallback") } : {}),
      ...(own(b, "hasRule") === true ? { rule: true } : {}),
      // The plugin rolls only in blocks that say so.
      dice: own(b, "dice") === true,
    };
    // A block dropped whole is named once, not once per code field.
    const whole = type === "action" || type === "javascript" || type === "layout";
    if (!whole) for (const code of ["callback", "diceCallback"]) if (nonEmpty(own(b, code))) this.dropped.push(`${this.name(b, path)}.${code}`);
    switch (type) {
      case "heading":
        return { ...base, type, size: own(b, "size") };
      case "subheading":
        // The plugin joins with its `separator`, and with none as an
        // array's `join()` does: a comma.
        return { ...base, type, separator: typeof own(b, "separator") === "string" ? own(b, "separator") : "," };
      case "property": {
        const diceKey = own(b, "diceProperty");
        return { ...base, type, ...(typeof diceKey === "string" && diceKey ? { diceKey } : {}) };
      }
      case "saves":
      case "traits":
      case "image":
        if (nonEmpty(own(b, "subheadingText"))) this.converted.push(`${this.name(b, path)}.subheadingText`);
        return { ...base, type };
      case "spells":
        this.converted.push(`${this.name(b, path)} → traits`);
        return { ...base, type: "traits", ...(base["label"] ? {} : { label: "Spellcasting" }) };
      case "text":
        return { ...base, type, ...(typeof own(b, "text") === "string" && own(b, "text") ? { text: own(b, "text") } : {}) };
      case "table": {
        let modifier: unknown = own(b, "calculate") === true ? "d20" : "none";
        if (nonEmpty(own(b, "modifier"))) {
          this.dropped.push(`${this.name(b, path)}.modifier`);
          modifier = "none";
        }
        return { ...base, type, headers: Array.isArray(own(b, "headers")) ? own(b, "headers") : [], modifier };
      }
      case "group":
      case "inline":
        return { ...base, type, nested: this.blocks(own(b, "nested"), `${path}.nested`) };
      case "collapse":
        return { ...base, type, open: own(b, "open") === true, nested: this.blocks(own(b, "nested"), `${path}.nested`) };
      case "ifelse": {
        // Its tests are code: none is kept. The branch with no test — the
        // plugin's "else" — is what draws when none holds, so it stays.
        this.dropped.push(`${this.name(b, path)}.conditions`);
        const conds = Array.isArray(own(b, "conditions")) ? (own(b, "conditions") as unknown[]) : [];
        const otherwise = conds.find((c) => isMap(c) && !nonEmpty(own(c, "condition")));
        if (!isMap(otherwise)) return null;
        const nested = own(otherwise, "nested");
        // The plugin keeps each branch's blocks as one group.
        return { ...base, type: "group", nested: this.blocks(nested, `${path}.else`) };
      }
      case "javascript":
      case "action":
        this.dropped.push(this.name(b, path));
        return null;
      case "layout":
        this.dropped.push(`${this.name(b, path)} (embedded layout)`);
        return null;
      default:
        this.dropped.push(this.name(b, path));
        return null;
    }
  }

  rules(v: unknown): Rec[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out: Rec[] = [];
    v.forEach((r, i) => {
      if (!isMap(r)) return;
      const regex = own(r, "regex");
      const at = typeof regex === "string" ? Object.hasOwn(FS_DEFAULT_RULES, regex) ? FS_DEFAULT_RULES[regex] : undefined : undefined;
      if (at !== undefined) {
        out.push({ ...D20_RULES[at]! });
        this.converted.push(`diceParsing[${i}] "${String(own(r, "desc") ?? regex).slice(0, 40)}"`);
      } else this.dropped.push(`diceParsing[${i}].parser "${String(own(r, "desc") ?? regex).slice(0, 40)}"`);
    });
    return out;
  }

  appearance(v: unknown): Rec {
    if (!isMap(v)) return {};
    const out: Rec = {};
    const take = (from: unknown, theme: "light" | "dark") => {
      if (!isMap(from)) return;
      const colors: Rec = isMap(out[theme]) ? (out[theme] as Rec) : {};
      for (const [k, c] of Object.entries(from)) {
        const token = Object.hasOwn(COLORS, k) ? COLORS[k] : undefined;
        if (token && typeof c === "string" && /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(c)) colors[token] = c;
      }
      if (Object.keys(colors).length > 0) out[theme] = colors;
    };
    // The plugin's plain properties are its light theme's; "moonstone" and
    // "obsidian" are its light and dark themes.
    take(v, "light");
    take(own(v, "moonstone"), "light");
    take(own(v, "obsidian"), "dark");
    const known = Object.keys(v).filter((k) => !Object.hasOwn(COLORS, k) && k !== "moonstone" && k !== "obsidian").length;
    if (known > 0) this.converted.push(`cssProperties: ${known} not kept`);
    return out;
  }
}

/** A Fantasy Statblocks layout JSON (or one of Verso's) read as a layout
 *  of Verso's, or why not. Never throws. */
export function importLayout(text: string): Imported | { error: string } {
  if (text.length > LIMITS.bytes) return { error: S.importTooBig(LIMITS.bytes / 1024) };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: S.importBadJson };
  }
  if (!isMap(raw) || !Array.isArray(own(raw, "blocks")) || (typeof own(raw, "name") !== "string" && !isMap(own(raw, "name")))) return { error: S.importNotLayout };
  // Verso's own: it names the model's version and labels in both languages.
  if (typeof own(raw, "version") === "number" && isMap(own(raw, "name"))) {
    const v = validateLayout(raw);
    if (!v.layout) return { error: S.importNotLayout };
    return { layout: v.layout, dropped: [], converted: [], problems: v.problems };
  }
  const m = new Mapper();
  const name = own(raw, "name") as string;
  const id = own(raw, "id");
  const width = own(raw, "columnWidth");
  const columns = own(raw, "columns");
  const rules = m.rules(own(raw, "diceParsing"));
  const mapped: Rec = {
    id: typeof id === "string" && LAYOUT_ID.test(id) ? id : slugId(name),
    name,
    columns: typeof columns === "number" ? Math.max(1, Math.min(3, Math.round(columns))) : 2,
    columnWidth: typeof width === "number" ? Math.max(COLUMN_WIDTH.min, Math.min(COLUMN_WIDTH.max, width)) : COLUMN_WIDTH.default,
    // No `diceParsing` in the plugin is its three defaults.
    diceRules: rules ?? D20_RULES.filter((_, i) => i !== 2),
    appearance: m.appearance(own(raw, "cssProperties")),
    blocks: m.blocks(own(raw, "blocks"), "blocks"),
  };
  const v = validateLayout(mapped);
  if (!v.layout) return { error: S.importNotLayout };
  return { layout: v.layout, dropped: m.dropped, converted: m.converted, problems: v.problems };
}

/** A layout as Verso's JSON: the model as it is, for a file or a copy. */
export function exportLayout(layout: Layout): string {
  return JSON.stringify(layout, null, 2);
}
