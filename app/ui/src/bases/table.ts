// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table layout: one row per file, one column per property of the
// view's `order`. Columns widen by their edge (`columnSize`), a column's
// menu sorts, hides or summarizes it, and a note property's cell is
// edited in place — the note is written through the window's ordinary
// write, over the revision it read (invariant 11).

import type { BaseCell, BaseColumn, BaseRow, PropertyValue } from "../bindings";
import { cellText, columnLabel, h, isoDay, isoDateTime, noteKey, propertyValue, renderCell } from "./cells";
import { cellKey, shownAfterEdit } from "./edited";
import type { RenderCtx } from "./view";
import * as Y from "./yaml";

const NUMBER_SUMMARIES = ["Average", "Min", "Max", "Sum", "Range", "Median", "Stddev"];
const DATE_SUMMARIES = ["Earliest", "Latest", "Range"];
const CHECK_SUMMARIES = ["Checked", "Unchecked"];
const ANY_SUMMARIES = ["Empty", "Filled", "Unique"];

/** The summaries that fit what column `k` holds, as "Bases syntax" lists
 *  them by input type; every column gets the ones for any type. */
function summariesFor(ctx: RenderCtx, k: number): string[] {
  const kinds = new Set(ctx.result.groups.flatMap((g) => g.rows.map((r) => r.cells[k]?.kind ?? "empty")));
  const out: string[] = [];
  if (kinds.has("number")) out.push(...NUMBER_SUMMARIES);
  if (kinds.has("date")) out.push(...DATE_SUMMARIES.filter((x) => !out.includes(x)));
  if (kinds.has("bool")) out.push(...CHECK_SUMMARIES);
  out.push(...ANY_SUMMARIES);
  return out;
}

export function renderTable(ctx: RenderCtx): HTMLElement {
  const { s, result, view } = ctx;
  const wrap = h("div", "base-table-wrap");
  if (result.groups.every((g) => g.rows.length === 0) && ctx.groups.every((g) => g.rows.length === 0)) {
    wrap.append(h("p", "base-empty", s.emptyView));
  }
  const table = h("table", "base-table");
  const height = typeof view["rowHeight"] === "string" ? (view["rowHeight"] as string) : "short";
  table.dataset["height"] = height;
  // Each column keeps room for a word on a narrow screen: the table then
  // scrolls sideways in its wrap instead of breaking words letter by letter.
  table.style.setProperty("--cols", String(result.columns.length));
  const sizes = (view["columnSize"] && typeof view["columnSize"] === "object" ? (view["columnSize"] as Record<string, number>) : {}) ?? {};
  const colgroup = h("colgroup");
  const cols = result.columns.map((c) => {
    const col = h("col");
    const w = sizes[c.id];
    if (typeof w === "number" && w > 20) col.style.width = `${w}px`;
    colgroup.append(col);
    return col;
  });
  const thead = h("thead");
  const headRow = h("tr");
  result.columns.forEach((c, k) => headRow.append(header(ctx, c, k, cols[k] ?? h("col"), sizes)));
  thead.append(headRow);
  table.append(colgroup, thead);
  const grouped = ctx.groups.some((g) => g.key !== null);
  const summaryRow = (summaries: (BaseCell | null)[]): HTMLTableRowElement | null => {
    if (!summaries.some((x) => x !== null)) return null;
    const tr = h("tr", "base-summary");
    summaries.forEach((sum, k) => {
      const td = h("td");
      if (sum) {
        const name = summaryName(view, result.columns[k]?.id ?? "");
        // A summary reads at a glance: two decimals are enough.
        const text = sum.kind === "number" && sum.value !== null ? new Intl.NumberFormat(ctx.host.locale, { maximumFractionDigits: 2 }).format(sum.value) : cellText(sum, ctx.host);
        td.append(h("span", "base-summary-name", s.summaryNames[name] ?? name), " ", text);
      }
      tr.append(td);
    });
    return tr;
  };
  for (const g of ctx.groups) {
    const body = h("tbody");
    if (grouped) {
      const tr = h("tr", "base-group");
      const th = h("th");
      th.colSpan = Math.max(1, result.columns.length);
      th.scope = "rowgroup";
      const key = g.key && g.key.kind !== "empty" ? cellText(g.key, ctx.host) : s.noneColumn;
      th.append(h("span", "base-group-key", key), h("span", "base-group-count", String(g.rows.length)));
      tr.append(th);
      body.append(tr);
      const sum = summaryRow(g.summaries);
      if (sum) body.append(sum);
    }
    for (const row of g.rows) body.append(rowEl(ctx, row));
    table.append(body);
  }
  if (!grouped && ctx.groups[0]) {
    const sum = summaryRow(ctx.groups[0].summaries);
    if (sum) {
      const foot = h("tfoot");
      foot.append(sum);
      table.append(foot);
    }
  }
  wrap.append(table);
  return wrap;
}

