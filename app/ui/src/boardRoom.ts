// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A board in the server's room (ADR 0082 item 12, decided by the
// maintainer on 2026-10-12: "Deveria estar"), the window's side. The
// room's document holds the board's elements, an entry per element and
// version (board/roomModel.ts); this window sends the elements the board
// changed — only those, each at its new version — and takes in the ones
// the others changed, merged into the scene by Excalidraw's own rule
// without touching what this window is changing right now. The people in
// the board are its presence: pointer, selection, name and colour,
// stamped by the server, drawn as Excalidraw's collaborators.
//
// The server cannot draw a board: the first window to join draws the file
// the room was made from and puts it in; and each window that edits hands
// the room the file its own converter makes of the room's state, with
// that state's vector, for the room to write the one made of exactly the
// state it holds (`collab_canvas`).

import * as Y from "yjs";
import { commands } from "./bindings";
import { type CollabHandlers, fromB64, joinRoom, REMOTE, RoomSession, roomSide, toB64 } from "./collab";
import { backgroundOf, type CanvasDoc, type El, parseCanvas } from "./board/model";
import type { BoardPane, BoardPerson as Person, BoardRoomLink } from "./board/types";
import { canvasOf, changedElements, entryKey, mergeScene, outrankedKeys, parseKey, type Rank, rankOf, resolve, sendable, unsent } from "./board/roomModel";

/** The origin of this window's own changes to the room's document. */
const LOCAL = "board";
/** How often the board's changes go out while a person draws. */
const PUSH_EVERY = 60;
/** How long the room's state rests before this window hands it the file. */
const CANVAS_AFTER = 250;
/** How often this window's pointer goes out. */
const POINTER_EVERY = 40;

export class BoardSession extends RoomSession implements BoardRoomLink {
  readonly entries: Y.Map<string>;
  readonly meta: Y.Map<unknown>;
  /** What this window last saw of each element in the room. */
  readonly known = new Map<string, Rank>();
  /** Whether this person may change the board. */
  writable = true;
  /** The board's panes on it in this window: a tab, another tab. */
  private readonly panes = new Set<BoardPane>();
  private edits = 0;
  private pending: { scene: readonly El[]; user: boolean; background: string } | null = null;
  private pushTimer: number | undefined;
  private canvasTimer: number | undefined;
  private pointerTimer: number | undefined;
  private sentAt = "";
  /** Told when the room's state changed: the tab's text face and its
   *  saves out of the room follow it. */
  changed: (() => void) | null = null;

