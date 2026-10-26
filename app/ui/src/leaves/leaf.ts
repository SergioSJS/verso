// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type ContractError, type NoteText } from "../bindings";
import { folderAccessNow, host } from "../can";
import { ask } from "../dialog";
import { button, h, ui } from "../dom";
import { errorSentence } from "../errors";
import { allEntries, iconOfPath } from "../folder";
import { icon } from "../icons";
import { renderSticker } from "../labels";
import type { Pane } from "../layout/pane";
// Every kind of tab extends Leaf, each in its own module, and the layout
// reaches them all: what Leaf uses of the layout comes through
// main.ts, the entry, which is already loading when this module is, so
// that loading Leaf never loads a subclass before it (ADR 0067).
import { armDrag, landIn, persistSoon } from "../main";
import { quietPaths } from "../opening";
import { Kind, name } from "../paths";
import { settings } from "../settings";
import { t } from "../strings";

/** Unsaved text goes only on an explicit yes. */
export function askDiscard(): Promise<boolean> {
  return ask(t.discard, { yes: t.discardYes, no: t.cancel });
}

/* ---------- Leaves ---------- */
/** Numbers the ids a tab and its panel name each other by. */
export let leafIds = 0;
export abstract class Leaf {
  readonly el = h("section", "leaf");
  readonly tab = h("button", "tab");
  readonly tabIcon = h("span", "tab-icon");
  readonly tabName = h("span", "tab-name");
  /** Said, not shown: the dot after the name shows it. */
  readonly tabUnsaved = h("span", "sr-only", `, ${t.unsaved}`);
  /** Said, not shown: the name crossed out shows it (a note deleted or
   *  moved outside the app, `markGone`). */
  readonly tabGone = h("span", "sr-only", `, ${t.goneTab}`);
  /** Said, not shown: the name in italics shows it. */
  readonly tabPreview = h("span", "sr-only", `, ${t.previewTab}`);
  abstract readonly kind: Kind;
  path = "";
  dirty = false;
  pinned = false;
  /** A preview tab (settings.previewTabs): what a single click opened. The
   *  next single click in its pane opens in its place; a double click, an
   *  edit or a pin keeps it. */
  transient = false;
  loading: Promise<void> = Promise.resolve();

