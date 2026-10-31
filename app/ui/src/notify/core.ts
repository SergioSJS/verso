// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The notifications' book (ADR 0084 items 2, 5 and 8): the one rule for
// "once", the list the centre shows, and the person's choice per kind.
// No page, no clock and no storage of its own — each is handed in — so
// the unit tests reach it (test/notify.test.mjs).
//
// A notification is raised once per change of its key's state: the same
// state again says nothing; a newer one for the same key ("the sync is
// back" after "the sync failed") takes the earlier one's place in the
// list. The list keeps at most 100 entries, none older than 30 days,
// newest first; it is this machine's (one list, each entry tagged with its
// folder), never the account's.

/** The kinds, each one row of the settings (item 7), in their order. */
export const KINDS = ["sync", "conflicts", "sharing", "updates", "quota", "trash", "presence", "table"] as const;
export type Kind = (typeof KINDS)[number];
export type Level = "info" | "success" | "warning" | "error";
/** "Aviso e lista", "Só na lista", "Desligado" (item 8). */
export type Mode = "toast" | "list" | "off";
export const MODES: readonly Mode[] = ["toast", "list", "off"];
/** Every kind's default (decided 2026-10-14): "Aviso e lista". */
export const DEFAULT_MODE: Mode = "toast";
/** The kinds that start otherwise: the table's news is "Desligado" until
 *  the person turns it on (ADR 0107 item 13); someone joining is "Só na
 *  lista", never a toast over the chat's box (ADR 0084 item 8, amended
 *  2026-10-28). Only a stored choice overrides them. */
export const KIND_DEFAULT: Partial<Record<Kind, Mode>> = { table: "off", presence: "list" };

/** An action a notification offers: its words, and what it does by name
 *  (the list outlives the page, a function does not). */
export type ActionRef = { label: string; act: string; arg?: string };

/** What a source raises. `persist` keeps the key's state past the
 *  window's life (one notification per version, item 7). */
export type Raise = {
  kind: Kind;
  key: string;
  state: string;
  level: Level;
  title: string;
  sentence: string;
  actions?: ActionRef[];
  folder: string;
  folderName: string;
  persist?: boolean;
};

/** One line of the list. */
export type Entry = {
  id: string;
  kind: Kind;
  key: string;
  state: string;
  level: Level;
  title: string;
  sentence: string;
  actions: ActionRef[];
  /** Milliseconds since the epoch; shown in the computer's timezone. */
  time: number;
  folder: string;
  folderName: string;
  read: boolean;
};

/** What became of a raise: a toast and a line, a line only, nothing (the
 *  kind is off), or nothing because the key's state did not change. */
export type Outcome = { said: Mode | "same"; entry: Entry | null; replaced: Entry | null };

export const MAX_ENTRIES = 100;
export const MAX_AGE_MS = 30 * 86_400_000;
export const LIST_KEY = "verso.notify.list";
export const STATES_KEY = "verso.notify.states";

/** The machine's storage, as the window has it; any call may throw (a
 *  private window, a refusal), and the book then lives in memory. */
export type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const LEVELS = new Set<Level>(["info", "success", "warning", "error"]);

function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e["id"] === "string" &&
    KINDS.includes(e["kind"] as Kind) &&
    typeof e["key"] === "string" &&
    typeof e["state"] === "string" &&
    LEVELS.has(e["level"] as Level) &&
    typeof e["title"] === "string" &&
    typeof e["sentence"] === "string" &&
    Array.isArray(e["actions"]) &&
    typeof e["time"] === "number" &&
    typeof e["folder"] === "string" &&
    typeof e["folderName"] === "string" &&
    typeof e["read"] === "boolean"
  );
}

export class Book {
  /** Newest first. */
  entries: Entry[] = [];
  /** Whether the machine's storage took the last write (and gave the
   *  last read): when not, the list lives as long as the window. */
  storageOk = true;
  private states = new Map<string, string>();
  private kept: Record<string, string> = {};
  private seq = 0;

  constructor(
    private readonly store: Store | null,
    private readonly now: () => number,
    private readonly mode: (kind: Kind) => Mode,
  ) {
    this.load();
  }

