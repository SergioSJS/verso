// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Notifications in the window (ADR 0084): the one way to raise one. A
// notification is a change of state the person did not cause in that
// moment, or that outlasts it — the sync failed, a share arrived, an
// update is out (item 1). The feedback of an action stays where the
// person acted (the status line, the box beside the button, the banner in
// the note); this is added to it and replaces none of it.
//
// `notify` raises one: once per change of its key's state (core.ts); as
// the person chose its kind (item 8) — a toast and a line in the list, a
// line only, or nothing — and, when they turned it on, the system's
// notification too while the window is not in front (item 9). The bell in
// the status bar (on a phone, at the top of the pane) counts what is
// unread and opens the centre.

import { h, ui } from "../dom";
import { icon } from "../icons";
import { currentFolder, folderName } from "../folder";
import { settings } from "../settings";
import { Book, type ActionRef, type Entry, type Level, type Outcome, type Raise, modeOf, updatePassed } from "./core";
import { Centre } from "./centre";
import { notifyStrings } from "./strings";
import { checkSystem, systemSend } from "./system";
import { dismissKey, showToast } from "./toasts";

/** The machine's storage, each touch of it able to throw. */
const store = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

export const book = new Book(store, () => Date.now(), (kind) => modeOf(settings.notify, kind));

/** What each action does, by its name: registered by those that know how
 *  (main.ts, notify/sources.ts). */
const acts = new Map<string, (arg?: string) => void>();

export function onAct(name: string, run: (arg?: string) => void): void {
  acts.set(name, run);
}

function runAct(a: ActionRef): void {
  const run = acts.get(a.act);
  if (run) run(a.arg);
  else console.warn(`Verso: notification action ${a.act} has no handler`);
}

let centre: Centre | null = null;
const bells: HTMLButtonElement[] = [];

function paintBells(): void {
  const s = notifyStrings();
  const n = book.unread();
  for (const b of bells) {
    b.setAttribute("aria-label", s.bell(n));
    b.title = s.bell(n);
    b.dataset["unread"] = String(n);
    const count = b.querySelector<HTMLElement>(".notify-count");
    if (count) {
      count.textContent = n > 99 ? "99+" : String(n);
      count.hidden = n === 0;
    }
  }
  centre?.open && centre.paint();
}

function bell(cls: string): HTMLButtonElement {
  const b = h("button", `ghost iconic notify-bell ${cls}`);
  b.type = "button";
  b.append(icon("bell"));
  const count = h("span", "notify-count");
  count.setAttribute("aria-hidden", "true");
  count.hidden = true;
  b.append(count);
  b.addEventListener("click", () => openCentre());
  bells.push(b);
  return b;
}

/** The centre, opened — on the entry `id` when one is named. */
export function openCentre(id?: string): void {
  centre?.show(id);
}

/** Raise a notification of the window's folder, or of `folder`. */
export function notify(r: Omit<Raise, "folder" | "folderName"> & { folder?: string; folderName?: string; toast?: boolean }): Outcome {
  const out = book.raise({ ...r, folder: r.folder ?? currentFolder, folderName: r.folderName ?? folderName });
  if (out.said === "same") return out;
  // Its state changed: the toast of the earlier state goes.
  dismissKey(r.key);
  if (out.entry) {
    if (out.said === "toast") {
      if (r.toast !== false) showToast(out.entry, runAct);
      systemSend(out.entry, (id) => openCentre(id));
    }
    paintBells();
  }
  return out;
}

/** The key's state, as last raised or settled. */
export function stateOf(key: string): string | undefined {
  return book.stateOf(key);
}

/** The key's state changed without a word (a person left the note, a
 *  conflict copy went): its toast goes, and the next change is raised. */
export function settle(key: string, state: string, persist = false): void {
  if (book.settle(key, state, persist)) dismissKey(key);
}

/** The "update available" lines of versions the app running at `running`
 *  already has leave the list, and their toasts go: after an update, the
 *  notification of it is not news, and its button has nothing to do. */
export function dropPassedUpdates(running: string): void {
  const gone = book.entries.filter((e) => updatePassed(e, running));
  if (!book.drop((e) => updatePassed(e, running))) return;
  for (const e of gone) dismissKey(e.key);
  paintBells();
}

/** A toast that is not a notification: the feedback of an action that is
 *  better seen than read in the status line (the demo vault imported), or
 *  a fact said once of a folder (a volume where outside changes show
 *  late). No kind, no line in the list, never to the system. */
export function flash(level: Level, title: string, sentence: string): void {
  showToast({ key: `flash:${title}`, level, title, sentence, actions: [] }, runAct);
}

let installed = false;

/** The bells, the centre and the list kept in step with the other windows
 *  of this machine. `settingsSection` opens Settings › Notificações. */
export function installNotify(settingsSection: () => void): void {
  if (installed) return;
  installed = true;
  centre = new Centre(book, {
    folder: () => currentFolder,
    changed: paintBells,
    run: runAct,
    settings: settingsSection,
    say: (text) => (ui.status.textContent = text),
  });
  // The desktop's, before the report button (item 4).
  ui.reportBug.before(bell("bar-toggle notify-bell-bar"));
  // A phone's, at the top of the pane beside the failed line (item 6).
  document.querySelector(".work-notices")?.append(bell("notify-bell-phone"));
  paintBells();
  // Another window of this machine raised, read or cleared one.
  window.addEventListener("storage", (e) => {
    if (e.key !== null && !e.key.startsWith("verso.notify.")) return;
    book.load();
    paintBells();
  });
  void checkSystem();
}

export type { Entry };
