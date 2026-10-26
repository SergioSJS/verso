// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A layout as it reaches the window — a file of the folder, an import, a
// built-in — read into the model (ADR 0099 item 3). Never throws: what it
// cannot take is left out and listed, each problem with where it was, so the
// card draws what is sound and says that something was not.

import { PROFILE_YAML } from "../dice/rolai/profilesData";
import { checkExpression } from "./modifier";
import {
  BLOCK_TYPES,
  COLOR_TOKENS,
  COLUMN_WIDTH,
  FONTS,
  LAYOUT_ID,
  LAYOUT_VERSION,
  LIMITS,
  type Appearance,
  type Block,
  type BlockBase,
  type BlockType,
  type DiceRule,
  type Label,
  type Layout,
  type LayoutSource,
  type Modifier,
  type ModifierBand,
  type Predicate,
  type RollInput,
} from "./model";
import { checkPattern } from "./regexGuard";
import { S } from "./strings";

export interface Problem {
  /** Where: `blocks[3].nested[0]`, `diceRules[1]`, `appearance.light.accent`. */
  path: string;
  message: string;
}

export interface Validated {
  /** Null only when the value is not a map at all. */
  layout: Layout | null;
  problems: Problem[];
}

type Rec = Record<string, unknown>;
const isMap = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: Rec, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);

/** A label from a string (both languages alike) or a `{pt, en}` map. */
export function readLabel(v: unknown, max: number = LIMITS.label): Label | undefined {
  if (typeof v === "string") return v.trim() ? { pt: v.slice(0, max), en: v.slice(0, max) } : undefined;
  if (!isMap(v)) return undefined;
  const pt = str(own(v, "pt"), max);
  const en = str(own(v, "en"), max);
  if (!pt && !en) return undefined;
  return { ...(pt ? { pt } : {}), ...(en ? { en } : {}) };
}

/** A key of the sheet a block may name. */
export function readKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.trim();
  return k.length > 0 && k.length <= LIMITS.key ? k : null;
}

const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
const TEMPLATE = /^[0-9dDkKhHlLF%!+\-$& ]{1,60}$/;
const isProfile = (id: unknown): id is string => typeof id === "string" && Object.hasOwn(PROFILE_YAML, id);

class Reader {
  problems: Problem[] = [];
  count = 0;
  note(path: string, message: string): void {
    if (this.problems.length < 200) this.problems.push({ path, message });
  }

  blocks(v: unknown, path: string, depth: number): Block[] {
    if (!Array.isArray(v)) {
      if (v !== undefined) this.note(path, S.problem.block);
      return [];
    }
    if (depth > LIMITS.depth) {
      this.note(path, S.problem.tooDeep);
      return [];
    }
    const out: Block[] = [];
    v.forEach((b, i) => {
      if (this.count >= LIMITS.blocks) {
        if (this.count === LIMITS.blocks) this.note(`${path}[${i}]`, S.problem.tooMany);
        this.count++;
        return;
      }
      const block = this.block(b, `${path}[${i}]`, depth);
      if (block) out.push(block);
    });
    return out;
  }

  base(o: Rec, type: BlockType, path: string): BlockBase {
    this.count++;
    const props = own(o, "properties");
    const properties: string[] = [];
    if (Array.isArray(props)) {
      for (const p of props.slice(0, LIMITS.properties)) {
        const k = readKey(p);
        if (k) properties.push(k);
        else this.note(`${path}.properties`, S.problem.key);
      }
    }
    const label = readLabel(own(o, "label"));
    const fallback = str(own(o, "fallback"), LIMITS.label);
    const id = str(own(o, "id"), 80);
    return {
      id: id && id.trim() ? id : `b${this.count}`,
      type,
      properties,
      ...(label ? { label } : {}),
      ...(own(o, "hideWhenEmpty") === true ? { hideWhenEmpty: true } : {}),
      ...(fallback !== undefined ? { fallback } : {}),
      ...(own(o, "rule") === true ? { rule: true } : {}),
      ...(typeof own(o, "dice") === "boolean" ? { dice: own(o, "dice") as boolean } : {}),
    };
  }

