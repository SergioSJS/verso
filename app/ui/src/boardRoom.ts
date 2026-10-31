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
import { canvasOf, changedElements, entryKey, Layouts, mergeScene, outrankedKeys, parseKey, type Rank, rankOf, resolve, sameSubstance, sendable, unsent } from "./board/roomModel";

/** The origin of this window's own changes to the room's document. */
const LOCAL = "board";
/** How often the board's changes go out while a person draws. */
const PUSH_EVERY = 60;
/** How long the room's state rests before this window hands it the file. */
const CANVAS_AFTER = 250;
/** How many times in a row the board's own change to an element it took
 *  in goes to the room before the room's version is let stand. */
const SELF_MADE_MOST = 3;
/** How many passes in a row an element the room holds and the board does
 *  not draw is handed to the board again before it is let be. */
const MISSING_MOST = 3;
/** How often this window's pointer goes out. */
const POINTER_EVERY = 40;

export class BoardSession extends RoomSession implements BoardRoomLink {
  entries!: Y.Map<string>;
  meta!: Y.Map<unknown>;
  /** What this window last saw of each element in the room. */
  readonly known = new Map<string, Rank>();
  /** Whether this person may change the board. */
  writable = true;
  /** The board's panes on it in this window: a tab, another tab. */
  private readonly panes = new Set<BoardPane>();
  private edits = 0;
  private pending: { scene: readonly El[]; user: boolean; background: string } | null = null;
  /** Per element: how many times in a row the board changed by itself
   *  the room's version it took in. A person's change resets it. */
  private readonly selfMade = new Map<string, number>();
  /** The texts this window laid out, the only ones it measures again
   *  (roomModel.ts `Layouts`). */
  readonly layouts = new Layouts();
  /** Per element: passes in a row the room held it and the board did not
   *  draw it. */
  private readonly missing = new Map<string, number>();
  /** The scene as the board last said it. */
  private last: { scene: readonly El[]; user: boolean; background: string } | null = null;
  private pushTimer: number | undefined;
  private canvasTimer: number | undefined;
  private pointerTimer: number | undefined;
  private sentAt = "";
  /** Told when the room's state changed: the tab's text face and its
   *  saves out of the room follow it. */
  changed: (() => void) | null = null;

  constructor(path: string, joined: { update: string; revision: string; user: string; epoch: string }, handlers: CollabHandlers, synced = false) {
    super(path, joined, handlers, synced);
    this.bind();
  }

