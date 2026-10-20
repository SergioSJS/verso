// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Each block of a layout drawn from the sheet (ADR 0099 item 3), as the
// Fantasy Statblocks plugin draws its blocks (src/view/ui/*.svelte at
// f248f4af): a heading per key, a subheading of values joined, a property
// line, an ability table, saves, a list of traits, a paragraph, an image,
// and the containers. A block that names keys none of which holds a value
// is hidden when it says so (`hideWhenEmpty`), and shows its fallback
// otherwise; a container shows when any block in it does.

import { pictureAddress } from "../images";
import { pictureNode } from "../infobox";
import { readNotation } from "../dice/notation";
import { typedText } from "../strings";
import type { WriteOutcome } from "./edit";
import { h } from "./h";
import { inline, type DieMaker } from "./inline";
import type { Block, DiceRule, Layout, Predicate, PropertyBlock, TableBlock } from "./model";
import { modifierOf, signed } from "./modifier";
import { rollNode } from "./rollBlock";
import { present, numberOf, textOf, valueOf, type Sheet } from "./sheet";
import { S, word } from "./strings";
import { trackerNode } from "./tracker";

/** What a card is drawn with, beyond the YAML. */
export interface CardOptions {
  /** Draw with this layout instead of the one the block names (the
   *  editor's preview of the layout being edited). */
  layout?: Layout;
  /** The note the card is in: an image path is read from the folder as
   *  that note names it. */
  source?: string;
  /** The card's place — the note and which statblock of it — for the last
   *  card that read (ADR 0099 item 7) and the focus after a write. */
  key?: string;
  /** What makes a die of a notation (the note's own dice, which roll in a
   *  room through the server); none, and dice stay text (Dice off). */
  dice?: DieMaker;
  /** Whether roll blocks may roll (Dice on). */
  rolls?: boolean;
  /** Fixed dice for a roll block's profile (tests). */
  rollWith?: { deterministic?: number[] };
  /** Writes a tracker's value into the note; none, and trackers are
   *  read-only (a board's card, a reader). */
  write?: (key: string, value: number) => WriteOutcome;
  /** Opens the layouts (the layout's badge); none, and the window's event. */
  onLayout?: () => void;
  /** Opens the editor on the card's layout ("Edit this layout"); none, and
   *  the window's event `verso:edit-statblock-layout`. */
  onEditLayout?: (layoutId: string, text: string) => void;
}

/** What a block is drawn with. */
export interface Ctx {
  sheet: Sheet;
  layout: Layout;
  opts: CardOptions;
  /** The rules dice are read by, null for none. */
  rules: readonly DiceRule[] | null;
  /** Said in the card's live region. */
  say: (text: string) => void;
  /** The sheet's numbers, for a modifier expression's names. */
  numbers: Record<string, number>;
}

const MAX_ITEMS = 300;

/** A key as a label when the layout gives none: `damage_resistances` →
 *  "Damage resistances". */