  constructor(public pane: Pane) {
    this.tab.type = "button";
    // A tab of its pane's tablist, and the panel it shows. Only the
    // chosen tab is in the Tab order (Pane.activate); the arrows reach
    // the others (Pane.tabKeys).
    const n = ++leafIds;
    this.tab.id = `verso-tab-${n}`;
    this.el.id = `verso-panel-${n}`;
    this.tab.setAttribute("role", "tab");
    this.tab.setAttribute("aria-controls", this.el.id);
    this.tab.tabIndex = -1;
    this.el.setAttribute("role", "tabpanel");
    this.el.setAttribute("aria-labelledby", this.tab.id);
    // The close and pin marks are the pointer's (the tab's menu and ⌘W
    // close it from the keyboard): kept out of the tab's name.
    const close = h("span", "tab-close");
    close.setAttribute("aria-hidden", "true");
    close.append(icon("close"));
    const pin = h("span", "tab-pin");
    pin.setAttribute("aria-hidden", "true");
    pin.append(icon("pin"));
    this.tabUnsaved.hidden = true;
    this.tabGone.hidden = true;
    this.tabPreview.hidden = true;
    this.tab.append(this.tabIcon, this.tabName, this.tabUnsaved, this.tabGone, this.tabPreview, pin, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void this.close();
      else this.pane.activate(this, true);
    });
    this.tab.addEventListener("auxclick", (e) => {
      if (e.button === 1) void this.close();
    });
    this.tab.addEventListener("dblclick", () => this.keep());
    this.tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.pane.tabMenu(this, e.clientX, e.clientY);
    });
    // The tab's menu (close, pin, split, open in a window…) from the keyboard.
    this.tab.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = this.tab.getBoundingClientRect();
      this.pane.tabMenu(this, r.left + 12, r.bottom);
    });
    armDrag(this.tab, () => ({ kind: "tab", leaf: this }), () => this.tabName.textContent ?? "");
    this.el.addEventListener("focusin", () => this.pane.activate(this, false));
  }

  setTitle(title: string): void {
    this.tabName.textContent = title;
    // A pinned tab shows its icon alone: the tip names it.
    this.tab.title = this.path && this.path !== title ? `${title}\n${this.path}` : title;
    const label = allEntries.get(this.path)?.label;
    const stickerNode = settings.stickers && label?.sticker ? renderSticker(label.sticker, 14) : null;
    this.tabIcon.replaceChildren(stickerNode ?? (this.kind === "graph" ? icon("graph") : iconOfPath(this.path, this.kind)));
  }
  setDirty(d: boolean): void {
    if (d) this.keep();
    this.dirty = d;
    this.tab.classList.toggle("dirty", d);
    this.tabUnsaved.hidden = !d;
  }
  /** The file is gone from disk, deleted or moved outside the app: the
   *  name is crossed out and says so. */
  setGone(g: boolean): void {
    this.tabGone.textContent = `, ${host() === "server" ? t.goneTabElsewhere : t.goneTab}`;
    this.tab.classList.toggle("gone", g);
    this.tabGone.hidden = !g;
  }
  abstract load(path: string, force?: boolean): Promise<void>;
  /** The file moved (renamed in the app): follow it to `path`. */
  moved(path: string): void {
    void this.load(path, true);
  }
  headings(): NoteText["headings"] {
    return [];
  }
  focusContent(): void {}
  destroy(): void {}
  /** Save what can be saved; true when the leaf may go. */
  async flush(): Promise<boolean> {
    return !this.dirty;
  }
  async close(force = false): Promise<void> {
    if (this.pinned && !force) {
      ui.status.textContent = t.pinnedTab;
      return;
    }
    if (!(await this.flush()) && !(await askDiscard())) return;
    // The keyboard was on this tab, or in it: it lands on the tab that
    // takes its place, not on the page.
    const had = this.tab === document.activeElement || this.el.contains(document.activeElement);
    const pane = this.pane;
    this.destroy();
    pane.remove(this);
    if (had) landIn(pane);
  }
  setPreview(p: boolean): void {
    this.transient = p;
    this.tab.classList.toggle("preview", p);
    this.tabPreview.hidden = !p;
  }
  /** A preview tab becomes a tab of its own. */
  keep(): void {
    if (!this.transient) return;
    this.setPreview(false);
    persistSoon();
  }
  /** The file stopped being shared with this person (`unshare`). */
  unshared = false;
  /** Access to this tab's file was withdrawn, live (ADR 0113): nothing of
   *  the file stays — the content is torn down, the tab loses its name and
   *  its path, and the page says in neutral words that it is no longer
   *  shared. No reload, no way to read what was there. */
  unshare(): void {
    if (this.unshared) return;
    this.unshared = true;
    this.setDirty(false);
    this.clearFailure();
    this.destroy();
    this.path = "";
    this.tabName.textContent = t.unsharedTab;
    this.tab.title = t.unsharedTab;
    this.tabIcon.replaceChildren(icon("lock"));
    this.setGone(false);
    this.el.classList.remove("failed");
    this.el.classList.add("unshared");
    const box = h("div", "load-failure unshared-box");
    box.setAttribute("role", "status");
    const close = button("ghost", t.close);
    close.addEventListener("click", () => void this.close(true));
    box.append(h("p", "load-failure-title", t.unsharedTitle), h("p", "", t.unsharedBody), close);
    this.el.replaceChildren(box);
  }
  /** A player at a table whose read of a file failed because it is gone or
   *  refused: the file may be one the game master just stopped sharing, so
   *  its name must not be said (the unshared state is the neutral answer;
   *  the live `unshare` and this read may arrive in either order). */
  protected veiled(error: ContractError): boolean {
    const access = folderAccessNow();
    return Boolean(access?.table) && access?.seat !== "master" && (error.kind === "not_found" || error.kind === "refused");
  }
  /** This tab's file is veiled by a failed read: neutral at once, and the
   *  window lets go of the name (recents, switcher, outline: unshared.ts). */
  protected veil(path: string): void {
    this.unshare();
    dispatchEvent(new CustomEvent("verso:veiled", { detail: path }));
  }
  /** Why the last read of this tab's file failed, or null. */
  failed: ContractError["kind"] | null = null;
  /** A tab brought back behind another, whose file waits to be shown
   *  before it is read (pictures and PDFs, which the file protocol would
   *  download). */
  deferred = false;
  /** Whether this tab is being brought back behind another of its pane:
   *  its reads do not download. Asked after the restore has placed every
   *  tab. */
  protected quiet(path: string): boolean {
    return quietPaths.has(path) && this.pane.active !== this;
  }
  private failure: HTMLElement | null = null;
  /** A read that failed is said in the page, with a way to try again; the
   *  tab shows no editor, so nothing can be typed into it and lost (review
   *  `board.md`, reading 3, finding 4). */
  protected showFailure(path: string, error: ContractError, retry: () => void): void {
    if (this.veiled(error)) return this.veil(path);
    this.failure?.remove();
    const box = h("div", "load-failure");
    box.setAttribute("role", "alert");
    box.append(h("p", "load-failure-title", t.loadFailed.replace("{name}", name(path))), h("p", "", failureSentence(error)));
    const again = button("ghost", t.tryAgain);
    again.addEventListener("click", retry);
    box.append(again);
    this.failure = box;
    this.failed = error.kind;
    this.el.classList.add("failed");
    this.el.append(box);
  }
  /** The status line's words for a failed open: the box's own. */
  protected failureLine(path: string, error: ContractError): string {
    return `${t.loadFailed.replace("{name}", name(path))} ${failureSentence(error)}`;
  }
  protected clearFailure(): void {
    this.failure?.remove();
    this.failure = null;
    this.failed = null;
    this.el.classList.remove("failed");
  }
  setPinned(p: boolean): void {
    if (p) this.keep();
    this.pinned = p;
    this.tab.classList.toggle("pinned", p);
    persistSoon();
  }
  moveTo(pane: Pane, index?: number): void {
    if (pane === this.pane && index === undefined) return;
    this.pane.remove(this, true);
    this.pane = pane;
    pane.insert(this, index);
    pane.activate(this, false);
  }
  jumpTo(_line: number): void {}
}

/** Why a file did not open, in words. One no longer in the folder says
 *  so — deleted or moved, on a server possibly on another device that
 *  syncs it (ADR 0079) — never with the system's text of the failed read,
 *  which the log keeps. */
function failureSentence(error: ContractError): string {
  if (error.kind === "not_found") return host() === "server" ? t.loadGoneElsewhere : t.loadGone;
  return errorSentence(error);
}