  /** This session's maps and listeners, on the document it holds now (made
   *  again after a refusal, `reborn`). */
  private bind(): void {
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

  /** Whether this window is in a shadow of the room: a player's, made by the
   *  server of what their account sees (ADR 0113 H). A card of a file they do
   *  not see is a locked marker in it, and the room refuses a change to one:
   *  the board's own adjustments of a locked element are never sent. */
  get shadow(): boolean {
    return this.meta.get("shadow") === true;
  }

  /** The room's state is a new document (an edit it refused is not in it):
   *  every board of this window takes it in, in place — the view, the
   *  selection and the tool are the board's own state, untouched — and what
   *  the board drew that the room does not hold goes. Nothing of it is sent
   *  back: the window agrees with the room. */
  protected override beforeRejoin(): void {
    // What the board holds as the refusal came, and a change still waiting
    // to go: told from what the person changes while the state comes in.
    this.during = this.pending ? { ...this.pending } : null;
    this.snapshot = new Map((this.last?.scene ?? []).map((e) => [e.id, `${rankOf(e).version}:${rankOf(e).nonce}`] as const));
    window.clearTimeout(this.pushTimer);
    this.pushTimer = undefined;
    this.pending = null;
  }
  private during: { scene: readonly El[]; user: boolean; background: string } | null = null;
  private snapshot = new Map<string, string>();

  protected override reborn(): void {
    window.clearTimeout(this.pushTimer);
    window.clearTimeout(this.canvasTimer);
    this.pushTimer = undefined;
    this.canvasTimer = undefined;
    this.bind();
    const room = this.resolved();
    // What the person did while the state came in: kept, never undone, and
    // judged by the room as any change.
    const during = this.during;
    this.during = null;
    const kept = new Set<string>();
    for (const e of during?.scene ?? []) {
      const r = rankOf(e);
      if (this.snapshot.get(e.id) !== `${r.version}:${r.nonce}`) kept.add(e.id);
    }
    const seen = new Set((this.last?.scene ?? []).map((e) => e.id));
    for (const e of during?.scene ?? []) if (!seen.has(e.id)) kept.add(e.id);
    // The room has not been drawn into yet (a shadow made anew): what the
    // board drew is put in again, as the first window does.
    // What was sent and the room refused is not drawn into it: it goes back
    // to the file's version, or goes, on the board too.
    const back: El[] = [];
    let reseed: El[] | null = null;
    if (!this.seeded) {
      const scene = this.last?.scene ?? [];
      for (const e of scene) {
        if (kept.has(e.id) || room.has(e.id) || !this.sentIds.has(e.id)) continue;
        const orig = this.drawnAt.get(e.id);
        back.push(orig ? { ...orig, version: rankOf(e).version + 1 } : { ...e, isDeleted: true, version: rankOf(e).version + 1 });
      }
      const undone = new Map(back.map((e) => [e.id, e] as const));
      reseed = scene.map((e) => room.get(e.id) ?? undone.get(e.id) ?? e).filter((e) => !e.isDeleted && !kept.has(e.id));
    }
    this.sentIds.clear();
    const gone: El[] = [];
    if (!reseed) for (const e of this.last?.scene ?? []) if (!room.has(e.id) && !kept.has(e.id)) gone.push({ ...e, isDeleted: true, version: rankOf(e).version + 1 });
    this.pending = null;
    this.last = null;
    this.known.clear();
    for (const [id, e] of room) this.known.set(id, rankOf(e));
    for (const g of gone) this.known.set(g.id, rankOf(g));
    for (const b of back) this.known.set(b.id, rankOf(b));
    this.selfMade.clear();
    this.missing.clear();
    this.sentAt = "";
    this.adopting = true;
    this.keep = kept;
    try {
      for (const p of this.panes) p.apply([...room.values(), ...(reseed ? back : gone)], this.background());
    } finally {
      this.adopting = false;
      this.keep = new Set();
    }
    if (reseed) this.seed(reseed);
    // The change made meanwhile goes out now, as any other.
    if (during && kept.size > 0) {
      // Only what the person did meanwhile: the refused change is not sent again.
      const replay = [...room.values(), ...during.scene.filter((e) => kept.has(e.id))];
      this.pending = { scene: replay, user: during.user, background: during.background };
      this.last = { scene: replay, user: false, background: during.background };
      this.pushSoon();
    }
    this.changed?.();
  }
  private adopting = false;
  /** The ids sent to the room since the window last had its state from it. */
  private readonly sentIds = new Set<string>();
  /** The elements as the window drew them from the file when it seeded. */
  private readonly drawnAt = new Map<string, El>();
  private keep = new Set<string>();

  /** A shadow's refusal does not reload the board: the room's state comes
   *  in again, in place (`reborn`). */
  protected override keepsSceneOnRefusal(): boolean {
    return this.shadow;
  }

  /** Whether `e` is one this window never sends: a locked element of a shadow. */
  private mute(e: El): boolean {
    return this.shadow && e["locked"] === true;
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
      this.layouts.seeded(drawn);
      for (const e of drawn) this.drawnAt.set(e.id, e);
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
    return this.writable && (!this.adopting || this.keep.has(e.id)) && unsent(e, this.known);
  }

  /** The board changed: what it changed goes to the room, in a moment.
   *  `user`: a person's edit is in it (only that leaves something to
   *  write; what the board adjusts by itself rides along). */
  scene(scene: readonly El[], background: string, user: boolean): void {
    // Out of the room for good (closed, left): the board is drawn again.
    if (!this.writable || !this.open) return;
    if (user) this.edited = true;
    // The room's state is on its way: kept, and sent after it is in.
    if (this.rejoining) {
      this.during = { scene, user: user || (this.during?.user ?? false), background };
      return;
    }
    const was = this.pending;
    this.pending = { scene, user: user || (was?.user ?? false), background };
    this.last = { scene, user: false, background };
    if (this.pushTimer === undefined) this.pushTimer = window.setTimeout(() => this.push(), PUSH_EVERY);
  }

  /** Send what the board holds of its own on the next beat, though it
   *  said nothing new (a change Excalidraw made by itself while taking the
   *  room's elements in). */
  private pushSoon(): void {
    if (this.pushTimer !== undefined) return;
    this.pushTimer = window.setTimeout(() => this.push(), PUSH_EVERY);
  }

  /** What waits to go out, now. */
  push(): void {
    window.clearTimeout(this.pushTimer);
    this.pushTimer = undefined;
    if (this.rejoining) return;
    // Nothing new said: the scene as last said, for what the board changed
    // by itself since (`pushSoon`).
    const p = this.pending ?? this.last;
    this.pending = null;
    if (!p || !this.writable || !this.open) return;
    const held = this.resolved();
    const changed = changedElements(p.scene, this.known).filter((e) => {
      const was = held.get(e.id);
      // An element that is what the room told in substance (a version the
      // board bumped by itself): agreed on here, never sent — the server
      // would take it for nothing, and there is nothing to say.
      if (this.shadow && was && !e.isDeleted && sameSubstance(e, was)) {
        this.known.set(e.id, rankOf(e));
        return false;
      }
      if (!this.mute(e)) return true;
      // The board's own change of a marker: agreed on here, never sent.
      this.known.set(e.id, rankOf(e));
      return false;
    });
    const bg = p.background === "transparent" ? "" : p.background;
    // The background is the person's to change, never the board loading.
    const bgChanged = p.user && this.seeded && (typeof this.meta.get("background") === "string" ? this.meta.get("background") : (backgroundOf(this.base()) ?? "")) !== bg;
    if (changed.length > 0 || bgChanged) {
      // A deletion jumps ahead of any move made meanwhile (roomModel.ts).
      this.doc.transact(() => {
        for (const e of changed) {
          this.layouts.sent(e, held.get(e.id));
          this.put(sendable(e, held.get(e.id)));
          this.known.set(e.id, rankOf(e));
          this.sentIds.add(e.id);
        }
        if (bgChanged) this.meta.set("background", bg);
        if (p.user) this.meta.set(`edit:${this.doc.clientID}`, ++this.edits);
      }, LOCAL);
      if (p.user) for (const e of changed) this.selfMade.delete(e.id);
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
      // The room's version let stand here, laid out this board's way.
      if ((this.selfMade.get(e.id) ?? 0) > SELF_MADE_MOST) continue;
      const a = rankOf(e);
      const b = rankOf(w);
      if (a.version !== b.version || a.nonce !== b.nonce) behind.add(e.id);
    }
    // An element the room holds and the board does not draw at all — taken
    // in while the board replaced its scene, and lost there (seen on macOS,
    // 2026-10-13: three windows agreed on the room and the file, and one of
    // them never drew an element another had just made) — is drawn now.
    // Tried a few times, so a board that will not take an element cannot
    // loop on it.
    const drawn = new Set(p.scene.map((e) => e.id));
    for (const id of room.keys()) {
      if (drawn.has(id)) {
        this.missing.delete(id);
        continue;
      }
      const n = (this.missing.get(id) ?? 0) + 1;
      this.missing.set(id, n);
      if (n <= MISSING_MOST) behind.add(id);
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

  /** The room's elements `ids` (and its background), into the board — in
   *  a task of its own, after the tasks already queued, the ones asked for
   *  meanwhile together. Excalidraw changes its scene at once but its
   *  state (the selection above all) only when React renders, in a task it
   *  queued: a key or a pointer just handled — an undo selecting again an
   *  element it restored, a press selecting the element under it — can
   *  have a selection still to come. Handed the room's elements in
   *  between, the board deletes an element the person's own action is
   *  about to select, and draws it selected and deleted (Excalidraw's
   *  "[NONDELETED][INVARIANT] getSelectedElements skipping deleted
   *  selected element", seen on macOS and in Linux under load,
   *  2026-10-13). After those tasks, the selection the board reads is the
   *  one it will draw, and the elements another deleted leave it first. */
  private pull(ids: ReadonlySet<string>, background: string | null | undefined): void {
    for (const id of ids) this.pullIds.add(id);
    if (background !== undefined) this.pullBackground = background;
    if (this.pullQueued) return;
    this.pullQueued = true;
    nextTask(() => {
      this.pullQueued = false;
      const queued = this.pullIds;
      const bg = this.pullBackground;
      this.pullIds = new Set();
      this.pullBackground = undefined;
      if (this.open) this.pullNow(queued, bg);
    });
  }
  private pullIds = new Set<string>();
  private pullBackground: string | null | undefined = undefined;
  private pullQueued = false;

  /** [`pull`], now. */
  private pullNow(ids: ReadonlySet<string>, background: string | null | undefined): void {
    const all = this.resolved();
    if (![...ids].some((id) => all.has(id)) && background === undefined) return;
    // Every element of the room, not only the ones that changed: the board
    // is handed the room's own version of each element it agrees on, so
    // what it draws — the indices repaired the same in every window
    // (`repairedIndices`) — is made of the room's state alone, never of an
    // earlier repair this window made over fewer elements.
    const remote = [...all.values()];
    // Merged while `known` still says what the board last agreed on: a
    // change of its own not sent yet — a deletion above all — is told from
    // one the room already has (`mine`). What a board took in is agreed on
    // now; what it kept (its own, or what it is busy with) is not.
    if (this.panes.size === 0) {
      for (const e of remote) this.known.set(e.id, rankOf(e));
      return;
    }
    // The versions as the room holds them, taken before the board has
    // them: Excalidraw changes an element it is handed in place — a new
    // index where two share a place, a new version with its own nonce in
    // each window — and that change is the board's own, to be sent, not
    // the room's (seen on macOS, 2026-10-13: every window one version
    // ahead of the room, for good).
    const ranks = new Map(remote.map((e) => [e.id, rankOf(e)] as const));
    const taken = new Set<string>();
    for (const p of this.panes) for (const id of p.apply(remote, background)) taken.add(id);
    let own = false;
    const again = new Set<string>();
    for (const e of remote) {
      if (!taken.has(e.id)) continue;
      const rank = ranks.get(e.id)!;
      this.known.set(e.id, rank);
      if (!unsent(e, this.known)) {
        this.selfMade.delete(e.id);
        continue;
      }
      // Changed by the board itself as it took the room's version (a text
      // laid out again by another engine; never an index any more, which
      // `repairedIndices` hands it valid). Two engines that lay an element
      // out each their own way would answer each other's version for
      // ever: after a few rounds the board is handed the room's version
      // once more, as its own is not — so that it draws the room's — and
      // if it changes that one too, its own stands here, never sent.
      const n = (this.selfMade.get(e.id) ?? 0) + 1;
      this.selfMade.set(e.id, n);
      if (n <= SELF_MADE_MOST) own = true;
      else {
        this.known.set(e.id, rankOf(e));
        if (n === SELF_MADE_MOST + 1) again.add(e.id);
      }
    }
    // The room's version over the board's own, once (see above).
    if (again.size > 0) this.pull(again, undefined);
    // What the board changed of them by itself goes out on the next beat.
    if (own && this.writable) this.pushSoon();
  }

  /** The board as the room has it, merged over `local` (mergeScene). */
  merged(local: readonly El[], busy: ReadonlySet<string>): El[] {
    return mergeScene(local, this.resolved().values(), busy, (e) => this.mine(e));
  }

  protected override idle(): void {
    // A file sent while an update was still on its way was set aside by the
    // room (its state was not the room's yet): sent again, though the state
    // is the same.
    this.sentAt = "";
    this.canvasSoon();
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
    const r = await commands.collabCanvas(this.path, at, JSON.stringify(this.canvas()));
    // The room could not make the file of this window's board: told as any
    // refusal of the room is (the board takes the room's state in again).
    if (r.status !== "ok" && r.error.kind === "refused" && this.shadow) this.lost();
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

/** Run `f` in a task of its own, after the tasks already queued (a
 *  posted message: not delayed as a timer is in a window in the
 *  background). */
function nextTask(f: () => void): void {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close();
    f();
  };
  port2.postMessage(null);
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
