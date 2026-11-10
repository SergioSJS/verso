// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterRestore } from "./restoring";
import { commands } from "../bindings";
import { can } from "../can";
import { button, h, ui } from "../dom";
import { fail } from "../errors";
import { currentFolder, folderName, popout, secondary } from "../folder";
import { refreshFrame } from "../frame";
import { icon } from "../icons";
import { askDiscard, Leaf } from "../leaves/leaf";
import { NoteLeaf } from "../leaves/note";
import { noLayout } from "../main";
import { MenuItem, showMenu } from "../menu";
import { dirOf } from "../paths";
import type { LiveHolder } from "../roomWrites";
import { t } from "../strings";
import { markCurrent, showOutline } from "../tree/tree";
import { Layout } from "./layout";
import { Pane } from "./pane";

/** A leaf's folder path, a navigation named as such: every open tab has
 *  one, and a screen reader lists them by name. */
export function crumbsNav(): HTMLElement {
  const nav = h("nav", "crumbs");
  nav.setAttribute("aria-label", t.crumbs);
  return nav;
}
/** The folder path as links: the vault, then each folder, each opening
 *  its folder view. */
export function crumbsFor(path: string, includeSelf = false): HTMLElement[] {
  const parts = (includeSelf ? path : dirOf(path)).split("/").filter(Boolean);
  const out: HTMLElement[] = [];
  const root = h("button", "crumb", folderName || "/");
  root.type = "button";
  root.addEventListener("click", () => openFolder(""));
  out.push(root);
  parts.forEach((part, i) => {
    out.push(h("span", "crumb-sep", "/"));
    const b = h("button", "crumb", part);
    b.type = "button";
    const target = parts.slice(0, i + 1).join("/");
    b.addEventListener("click", () => openFolder(target));
    out.push(b);
  });
  return out;
}

/* ---------- Workspaces: the top bar, one layout each ---------- */
export let spaceIds = 0;
export class Space {
  readonly tab = h("button", "space-tab");
  readonly layout = new Layout();
  constructor(public label: string) {
    this.tab.type = "button";
    this.tab.setAttribute("role", "tab");
    this.tab.id = `verso-space-${++spaceIds}`;
    this.tab.setAttribute("aria-controls", "panes");
    const n = h("span", "space-name", label);
    // The pointer's close mark; the menu closes it from the keyboard.
    const close = h("span", "tab-close");
    close.setAttribute("aria-hidden", "true");
    close.append(icon("close"));
    this.tab.append(n, close);
    this.tab.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) void closeSpace(this);
      else showSpace(this);
    });
    this.tab.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) return;
      this.rename(n);
    });
    // Rename and close from the keyboard (F2, the menu key) and by right-click.
    this.tab.addEventListener("keydown", (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        this.rename(n);
      } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const r = this.tab.getBoundingClientRect();
        this.tab.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + 12, clientY: r.bottom, bubbles: true, cancelable: true }));
      }
    });
    this.tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        [t.rename, () => this.rename(n), "edit"],
        ...(!popout && can("windows") ? [[t.newWindowHere, () => void commands.newWindow(true).then((r) => r.status === "ok" || fail(r.error)), "maximize"] as MenuItem] : []),
        [t.closeSpace, () => closeSpace(this), "close"],
      ]);
    });
  }
  /** The name in place becomes a field; Enter, Escape or leaving it ends. */
  private rename(n: HTMLElement): void {
    if (!n.isConnected) return;
    const input = h("input", "space-input");
    input.setAttribute("aria-label", t.rename);
    input.value = this.label;
    n.replaceWith(input);
    input.focus();
    input.select();
    // Once, by a flag: Chromium (WebView2) fires blur inside replaceWith,
    // while the field is still connected, and that blur's commit would undo
    // an Escape (ADR 0069, item 8).
    let done = false;
    const finish = (commit: boolean, restore = false) => {
      if (done) return;
      done = true;
      if (commit) this.label = input.value.trim() || this.label;
      n.textContent = this.label;
      input.replaceWith(n);
      persistSoon();
      // From the keyboard, back on the workspace's tab.
      if (restore) this.tab.focus();
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") finish(true, true);
      else if (ev.key === "Escape") finish(false, true);
    });
    input.addEventListener("blur", () => finish(true));
  }
}
export const spaces: Space[] = [];
export let current: Space | null = null;
export function setCurrent(value: Space | null): void {
  current = value;
}
export const newSpaceButton = button("ghost iconic", t.newSpace, "plus");
export function layout(): Layout {
  return current?.layout ?? noLayout;
}
/** The pane something opens in: the focused one, else the first; the
 *  workspace is made here when there is none yet. */
export function paneToOpenIn(): Pane {
  const l = current?.layout ?? newSpace().layout;
  return l.focused ?? l.panes()[0] ?? l.reset();
}
/** The workspaces' tabs: a tablist of their own, with the "new workspace"
 *  button beside it rather than inside; the arrows, Home and End choose
 *  one, as in a pane's tab bar. */
