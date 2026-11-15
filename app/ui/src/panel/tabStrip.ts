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
// - Hidden (maintainer, 2026-11-01: "deveria ser possível esconder e
//   reordenar e reaparecer abas"): the tab's menu hides it; the "⋯" lists
//   the hidden ones to show again, with "Reset tabs"; Settings lists every
//   tab with a switch and up/down (tabsSettings.ts). The rules are
//   tabModel.ts's: the chosen tab always shows, the last one cannot go.
// - Room: a tab keeps its size and its gap. Those that do not fit leave
//   the bar for a "⋯" button that lists them, never squeezed one against
//   the other nor under the window's own buttons (the bar's room is what
//   frame.ts leaves it: the spacer at its end is not counted). The chosen
//   tab always stays in the bar.

import { h, ui } from "../dom";
import { icon, type IconName } from "../icons";
import { showMenu, type MenuItem } from "../menu";
import { t } from "../strings";
import { canHide, fold, hide, mergeOff, mergeOrder, moveAmong, reveal } from "./tabModel";
import { tabWords as w } from "./tabStrings";

const KEY = "verso.rightTabOrder";
const OFF = "verso.rightTabsOff";

/** Sent on the window when the tabs' order or hidden set changed. */
export const TABS_CHANGED = "verso:tabs-changed";

export type TabEntry = { id: string; label: string; icon: string; shown: boolean; canHide: boolean; first: boolean; last: boolean };

export class TabStrip {
  private readonly more = h("button", "right-tab right-tab-more");
  private dragged = false;
  private fitting = 0;
  private off: string[] = [];
  /** The order the tabs were built in, for "Reset tabs". */
  private defaults: string[] = [];

