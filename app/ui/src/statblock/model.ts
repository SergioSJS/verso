// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout model of a statblock card (ADR 0099 item 3): the Fantasy
// Statblocks plugin's tree of typed blocks bound to the keys of the YAML
// (github.com/Obsidian-TTRPG-Community/fantasy-statblocks, MIT, Jeremy
// Valentine; studied at f248f4af, src/layouts/layout.types.ts), with every
// field the plugin runs as JavaScript replaced by a declarative one or left
// out, and two blocks of Verso's own: `tracker` and `roll`. A layout is
// data from the folder — written by anyone who shares it — so nothing in it
// is ever run, and what reaches the page is checked by `validate.ts`.

/** The version of this model a layout file says it follows. */
export const LAYOUT_VERSION = 1;

/** A word in both of the interface's languages; one may be missing, and
 *  the other is shown then. */
export interface Label {
  pt?: string;
  en?: string;
}

export const BLOCK_TYPES = [
  "heading",
  "subheading",
  "property",
  "table",
  "saves",
  "traits",
  "text",
  "image",
  "group",
  "inline",
  "collapse",
  "conditional",
  "tracker",
  "roll",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** What every block has. `properties` are the sheet's keys the block
 *  reads; `hideWhenEmpty` (the plugin's `conditioned`) hides the block
 *  when none of them holds a value; `fallback` is shown in their place
 *  otherwise; `rule` draws a rule after the block (`hasRule`); `dice`
 *  turns dice in its text into buttons by the layout's dice rules. */
export interface BlockBase {
  id: string;
  type: BlockType;
  properties: string[];
  label?: Label;
  hideWhenEmpty?: boolean;
  fallback?: string;
  rule?: boolean;
  dice?: boolean;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  /** 1 (largest) to 6. */
  size: number;
}

export interface SubheadingBlock extends BlockBase {
  type: "subheading";
  separator: string;
}

export interface PropertyBlock extends BlockBase {
  type: "property";
  /** In place of the plugin's `callback`: the value as text with `{key}`
   *  placeholders, each the sheet's value of that key (`{ac} ({ac_note})`). */
  template?: string;
  /** The plugin's `diceProperty`: a key whose value is the dice to roll
   *  beside this one (`hit_dice` beside `hp`). */
  diceKey?: string;
}

/** How a table's modifier is worked out from a score — a closed list, or
 *  an expression of Rolai's restricted evaluator (no `eval`), floored. */
export type Modifier = { kind: "none" } | { kind: "d20" } | { kind: "expression"; expression: string } | { kind: "bands"; bands: ModifierBand[] };

/** A row of a printed modifier table: a score from `min` to `max` (whole
 *  numbers, both included) gives `value` — Dungeon World's 1–3 → −3,
 *  4–5 → −2… A score in no row has no modifier. */
export interface ModifierBand {
  min: number;
  max: number;
  value: number;
}

export interface TableBlock extends BlockBase {
  type: "table";
  headers: Label[];
  modifier: Modifier;
}

export interface SavesBlock extends BlockBase {
  type: "saves";
}

export interface TraitsBlock extends BlockBase {
  type: "traits";
  /** A mark each item of the list may carry (a Fractal Fato "quebrado"):
   *  the item's key holding true or false, drawn as a toggle — the item
   *  struck through when on — that writes back like a tracker. `count`,
   *  with `{n}` and `{m}`, is said beside the list's heading, worked out
   *  from the items ("{n} de {m} quebrados"), never stored. */
  flag?: { key: string; label?: Label; count?: Label };
}

export interface TextBlock extends BlockBase {
  type: "text";
  /** Fixed text; without it, the first key's text. */
  text?: Label;
}

export interface ImageBlock extends BlockBase {
  type: "image";
}

export interface GroupBlock extends BlockBase {
  type: "group" | "inline";
  nested: Block[];
}

export interface CollapseBlock extends BlockBase {
  type: "collapse";
  nested: Block[];
  open: boolean;
}

/** The plugin's `ifelse` without code: a structured test of the sheet. */
export type Predicate =
  | { op: "has"; key: string }
  | { op: "equals"; key: string; value: string | number | boolean }
  | { op: "above"; key: string; value: number };

export interface ConditionalBlock extends BlockBase {
  type: "conditional";
  /** The first branch whose test holds is drawn; a branch with no test is
   *  the "otherwise". */
  branches: { when?: Predicate; not?: boolean; nested: Block[] }[];
}

/** A tracker's `label` may hold `{key}` placeholders, each the sheet's
 *  value of that key (`{reserva_1_nome}` reads "Vida"); a label that comes
 *  out empty hides the tracker when it hides when empty. */
export interface TrackerBlock extends BlockBase {
  type: "tracker";
  /** The key holding the current value — the one a click writes. */
  current: string;
  /** The key holding the maximum, or the maximum itself. */
  max: string | number;
  style: "boxes" | "number";
}

/** An input of a roll block: from a key of the sheet, or a fixed value. */
export type RollInput = { key: string } | { value: string | number };

export interface RollBlock extends BlockBase {
  type: "roll";
  /** A Rolai profile id; without it, the layout's. */
  profile?: string;
  /** The profile's inputs taken from the sheet; the rest are asked. */
  inputs: Record<string, RollInput>;
}

export type Block =
  | HeadingBlock
  | SubheadingBlock
  | PropertyBlock
  | TableBlock
  | SavesBlock
  | TraitsBlock
  | TextBlock
  | ImageBlock
  | GroupBlock
  | CollapseBlock
  | ConditionalBlock
  | TrackerBlock
  | RollBlock;

/** A rule that makes dice of a text: a pattern (checked against runaway
 *  backtracking, `regexGuard.ts`) and the notation it makes, `$1`… for the
 *  pattern's groups. In place of the plugin's `diceParsing[].parser`. */
export interface DiceRule {
  pattern: string;
  template: string;
}

/** The appearance tokens: a closed list, each of one kind. No raw CSS. */
export const COLOR_TOKENS = ["accent", "rule", "background", "text", "bar"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export const FONTS = ["display", "book", "ui", "mono"] as const;
export type FontToken = (typeof FONTS)[number];

export interface Appearance {
  /** Colours for the light theme and for the dark one, `#rgb` or `#rrggbb`. */
  light?: Partial<Record<ColorToken, string>>;
  dark?: Partial<Record<ColorToken, string>>;
  /** One of the app's fonts, for the headings and for the text. */
  headingFont?: FontToken;
  bodyFont?: FontToken;
}

/** Where a layout's fields were read: a page or file of the system's
 *  publisher, shown on the layout's credits (ADR 0099 item 6). */
export interface LayoutSource {
  label: string;
  /** An `https://` address. */
  url: string;
}

export interface Layout {
  version: number;
  id: string;
  name: Label;
  description?: Label;
  /** The sources the layout's fields come from (`docs/reference/statblock-sources.md`). */
  sources?: LayoutSource[];
  /** The Rolai profile the layout's roll blocks use by default. */
  profile?: string;
  diceRules: DiceRule[];
  appearance: Appearance;
  /** The most columns the card flows into, 1 to 3, and the width under
   *  which it takes one fewer (the plugin's `columns`, `columnWidth`). */
  columns: number;
  columnWidth: number;
  blocks: Block[];
}

/** Bounds of a layout: past them a layout is cut, and says so. */
export const LIMITS = {
  /** Blocks in all, nested ones counted. */
  blocks: 400,
  /** Nesting depth of groups. */
  depth: 8,
  /** Keys a block reads. */
  properties: 40,
  /** A key's length. */
  key: 80,
  /** A label's or a short text's length. */
  label: 200,
  /** A text block's or a template's length. */
  text: 4000,
  /** Dice rules of a layout, a pattern's length, a template's length. */
  rules: 20,
  pattern: 200,
  template: 60,
  /** A modifier expression's length. */
  expression: 200,
  /** Headers of a table, branches of a conditional, inputs of a roll,
   *  rows of a modifier table. */
  headers: 30,
  bands: 40,
  branches: 10,
  inputs: 20,
  /** Sources of a layout, and a source's address length. */
  sources: 12,
  url: 300,
  /** A layout file, as text. */
  bytes: 256 * 1024,
} as const;

/** An id a layout file may have: the folder data contract's
 *  (`^[a-z0-9][a-z0-9-]{0,63}$`). */
export const LAYOUT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const COLUMN_WIDTH = { min: 240, max: 800, default: 400 } as const;
