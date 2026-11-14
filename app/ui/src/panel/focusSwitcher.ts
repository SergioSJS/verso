// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type Focus } from "../bindings";
import { asCombobox, asDialog, closed, opened } from "../dialogs/a11y";
import { h } from "../dom";
import { activeFocusItem, getDisplayFocuses, isHomeActive, isHomeFocusName, selectFocus } from "../focuses";
import { icon } from "../icons";
import { renderSticker } from "../labels";
import { t } from "../strings";
import { focusOnOpen } from "../screen/openFocus";

export class FocusSwitcher {
  readonly el = h("div", "quick palette focus-switcher");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: Focus[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.switchFocus;
    this.input.setAttribute("aria-label", t.switchFocus);
    asCombobox(this.input, this.list, "focus-switcher-list");
    asDialog(this.el, t.switchFocus, () => this.hide());
    this.box.append(this.input, this.list);
    this.el.append(this.box);
    document.body.append(this.el);
    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.sel = Math.min(this.sel + 1, this.items.length - 1);
        this.paint();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.sel = Math.max(this.sel - 1, 0);
        this.paint();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = this.items[this.sel];
        if (chosen) {
          this.hide();
          void selectFocus(chosen.name);
        }
      }
    });
    this.el.addEventListener("mousedown", (e) => {
      if (e.target === this.el) this.hide();
    });
  }
  show(): void {
    opened(this.el);
    this.el.hidden = false;
    this.input.value = "";
    this.update();
    focusOnOpen(this.input);
  }
  hide(): void {
    this.el.hidden = true;
    closed(this.el);
  }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    const all = getDisplayFocuses();
    this.items = all.filter((f) => q === "" || f.name.toLowerCase().includes(q) || (isHomeFocusName(f.name) && t.homeFocus.toLowerCase().includes(q)));
    this.sel = Math.max(0, Math.min(this.sel, this.items.length - 1));
    this.paint();
  }
  private paint(): void {
    this.list.replaceChildren(
      ...this.items.map((focus, i) => {
        const isHome = isHomeFocusName(focus.name);
        const isActive = isHome ? isHomeActive() : (activeFocusItem === focus);
        const li = h("li");
        const b = h("button");
        b.type = "button";
        b.id = `focus-opt-${i}`;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(i === this.sel));
        if (i === this.sel) b.classList.add("sel");
        if (focus.sticker) {
          b.append(renderSticker(focus.sticker, 16) ?? icon(isHome ? "folder" : "compass"));
        } else {
          b.append(icon(isHome ? "folder" : "compass"));
        }
        const displayName = isHome ? t.homeFocus : focus.name;
        b.append(h("span", "label", displayName));
        if (isActive) {
          b.append(h("span", "badge", "✓"));
        }
        b.addEventListener("click", () => {
          this.hide();
          void selectFocus(isHome ? null : focus);
        });
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  }
}
