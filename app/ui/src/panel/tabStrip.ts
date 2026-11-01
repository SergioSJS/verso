// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The right panel's tab bar: its tabs reordered by the person, and kept
// whole when the bar is short (maintainer, 2026-10-23, from the Windows
// app: "os botões no topo tão bem ruim e encavalado. deveria ter opção de
// reordenar com drag and drop como noutras partes do sistema").
//
// - Order: dragged along the bar with the pointer (HTML5 drag and drop is
//   dead in the WKWebView), or with Alt+←/→ on a focused tab, or from the
//   tab's menu ("Move left" / "Move right"); remembered in the browser's
//   storage, as the ribbon's is. A tab newer than the saved order goes
//   where it stands among the defaults.
// - Room: a tab keeps its size and its gap. Those that do not fit leave
//   the bar for a "⋯" button that lists them, never squeezed one against
//   the other nor under the window's own buttons (the bar's room is what
//   frame.ts leaves it: the spacer at its end is not counted). The chosen
//   tab always stays in the bar.

import { h } from "../dom";
import { icon } from "../icons";
import { showMenu, type MenuItem } from "../menu";
import { t } from "../strings";

const KEY = "verso.rightTabOrder";

export class TabStrip {
  private readonly more = h("button", "right-tab right-tab-more");
  private dragged = false;
  private fitting = 0;