export const keyWord = (k: string): string => {
  const s = k.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** The text of a value with its links, marks and — when the block rolls —
 *  its dice. */
function rich(ctx: Ctx, block: Block, text: string): Node[] {
  const rolls = block.dice !== false && (block.dice === true || ctx.layout.diceRules.length > 0);
  return inline(text, rolls ? ctx.rules : null, rolls ? ctx.opts.dice : undefined);
}

const anyPresent = (ctx: Ctx, keys: string[]): boolean => keys.some((k) => present(valueOf(ctx.sheet, k)));

/** A block whose keys are all empty: null when it hides, its fallback (or
 *  null) otherwise. */
function empty(block: Block, wrap: (text: string) => HTMLElement): HTMLElement | null {
  if (block.hideWhenEmpty || block.fallback === undefined || block.fallback === "") return null;
  return wrap(block.fallback);
}

function holder(block: Block, extra = ""): HTMLElement {
  const el = h("div", `statblock-block statblock-${block.type}${extra ? ` ${extra}` : ""}${block.rule ? " statblock-ruled" : ""}`);
  el.dataset["block"] = block.id;
  return el;
}

function propertyLine(ctx: Ctx, block: PropertyBlock): HTMLElement | null {
  const label = word(block.label, keyWord(block.properties[0] ?? ""));
  const line = (nodes: Node[]): HTMLElement => {
    const el = holder(block);
    el.append(h("span", "statblock-prop-name", label), " ");
    const val = h("span", "statblock-prop-value");
    val.append(...nodes);
    el.append(val);
    return el;
  };
  let text: string;
  if (block.template) {
    let any = false;
    text = block.template.replace(/\{([^{}\s]{1,80})\}/g, (_, k: string) => {
      const v = valueOf(ctx.sheet, k);
      if (present(v)) any = true;
      return textOf(v);
    });
    if (!any) return empty(block, (t) => line([document.createTextNode(t)]));
  } else {
    const shown = block.properties.map((k) => valueOf(ctx.sheet, k)).filter(present);
    if (shown.length === 0) return empty(block, (t) => line([document.createTextNode(t)]));
    text = shown.map((v) => textOf(v)).join(" ");
  }
  const nodes = rich(ctx, block, text);
  // The plugin's `diceProperty`: the dice of another key beside the value.
  if (block.diceKey && ctx.opts.dice) {
    const notation = readNotation(textOf(valueOf(ctx.sheet, block.diceKey)));
    if (notation) {
      const d = ctx.opts.dice(notation);
      d.classList.add("statblock-die");
      nodes.push(document.createTextNode(" "), d);
    }
  }
  return line(nodes);
}

function table(ctx: Ctx, block: TableBlock): HTMLElement | null {
  const keys = block.properties;
  let cells: unknown[];
  const first = valueOf(ctx.sheet, keys[0] ?? "");
  if (keys.length === 1 && Array.isArray(first)) cells = first.slice(0, 40);
  else cells = keys.map((k) => valueOf(ctx.sheet, k));
  if (!cells.some(present)) return empty(block, (t) => {
    const el = holder(block);
    el.textContent = t;
    return el;
  });
  const el = holder(block);
  const tableEl = h("table", "statblock-table");
  const caption = h("caption", "sr-only", word(block.label, S.scores));
  if (block.label) caption.className = "statblock-table-caption";
  tableEl.append(caption);
  const head = h("tr");
  const body = h("tr");
  cells.forEach((cell, i) => {
    const th = h("th", "", word(block.headers[i], keys.length === 1 ? String(i + 1) : keyWord(keys[i] ?? "")));
    th.scope = "col";
    head.append(th);
    const td = h("td");
    td.append(textOf(cell));
    const n = numberOf(cell);
    const mod = n === null ? null : modifierOf(block.modifier, n, ctx.numbers);
    if (mod !== null) {
      const m = h("span", "statblock-mod");
      m.append(h("span", "sr-only", `${S.modifier} `));
      const notation = readNotation(`1d20${signed(mod)}`);
      if (ctx.opts.dice && notation && block.dice !== false && block.modifier.kind === "d20") {
        m.append("(");
        const d = ctx.opts.dice(notation);
        d.classList.add("statblock-die");
        m.append(signed(mod), " ", d, ")");
      } else m.append(`(${signed(mod)})`);
      td.append(" ", m);
    }
    body.append(td);
  });
  const thead = h("thead");
  thead.append(head);
  const tbody = h("tbody");
  tbody.append(body);
  tableEl.append(thead, tbody);
  const scroll = h("div", "statblock-table-scroll");
  scroll.append(tableEl);
  el.append(scroll);
  return el;
}

/** A list of one-key maps (`- dexterity: 9`), a map, or `{name, desc}`
 *  items, as "Name +N" entries. */
function saves(ctx: Ctx, block: Block): HTMLElement | null {
  const v = valueOf(ctx.sheet, block.properties[0] ?? "");
  const items: unknown[] = Array.isArray(v) ? v : typeof v === "object" && v !== null ? Object.entries(v).map(([k, x]) => ({ [k]: x })) : present(v) ? [v] : [];
  const entries: string[] = [];
  for (const item of items.slice(0, MAX_ITEMS)) {
    if (typeof item === "string" || typeof item === "number") entries.push(String(item));
    else if (typeof item === "object" && item !== null) {
      const o = item as Record<string, unknown>;
      if (Object.hasOwn(o, "desc")) entries.push(`${textOf(o["name"])} ${textOf(o["desc"])}`.trim());
      else {
        const k = Object.keys(o)[0];
        if (k === undefined) continue;
        const x = o[k];
        const n = typeof x === "number" ? x : typeof x === "string" && /^\s*[+-]?\d+\s*$/.test(x) ? Number(x) : null;
        entries.push(`${keyWord(k)} ${n === null ? textOf(x) : signed(n)}`);
      }
    }
  }
  if (entries.length === 0) return empty(block, (t) => {
    const el = holder(block);
    el.append(h("span", "statblock-prop-name", word(block.label, keyWord(block.properties[0] ?? ""))), " ", t);
    return el;
  });
  const el = holder(block);
  el.append(h("span", "statblock-prop-name", word(block.label, keyWord(block.properties[0] ?? ""))), " ");
  entries.forEach((e, i) => {
    if (i > 0) el.append(", ");
    el.append(...rich(ctx, block, e));
  });
  return el;
}

/** A trait list: `{name, desc}` items (nested `traits` indented), one-key
 *  maps, strings — a string ending in ":" a line of its own (a spell
 *  list's "At will:"). */
function traits(ctx: Ctx, block: Block): HTMLElement | null {
  const items: unknown[] = [];
  for (const k of block.properties) {
    const v = valueOf(ctx.sheet, k);
    if (Array.isArray(v)) items.push(...v);
    else if (typeof v === "object" && v !== null) items.push(...Object.entries(v).map(([n, d]) => ({ name: n, desc: d })));
    else if (present(v)) items.push(v);
  }
  if (items.length === 0) return empty(block, (t) => {
    const el = holder(block);
    el.textContent = t;
    return el;
  });
  const el = holder(block);
  const title = word(block.label);
  if (title) el.append(h("h4", "statblock-section", title));
  const list = (from: unknown[], depth: number): HTMLElement => {
    const box = h("div", depth > 0 ? "statblock-traits statblock-traits-nested" : "statblock-traits");
    for (const item of from.slice(0, MAX_ITEMS)) {
      const row = h("div", "statblock-trait");
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        let name: string;
        let desc: unknown;
        let nested: unknown;
        if (Object.hasOwn(o, "name") || Object.hasOwn(o, "desc")) {
          name = textOf(o["name"]);
          desc = o["desc"];
          nested = o["traits"];
        } else {
          const k = Object.keys(o)[0] ?? "";
          name = k;
          desc = o[k];
        }
        if (name) row.append(h("strong", "statblock-trait-name", `${name}. `));
        row.append(...rich(ctx, block, textOf(desc)));
        if (Array.isArray(nested) && depth < 3) row.append(list(nested, depth + 1));
      } else if (Array.isArray(item)) {
        // The plugin's `[name, ...desc]` pair.
        const [name, ...rest] = item;
        row.append(h("strong", "statblock-trait-name", `${textOf(name)}. `), ...rich(ctx, block, rest.map((x) => textOf(x)).join(" ")));
      } else {
        const t = textOf(item);
        if (t.trim().endsWith(":")) row.classList.add("statblock-trait-head");
        row.append(...rich(ctx, block, t));
      }
      box.append(row);
    }
    if (from.length > MAX_ITEMS) box.append(h("div", "statblock-more", S.more(from.length - MAX_ITEMS)));
    return box;
  };
  el.append(list(items, 0));
  return el;
}

