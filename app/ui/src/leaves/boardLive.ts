// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A board's tab in the server's room (ADR 0082 item 12, decided by the
// maintainer on 2026-10-12): the board drawn from the room's elements, its
// changes sent to the room and the others' taken in (boardRoom.ts), the
// others' pointers and selections on it, and the room writing the file —
// the tab writes nothing itself while it is live. The text face follows
// the room's saves; text typed there goes into the room as the elements it
// changes. On a synced folder the board goes local and back as a note does
// (items 8 and 9), and says so in words (item 14).

import { commands } from "../bindings";
import { type BoardSession, joinBoard, visitBoard } from "../boardRoom";
import { may } from "../access";
import { type CollabHandlers, canCollab, type JoinAnswer, joinBusy, joinPending, type LocalWhy, refusedLine } from "../collab";
import { localSaid } from "../coeditWords";
import { BOARD_VERSION, parseCanvas, type CanvasDoc } from "../board/model";
import { changedOutside, takeOutsideIn as mergeOutside } from "../board/outside";
import { patchFromCanvas } from "../board/roomModel";
import { fail } from "../errors";
import { leavesOf } from "../layout/spaces";
import { opening } from "../opening";
import { presenceOpened } from "../notify/presence";
import { boardText, t } from "../strings";
import { flashSaved } from "../quietStatus";
import { ui } from "../dom";
import type { BoardLeaf } from "./board";
import { loadBoardModule } from "./board";
import { say } from "./note/live";
import { lineSeparator } from "./text";

/** How long the board rests before a synced folder's board, out of its
 *  room, is saved on this computer. */
const LOCAL_SAVE = 700;

function lang(): string {
  return document.documentElement.lang;
}

const nonce = (): number => Math.floor(Math.random() * 2 ** 31);

/** The one place the file the board stands on moves: its revision and its
 *  text together, so a revision is never taken without the text it names. */
export function hold(this: BoardLeaf, revision: string, text: string): void {
  this.revision = revision;
  this.heldRevision = revision;
  this.heldText = text;
}

/** A revision the room wrote, whose text is read at that revision; until
 *  then, or if the file moved on, the base is unknown (`heldRevision` stays
 *  different) and an outside change is judged with no base. */
export function holdRevision(this: BoardLeaf, revision: string): void {
  this.revision = revision;
  this.heldRevision = "";
  const path = this.path;
  void commands.readText(path).then((r) => {
    if (r.status === "ok" && r.data.revision === revision && this.revision === revision && this.path === path) this.hold(revision, r.data.text);
  });
}

/** What the tab does when its board's room speaks. */
export function boardHandlers(this: BoardLeaf): CollabHandlers {
  return {
    saved: (revision) => {
      this.holdRevision(revision);
      this.setDirty(false);
      void this.followSaved(revision);
    },
    conflict: () => void this.boardConflict(),
    closed: (why) => {
      this.room = null;
      // Refused in a shadow: the board stays as drawn (scene and view), the
      // room is left, nothing is sent again, and it is said once.
      if (why === "refused") {
        ui.status.textContent = refusedLine(true);
        this.paintLive();
        return;
      }
      void this.roomClosed(why);
    },
    remote: () => {},
    // The room took the board's state in again, in place: said once.
    refused: () => {
      ui.status.textContent = refusedLine();
    },
    local: (why) => void this.boardWentLocal(why),
    live: () => {
      this.textCameBack();
      // What was drawn out of the room went back into it: the room is
      // handed the file of its state now, to write it.
      void this.room?.flush();
    },
    anew: () => void this.boardReadAnew(),
    presence: () => this.presenceChanged(),
    settle: async () => {
      await this.saveLocalNow();
    },
  };
}

/** Into the board's room, when the side has rooms: a board drawn before
 *  in or out of a room is drawn again the other way. A canvas in another
 *  layout stays out until its first save, shown as a diff, puts it in
 *  Obsidian's (ADR 0057 point 13): the room writes in that layout. */
