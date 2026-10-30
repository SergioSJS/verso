// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Several people in one file (ADR 0073 item 7; ADR 0082 item 12, decided
// 2026-10-12: a note, any text file, a board). Several people in one note: where the side the window
// talks to can do it (`capabilities`: `collab`, a server), a note opened
// for editing joins the server's room — a Yjs document bound to the
// editor by y-codemirror.next. The window's edits go to the room, the
// others' come from it, and the server writes the file; the window still
// says when its text is saved and shows a conflict when the disk changed
// while edits waited.
//
// A folder of this computer that syncs with a server (ADR 0082) has the
// same rooms while its sync's link is up — `capabilities` says `collab`
// then, with `host: desktop`. Such a note is live, and goes local when the
// link drops or sync pauses: the tab keeps its text and its Yjs document,
// saves on this computer, and comes back into the room when the link does
// (`verso:sync-state`, from the status the sync says).

import { joinsNothing } from "./joinAnswer";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { yCollab, ySyncAnnotation, yUndoManagerKeymap } from "y-codemirror.next";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { commands, type Capabilities, type CollabJoin, type CollabOracle, type CollabRoll, type CollabState, type CollabUpdate } from "./bindings";
import type { RoomSide, TextChange, VisitedRoom } from "./roomWrites";
import { timed } from "./slowOps";
import { UpdateQueue } from "./updateQueue";

let capabilities: Promise<Capabilities | null> | null = null;

/** What the side the window talks to can do, asked once. */
export function sideCan(): Promise<Capabilities | null> {
  capabilities ??= commands.capabilities().then((r) => (r.status === "ok" ? r.data : null));
  return capabilities;
}

/** Ask again (the person's role in the folder changed). */
export function forgetCapabilities(): void {
  capabilities = null;
}

export async function canCollab(): Promise<boolean> {
  return (await sideCan())?.can.includes("collab") ?? false;
}

/** Why a synced folder's note is local now (ADR 0082 item 14). */
export type LocalWhy = "offline" | "paused" | "off" | "setting";

/** The window's folder's sync, as `verso:sync-state` says it. */
export type SyncState = { on: boolean; state: string; role: string; live: boolean };

let syncState: SyncState | null = null;

/** Whether the synced folder's rooms can be reached now (the last answer of
 *  `follow`). */
let roomsOk = false;
/** What a rejoin waits, ms, after the link was not ready: grows, then stays. */
const REJOIN_WAITS = [1500, 4000, 10000, 30000, 60000];

/** Paths whose join is pending: it answered `unavailable` while the link
 *  was said to be up (the status says connected a moment before the host's
 *  live link is), or it never ran because the link was down. How many times
 *  it was asked again, and the timer of the next wait. A join that answered
 *  read_only, a refusal, or that the person turned off is not pending. */
type Pending = { tries: number; timer: number; logged: boolean; busy: boolean };
const pending = new Map<string, Pending>();
/** What a tab answers when told its join may be asked again: it started a
 *  join, it is busy (unsaved text, a load under way) and is asked again after
 *  the next wait, or it is gone (closed, on another file, or in its room). */
export type JoinAnswer = "started" | "busy" | "gone";
const retryListeners = new Set<(path: string) => JoinAnswer>();
export function onJoinRetry(fn: (path: string) => JoinAnswer): () => void {
  retryListeners.add(fn);
  return () => retryListeners.delete(fn);
}

/** Whether the join of `path` is pending: only such a tab is told to join
 *  again, never a tab that holds no room for another reason (mixed line
 *  ends, a reader, a kind no room takes). */
export function joinPending(path: string): boolean {
  return pending.has(path);
}

function logInfo(line: string): void {
  void commands.logWrite("INFO", line).catch(() => undefined);
}

function markPending(path: string): void {
  if (!pending.has(path)) pending.set(path, { tries: 0, timer: 0, logged: false, busy: false });
}

function scheduleJoin(path: string): void {
  const w = pending.get(path);
  if (!w) return;
  window.clearTimeout(w.timer);
  const wait = REJOIN_WAITS[Math.min(w.tries, REJOIN_WAITS.length - 1)] ?? 60000;
  const timer = window.setTimeout(() => {
    if (pending.get(path)?.timer === timer) fireJoin(path);
  }, wait);
  w.timer = timer;
}

/** The wait is over, or the link is back: each tab is told. A tab that
 *  started a join settles or reschedules it itself; busy ones are asked
 *  after the next wait; with nobody left to join, the path is let go. */
