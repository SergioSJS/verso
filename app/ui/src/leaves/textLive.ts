// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A text file that is not a note — `.txt`, `.json`, `.csv`, a base's
// `.base`, a page's source — live in the server's room, as a note is
// (ADR 0082 item 12, decided by the maintainer on 2026-10-12): the room's
// Yjs text bound to the source editor, the others' cursors and names in
// it, the room writing the file once the edits settle. A base edited
// through its view's settings changes the editor's text, so it goes into
// the room as typing does. On a synced folder the tab goes local and back
// as a note's does (items 8 and 9), and says so in words (item 14).

import { Transaction } from "@codemirror/state";
import { commands } from "../bindings";
import { type CollabHandlers, type LocalWhy, lostLine, type RoomSession } from "../collab";
import { backSaid, type LiveState, liveLine, localSaid, presenceSaid } from "../coeditWords";
import { fail } from "../errors";
import { layout } from "../layout/spaces";
import { opening } from "../opening";
import type { LiveHolder } from "../roomWrites";
import { ui } from "../dom";
import { paintMark, paintWho } from "./liveWho";
import { presenceHeard } from "../notify/sources";
import { bar, say } from "./note/live";
import type { TextLeaf } from "./textfile";

function lang(): string {
  return document.documentElement.lang;
}

/** What the tab does when its text's room speaks. */
export function textHandlers(this: TextLeaf): CollabHandlers {
  return {
    saved: (revision) => {
      this.revision = revision;
      this.seen = null;
      void commands.readText(this.path).then((r) => {
        if (r.status === "ok" && r.data.revision === revision && this.revision === revision) this.seen = { revision, text: r.data.text };
      });
      this.setDirty(false);
    },
    conflict: () => void this.roomConflict(),
    closed: (why) => {
      this.collab = null;
      void this.roomClosed(why);
    },
    remote: () => {},
    local: (why) => void this.textWentLocal(why),
    live: () => this.textCameBack(),
    anew: () => void this.textReadAnew(),
    presence: () => this.presenceChanged(),
    settle: async () => {
      await this.flush();
    },
  };
}

/** The file changed on disk while the room's edits waited: both on screen
 *  for the people in it to choose (ADR 0073 item 7). */
export async function roomConflict(this: TextLeaf): Promise<void> {
  const fresh = await opening.readText(this.path);
  if (fresh.status !== "ok") return fail(fresh.error);
  this.conflict.show({ text: fresh.data.text, revision: fresh.data.revision }, this.roomText());
}

/** The tab's text for the conflict banner and a copy: the editor's. */
export function roomText(this: TextLeaf): string {
  return this.editor.state.doc.sliceString(0, undefined, this.eol);
}

/** The room closed — renamed, deleted, its line ends mixed, read anew:
 *  the file read again, on its own. */
export async function roomClosed(this: TextLeaf, why?: "lost" | "refused"): Promise<void> {
  const path = this.path;
  await this.saving;
  if (!path || path !== this.path) return;
  await this.load(path, true);
  if (why === "lost") ui.status.textContent = lostLine();
}

/** The file's state now; null when it is in no room, or alone in one on
 *  a server. */
export function liveState(this: TextLeaf): LiveState | null {
  if (this.catching) return { kind: "catching" };
  const c = this.liveSession();
  if (!c) return null;
  // On a server, who else is in the file, in words: the others' cursors
  // and pointers carry their names, and a screen reader hears this line.
  if (!c.synced) {
    const others = c.others();
    return others.length > 0 ? { kind: "live", others, reader: false } : null;
  }
  if (!c.live) return { kind: "local", why: c.why ?? "offline" };
  return { kind: "live", others: c.others(), reader: c.reader };
}

/** The state said in the tab and, for the active tab, in the status bar. */
export function paintLive(this: TextLeaf): void {
  const st = this.liveState();
  const line = st ? liveLine(st, lang()) : "";
  this.liveMark.hidden = !st;
  paintMark(this.liveMark, line, st?.kind ?? "");
  paintWho(this, this.liveMark, st?.kind === "live" ? st.others : []);
  if (this.pane.active !== this || layout().focused !== this.pane) return;
  const b = bar();
  b.hidden = !st;
  b.textContent = line;
  b.dataset["live"] = st?.kind ?? "";
}

/** The people in the file changed: said, and shown. */
export function presenceChanged(this: TextLeaf): void {
  const s: RoomSession | null = this.liveSession();
  const now = s?.others() ?? [];
  let fresh: string[] = [];
  if (s) {
    // Someone joining is a notification too (ADR 0084 item 7); said once, as
    // the news decides, and ringed in the presence row.
    fresh = presenceHeard(this.path, this.liveOthers, now, this.pane.active === this && layout().panes().includes(this.pane));
    for (const line of [...presenceSaid([], fresh, lang(), this.liveWhat()), ...presenceSaid(this.liveOthers, now.filter((n) => this.liveOthers.includes(n)), lang(), this.liveWhat())]) say(line);
  }
  this.liveOthers = now;
  this.paintLive();
  paintWho(this, this.liveMark, now, fresh);
}

/** Out of the room, the text kept (ADR 0082 item 8): the revision is the
 *  local file's, and the autosave writes the text there when they differ. */
export async function textWentLocal(this: TextLeaf, why: LocalWhy): Promise<void> {
  this.liveOthers = [];
  this.paintLive();
  say(localSaid(why, lang(), this.liveWhat()));
  const path = this.path;
  const r = await commands.readText(path);
  if (path !== this.path || !this.collab || this.collab.live) return;
  if (r.status !== "ok") return;
  const differs = r.data.text !== this.roomText();
  // See the note's: a file the tab does not hold keeps the old revision, so
  // the save shows both instead of writing over it.
  const unchanged = this.seen !== null && this.seen.revision === this.revision && this.seen.text === r.data.text;
  if (!differs || unchanged || r.data.revision === this.revision || this.collab.revision === r.data.revision) this.revision = r.data.revision;
  this.setDirty(differs);
  if (differs) this.scheduleSave();
}

/** Back in the same room (item 9): what was typed meanwhile went with it. */
export function textCameBack(this: TextLeaf): void {
  const s = this.liveSession();
  if (s) this.revision = s.revision;
  this.liveOthers = s?.others() ?? [];
  this.paintLive();
  say(backSaid(lang(), this.liveWhat()));
}

/** Back, in another room (item 9): the text saved here first, out of the
 *  room; then read anew — sync compared it from the base. */
export async function textReadAnew(this: TextLeaf): Promise<void> {
  await this.flush();
  const before = this.roomText();
  this.collab?.release(this.roomHandlers);
  this.collab = null;
  await this.load(this.path, true);
  this.paintLive();
  if (this.roomText() !== before) say(backSaid(lang(), this.liveWhat(), true));
}

/** The way into the file's room for a write that is not a keystroke — a
 *  plan's rewrite, a folder page's base (roomWrites.ts): an edit of this
 *  tab's editor, which the room's binding sends on as typing does. Null
 *  when the file is not live here. */
export function roomHolder(this: TextLeaf): LiveHolder | null {
  if (!this.collab?.live || this.isReadOnly() || this.conflict.up) return null;
  return {
    text: () => this.editor.state.doc.toString(),
    edit: (change) => this.editor.dispatch({ changes: change, annotations: Transaction.userEvent.of("input") }),
  };
}
