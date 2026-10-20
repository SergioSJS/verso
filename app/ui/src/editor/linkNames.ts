// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder's note names, ready to be matched against what is being typed
// (ADR 0089 item 5, revised 2026-10-15): a name — a note's, or one of its
// aliases — is matched whole, at the end of the words just typed, case
// ignored and accents kept (an accent written composed or decomposed is
// one accent, as it is one file name), three characters at least, the
// longest name winning, with the folders and the names the person asked
// not to be suggested, and the note being written, left out. The same
// rules the unlinked mentions follow in the core (crates/verso-core,
// mentions.rs), applied to the one place the cursor is.
//
// Built once from the folder's notes and aliases and kept until the
// folder changes; a keystroke is a few map lookups, however many notes
// there are. Pure: no page, no folder, no settings — the editor's field
// (linkSuggest.ts) and the wire (linkSuggestWire.ts) bring those.

import { linkFor } from "../mentionLink";

/** A note as the matching needs it: where it is, its name, its aliases. */
export type NoteNames = { path: string; name: string; aliases: string[] };

/** What the person asked not to be suggested (Settings › Editor). */
export type Rules = { ignoredFolders: string[]; ignoredNames: string[] };

/** A name found at the end of the typed words: where it starts in the
 *  text before the cursor, the words as typed, the note it names, and
 *  whether the words are an alias rather than the note's name. */
export type Hit = {
  start: number;
  text: string;
  path: string;
  name: string;
  alias: boolean;
  /** A partial suggestion only: the whole name (or alias) the typed words
   *  begin, as the note spells it. */
  full?: string;
};

type Entry = { path: string; name: string; alias: boolean; segments: number; text: string };

/** The most entries a partial list holds (ADR 0089 item 5, 2026-10-20). */
export const MAX_PARTIAL = 5;
/** How many keys of one prefix are looked at before ranking. */
const SCAN = 2000;
/** A capital letter or a digit: names, and notes named by a date or a
 *  number ("2026-10-20", "00 - Welcome"). */
const CAPITAL = /^[\p{Lu}\p{N}]/u;
const LETTERS = /[\p{L}\p{N}]/gu;

/** A name shorter than this is never suggested. */
export const MIN_LENGTH = 3;
/** What the partial list asks of the typed words: the person's two settings
 *  (the whole-name chip keeps `MIN_LENGTH`). */
export type PartialRule = { minLetters: number; capitalOnly: boolean };

/** Two spellings of a name are one when they fold alike: composed (NFC),
 *  lower case. */
export function fold(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

const WORDY = /[\p{L}\p{N}\p{M}_]/u;
/** A letter, a digit, `_`, or a mark of the letter before it; half of a
 *  surrogate pair counts as one so that a word is never cut in the middle
 *  of a character. */
export function wordy(c: string | undefined): boolean {
  if (c === undefined || c === "") return false;
  const unit = c.charCodeAt(0);
  if (unit >= 0xd800 && unit <= 0xdfff) return true;
  return WORDY.test(c[0] ?? "");
}

/** Where a word begins in `s`: a word character after a character that is
 *  not one. */
function startsOf(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) if (wordy(s[i]) && (i === 0 || !wordy(s[i - 1]))) out.push(i);
  return out;
}

function count(s: string, needle: string): number {
  let n = 0;
  for (let at = s.indexOf(needle); at >= 0; at = s.indexOf(needle, at + needle.length)) n++;
  return n;
}

/** Whether the words that begin at `start` of the line's text `before`
 *  the cursor are prose: not inside a link or an embed being written
 *  (`[[…`, `[…`, `](…`), inline code, math, a comment, an HTML tag, and
 *  not a tag (`#…`). Code blocks, the frontmatter and the rest of what
 *  spans lines are the syntax tree's to judge (linkSuggest.ts). */
