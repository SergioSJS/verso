// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The calendar layout, a Verso extension (ADR 0053): Obsidian documents no
// calendar view, and the keys are the ones community calendar views write
// in public bases — `startDate`, `endDate`, `weekStartDay`. A month of
// days; each note on the day its date property names, across the days to
// its end date if the view has one. A note dragged to another day — or
// moved with Alt and the arrows — has its date written; "+" on a day
// makes a note on it.

import type { BaseCell, BaseRow, PropertyValue } from "../bindings";
import { icon } from "../icons";
import { h, isoDateTime, isoDay, noteKey } from "./cells";
import { columnOf, titleOf } from "./cards";
import { draggable } from "./drag";
import type { RenderCtx } from "./view";

const DAY = 86_400_000;

/** A cell's date as wall-clock milliseconds, and whether it has a time. */
function dateOf(c: BaseCell | null | undefined): { ms: number; time: boolean } | null {
  if (!c) return null;
  if (c.kind === "date" && c.value.ms !== null) return { ms: c.value.ms, time: c.value.time };
  if (c.kind === "text") {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(c.value.trim());
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
    return Number.isNaN(ms) ? null : { ms, time: m[4] !== undefined };
  }
  return null;
}

function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

type Item = { row: BaseRow; start: number; end: number; time: boolean; endTime: boolean | null };

function monthKey(ctx: RenderCtx): string {
  return `verso.baseMonth.${ctx.key}.${ctx.view.name}`;
}

function shownMonth(ctx: RenderCtx): { y: number; m: number } {
  try {
    const saved = localStorage.getItem(monthKey(ctx));
    const m = saved ? /^(\d{4})-(\d{2})$/.exec(saved) : null;
    if (m) return { y: Number(m[1]), m: Number(m[2]) - 1 };
  } catch {
    // No storage: this month.
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() };
}

function keepMonth(ctx: RenderCtx, y: number, m: number): void {
  try {
    localStorage.setItem(monthKey(ctx), `${y}-${String(m + 1).padStart(2, "0")}`);
  } catch {
    // No storage.
  }
}