function fireJoin(path: string): void {
  const w = pending.get(path);
  if (!w) return;
  w.timer = 0;
  if (!roomsOk) return;
  w.tries++;
  const answers = [...retryListeners].map((fn) => fn(path));
  // A busy sibling (a split view's other tab) is asked again whatever the
  // others did: when one joins first, the sibling finds its session and
  // shares it, which ends the path's chain.
  w.busy = answers.includes("busy");
  if (w.busy) return scheduleJoin(path);
  if (answers.includes("started")) return;
  pending.delete(path);
}

/** A tab's retry found its file gone: nothing to ask again for it. */
export function joinGiveUp(path: string): void {
  if (!pending.get(path)?.busy) joinNotPending(path);
}

/** A tab's retry stopped before it reached the join (it was busy or the
 *  person typed): asked again after the next wait. */
export function joinBusy(path: string): void {
  // (the join may have answered and the tab let it go: pending again)
  markPending(path);
  if (roomsOk) scheduleJoin(path);
}

function joinNotReady(path: string): void {
  markPending(path);
  const w = pending.get(path);
  if (w && !w.logged) {
    w.logged = true;
    logInfo(`collab_join ${path}: the link is not ready; asking again`);
  }
  scheduleJoin(path);
}

function joinSettled(path: string): void {
  const w = pending.get(path);
  if (!w) return;
  if (w.logged) logInfo(`collab_join ${path}: joined after ${w.tries} retries`);
  w.logged = false;
  // A busy sibling tab still waits to share this room: its ask stays.
  if (w.busy) return;
  window.clearTimeout(w.timer);
  pending.delete(path);
}

function joinNotPending(path: string): void {
  const w = pending.get(path);
  if (w) window.clearTimeout(w.timer);
  pending.delete(path);
}

/** The link went down: no timer runs meanwhile; the way back asks. */
function pauseJoinRetries(): void {
  for (const w of pending.values()) {
    window.clearTimeout(w.timer);
    w.timer = 0;
  }
}

/** Whether the server let the person edit this synced note, though they
 *  only read the folder (ADR 0113 S8): access.ts says, from what the host
 *  heard; a reader of the folder is a typist of a note they edit. */
let syncedMay: (path: string) => boolean = () => false;
export function setSyncedMay(fn: (path: string) => boolean): void {
  syncedMay = fn;
}

/** Whether the person lets this folder's notes be live (item 15). */
function liveAllowed(): boolean {
  return syncState?.live ?? true;
}

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** What the note's tab hears of its room. */
export type CollabHandlers = {
  saved: (revision: string) => void;
  conflict: () => void;
  /** The room is gone: the tab reads the note again — `lost` when text
   *  typed while the connection was down could not go along. */
  closed: (why?: "lost" | "refused") => void;
  /** Someone else's edit arrived: the reading view may be stale. */
  remote: () => void;
  /** A synced folder's note went local, its text kept (ADR 0082 item 8). */
  local?: (why: LocalWhy) => void;
  /** Back in the same room, what was typed meanwhile merged (item 9). */
  live?: () => void;
  /** Back, but the room is another: the tab reads the note anew after
   *  sync compared its text from the base (item 9). */
  anew?: () => void;
  /** The room refused an edit of a board and the window took the room's
   *  state in again, in place: said once per refused change. */
  refused?: () => void;
  /** Who else is in the note changed. */
  presence?: () => void;
  /** Before going back into the room: what the tab typed out of it is
   *  saved here first, so that sync knows it for the tab's own. */
  settle?: () => Promise<void>;
};

/** The origin of what the room brought in. */
/** The most often a window sends its presence (its pointer, its
 *  selection), in ms: the latest only. */
const PRESENCE_EVERY = 100;

export const REMOTE = "remote";
/** A colour for each person, from their name. */
const COLORS = ["#b5651d", "#2e7d32", "#1565c0", "#6a1b9a", "#ad1457", "#00838f", "#9e9d24", "#5d4037"];

/** The colour of a person's cursor in a note, from their name: the table's
 *  roster shows the same one (ADR 0107 item 8). */
export function presenceColor(user: string): string {
  let hash = 0;
  for (const c of user) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] ?? "#b5651d";
}

/** Every holder's handlers as one: each event told to each holder of the
 *  session — a note's tab and a board's card on the same note, in one
 *  window, share the window's one place in the room. An event no holder
 *  hears is none. */
