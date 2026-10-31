// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A roller without a note (ADR 0088 item 6, decided 2026-10-14): the
// palette's "Roll dice…" opens a small roller — a notation typed and
// rolled in this window, nothing written. Rolai's drawer is for later.

import { hasCapability } from "../capabilities";
import { asDialog, closed, opened } from "../dialogs/a11y";
import { h } from "../dom";
import { icon } from "../icons";
import { play3d, will3d } from "../dice3d";
import { howSaid, say } from "./card";
import { readNotation, rollHere } from "./notation";
import type { DiceRoll } from "../bindings";
import { isServerTable } from "../table/model";
import { recordRoll, tableSource } from "../table/record";
import { ds } from "./strings";

let shade: HTMLElement | null = null;

function build(): { shade: HTMLElement; input: HTMLInputElement } {
  const el = h("div", "quick dice-roller");
  el.hidden = true;
  const box = h("form", "quick-box dice-roller-box");
  const title = h("h2", "dice-roller-title", ds.title);
  title.id = "dice-roller-title";
  const input = h("input");
  input.type = "text";
  input.placeholder = ds.notation;
  input.setAttribute("aria-label", ds.notation);
  input.autocomplete = "off";
  input.spellcheck = false;
  const go = h("button", "save dice-roller-go", ds.go);
  go.type = "submit";
  go.prepend(icon("dice"));
  const row = h("div", "dice-roller-row");
  row.append(input, go);
  const out = h("div", "dice-roller-out");
  out.setAttribute("role", "status");
  out.setAttribute("aria-live", "polite");
  const hint = h("p", "dice-roller-hint", ds.nothingWritten);
  const close = h("button", "ghost iconic dice-roller-close");
  close.type = "button";
  close.setAttribute("aria-label", ds.close);
  close.append(icon("close"));
  box.append(title, close, row, out, hint);
  el.append(box);
  document.body.append(el);
  const hide = () => {
    el.hidden = true;
    closed(el);
  };
  asDialog(el, ds.title, hide, title.id);
  close.addEventListener("click", hide);
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) hide();
  });
  box.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });
  const submit = async () => {
    const typed = input.value.trim();
    const notation = readNotation(typed);
    out.replaceChildren();
    if (!notation) {
      out.classList.add("failed");
      out.textContent = ds.unread(typed);
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    out.classList.remove("failed");
    input.removeAttribute("aria-invalid");
    // With a server's table the server rolls it, once, for everyone at the
    // table; "Secreta" in the table's field makes it a roll to the owners.
    let roll: DiceRoll;
    const table = tableSource();
    if (isServerTable(table)) {
      const r = await table.roll(notation, { secret: table.secret });
      if ("error" in r || !r.entry.roll) {
        out.classList.add("failed");
        out.textContent = "error" in r ? r.error : ds.unread(typed);
        input.focus();
        return;
      }
      roll = r.entry.roll;
    } else roll = rollHere(notation);
    const how = howSaid(roll);
    const words = ds.said(null, notation, String(roll.total), how);
    // With the 3D switch on (ADR 0101) the result is said at once and shown
    // when the dice have rested; the live region below is silenced for that
    // one fill, so it is not said twice.
    const fall = will3d("", roll);
    if (fall) {
      say(words);
      out.setAttribute("aria-live", "off");
      await play3d("", roll);
    }
    recordRoll("", roll);
    out.append(h("strong", "dice-total", String(roll.total)), h("span", "dice-roller-said", words));
    if (fall) requestAnimationFrame(() => out.setAttribute("aria-live", "polite"));
  };
  return { shade: el, input };
}

/** Show the roller, its notation field focused; with a notation, rolled at
 *  once as if typed and submitted. */
function showRoller(notation?: string): void {
  const made = shade ? { shade, input: shade.querySelector("input") as HTMLInputElement } : build();
  shade = made.shade;
  opened(shade);
  shade.hidden = false;
  if (notation !== undefined) {
    made.input.value = notation;
    shade.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    made.input.focus();
    return;
  }
  made.input.focus();
  made.input.select();
}

/** Open the roller, its notation field focused. */
export function openRoller(): void {
  showRoller();
}

/** Open the roller with a pre-filled notation and roll immediately. */
export function openRollerWith(notation: string): void {
  showRoller(notation);
}

if (typeof window !== "undefined") {
  window.addEventListener("verso:roll-dice", (e: Event) => {
    const detail = (e as CustomEvent<{ notation?: string }>).detail;
    if (detail?.notation && hasCapability("diceRolling")) {
      openRollerWith(detail.notation);
    }
  });
}
