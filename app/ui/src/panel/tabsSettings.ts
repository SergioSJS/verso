// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings › Appearance › Right panel tabs: every tab of the right panel
// with a switch (shown or hidden) and up/down, the sure way back for a tab
// hidden from the bar (ADR 0072's amendment of 2026-11-01). The rows are
// drawn again in place, and the button that was pressed keeps the focus.

import { h } from "../dom";
import { icon } from "../icons";
import { tabWords as w } from "./tabStrings";
import { TABS_CHANGED, type TabStrip } from "./tabStrip";

export function tabsSettings(strip: TabStrip): HTMLElement {
  const list = h("div", "tabs-settings");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", w.tabsList);

  const step = (id: string, by: -1 | 1, label: string, disabled: boolean): HTMLButtonElement => {
    const b = h("button", "btn ls-step tabs-settings-step");
    b.type = "button";
    b.dataset["move"] = `${id}:${by}`;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(icon(by < 0 ? "chevronUp" : "chevronDown"));
    b.disabled = disabled;
    b.addEventListener("click", () => {
      strip.moveEntry(id, by);
      // Drawn by the change event; the pressed button, or its twin when it
      // reached the end, keeps the focus.
      const again = list.querySelector<HTMLButtonElement>(`[data-move="${id}:${by}"]:not(:disabled)`) ?? list.querySelector<HTMLButtonElement>(`[data-move="${id}:${-by}"]:not(:disabled)`);
      again?.focus();
    });
    return b;
  };

  // What the rows were drawn from: the panel says "visibility" on every
  // refresh, and a row drawn again under a press would lose its click.
  let drawn = "";
  const paint = (): void => {
    const entries = strip.entries();
    drawn = JSON.stringify(entries);
    const rows = entries.map((e) => {
      const row = h("div", "tabs-settings-row");
      row.dataset["tab"] = e.id;
      const name = h("span", "tabs-settings-name");
      name.append(icon(e.icon), h("span", "", e.label));
      const sw = h("label", "switch");
      const box = h("input");
      box.type = "checkbox";
      box.checked = e.shown;
      box.disabled = e.shown && !e.canHide;
      box.setAttribute("aria-label", w.rowShown(e.label));
      box.addEventListener("change", () => {
        strip.setShown(e.id, box.checked);
        // The last tab refuses: the switch says so again.
        box.checked = strip.entries().find((x) => x.id === e.id)?.shown ?? box.checked;
      });
      sw.append(box, h("span", "switch-track"));
      const moves = h("span", "tabs-settings-moves");
      moves.append(step(e.id, -1, w.up(e.label), e.first), step(e.id, 1, w.down(e.label), e.last));
      row.append(name, moves, sw);
      return row;
    });
    const reset = h("button", "btn ghost tabs-settings-reset", w.reset);
    reset.type = "button";
    reset.addEventListener("click", () => strip.reset());
    list.replaceChildren(...rows, reset);
  };

  const redraw = (): void => {
    if (!list.isConnected) {
      removeEventListener(TABS_CHANGED, redraw);
      removeEventListener("verso:table-visibility", redraw);
      return;
    }
    if (JSON.stringify(strip.entries()) === drawn) return;
    const had = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
    const move = had?.dataset["move"] ?? null;
    const switchOf = had instanceof HTMLInputElement ? (had.closest<HTMLElement>(".tabs-settings-row")?.dataset["tab"] ?? null) : null;
    paint();
    if (move) {
      const same = list.querySelector<HTMLButtonElement>(`[data-move="${move}"]:not(:disabled)`);
      if (same) same.focus();
    } else if (switchOf) {
      list.querySelector<HTMLInputElement>(`.tabs-settings-row[data-tab="${switchOf}"] input`)?.focus();
    }
  };
  addEventListener(TABS_CHANGED, redraw);
  addEventListener("verso:table-visibility", redraw);
  paint();
  return list;
}