  /** The list and the kept states read again from the storage (another
   *  window of this machine wrote them). */
  load(): void {
    if (!this.store) {
      this.storageOk = false;
      return;
    }
    try {
      const raw = this.store.getItem(LIST_KEY);
      const list: unknown = raw ? JSON.parse(raw) : [];
      this.entries = Array.isArray(list) ? list.filter(isEntry) : [];
      const st: unknown = JSON.parse(this.store.getItem(STATES_KEY) ?? "{}");
      this.kept = st && typeof st === "object" && !Array.isArray(st) ? (st as Record<string, string>) : {};
      this.storageOk = true;
    } catch {
      // A storage that refused, or a list that is not JSON: what this
      // window holds stands.
      this.storageOk = false;
    }
    this.prune();
  }

  private save(): void {
    if (!this.store) return;
    try {
      this.store.setItem(LIST_KEY, JSON.stringify(this.entries));
      this.store.setItem(STATES_KEY, JSON.stringify(this.kept));
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  /** The state a key was last said or settled in, if any. */
  stateOf(key: string): string | undefined {
    return this.states.get(key) ?? this.kept[key];
  }

  /** The key's state is now `state`, without a word: a person who left a
   *  note (leaving is not notified), a conflict copy deleted. The next
   *  change from here is raised. Whether it changed. */
  settle(key: string, state: string, persist = false): boolean {
    const was = this.stateOf(key);
    this.states.set(key, state);
    if (persist) {
      this.kept[key] = state;
      this.save();
    }
    return was !== state;
  }

  /** Raise `r` once per change of its key's state. */
  raise(r: Raise): Outcome {
    if (this.stateOf(r.key) === r.state) return { said: "same", entry: null, replaced: null };
    this.settle(r.key, r.state, r.persist);
    const said = this.mode(r.kind);
    if (said === "off") return { said, entry: null, replaced: null };
    const time = this.now();
    const entry: Entry = {
      id: `${time.toString(36)}-${(++this.seq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: r.kind,
      key: r.key,
      state: r.state,
      level: r.level,
      title: r.title,
      sentence: r.sentence,
      actions: r.actions ?? [],
      time,
      folder: r.folder,
      folderName: r.folderName,
      read: false,
    };
    const at = this.entries.findIndex((e) => e.key === r.key);
    const replaced = at >= 0 ? (this.entries.splice(at, 1)[0] ?? null) : null;
    this.entries.unshift(entry);
    this.prune();
    this.save();
    return { said, entry, replaced };
  }

  /** None older than 30 days, at most 100. */
  prune(): void {
    const oldest = this.now() - MAX_AGE_MS;
    this.entries = this.entries.filter((e) => e.time >= oldest).slice(0, MAX_ENTRIES);
  }

  /** How many the person has not seen in the centre. */
  unread(): number {
    return this.entries.reduce((n, e) => n + (e.read ? 0 : 1), 0);
  }

  /** Opening the centre: everything read. Whether anything changed. */
  markAllRead(): boolean {
    if (this.entries.every((e) => e.read)) return false;
    this.entries = this.entries.map((e) => (e.read ? e : { ...e, read: true }));
    this.save();
    return true;
  }

  /** "Limpar": the list empty. The states stay — a cleared failure is
   *  not raised again until it changes. */
  clear(): void {
    this.entries = [];
    this.save();
  }

  find(id: string): Entry | undefined {
    return this.entries.find((e) => e.id === id);
  }
}

/** A kind's mode as the person chose it, the default otherwise. */
export function modeOf(chosen: Partial<Record<string, string>> | undefined, kind: Kind): Mode {
  const m = chosen?.[kind];
  return m === "toast" || m === "list" || m === "off" ? m : (KIND_DEFAULT[kind] ?? DEFAULT_MODE);
}

/** The trash's warning (item 7): the entries that leave the bin within
 *  three days of `nowMs`, the bin's `expires` in seconds. */
export function leavingSoon(entries: readonly { expires: number | null }[], nowMs: number, days = 3): number {
  const limit = nowMs / 1000 + days * 86_400;
  return entries.filter((e) => e.expires !== null && e.expires <= limit).length;
}

/** The day `ms` falls on in the computer's timezone, `YYYY-MM-DD`: the
 *  trash says its warning at most once a day per folder. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A folder at 90 % of its quota or more (ADR 0077 item 5). */
export function quotaNear(used: number, quota: number): boolean {
  return quota > 0 && used * 10 >= quota * 9;
}
