// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the person can do to the server's table (ADR 0107 items 5 and 6): the
// menu of one entry (pin, add to a note, delete), the table's menu (clear it),
// the question that clears it, and an image opened large. Every refusal of
// the server is said in the status line, in the person's words.

import { ui } from "../dom";
import { quick } from "../main";
import { danger, showMenu, type MenuItem } from "../menu";
import { addToNote, saidOf } from "./addToNote";
import type { ServerTable, TableEntry } from "./model";
import { tt } from "./strings";

/** Say a refusal, or `done` when there was none. */
function result(refusal: string | null, done: string): void {
  ui.status.textContent = refusal ?? done;
}

/** The menu of one entry, hanging from its button. */
export function entryMenu(anchor: HTMLElement, e: TableEntry, table: ServerTable | null): void {
  const items: MenuItem[] = [];
  if (table) items.push([e.pinned ? tt.unpin : tt.pin, () => void table.pin(e.id, !e.pinned).then((r) => result(r, e.pinned ? tt.unpinnedStatus : tt.pinnedStatus)), "pin"]);
  // A roll "to the owner" seen by others holds nothing to add.
  if (e.kind !== "secret") items.push([tt.addToNote, () => void addToNote(e, () => quick.pick()), "plus"]);
  if (table?.canDelete(e)) items.push(danger([tt.remove, () => void table.remove(e.id).then((r) => result(r, tt.removedStatus)), "trash"]));
  const box = anchor.getBoundingClientRect();
  showMenu(box.left, box.bottom, items, tt.entryActions(saidOf(e)));
}

/** The table's own menu: for now, clearing it (an owner's). */
export function panelMenu(anchor: HTMLElement, table: ServerTable): void {
  const items: MenuItem[] = [];
  if (table.canClear()) items.push([tt.clearTable, () => void clearTable(table), "trash"]);
  if (items.length === 0) return;
  const box = anchor.getBoundingClientRect();
  showMenu(box.left, box.bottom, items, tt.tableMenu);
}

async function clearTable(table: ServerTable): Promise<void> {
  const answer = await askClear();
  if (!answer) return;
  result(await table.clear(answer.keepPinned), tt.clearedStatus);
}

/** "Limpar a mesa": asks first, with "keep the pinned" ticked; null for every way out. */
export function askClear(): Promise<{ keepPinned: boolean } | null> {
  return new Promise((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shade = document.createElement("div");
    shade.className = "confirm table-clear";
    const box = document.createElement("div");
    box.className = "confirm-box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    const text = document.createElement("p");
    text.id = "table-clear-text";
    text.textContent = tt.clearAsk;
    box.setAttribute("aria-labelledby", text.id);
    const keep = document.createElement("label");
    keep.className = "table-clear-keep";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    keep.append(check, document.createTextNode(` ${tt.clearKeep}`));
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "ghost";
    no.textContent = tt.cancel;
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "save";
    yes.textContent = tt.clearYes;
    actions.append(no, yes);
    box.append(text, keep, actions);
    shade.append(box);
    let done = false;
    const finish = (answer: { keepPinned: boolean } | null): void => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      shade.remove();
      if (back?.isConnected) back.focus();
      resolve(answer);
    };
    const order = [no, check, yes];
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const i = order.indexOf(document.activeElement as HTMLButtonElement);
        order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
      }
    };
    yes.addEventListener("click", () => finish({ keepPinned: check.checked }));
    no.addEventListener("click", () => finish(null));
    shade.addEventListener("mousedown", (e) => {
      if (e.target === shade) finish(null);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.append(shade);
    no.focus();
  });
}

/** An image of the table, large; Escape, the button or a click outside closes it. */
export function openImage(src: string, alt: string): void {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shade = document.createElement("div");
  shade.className = "table-lightbox";
  shade.setAttribute("role", "dialog");
  shade.setAttribute("aria-modal", "true");
  shade.setAttribute("aria-label", alt);
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ghost table-lightbox-close";
  close.textContent = tt.imageClose;
  shade.append(img, close);
  const finish = (): void => {
    document.removeEventListener("keydown", onKey, true);
    shade.remove();
    if (back?.isConnected) back.focus();
  };
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    } else if (e.key === "Tab") {
      e.preventDefault();
      close.focus();
    }
  };
  close.addEventListener("click", finish);
  shade.addEventListener("mousedown", (e) => {
    if (e.target === shade) finish();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(shade);
  close.focus();
}