  constructor(path: string, joined: { update: string; revision: string; user: string; epoch: string }, handlers: CollabHandlers, synced = false) {
    super(path, joined, handlers, synced);
    this.entries = this.doc.getMap<string>("elements");
    this.meta = this.doc.getMap("meta");
    for (const [id, el] of this.resolved()) this.known.set(id, rankOf(el));
    this.entries.observe((ev) => {
      if (ev.transaction.origin === LOCAL) return;
      const ids = new Set<string>();
      for (const key of ev.keysChanged) {
        const k = parseKey(key);
        if (k) ids.add(k.id);
      }
      this.pull(ids, undefined);
    });
    this.meta.observe((ev) => {
      if (ev.transaction.origin === LOCAL) return;
      if (ev.keysChanged.has("background")) this.pull(new Set(), this.background());
    });
    this.doc.on("update", (_u: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE && origin !== LOCAL) return;
      this.changed?.();
      this.canvasSoon();
    });
    this.awareness.on("change", () => {
      const people = this.people();
      for (const p of this.panes) p.people(people);
    });
  }

  /** Whether a window drew the file into the room yet. */
  get seeded(): boolean {
    return this.meta.get("seeded") === true;
  }

  /** The canvas the room was made from: its other keys are kept. */
  base(): CanvasDoc {
    const text = this.meta.get("base");
    return (typeof text === "string" ? parseCanvas(text) : null) ?? { nodes: [], edges: [] };
  }

  /** The board's background in the room. */
  background(): string | null {
    const b = this.meta.get("background");
    if (typeof b === "string") return b === "" ? null : b;
    return backgroundOf(this.base());
  }

  /** The room's elements, as every window reads them. */
  resolved(): Map<string, El> {
    return resolve(this.entries.entries());
  }

  /** The canvas the room's elements make: the file the room writes. */
  canvas(): CanvasDoc {
    return canvasOf(this.resolved().values(), this.base(), this.background());
  }

  /** The people's edits counted, as the server counts them. */
  private editsNow(): string {
    const out: [string, string][] = [];
    for (const [k, v] of this.meta.entries()) if (k.startsWith("edit:")) out.push([k, String(v)]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return out.map(([k, v]) => `${k}=${v};`).join("");
  }

  /** Whether the room holds edits it has not written yet. */
  get waiting(): boolean {
    return this.editsNow() !== String(this.meta.get("saved") ?? "");
  }

  /** The board's pane is up: the room's changes and the others reach it.
   *  `drawn` are the elements it drew from the file the room was made
   *  from: put into a room no window drew in yet. */
  attach(pane: BoardPane, drawn: readonly El[]): void {
    this.panes.add(pane);
    // The browser tests read the room's state (e2e-server/): only when they
    // ask for it (`__VERSO_TEST__`), as the board's scene is read.
    const test = (window as unknown as { __VERSO_TEST__?: { boardRoom?: unknown } }).__VERSO_TEST__;
    if (test) test.boardRoom = this;
    if (!this.seeded) this.seed(drawn);
    else {
      // Drawn from the file while the room held more: what the room holds.
      this.pull(new Set(this.resolved().keys()), this.background());
    }
    pane.people(this.people());
  }

  /** The file the room was made from, drawn (`drawn`), put into a room no
   *  window drew in yet: not anyone's edit, so nothing is written for it.
   *  A change made before it would make a file of a part of the board. */
  seed(drawn: readonly El[]): void {
    if (this.seeded || !this.writable || !this.open) return;
    this.doc.transact(() => {
      for (const e of drawn) {
        this.put(e);
        this.known.set(e.id, rankOf(e));
      }
      this.meta.set("seeded", true);
      this.meta.set("background", backgroundOf(this.base()) ?? "");
    }, LOCAL);
  }

  /** Everything the room holds, into the boards again: what came in while
   *  a board was starting. */
  resync(): void {
    if (this.open && this.seeded) this.pull(new Set(this.resolved().keys()), this.background());
  }

  detach(pane: BoardPane): void {
    this.panes.delete(pane);
  }

  /** Whether this window's version of `e` is its own, still on its way. */
  mine(e: El): boolean {
    return this.writable && unsent(e, this.known);
  }

  /** The board changed: what it changed goes to the room, in a moment.
   *  `user`: a person's edit is in it (only that leaves something to
   *  write; what the board adjusts by itself rides along). */
  scene(scene: readonly El[], background: string, user: boolean): void {
    // Out of the room for good (closed, left): the board is drawn again.
    if (!this.writable || !this.open) return;
    const was = this.pending;
    this.pending = { scene, user: user || (was?.user ?? false), background };
    if (this.pushTimer === undefined) this.pushTimer = window.setTimeout(() => this.push(), PUSH_EVERY);
  }

  /** What waits to go out, now. */
  push(): void {
    window.clearTimeout(this.pushTimer);
    this.pushTimer = undefined;
    const p = this.pending;
    this.pending = null;
    if (!p || !this.writable || !this.open) return;
    const held = this.resolved();
    const changed = changedElements(p.scene, this.known);
    const bg = p.background === "transparent" ? "" : p.background;
    // The background is the person's to change, never the board loading.
    const bgChanged = p.user && this.seeded && (typeof this.meta.get("background") === "string" ? this.meta.get("background") : (backgroundOf(this.base()) ?? "")) !== bg;
    if (changed.length > 0 || bgChanged) {
      // A deletion jumps ahead of any move made meanwhile (roomModel.ts).
      this.doc.transact(() => {
        for (const e of changed) {
          this.put(sendable(e, held.get(e.id)));
          this.known.set(e.id, rankOf(e));
        }
        if (bgChanged) this.meta.set("background", bg);
        if (p.user) this.meta.set(`edit:${this.doc.clientID}`, ++this.edits);
      }, LOCAL);
    }
    // What the board shows that is not the room's winner, and is not a
    // change of its own still to go — a deletion as it was sent (jumped
    // ahead), a version of its own another outranked, one it was busy with
    // while the room's later version came in — takes the room's version
    // now: an undo here then counts from it, and nothing is left behind.
    const room = this.resolved();
    const behind = new Set<string>();
    for (const e of p.scene) {
      const w = room.get(e.id);
      if (!w || unsent(e, this.known)) continue;
      const a = rankOf(e);
      const b = rankOf(w);
      if (a.version !== b.version || a.nonce !== b.nonce) behind.add(e.id);
    }
    if (behind.size > 0) this.pull(behind, undefined);
  }

  /** `e` into the room at its version; the entries of it it outranks go.
   *  One a later version outranks stays beside it, and loses. */
  private put(e: El): void {
    const r = rankOf(e);
    for (const key of outrankedKeys(this.entries.keys(), e.id, r)) this.entries.delete(key);
    this.entries.set(entryKey(e.id, r), JSON.stringify(e));
  }

  /** The room's elements `ids` (and its background), into the board. */
  private pull(ids: ReadonlySet<string>, background: string | null | undefined): void {
    const all = this.resolved();
    const remote: El[] = [];
    for (const id of ids) {
      const e = all.get(id);
      if (e) remote.push(e);
    }
    if (remote.length === 0 && background === undefined) return;
    // Merged while `known` still says what the board last agreed on: a
    // change of its own not sent yet — a deletion above all — is told from
    // one the room already has (`mine`). What a board took in is agreed on
    // now; what it kept (its own, or what it is busy with) is not.
    if (this.panes.size === 0) {
      for (const e of remote) this.known.set(e.id, rankOf(e));
      return;
    }
    const taken = new Set<string>();
    for (const p of this.panes) for (const id of p.apply(remote, background)) taken.add(id);
    for (const e of remote) if (taken.has(e.id)) this.known.set(e.id, rankOf(e));
  }

  /** The board as the room has it, merged over `local` (mergeScene). */
  merged(local: readonly El[], busy: ReadonlySet<string>): El[] {
    return mergeScene(local, this.resolved().values(), busy, (e) => this.mine(e));
  }

  /** Hand the room the file, once the state rests, when edits wait. */
  private canvasSoon(): void {
    if (!this.writable || !this.live || !this.waiting) return;
    window.clearTimeout(this.canvasTimer);
    this.canvasTimer = window.setTimeout(() => void this.sendCanvas(), CANVAS_AFTER);
  }

  /** The file this window's converter makes of the room's state now. */
  async sendCanvas(): Promise<void> {
    window.clearTimeout(this.canvasTimer);
    if (!this.writable || !this.live || !this.open || !this.waiting) return;
    const at = toB64(Y.encodeStateVector(this.doc));
    if (at === this.sentAt) return;
    this.sentAt = at;
    await commands.collabCanvas(this.path, at, JSON.stringify(this.canvas()));
  }

  /** Everything this window changed is in the room, and the room has the
   *  file of it: before ⌘S, a closing tab, a choice on a conflict. */
  async flush(): Promise<void> {
    this.push();
    this.sentAt = "";
    await this.sendCanvas();
  }

  /** The changes of a canvas given anew — its text edited, a link
   *  rewritten — as elements at versions that win (roomModel.ts). */
  patch(elements: readonly El[]): void {
    if (!this.writable || !this.open || elements.length === 0) return;
    this.doc.transact(() => {
      for (const e of elements) this.put(e);
      this.meta.set(`edit:${this.doc.clientID}`, ++this.edits);
    }, LOCAL);
    this.pull(new Set(elements.map((e) => e.id)), undefined);
  }

  /** This window's pointer, for the others: at most every few frames,
   *  and where it came to rest last. */
  pointer(x: number, y: number, tool: "pointer" | "laser", button: "up" | "down"): void {
    this.lastPointer = { x, y, tool, button };
    if (this.pointerTimer !== undefined) return;
    const send = (): void => {
      const p = this.lastPointer;
      this.lastPointer = null;
      if (!p || !this.open) {
        this.pointerTimer = undefined;
        return;
      }
      this.awareness.setLocalStateField("pointer", { x: p.x, y: p.y, tool: p.tool });
      this.awareness.setLocalStateField("button", p.button);
      this.pointerTimer = window.setTimeout(send, POINTER_EVERY);
    };
    send();
  }
  private lastPointer: { x: number; y: number; tool: "pointer" | "laser"; button: "up" | "down" } | null = null;

  /** This window's selection, for the others. */
  selected(ids: readonly string[]): void {
    this.awareness.setLocalStateField("selected", [...ids]);
  }

  /** The others on the board, as Excalidraw draws them: their pointer,
   *  their selection, their name and colour. */
  people(): Map<string, Person> {
    const out = new Map<string, Person>();
    for (const [id, state] of this.awareness.getStates()) {
      if (id === this.doc.clientID) continue;
      const s = state as { user?: { name?: string; color?: string; colorLight?: string }; pointer?: Person["pointer"]; button?: "up" | "down"; selected?: string[] };
      const name = s.user?.name;
      if (!name) continue;
      const stroke = s.user?.color ?? "#b5651d";
      const person: Person = { username: name, color: { background: s.user?.colorLight ?? `${stroke}33`, stroke }, id: String(id) };
      if (s.pointer && Number.isFinite(s.pointer.x) && Number.isFinite(s.pointer.y)) person.pointer = { x: s.pointer.x, y: s.pointer.y, tool: s.pointer.tool === "laser" ? "laser" : "pointer" };
      if (s.button === "down" || s.button === "up") person.button = s.button;
      if (Array.isArray(s.selected)) person.selectedElementIds = Object.fromEntries(s.selected.filter((x) => typeof x === "string").map((x) => [x, true] as const));
      out.set(String(id), person);
    }
    return out;
  }

  protected sameAs(fresh: Y.Doc): boolean {
    const theirs = resolve(fresh.getMap<string>("elements").entries());
    const mine = this.resolved();
    if (theirs.size !== mine.size) return false;
    for (const [id, e] of mine) {
      const t = theirs.get(id);
      if (!t || rankOf(t).version !== rankOf(e).version || rankOf(t).nonce !== rankOf(e).nonce) return false;
    }
    return true;
  }

  override leave(): void {
    window.clearTimeout(this.pushTimer);
    window.clearTimeout(this.canvasTimer);
    window.clearTimeout(this.pointerTimer);
    this.panes.clear();
    super.leave();
  }
}

