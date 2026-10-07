// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "./bindings";
import { narrow, rightShown, sideShown, toggleRight, toggleSide } from "./chrome";
import { dailyNote, insertTemplate } from "./daily";
import { h, ui } from "./dom";
import { fail } from "./errors";
import { currentFolder } from "./folder";
import { icon } from "./icons";
import { keyOf, withKeys } from "./keys";
import { layout, paneToOpenIn } from "./layout/spaces";
import { paletteDialog, quick, replaceDialog, settingsDialog } from "./main";
import { createMenuItems, showMenu } from "./menu";
import { reindex } from "./open";
import { dirOf } from "./paths";
import { t } from "./strings";

/* ---------- The ribbon: one column of what the app does, reordered by drag ---------- */
/** `keys`: the command whose hotkey the tooltip shows. */
export type RibbonItem = { id: string; icon: string; label: () => string; keys?: string; bottom?: boolean; needsFolder?: boolean; run: (button: HTMLButtonElement) => void };
export const RIBBON: RibbonItem[] = [
  { id: "files", icon: "sidebar", label: () => t.ribbonFiles, keys: "toggle-side", run: () => toggleSide() },
  { id: "search", icon: "search", label: () => t.search, keys: "search", needsFolder: true, run: () => { if (document.body.classList.contains("no-side") || narrow.matches) toggleSide(); ui.search.focus(); ui.search.select(); } },
  { id: "quick", icon: "note", label: () => t.quick, keys: "quick", needsFolder: true, run: () => quick.show() },
  { id: "commands", icon: "command", label: () => t.commands, keys: "palette", needsFolder: true, run: () => paletteDialog.show() },
  { id: "new", icon: "plus", label: () => t.newNote, keys: "new-note", needsFolder: true, run: (b) => {
    const folder = layout().activeLeaf?.path ? dirOf(layout().activeLeaf!.path) : "";
    const r = b.getBoundingClientRect();
    showMenu(r.right + 6, r.top, createMenuItems(folder));
  } },
  { id: "daily", icon: "calendarDay", label: () => t.daily, keys: "daily", needsFolder: true, run: () => void dailyNote() },
  { id: "graph", icon: "graph", label: () => t.graphWhole, needsFolder: true, run: () => paneToOpenIn().openGraph("") },
  { id: "replace", icon: "replace", label: () => t.replaceTitle, keys: "replace", needsFolder: true, run: () => replaceDialog.show() },
  { id: "template", icon: "template", label: () => t.insertTemplate, needsFolder: true, run: () => insertTemplate() },
  { id: "reindex", icon: "refresh", label: () => t.reindex, needsFolder: true, run: () => void reindex() },
  { id: "new-window", icon: "maximize", label: () => t.newWindow, needsFolder: false, run: () => void commands.newWindow(false).then((r) => r.status === "ok" || fail(r.error)) },
  { id: "right", icon: "panelRight", label: () => t.toggleRight, keys: "toggle-right", bottom: true, run: () => toggleRight() },
  { id: "settings", icon: "gear", label: () => t.settings, keys: "settings", bottom: true, run: () => settingsDialog.show() },
];
export class Ribbon {
  private order: string[] = RIBBON.map((i) => i.id);
  private hidden = new Set<string>();
  constructor(readonly el: HTMLElement) {
    try {
      const raw = localStorage.getItem("verso.ribbon");
      if (raw) {
        const saved = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
        if (Array.isArray(saved.order)) this.order = [...saved.order.filter((x): x is string => typeof x === "string" && RIBBON.some((i) => i.id === x)), ...RIBBON.map((i) => i.id).filter((id) => !(saved.order as unknown[]).includes(id))];
        if (Array.isArray(saved.hidden)) this.hidden = new Set(saved.hidden.filter((x): x is string => typeof x === "string"));
      }
    } catch { /* no storage */ }
    this.el.title = t.ribbonDragHint;
    this.paint();
  }
  private save(): void {
    try { localStorage.setItem("verso.ribbon", JSON.stringify({ order: this.order, hidden: Array.from(this.hidden) })); } catch { /* no storage */ }
  }
  paint(): void {
    const hasFolder = currentFolder !== "";
    // Drawn anew, a button that had the focus gets it back (a toggle
    // pressed from the keyboard used to drop it on the page).
    const had = document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement) ? document.activeElement.dataset["id"] : undefined;
    const top = h("div", "ribbon-group");
    const bottom = h("div", "ribbon-group ribbon-bottom");
    for (const id of this.order) {
      const it = RIBBON.find((i) => i.id === id);
      if (!it || this.hidden.has(id)) continue;
      const b = h("button", "ribbon-item");
      b.type = "button";
      b.dataset["id"] = id;
      b.title = withKeys(it.label(), it.keys ? keyOf(it.keys) : "");
      b.setAttribute("aria-label", it.label());
      b.append(icon(it.icon));
      b.disabled = Boolean(it.needsFolder) && !hasFolder;
      if (id === "files") b.classList.toggle("on", !document.body.classList.contains("no-side"));
      if (id === "right") b.classList.toggle("on", !document.body.classList.contains("no-right"));
      // The two toggles say whether what they show is on screen.
      if (id === "files") b.setAttribute("aria-expanded", String(sideShown()));
      if (id === "right") b.setAttribute("aria-expanded", String(rightShown()));
      if (id === "new") b.setAttribute("aria-haspopup", "menu");
      b.addEventListener("click", () => { if (!this.dragged) it.run(b); this.dragged = false; });
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const hiddenCount = this.hidden.size;
        showMenu(e.clientX, e.clientY, [
          // What dragging a button along the column does, from the menu.
          [t.ribbonUp, () => this.move(id, -1)],
          [t.ribbonDown, () => this.move(id, 1)],
          [t.ribbonHide, () => { this.hidden.add(id); this.save(); this.paint(); }],
          ...(hiddenCount > 0 ? [[`${t.ribbonShowAll} (${hiddenCount})`, () => { this.hidden.clear(); this.save(); this.paint(); }] as [string, () => void]] : []),
          [t.ribbonReset, () => { this.order = RIBBON.map((i) => i.id); this.hidden.clear(); this.save(); this.paint(); }],
        ]);
      });
      // The menu from the keyboard, as the tree's rows and the tabs have it.
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
        e.preventDefault();
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.right + 6, clientY: r.top, bubbles: true, cancelable: true }));
      });
      this.armDrag(b);
      (it.bottom ? bottom : top).append(b);
    }
    this.el.replaceChildren(top, bottom);
    if (had) (this.el.querySelector<HTMLButtonElement>(`[data-id="${had}"]`) ?? this.el.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  }
  /** One place up or down among the shown buttons of its group. */
  private move(id: string, by: -1 | 1): void {
    const bottom = (x: string) => RIBBON.find((i) => i.id === x)?.bottom === true;
    const group = this.order.filter((x) => !this.hidden.has(x) && bottom(x) === bottom(id));
    const other = group[group.indexOf(id) + by];
    if (other === undefined || !group.includes(id)) return;
    const a = this.order.indexOf(id);
    const b = this.order.indexOf(other);
    this.order[a] = other;
    this.order[b] = id;
    this.save();
    this.paint();
  }
  private dragged = false;
  /** Pointer drag within the column: the button follows the pointer's
   *  row, the order is kept when it lands. */
  private armDrag(b: HTMLButtonElement): void {
    b.addEventListener("pointerdown", (down) => {
      if (down.button !== 0) return;
      const y0 = down.clientY;
      let started = false;
      const move = (e: PointerEvent) => {
        if (!started) {
          if (Math.abs(e.clientY - y0) < 6) return;
          started = true;
          this.dragged = true;
          b.classList.add("dragging");
          b.setPointerCapture(e.pointerId);
        }
        const group = b.parentElement;
        if (!group) return;
        const siblings = Array.from(group.querySelectorAll<HTMLButtonElement>(".ribbon-item")).filter((x) => x !== b);
        const after = siblings.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
        if (after) group.insertBefore(b, after);
        else group.append(b);
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        b.classList.remove("dragging");
        if (!started) return;
        this.order = Array.from(this.el.querySelectorAll<HTMLButtonElement>(".ribbon-item")).map((x) => x.dataset["id"] ?? "").filter(Boolean);
        for (const id of RIBBON.map((i) => i.id)) if (!this.order.includes(id)) this.order.push(id);
        this.save();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }
}
