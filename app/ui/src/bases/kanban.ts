// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The kanban layout, as Obsidian 1.14 documents its own ("Kanban view"):
// one column per value of the view's `groupBy` property, notes without a
// value in "None", a card dragged to another column writes that value
// into its note — Markdown notes only, and never into a formula or a
// file field — and "+" makes a note holding the column's value. The
// columns' order a person drags into is kept in the view's own `verso:`
// mapping: Obsidian writes no documented key for it (ADR 0053). A card's
// menu moves it from the keyboard.

import type { BaseCell, BaseGroup, BaseRow, PropertyValue } from "../bindings";
import { icon } from "../icons";
import { cellText, h, isoDateTime, isoDay, noteKey } from "./cells";
import { card, titleOf } from "./cards";
import { draggable } from "./drag";
import { bareId, type RenderCtx } from "./view";
import * as Y from "./yaml";

/** A column's value as written, the key its order is kept by. */
function raw(c: BaseCell | null): string {
  if (!c) return "";
  switch (c.kind) {
    case "empty":
      return "";
    case "text":
      return c.value;
    case "number":
      return c.value === null ? "" : String(c.value);
    case "bool":
      return String(c.value);
    case "date":
      return c.value.ms === null ? "" : c.value.time ? isoDateTime(c.value.ms) : isoDay(c.value.ms);
    default:
      return JSON.stringify(c);
  }
}

/** The value a card moved into a column gives its note; null when the
 *  column's value is not one a property can be set to from here. */
function valueFor(c: BaseCell | null): PropertyValue | null {
  if (!c || c.kind === "empty") return { kind: "empty" };
  switch (c.kind) {
    case "text":
      return { kind: "text", value: c.value };
    case "number":
      return c.value === null ? null : { kind: "number", value: String(c.value) };
    case "bool":
      return { kind: "checkbox", value: c.value };
    case "date":
      return c.value.ms === null ? null : { kind: "text", value: c.value.time ? isoDateTime(c.value.ms) : isoDay(c.value.ms) };
    default:
      return null;
  }
}

type Column = { key: BaseCell | null; raw: string; rows: BaseRow[] };

/** The columns a board showed while it is open, by base, view and
 *  property: a column whose last card moved out stays while the window
 *  is open, so that the card can come back to it. Kept here, never
 *  written into the base. */
const seen = new Map<string, Map<string, BaseCell | null>>();

