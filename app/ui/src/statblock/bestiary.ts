// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a base is found (ADR 0099 item 1, 0099.1 = A): the plugin's bestiary
// is private data; Verso's is made of ordinary notes (the maintainer,
// 2026-10-21: "o bestiário vira notas normais"). A creature is
//
//   * a ```statblock block of a note (its `name:` is the creature's name), or
//   * the note's frontmatter, when it says `statblock: true` (the plugin's
//     rule; `statblock: inline` means the first block).
//
// `monster: Goblin` / `extends: Goblin` (a name) takes, in this order:
//   1. a creature whose `name:` is Goblin — exact spelling before the same
//      ignoring case and accents;
//   2. the first creature of a note titled Goblin (its file name);
// and between equals the note that comes first in path order (code point
// order). `extends: [[Goblin]]` (a link) is the note the link names, by the
// window's own link resolution; its creature is the note's first one.
//
// Cards are drawn synchronously, so notes are read ahead into memory and the
// cards redrawn when they arrive or change (the same way the folder's
// layouts are, store.ts). Nothing here writes: reading only.

import { statblockFences } from "./edit";
import { readSheet, textOf, valueOf, type Sheet } from "./sheet";
import type { Found, Lookup, Ref } from "./inherit";

/** What the window gives: the note list, a note's text, a words search and
 *  the link resolution. Tests give an in-memory one. */
export interface BestiaryIO {
  notes(): readonly string[];
  /** The note's text, or null when it cannot be read. */
  read(path: string): Promise<string | null>;
  /** The paths of the notes the words match. */
  find(words: string, limit: number): Promise<string[]>;
  resolveLink(target: string, from: string): string | null;
  /** Which folder is open: another one makes everything read forgotten. */
  key?(): string;
}

export interface Creature {
  id: string;
  name: string;
  sheet: Sheet;
}

export interface NoteEntry {
  path: string;
  text: string;
  creatures: Creature[];
  /** The one a note stands for when it is named by its title or a link. */
  first: Creature | null;
}

const MAX_BLOCKS = 50;
const SEARCH_LIMIT = 50;

const fold = (s: string): string => s.normalize("NFC").trim().toLowerCase();
const stem = (path: string): string => {
  const f = path.split("/").pop() ?? path;
  return f.toLowerCase().endsWith(".md") ? f.slice(0, -3) : f;
};

