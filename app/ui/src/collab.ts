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

import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { yCollab, ySyncAnnotation, yUndoManagerKeymap } from "y-codemirror.next";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { commands, type Capabilities, type CollabJoin, type CollabOracle, type CollabRoll, type CollabState, type CollabUpdate } from "./bindings";
import type { RoomSide, TextChange, VisitedRoom } from "./roomWrites";
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
  closed: (why?: "lost") => void;
  /** Someone else's edit arrived: the reading view may be stale. */
  remote: () => void;
  /** A synced folder's note went local, its text kept (ADR 0082 item 8). */
  local?: (why: LocalWhy) => void;
  /** Back in the same room, what was typed meanwhile merged (item 9). */
  live?: () => void;
  /** Back, but the room is another: the tab reads the note anew after
   *  sync compared its text from the base (item 9). */
  anew?: () => void;
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
  readonly doc = new Y.Doc();
  readonly awareness: Awareness;
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
  private readonly outbox: UpdateQueue;

  constructor(
    readonly path: string,
    joined: { update: string; revision: string; user: string; epoch: string },
    first: CollabHandlers,
    synced = false,
  ) {
    this.holders.add(first);
    this.handlers = fanOut(this.holders);
    this.synced = synced;
    Y.applyUpdate(this.doc, fromB64(joined.update), REMOTE);
    this.revision = joined.revision;
    this.epoch = joined.epoch;
    this.awareness = new Awareness(this.doc);
    const color = presenceColor(joined.user);
    this.awareness.setLocalStateField("user", { name: joined.user, color, colorLight: `${color}33` });
    this.outbox = new UpdateQueue(
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
    );
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      // Local: kept in the document, sent whole when the tab is back.
      if (origin === REMOTE || this.closedLocally || !this.live) return;
      this.outbox.push(update);
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === REMOTE || this.closedLocally || !this.live) return;
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
    sessions.set(this.path, this);
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
    return this.synced && syncState?.role === "reader";
  }

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
    if (this.closedLocally) return;
    if (this.synced && this.live) return;
    // Left by the setting: the note is read anew, never sent again.
    if (this.synced && this.left && this.handlers.anew) return this.handlers.anew();
    const r = await commands.collabJoin(this.path);
    // A synced note whose link dropped again stays local.
    if (this.synced && r.status !== "ok" && r.error.kind === "unavailable") return;
    if (r.status !== "ok" || r.data.read_only) return this.handlers.closed();
    if (r.data.epoch === this.epoch) {
      Y.applyUpdate(this.doc, fromB64(r.data.update), REMOTE);
      this.live = true;
      this.why = null;
      // After whatever this window still had on its way.
      this.outbox.push(Y.encodeStateAsUpdate(this.doc));
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
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, fromB64(r.data.update));
    const same = this.sameAs(fresh);
    fresh.destroy();
    this.leave();
    this.handlers.closed(same ? undefined : "lost");
  }

  /** An edit the room refused: closed here, the tab told what did not go. */
  private lost(): void {
    if (this.closedLocally) return;
    this.leave();
    this.handlers.closed("lost");
  }

  /** The tab goes, or reads another note: out of the room. */
  leave(): void {
    if (this.closedLocally) return;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.closedLocally = true;
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
export async function joinRoom<S extends RoomSession>(
  path: string,
  catching: (() => void) | undefined,
  make: (joined: CollabJoin, synced: boolean) => S | null,
  share?: { handlers: CollabHandlers; is: (s: RoomSession) => s is S },
): Promise<S | null> {
  if (!(await canCollab())) return null;
  const synced = await syncedSide();
  if (synced && !liveAllowed()) return null;
  hear();
  // Held already in this window — a card on a note a tab holds: shared.
  const held = sessions.get(path);
  if (share && held && held.open && share.is(held)) {
    held.hold(share.handlers);
    return held;
  }
  held?.leave();
  if (synced) catching?.();
  const r = await commands.collabJoin(path);
  if (r.status !== "ok" || r.data.read_only) return null;
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
  if (r.status !== "ok" || r.data.read_only) return null;
  // A board's room takes elements, not text (boardRoom.ts).
  if (r.data.kind !== "text") {
    void commands.collabLeave(path);
    return null;
  }
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromB64(r.data.update), REMOTE);
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

/** Whether an editor transaction came from the room, not from this window. */
export { ySyncAnnotation };
