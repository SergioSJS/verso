// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { importDemoVault } from "./demo";
import { el, h, ui } from "./dom";
import { icon } from "./icons";
import { keyOf, prettyKeys } from "./keys";
import { ribbon } from "./main";
import { page } from "./settings";
import { t } from "./strings";

/* ---------- Toggles ---------- */
export const toggleSideButton = el<HTMLButtonElement>("toggle-side");
export const toggleRightButton = el<HTMLButtonElement>("toggle-right");
export function paintToggles(): void {
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
  toggleSideButton.setAttribute("aria-expanded", String(sideShown()));
  toggleRightButton.setAttribute("aria-expanded", String(rightShown()));
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
  const importBtn = h("button", "lesson-import", t.importDemoVault);
  importBtn.type = "button";
  importBtn.prepend(icon("template"));
  importBtn.addEventListener("click", () => void importDemoVault());
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
