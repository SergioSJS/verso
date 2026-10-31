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
import type { Value, ValuePath, WriteOutcome } from "./edit";
import { h } from "./h";
import { inline, type DieMaker } from "./inline";
import type { Block, DiceRule, Layout, Predicate, PropertyBlock, TableBlock, TraitsBlock } from "./model";
import { d20Of, modifierOf, signed } from "./modifier";
import { rollNode } from "./rollBlock";
import { present, numberOf, textOf, valueOf, type Sheet } from "./sheet";
import { S, word } from "./strings";
import { trackerLabel, trackerNode } from "./tracker";

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
  write?: (at: ValuePath, value: Value) => WriteOutcome;
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

/** A table of scores (the plugin's `table`), as a grid of cells, each its
 *  name over its value and modifier: six to a row in a wide card, three
 *  (or half) when the block is narrow (statblock.css), never wider than
 *  its block. A d20 modifier is its own die — "(+2)" is the button, rolling
 *  `1d20+2` — so no text of the cell is read for dice. */
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
  const title = word(block.label, S.scores);
  if (block.label) el.append(h("div", "statblock-table-caption", title));
  const grid = h("div", "statblock-scores");
  grid.setAttribute("role", "list");
  grid.setAttribute("aria-label", title);
  const n = cells.length;
  grid.style.setProperty("--sb-cells", String(Math.min(n, 6)));
  grid.style.setProperty("--sb-cells-narrow", String(n <= 3 ? n : n <= 6 ? Math.ceil(n / 2) : 3));
  cells.forEach((cell, i) => {
    const name = word(block.headers[i], keys.length === 1 ? String(i + 1) : keyWord(keys[i] ?? ""));
    const item = h("div", "statblock-score");
    item.setAttribute("role", "listitem");
    item.append(h("span", "statblock-score-name", name));
    const line = h("span", "statblock-score-line");
    line.append(h("span", "statblock-score-value", textOf(cell)));
    const num = numberOf(cell);
    const mod = num === null ? null : modifierOf(block.modifier, num, ctx.numbers);
    if (mod !== null) {
      // A minus sign, as a book prints it; the notation keeps the hyphen.
      const shown = `(${signed(mod).replace("-", "−")})`;
      const notation = readNotation(d20Of(mod));
      if (ctx.opts.dice && notation && block.dice !== false && block.modifier.kind === "d20") {
        const d = ctx.opts.dice(notation, { text: shown, label: S.rollFor(notation, name) });
        d.classList.add("statblock-die", "statblock-mod");
        line.append(" ", d);
      } else {
        const m = h("span", "statblock-mod");
        m.append(h("span", "sr-only", `${S.modifier} `), shown);
        line.append(" ", m);
      }
    }
    item.append(line);
    grid.append(item);
  });
  el.append(grid);
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
/** Whether an item's mark reads as on: true, 1, "true", "yes", "sim". */
const on = (v: unknown): boolean => v === true || v === 1 || (typeof v === "string" && /^(true|yes|sim|1)$/i.test(v.trim()));

/** An item's mark (the block's `flag`): a toggle that writes the item's
 *  key back into the YAML, as a tracker does, the item struck through
 *  when it is on. Read-only cards show the mark, not a button. */
function flagToggle(ctx: Ctx, block: TraitsBlock, row: HTMLElement, item: Record<string, unknown>, at: [string, number], name: string, counted: () => void): void {
  const flag = block.flag!;
  const label = word(flag.label, flag.key);
  let state = on(item[flag.key]);
  row.classList.toggle("statblock-trait-flagged", state);
  const write = ctx.opts.write;
  if (!write) {
    if (state) row.append(" ", h("span", "statblock-flag-mark", label));
    return;
  }
  const btn = h("button", "statblock-flag", label);
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(state));
  // A link's shown text, not its brackets, in the button's name.
  const plain = name.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => alias ?? target);
  btn.setAttribute("aria-label", S.flagAria(label, plain || String(at[1] + 1)));
  const note = h("span", "statblock-tracker-note");
  note.setAttribute("role", "status");
  btn.addEventListener("click", () => {
    const done = write([at[0], at[1], flag.key], !state);
    if (done.ok) {
      state = !state;
      // The drawn item holds the new mark, so the count says it at once.
      item[flag.key] = state;
      counted();
      btn.setAttribute("aria-pressed", String(state));
      row.classList.toggle("statblock-trait-flagged", state);
      note.textContent = "";
      ctx.say(S.saved(S.flagAria(label, name), state ? "✓" : "—"));
    } else {
      note.textContent = S.refusal[done.why];
      ctx.say(S.refusal[done.why]);
    }
  });
  row.prepend(btn, " ");
  row.append(note);
}

