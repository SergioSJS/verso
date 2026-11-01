// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table's log (ADR 0107, phase 1): one list of rolls, random-table
// rolls and oracle draws, newest at the bottom, kept in memory per folder
// for this run. Pure: no DOM, no IO. A `TableSource` is what the panel
// reads; phase 1 has only the local one (this window's rolls and the ones
// it hears in shared notes), phase 2 plugs the server's per-folder channel
// in behind the same interface.

import type { ContractError, DiceRoll, DiceTermRoll, OracleDraw, TableEntry as Wire } from "../bindings";
import { readDiceStyles, type DiceStyles } from "../dice3d/look";

/** `say`, `image` and `file` (any other file of the chat, linked) are the server table's (ADR 0107 item 3); `secret` is
 *  what a roll "to the owner" is to everyone but its roller and the owners. */
export type EntryKind = "roll" | "table" | "oracle" | "say" | "image" | "file" | "secret";
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
  /** Heard live from the same account on ANOTHER device or window (ADR 0107): still "Você" (`mine`), but news here: its dice fall, it sounds, it counts unread. */
  elsewhere?: boolean;
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
  /** The author's account, opaque (the server's); empty for a local entry. */
  byId: string;
  /** A message's text (plain). */
  text: string | null;
  /** An image's path in the folder. */
  image: string | null;
  pinned: boolean;
  /** A roll "to the owner", seen in full. */
  secret: boolean;
};

/** The most entries kept per folder (the oldest are dropped). */
export const MOST_KEPT = 500;

/** The fields only the server's entries fill. */
const PLAIN = { byId: "", text: null, image: null, pinned: false, secret: false } as const;

/** The roller's dice carried by a roll (ADR 0107 item 11: the server relays
 *  them with the roll), read field by field against the closed form; null
 *  when the roll carries none. */
export function stylesOf(roll: DiceRoll): DiceStyles | null {
  const raw = roll.styles;
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
    ...PLAIN,
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
    ...PLAIN,
  };
}

/** What the server's entry says of the oracle, in the words of the log: given by the
 *  caller (the oracle's strings are the window's, not the model's). */
export type OracleWords = (d: OracleDraw) => string;

/** One entry of the server's table as a line of the log; null for a kind
 *  this window does not know (a newer server's). `you` is `TableJoin.you`. */
export function entryOfServer(s: Wire, you: string, oracleWords: OracleWords): TableEntry | null {
  const at = Date.parse(s.at);
  const base = {
    id: s.id,
    by: s.by,
    mine: s.by_id !== "" && s.by_id === you,
    at: Number.isFinite(at) ? at : Date.now(),
    path: s.path ?? "",
    notation: "",
    source: null,
    terms: [] as DiceTermRoll[],
    modifier: 0,
    total: null,
    row: null,
    oracle: null,
    styles: null,
    byId: s.by_id,
    text: null,
    image: null,
    pinned: s.pinned,
    secret: s.secret,
  };
  if (s.kind === "roll" && s.roll) {
    const r = s.roll;
    return { ...base, kind: r.source ? "table" : "roll", notation: r.notation, source: r.source, terms: r.terms, modifier: r.modifier, total: r.total, styles: stylesOf(r) };
  }
  if (s.kind === "oracle" && s.draw) {
    const d = s.draw;
    const kind: OracleKind = d.kind === "question" ? "question" : d.kind === "spark" ? "spark" : "table";
    return { ...base, kind: "oracle", oracle: kind, total: kind === "spark" ? null : d.roll, row: oracleWords(d) };
  }
  if (s.kind === "say") return { ...base, kind: "say", text: s.text ?? "" };
  if ((s.kind === "image" || s.kind === "file") && s.image) return { ...base, kind: s.kind, image: s.image };
  if (s.kind === "secret") return { ...base, kind: "secret", secret: true, path: "" };
  return null;
}

/** Who is at the table. */
export type Member = { name: string; byId: string; color: string; styles: DiceStyles | null };

export type Role = "owner" | "editor" | "reader";

/** The server table's panel needs, beyond what any source gives: its own
 *  people, pins, writing, and the actions on an entry. Every action answers
 *  with the server's refusal in words, or null when it went through. */