export function proseBefore(before: string, start: number): boolean {
  // A tag: `#` before the run of word characters, `/` and `-` that holds the words.
  let i = start - 1;
  while (i >= 0 && (wordy(before[i]) || before[i] === "/" || before[i] === "-")) i--;
  if (i >= 0 && before[i] === "#" && (i === 0 || !wordy(before[i - 1]))) return false;
  const head = before.slice(0, start);
  if (head.lastIndexOf("[[") > head.lastIndexOf("]]")) return false;
  if (head.lastIndexOf("[") > head.lastIndexOf("]")) return false;
  if (head.lastIndexOf("](") > head.lastIndexOf(")")) return false;
  if (count(head, "`") % 2 === 1) return false;
  if (count(head, "$") % 2 === 1) return false;
  if (count(head, "%%") % 2 === 1) return false;
  if (head.lastIndexOf("<") > head.lastIndexOf(">")) return false;
  return true;
}

/** The link a suggestion writes over the typed words: `target` is the
 *  link's text for the note (`linkText`); a table's cell escapes the
 *  bar. As ADR 0089's "Link" writes it. */
export function linkWritten(hit: Hit, target: string, table: boolean): string {
  return linkFor({ text: hit.text, alias: hit.alias, table }, target);
}

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function byBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class LinkNames {
  private readonly byKey = new Map<string, Entry[]>();
  /** The first letters of the names: a start whose letter is not here is
   *  not looked up. */
  private readonly first = new Set<string>();
  /** The most word starts a name has: how far back from the cursor a
   *  name can begin. */
  private starts = 1;
  /** The longest a name is, in characters of the text as typed (a
   *  decomposed accent is a character more). */
  private reach = 0;
  /** How many names the map holds. */
  readonly size: number;
  /** The keys in order, built when a partial list is first asked for. */
  private sorted: string[] | null = null;

  constructor(notes: NoteNames[], rules: Rules) {
    const folders = rules.ignoredFolders.map((f) => f.trim().replace(/^\/+|\/+$/g, "").normalize("NFC")).filter(Boolean);
    const skipped = new Set(rules.ignoredNames.map((n) => fold(n.trim())).filter(Boolean));
    let size = 0;
    for (const note of notes) {
      const path = note.path.normalize("NFC");
      if (folders.some((f) => path.startsWith(`${f}/`))) continue;
      const segments = note.path.split("/").length;
      const names: [string, boolean][] = [[note.name, false], ...note.aliases.map((a): [string, boolean] => [a, true])];
      for (const [text, alias] of names) {
        const key = fold(text.trim());
        if (Array.from(key).length < MIN_LENGTH || skipped.has(key)) continue;
        const entry: Entry = { path: note.path, name: note.name, alias, segments, text: text.trim() };
        const list = this.byKey.get(key);
        if (list) list.push(entry);
        else this.byKey.set(key, [entry]);
        size++;
        const letter = key.normalize("NFD")[0];
        if (letter !== undefined) this.first.add(letter);
        this.starts = Math.max(this.starts, startsOf(key).length);
        // Decomposed, an accented letter is two characters.
        this.reach = Math.max(this.reach, text.normalize("NFD").length + 1, key.length);
      }
    }
    for (const list of this.byKey.values()) list.sort((a, b) => a.segments - b.segments || byBytes(a.path, b.path) || Number(a.alias) - Number(b.alias));
    this.size = size;
  }

  /** The longest name that ends `before` — the line's text up to the
   *  cursor — when `next`, the character after the cursor, does not
   *  continue the word, and the words are prose. `self` is the note being
   *  written: it is never suggested, and a name of several notes goes to
   *  the one nearest `self`'s folder. */
  find(typed: string, next: string, self: string): Hit | null {
    if (this.size === 0 || typed === "") return null;
    if (wordy(next[0])) return null;
    // A space or a mark of punctuation after the name does not end the
    // suggestion: it stays until the next word starts.
    let end = typed.length;
    while (end > 0 && !wordy(typed[end - 1])) end--;
    const before = typed.slice(0, end);
    if (before === "") return null;
    const floor = Math.max(0, before.length - this.reach);
    // Word starts inside the reach, from the last one back, at most as
    // many as a name has.
    const starts: number[] = [];
    for (let i = before.length - 1; i >= floor && starts.length < this.starts; i--) {
      if (wordy(before[i]) && (i === 0 || !wordy(before[i - 1]))) starts.push(i);
    }
    const home = dirOf(self);
    // The earliest start is the longest name: try it first.
    for (let k = starts.length - 1; k >= 0; k--) {
      const start = starts[k] ?? 0;
      const text = before.slice(start);
      // The first letter, decomposed: "É" and "E" + a mark are one letter.
      const head = text.slice(0, 2).normalize("NFD").toLowerCase()[0];
      if (head === undefined || !this.first.has(head)) continue;
      const list = this.byKey.get(fold(text));
      if (!list) continue;
      const usable = list.filter((e) => e.path !== self);
      if (usable.length === 0) continue;
      if (!proseBefore(before, start)) return null;
      const near = usable.find((e) => home === "" || e.path.startsWith(`${home}/`)) ?? usable[0];
      if (!near) continue;
      return { start, text, path: near.path, name: near.name, alias: near.alias };
    }
    return null;
  }

  /** The names the words just typed begin (ADR 0089 item 5, 2026-10-20):
   *  the cursor at the end of a word of three letters or more in all, the
   *  first word of the span beginning with a capital letter or a digit, the span a
   *  strict prefix of a name or alias. The longest span first, then the
   *  notes nearest `self`'s folder, then the shortest name; at most five
   *  notes, `self` never among them. */
  partial(before: string, next: string, self: string, rule: PartialRule = { minLetters: MIN_LENGTH, capitalOnly: true }): Hit[] {
    if (this.size === 0 || before === "" || wordy(next[0]) || !wordy(before[before.length - 1])) return [];
    if (!this.sorted) this.sorted = Array.from(this.byKey.keys()).sort(byBytes);
    const keys = this.sorted;
    const floor = Math.max(0, before.length - this.reach);
    const starts: number[] = [];
    for (let i = before.length - 1; i >= floor && starts.length < this.starts; i--) {
      if (wordy(before[i]) && (i === 0 || !wordy(before[i - 1]))) starts.push(i);
    }
    const home = dirOf(self);
    const out: Hit[] = [];
    const seen = new Set<string>();
    for (let k = starts.length - 1; k >= 0; k--) {
      const start = starts[k] ?? 0;
      const text = before.slice(start);
      if (rule.capitalOnly && !CAPITAL.test(text)) continue;
      if ((text.match(LETTERS)?.length ?? 0) < rule.minLetters) continue;
      const head = text.slice(0, 2).normalize("NFD").toLowerCase()[0];
      if (head === undefined || !this.first.has(head)) continue;
      const prefix = fold(text);
      let lo = 0;
      let hi = keys.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((keys[mid] ?? "") < prefix) lo = mid + 1;
        else hi = mid;
      }
      const found: { entry: Entry; key: string }[] = [];
      for (let i = lo; i < keys.length && i < lo + SCAN; i++) {
        const key = keys[i] ?? "";
        if (!key.startsWith(prefix)) break;
        if (key === prefix) continue;
        for (const entry of this.byKey.get(key) ?? []) if (entry.path !== self) found.push({ entry, key });
      }
      if (found.length === 0) continue;
      if (!proseBefore(before, start)) return [];
      found.sort(
        (a, b) =>
          Number(!(home === "" || a.entry.path.startsWith(`${home}/`))) - Number(!(home === "" || b.entry.path.startsWith(`${home}/`))) ||
          a.key.length - b.key.length ||
          a.entry.segments - b.entry.segments ||
          byBytes(a.entry.path, b.entry.path) ||
          Number(a.entry.alias) - Number(b.entry.alias),
      );
      for (const { entry } of found) {
        if (seen.has(entry.path)) continue;
        seen.add(entry.path);
        out.push({ start, text, path: entry.path, name: entry.name, alias: entry.alias, full: entry.text });
        if (out.length >= MAX_PARTIAL) return out;
      }
    }
    return out;
  }
}