  block(v: unknown, path: string, depth: number): Block | null {
    if (!isMap(v)) {
      this.note(path, S.problem.block);
      return null;
    }
    const type = own(v, "type");
    if (typeof type !== "string" || !(BLOCK_TYPES as readonly string[]).includes(type)) {
      this.note(path, S.problem.blockType(String(type).slice(0, 40)));
      return null;
    }
    const t = type as BlockType;
    const base = this.base(v, t, path);
    switch (t) {
      case "heading": {
        const size = own(v, "size");
        return { ...base, type: t, size: typeof size === "number" && Number.isInteger(size) && size >= 1 && size <= 6 ? size : 1 };
      }
      case "subheading":
        return { ...base, type: t, separator: str(own(v, "separator"), 10) ?? ", " };
      case "property": {
        const template = str(own(v, "template"), LIMITS.text);
        const diceKey = readKey(own(v, "diceKey"));
        return { ...base, type: t, ...(template ? { template } : {}), ...(diceKey ? { diceKey } : {}) };
      }
      case "table": {
        const headers: Label[] = [];
        const raw = own(v, "headers");
        if (Array.isArray(raw)) for (const h of raw.slice(0, LIMITS.headers)) headers.push(readLabel(h, 40) ?? {});
        return { ...base, type: t, headers, modifier: this.modifier(own(v, "modifier"), `${path}.modifier`) };
      }
      case "traits": {
        const raw = own(v, "flag");
        if (raw === undefined) return { ...base, type: t };
        const key = isMap(raw) ? readKey(own(raw, "key")) : null;
        if (!key || !isMap(raw)) {
          this.note(`${path}.flag`, S.problem.key);
          return { ...base, type: t };
        }
        const label = readLabel(own(raw, "label"));
        const count = readLabel(own(raw, "count"));
        return { ...base, type: t, flag: { key, ...(label ? { label } : {}), ...(count ? { count } : {}) } };
      }
      case "saves":
      case "image":
        return { ...base, type: t };
      case "text": {
        const text = readLabel(own(v, "text"), LIMITS.text);
        return { ...base, type: t, ...(text ? { text } : {}) };
      }
      case "group":
      case "inline":
        return { ...base, type: t, nested: this.blocks(own(v, "nested"), `${path}.nested`, depth + 1) };
      case "collapse":
        return { ...base, type: t, open: own(v, "open") === true, nested: this.blocks(own(v, "nested"), `${path}.nested`, depth + 1) };
      case "conditional": {
        const raw = own(v, "branches");
        const branches: { when?: Predicate; not?: boolean; nested: Block[] }[] = [];
        if (Array.isArray(raw)) {
          raw.slice(0, LIMITS.branches).forEach((b, i) => {
            const at = `${path}.branches[${i}]`;
            if (!isMap(b)) return this.note(at, S.problem.block);
            const whenRaw = own(b, "when");
            const when = whenRaw === undefined ? undefined : this.predicate(whenRaw, `${at}.when`);
            // A test that does not read is no branch: it never holds.
            if (whenRaw !== undefined && !when) return;
            branches.push({ ...(when ? { when } : {}), ...(own(b, "not") === true ? { not: true } : {}), nested: this.blocks(own(b, "nested"), `${at}.nested`, depth + 1) });
          });
        }
        return { ...base, type: t, branches };
      }
      case "tracker": {
        const current = readKey(own(v, "current"));
        const maxRaw = own(v, "max");
        const max = typeof maxRaw === "number" && Number.isInteger(maxRaw) && maxRaw >= 0 && maxRaw <= 9999 ? maxRaw : readKey(maxRaw);
        if (!current || max === null) {
          this.note(path, S.problem.tracker);
          return null;
        }
        const style = own(v, "style") === "number" ? "number" : "boxes";
        return { ...base, type: t, current, max, style };
      }
      case "roll": {
        const profile = own(v, "profile");
        if (profile !== undefined && !isProfile(profile)) this.note(`${path}.profile`, S.problem.profile(String(profile).slice(0, 40)));
        const inputs: Record<string, RollInput> = Object.create(null) as Record<string, RollInput>;
        const raw = own(v, "inputs");
        if (isMap(raw)) {
          for (const [id, val] of Object.entries(raw).slice(0, LIMITS.inputs)) {
            if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(id)) continue;
            if (isMap(val) && readKey(own(val, "key"))) inputs[id] = { key: readKey(own(val, "key"))! };
            else if (isMap(val) && (typeof own(val, "value") === "number" || typeof own(val, "value") === "string")) inputs[id] = { value: own(val, "value") as string | number };
            else this.note(`${path}.inputs.${id}`, S.problem.key);
          }
        }
        return { ...base, type: t, ...(isProfile(profile) ? { profile } : {}), inputs };
      }
    }
  }

  modifier(v: unknown, path: string): Modifier {
    if (v === undefined || v === "d20") return v === "d20" ? { kind: "d20" } : { kind: "none" };
    if (v === "none") return { kind: "none" };
    if (isMap(v)) {
      const kind = own(v, "kind");
      if (kind === "d20" || kind === "none") return { kind };
      if (kind === "bands") {
        const raw = own(v, "bands");
        const bands: ModifierBand[] = [];
        if (Array.isArray(raw)) {
          raw.slice(0, LIMITS.bands).forEach((b, i) => {
            const whole = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && Math.abs(x) <= 100_000;
            if (isMap(b) && whole(own(b, "min")) && whole(own(b, "max")) && whole(own(b, "value")) && (own(b, "min") as number) <= (own(b, "max") as number) && Math.abs(own(b, "value") as number) <= 1000) {
              bands.push({ min: own(b, "min") as number, max: own(b, "max") as number, value: own(b, "value") as number });
            } else this.note(`${path}.bands[${i}]`, S.problem.band);
          });
          if (raw.length > LIMITS.bands) this.note(`${path}.bands`, S.problem.tooMany);
        } else this.note(`${path}.bands`, S.problem.band);
        return { kind: "bands", bands };
      }
      if (kind === "expression") {
        const expression = own(v, "expression");
        const why = checkExpression(expression);
        if (why === null) return { kind: "expression", expression: expression as string };
        this.note(path, S.problem.expression(why));
        return { kind: "none" };
      }
    }
    this.note(path, S.problem.expression("kind"));
    return { kind: "none" };
  }

  predicate(v: unknown, path: string): Predicate | undefined {
    if (!isMap(v)) {
      this.note(path, S.problem.predicate);
      return undefined;
    }
    const op = own(v, "op");
    const key = readKey(own(v, "key"));
    const value = own(v, "value");
    if (key && op === "has") return { op, key };
    if (key && op === "equals" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) return { op, key, value: typeof value === "string" ? value.slice(0, LIMITS.label) : value };
    if (key && op === "above" && typeof value === "number" && Number.isFinite(value)) return { op, key, value };
    this.note(path, S.problem.predicate);
    return undefined;
  }

  /** The sources a layout names: a label and an `https://` address each. */
  sources(v: unknown): LayoutSource[] {
    const out: LayoutSource[] = [];
    if (!Array.isArray(v)) return out;
    v.slice(0, LIMITS.sources).forEach((s, i) => {
      const at = `sources[${i}]`;
      if (!isMap(s)) return this.note(at, S.problem.block);
      const label = str(own(s, "label"), LIMITS.label);
      // Not cut: a long address cut short is another, possibly valid, one.
      const url = str(own(s, "url"), Number.MAX_SAFE_INTEGER);
      if (!label || !label.trim() || !url || url.length > LIMITS.url || !/^https:\/\/[^\s<>"']+$/.test(url)) return this.note(at, S.problem.source);
      out.push({ label, url });
    });
    if (v.length > LIMITS.sources) this.note("sources", S.problem.tooMany);
    return out;
  }

  rules(v: unknown): DiceRule[] {
    const out: DiceRule[] = [];
    if (!Array.isArray(v)) return out;
    v.slice(0, LIMITS.rules).forEach((r, i) => {
      const at = `diceRules[${i}]`;
      if (!isMap(r)) return this.note(at, S.problem.block);
      const pattern = own(r, "pattern");
      const checked = checkPattern(pattern);
      if (!checked.ok) return this.note(`${at}.pattern`, S.problem.pattern(checked.why));
      const template = own(r, "template");
      if (typeof template !== "string" || !TEMPLATE.test(template)) return this.note(`${at}.template`, S.problem.template);
      out.push({ pattern: pattern as string, template });
    });
    if (v.length > LIMITS.rules) this.note("diceRules", S.problem.tooMany);
    return out;
  }

  appearance(v: unknown): Appearance {
    const out: Appearance = {};
    if (!isMap(v)) return out;
    for (const theme of ["light", "dark"] as const) {
      const raw = own(v, theme);
      if (!isMap(raw)) continue;
      const colors: Partial<Record<(typeof COLOR_TOKENS)[number], string>> = {};
      for (const [k, c] of Object.entries(raw)) {
        if (!(COLOR_TOKENS as readonly string[]).includes(k)) {
          this.note(`appearance.${theme}.${k.slice(0, 40)}`, S.problem.color(k.slice(0, 40)));
          continue;
        }
        if (typeof c === "string" && HEX.test(c)) colors[k as (typeof COLOR_TOKENS)[number]] = c;
        else this.note(`appearance.${theme}.${k}`, S.problem.color(k));
      }
      if (Object.keys(colors).length > 0) out[theme] = colors;
    }
    for (const which of ["headingFont", "bodyFont"] as const) {
      const f = own(v, which);
      if (f === undefined) continue;
      if (typeof f === "string" && (FONTS as readonly string[]).includes(f)) out[which] = f as (typeof FONTS)[number];
      else this.note(`appearance.${which}`, S.problem.font);
    }
    return out;
  }
}

/** A name a layout file can be stored under, from any text. */
export function slugId(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return s || "layout";
}

/** `raw` read as a layout. `id`, when given, is the layout's (a folder
 *  file's name), whatever the file says. */
export function validateLayout(raw: unknown, id?: string): Validated {
  const r = new Reader();
  if (!isMap(raw)) return { layout: null, problems: [{ path: "", message: S.problem.notMap }] };
  const version = own(raw, "version");
  if (version !== undefined && version !== LAYOUT_VERSION) r.note("version", S.problem.version(String(version).slice(0, 20)));
  const name = readLabel(own(raw, "name"));
  if (!name) r.note("name", S.problem.name);
  let layoutId = id ?? (typeof own(raw, "id") === "string" ? (own(raw, "id") as string) : "");
  if (!LAYOUT_ID.test(layoutId)) {
    if (id !== undefined || own(raw, "id") !== undefined) r.note("id", S.problem.id);
    layoutId = slugId(name?.en ?? name?.pt ?? "");
  }
  const description = readLabel(own(raw, "description"), 1000);
  const profile = own(raw, "profile");
  if (profile !== undefined && !isProfile(profile)) r.note("profile", S.problem.profile(String(profile).slice(0, 40)));
  const sources = r.sources(own(raw, "sources"));
  const columns = own(raw, "columns");
  const width = own(raw, "columnWidth");
  const layout: Layout = {
    version: LAYOUT_VERSION,
    id: layoutId,
    name: name ?? { pt: S.newLayout, en: S.newLayout },
    ...(description ? { description } : {}),
    ...(sources.length > 0 ? { sources } : {}),
    ...(isProfile(profile) ? { profile } : {}),
    diceRules: r.rules(own(raw, "diceRules")),
    appearance: r.appearance(own(raw, "appearance")),
    columns: typeof columns === "number" && Number.isInteger(columns) && columns >= 1 && columns <= 3 ? columns : 1,
    columnWidth: typeof width === "number" && width >= COLUMN_WIDTH.min && width <= COLUMN_WIDTH.max ? Math.round(width) : COLUMN_WIDTH.default,
    blocks: r.blocks(own(raw, "blocks"), "blocks", 0),
  };
  return { layout, problems: r.problems };
}
