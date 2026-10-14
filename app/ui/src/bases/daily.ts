// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The month of the daily notes, in the side panel (ADR 0053, the
// maintainer's answer of 2026-09-24: "os dois"): a mark on each day that
// has its note, a click that opens it, or makes it from the daily note's
// template (ADR 0014, the daily note accepted on 2026-09-23). The arrows
// move between days, as in any calendar grid. With periodic notes (ADR
// 0093 item 9): a column of week numbers — a click opens or makes the
// week's note —, the month's name opening the month's note and the year
// the year's, each marked when its note exists, for the periods that are
// on; the weeks start on the folder's day. ArrowLeft from a week's first
// day reaches its number, ArrowRight comes back.

import { icon } from "../icons";
import { h } from "./cells";
import type { BaseStrings } from "./strings";

/** A period's note as the calendar shows it: its name for a screen
 *  reader, whether it exists, and what a click does. */
export type PeriodCell = { label: string; title?: string; has: boolean; open(): void };

export type DailyHost = {
  locale: string;
  s: BaseStrings;
  /** Whether the day (`YYYY-MM-DD`) has its daily note. */
  has(day: string): boolean;
  /** Open the day's note, made first when it is not there. */
  open(day: string): void;
  /** The week's first day: 0 Sunday … 6 Saturday. */
  weekStart?(): number;
  /** The week whose row starts on `day`, with its number; null when the
   *  week's notes are off. */
  week?(day: string): (PeriodCell & { number: number }) | null;
  /** The month's note (`m` 0–11), the year's; null when off. */
  month?(y: number, m: number): PeriodCell | null;
  year?(y: number): PeriodCell | null;
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
  /** The week number the keyboard is on (its row's first day), kept
   *  across a redraw. */
  private focusWeek: string | null = null;

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
    const title = h("h3", "daily-title");
    title.setAttribute("aria-live", "polite");
    const periodButton = (text: string, cell: PeriodCell | null | undefined, cls: string): HTMLElement => {
      if (!cell) return h("span", cls, text);
      const b = h("button", `${cls} daily-period`, text);
      b.type = "button";
      b.setAttribute("aria-label", cell.label);
      b.title = cell.label;
      if (cell.has) b.classList.add("has");
      b.addEventListener("click", () => cell.open());
      return b;
    };
    title.append(
      periodButton(s.months[this.m] ?? "", this.host.month?.(this.y, this.m), "daily-month"),
      " ",
      periodButton(String(this.y), this.host.year?.(this.y), "daily-year"),
    );
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
    const start = this.host.weekStart?.() ?? 0;
    const firstDay = new Date(Date.UTC(this.y, this.m, 1)).getUTCDay();
    const first = (firstDay - start + 7) % 7;
    const days = new Date(Date.UTC(this.y, this.m + 1, 0)).getUTCDate();
    // The week column, when the week's notes are on.
    const rowStart = (d: number) => {
      const at = new Date(Date.UTC(this.y, this.m, d));
      return at.toISOString().slice(0, 10);
    };
    const weeks = Boolean(this.host.week?.(rowStart(1 - first)));
    grid.classList.toggle("with-weeks", weeks);
    const names = h("div", "daily-row");
    names.setAttribute("role", "row");
    if (weeks) {
      const c = h("div", "daily-name daily-week-head", s.weekShort);
      c.setAttribute("role", "columnheader");
      names.append(c);
    }
    for (let i = 0; i < 7; i++) {
      const c = h("div", "daily-name", s.weekdaysShort[(start + i) % 7] ?? "");
      c.setAttribute("role", "columnheader");
      names.append(c);
    }
    grid.append(names);
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });
    const weekButtons: HTMLButtonElement[] = [];
    const newRow = (firstOfRow: number) => {
      const r = h("div", "daily-row");
      r.setAttribute("role", "row");
      const week = weeks ? this.host.week?.(rowStart(firstOfRow)) : null;
      if (week) {
        const cell = h("div", "daily-cell daily-week-cell");
        cell.setAttribute("role", "rowheader");
        const b = h("button", "daily-week", String(week.number));
        b.type = "button";
        b.tabIndex = -1;
        b.setAttribute("aria-label", week.label);
        b.title = week.title ?? week.label;
        b.dataset["week"] = rowStart(firstOfRow);
        if (week.has) b.classList.add("has");
        b.addEventListener("click", () => week.open());
        weekButtons.push(b);
        cell.append(b);
        r.append(cell);
      }
      return r;
    };
    let row = newRow(1 - first);
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
        row = newRow(d + 1);
      }
    }
    grid.append(row);
    // One day in the Tab order: the one the keyboard was on, else today,
    // else the first; the arrows, Home and End move among them.
    // Where the keyboard is, however it got there (a click, the arrows, a
    // script), so that a redraw — a note made, a setting changed — keeps
    // it there.
    grid.addEventListener("focusin", (e) => {
      const b = e.target as HTMLElement;
      if (b.dataset["day"]) {
        this.focus = b.dataset["day"];
        this.focusWeek = null;
      } else if (b.dataset["week"]) this.focusWeek = b.dataset["week"];
    });
    const atWeek = this.focusWeek ? weekButtons.find((b) => b.dataset["week"] === this.focusWeek) : undefined;
    const at = atWeek ?? buttons.find((b) => b.dataset["day"] === this.focus) ?? buttons.find((b) => b.dataset["day"] === today) ?? buttons[0];
    if (at) at.tabIndex = 0;
    const moveTo = (to: HTMLButtonElement | undefined) => {
      if (!to) return;
      for (const b of [...buttons, ...weekButtons]) b.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    };
    grid.addEventListener("keydown", (e) => {
      // A week's number: ArrowRight to its row's first day, up and down
      // along the weeks (ADR 0093 item 14: the grid keeps its arrows).
      const w = weekButtons.indexOf(e.target as HTMLButtonElement);
      if (w >= 0) {
        const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          moveTo(buttons[Math.max(0, w * 7 - first)]);
        } else if (step !== 0) {
          e.preventDefault();
          moveTo(weekButtons[Math.min(Math.max(w + step, 0), weekButtons.length - 1)]);
        }
        return;
      }
      const i = buttons.indexOf(e.target as HTMLButtonElement);
      if (i < 0) return;
      if (e.key === "ArrowLeft" && weekButtons.length > 0 && ((first + i) % 7 === 0 || i === 0)) {
        e.preventDefault();
        moveTo(weekButtons[Math.floor((first + i) / 7)]);
        return;
      }
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 7 : e.key === "ArrowUp" ? -7 : 0;
      let j = step === 0 ? (e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1) : i + step;
      if (j === -1 && step === 0) return;
      e.preventDefault();
      j = Math.min(Math.max(j, 0), buttons.length - 1);
      for (const b of [...buttons, ...weekButtons]) b.tabIndex = -1;
      const to = buttons[j];
      if (to) {
        to.tabIndex = 0;
        to.focus();
        this.focus = to.dataset["day"] ?? null;
      }
    });
    const had = this.el.contains(document.activeElement) && document.activeElement instanceof HTMLElement && (document.activeElement.classList.contains("daily-day") || document.activeElement.classList.contains("daily-week"));
    this.el.replaceChildren(head, grid);
    if (had) at?.focus();
  }
}