function fanOut(holders: Set<CollabHandlers>): CollabHandlers {
  const all = (): CollabHandlers[] => [...holders];
  const some = <K extends keyof CollabHandlers>(k: K): CollabHandlers[] => all().filter((h) => h[k] !== undefined);
  return {
    saved: (revision) => all().forEach((h) => h.saved(revision)),
    conflict: () => all().forEach((h) => h.conflict()),
    closed: (why) => all().forEach((h) => h.closed(why)),
    remote: () => all().forEach((h) => h.remote()),
    get local() {
      const hs = some("local");
      return hs.length ? (why: LocalWhy) => hs.forEach((h) => h.local?.(why)) : undefined;
    },
    get live() {
      const hs = some("live");
      return hs.length ? () => hs.forEach((h) => h.live?.()) : undefined;
    },
    get anew() {
      const hs = some("anew");
      return hs.length ? () => hs.forEach((h) => h.anew?.()) : undefined;
    },
    get refused() {
      const hs = some("refused");
      return hs.length ? () => hs.forEach((h) => h.refused?.()) : undefined;
    },
    get presence() {
      const hs = some("presence");
      return hs.length ? () => hs.forEach((h) => h.presence?.()) : undefined;
    },
    get settle() {
      const hs = some("settle");
      return hs.length ? async () => void (await Promise.all(hs.map((h) => h.settle?.()))) : undefined;
    },
  };
}

/** What every room's session is, a text's or a board's: the room's Yjs
 *  document, the people in it, the way out and back. */
export abstract class RoomSession {
  doc = new Y.Doc();
  awareness: Awareness;
  revision: string;
  epoch: string;
  protected closedLocally = false;
  /** In the room now; false while a synced folder's note is local. */
  live = true;
  /** Why it is local, while it is. */
  why: LocalWhy | null = null;
  /** The note's room is reached through this computer's synced folder. */
  readonly synced: boolean;
  /** Left on the server by the person's setting: back only anew. */
  private left = false;
  /** The names of the others in the note, as last said. */
  private seen: string[] = [];
  /** Who holds the session in this window: a tab, a card. */
  private readonly holders = new Set<CollabHandlers>();
  /** What the room says, told to every holder. */
  readonly handlers: CollabHandlers;
  /** This window's updates to the room, one in flight at a time
   *  (updateQueue.ts). */
  private outbox: UpdateQueue;
  /** The name this window is in the room as. */
  private readonly person: string;

  constructor(
    readonly path: string,
    joined: { update: string; revision: string; user: string; epoch: string; read_only?: boolean },
    first: CollabHandlers,
    synced = false,
  ) {
    this.holders.add(first);
    this.handlers = fanOut(this.holders);
    this.synced = synced;
    Y.applyUpdate(this.doc, fromB64(joined.update), REMOTE);
    this.revision = joined.revision;
    this.epoch = joined.epoch;
    this.readerRoom = joined.read_only === true;
    this.person = joined.user;
    this.awareness = new Awareness(this.doc);
    this.outbox = this.queue();
    this.wire();
    sessions.set(this.path, this);
  }

  /** The queue of this window's updates to the room. */
  private queue(): UpdateQueue {
    return new UpdateQueue(
      async (update) => {
        const r = await commands.collabUpdate(this.path, toB64(update));
        if (r.status === "ok") return "ok";
        return r.error.kind === "unavailable" ? "unavailable" : "refused";
      },
      // Refused — the person reads only now, the room is gone: what is
      // typed here would never be written. Out of the room, and the tab
      // says it (offline is not this: the rejoin sends it all).
      () => this.lost(),
      () => !this.closedLocally,
      () => this.idle(),
    );
  }

  /** Every update this window sent has been answered: the room holds what
   *  the window holds (a board's file, made of exactly that state, goes
   *  now, if it went before the room had the last update). */
  protected idle(): void {}