/** Code point order, which is UTF-8 byte order. */
function byPath(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** The creatures a note's text holds. */
export function entryOf(path: string, text: string): NoteEntry {
  const creatures: Creature[] = [];
  let flagged: Creature | null = null;
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  let body = text;
  if (fm) {
    body = text.slice(fm[0].length);
    const r = readSheet(fm[1] ?? "");
    if (r.ok) {
      const flag = valueOf(r.sheet, "statblock");
      if (flag === true || (typeof flag === "string" && flag.trim().toLowerCase() === "true")) {
        flagged = { id: `${path}#fm`, name: textOf(valueOf(r.sheet, "name")).trim(), sheet: r.sheet };
        creatures.push(flagged);
      }
    }
  }
  statblockFences(body)
    .slice(0, MAX_BLOCKS)
    .forEach((f, i) => {
      const r = readSheet(f.text);
      if (r.ok) creatures.push({ id: `${path}#${i}`, name: textOf(valueOf(r.sheet, "name")).trim(), sheet: r.sheet });
    });
  const firstBlock = creatures.find((c) => !c.id.endsWith("#fm")) ?? null;
  return { path, text, creatures, first: flagged ?? firstBlock };
}

type Listener = () => void;

export class Bestiary {
  private entries = new Map<string, NoteEntry | null>();
  private loading = new Map<string, Promise<void>>();
  private searches = new Map<string, string[]>();
  private searching = new Set<string>();
  private listeners = new Set<Listener>();
  /** Bumped by `reset`, so a read that finishes after it is dropped. */
  private epoch = 0;
  private folderKey: string | undefined;

  constructor(private io: BestiaryIO) {
    this.folderKey = io.key?.();
  }

  /** Another folder was opened: forget what the last one gave (silently:
   *  the cards of the old folder are gone with it). */
  private sameFolder(): void {
    const k = this.io.key?.();
    if (k === this.folderKey) return;
    this.folderKey = k;
    this.forget();
  }

  private forget(): void {
    this.epoch++;
    this.entries = new Map();
    this.loading = new Map();
    this.searches = new Map();
    this.searching = new Set();
  }

  onChange(run: Listener): () => void {
    this.listeners.add(run);
    return () => this.listeners.delete(run);
  }

  private changed(): void {
    for (const f of [...this.listeners]) {
      try {
        f();
      } catch {
        // One card's failure is not the others'.
      }
    }
  }

  private load(path: string): void {
    if (this.loading.has(path)) return;
    const epoch = this.epoch;
    const p = this.io
      .read(path)
      .catch(() => null)
      .then((text) => {
        if (epoch !== this.epoch) return;
        this.entries.set(path, text === null ? null : entryOf(path, text));
        this.loading.delete(path);
        this.changed();
      });
    this.loading.set(path, p);
  }

  private search(key: string, words: string): void {
    if (this.searching.has(key)) return;
    this.searching.add(key);
    const epoch = this.epoch;
    void this.io
      .find(words, SEARCH_LIMIT)
      .catch(() => [] as string[])
      .then((paths) => {
        if (epoch !== this.epoch) return;
        this.searches.set(key, paths);
        this.searching.delete(key);
        this.changed();
      });
  }

  /** The base a reference names, "pending" while notes are being read. */
  lookup(ref: Ref, from: string | undefined): Found | "pending" | null {
    this.sameFolder();
    if (ref.kind === "link") {
      const path = this.io.resolveLink(ref.text, from ?? "");
      if (path === null) return null;
      const e = this.entries.get(path);
      if (e === undefined) {
        this.load(path);
        return "pending";
      }
      return e?.first ? found(e.path, e.first, ref.text) : null;
    }
    const key = fold(ref.text);
    const hits = this.searches.get(key);
    if (hits === undefined) {
      this.search(key, ref.text);
      return "pending";
    }
    const titled = this.io.notes().filter((p) => fold(stem(p)) === key);
    const candidates = [...new Set([...hits, ...titled, ...(from ? [from] : [])])];
    let waiting = false;
    for (const p of candidates) {
      if (this.entries.get(p) === undefined) {
        this.load(p);
        waiting = true;
      }
    }
    if (waiting) return "pending";
    // [tier, exact spelling, path]: a creature named so, then a note titled so.
    const ranked: { tier: number; exact: number; entry: NoteEntry; creature: Creature }[] = [];
    for (const p of candidates) {
      const e = this.entries.get(p);
      if (!e) continue;
      for (const c of e.creatures) {
        if (c.name !== "" && fold(c.name) === key) ranked.push({ tier: 0, exact: c.name === ref.text.trim() ? 0 : 1, entry: e, creature: c });
      }
      if (e.first && titled.includes(p)) ranked.push({ tier: 1, exact: stem(p) === ref.text.trim() ? 0 : 1, entry: e, creature: e.first });
    }
    ranked.sort((a, b) => a.tier - b.tier || a.exact - b.exact || byPath(a.entry.path, b.entry.path) || byPath(a.creature.id, b.creature.id));
    const best = ranked[0];
    return best ? found(best.entry.path, best.creature, ref.text) : null;
  }

  /** Read everything used again (a note changed, appeared or went): the
   *  cards are told only if what they would draw is different. */
  async refresh(): Promise<void> {
    this.sameFolder();
    const epoch = this.epoch;
    const paths = [...this.entries.keys()];
    const words = [...this.searches.keys()];
    const nextEntries = new Map<string, NoteEntry | null>();
    await Promise.all(
      paths.map(async (p) => {
        const text = await this.io.read(p).catch(() => null);
        nextEntries.set(p, text === null ? null : entryOf(p, text));
      }),
    );
    const nextSearches = new Map<string, string[]>();
    await Promise.all(words.map(async (w) => nextSearches.set(w, await this.io.find(w, SEARCH_LIMIT).catch(() => []))));
    if (epoch !== this.epoch) return;
    const sig = (e: Map<string, NoteEntry | null>, s: Map<string, string[]>): string =>
      JSON.stringify([[...e].map(([p, v]) => [p, v?.text ?? null]), [...s]]);
    const before = sig(this.entries, this.searches);
    this.entries = nextEntries;
    this.searches = nextSearches;
    if (sig(nextEntries, nextSearches) !== before) this.changed();
  }

  /** Forget everything (another folder was opened). */
  reset(): void {
    this.forget();
    this.changed();
  }
}

function found(path: string, c: Creature, asked: string): Found {
  return { id: c.id, path, name: c.name || stem(path) || asked, sheet: c.sheet };
}

let current: Bestiary | null = null;

/** The window gives the bestiary its notes (main.ts); none, and a card that
 *  inherits says its base is missing. */
export function setBestiaryIO(io: BestiaryIO | null): void {
  current = io ? new Bestiary(io) : null;
}

export function bestiary(): Bestiary | null {
  return current;
}

/** Re-read the notes the cards inherit from (the folder changed). */
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
export function refreshBestiary(): void {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (current) void current.refresh();
  }, 60);
}

/** The lookup a card composes with, for a block of the note `from`. */
export function lookupFor(from: string | undefined): Lookup {
  return (ref) => (current ? current.lookup(ref, from) : null);
}

/** Told when a base was read or changed. */
export function onBestiaryChange(run: Listener): () => void {
  return current ? current.onChange(run) : () => undefined;
}
