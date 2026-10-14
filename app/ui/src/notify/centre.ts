// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The notification centre (ADR 0084 item 5): a panel of the overlay
// stack (Escape closes it, what is under it is inert), opened by the
// status bar's bell, by the phone's at the top of the pane, and by the
// palette's "Notificações". Newest first, each with its time in the
// computer's timezone, its folder when that is not the window's, and its
// actions. Opening it marks everything read; "Limpar" empties it.

import { h } from "../dom";
import { icon } from "../icons";
import { asDialog, closed, opened } from "../dialogs/a11y";
import type { ActionRef, Book, Entry } from "./core";
import { LEVEL_ICON } from "./toasts";
import { notifyStrings } from "./strings";

export type CentreHooks = {
  /** The folder this window shows (its key): another's is named. */
  folder: () => string;
  /** The list changed here (read, cleared): the bells follow. */
  changed: () => void;
  run: (a: ActionRef) => void;
  /** "Ajustes das notificações". */
  settings: () => void;
  /** Said in the status line ("Notificações apagadas."). */
  say: (text: string) => void;
};

function when(ms: number): { text: string; iso: string } {
  const d = new Date(ms);
  const pt = document.documentElement.lang.startsWith("pt");
  return { text: d.toLocaleString(pt ? "pt-BR" : "en", { dateStyle: "short", timeStyle: "short" }), iso: d.toISOString() };
}

export class Centre {
  readonly el = h("div", "quick notify-centre");
  private readonly box = h("div", "notify-centre-box");
  private readonly list = h("ul", "notify-list");
  private readonly storage = h("p", "notify-storage");
  private readonly clearButton = h("button", "ghost notify-clear");
  private readonly heading = h("h2", "notify-centre-title");

  constructor(
    private readonly book: Book,
    private readonly hooks: CentreHooks,
  ) {
    const s = notifyStrings();
    this.el.hidden = true;
    this.heading.id = "notify-centre-title";
    this.heading.textContent = s.centre;
    this.heading.tabIndex = -1;
    asDialog(this.el, s.centre, () => this.hide(), this.heading.id);
    const head = h("div", "notify-centre-head");
    this.clearButton.type = "button";
    this.clearButton.textContent = s.clear;
    this.clearButton.addEventListener("click", () => {
      this.book.clear();
      this.paint();
      this.hooks.changed();
      this.hooks.say(s.cleared);
      this.heading.focus();
    });
    const toSettings = h("button", "ghost iconic notify-to-settings");
    toSettings.type = "button";
    toSettings.title = s.toSettings;
    toSettings.setAttribute("aria-label", s.toSettings);
    toSettings.append(icon("gear"));
    toSettings.addEventListener("click", () => {
      this.hide(false);
      this.hooks.settings();
    });
    const shut = h("button", "ghost iconic notify-centre-close");
    shut.type = "button";
    shut.title = s.close;
    shut.setAttribute("aria-label", s.close);
    shut.append(icon("close"));
    shut.addEventListener("click", () => this.hide());
    head.append(this.heading, this.clearButton, toSettings, shut);
    this.list.setAttribute("aria-labelledby", this.heading.id);
    this.storage.setAttribute("role", "note");
    this.storage.textContent = s.noStorage;
    this.box.append(head, this.storage, this.list);
    this.el.append(this.box);
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => {
      if (e.target === this.el) this.hide();
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Opened — on the entry `id`, when a system's notification was clicked. */
  show(id?: string): void {
    opened(this.el);
    this.el.hidden = false;
    this.paint();
    if (this.book.markAllRead()) this.hooks.changed();
    const at = id ? this.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) : null;
    if (at) {
      at.classList.add("notify-here");
      at.scrollIntoView({ block: "nearest" });
      at.focus();
    } else this.heading.focus();
  }

  hide(restore = true): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    closed(this.el, restore);
  }

  /** The list drawn again (a new notification while it is open). */
  paint(): void {
    const s = notifyStrings();
    const here = this.hooks.folder();
    this.storage.hidden = this.book.storageOk;
    this.clearButton.disabled = this.book.entries.length === 0;
    if (this.book.entries.length === 0) {
      const none = h("li", "notify-empty", s.empty);
      this.list.replaceChildren(none);
      return;
    }
    this.list.replaceChildren(...this.book.entries.map((e) => this.item(e, here)));
  }

  private item(e: Entry, here: string): HTMLElement {
    const s = notifyStrings();
    const li = h("li", "notify-item");
    li.dataset["id"] = e.id;
    li.dataset["level"] = e.level;
    li.dataset["kind"] = e.kind;
    li.tabIndex = -1;
    if (!e.read) li.classList.add("unread");
    const level = h("span", "notify-level");
    level.append(icon(LEVEL_ICON[e.level]), h("span", "", s.levels[e.level]));
    const title = h("p", "notify-item-title", e.title);
    const sentence = h("p", "notify-item-sentence", e.sentence);
    const meta = h("p", "notify-item-meta");
    const at = when(e.time);
    const time = h("time", "", at.text);
    time.dateTime = at.iso;
    meta.append(time, h("span", "", ` · ${s.kinds[e.kind]}`));
    if (e.folder && e.folder !== here && e.folderName) meta.append(h("span", "notify-item-folder", ` · ${s.folder(e.folderName)}`));
    li.append(level, title, sentence, meta);
    if (e.actions.length > 0) {
      const row = h("div", "notify-actions");
      for (const a of e.actions) {
        const b = h("button", "notify-action", a.label);
        b.type = "button";
        b.addEventListener("click", () => {
          this.hide(false);
          this.hooks.run(a);
        });
        row.append(b);
      }
      li.append(row);
    }
    return li;
  }
}