  /** The document's and the awareness's listeners, and this window's name
   *  and colour: again whenever the document is made anew. */
  private wire(): void {
    const color = presenceColor(this.person);
    this.awareness.setLocalStateField("user", { name: this.person, color, colorLight: `${color}33` });
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      // A reader's document never sends: whatever lands in it from this
      // window (the disk's text through `fromDisk`) is noted, so the
      // rejoin remakes the editor from the room instead of keeping it.
      if (origin !== REMOTE && this.reader) {
        this.readerTouched = true;
        return;
      }
      // Local: kept in the document, sent whole when the tab is back.
      if (origin === REMOTE || this.closedLocally || !this.live || this.rejoining) return;
      this.outbox.push(update);
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === REMOTE || this.closedLocally || !this.live || this.rejoining) return;
      for (const id of [...added, ...updated, ...removed]) this.presenceDue.add(id);
      // A pointer moved sends its place at most every PRESENCE_EVERY ms,
      // the latest only: ~45 a second a window held the edits back behind
      // them on the server (2026-10-13). Someone leaving goes at once.
      if (removed.length > 0) this.sendPresence();
      else if (this.presenceTimer === undefined) this.presenceTimer = window.setTimeout(() => this.sendPresence(), PRESENCE_EVERY);
    });
    this.awareness.on("change", () => {
      const now = this.others();
      if (now.join("\n") === this.seen.join("\n")) return;
      this.seen = now;
      this.handlers.presence?.();
    });
  }

  /** A reader's document took a change of this window's own. */
  private readerTouched = false;

  /** Between a refusal and the room's state coming in: nothing is sent. */
  protected rejoining = false;

  /** The room's state, as it is now, in a document of this window's own
   *  again (the refused edit is not in it: a Yjs document cannot take an
   *  operation back, and the room never had it). The caller binds what it
   *  keeps of the old one. */
  protected rebuild(joined: { update: string; revision: string; epoch: string }): void {
    window.clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined;
    this.presenceDue.clear();
    // The old cursor leaves the others' boards before it is let go.
    const me = this.doc.clientID;
    removeAwarenessStates(this.awareness, [me], "local");
    void commands.collabAwareness(this.path, toB64(encodeAwarenessUpdate(this.awareness, [me]))).catch(() => {});
    this.awareness.destroy();
    this.doc.destroy();
    this.doc = new Y.Doc();
    Y.applyUpdate(this.doc, fromB64(joined.update), REMOTE);
    this.revision = joined.revision;
    this.epoch = joined.epoch;
    this.readerTouched = false;
    this.awareness = new Awareness(this.doc);
    this.outbox = this.queue();
    this.wire();
  }

  /** Presence of these clients to send at the next beat. */
  private readonly presenceDue = new Set<number>();
  private presenceTimer: number | undefined;

  /** The presence changed since the last one sent, in one message. */
  private sendPresence(): void {
    window.clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined;
    if (this.presenceDue.size === 0 || this.closedLocally || !this.live) {
      this.presenceDue.clear();
      return;
    }
    const ids = [...this.presenceDue];
    this.presenceDue.clear();
    void commands.collabAwareness(this.path, toB64(encodeAwarenessUpdate(this.awareness, ids)));
  }

  /** Another holder in this window: a card on a note a tab holds, a tab
   *  on a note a card holds. */
  hold(h: CollabHandlers): void {
    this.holders.add(h);
  }

  /** A holder lets the file go: the session leaves the room when it was
   *  the last one. */
  release(h: CollabHandlers): void {
    this.holders.delete(h);
    if (this.holders.size === 0) this.leave();
  }

  /** Whether the session is still in its room's place in this window. */
  get open(): boolean {
    return !this.closedLocally;
  }

  /** The person only reads the folder on the server: present in the
   *  room, not typing (ADR 0082 item 4). */
  get reader(): boolean {
    return this.readerRoom || (this.synced && syncState?.role === "reader" && !syncedMay(this.path));
  }
  /** The server said, at the join, that this person may not type in the
   *  note (ADR 0113 `may`): in the room to follow it, read-only. */
  private readonly readerRoom: boolean;

  /** The names of the others in the note now, each once. */
  others(): string[] {
    const names = new Set<string>();
    for (const [id, state] of this.awareness.getStates()) {
      if (id === this.doc.clientID) continue;
      const name = (state as { user?: { name?: string } }).user?.name;
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  /** Out of the room, the text kept (ADR 0082 items 8 and 10): the others'
   *  cursors go, what is typed stays in the document for the return. Off
   *  by the person's setting, the room is left on the server too. */
  goLocal(why: LocalWhy): void {
    if (this.closedLocally) return;
    this.live = false;
    this.why = why;
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    if (others.length) removeAwarenessStates(this.awareness, others, REMOTE);
    if (why === "setting" && !this.left) {
      this.left = true;
      void commands.collabLeave(this.path);
    }
    this.handlers.local?.(why);
  }

  /** Whether a room made again from the disk holds what this one does:
   *  then nothing typed meanwhile is lost by reading it anew. */
  protected abstract sameAs(fresh: Y.Doc): boolean;

  applyRemote(update: string): void {
    Y.applyUpdate(this.doc, fromB64(update), REMOTE);
    this.handlers.remote();
  }

  applyAwareness(update: string): void {
    applyAwarenessUpdate(this.awareness, fromB64(update), REMOTE);
  }

  /** The connection came back: into the room again. The same room (it
   *  outlives a dropped connection two minutes): its state comes in and
   *  this window's whole state goes out — Yjs keeps each edit once, so
   *  what was typed meanwhile joins without doubling. Another room, made
   *  again from the disk: the tab reads the note anew, and says so if
   *  something typed meanwhile could not go along. */
  async rejoin(): Promise<void> {
    if (this.rejoinBusy) return;
    this.rejoinBusy = true;
    try {
      await this.rejoinOnce();
    } finally {
      this.rejoinBusy = false;
    }
  }
  private rejoinBusy = false;
  private async rejoinOnce(): Promise<void> {
    if (this.closedLocally) return;
    if (this.synced && this.live) return;
    // Left by the setting: the note is read anew, never sent again.
    if (this.synced && this.left && this.handlers.anew) return this.handlers.anew();
    const r = await commands.collabJoin(this.path);
    // A synced note whose link is not ready (the status says connected a
    // moment before the host's live link is) stays local and asks again.
    if (this.synced && r.status !== "ok" && r.error.kind === "unavailable") return this.rejoinLater();
    if (r.status !== "ok" || joinsNothing(r.data)) return this.handlers.closed();
    // A reader whose document took the disk's text meanwhile is not kept.
    const touched = this.reader && this.readerTouched;
    if (r.data.epoch === this.epoch && !touched) {
      Y.applyUpdate(this.doc, fromB64(r.data.update), REMOTE);
      this.live = true;
      this.retries = 0;
      this.why = null;
      // After whatever this window still had on its way. A reader has
      // nothing on its way: the room refuses its updates, which would end
      // its stay in the room at every reconnection.
      if (!this.reader) this.outbox.push(Y.encodeStateAsUpdate(this.doc));
      this.revision = r.data.revision;
      // This window's cursor and name, to the others again.
      const me = this.awareness.getLocalState();
      if (me) this.awareness.setLocalState({ ...me });
      this.handlers.live?.();
      return;
    }
    // A synced folder's note keeps every version: the tab's text is in the
    // local file, which sync compares from its base (item 9).
    if (this.synced && this.handlers.anew) return this.handlers.anew();
    // Nothing of the reader's was typed: the editor is remade, no line.
    if (touched) {
      this.leave();
      this.handlers.closed();
      return;
    }
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, fromB64(r.data.update));
    const same = this.sameAs(fresh);
    fresh.destroy();
    this.leave();
    this.handlers.closed(same ? undefined : "lost");
  }

  private retries = 0;
  private retryTimer: number | undefined;
  /** The join found the link not ready: again after a wait that grows,
   *  while the link is said to be back and the note is still local. */
  private rejoinLater(): void {
    window.clearTimeout(this.retryTimer);
    const wait = REJOIN_WAITS[Math.min(this.retries++, REJOIN_WAITS.length - 1)] ?? 60000;
    this.retryTimer = window.setTimeout(() => {
      if (this.closedLocally || this.live || !roomsOk) return;
      void this.rejoin();
    }, wait);
  }

  /** An edit the room refused: closed here, the tab told what did not go. */
  protected lost(): void {
    if (this.closedLocally) return;
    if (!this.keepsSceneOnRefusal()) {
      this.leave();
      this.handlers.closed("lost");
      return;
    }
    // A board in a shadow: the room's state comes in again, in place. Twice
    // within moments with no change of the person's in between would be a
    // loop (a bug, logged): then it stops, and says so once.
    const now = Date.now();
    if (now - this.refusedAt < 3000 && !this.edited) {
      console.error(`room ${this.path}: refused again with no change of the person's in between; not rejoining`);
      this.leave();
      this.handlers.closed("refused");
      return;
    }
    this.refusedAt = now;
    this.edited = false;
    this.rejoining = true;
    this.beforeRejoin();
    void this.refusedInPlace();
  }
  private refusedAt = 0;
  /** A change of the person's since the last refusal (the loop guard). */
  protected edited = true;

  /** The room's truth in, the view kept: a new document of the room's
   *  state, then the holder's board takes it in place (`reborn`). */
  private async refusedInPlace(): Promise<void> {
    let joined: Awaited<ReturnType<typeof commands.collabJoin>> | null = null;
    try {
      joined = await commands.collabJoin(this.path);
    } catch {
      joined = null;
    }
    // Never left rejoining: the way out is the old one (the board read anew).
    if (this.closedLocally) return;
    if (!joined || joined.status !== "ok" || joinsNothing(joined.data)) {
      this.rejoining = false;
      this.leave();
      this.handlers.closed("lost");
      return;
    }
    try {
      this.rebuild(joined.data);
    } finally {
      this.rejoining = false;
    }
    this.reborn();
    this.handlers.refused?.();
  }

  /** A refusal is being answered: the subclass notes what its holder has
   *  now, to tell what changes while the room's state is on its way. */
  protected beforeRejoin(): void {}

  /** The document is the room's anew: the subclass binds to it. */
  protected reborn(): void {}

  /** Whether a refused update leaves the window's scene as it is and takes
   *  the room's state in again, in place, instead of reading the file anew:
   *  a board's, whose reload would reset the view. */
  protected keepsSceneOnRefusal(): boolean {
    return false;
  }

  /** The tab goes, or reads another note: out of the room. */
  leave(): void {
    if (this.closedLocally) return;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.closedLocally = true;
    window.clearTimeout(this.retryTimer);
    sessions.delete(this.path);
    this.awareness.destroy();
    this.doc.destroy();
    void commands.collabLeave(this.path);
  }
}

