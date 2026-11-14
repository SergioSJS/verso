// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h } from "../dom";
import { allEntries, allFiles, allNotes } from "../folder";
import { recents } from "../history";
import { icon } from "../icons";
import { renderSticker, resolveColor } from "../labels";
import { openNote } from "../layout/spaces";
import { dirOf, iconFor, kindOf, name } from "../paths";
import { settings } from "../settings";
import { t } from "../strings";
import { asCombobox, asDialog, closed, opened } from "./a11y";
import { focusOnOpen } from "../screen/openFocus";

/* ---------- `[[` completes to a note or a file; `[[Note#` to its headings ---------- */
export function score(label: string, path: string, typed: string): number {
  const l = label.toLowerCase();
  if (typed === "") return 1;
  if (l === typed) return 100;
  if (l.startsWith(typed)) return 80;
  if (l.split(/[\s\-_.]/).some((w) => w.startsWith(typed))) return 60;
  if (l.includes(typed)) return 40;
  if (path.toLowerCase().includes(typed)) return 30;
  // Subsequence: every typed character in order.
  let i = 0;
  for (const ch of l) if (ch === typed[i]) i++;
  return i === typed.length ? 10 : 0;
}

/* ---------- ⌘P ---------- */
export class QuickSwitcher {
  readonly el = h("div", "quick");
  readonly box = h("div", "quick-box");
  readonly input = h("input");
  readonly list = h("ul", "quick-list");
  private items: string[] = [];
  private sel = 0;
  /** A board asked for a file (`pick`): the choice goes there, nothing opens. */
  private picking: ((path: string | null) => void) | null = null;
  constructor() {
    this.el.hidden = true;
    this.input.type = "text";
    this.input.placeholder = t.quick;
    this.input.setAttribute("aria-label", t.quick);
    asCombobox(this.input, this.list, "quick-list");
    asDialog(this.el, t.quick, () => this.hide());
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
        this.choose(this.items[this.sel], e.metaKey || e.ctrlKey);
      }
    });
    this.el.addEventListener("mousedown", (e) => {
      if (e.target === this.el) this.hide();
    });
  }
  /** What was listed last is forgotten: it is drawn again when the switcher
   *  opens (a file the person lost sight of is not left in the page). */
  forget(): void {
    this.items = [];
    this.list.replaceChildren();
  }
  show(query = ""): void {
    opened(this.el);
    this.el.hidden = false;
    this.input.value = query;
    this.update();
    // A name filled in is selected: typing replaces it.
    focusOnOpen(this.input, { select: query !== "" });
  }
  hide(restore = true): void {
    this.el.hidden = true;
    closed(this.el, restore);
    const picking = this.picking;
    this.picking = null;
    picking?.(null);
  }
  /** Choose a note or file of the folder, and wait: its path, or null. */
  pick(query = ""): Promise<string | null> {
    this.hide();
    return new Promise<string | null>((resolve) => {
      this.show(query);
      this.picking = resolve;
    });
  }
  private choose(path: string | undefined, aside: boolean): void {
    if (!path) return;
    const picking = this.picking;
    this.picking = null;
    this.hide(Boolean(picking));
    if (picking) picking(path);
    else openNote(path, aside, false, true);
  }
  private update(): void {
    const q = this.input.value.trim().toLowerCase();
    const score = (path: string): number => {
      const base = name(path).toLowerCase();
      const full = path.toLowerCase();
      if (q === "") return recents.includes(path) ? 100 - recents.indexOf(path) : 1;
      const sub = (s: string): number => {
        let i = 0;
        let run = 0;
        let best = 0;
        for (const ch of s) {
          if (ch === q[i]) {
            i++;
            run++;
            best = Math.max(best, run);
            if (i === q.length) return 1 + best / q.length;
          } else run = 0;
        }
        return 0;
      };
      // The name typed whole comes first: "N" opens N.md, not a longer
      // name that starts with it and sorts earlier by its folder.
      if (base === q) return 12;
      if (base.startsWith(q)) return 10;
      if (base.includes(q)) return 6;
      return Math.max(sub(base) * 2, sub(full));
    };
    this.items = [...allNotes, ...allFiles]
      .map((p) => [p, score(p)] as const)
      .filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([p]) => p);
    this.sel = 0;
    this.paint();
  }
  private paint(): void {
    this.input.removeAttribute("aria-activedescendant");
    this.list.replaceChildren(
      ...this.items.map((p, i) => {
        const li = h("li", i === this.sel ? "selected" : "");
        const b = h("button");
        b.type = "button";
        const label = allEntries.get(p)?.label;
        const stickerNode = settings.stickers && label?.sticker ? renderSticker(label.sticker, 14) : null;
        const leadIcon = stickerNode ?? icon(iconFor(kindOf(p)));
        const nameSpan = h("span", "", name(p));
        if (label?.color) {
          const c = resolveColor(label.color);
          if (c) nameSpan.style.color = c;
        }
        b.append(leadIcon, nameSpan, h("span", "path", dirOf(p)));
        b.addEventListener("click", (e) => this.choose(p, e.metaKey || e.ctrlKey));
        li.append(b);
        return li;
      }),
    );
    this.list.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }
}
