// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { importDemoVault } from "./demo";
import { el, h, ui } from "./dom";
import { refreshFrame } from "./frame";
import { icon } from "./icons";
import { keyOf, prettyKeys, withKeys } from "./keys";
import { ribbon } from "./main";
import { openFolderDialog } from "./open";
import { page } from "./settings";
import { t } from "./strings";
import { mayOfferExample } from "./web/landing";

/* ---------- Toggles ---------- */
export const toggleSideButton = el<HTMLButtonElement>("toggle-side");
export const toggleRightButton = el<HTMLButtonElement>("toggle-right");
export function paintToggles(): void {
  refreshFrame();
  ribbon?.paint();
  toggleSideButton.classList.toggle("off", document.body.classList.contains("no-side"));
  toggleRightButton.classList.toggle("off", document.body.classList.contains("no-right"));
  paintExpanded();
}
/** The sidebar, and the right panel, on screen: a drawer open in a
 *  narrow window, else not hidden. */
export function sideShown(): boolean {
  return narrow.matches ? document.body.classList.contains("side-open") : !document.body.classList.contains("no-side");
}
export function rightShown(): boolean {
  return narrow.matches ? document.body.classList.contains("right-open") : !document.body.classList.contains("no-right");
}
/** Shown or hidden is the toggles' state, said as well as drawn. Set in
 *  place: a drawer that closes on a press elsewhere must not redraw the
 *  ribbon under the pointer, whose click would be lost. */
export function paintExpanded(): void {
  refreshFrame();
  // The table's unread count follows whether the right panel is on screen (ADR 0107 item 13).
  dispatchEvent(new Event("verso:table-visibility"));
  toggleSideButton.setAttribute("aria-expanded", String(sideShown()));
  const shown = rightShown();
  // Named for what a press does now, with its keys: "Mostrar painel da
  // direita (⌘⌥→)". The same name on every control that toggles it.
  const verbLabel = shown ? t.hideRight : t.showRight;
  for (const b of [toggleRightButton, ...document.querySelectorAll<HTMLElement>(".bar-right")]) {
    b.setAttribute("aria-expanded", String(shown));
    b.dataset["label"] = verbLabel;
    b.title = withKeys(verbLabel, keyOf("toggle-right"));
    b.setAttribute("aria-label", verbLabel);
  }
  ui.ribbon.querySelector('[data-id="files"]')?.setAttribute("aria-expanded", String(sideShown()));
  ui.ribbon.querySelector('[data-id="right"]')?.setAttribute("aria-expanded", String(rightShown()));
}
export const narrow = window.matchMedia("(max-width: 760px)");
export function toggleSide(): void {
  if (narrow.matches) {
    document.body.classList.toggle("side-open");
    document.body.classList.remove("right-open");
    paintExpanded();
    return;
  }
  document.body.classList.toggle("no-side");
  paintToggles();
}
export function toggleRight(): void {
  if (narrow.matches) {
    document.body.classList.toggle("right-open");
    document.body.classList.remove("side-open");
    paintExpanded();
    return;
  }
  document.body.classList.toggle("no-right");
  try { localStorage.setItem("verso.right", String(!document.body.classList.contains("no-right"))); } catch { /* no storage */ }
  paintToggles();
}
export const rightDivider = el<HTMLDivElement>("right-divider");

