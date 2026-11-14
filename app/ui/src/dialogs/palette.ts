// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h } from "../dom";
import { allCommands, Command } from "../keys";
import { t } from "../strings";
import { asCombobox, asDialog, closed, opened, option } from "./a11y";
import { focusOnOpen } from "../screen/openFocus";

export class Palette {
  readonly el = h("div", "quick palette");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: Command[] = [];
  private sel = 0;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.commands;
    this.input.setAttribute("aria-label", t.commands);
    asCombobox(this.input, this.list, "palette-list");
    asDialog(this.el, t.commands, () => this.hide());
    this.box.append(this.input, this.list);
    this.el.append(this.box);
    document.body.append(this.el);
    this.input.addEventListener("input", () => this.update());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      else if (e.key === "ArrowDown") { e.preventDefault(); this.sel = Math.min(this.sel + 1, this.items.length - 1); this.paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.sel = Math.max(this.sel - 1, 0); this.paint(); }
      else if (e.key === "Enter") { e.preventDefault(); this.choose(this.items[this.sel]); }
    });
    this.el.addEventListener("mousedown", (e) => { if (e.target === this.el) this.hide(); });
  }
  show(): void { opened(this.el); this.el.hidden = false; this.input.value = ""; this.update(); focusOnOpen(this.input); }
  hide(): void { this.el.hidden = true; closed(this.el); }
  private choose(c: Command | undefined): void { if (!c) return; this.hide(); c.run(); }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    this.items = allCommands().filter((c) => q === "" || c.label.toLowerCase().includes(q)).slice(0, 20);
    this.sel = 0;
    this.paint();
  }
  private paint(): void {
    this.input.removeAttribute("aria-activedescendant");
    this.list.replaceChildren(
      ...this.items.map((c, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
        option(li, b, `palette-option-${i}`, i === this.sel, this.input);
        b.append(h("span", "", c.label));
        if (c.keys) b.append(h("kbd", "", c.keys));
        b.addEventListener("click", () => this.choose(c));
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
}
