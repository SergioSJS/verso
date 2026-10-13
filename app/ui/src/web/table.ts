// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The console's table (ADR 0077 item 4): the server searches, sorts and
// pages; the table asks for one page at a time. Sorting is a button in
// each sortable header, with aria-sort; a row that opens a page is a
// link in its first cell, so the keyboard and a screen reader reach it.

import { cw } from "./consoleStrings";
import { el } from "./form";

export type Page<T> = { rows: T[]; total: number; next: number | null };
export type Column<T> = { key: string; label: string; sort?: string; cell: (row: T) => Node | string; numeric?: boolean };
export type Ask = { q: string; sort: string; desc: boolean; offset: number };

export type Table<T> = { el: HTMLElement; reload: () => Promise<void> };

export function table<T>(opts: {
  caption: string;
  columns: Column<T>[];
  fetch: (ask: Ask) => Promise<Page<T>>;
  search?: string;
  sort?: string;
  desc?: boolean;
  link?: (row: T) => string;
  go?: (href: string) => void;
  tools?: Node[];
}): Table<T> {
  const s = cw();
  const ask: Ask = { q: "", sort: opts.sort ?? "", desc: opts.desc ?? false, offset: 0 };
  const body = el("tbody");
  const head = el("tr");
  const status = el("p", { class: "console-table-status", role: "status" });
  const prev = el("button", { type: "button", class: "ghost web-ghost" }, s.previous);
  const next = el("button", { type: "button", class: "ghost web-ghost" }, s.next);
  const range = el("span", { class: "console-range" });
  let last: Page<T> = { rows: [], total: 0, next: null };

  const paintHead = () => {
    head.replaceChildren(
      ...opts.columns.map((c) => {
        const th = el("th", { scope: "col", class: c.numeric ? "num" : "" });
        if (!c.sort) {
          th.textContent = c.label;
          return th;
        }
        const on = ask.sort === c.sort;
        th.setAttribute("aria-sort", on ? (ask.desc ? "descending" : "ascending") : "none");
        const b = el("button", { type: "button", class: "console-sort", "aria-label": s.sortBy(c.label) }, c.label, el("span", { class: "console-sort-mark", "aria-hidden": "true" }, on ? (ask.desc ? "↓" : "↑") : ""));
        b.addEventListener("click", () => {
          ask.desc = on ? !ask.desc : false;
          ask.sort = c.sort ?? "";
          ask.offset = 0;
          void reload();
        });
        th.append(b);
        return th;
      }),
    );
  };

  const reload = async () => {
    paintHead();
    status.textContent = s.loading;
    try {
      last = await opts.fetch(ask);
    } catch {
      status.textContent = s.failed;
      return;
    }
    body.replaceChildren(
      ...last.rows.map((row) => {
        const tr = el("tr");
        opts.columns.forEach((c, i) => {
          const value = c.cell(row);
          const td = el("td", { class: c.numeric ? "num" : "" });
          if (i === 0 && opts.link) {
            const href = opts.link(row);
            const a = el("a", { href }, value);
            a.addEventListener("click", (e) => {
              if (!opts.go || e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              opts.go(href);
            });
            td.append(a);
          } else {
            td.append(value);
          }
          tr.append(td);
        });
        return tr;
      }),
    );
    const shown = last.rows.length;
    status.textContent = shown === 0 ? s.nothing : "";
    range.textContent = shown === 0 ? "" : s.range(ask.offset + 1, ask.offset + shown, last.total);
    prev.disabled = ask.offset === 0;
    next.disabled = last.next === null;
  };

  prev.addEventListener("click", () => {
    ask.offset = Math.max(0, ask.offset - 50);
    void reload();
  });
  next.addEventListener("click", () => {
    if (last.next !== null) {
      ask.offset = last.next;
      void reload();
    }
  });

  const top = el("div", { class: "console-table-top" });
  if (opts.search !== undefined) {
    const search = el("input", { type: "search", class: "console-search", placeholder: opts.search, "aria-label": opts.search });
    let timer = 0;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        ask.q = search.value;
        ask.offset = 0;
        void reload();
      }, 250);
    });
    search.addEventListener("keydown", (e) => e.stopPropagation());
    top.append(search);
  }
  if (opts.tools) top.append(el("div", { class: "console-table-tools" }, ...opts.tools));
  const t = el("table", { class: "web-table console-table" }, el("caption", { class: "sr-only" }, opts.caption), el("thead", {}, head), body);
  const wrap = el(
    "div",
    { class: "console-table-box" },
    top,
    el("div", { class: "web-table-wrap" }, t),
    status,
    el("div", { class: "console-pager" }, range, prev, next),
  );
  void reload();
  return { el: wrap, reload };
}