export async function joinBoardRoom(this: BoardLeaf, path: string, text: string, touched?: () => boolean): Promise<void> {
  const was = this.room;
  was?.release(this.roomHandlers);
  this.room = null;
  // Nor a board of a later Verso, shown and never written (ADR 0057), nor
  // a file that is not one.
  const doc = parseCanvas(text);
  const later = typeof doc?.verso?.version === "number" && doc.verso.version > BOARD_VERSION;
  // A board no room takes by what it is (later version, mixed line ends,
  // another layout) stays out for good; one a link not ready left out asks
  // again when the link is back (`roomsBack`).
  this.roomless = !(lineSeparator(text) !== null && this.layoutIsKept() && doc !== null && !later);
  const room = !this.roomless
      ? await joinBoard(path, this.roomHandlers, may(path, "edit"), () => {
          this.catching = true;
          this.paintLive();
        })
      : null;
  this.catching = false;
  if (this.path !== path) {
    room?.release(this.roomHandlers);
    return;
  }
  // A retry that found the person drew or typed meanwhile joins nothing:
  // the board stays as it is, local, and the join is asked again.
  if (touched?.()) {
    room?.release(this.roomHandlers);
    this.paintLive();
    return;
  }
  this.room = room;
  if (room) room.changed = () => this.roomChanged();
  this.liveOthers = room?.others() ?? [];
  if (room) presenceOpened(this.path, this.liveOthers);
  if (was || room) this.unmountBoard();
  this.paintLive();
}

/** The canvas a board in a room is drawn from: the file the room was made
 *  from, with the room's background. */
export function roomInitial(this: BoardLeaf, room: BoardSession): string {
  const base = room.base();
  const verso: Record<string, unknown> = { ...(base.verso ?? {}) };
  const bg = room.background();
  if (bg) verso["background"] = bg;
  else delete verso["background"];
  return JSON.stringify({ ...base, verso });
}

/** The room's state changed: a synced folder's board out of its room is
 *  saved on this computer once it rests (item 8). */
export function roomChanged(this: BoardLeaf): void {
  const room = this.room;
  if (!room || room.live) return;
  window.clearTimeout(this.localTimer);
  this.localTimer = window.setTimeout(() => void this.saveLocalNow(), LOCAL_SAVE);
}

/** Out of the room, what the room's document holds goes to the local file
 *  — over the local file's revision (invariant 11) — when it differs. */
export async function saveLocalNow(this: BoardLeaf): Promise<void> {
  window.clearTimeout(this.localTimer);
  const room = this.room;
  if (!room || room.live || !room.writable) return this.saving;
  // What sync brought down meanwhile comes in first, in the line of the
  // writes (none runs beside it): the save is made over the revision of a
  // file the board holds all of.
  const merge = this.saving.then(() => this.takeOutsideIn());
  this.saving = merge.then(() => undefined, () => undefined);
  if ((await merge) === "conflict") return;
  if (!this.room || this.room.live) return;
  const json = JSON.stringify(this.room.canvas());
  const laid = await commands.boardPreview(this.path, json);
  const now = await commands.readText(this.path);
  if (laid.status === "ok" && now.status === "ok" && laid.data === now.data.text) return;
  await this.saveBoardJson(json);
}

/** Out of the room, the file changed on disk from outside (sync bringing
 *  the others' drawings down): its news taken into the board, as the
 *  elements it changes, and only then is the file's revision the board's —
 *  never the revision alone, which would let the next save write over it
 *  (invariant 11, the loss of 2026-10-26). An element changed on both
 *  sides, a base not known, or a file that is not a board: nothing is
 *  taken over the board's, the revision stays, and both are on screen. */
