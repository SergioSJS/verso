// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A note of a folder of this computer that syncs, live in the server's
// room while the sync's link is up (ADR 0082). Out of the room — the link
// dropped, sync paused or off, the person's setting — the tab keeps its
// text and goes local: it reads the local file's revision and saves there
// (item 8). Back in the same room, what was typed meanwhile merges; in
// another one, the tab reads the note anew once sync compared its text
// from the base — the text kept in the file, or beside it in a copy
// (item 9). The state is said in words in the tab and the status bar, and
// to a screen reader (item 14).

import { Transaction } from "@codemirror/state";
import { commands } from "../../bindings";
import type { LocalWhy } from "../../collab";
import { type LiveState, liveLine, liveWords, localSaid, presenceSaid } from "../../coeditWords";
import { h, ui } from "../../dom";
import { paintMark, paintWho } from "../liveWho";
import { presenceHeard } from "../../notify/sources";
import { layout, spaces } from "../../layout/spaces";
import type { LiveHolder } from "../../roomWrites";
import type { NoteLeaf } from "../note";

function lang(): string {
  return document.documentElement.lang;
}

/** Said to a screen reader: the status line is a live region. */
export function say(text: string): void {
  ui.status.textContent = text;
}

/** The status bar's line for the active note, beside the sync's state. */
export function bar(): HTMLElement {
  let b = document.getElementById("live-state");
  if (b) return b;
  b = h("span", "status-live");
  b.id = "live-state";
  b.hidden = true;
  (document.getElementById("sync-state") ?? ui.status).after(b);
  return b;
}

/** The note's state now; null when it is not a synced folder's. */
export function liveState(this: NoteLeaf): LiveState | null {
  if (this.catching) return { kind: "catching" };
  const c = this.collab;
  if (!c?.synced) return null;
  if (!c.live) return { kind: "local", why: c.why ?? "offline" };
  return { kind: "live", others: c.others(), reader: c.reader };
}

/** The way into the note's room for a write that is not a keystroke —
 *  the properties panel, a PDF's quote (roomWrites.ts): an edit of this
 *  tab's editor, which the room's binding sends on as typing goes, and
 *  which ⌘Z here undoes. Null when the note is not live: out of its
 *  room, read-only for this person, or stopped on a conflict waiting
 *  for a choice — then the write goes to the file as before, and stops
 *  there on the conflict. */
export function roomHolder(this: NoteLeaf): LiveHolder | null {
  if (!this.collab?.live || this.readOnly || this.conflict.up || this.destroyed) return null;
  return {
    text: () => this.editor.state.doc.toString(),
    edit: (change) => this.editor.dispatch({ changes: change, annotations: Transaction.userEvent.of("input") }),
  };
}

/** The state said in the tab and, for the active note, in the status bar. */
export function paintLive(this: NoteLeaf): void {
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

/** The people in the note changed: said, and shown. */
export function presenceChanged(this: NoteLeaf): void {
  const now = this.collab?.others() ?? [];
  let fresh: string[] = [];
  if (this.collab?.synced) {
    // Someone joining is a notification too (ADR 0084 item 7); said once, as
    // the news decides, and ringed in the presence row.
    fresh = presenceHeard(this.path, this.liveOthers, now, this.pane.active === this && layout().panes().includes(this.pane));
    for (const line of [...presenceSaid([], fresh, lang()), ...presenceSaid(this.liveOthers, now.filter((n) => this.liveOthers.includes(n)), lang())]) say(line);
  }
  this.liveOthers = now;
  this.paintLive();
  paintWho(this, this.liveMark, now, fresh);
}

/** Out of the room, the text kept (item 8): the revision is the local
 *  file's now, and the autosave writes the text there when the two
 *  differ — over that revision, so invariant 11 holds and nothing typed
 *  is lost. */
export async function wentLocal(this: NoteLeaf, why: LocalWhy): Promise<void> {
  this.liveOthers = [];
  this.paintLive();
  say(localSaid(why, lang()));
  const path = this.path;
  const r = await commands.readNote(path);
  if (this.destroyed || path !== this.path || !this.collab || this.collab.live) return;
  if (r.status !== "ok") {
    if (r.error.kind === "not_found" && !this.gone) this.markGone();
    return;
  }
  const differs = r.data.text !== this.editorText();
  // A file that is not the one the tab holds (sync wrote it meanwhile) and
  // differs from the text keeps the tab's old revision: the save meets the
  // difference and shows both, never writes over it (invariant 11).
  const unchanged = this.seen !== null && this.seen.revision === this.revision && this.seen.text === r.data.text;
  if (!differs || unchanged || r.data.revision === this.revision || this.collab.revision === r.data.revision) this.revision = r.data.revision;
  this.setDirty(differs);
  if (differs) this.scheduleSave();
}

/** Back in the same room (item 9): what was typed meanwhile went with it;
 *  the room's revision is the tab's again. */
export function cameBack(this: NoteLeaf): void {
  if (this.collab) this.revision = this.collab.revision;
  this.liveOthers = this.collab?.others() ?? [];
  this.paintLive();
  say(liveWords(lang()).back);
}

/** Back, in another room (item 9): the tab's text saved here first, out
 *  of the room; then read anew — sync compares it from the base before
 *  the join, so it is in the note or beside it in a copy, never lost. */
export async function readAnew(this: NoteLeaf): Promise<void> {
  await this.flush();
  const before = this.editorText();
  this.collab?.release(this.roomHandlers);
  this.collab = null;
  await this.load(this.path, true);
  if (this.destroyed) return;
  this.paintLive();
  if (this.editorText() !== before) say(liveWords(lang()).anew);
}

// The status bar follows the note that is active.
addEventListener("verso:leaf-active", (e) => {
  const leaf = (e as CustomEvent<{ paintLive?: () => void } | null>).detail;
  if (leaf?.paintLive) return leaf.paintLive();
  const b = document.getElementById("live-state");
  if (b) b.hidden = true;
});

// Editing together turned on again for the folder (item 15): a note open
// with nothing unsaved is read again, and joins its room.
addEventListener("verso:live-together", () => {
  for (const sp of spaces)
    for (const pane of sp.layout.panes())
      for (const l of pane.leaves) {
        const n = l as unknown as NoteLeaf;
        if (typeof n.paintLive === "function" && n.collab === null && !n.dirty && n.path && !n.readOnly) void n.load(n.path, true);
      }
});
