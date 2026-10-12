// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { icon } from "./icons";

/* ---------- Small helpers ---------- */
export function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function button(cls: string, label: string, ic?: string): HTMLButtonElement {
  const b = h("button", cls);
  b.type = "button";
  b.title = label;
  if (ic) b.append(icon(ic, label));
  else b.textContent = label;
  return b;
}

export const ui = {
  open: el<HTMLButtonElement>("open"),
  folder: el<HTMLSpanElement>("folder"),
  collapse: el<HTMLButtonElement>("collapse"),
  ribbon: el<HTMLElement>("ribbon"),
  search: el<HTMLInputElement>("search"),
  searchLabel: el<HTMLSpanElement>("search-label"),
  searchClear: el<HTMLButtonElement>("search-clear"),
  status: el<HTMLSpanElement>("status"),
  reportBug: el<HTMLButtonElement>("report-bug"),
  words: el<HTMLSpanElement>("words"),
  notesHeading: el<HTMLHeadingElement>("notes-heading"),
  notes: el<HTMLUListElement>("notes"),
  treeRoot: el<HTMLElement>("tree-root"),
  spaces: el<HTMLDivElement>("spaces"),
  panes: el<HTMLDivElement>("panes"),
  topProgress: el<HTMLDivElement>("top-progress"),
  topProgressFill: el<HTMLDivElement>("top-progress-fill"),
  indexProgress: el<HTMLDivElement>("index-progress"),
  indexProgressBar: el<HTMLDivElement>("index-progress-bar"),
  indexProgressLabel: el<HTMLSpanElement>("index-progress-label"),
};

export function showToast(message: string, durationMs = 3500): void {
  const existing = document.querySelector(".verso-toast");
  if (existing) existing.remove();
  const toast = h("div", "verso-update-banner verso-toast");
  // Said to a screen reader as it appears (ADR 0035).
  toast.setAttribute("role", "status");
  toast.append(icon("sparkles"));
  const span = h("span", "", message);
  toast.append(span);
  document.body.append(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
