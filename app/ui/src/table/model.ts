// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's log (ADR 0107, phase 1): one list of rolls, random-table
// rolls and oracle draws, newest at the bottom, kept in memory per folder
// for this run. Pure: no DOM, no IO. A `TableSource` is what the panel
// reads; phase 1 has only the local one (this window's rolls and the ones
// it hears in shared notes), phase 2 plugs the server's per-folder channel
// in behind the same interface.

import type { DiceRoll, DiceTermRoll } from "../bindings";
import { readDiceStyles, type DiceStyles } from "../dice3d/look";

export type EntryKind = "roll" | "table" | "oracle";
export type OracleKind = "question" | "spark" | "table";

/** One line of the log. `by` is the roller's name as the server stamped it
 *  (empty for a roll this window made without a room); `mine` says the roll
 *  is this window's own, whatever `by` holds ("Você"). `at` is the time of
 *  the roll in ms (the server's clock when the server stamped it). */
export type TableEntry = {
  id: string;
  kind: EntryKind;
  by: string;
  mine: boolean;
  at: number;
  /** The note or board it was rolled from; empty for the palette's roller. */
  path: string;
  /** Dice: the notation, `1d20+3`; a table roll's `[[Note#^id]]` is `source`. */
  notation: string;
  source: string | null;
  terms: DiceTermRoll[];
  modifier: number;
  /** The total of a dice roll; the d100 face or the place of an oracle draw; null for a spark. */
  total: number | null;
  /** A random table's row, or the oracle's answer / words / entry. */
  row: string | null;
  oracle: OracleKind | null;
  /** The roller's dice, when known (ADR 0107 item 11); null: the default look. */
  styles: DiceStyles | null;
};

/** The most entries kept per folder (the oldest are dropped). */
export const MOST_KEPT = 500;

/** The roller's dice carried by a roll, when it carries them (ADR 0107
 *  item 11: the server relays them with the roll). Phase 1: a roll heard
 *  today has none, so this is null; the day the contract adds them it is
 *  read here, field by field, against a closed form. */
export function stylesOf(roll: DiceRoll): DiceStyles | null {
  const raw = (roll as DiceRoll & { styles?: unknown }).styles;
  return raw && typeof raw === "object" ? readDiceStyles(raw) : null;
}

const when = (at: string): number => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : Date.now();
};

/** The identity of a roll, so the same one heard twice (a room joined again,
 *  its last rolls told once more) is one line. */
export function rollKey(path: string, roll: DiceRoll): string {
  return ["r", path, roll.at, roll.by, roll.notation, roll.source ?? "", roll.total].join("\n");
}

/** A dice roll as an entry. `mine`: made by this window. */
export function entryOfRoll(path: string, roll: DiceRoll, o: { mine: boolean; row?: string | null; styles?: DiceStyles | null }): TableEntry {
  return {
    id: rollKey(path, roll),
    kind: roll.source ? "table" : "roll",
    by: roll.by,
    mine: o.mine,
    at: when(roll.at),
    path,
    notation: roll.notation,
    source: roll.source,
    terms: roll.terms,
    modifier: roll.modifier,
    total: roll.total,
    row: o.row ?? null,
    oracle: null,
    styles: o.styles ?? stylesOf(roll),
  };
}

/** An oracle draw as an entry. */
export function entryOfDraw(path: string, d: { kind: OracleKind; by: string; mine: boolean; at: number; roll: number | null; text: string; table?: string | null }): TableEntry {
  return {
    id: ["o", path, d.at, d.by, d.kind, d.roll ?? "", d.text].join("\n"),
    kind: "oracle",
    by: d.by,
    mine: d.mine,
    at: d.at,
    path,
    notation: d.table ?? "",
    source: null,
    terms: [],
    modifier: 0,
    total: d.roll,
    row: d.text,
    oracle: d.kind,
    styles: null,
  };
}

/** What a panel reads. Phase 2's server source implements it too, with
 *  `shared` true and `receivesOwn` true (the server tells this window its
 *  own rolls as well, so the local recorders stand down). */
export interface TableSource {
  /** Whether other people's rolls on this table are heard (a folder on a server). */
  readonly shared: boolean;
  /** Whether this source is told this window's own rolls itself. */
  readonly receivesOwn: boolean;
  /** What the person has not hidden, oldest first. */
  entries(): readonly TableEntry[];
  /** Entries by others that arrived while the panel was not on screen. */
  unread(): number;
  markSeen(): void;
  /** Hide the log up to the last entry shown now (local, undoable). */
  hideUpToHere(): void;
  /** Bring back what the last "hide up to here" hid; false when nothing is hidden. */
  undoHide(): boolean;
  hidden(): boolean;
  onChange(fn: () => void): () => void;
}

/** The log of one folder. */
export class TableLog {
  private list: TableEntry[] = [];
  private ids = new Set<string>();
  private cut: number | null = null;
  private before: number | null = null;
  private unseen = 0;
  /** Add `e`; false when it was there already. Others' entries count as unread. */
  add(e: TableEntry, countUnread = true): boolean {
    if (this.ids.has(e.id)) return false;
    this.ids.add(e.id);
    // Kept in time order: a late arrival (the room's last rolls, told on
    // joining) goes where it belongs, after the entries of the same ms.
    let i = this.list.length;
    while (i > 0 && (this.list[i - 1] as TableEntry).at > e.at) i--;
    this.list.splice(i, 0, e);
    while (this.list.length > MOST_KEPT) {
      const gone = this.list.shift() as TableEntry;
      this.ids.delete(gone.id);
    }
    if (!e.mine && countUnread && !this.isHidden(e)) this.unseen++;
    return true;
  }
  private isHidden(e: TableEntry): boolean {
    return this.cut !== null && e.at <= this.cut;
  }
  visible(): readonly TableEntry[] {
    return this.cut === null ? this.list : this.list.filter((e) => !this.isHidden(e));
  }
  /** Every entry, hidden or not (for tests). */
  all(): readonly TableEntry[] {
    return this.list;
  }
  unread(): number {
    return this.unseen;
  }
  markSeen(): void {
    this.unseen = 0;
  }
  /** Hide up to the newest entry shown. The cut is that entry's time, never
   *  the local clock: an entry that arrives later with an earlier time is
   *  inside the cut, as the server's cut will be (ADR 0107 item 6). */
  hideUpToHere(): void {
    const last = this.list[this.list.length - 1];
    if (!last) return;
    this.before = this.cut;
    this.cut = Math.max(last.at, this.cut ?? 0);
    this.unseen = 0;
  }
  undoHide(): boolean {
    if (this.cut === null) return false;
    this.cut = this.before;
    this.before = null;
    return true;
  }
  hidden(): boolean {
    return this.cut !== null;
  }
}