/* ---------- Folder ---------- */
export function lesson(): void {
  page?.classList.add("empty");
  const box = h("div", "lesson");
  // A read link's window has one folder, its link's (ADR 0105): until it
  // opens — the connection can come late, a quick link a minute old in
  // WebKit (the re-test of 2026-11-04) — it says the folder is opening,
  // as the status bar does for any folder, never the start page's choice
  // of a folder.
  if (document.documentElement.dataset["visitor"] === "link") {
    const opening = h("p", "lesson-opening", t.openingFolder);
    opening.setAttribute("role", "status");
    box.append(opening);
    ui.panes.replaceChildren(box);
    return;
  }
  const importBtn = h("button", "lesson-import", t.importDemoVault);
  importBtn.type = "button";
  importBtn.prepend(icon("template"));
  importBtn.addEventListener("click", () => void importDemoVault());
  // In a browser the folders are the server's: the page says where they
  // are chosen, and offers the choice; the desktop's keys and its folders
  // of this computer mean nothing there. The example still imports — into
  // a server folder the person may write to, chosen first — offered only
  // to someone who may make a folder or write in one: a player who reads
  // is offered nothing to create (ADR 0074 item 6, amended 2026-11-06).
  if (document.documentElement.dataset["host"] === "server") {
    const choose = h("button", "lesson-import", t.lessonServerOpen);
    choose.type = "button";
    choose.prepend(icon("folder"));
    choose.addEventListener("click", () => void openFolderDialog());
    importBtn.classList.add("lesson-secondary");
    const actions = h("div", "lesson-actions");
    actions.append(choose);
    void commands.serverFolders(location.origin).then((r) => {
      if (r.status === "ok" && mayOfferExample(r.data) && box.isConnected) actions.append(importBtn);
    });
    box.append(h("h1", "", t.lessonServerTitle), h("p", "", t.lessonServerBody), actions);
    ui.panes.replaceChildren(box);
    return;
  }
  box.append(
    h("h1", "", t.lessonTitle),
    h("p", "", t.lessonBody),
    h("p", "keys", t.lessonKeys.replace(/\{([\w-]+)\}/g, (_, id: string) => prettyKeys(keyOf(id)))),
    importBtn,
  );
  ui.panes.replaceChildren(box);
}

export const sideDivider = el<HTMLDivElement>("side-divider");
/** A divider moved from the keyboard: focusable, the arrow keys change the
 *  width `prop` by 16 px within its bounds. */
/** A bar's divider dragged by the pointer: `width(x)` turns the pointer's x into
 *  the bar's width, shown while it moves and handed to `done` when it ends.
 *  While it runs no text is selected under the pointer (a press on the divider
 *  would begin a selection through the log or the page, and the web view then
 *  takes the pointer from the drag: the bar stopped following it on the Table's
 *  tab), and the drag ends however the pointer goes — released, taken back by
 *  the system, or lost — so no listener stays behind to follow a hovering
 *  pointer. */
export function dragResize(d: HTMLElement, prop: string, width: (x: number) => number, done: (w: number) => void): void {
  d.addEventListener("mousedown", (e) => e.preventDefault());
  d.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    d.setPointerCapture(down.pointerId);
    document.body.classList.add("resizing");
    getSelection()?.removeAllRanges();
    let last = width(down.clientX);
    const move = (ev: PointerEvent): void => {
      last = width(ev.clientX);
      document.body.style.setProperty(prop, `${last}px`);
    };
    const end = (): void => {
      d.removeEventListener("pointermove", move);
      d.removeEventListener("pointerup", end);
      d.removeEventListener("pointercancel", end);
      d.removeEventListener("lostpointercapture", end);
      document.body.classList.remove("resizing");
      done(last);
    };
    d.addEventListener("pointermove", move);
    d.addEventListener("pointerup", end);
    d.addEventListener("pointercancel", end);
    d.addEventListener("lostpointercapture", end);
  });
}

export function arrowResize(d: HTMLElement, prop: string, current: () => number, sign: 1 | -1, done?: (w: number) => void): void {
  d.tabIndex = 0;
  d.setAttribute("aria-label", t.resizeKeys);
  d.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const w = Math.min(Math.max(current() + (e.key === "ArrowRight" ? 16 : -16) * sign, 180), window.innerWidth * 0.5);
    document.body.style.setProperty(prop, `${w}px`);
    d.setAttribute("aria-valuenow", String(Math.round(w)));
    done?.(w);
  });
}