export interface ServerTable extends TableSource {
  readonly server: true;
  /** The table this log is of, as the server named it: its folder inside the open folder, `""` for the folder itself. */
  readonly table: string;
  role(): Role;
  /** What the join said of the table's music (ADR 0116): whether this person controls it, and what plays. */
  joinedSound(): { play: boolean; playback: readonly import("../bindings").TablePlayback[] };
  /** Who is at the table now, in the server's order. */
  roster(): readonly Member[];
  /** Pinned entries, oldest first; always shown, whatever was hidden. */
  pinnedEntries(): readonly TableEntry[];
  /** Whether older entries than the ones held exist. */
  more(): boolean;
  loadOlder(): Promise<string | null>;
  say(text: string): Promise<string | null>;
  roll(notation: string, opts?: { source?: string | null; path?: string | null; secret?: boolean; occurrence?: number }): Promise<{ entry: Wire } | { error: string }>;
  sendImage(base64: string): Promise<string | null>;
  pin(id: string, pinned: boolean): Promise<string | null>;
  remove(id: string): Promise<string | null>;
  clear(keepPinned: boolean): Promise<string | null>;
  /** The next typed `/r` and the dice button roll "to the owner" (a note's die never does). */
  secret: boolean;
  /** Whether this window may send an image to the table (the right Images, ADR 0113 K.6). */
  canSendImage(): boolean;
  /** Whether it may send a file that is not an image (the right Files, K.6). */
  canSendFile(): boolean;
  canClear(): boolean;
  /** Whether this window may delete `e` (its author, or an owner; never a roll). */
  canDelete(e: TableEntry): boolean;
  /** Run a command of THIS window that the server also appends to the table (a note's room roll or oracle draw,
   *  which answer with no table id): `claim` names, from the answer, the entry the table will tell, so that
   *  entry is this window's own and not news (ADR 0107). Resolves with the command's answer. */
  making<T>(call: Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>, claim: (r: { status: "ok"; data: T } | { status: "error"; error: ContractError }) => ((e: TableEntry) => boolean) | null): Promise<{ status: "ok"; data: T } | { status: "error"; error: ContractError }>;
  /** The roller's dice or colour changed: tell the table. */
  look(): void;
  /** Leave the table (the folder closed); settles once the leave is
   *  answered, so a join after it is not undone by it. */
  close(): Promise<void>;
}

export function isServerTable(s: TableSource): s is ServerTable {
  return (s as Partial<ServerTable>).server === true;
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
  /** What the panel says of a source that is not shared, when it has more
   *  to say than "not shared" (a synced folder out of reach of its server). */
  notice?(): string | null;
}

/** Whether a roll's or draw's entry is the one a command of this window made: the room's answer has no table id. */
export const claimRoll = (path: string, roll: { notation: string; total: number }) => (e: TableEntry): boolean => (e.kind === "roll" || e.kind === "table") && e.path === path && e.notation === roll.notation && e.total === roll.total;
export const claimDraw = (path: string, d: { kind: string; roll: number }) => (e: TableEntry): boolean => e.kind === "oracle" && e.path === path && e.oracle === (d.kind === "question" ? "question" : d.kind === "spark" ? "spark" : "table") && (d.kind === "spark" || e.total === d.roll);

/** Whether `e` is news in this window: another person's, or the same account's from another device. */
export const isNews = (e: TableEntry): boolean => !e.mine || e.elsewhere === true;

/** The log of one folder. */
export class TableLog {
  constructor(private readonly most = MOST_KEPT) {}
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
    // Past the ceiling the oldest go; a pinned entry never does.
    while (this.list.length > this.most) {
      const at = this.list.findIndex((x) => !x.pinned);
      if (at < 0) break;
      const [gone] = this.list.splice(at, 1) as [TableEntry];
      this.ids.delete(gone.id);
    }
    if (isNews(e) && countUnread && !this.isHidden(e)) this.unseen++;
    return true;
  }
  /** Count `e`, held already, as unread (it turned out to come from another device). */
  countUnread(e: TableEntry): void {
    if (!this.isHidden(e)) this.unseen++;
  }
  /** Change the entry `id` in place; false when it is not held. */
  patch(id: string, change: Partial<TableEntry>): boolean {
    const i = this.list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.list[i] = { ...(this.list[i] as TableEntry), ...change };
    return true;
  }
  /** Drop the entry `id`; false when it is not held. */
  remove(id: string): boolean {
    const i = this.list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    this.ids.delete(id);
    return true;
  }
  /** The table cleared for everyone: all go, the pinned stay when asked. */
  clear(keepPinned: boolean): void {
    this.list = keepPinned ? this.list.filter((x) => x.pinned) : [];
    this.ids = new Set(this.list.map((x) => x.id));
    this.unseen = 0;
    this.cut = null;
    this.before = null;
  }
  /** The pinned entries, whatever was hidden. */
  pinned(): readonly TableEntry[] {
    return this.list.filter((x) => x.pinned);
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
