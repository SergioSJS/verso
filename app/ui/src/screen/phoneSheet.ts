// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* ---------- The top bar's sheet on a phone (2026-11-14) ----------
 * What the one top bar (phoneHead.ts) folds away, a tap from it: the open
 * tabs, each with its close; the note's folder, each folder a link; the
 * three modes by name (and "view as a reader" when the note offers it);
 * the bottom bar's verbs; and whether that bar stays shown. It drops from
 * under the top bar over a veil; the veil, Escape, Android's Back and any
 * action close it. */

import { closed, isTop, opened } from "../dialogs/a11y";
import { h } from "../dom";
import { folderName } from "../folder";
import { icon } from "../icons";
import type { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav } from "../layout/spaces";
import { type Mode, NoteLeaf } from "../leaves/note";
import { dirOf } from "../paths";
import { saveSettings, settings } from "../settings";
import { t } from "../strings";
import { st } from "./strings";
import { barVerbs } from "./verbs";

/** A path's folders, the open folder first: "RPG / Campanhas". */
export function folderLine(path: string): string {
  if (path === "") return "";
  return [folderName || "/", ...dirOf(path).split("/").filter(Boolean)].join(" / ");
}

let open: { veil: HTMLElement; sheet: HTMLElement } | null = null;

/** The bottom bar shown or not, kept for the next start. */
export function setBottomBar(on: boolean): void {
  settings.phoneBottomBar = on;
  document.documentElement.classList.toggle("phone-bar-on", on);
  saveSettings();
}

export function closeSheet(restore = true): void {
  if (!open) return;
  const { veil, sheet } = open;
  open = null;
  veil.remove();
  sheet.remove();
  closed(sheet, restore);
}

function heading(text: string): HTMLElement {
  return h("h2", "phone-sheet-heading", text);
}

/** A row per open tab: the tab to the front, and its close. */
function tabRows(pane: Pane): HTMLElement {
  const list = h("ul", "phone-sheet-tabs");
  for (const leaf of pane.leaves) {
    const li = h("li", "phone-sheet-tab");
    const go = h("button", "phone-sheet-tab-go");
    go.type = "button";
    const name = leaf.tabName.textContent ?? "";
    go.append(h("span", "phone-sheet-tab-name", `${name}${leaf.dirty ? " •" : ""}`));
    const where = folderLine(leaf.path);
    if (where) go.append(h("span", "phone-sheet-tab-path", where));
    if (leaf === pane.active) go.setAttribute("aria-current", "page");
    go.addEventListener("click", () => {
      closeSheet(false);
      pane.activate(leaf, true);
    });
    const close = h("button", "phone-sheet-tab-close");
    close.type = "button";
    close.setAttribute("aria-label", st.closeTab(name));
    close.title = st.closeTab(name);
    close.append(icon("close"));
    close.addEventListener("click", () => {
      void leaf.close().then(() => {
        // The sheet follows: the tab gone, or kept by an unsaved answer.
        if (open) list.replaceWith(tabRows(pane));
        if (pane.leaves.length === 0) closeSheet();
      });
    });
    li.append(go, close);
    list.append(li);
  }
  return list;
}

/** The note's three modes by name, through its own buttons. */
function modeRow(note: NoteLeaf): HTMLElement {
  const row = h("div", "phone-sheet-modes");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", st.sheetMode);
  const names: [Mode, string, string][] = [["preview", "reading", t.reading], ["live", "edit", t.edit], ["source", "source", t.source]];
  for (const [mode, mark, label] of names) {
    const b = h("button", "phone-sheet-mode");
    b.type = "button";
    b.append(icon(mark), h("span", "", label));
    b.setAttribute("aria-pressed", String(note.mode === mode));
    b.addEventListener("click", () => {
      closeSheet(false);
      note.modeButtons[mode].click();
    });
    row.append(b);
  }
  // "View as a reader" (ADR 0087), where the note shows it.
  const reader = note.readerView.button;
  if (!reader.hidden && reader.getClientRects().length > 0) {
    const b = h("button", "phone-sheet-mode");
    b.type = "button";
    const label = reader.getAttribute("aria-label") ?? reader.title;
    b.append(icon("eye"), h("span", "", label));
    b.setAttribute("aria-pressed", reader.getAttribute("aria-pressed") ?? "false");
    b.addEventListener("click", () => {
      closeSheet(false);
      reader.click();
    });
    row.append(b);
  }
  return row;
}

/** The bottom bar's verbs, as that bar draws them now (a file without its
 *  folder has fewer; one that cannot act is off). */
function verbGrid(): HTMLElement {
  const grid = h("div", "phone-sheet-verbs");
  for (const v of barVerbs) {
    if (getComputedStyle(v).display === "none") continue;
    const b = h("button", "phone-sheet-verb");
    b.type = "button";
    const label = v.querySelector(".bottom-bar-label")?.textContent ?? "";
    const mark = v.querySelector(".icon")?.cloneNode(true);
    if (mark) b.append(mark);
    b.append(h("span", "", label));
    b.disabled = v.disabled;
    b.addEventListener("click", () => {
      closeSheet(false);
      v.click();
    });
    grid.append(b);
  }
  return grid;
}

function barSwitch(): HTMLElement {
  const label = h("label", "phone-sheet-switch");
  const box = h("input");
  box.type = "checkbox";
  box.setAttribute("role", "switch");
  box.checked = settings.phoneBottomBar;
  box.addEventListener("change", () => setBottomBar(box.checked));
  label.append(h("span", "", st.barAlways), box);
  return label;
}

/** The sheet of `pane`, under its top bar; a second tap closes it. */
export function openSheet(pane: Pane, from: HTMLElement): void {
  if (open) return closeSheet();
  const veil = h("div", "phone-sheet-veil");
  const sheet = h("section", "phone-sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", st.sheet);
  sheet.style.top = `${Math.round(pane.tabs.getBoundingClientRect().bottom)}px`;
  veil.style.top = sheet.style.top;
  if (pane.leaves.length > 0) sheet.append(heading(st.sheetTabs), tabRows(pane));
  const leaf = pane.active;
  if (leaf?.path) {
    const nav = crumbsNav();
    nav.classList.add("phone-sheet-crumbs");
    nav.append(...crumbsFor(leaf.path));
    // A folder opened from here: the sheet has done its work.
    nav.addEventListener("click", (e) => (e.target as HTMLElement).closest(".crumb") && closeSheet(false));
    sheet.append(nav);
  }
  if (leaf instanceof NoteLeaf) sheet.append(heading(st.sheetMode), modeRow(leaf));
  sheet.append(heading(st.sheetVerbs), verbGrid(), barSwitch());
  veil.addEventListener("click", () => closeSheet());
  sheet.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isTop(sheet)) return;
    e.preventDefault();
    e.stopPropagation();
    closeSheet();
  });
  document.body.append(veil, sheet);
  open = { veil, sheet };
  from.setAttribute("aria-expanded", "true");
  const unmark = new MutationObserver(() => {
    if (sheet.isConnected) return;
    from.setAttribute("aria-expanded", "false");
    unmark.disconnect();
  });
  unmark.observe(document.body, { childList: true });
  opened(sheet);
  sheet.querySelector<HTMLElement>('[aria-current="page"], button')?.focus({ preventScroll: true });
}