/** A text's room — a note's, or any text file's: one Yjs text bound to
 *  the editor. */
export class CollabSession extends RoomSession {
  readonly text: Y.Text;
  readonly crlf: boolean;

  constructor(path: string, joined: { update: string; revision: string; crlf: boolean; user: string; epoch: string }, handlers: CollabHandlers, synced = false) {
    super(path, joined, handlers, synced);
    this.text = this.doc.getText("verso");
    this.crlf = joined.crlf;
  }

  /** The editor's binding: the text kept in step with the room, the
   *  others' cursors and names, and ⌘Z undoing this window's edits only. */
  extension(): Extension {
    const undoManager = new Y.UndoManager(this.text);
    return [yCollab(this.text, this.awareness, { undoManager }), Prec.highest(keymap.of(yUndoManagerKeymap))];
  }

  /** The text as it starts in the editor (`\n` line ends). */
  initial(): string {
    return this.text.toString();
  }

  protected sameAs(fresh: Y.Doc): boolean {
    return fresh.getText("verso").toString() === this.text.toString();
  }
}

const sessions = new Map<string, RoomSession>();
let listening = false;

/** The window's own label: a room's event is told to the windows that hold
 *  the note (`emit_to`), and a window hears its own only — two windows on
 *  two folders may hold notes of the same path. */