export function renderKanban(ctx: RenderCtx): HTMLElement {
  const { s, view, host } = ctx;
  const wrap = h("div", "base-kanban-wrap");
  const g = view["groupBy"] as { property?: unknown } | undefined;
  const property = g && typeof g.property === "string" ? g.property : "";
  if (!property) {
    wrap.append(h("p", "base-hint", s.chooseGroup));
    return wrap;
  }
  const key = noteKey(property);
  const own = (view["verso"] && typeof view["verso"] === "object" ? (view["verso"] as Record<string, unknown>) : {}) ?? {};
  const order = Array.isArray(own["columnOrder"]) ? (own["columnOrder"] as unknown[]).map(String) : [];
  // The groups as columns; the ones the order names with no card yet stay.
  const byRaw = new Map<string, Column>();
  const none: Column = { key: { kind: "empty" }, raw: "", rows: [] };
  for (const grp of ctx.groups as BaseGroup[]) {
    const r = raw(grp.key);
    if (r === "") {
      none.rows.push(...grp.rows);
      continue;
    }
    byRaw.set(r, { key: grp.key, raw: r, rows: grp.rows });
  }
  const mineKey = `${ctx.key}\u0000${view.name}\u0000${property}`;
  const mine = seen.get(mineKey) ?? new Map<string, BaseCell | null>();
  seen.set(mineKey, mine);
  // A column the order names with no card: its value as last seen, or of
  // the kind the other columns are — a number among numbers — so that a
  // card moved to it writes a number, not a text.
  const keys = [...byRaw.values()].map((c) => c.key);
  const all = (kind: string) => keys.length > 0 && keys.every((k) => k?.kind === kind);
  const typed = (r: string): BaseCell => {
    const known = mine.get(r);
    if (known) return known;
    if (all("number") && r.trim() !== "" && !Number.isNaN(Number(r))) return { kind: "number", value: Number(r) };
    if (all("bool") && (r === "true" || r === "false")) return { kind: "bool", value: r === "true" };
    return { kind: "text", value: r };
  };
  const columns: Column[] = [];
  for (const r of order) {
    const found = byRaw.get(r);
    if (found) {
      columns.push(found);
      byRaw.delete(r);
    } else if (r !== "") {
      columns.push({ key: typed(r), raw: r, rows: [] });
    }
  }
  columns.push(...byRaw.values());
  for (const c of columns) if (c.rows.length > 0) mine.set(c.raw, c.key);
  for (const [r, key] of mine) if (!columns.some((c) => c.raw === r)) columns.push({ key, raw: r, rows: [] });
  columns.push(none);
  // The column the group-by property's own column shows on cards: left out,
  // the column already says it.
  const skip = new Set<number>();
  ctx.result.columns.forEach((c, k) => {
    if (k > 0 && bareId(c.id) === bareId(property)) skip.add(k);
  });

  const move = async (row: BaseRow, to: Column): Promise<void> => {
    if (!key) {
      host.status(s.cantMove);
      return;
    }
    if (!row.note) {
      host.status(s.onlyNotes);
      return;
    }
    const value = valueFor(to.key);
    if (value === null) {
      host.status(s.cantMoveList);
      return;
    }
    const ok = await host.setProperty(row.path, key, value);
    if (ok) host.status(s.moved(titleOf(ctx, row), to.raw === "" ? s.noneColumn : cellText(to.key, host)));
    ctx.refresh();
  };
  const reorder = (from: string, before: string | null) => {
    if (!ctx.change) return;
    // The columns with cards and the ones the base already names: one
    // only remembered is not written into it.
    const names = columns
      .filter((c) => c.raw !== "" && (c.rows.length > 0 || order.includes(c.raw)))
      .map((c) => c.raw)
      .filter((r) => r !== from);
    const at = before === null ? names.length : Math.max(0, names.indexOf(before));
    names.splice(at, 0, from);
    ctx.change((t, i) => Y.setVersoKey(t, i, "columnOrder", names));
  };

  const board = h("div", "base-kanban");
  board.setAttribute("role", "list");
  columns.forEach((col, index) => {
    const colEl = h("section", "base-column");
    colEl.setAttribute("role", "listitem");
    colEl.dataset["drop"] = String(index);
    const label = col.raw === "" ? s.noneColumn : cellText(col.key, host);
    const head = h("header", "base-column-head");
    const title = h("h3", "", label);
    title.id = `base-col-${Math.random().toString(36).slice(2, 9)}`;
    colEl.setAttribute("aria-labelledby", title.id);
    head.append(title, h("span", "base-group-count", String(col.rows.length)));
    if (key) {
      const plus = h("button", "base-tool");
      plus.type = "button";
      plus.append(icon("plus"));
      plus.title = s.newIn(label);
      plus.setAttribute("aria-label", s.newIn(label));
      plus.addEventListener("click", () => {
        const v = valueFor(col.key);
        ctx.newNote(v && v.kind !== "empty" ? [[key, v]] : []);
      });
      head.append(plus);
    }
    if (ctx.change && col.raw !== "") {
      head.classList.add("movable");
      draggable(head, {
        label: () => label,
        drop: (zone) => {
          const to = zone ? columns[Number(zone.dataset["drop"])] : undefined;
          if (to && to !== col) reorder(col.raw, to.raw === "" ? null : to.raw);
        },
      });
    }
    colEl.append(head);
    const list = h("ul", "base-column-cards");
    for (const row of col.rows) {
      const li = h("li");
      const c = card(ctx, row, skip);
      if (key && row.note) {
        c.classList.add("movable");
        draggable(c, {
          label: () => titleOf(ctx, row),
          drop: (zone) => {
            const to = zone ? columns[Number(zone.dataset["drop"])] : undefined;
            if (to && to !== col) void move(row, to);
          },
        });
        // From the keyboard: the card's menu moves it.
        const more = h("button", "base-tool base-card-more");
        more.type = "button";
        more.append(icon("more"));
        more.title = s.moveTo;
        more.setAttribute("aria-label", `${s.moveTo}… (${titleOf(ctx, row)})`);
        more.setAttribute("aria-haspopup", "menu");
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          const r = more.getBoundingClientRect();
          host.menu(
            r.left,
            r.bottom + 2,
            columns.filter((x) => x !== col).map((x) => [s.moveCard(x.raw === "" ? s.noneColumn : cellText(x.key, host)), () => void move(row, x)] as [string, () => void]),
          );
        });
        c.append(more);
      }
      li.append(c);
      list.append(li);
    }
    colEl.append(list);
    board.append(colEl);
  });
  if (ctx.change && key) {
    // A column with no card yet, for cards to be dragged into.
    const add = h("form", "base-column base-column-new");
    const input = h("input");
    input.type = "text";
    input.placeholder = `+ ${s.newColumn}`;
    input.setAttribute("aria-label", s.newColumn);
    add.append(input);
    add.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || columns.some((c) => c.raw === v)) return;
      const names = [...columns.filter((c) => c.raw !== "").map((c) => c.raw), v];
      ctx.change?.((t, i) => Y.setVersoKey(t, i, "columnOrder", names));
    });
    board.append(add);
  }
  wrap.append(board);
  return wrap;
}
