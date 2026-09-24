// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The cards layout, and the card itself — which the kanban uses too: a
// cover image when the view names one (`image`, `imageFit`,
// `imageAspectRatio`, as Obsidian's cards keep them), the first property
// as the title, the others under it.

import type { BaseCell, BaseRow } from "../bindings";
import { cellText, columnLabel, h, renderCell } from "./cells";
import type { RenderCtx } from "./view";

/** The row's title: the first column's text, a file's name without its
 *  `.md`. */
export function titleOf(ctx: RenderCtx, row: BaseRow): string {
  const first = ctx.result.columns[0];
  const text = cellText(row.cells[0] ?? null, ctx.host);
  if (!first || text === "") return (row.path.split("/").pop() ?? row.path).replace(/\.md$/i, "");
  return first.id.startsWith("file.") ? text.replace(/\.md$/i, "") : text;
}

/** The index of the column holding `id`, if the result has it. */
export function columnOf(ctx: RenderCtx, id: string): number {
  const bare = (x: string) => (x.startsWith("note.") ? x.slice(5) : x);
  return ctx.result.columns.findIndex((c) => bare(c.id) === bare(id));
}

export function card(ctx: RenderCtx, row: BaseRow, skip: Set<number> = new Set()): HTMLElement {
  const { view, host } = ctx;
  const el = h("article", "base-card");
  const imageId = typeof view["image"] === "string" ? (view["image"] as string) : "";
  const imageCol = imageId ? columnOf(ctx, imageId) : -1;
  if (imageCol >= 0) {
    const cell: BaseCell | null = row.cells[imageCol] ?? null;
    const src = cell && (cell.kind === "image" || cell.kind === "text" || cell.kind === "file") ? cell.value : cell && cell.kind === "link" ? cell.value.path ?? cell.value.target : "";
    if (src) {
      const cover = h("div", "base-cover");
      const ratio = typeof view["imageAspectRatio"] === "number" ? (view["imageAspectRatio"] as number) : 0.5;
      cover.style.aspectRatio = String(1 / Math.min(Math.max(ratio, 0.25), 2.5));
      cover.dataset["fit"] = view["imageFit"] === "contain" ? "contain" : "cover";
      cover.append(renderCell({ kind: "image", value: src }, host, row.path));
      el.append(cover);
    }
  }
  const title = h("a", "base-card-title", titleOf(ctx, row));
  title.href = "#";
  title.addEventListener("click", (e) => {
    e.preventDefault();
    host.open(row.path, e.metaKey || e.ctrlKey);
  });
  el.append(title);
  const props = h("dl", "base-card-props");
  ctx.result.columns.forEach((c, k) => {
    if (k === 0 || k === imageCol || skip.has(k)) return;
    const cell = row.cells[k] ?? null;
    if (!cell || cell.kind === "empty") return;
    props.append(h("dt", "", columnLabel(c, ctx.s)));
    const dd = h("dd");
    dd.append(renderCell(cell, host, row.path));
    props.append(dd);
  });
  if (props.childElementCount > 0) el.append(props);
  return el;
}

export function renderCards(ctx: RenderCtx): HTMLElement {
  const wrap = h("div", "base-cards-wrap");
  const size = typeof ctx.view["cardSize"] === "number" ? (ctx.view["cardSize"] as number) : 220;
  wrap.style.setProperty("--card-w", `${Math.min(Math.max(size, 120), 600)}px`);
  const grouped = ctx.groups.some((g) => g.key !== null);
  let any = false;
  for (const g of ctx.groups) {
    if (grouped) {
      const head = h("h3", "base-group-head", g.key && g.key.kind !== "empty" ? cellText(g.key, ctx.host) : ctx.s.noneColumn);
      head.append(h("span", "base-group-count", String(g.rows.length)));
      wrap.append(head);
    }
    const grid = h("ul", "base-cards");
    for (const row of g.rows) {
      const li = h("li");
      li.append(card(ctx, row));
      grid.append(li);
      any = true;
    }
    wrap.append(grid);
  }
  if (!any) wrap.append(h("p", "base-empty", ctx.s.emptyView));
  return wrap;
}