function ownLabel(): string | undefined {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return undefined;
  }
}

function hear(): void {
  if (listening) return;
  listening = true;
  addEventListener("verso:reconnected", () => {
    for (const s of [...sessions.values()]) void s.rejoin();
  });
  const label = ownLabel();
  const opts = label ? { target: label } : undefined;
  void listen<CollabUpdate>("collab-update", (e) => sessions.get(e.payload.path)?.applyRemote(e.payload.update), opts);
  void listen<CollabUpdate>("collab-awareness", (e) => sessions.get(e.payload.path)?.applyAwareness(e.payload.update), opts);
  void listen<CollabState>("collab-saved", (e) => {
    // A room wrote its file: the views over the folder read it again
    // (bases.ts), whoever holds the note.
    dispatchEvent(new CustomEvent<string>("verso:room-saved", { detail: e.payload.path }));
    const s = sessions.get(e.payload.path);
    if (s && e.payload.revision) {
      s.revision = e.payload.revision;
      s.handlers.saved(e.payload.revision);
    }
  }, opts);
  void listen<CollabState>("collab-conflict", (e) => sessions.get(e.payload.path)?.handlers.conflict(), opts);
  // Dice rolled in a room by another (ADR 0088 item 4; dice/card.ts).
  void listen<CollabRoll>("collab-roll", (e) => dispatchEvent(new CustomEvent<CollabRoll>("verso:collab-roll", { detail: e.payload })), opts);
  // The oracle drawn in a room by another (ADR 0102 item 5; oracle/room.ts).
  void listen<CollabOracle>("collab-oracle", (e) => dispatchEvent(new CustomEvent<CollabOracle>("verso:collab-oracle", { detail: e.payload })), opts);
  void listen<CollabState>("collab-closed", (e) => {
    const s = sessions.get(e.payload.path);
    if (!s) return;
    s.leave();
    s.handlers.closed();
  }, opts);
}