  /** `bar`: the tablist, its tabs already in it in their default order.
   *  `current`: the chosen tab's id. `choose`: a tab picked from "⋯". */
  constructor(
    private readonly bar: HTMLElement,
    private readonly current: () => string,
    private readonly choose: (id: string) => void,
  ) {
    this.restore();
    this.more.type = "button";
    this.more.title = t.tabsMore;
    this.more.setAttribute("aria-label", t.tabsMore);
    this.more.setAttribute("aria-haspopup", "menu");
    this.more.append(icon("more"));
    this.more.hidden = true;
    this.more.addEventListener("click", () => this.openMore());
    this.bar.append(this.more);
    for (const b of this.tabs()) this.arm(b);
    this.bar.addEventListener("keydown", (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>("button[role=tab]");
      if (!tab || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      this.move(tab, e.key === "ArrowLeft" ? -1 : 1);
      tab.focus();
    });
    new ResizeObserver(() => this.fit()).observe(this.bar);
    // frame.ts has pushed the bar clear of the window's buttons: the room
    // is measured again.
    addEventListener("verso:frame-avoided", () => this.fit());
    this.fit();
  }

  private tabs(): HTMLButtonElement[] {
    return Array.from(this.bar.querySelectorAll<HTMLButtonElement>("button[role=tab]"));
  }

  /** The order the bar shows, ids. */
  order(): string[] {
    return this.tabs().map((b) => b.dataset["tab"] ?? "").filter(Boolean);
  }

  private restore(): void {
    let saved: unknown;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      return;
    }
    if (!Array.isArray(saved)) return;
    const defaults = this.order();
    const order = saved.filter((x): x is string => typeof x === "string" && defaults.includes(x));
    // A tab newer than the saved order: before the one that follows it
    // among the defaults.
    defaults.forEach((id, n) => {
      if (order.includes(id)) return;
      const after = defaults.slice(n + 1).find((x) => order.includes(x));
      order.splice(after ? order.indexOf(after) : order.length, 0, id);
    });
    for (const id of order) {
      const b = this.bar.querySelector<HTMLElement>(`button[role=tab][data-tab="${id}"]`);
      if (b) this.bar.append(b);
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.order()));
    } catch {
      // No storage.
    }
  }

  /** One place left (-1) or right (1) among the tabs that are shown. */
  move(tab: HTMLButtonElement, by: -1 | 1): void {
    const shown = this.tabs().filter((b) => !b.hidden);
    const other = shown[shown.indexOf(tab) + by];
    if (!other) return;
    if (by < 0) other.before(tab);
    else other.after(tab);
    this.save();
    this.fit();
  }

  private arm(b: HTMLButtonElement): void {
    b.addEventListener("click", (e) => {
      // The click that ends a drag chooses nothing.
      if (this.dragged) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      this.dragged = false;
    }, true);
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const shown = this.tabs().filter((x) => !x.hidden);
      const i = shown.indexOf(b);
      const items: MenuItem[] = [];
      if (i > 0) items.push([t.tabLeft, () => this.move(b, -1), "chevronLeft"]);
      if (i >= 0 && i < shown.length - 1) items.push([t.tabRight, () => this.move(b, 1), "chevronRight"]);
      if (items.length) showMenu(e.clientX, e.clientY, items);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left, clientY: r.bottom, bubbles: true, cancelable: true }));
    });
    b.addEventListener("pointerdown", (down) => {
      if (down.button !== 0 || down.ctrlKey) return;
      const x0 = down.clientX;
      let started = false;
      const move = (e: PointerEvent) => {
        if (!started) {
          if (Math.abs(e.clientX - x0) < 6) return;
          started = true;
          this.dragged = true;
          b.classList.add("dragging");
          try { b.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
        }
        // The tab follows the pointer's column: before the first tab whose
        // middle is to the pointer's right.
        const others = this.tabs().filter((x) => x !== b && !x.hidden && !x.hasAttribute("data-overflow"));
        const after = others.find((x) => {
          const r = x.getBoundingClientRect();
          return e.clientX < r.left + r.width / 2;
        });
        if (after) {
          if (b.nextElementSibling !== after) after.before(b);
        } else if (others.length) {
          const last = others[others.length - 1];
          if (last && last.nextElementSibling !== b) last.after(b);
        }
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        b.classList.remove("dragging");
        if (!started) return;
        this.save();
        this.fit();
        // A drag that ended off the tab fires no click: forget it soon.
        window.setTimeout(() => (this.dragged = false), 0);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }

  private openMore(): void {
    const items: MenuItem[] = this.tabs()
      .filter((b) => !b.hidden && b.hasAttribute("data-overflow"))
      .map((b) => [b.title || b.getAttribute("aria-label") || "", () => this.choose(b.dataset["tab"] ?? ""), b.dataset["icon"] ?? ""]);
    const r = this.more.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, items, t.tabsMore);
  }

  /** Shows as many tabs as the bar has room for, at their own size. */
  fit(): void {
    if (this.fitting) return;
    this.fitting = requestAnimationFrame(() => {
      this.fitting = 0;
      this.layout();
    });
  }

  private layout(): void {
    const tabs = this.tabs().filter((b) => !b.hidden);
    for (const b of tabs) b.removeAttribute("data-overflow");
    this.more.hidden = true;
    const cs = getComputedStyle(this.bar);
    const gap = parseFloat(cs.columnGap) || 0;
    const spacer = (name: string): number => (this.bar.classList.contains(`frame-push-${name === "--frame-l" ? "l" : "r"}`) ? parseFloat(this.bar.style.getPropertyValue(name)) || 0 : 0);
    const room = this.bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - spacer("--frame-l") - spacer("--frame-r");
    const widths = tabs.map((b) => b.getBoundingClientRect().width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, tabs.length - 1);
    if (total <= room + 0.5) return;
    // They do not all fit: the "⋯" takes a place of its own.
    this.more.hidden = false;
    const moreW = this.more.getBoundingClientRect().width;
    const budget = room - moreW - gap;
    const chosen = tabs.findIndex((b) => b.dataset["tab"] === this.current());
    const keep = new Set<number>();
    let used = 0;
    // The chosen tab is kept first, then the tabs of the game at the table
    // (`data-keep`: the Table's and the Music's, ADR 0116 as amended
    // 2026-10-31 — on a phone they are what the panel is opened for), then
    // the rest in the bar's order. The bar still shows them in its order.
    if (chosen >= 0) {
      keep.add(chosen);
      used = widths[chosen] ?? 0;
    }
    for (let i = 0; i < tabs.length; i++) {
      if (keep.has(i) || !tabs[i]?.hasAttribute("data-keep")) continue;
      const w = (widths[i] ?? 0) + (keep.size ? gap : 0);
      if (used + w > budget) break;
      keep.add(i);
      used += w;
    }
    for (let i = 0; i < tabs.length; i++) {
      if (keep.has(i)) continue;
      const w = (widths[i] ?? 0) + (keep.size ? gap : 0);
      if (used + w > budget) break;
      keep.add(i);
      used += w;
    }
    tabs.forEach((b, i) => {
      if (!keep.has(i)) b.setAttribute("data-overflow", "");
    });
  }

  /** The chosen tab changed: the bar may need another tab to make room for it. */
  chosen(): void {
    this.fit();
  }
}
