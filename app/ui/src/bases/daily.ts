// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The month of the daily notes, in the side panel (ADR 0053, the
// maintainer's answer of 2026-09-24: "os dois"): a mark on each day that
// has its note, a click that opens it, or makes it from the daily note's
// template (ADR 0014, the daily note accepted on 2026-09-23). The arrows
// move between days, as in any calendar grid.

import { icon } from "../icons";
import { h } from "./cells";
import type { BaseStrings } from "./strings";

export type DailyHost = {
  locale: string;
  s: BaseStrings;
  /** Whether the day (`YYYY-MM-DD`) has its daily note. */
  has(day: string): boolean;
  /** Open the day's note, made first when it is not there. */
  open(day: string): void;
};

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export class DailyCalendar {
  readonly el = h("div", "daily-cal");
  private y: number;
  private m: number;
  /** The day the keyboard is on, kept across a redraw. */
  private focus: string | null = null;

  constructor(private readonly host: DailyHost) {
    const now = new Date();
    this.y = now.getFullYear();
    this.m = now.getMonth();
  }

  render(): void {
    const { s, locale } = this.host;
    const now = new Date();
    const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
    const head = h("div", "daily-head");
    const title = h("h3", "daily-title", `${s.months[this.m] ?? ""} ${this.y}`);
    title.setAttribute("aria-live", "polite");
    const nav = (label: string, ic: string, step: number) => {
      const b = h("button", "base-tool");
      b.type = "button";
      b.append(icon(ic));
      b.setAttribute("aria-label", label);
      b.title = label;
      b.addEventListener("click", () => {
        this.m += step;
        if (this.m < 0) {
          this.m = 11;
          this.y -= 1;
        } else if (this.m > 11) {
          this.m = 0;
          this.y += 1;
        }
        this.render();
      });
      return b;
    };
    const back = h("button", "base-tool daily-today", s.today);
    back.type = "button";
    back.addEventListener("click", () => {
      this.y = now.getFullYear();
      this.m = now.getMonth();
      this.focus = today;
      this.render();
    });
    head.append(nav(s.previous, "chevronLeft", -1), title, nav(s.next, "chevron", 1), back);
    const grid = h("div", "daily-grid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", `${s.dailyCalendar}, ${s.months[this.m] ?? ""} ${this.y}`);
    const names = h("div", "daily-row");
    names.setAttribute("role", "row");
    for (const n of s.weekdaysShort) {
      const c = h("div", "daily-name", n);
      c.setAttribute("role", "columnheader");
      names.append(c);
    }
    grid.append(names);
    const first = new Date(Date.UTC(this.y, this.m, 1)).getUTCDay();
    const days = new Date(Date.UTC(this.y, this.m + 1, 0)).getUTCDate();
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    let row = h("div", "daily-row");
    row.setAttribute("role", "row");
    for (let i = 0; i < first; i++) {
      const pad = h("div", "daily-pad");
      pad.setAttribute("role", "gridcell");
      row.append(pad);
    }
    const buttons: HTMLButtonElement[] = [];
    for (let d = 1; d <= days; d++) {
      const day = iso(this.y, this.m, d);
      const cell = h("div", "daily-cell");
      cell.setAttribute("role", "gridcell");
      const b = h("button", "daily-day", String(d));
      b.type = "button";
      b.dataset["day"] = day;
      const has = this.host.has(day);
      const said = fmt.format(new Date(Date.UTC(this.y, this.m, d)));
      b.setAttribute("aria-label", has ? s.openDaily(said) : s.createDaily(said));
      if (has) b.classList.add("has");
      if (day === today) {
        b.classList.add("today");
        b.setAttribute("aria-current", "date");
      }
      b.tabIndex = -1;
      b.addEventListener("click", () => {
        this.focus = day;
        this.host.open(day);
      });
      buttons.push(b);
      cell.append(b);
      row.append(cell);
      if ((first + d) % 7 === 0 && d !== days) {
        grid.append(row);
        row = h("div", "daily-row");
        row.setAttribute("role", "row");
      }
    }
    grid.append(row);
    // One day in the Tab order: the one the keyboard was on, else today,
    // else the first; the arrows, Home and End move among them.
    const at = buttons.find((b) => b.dataset["day"] === this.focus) ?? buttons.find((b) => b.dataset["day"] === today) ?? buttons[0];
    if (at) at.tabIndex = 0;
    grid.addEventListener("keydown", (e) => {
      const i = buttons.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 7 : e.key === "ArrowUp" ? -7 : 0;
      let j = step === 0 ? (e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1) : i + step;
      if (j === -1 && step === 0) return;
      e.preventDefault();
      j = Math.min(Math.max(j, 0), buttons.length - 1);
      for (const b of buttons) b.tabIndex = -1;
      const to = buttons[j];
      if (to) {
        to.tabIndex = 0;
        to.focus();
        this.focus = to.dataset["day"] ?? null;
      }
    });
    const had = this.el.contains(document.activeElement) && document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("daily-day");
    this.el.replaceChildren(head, grid);
    if (had) at?.focus();
  }
}