/** A trait list: `{name, desc}` items (nested `traits` indented), one-key
 *  maps, strings — a string ending in ":" a line of its own (a spell
 *  list's "At will:"). */
function traits(ctx: Ctx, block: TraitsBlock): HTMLElement | null {
  // Each item with where it is in the YAML, when it is a list's item: what
  // a mark writes back to.
  const items: { item: unknown; at?: [string, number] }[] = [];
  for (const k of block.properties) {
    const v = valueOf(ctx.sheet, k);
    if (Array.isArray(v)) v.forEach((item, i) => items.push({ item, at: [k, i] }));
    else if (typeof v === "object" && v !== null) items.push(...Object.entries(v).map(([n, d]) => ({ item: { name: n, desc: d } })));
    else if (present(v)) items.push({ item: v });
  }
  if (items.length === 0) return empty(block, (t) => {
    const el = holder(block);
    el.textContent = t;
    return el;
  });
  const el = holder(block);
  const title = word(block.label);
  const heading = title ? h("h4", "statblock-section", title) : null;
  if (heading) el.append(heading);
  // "N de M quebrados", worked out from the items as they are drawn.
  const countText = block.flag?.count ? word(block.flag.count) : "";
  const count = countText ? h("span", "statblock-flag-count") : null;
  const counted = () => {
    if (!count || !block.flag) return;
    const marks = items.filter((x) => x.at && typeof x.item === "object" && x.item !== null && !Array.isArray(x.item));
    const n = marks.filter((x) => on((x.item as Record<string, unknown>)[block.flag!.key])).length;
    count.textContent = countText.replace(/\{n\}/g, String(n)).replace(/\{m\}/g, String(marks.length));
  };
  if (count) {
    counted();
    if (heading) heading.append(" ", count);
    else el.append(count);
  }
  const list = (from: { item: unknown; at?: [string, number] }[], depth: number): HTMLElement => {
    const box = h("div", depth > 0 ? "statblock-traits statblock-traits-nested" : "statblock-traits");
    for (const { item, at } of from.slice(0, MAX_ITEMS)) {
      const row = h("div", "statblock-trait");
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        let name: string;
        let desc: unknown;
        let nested: unknown;
        // `name` and `desc` as the plugin writes them, `nome` and
        // `descricao` as a note in Portuguese does.
        const nameKey = ["name", "nome"].find((k) => Object.hasOwn(o, k));
        const descKey = ["desc", "descricao"].find((k) => Object.hasOwn(o, k));
        if (nameKey || descKey) {
          name = nameKey ? textOf(o[nameKey]) : "";
          desc = descKey ? o[descKey] : undefined;
          nested = o["traits"];
        } else {
          // A one-key map, `Name: description`: its key, never the mark's.
          const k = Object.keys(o).find((x) => x !== block.flag?.key) ?? "";
          name = k;
          desc = o[k];
        }
        const said = textOf(desc);
        if (name) {
          // A name may be a link (`[[Ninho de Krard]]`, another Desafio):
          // drawn as one, so its click opens the note.
          const strong = h("strong", "statblock-trait-name");
          strong.append(...inline(name, null), said ? ". " : "");
          row.append(strong);
        }
        row.append(...rich(ctx, block, said));
        if (Array.isArray(nested) && depth < 3) row.append(list(nested.map((x) => ({ item: x })), depth + 1));
        if (block.flag && at && depth === 0) flagToggle(ctx, block, row, o, at, name, counted);
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
      // A label made from the sheet (`{reserva_1_nome}`) that comes out empty.
      if (block.hideWhenEmpty && trackerLabel(block, ctx.sheet) === "") return null;
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