export const spaceTabs = h("div", "space-tabs");
export function renderSpaces(): void {
  const had = document.activeElement;
  spaceTabs.replaceChildren(...spaces.map((s) => s.tab));
  ui.spaces.replaceChildren(spaceTabs, newSpaceButton);
  for (const s of spaces) {
    s.tab.setAttribute("aria-selected", String(s === current));
    s.tab.tabIndex = s === current ? 0 : -1;
  }
  ui.spaces.hidden = spaces.length <= 1;
  refreshFrame();
  // While there is a choice, the panes are the chosen workspace's panel.
  if (spaces.length > 1 && current) {
    ui.panes.setAttribute("role", "tabpanel");
    ui.panes.setAttribute("aria-labelledby", current.tab.id);
  } else {
    ui.panes.removeAttribute("role");
    ui.panes.removeAttribute("aria-labelledby");
  }
  // Put back in the bar, a control had lost the focus: it gets it back.
  if (had instanceof HTMLElement && had !== document.activeElement && ui.spaces.contains(had)) had.focus();
}
export function newSpace(label?: string): Space {
  const s = new Space(label ?? `${t.space} ${spaces.length + 1}`);
  spaces.push(s);
  showSpace(s);
  if (s.layout.paneCount() === 0) s.layout.reset();
  return s;
}
export function showSpace(s: Space): void {
  current = s;
  renderSpaces();
  s.layout.render();
  s.layout.focus(s.layout.focused ?? s.layout.panes()[0] ?? null);
  showOutline(s.layout.activeLeaf);
  markCurrent();
}
export async function closeSpace(s: Space): Promise<void> {
  // What can be saved is saved; what cannot goes only on a yes.
  let unsaved = false;
  for (const p of s.layout.panes()) for (const l of p.leaves) if (!(await l.flush())) unsaved = true;
  if (unsaved && !(await askDiscard())) return;
  const i = spaces.indexOf(s);
  if (i < 0) return;
  for (const p of s.layout.panes()) for (const l of p.leaves) l.destroy();
  spaces.splice(i, 1);
  if (spaces.length === 0) newSpace();
  else showSpace(spaces[Math.min(i, spaces.length - 1)]!);
  persistSoon();
}

export let persistTimer: number | undefined;
export function persistSoon(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      if (!currentFolder || popout || secondary) return;
      localStorage.setItem(
        `verso.spaces:${currentFolder}`,
        JSON.stringify({ current: current ? spaces.indexOf(current) : 0, spaces: spaces.map((s) => ({ label: s.label, layout: s.layout.serialize() })) }),
      );
    } catch {
      // No storage: nothing remembered.
    }
  }, 300);
}

/* ---------- Opening things ---------- */
export function openIn(pane: Pane, path: string): Leaf {
  return pane.open(path, false);
}
/** `preview`: a single click in a list (the tree, a folder, the search,
 *  the quick switcher) — a preview tab, when the setting has them. */
export function openNote(path: string, aside: boolean, fresh = false, preview = false): Leaf | null {
  // Asked for while the folder's tabs come back: opened over them after.
  if (afterRestore(() => void openNote(path, aside, fresh, preview))) return null;
  document.body.classList.remove("side-open");
  let pane = paneToOpenIn();
  if (aside) pane = layout().split(pane, "row");
  return pane.open(path, false, fresh, preview && !aside && !fresh);
}
export function openFolder(path: string, preview = false): void {
  if (afterRestore(() => openFolder(path, preview))) return;
  // The phone's drawer goes, as for a note (it covered the page it opened).
  document.body.classList.remove("side-open");
  const pane = paneToOpenIn();
  pane.openFolder(path, preview);
}

export function activeLeafForPath(path: string): NoteLeaf | null {
  for (const s of spaces) {
    for (const p of s.layout.panes()) {
      for (const l of p.leaves) {
        if (l instanceof NoteLeaf && l.path === path) return l;
      }
    }
  }
  return null;
}
/** The tab of this window that holds `path` live in its room and may
 *  type into it: a write to the note from elsewhere — a base's cell, a
 *  PDF's quote, the tree's sticker — goes in through it (roomWrites.ts,
 *  ADR 0082). A text file's tab too — a plan's rewrite, a folder page's
 *  base (ADR 0082 item 12). Null when no tab holds it live. */
export function liveHolder(path: string): LiveHolder | null {
  for (const l of leavesOf(path)) {
    const tab = l as unknown as { roomHolder?: () => LiveHolder | null };
    const held = l instanceof NoteLeaf ? l.roomHolder() : typeof tab.roomHolder === "function" ? tab.roomHolder() : null;
    if (held) return held;
  }
  return null;
}
export function leavesOf(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path)));
}
/** Leaves showing `path` or anything under it (a folder's contents). */
export function leavesUnder(path: string): Leaf[] {
  return spaces.flatMap((s) => s.layout.panes().flatMap((p) => p.leaves.filter((l) => l.path === path || l.path.startsWith(`${path}/`))));
}
