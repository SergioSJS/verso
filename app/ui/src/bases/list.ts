// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The list layout: one item per file, the first property as the item and
// the others after it — on the same line, split by the view's
// `separator`, or indented under it (`indentProperties`); `markers`
// bullets, numbers or none, as Obsidian's list keeps them.

import { cellText, h, renderCell } from "./cells";
import { titleOf } from "./cards";
import type { RenderCtx } from "./view";

export function renderList(ctx: RenderCtx): HTMLElement {
  const { view, host } = ctx;
  const wrap = h("div", "base-list-wrap");
  const markers = view["markers"] === "number" ? "number" : view["markers"] === "none" ? "none" : "bullet";
  const separator = typeof view["separator"] === "string" ? (view["separator"] as string) : ", ";
  const indent = view["indentProperties"] === true;
  const grouped = ctx.groups.some((g) => g.key !== null);
  let any = false;
  for (const g of ctx.groups) {
    if (grouped) {
      const head = h("h3", "base-group-head", g.key && g.key.kind !== "empty" ? cellText(g.key, host) : ctx.s.noneColumn);
      head.append(h("span", "base-group-count", String(g.rows.length)));
      wrap.append(head);
    }
    const list = markers === "number" ? h("ol", "base-list") : h("ul", "base-list");
    list.dataset["markers"] = markers;
    for (const row of g.rows) {
      any = true;
      const li = h("li");
      const a = h("a", "base-file", titleOf(ctx, row));
      a.href = "#";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        host.open(row.path, e.metaKey || e.ctrlKey);
      });
      li.append(a);
      const rest = row.cells.slice(1).filter((c) => c && c.kind !== "empty");
      if (rest.length > 0) {
        if (indent) {
          const sub = h("ul", "base-list-props");
          for (const c of rest) {
            const item = h("li");
            item.append(renderCell(c, host, row.path));
            sub.append(item);
          }
          li.append(sub);
        } else {
          const span = h("span", "base-list-rest");
          rest.forEach((c, k) => {
            span.append(k === 0 ? " — " : separator);
            span.append(renderCell(c, host, row.path));
          });
          li.append(span);
        }
      }
      list.append(li);
    }
    wrap.append(list);
  }
  if (!any) wrap.append(h("p", "base-empty", ctx.s.emptyView));
  return wrap;
}