function summaryName(view: Y.ViewConfig, id: string): string {
  const m = view["summaries"];
  if (!m || typeof m !== "object") return "";
  const bare = (x: string) => (x.startsWith("note.") ? x.slice(5) : x);
  const found = Object.entries(m as Record<string, unknown>).find(([k]) => bare(k) === bare(id));
  return found ? String(found[1]) : "";
}

function header(ctx: RenderCtx, c: BaseColumn, k: number, col: HTMLTableColElement, sizes: Record<string, number>): HTMLTableCellElement {
  const { s, view } = ctx;
  const th = h("th");
  th.scope = "col";
  const label = h("button", "base-th", columnLabel(c, s));
  label.type = "button";
  label.title = c.id;
  const menu = (x: number, y: number) => {
    if (!ctx.change) return;
    const change = ctx.change;
    const items: [string, () => void][] = [
      [`${s.sortBy}: ${s.ascending}`, () => change((t, i) => Y.setViewKey(t, i, "sort", [{ property: c.id, direction: "ASC" }]))],
      [`${s.sortBy}: ${s.descending}`, () => change((t, i) => Y.setViewKey(t, i, "sort", [{ property: c.id, direction: "DESC" }]))],
      ["—", () => {}],
      [s.remove, () => {
        const order = Array.isArray(view["order"]) ? (view["order"] as unknown[]).map(String) : ctx.result.columns.map((x) => x.id);
        change((t, i) => Y.setViewKey(t, i, "order", order.filter((x) => x !== c.id)));
      }],
      ["—", () => {}],
      [s.noSummary, () => {
        const m = { ...((view["summaries"] as Record<string, string>) ?? {}) };
        delete m[c.id];
        change((t, i) => Y.setViewKey(t, i, "summaries", Object.keys(m).length ? m : undefined));
      }],
      ...summariesFor(ctx, k).map((name) => [`${s.summarize.replace("…", "")}: ${s.summaryNames[name] ?? name}`, () => {
        const m = { ...((view["summaries"] as Record<string, string>) ?? {}), [c.id]: name };
        change((t, i) => Y.setViewKey(t, i, "summaries", m));
      }] as [string, () => void]),
    ];
    ctx.host.menu(x, y, items);
  };
  label.addEventListener("click", (e) => {
    const r = label.getBoundingClientRect();
    menu(r.left, r.bottom + 2);
    e.stopPropagation();
  });
  th.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    menu(e.clientX, e.clientY);
  });
  th.append(label);
  if (ctx.change) {
    const change = ctx.change;
    const grip = h("span", "base-col-grip");
    grip.setAttribute("aria-hidden", "true");
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = th.getBoundingClientRect().width;
      let w = w0;
      const move = (ev: PointerEvent) => {
        w = Math.max(60, Math.min(900, w0 + ev.clientX - x0));
        col.style.width = `${w}px`;
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        if (Math.round(w) !== Math.round(w0)) change((t, i) => Y.setViewKey(t, i, "columnSize", { ...sizes, [c.id]: Math.round(w) }));
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
    th.append(grip);
  }
  return th;
}