/** The room of `path` this window is in now, live: where dice are rolled
 *  by the server (ADR 0088 item 4). */
export function liveRoom(path: string): RoomSession | null {
  const s = sessions.get(path);
  return s && s.open && s.live ? s : null;
}

/** Whether the side the window talks to is this computer's synced folder:
 *  the desktop app answering `collab` (ADR 0082 item 3). */
async function syncedSide(): Promise<boolean> {
  return (await sideCan())?.host === "desktop";
}

/** Join the room of `path`, made into a session by `make` (null: the room
 *  is of another kind than the tab's, and is left); null where the side
 *  cannot, the person keeps the folder's files local (ADR 0082 item 15),
 *  or the file is shown read-only (its line ends mixed). `catching` is
 *  told while a synced folder's join waits for the file's local text to
 *  cross (item 7). */
export function joinRoom<S extends RoomSession>(
  path: string,
  catching: (() => void) | undefined,
  make: (joined: CollabJoin, synced: boolean) => S | null,
  share?: { handlers: CollabHandlers; is: (s: RoomSession) => s is S },
): Promise<S | null> {
  // One join of a path at a time: two tabs of it (a split view) join one
  // after the other, and the second finds the first's session to share.
  const prior = joining.get(path);
  const run = (prior ?? Promise.resolve()).then(() => joinRoomNow(path, catching, make, share));
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  joining.set(path, tail);
  void tail.then(() => {
    if (joining.get(path) === tail) joining.delete(path);
  });
  return run;
}
const joining = new Map<string, Promise<void>>();

async function joinRoomNow<S extends RoomSession>(
  path: string,
  catching: (() => void) | undefined,
  make: (joined: CollabJoin, synced: boolean) => S | null,
  share?: { handlers: CollabHandlers; is: (s: RoomSession) => s is S },
): Promise<S | null> {
  if (!(await canCollab())) {
    // The link of a synced folder is down: the way back asks. (A side that
    // keeps no rooms at all is not a synced one: nothing to ask.)
    if (await syncedSide()) markPending(path);
    return null;
  }
  const synced = await syncedSide();
  if (synced && !liveAllowed()) {
    joinNotPending(path);
    return null;
  }
  hear();
  // Held already in this window — a card on a note a tab holds: shared.
  const held = sessions.get(path);
  if (share && held && held.open && share.is(held)) {
    held.hold(share.handlers);
    joinNotPending(path);
    return held;
  }
  held?.leave();
  if (synced) catching?.();
  const r = await timed(`collab_join ${path}`, () => commands.collabJoin(path));
  if (r.status !== "ok") {
    if (synced && roomsOk && r.error.kind === "unavailable") joinNotReady(path);
    else joinNotPending(path);
    return null;
  }
  if (joinsNothing(r.data)) {
    joinNotPending(path);
    return null;
  }
  joinSettled(path);
  dispatchEvent(new CustomEvent("verso:room-rolls", { detail: { path, rolls: r.data.rolls ?? [], user: r.data.user } }));
  const made = make(r.data, synced);
  if (!made) void commands.collabLeave(path);
  return made;
}

/** Join the room of a text — a note, any text file of the folder. A
 *  session this window holds already for it, live, is shared, not left:
 *  a board's card on a note open in a tab (ADR 0082 item 12). */
export function joinCollab(path: string, handlers: CollabHandlers, catching?: () => void): Promise<CollabSession | null> {
  return joinRoom(path, catching, (joined, synced) => (joined.kind === "text" ? new CollabSession(path, joined, handlers, synced) : null), {
    handlers,
    is: (s): s is CollabSession => s instanceof CollabSession,
  });
}

/** Whether someone else is in the room of `path` now — another person,
 *  or another window of this app — while this window holds it in no tab:
 *  a write that is not a keystroke then joins the room (roomWrites.ts,
 *  ADR 0082). False where the side keeps no rooms, the person keeps the
 *  folder's notes local (item 15), or the link is down: the file is
 *  written as before. */
async function presentElsewhere(path: string): Promise<boolean> {
  if (sessions.has(path) || !(await canCollab())) return false;
  if ((await syncedSide()) && !liveAllowed()) return false;
  const r = await commands.collabPresent(path);
  return r.status === "ok" && r.data;
}

/** Into the room of `path` for one write, with no tab: the room's text as
 *  it is, the one edit made into a document of its own, sent, the room
 *  asked to write the file at once (⌘S's `collab_save`; on a synced folder
 *  sync brings it down), and out. The others' edits meanwhile are not
 *  heard here: Yjs merges this edit with them in the room. */