function holds(ctx: Ctx, p: Predicate): boolean {
  const v = valueOf(ctx.sheet, p.key);
  if (p.op === "has") return present(v);
  if (p.op === "equals") {
    if (typeof p.value === "number") return numberOf(v) === p.value;
    if (typeof p.value === "boolean") return v === p.value || (typeof v === "string" && v.trim().toLowerCase() === String(p.value));
    return typeof v === "string" || typeof v === "number" ? String(v).trim().toLowerCase() === p.value.trim().toLowerCase() : false;
  }
  const n = numberOf(v);
  return n !== null && n > p.value;
}

/** Blocks drawn in order, those that hide left out. */
export function drawAll(ctx: Ctx, blocks: Block[], depth = 0): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const b of blocks) {
    const el = draw(ctx, b, depth);
    if (el) out.push(el);
  }
  return out;
}

/** One block, or null when it does not show. */
export function draw(ctx: Ctx, block: Block, depth = 0): HTMLElement | null {
  if (depth > 12) return null;
  switch (block.type) {
    case "heading": {
      const text = block.properties.map((k) => valueOf(ctx.sheet, k)).filter(present).map((v) => textOf(v)).join(" ");
      const shown = text || (block.hideWhenEmpty ? "" : block.fallback ?? "");
      if (!shown) return null;
      const level = Math.min(6, block.size + 2);
      const el = holder(block, `statblock-size-${block.size}`);
      const hEl = h(`h${level}` as "h3", "statblock-heading-text");
      hEl.append(...inline(shown, null));
      el.append(hEl);
      return el;
    }
    case "subheading": {
      const parts = block.properties.map((k) => valueOf(ctx.sheet, k)).filter(present).map((v) => textOf(v));
      if (parts.length === 0) return empty(block, (t) => {
        const el = holder(block);
        el.textContent = t;
        return el;
      });
      const el = holder(block);
      el.append(...inline(parts.join(block.separator), null));
      return el;
    }
    case "property":
      return propertyLine(ctx, block);
    case "table":
      return table(ctx, block);
    case "saves":
      return saves(ctx, block);
    case "traits":
      return traits(ctx, block);
    case "text": {
      const fixed = word(block.text);
      const text = fixed || block.properties.map((k) => valueOf(ctx.sheet, k)).filter(present).map((v) => textOf(v)).join("\n\n");
      if (!text) return empty(block, (t) => {
        const el = holder(block);
        el.textContent = t;
        return el;
      });
      const el = holder(block);
      const title = word(block.label);
      if (title) el.append(h("h4", "statblock-section", title));
      for (const para of text.split(/\n{2,}/).slice(0, 100)) {
        const p = h("p", "statblock-paragraph");
        p.append(...rich(ctx, block, para));
        el.append(p);
      }
      return el;
    }
    case "image": {
      const raw = block.properties.map((k) => valueOf(ctx.sheet, k)).find((v) => typeof v === "string" && v.trim());
      if (typeof raw !== "string") return null;
      const name = textOf(valueOf(ctx.sheet, "name")) || S.card;
      const source = ctx.opts.source;
      const node = pictureNode(
        imageTarget(raw),
        { strings: typedText.picture, resolve: source === undefined ? async () => null : (target) => pictureAddress(source, target), title: name, status: () => {} },
        "statblock-image",
      );
      if (!node) return null;
      const el = holder(block);
      el.append(node);
      return el;
    }
    case "group":
    case "inline":
    case "collapse": {
      const kids = drawAll(ctx, block.nested, depth + 1);
      // A container shows when a block in it does (the plugin's
      // `checkConditioned`).
      if (kids.length === 0) return null;
      const title = word(block.label);
      if (block.type === "collapse") {
        const el = holder(block);
        const details = h("details", "statblock-collapse");
        details.open = block.open;
        const summary = h("summary", "statblock-section", title || S.card);
        details.append(summary, ...kids);
        el.append(details);
        return el;
      }
      const el = holder(block, block.type === "inline" ? "statblock-row" : "");
      if (title) el.append(h("h4", "statblock-section", title));
      el.append(...kids);
      return el;
    }
    case "conditional": {
      const branch = block.branches.find((b) => (b.when ? holds(ctx, b.when) !== (b.not === true) : true));
      if (!branch) return null;
      const kids = drawAll(ctx, branch.nested, depth + 1);
      if (kids.length === 0) return null;
      const el = holder(block);
      el.append(...kids);
      return el;
    }
    case "tracker": {
      if (block.hideWhenEmpty && !anyPresent(ctx, block.properties.length > 0 ? block.properties : [block.current])) return null;
      const el = holder(block);
      el.append(trackerNode(block, ctx));
      return el;
    }
    case "roll": {
      const node = rollNode(block, ctx);
      if (!node) return null;
      const el = holder(block);
      el.append(node);
      return el;
    }
  }
}

/** What an `image:` value names, as the picture helper reads it: a folder
 *  path or a web address; `[[a.png]]`, `![[a.png]]` and `![alt](a.png)`
 *  unwrapped. */
export function imageTarget(value: string): string {
  const v = value.trim();
  if (v.startsWith("![[")) return v.slice(1);
  const md = /^!\[[^\]]*\]\(([^)\s]+)/.exec(v);
  return md ? md[1]!.trim() : v;
}