  /** `bar`: the tablist, its tabs already in it in their default order.
   *  `current`: the chosen tab's id. `choose`: a tab picked from "⋯", or
   *  the one a hidden tab hands the choice to. `openSettings`: where the
   *  tabs' switches are. */
  constructor(
    private readonly bar: HTMLElement,
    private readonly current: () => string,
    private readonly choose: (id: string) => void,
    private readonly openSettings: () => void = () => {},
  ) {
    this.defaults = this.order();
    this.restore();
    this.more.type = "button";
    this.more.title = t.tabsMore;
    this.more.setAttribute("aria-label", t.tabsMore);
    this.more.setAttribute("aria-haspopup", "menu");
    this.more.append(icon("more"));
    this.more.hidden = true;
    this.more.addEventListener("click", () => this.openMore());
    this.more.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openMore(e.clientX, e.clientY);
    });
    this.bar.append(this.more);
    // The bar's empty room has the same way back as the "⋯".
    this.bar.addEventListener("contextmenu", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      this.openMore(e.clientX, e.clientY);
    });
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
    // A tab came or went with its switch (the Table's, the Music's).
    addEventListener("verso:table-visibility", () => this.sync());
    this.sync();
  }

  private tabs(): HTMLButtonElement[] {
    return Array.from(this.bar.querySelectorAll<HTMLButtonElement>("button[role=tab]"));
  }

  /** The order the bar keeps, ids (the hidden tabs' places included). */
  order(): string[] {
    return this.tabs().map((b) => b.dataset["tab"] ?? "").filter(Boolean);
  }

  private available = (id: string): boolean => {
    const b = this.byId(id);
    return b !== null && !b.hidden;
  };

  private byId(id: string): HTMLButtonElement | null {
    return this.bar.querySelector<HTMLButtonElement>(`button[role=tab][data-tab="${id}"]`);
  }

  /** The tabs the person can see: available, and not hidden unless chosen. */
  private onScreen(): HTMLButtonElement[] {
    return this.tabs().filter((b) => !b.hidden && !b.hasAttribute("data-gone"));
  }

  /** Marks the tabs the person hid (and the chosen one, which shows). */
  private sync(): void {
    const current = this.current();
    for (const b of this.tabs()) {
      const id = b.dataset["tab"] ?? "";
      b.toggleAttribute("data-gone", this.off.includes(id) && id !== current);
    }
    this.fit();
  }

  private restore(): void {
    let order: unknown = null;
    let off: unknown = null;
    try {
      order = JSON.parse(localStorage.getItem(KEY) ?? "null");
      off = JSON.parse(localStorage.getItem(OFF) ?? "null");
    } catch {
      // A broken save: the defaults.
    }
    const defaults = this.order();
    this.apply(mergeOrder(order, defaults));
    this.off = mergeOff(off, defaults);
  }

  private apply(order: string[]): void {
    for (const id of order) {
      const b = this.byId(id);
      if (b) this.bar.append(b);
    }
    this.bar.append(this.more);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.order()));
      localStorage.setItem(OFF, JSON.stringify(this.off));
    } catch {
      // No storage.
    }
    this.sync();
    dispatchEvent(new Event(TABS_CHANGED));
  }

  /** One place left (-1) or right (1) among the tabs that are shown. */
  move(tab: HTMLButtonElement, by: -1 | 1): void {
    const id = tab.dataset["tab"] ?? "";
    const among = this.onScreen().map((b) => b.dataset["tab"] ?? "");
    const next = moveAmong(this.order(), among, id, by);
    if (next.join() === this.order().join()) return;
    this.apply(next);
    this.save();
  }

  /** Every tab the person can arrange (the available ones), in order, for Settings. */
  entries(): TabEntry[] {
    const order = this.order();
    const list = order.filter(this.available);
    return list.map((id, n) => {
      const b = this.byId(id) as HTMLButtonElement;
      return {
        id,
        label: b.title || b.getAttribute("aria-label") || id,
        icon: b.dataset["icon"] ?? "",
        shown: !this.off.includes(id),
        canHide: canHide(order, this.off, this.available, id),
        first: n === 0,
        last: n === list.length - 1,
      };
    });
  }

  /** A tab shown or hidden, from Settings or a menu. */
  setShown(id: string, on: boolean): void {
    const label = this.byId(id)?.title ?? id;
    if (on) this.off = reveal(this.off, id);
    else {
      if (!canHide(this.order(), this.off, this.available, id)) {
        say(w.lastOne);
        return;
      }
      this.off = hide(this.off, id);
      // A tab hidden while chosen hands the choice to its neighbour.
      if (this.current() === id) {
        const rest = this.tabs().filter((b) => b.dataset["tab"] !== id && !b.hidden && !this.off.includes(b.dataset["tab"] ?? ""));
        const here = this.tabs().indexOf(this.byId(id) as HTMLButtonElement);
        const next = rest.find((b) => this.tabs().indexOf(b) > here) ?? rest[rest.length - 1];
        if (next) this.choose(next.dataset["tab"] ?? "");
      }
      say(w.hidden(label));
    }
    this.save();
  }

  /** One place up (-1) or down (1) among all the available tabs, hidden ones too (Settings' list). */
  moveEntry(id: string, by: -1 | 1): void {
    const among = this.order().filter(this.available);
    const next = moveAmong(this.order(), among, id, by);
    if (next.join() === this.order().join()) return;
    this.apply(next);
    this.save();
  }

  /** Every tab back, in the default order. */
  reset(): void {
    this.off = [];
    this.apply(this.defaults);
    this.save();
    say(w.restored);
  }


  /** The way back: the hidden tabs to show, all of them, the reset, Settings. */
  private backItems(): MenuItem[] {
    const hidden = this.order().filter((id) => this.available(id) && this.off.includes(id));
    const items: MenuItem[] = hidden.map((id) => {
      const b = this.byId(id) as HTMLButtonElement;
      return [w.show(b.title || id), () => {
        this.setShown(id, true);
        this.choose(id);
      }, b.dataset["icon"] ?? "eye"] as MenuItem;
    });
    if (hidden.length > 1) items.push([w.showAll(hidden.length), () => { this.off = []; this.save(); }, "eye"]);
    items.push([w.reset, () => this.reset(), "refresh"]);
    items.push([w.settings, () => this.openSettings(), "gear"]);
    return items;
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
      const shownTabs = this.onScreen();
      const i = shownTabs.indexOf(b);
      const id = b.dataset["tab"] ?? "";
      const items: MenuItem[] = [];
      // A finger's long press: the tab's name first, as no pointer hovers for
      // its title on a phone (the tabs are icons there); choosing it opens the tab.
      if (matchMedia("(hover: none)").matches) items.push([b.title || b.getAttribute("aria-label") || id, () => this.choose(id), (b.dataset["icon"] ?? "") as IconName]);
      if (i > 0) items.push([t.tabLeft, () => this.move(b, -1), "chevronLeft"]);
      if (i >= 0 && i < shownTabs.length - 1) items.push([t.tabRight, () => this.move(b, 1), "chevronRight"]);
      items.push([w.hide, () => this.setShown(id, false), "eyeOff"]);
      items.push(...this.backItems());
      showMenu(e.clientX, e.clientY, items, t.tabsMore);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left, clientY: r.bottom, bubbles: true, cancelable: true }));
    });
    b.addEventListener("pointerdown", (down) => {
      if (down.button !== 0 || down.ctrlKey) return;
      // A finger scrolls and long-presses (touch.ts): the drag is the mouse's and the pen's.
      if (down.pointerType === "touch") return;
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
        const others = this.onScreen().filter((x) => x !== b && !x.hasAttribute("data-overflow"));
        const after = others.find((x) => {
          const r = x.getBoundingClientRect();
          return e.clientX < r.left + r.width / 2;
        });
        if (after) {
          if (b.nextElementSibling !== after) after.before(b);
        } else if (others.length) {
          const last = others[others.length - 1];
          if (last && !(last.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) this.bar.insertBefore(b, this.more);
        }
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        b.classList.remove("dragging");
        if (!started) return;
        this.save();
        // A drag that ended off the tab fires no click: forget it soon.
        window.setTimeout(() => (this.dragged = false), 0);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }

  private openMore(x?: number, y?: number): void {
    const folded: MenuItem[] = this.onScreen()
      .filter((b) => b.hasAttribute("data-overflow"))
      .map((b): MenuItem => [b.title || b.getAttribute("aria-label") || "", () => this.choose(b.dataset["tab"] ?? ""), (b.dataset["icon"] ?? "") as IconName]);
    const r = this.more.getBoundingClientRect();
    showMenu(x ?? r.left, y ?? r.bottom + 4, [...folded, ...this.backItems()], t.tabsMore);
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
    const tabs = this.onScreen();
    for (const b of tabs) b.removeAttribute("data-overflow");
    this.more.hidden = true;
    // The "⋯" is also the way back to the hidden tabs: it stays while any is.
    const hasBack = this.order().some((id) => this.available(id) && this.off.includes(id) && id !== this.current());
    const cs = getComputedStyle(this.bar);
    const gap = parseFloat(cs.columnGap) || 0;
    const spacer = (name: string): number => (this.bar.classList.contains(`frame-push-${name === "--frame-l" ? "l" : "r"}`) ? parseFloat(this.bar.style.getPropertyValue(name)) || 0 : 0);
    const room = this.bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - spacer("--frame-l") - spacer("--frame-r");
    const widths = tabs.map((b) => b.getBoundingClientRect().width);
    const total = widths.reduce((a, v) => a + v, 0) + gap * Math.max(0, tabs.length - 1);
    if (total <= room + 0.5 && !hasBack) return;
    // The "⋯" takes a place of its own.
    this.more.hidden = false;
    if (total <= room + 0.5 && total + gap + this.more.getBoundingClientRect().width <= room + 0.5) return;
    const budget = room - this.more.getBoundingClientRect().width - gap;
    // The chosen tab is kept first, then the tabs of the game at the table
    // (`data-keep`: the Table's and the Music's, ADR 0116 as amended
    // 2026-10-31 — on a phone they are what the panel is opened for), then
    // the rest in the person's order. The bar still shows them in its order.
    const ids = tabs.map((b) => b.dataset["tab"] ?? "");
    const kept = fold(ids, widths, gap, budget, this.current(), (id) => this.byId(id)?.hasAttribute("data-keep") === true);
    for (const b of tabs) if (!kept.has(b.dataset["tab"] ?? "")) b.setAttribute("data-overflow", "");
  }

  /** The chosen tab changed: a hidden one shows while chosen, and the bar may need room for it. */
  chosen(): void {
    this.sync();
  }
}

/** A word in the status line, for a change nothing else would show. */
function say(text: string): void {
  ui.status.textContent = text;
}
