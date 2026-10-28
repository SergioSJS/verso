// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "You only read this folder", said where the person tried to change
// something (maintainer, 2026-10-23: the line at the top of the window was
// useless; "if the person tries to edit … a closed lock somewhere to
// indicate it"). A reader gets no banner: a closed lock beside the folder's
// name says it all the time (screen/frame.ts), and a short notice, close to
// the place of the attempt, says it when they try to type, switch to the
// editing modes, drag, rename or make something. Not on every key: once
// in a few seconds.

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { fileAccess, may } from "./access";
import { h } from "./dom";
import { st } from "./screen/strings";

/** The notice stays up this long, and a new attempt inside this window
 *  after it was shown says nothing again. */
const SHOWN_MS = 3200;
const QUIET_MS = 6000;

let box: HTMLElement | null = null;
let hideTimer = 0;
let lastShown = -Infinity;

/** Where the person acted: a point, or the element they acted on. */
export type Attempt = { x: number; y: number } | Element | null | undefined;

/** Whether a change to `path` (a note, or none: the folder) is refused to
 *  this person (ADR 0113: the server said what they may do with it). */
export function refused(path?: string | null): boolean {
  return !may(path ?? "", "edit");
}

function place(el: HTMLElement, at: Attempt): void {
  let x = innerWidth / 2;
  let y = innerHeight / 3;
  if (at && "getBoundingClientRect" in at) {
    const r = at.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) {
      x = r.left + Math.min(r.width, 320) / 2;
      y = r.top + Math.min(r.height, 120) / 2;
    }
  } else if (at) {
    x = at.x;
    y = at.y;
  }
  const w = Math.min(320, innerWidth - 24);
  el.style.maxWidth = `${w}px`;
  el.style.left = `${Math.max(12, Math.min(x - w / 2, innerWidth - w - 12))}px`;
  el.style.top = `${Math.max(12, Math.min(y + 14, innerHeight - 60))}px`;
}

/** The person tried to change something this folder does not let them.
 *  Says so near `at`, unless it said so a moment ago (or `force`: the lock
 *  was clicked, which asks for the words). Answers whether it spoke. */
export function readerAttempt(at?: Attempt, force = false, path?: string | null, said?: string): boolean {
  const now = performance.now();
  if (!force && now - lastShown < QUIET_MS) return false;
  lastShown = now;
  if (!box) {
    box = h("div", "reader-notice");
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.append(box);
  }
  // A file the person sees and may not change is named for what it is: a
  // note, not the folder ("Você só lê esta nota").
  const seen = path ? fileAccess(path)?.level === "see" : false;
  box.replaceChildren(h("span", "reader-notice-text", said ?? (seen ? st.readOnlyNote : st.readOnly)));
  place(box, at);
  box.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (box) box.hidden = true;
  }, SHOWN_MS);
  return true;
}

/** `readerAttempt` when the change to `path` is refused; answers whether it is. */
export function guard(path?: string | null, at?: Attempt): boolean {
  if (!refused(path)) return false;
  readerAttempt(at, false, path);
  return true;
}

/** `readerAttempt` when making something in `folder` is refused; answers
 *  whether it is. It asks the folder that was chosen — a player of a table
 *  edits the folder they were given, not the root's (ADR 0113 K.5). */
export function guardCreate(folder: string, at?: Attempt, what: "any" | "note" | "board" = "any"): boolean {
  if (may(folder, what === "note" ? "createNote" : what === "board" ? "createBoard" : "create")) return false;
  // A folder the person edits, where the right to create this was not given
  // (K.6), is not a folder they only read: the words say which right.
  const missing = what !== "any" && may(folder, "rename");
  readerAttempt(at, missing, null, missing ? (what === "note" ? st.noRightNote : st.noRightBoard) : undefined);
  return true;
}

/** Whether a key press would have changed the text had the editor let it. */
function editingKey(e: KeyboardEvent): boolean {
  if (e.isComposing) return false;
  if (e.ctrlKey || e.metaKey) return /^[vx]$/i.test(e.key);
  return e.key.length === 1 || e.key === "Enter" || e.key === "Backspace" || e.key === "Delete" || e.key === "Tab";
}

/** For a read-only editor: an attempt to type, paste, cut or drop says why
 *  nothing happened, near the caret. `path` is read at the attempt: a note
 *  granted to the person is theirs to edit, and a file read-only for
 *  another reason (mixed line endings) says nothing of the folder. */
export function readerWatch(path: () => string | null): Extension {
  const attempt = (view: EditorView): boolean => {
    if (!refused(path())) return false;
    const c = view.coordsAtPos(view.state.selection.main.head);
    readerAttempt(c ? { x: c.left, y: c.bottom } : view.dom, false, path());
    return false;
  };
  return EditorView.domEventHandlers({
    keydown: (e, view) => (editingKey(e) ? attempt(view) : false),
    beforeinput: (_e, view) => attempt(view),
    paste: (_e, view) => attempt(view),
    cut: (_e, view) => attempt(view),
    drop: (_e, view) => attempt(view),
  });
}