function rowEl(ctx: RenderCtx, row: BaseRow): HTMLTableRowElement {
  const tr = h("tr");
  ctx.result.columns.forEach((c, k) => {
    const key = noteKey(c.id);
    const cell = key && row.note ? shownCell(ctx, row.path, key, row.cells[k] ?? null) : (row.cells[k] ?? null);
    const td = h("td");
    if (c.id === "file.name" || c.id === "file.basename" || c.id === "file.path") {
      // A note is named without its `.md`, as the tree and the tabs name it.
      const text = cellText(cell, ctx.host) || row.path;
      const a = h("a", "base-file", row.note && c.id === "file.name" ? text.replace(/\.md$/i, "") : text);
      a.href = "#";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        ctx.host.open(row.path, e.metaKey || e.ctrlKey);
      });
      td.append(a);
    } else {
      td.append(renderCell(cell, ctx.host, row.path));
    }
    if (key && row.note) editable(ctx, td, row, key, cell);
    tr.append(td);
  });
  return tr;
}

/** What a note property's cell shows: the core's answer, or the value
 *  committed in it that the answer does not hold yet (`RenderCtx.pending`);
 *  an answer that agrees ends the wait. */
function shownCell(ctx: RenderCtx, path: string, key: string, cell: BaseCell | null): BaseCell | null {
  const k = cellKey(path, key);
  const pending = ctx.pending.get(k);
  if (!pending) return cell;
  if (cellText(cell, ctx.host) === cellText(pending, ctx.host)) {
    ctx.pending.delete(k);
    return cell;
  }
  return pending;
}

/** A note property's cell: a checkbox toggles, anything else opens a
 *  field on a double click or Enter. Lists and links are edited in the
 *  note's properties panel. */
function editable(ctx: RenderCtx, td: HTMLTableCellElement, row: BaseRow, key: string, cell: BaseCell | null): void {
  const { s, host } = ctx;
  if (cell && cell.kind === "bool") {
    const box = td.querySelector<HTMLInputElement>("input.base-check");
    if (box) {
      box.disabled = false;
      box.addEventListener("change", () => void write(ctx, row.path, key, { kind: "checkbox", value: box.checked }));
    }
    return;
  }
  if (propertyValue(cell) === null) return;
  td.tabIndex = 0;
  td.dataset.cell = cellKey(row.path, key);
  td.classList.add("base-editable");
  td.title = s.editCell;
  const open = () => {
    const input = h("input", "base-cell-input");
    if (cell?.kind === "number") input.type = "number";
    else if (cell?.kind === "date" && cell.value.ms !== null) {
      input.type = cell.value.time ? "datetime-local" : "date";
    } else input.type = "text";
    input.value =
      cell?.kind === "date" && cell.value.ms !== null
        ? cell.value.time
          ? isoDateTime(cell.value.ms).slice(0, 16)
          : isoDay(cell.value.ms)
        : cell?.kind === "number" && cell.value !== null
          ? String(cell.value)
          : cell?.kind === "text"
            ? cell.value
            : "";
    input.setAttribute("aria-label", `${key}`);
    const before = input.value;
    td.replaceChildren(input);
    input.focus();
    input.select?.();
    let done = false;
    const commit = (save: boolean) => {
      if (done) return;
      done = true;
      const v = input.value;
      if (!save || v === before) {
        td.replaceChildren(renderCell(cell, host, row.path));
        return;
      }
      const value: PropertyValue =
        v.trim() === ""
          ? { kind: "empty" }
          : input.type === "number"
            ? { kind: "number", value: v.trim() }
            : input.type === "datetime-local"
              ? { kind: "text", value: v.length === 16 ? `${v}:00` : v }
              : { kind: "text", value: v };
      // Shown at once, as typed, until the core's answer holds it: the
      // field goes with it, so nothing holds the view back.
      const shown = shownAfterEdit(input.type, v);
      ctx.pending.set(cellKey(row.path, key), shown);
      td.replaceChildren(renderCell(shown, host, row.path));
      void write(ctx, row.path, key, value);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // Committed and shown; the focus goes back to the cell, as Escape
        // leaves it, where Enter opens the field again.
        e.preventDefault();
        commit(true);
        td.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        commit(false);
        td.focus();
      }
    });
    input.addEventListener("blur", () => commit(true));
  };
  td.addEventListener("dblclick", open);
  td.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target === td) {
      e.preventDefault();
      open();
    }
  });
}

async function write(ctx: RenderCtx, path: string, key: string, value: PropertyValue): Promise<void> {
  const ok = await ctx.host.setProperty(path, key, value);
  // Refused or failed: the cell shows what the note holds again.
  if (!ok) ctx.pending.delete(cellKey(path, key));
  ctx.refresh();
}