export function renderCalendar(ctx: RenderCtx): HTMLElement {
  const { s, view, host } = ctx;
  const wrap = h("div", "base-calendar-wrap");
  const startId = typeof view["startDate"] === "string" ? (view["startDate"] as string) : "";
  const endId = typeof view["endDate"] === "string" ? (view["endDate"] as string) : "";
  if (!startId) {
    wrap.append(h("p", "base-hint", s.chooseDate));
    return wrap;
  }
  const startCol = columnOf(ctx, startId);
  const endCol = endId ? columnOf(ctx, endId) : -1;
  const startKey = noteKey(startId);
  const endKey = endId ? noteKey(endId) : null;
  const items: Item[] = [];
  for (const g of ctx.groups) {
    for (const row of g.rows) {
      const start = dateOf(row.cells[startCol]);
      if (!start) continue;
      const end = endCol >= 0 ? dateOf(row.cells[endCol]) : null;
      items.push({
        row,
        start: start.ms,
        end: end && end.ms >= start.ms ? end.ms : start.ms,
        time: start.time,
        endTime: end ? end.time : null,
      });
    }
  }
  items.sort((a, b) => a.start - b.start || a.row.path.localeCompare(b.row.path));
  let { y, m } = shownMonth(ctx);
  const monday = view["weekStartDay"] === "monday";

  const head = h("header", "base-cal-head");
  const title = h("h3", "base-cal-title");
  title.setAttribute("aria-live", "polite");
  const prev = h("button", "base-tool");
  prev.type = "button";
  prev.append(icon("chevronLeft"));
  prev.setAttribute("aria-label", s.previous);
  const next = h("button", "base-tool");
  next.type = "button";
  next.append(icon("chevron"));
  next.setAttribute("aria-label", s.next);
  const today = h("button", "base-tool base-cal-today", s.today);
  today.type = "button";
  head.append(prev, title, next, today);
  const grid = h("div", "base-cal-grid");
  grid.setAttribute("role", "grid");
  wrap.append(head, grid);

  const move = async (item: Item, days: number): Promise<void> => {
    if (!startKey || !item.row.note) {
      host.status(item.row.note ? s.cantMove : s.onlyNotes);
      return;
    }
    const shift = (ms: number, time: boolean): PropertyValue => ({ kind: "text", value: time ? isoDateTime(ms + days * DAY) : isoDay(ms + days * DAY) });
    let ok = await host.setProperty(item.row.path, startKey, shift(item.start, item.time));
    if (ok && endKey && item.endTime !== null) ok = await host.setProperty(item.row.path, endKey, shift(item.end, item.endTime));
    if (ok) host.status(s.dateSet(titleOf(ctx, item.row), new Intl.DateTimeFormat(host.locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(item.start + days * DAY))));
    ctx.refresh();
  };

  const draw = () => {
    keepMonth(ctx, y, m);
    title.textContent = `${s.months[m] ?? ""} ${y}`;
    grid.replaceChildren();
    const names = monday ? [...s.weekdaysShort.slice(1), s.weekdaysShort[0] ?? ""] : s.weekdaysShort;
    const headRow = h("div", "base-cal-row base-cal-names");
    headRow.setAttribute("role", "row");
    for (const n of names) {
      const c = h("div", "base-cal-name", n);
      c.setAttribute("role", "columnheader");
      headRow.append(c);
    }
    grid.append(headRow);
    const first = Date.UTC(y, m, 1);
    const firstDow = new Date(first).getUTCDay();
    const lead = (firstDow - (monday ? 1 : 0) + 7) % 7;
    const gridStart = first - lead * DAY;
    const now = new Date();
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    for (let w = 0; w < 6; w++) {
      const row = h("div", "base-cal-row");
      row.setAttribute("role", "row");
      for (let d = 0; d < 7; d++) {
        const day = gridStart + (w * 7 + d) * DAY;
        const date = new Date(day);
        const cell = h("div", "base-cal-day");
        cell.setAttribute("role", "gridcell");
        cell.dataset["drop"] = String(day);
        if (date.getUTCMonth() !== m) cell.classList.add("outside");
        if (day === todayMs) cell.classList.add("today");
        const label = new Intl.DateTimeFormat(host.locale, { dateStyle: "full", timeZone: "UTC" }).format(date);
        cell.setAttribute("aria-label", label);
        const top = h("div", "base-cal-day-top");
        top.append(h("span", "base-cal-num", String(date.getUTCDate())));
        if (startKey) {
          const plus = h("button", "base-tool base-cal-add");
          plus.type = "button";
          plus.append(icon("plus"));
          plus.setAttribute("aria-label", s.newNoteOn(label));
          plus.title = s.newNoteOn(label);
          plus.addEventListener("click", () => ctx.newNote([[startKey, { kind: "text", value: isoDay(day) }]]));
          top.append(plus);
        }
        cell.append(top);
        const here = items.filter((it) => dayStart(it.start) <= day && dayStart(it.end) >= day);
        const list = h("ul", "base-cal-items");
        const limit = 4;
        here.slice(0, here.length > limit ? limit - 1 : limit).forEach((it) => list.append(itemEl(it, day)));
        if (here.length > limit) {
          const li = h("li");
          const more = h("button", "base-cal-more", s.moreItems(here.length - (limit - 1)));
          more.type = "button";
          more.addEventListener("click", () => {
            const r = more.getBoundingClientRect();
            host.menu(r.left, r.bottom + 2, here.map((it) => [titleOf(ctx, it.row), () => host.open(it.row.path, false)] as [string, () => void]));
          });
          li.append(more);
          list.append(li);
        }
        cell.append(list);
        row.append(cell);
      }
      grid.append(row);
    }
  };

  const itemEl = (it: Item, day: number): HTMLLIElement => {
    const li = h("li");
    const a = h("a", "base-cal-item", titleOf(ctx, it.row));
    a.href = "#";
    // Dragged by the pointer (drag.ts), never as a link.
    a.draggable = false;
    if (it.time && dayStart(it.start) === day) {
      const t = new Date(it.start);
      a.prepend(h("span", "base-cal-time", `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")} `));
    }
    if (dayStart(it.start) !== dayStart(it.end)) a.classList.add("span");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      host.open(it.row.path, e.metaKey || e.ctrlKey);
    });
    if (startKey && it.row.note) {
      li.classList.add("movable");
      draggable(li, {
        label: () => titleOf(ctx, it.row),
        drop: (zone) => {
          const to = zone ? Number(zone.dataset["drop"]) : Number.NaN;
          if (!Number.isNaN(to) && to !== day) void move(it, Math.round((to - day) / DAY));
        },
      });
      a.title = `${titleOf(ctx, it.row)} — Alt + ←/→ ±1, Alt + ↑/↓ ±7`;
      a.addEventListener("keydown", (e) => {
        if (!e.altKey) return;
        const days = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
        if (days === 0) return;
        e.preventDefault();
        void move(it, days);
      });
    }
    li.append(a);
    return li;
  };

  prev.addEventListener("click", () => {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    draw();
  });
  next.addEventListener("click", () => {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    draw();
  });
  today.addEventListener("click", () => {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
    draw();
  });
  draw();
  return wrap;
}