async function visitRoom(path: string): Promise<VisitedRoom | null> {
  if (sessions.has(path)) return null;
  const r = await commands.collabJoin(path);
  // A file whose line ends are mixed is in no room: written as before.
  if (r.status !== "ok" || joinsNothing(r.data)) return null;
  // A reader is in the room now (the server has put it there): it reads,
  // so the visit has no edit to make, and leaves.
  // A board's room takes elements, not text (boardRoom.ts).
  if (r.data.read_only || r.data.kind !== "text") {
    void commands.collabLeave(path);
    return null;
  }
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, fromB64(r.data.update), REMOTE);
  } catch (e) {
    // Joined, so left in every path.
    doc.destroy();
    void commands.collabLeave(path);
    throw e;
  }
  const text = doc.getText("verso");
  const before = Y.encodeStateVector(doc);
  let left = false;
  return {
    text: () => text.toString(),
    edit: (c: TextChange) => {
      doc.transact(() => {
        if (c.to > c.from) text.delete(c.from, c.to - c.from);
        if (c.insert) text.insert(c.from, c.insert);
      });
    },
    send: async () => {
      const sent = await commands.collabUpdate(path, toB64(Y.encodeStateAsUpdate(doc, before)));
      // Refused — the person only reads, the link dropped: nothing went.
      if (sent.status !== "ok") return false;
      // In the room now, whatever the save says: a room stopped by a
      // change on disk writes it once the people in it choose.
      await commands.collabSave(path);
      return true;
    },
    leave: async () => {
      if (left) return;
      left = true;
      doc.destroy();
      await commands.collabLeave(path);
    },
  };
}

/** The rooms as the window's writes that are not keystrokes reach them. */
export const roomSide: RoomSide = { present: presentElsewhere, visit: visitRoom };

/** The synced folder's state changed (sync.ts): what the side can do is
 *  asked again, and each synced note goes local or back into its room. */
async function follow(next: SyncState): Promise<void> {
  const before = syncState;
  syncState = next;
  if (before && before.on === next.on && before.state === next.state && before.role === next.role && before.live === next.live) return;
  forgetCapabilities();
  const ok = next.on && next.live && (await canCollab());
  const why: LocalWhy = !next.on ? "off" : !next.live ? "setting" : next.state === "paused" ? "paused" : "offline";
  const wasOk = roomsOk;
  roomsOk = ok;
  // Down: no timer runs; the way back asks each pending join again.
  if (!ok) pauseJoinRetries();
  if (ok && !wasOk) for (const path of [...pending.keys()]) fireJoin(path);
  for (const s of [...sessions.values()]) {
    if (!s.synced) continue;
    if (!ok && s.live) s.goLocal(why);
    else if (!ok && s.why !== why) {
      // Still local, for another reason now (sync paused while offline).
      s.goLocal(why);
    } else if (ok && !s.live) void (s.handlers.settle?.() ?? Promise.resolve()).then(() => s.rejoin());
  }
}

addEventListener("verso:sync-state", (e) => void follow((e as CustomEvent<SyncState>).detail));

/** Every synced file open in this window, for the status bar. */
export function syncedSessions(): RoomSession[] {
  return [...sessions.values()].filter((s) => s.synced);
}

/** What the tab says when text typed while the connection was down could
 *  not go into the room, in the window's language. */
export function lostLine(): string {
  return document.documentElement.lang.startsWith("pt")
    ? "A conexão caiu e a nota foi relida do servidor: o que foi digitado enquanto isso não pôde ser mantido."
    : "The connection dropped and the note was read again from the server: what was typed meanwhile could not be kept.";
}

/** What the tab says once when the room refused an edit of a board: the
 *  board stays as it is, and sends nothing more. */
export function refusedLine(stopped = false): string {
  const pt = document.documentElement.lang.startsWith("pt");
  if (stopped) {
    return pt
      ? "A mesa recusou alterações do quadro repetidamente: nada mais é enviado daqui. Reabra o quadro para voltar a editar."
      : "The table refused changes to the board over and over: nothing more is sent from here. Reopen the board to edit again.";
  }
  return pt ? "A mesa recusou uma alteração do quadro: ele voltou ao estado da mesa; o resto continua como estava." : "The table refused a change to the board: it went back to the table's state; the rest stays as it was.";
}

/** Whether an editor transaction came from the room, not from this window. */
export { ySyncAnnotation };