/** Join the room of the board at `path`: null where the side keeps no
 *  rooms, the person keeps the folder local, or the link is down. */
export function joinBoard(path: string, handlers: CollabHandlers, writable: boolean, catching?: () => void): Promise<BoardSession | null> {
  return joinRoom(
    path,
    catching,
    (joined, synced) => {
      if (joined.kind !== "board") return null;
      const s = new BoardSession(path, joined, handlers, synced);
      s.writable = writable && !s.reader;
      return s;
    },
    // The same board in another tab of this window: one place in the room.
    { handlers, is: (s): s is BoardSession => s instanceof BoardSession },
  );
}

/** Into the room of the board at `path` for one change, with no tab: the
 *  elements `change` makes of the room's (null: nothing to change), sent,
 *  the room handed the file and asked to write it, and out. False when no
 *  room took it: the caller writes the file as before. */
export async function visitBoard(path: string, change: (room: ReadonlyMap<string, El>, base: CanvasDoc) => El[] | null, draw: (base: CanvasDoc) => El[]): Promise<boolean> {
  // Someone is in it, and this window may go in (roomSide: the side keeps
  // rooms, the person keeps the folder live, this window holds no tab of it).
  if (!(await roomSide.present(path).catch(() => false))) return false;
  const r = await commands.collabJoin(path);
  if (r.status !== "ok" || r.data.read_only || r.data.kind !== "board") {
    if (r.status === "ok") void commands.collabLeave(path);
    return false;
  }
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, fromB64(r.data.update), REMOTE);
    const entries = doc.getMap<string>("elements");
    const meta = doc.getMap("meta");
    const base = (typeof meta.get("base") === "string" ? parseCanvas(meta.get("base") as string) : null) ?? { nodes: [], edges: [] };
    // A room no window drew in yet: the file it was made from goes in
    // first, or the room would write a part of the board.
    const unseeded = meta.get("seeded") !== true;
    const room = unseeded ? new Map(draw(base).map((e) => [e.id, e] as const)) : resolve(entries.entries());
    const els = change(room, base);
    if (!els) return true;
    if (els.length === 0) return true;
    const before = Y.encodeStateVector(doc);
    doc.transact(() => {
      if (unseeded) {
        for (const e of room.values()) entries.set(entryKey(e.id, rankOf(e)), JSON.stringify(e));
        meta.set("seeded", true);
        meta.set("background", backgroundOf(base) ?? "");
      }
      for (const e of els) {
        const rank = rankOf(e);
        for (const key of outrankedKeys(entries.keys(), e.id, rank)) entries.delete(key);
        entries.set(entryKey(e.id, rank), JSON.stringify(e));
      }
      meta.set(`edit:${doc.clientID}`, 1);
    }, LOCAL);
    const sent = await commands.collabUpdate(path, toB64(Y.encodeStateAsUpdate(doc, before)));
    if (sent.status !== "ok") return false;
    const bg = meta.get("background");
    const background = typeof bg === "string" ? (bg === "" ? null : bg) : backgroundOf(base);
    await commands.collabCanvas(path, toB64(Y.encodeStateVector(doc)), JSON.stringify(canvasOf(resolve(entries.entries()).values(), base, background)));
    await commands.collabSave(path);
    return true;
  } finally {
    doc.destroy();
    await commands.collabLeave(path);
  }
}