export async function takeOutsideIn(this: BoardLeaf): Promise<"same" | "taken" | "conflict"> {
  const path = this.path;
  const room = this.room;
  if (!room || room.live || this.conflict.up) return "same";
  const was = this.revision;
  const stale = (): boolean => path !== this.path || this.room !== room || room.live || this.revision !== was;
  const r = await commands.readText(path);
  if (r.status !== "ok" || stale()) return "same";
  if (!changedOutside(this.revision, r.data.revision)) return "same";
  if (r.data.text !== this.heldText || this.heldRevision !== this.revision) {
    const mod = await loadBoardModule();
    if (stale()) return "same";
    const base = this.heldRevision === this.revision ? this.heldText : null;
    const got = mergeOutside(room, mod.drawnOf, base, r.data.text, nonce);
    if (!got.ok || got.conflicts.length > 0) {
      await this.boardConflict();
      return "conflict";
    }
  }
  this.hold(r.data.revision, r.data.text);
  if (!this.textEdited) this.showText(r.data.text);
  return "taken";
}

/** The sync is back and this tab holds no room (it was read while the link
 *  was down): the file is read anew and the room joined, once nothing is
 *  unsaved. Nothing drawn or typed meanwhile is ever replaced: the join
 *  gives up and is asked again after the next wait. */
export async function roomsBack(this: BoardLeaf): Promise<void> {
  const path = this.path;
  if (!path || this.room || this.roomless) return;
  if (this.joining || this.conflict.up || this.textEdited) return joinBusy(path);
  this.joining = true;
  let again = false;
  try {
    if (!(await this.flush()) || this.room || path !== this.path) {
      again = !this.room && path === this.path;
      return;
    }
    if (this.touchedSince()) {
      again = true;
      return;
    }
    await this.load(path, true, true);
    again = this.retryBailed;
  } finally {
    this.joining = false;
    if (again && path === this.path && !this.torn) joinBusy(path);
  }
}

/** The link is back, or a join found it not ready and the wait is over
 *  (collab.ts `onJoinRetry`): `roomsBack` runs when this tab's join is
 *  pending. */
export function joinRetried(this: BoardLeaf, path: string): JoinAnswer {
  if (this.torn || !path || path !== this.path || this.room || this.roomless || !joinPending(path)) return "gone";
  if (this.joining || this.loadsRunning > 0 || this.conflict.up || this.textEdited) return "busy";
  void this.roomsBack();
  return "started";
}

/** The room wrote the file: the text face follows it, unless text is
 *  typed there. A synced folder's file follows when sync brings the save
 *  down (`recheck`). */
export async function followSaved(this: BoardLeaf, revision: string): Promise<void> {
  if (this.room?.synced || this.textEdited) return;
  const r = await commands.readText(this.path);
  if (r.status !== "ok" || r.data.revision !== revision || this.textEdited) return;
  this.hold(r.data.revision, r.data.text);
  this.showText(r.data.text);
}

/** The file changed on disk while the room's edits waited: both on screen
 *  — the disk's, and the room's board as it would be written over it. */
export async function boardConflict(this: BoardLeaf): Promise<void> {
  const room = this.room;
  if (!room) return;
  const fresh = await opening.readText(this.path);
  if (fresh.status !== "ok") return fail(fresh.error);
  const json = JSON.stringify(room.canvas());
  const laid = await commands.boardPreview(this.path, json);
  this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, laid.status === "ok" ? laid.data : json);
}

/** Out of the room (item 8): the board stays as it is, its revision the
 *  local file's, and what it holds is saved here. */
export async function boardWentLocal(this: BoardLeaf, why: LocalWhy): Promise<void> {
  this.liveOthers = [];
  this.paintLive();
  say(localSaid(why, lang(), "board"));
  const path = this.path;
  const r = await commands.readText(path);
  if (path !== this.path || !this.room || this.room.live || r.status !== "ok") return;
  // The file may already be one sync wrote after the room's last save: its
  // news come in before its revision is the board's.
  await this.saveLocalNow();
}

/** Back, in another room (item 9): the board saved here first; then read
 *  anew, sync having compared it from the base. */
export async function boardReadAnew(this: BoardLeaf): Promise<void> {
  await this.saveLocalNow();
  this.room?.release(this.roomHandlers);
  this.room = null;
  await this.load(this.path, true);
}

/** In the room, the board's save: text typed on the text face goes in as
 *  the elements it changes; the room is handed the file of its state and
 *  asked to write it now (⌘S, a closing tab). */
export async function saveInRoom(this: BoardLeaf): Promise<void> {
  const room = this.room;
  if (!room) return;
  if (this.conflict.up) {
    ui.status.textContent = t.conflictPendingBoth;
    return;
  }
  if (this.textEdited) {
    const text = this.editor.state.doc.toString();
    const next = parseCanvas(text);
    if (!next) {
      ui.status.textContent = boardText.notABoard;
      return;
    }
    await this.applyCanvas(this.textBase, text);
    this.textBase = text;
    this.textEdited = false;
  }
  if (!room.live) return this.saveLocalNow();
  await this.flushBoard();
  for (let tries = 0; tries < 3; tries++) {
    await room.flush();
    const r = await commands.collabSave(this.path);
    if (r.status === "ok") {
      this.holdRevision(r.data);
      this.setDirty(false);
      flashSaved(ui.status, t.saved);
      return;
    }
    if (r.error.kind === "changed") return this.boardConflict();
    // The room had not the file of its newest state yet: once more.
    if (r.error.kind !== "unavailable") return fail(r.error);
    await new Promise((done) => window.setTimeout(done, 200));
  }
}

/** "Write mine over it", in the room: the room's board over the disk's. */
export async function overwriteInRoom(this: BoardLeaf): Promise<void> {
  const room = this.room;
  if (!room) return;
  for (let tries = 0; tries < 3; tries++) {
    await room.flush();
    const r = await commands.collabResolve(this.path, "mine");
    if (r.status === "ok") {
      this.conflict.hide();
      this.holdRevision(r.data);
      this.setDirty(false);
      return;
    }
    if (r.error.kind !== "unavailable") return fail(r.error);
    await new Promise((done) => window.setTimeout(done, 200));
  }
}

/** "Write mine over it", out of the room: the room's board, over the
 *  revision the banner showed — refused, and shown again, if the disk moved
 *  since. */
export async function overwriteLocal(this: BoardLeaf): Promise<void> {
  const room = this.room;
  const disk = this.conflict.disk;
  if (!room || !disk) return;
  const r = await commands.writeBoard(this.path, JSON.stringify(room.canvas()), disk.revision);
  if (r.status !== "ok") {
    if (r.error.kind === "changed") return this.boardConflict();
    return fail(r.error);
  }
  this.conflict.hide();
  this.hold(r.data.revision, r.data.text);
  this.pendingBoard = null;
  this.setDirty(false);
  this.showText(r.data.text);
}

/** A change of the board's file given anew — `before` the canvas it was
 *  made over, `after` the changed one — into the room as the elements it
 *  changes. */
export async function applyCanvas(this: BoardLeaf, before: string, after: string): Promise<boolean> {
  const room = this.room;
  const next = parseCanvas(after);
  if (!room || !next) return false;
  const was: CanvasDoc = parseCanvas(before) ?? { nodes: [], edges: [] };
  const mod = await loadBoardModule();
  // A room no window drew in yet (the text face open, not the board): the
  // file it was made from goes in first.
  room.seed(mod.drawnOf(room.base()));
  room.patch(patchFromCanvas(room.resolved(), mod.drawnOf(next), was, next, nonce));
  return true;
}

/** A change of a board's file made by something other than its board — a
 *  link rewritten after a rename (plan.ts) — while the board is live: into
 *  its room as the elements it changes, through this window's tab, or by
 *  joining the room for this one change. False: no room took it, and the
 *  caller writes the file as before. */
export async function writeBoardLive(path: string, before: string, after: string): Promise<boolean> {
  for (const l of leavesOf(path)) {
    const b = l as BoardLeaf;
    if (b.room?.live && b.room.writable && typeof b.applyCanvas === "function") return b.applyCanvas(before, after);
  }
  if (!(await canCollab())) return false;
  const next = parseCanvas(after);
  if (!next) return false;
  const mod = await loadBoardModule();
  const drawn = mod.drawnOf(next);
  const was = parseCanvas(before) ?? { nodes: [], edges: [] };
  return visitBoard(path, (room) => patchFromCanvas(room, drawn, was, next, nonce), (base) => mod.drawnOf(base));
}
