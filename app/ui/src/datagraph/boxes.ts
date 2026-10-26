// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// One box of the diagram as HTML (ADR 0106 item 4): a title bar to drag,
// the folded count or the rows, a button for the rest. Every key and value
// is set as text (`textContent`), never as HTML, whatever the file holds.

import { h } from "../dom";
import { icon } from "../icons";
import { clip, isCut } from "./layout";
import { type DNode, type Tree } from "./model";
import { type DiagramModel } from "./state";
import { dgw } from "./words";

/** A key or a name as long as a file can make it is cut for the page (the whole of it is the title). */
function cut(text: string): string {
  return text.length > 120 ? text.slice(0, 119) + "…" : text;
}

/** What a box is called in its title bar: `$`, `#2`, a key, or `[3]`. */
export function titleOf(tree: Tree, n: DNode): string {
  if (n.parent < 0) return tree.roots.length > 1 ? `#${tree.roots.indexOf(n.id) + 1}` : "$";
  const parent = tree.nodes[n.parent]!;
  return parent.shape === "array" ? `[${n.label}]` : n.label;
}

export type BoxMarks = {
  /** Rows that matched the search, and the one that is current. */
  hits: ReadonlySet<number> | undefined;
  current: number;
  /** The row the caret in the text is in, or -1. */
  caret: number;
  selectedRow: number;
};

/** A box's element, drawn from the model as it stands. */
export function buildBox(model: DiagramModel, id: number, rowsShown: number, marks: BoxMarks): HTMLElement {
  const tree = model.tree;
  const n = tree.nodes[id]!;
  const folded = model.folded[id] === 1;
  const foldable = model.isFoldable(id);
  const box = h("div", "dg-box");
  box.dataset["id"] = String(id);
  box.setAttribute("role", "treeitem");
  box.setAttribute("aria-level", String(n.depth + 1));
  if (foldable) box.setAttribute("aria-expanded", String(!folded));
  box.tabIndex = -1;

  const head = h("div", "dg-head");
  head.dataset["part"] = "head";
  if (foldable) {
    const fold = h("button", folded ? "dg-fold" : "dg-fold open");
    fold.type = "button";
    fold.tabIndex = -1;
    fold.dataset["part"] = "fold";
    fold.title = folded ? dgw.unfold : dgw.fold;
    fold.setAttribute("aria-label", folded ? dgw.unfold : dgw.fold);
    fold.append(icon("chevron"));
    head.append(fold);
  }
  const title = titleOf(tree, n);
  const name = h("span", "dg-name", cut(title));
  if (name.textContent !== title) name.title = title;
  head.append(name);
  if (n.anchor) head.append(h("span", "dg-badge", `&${n.anchor}`));
  if (n.tag) head.append(h("span", "dg-badge", n.tag));
  head.append(h("span", "dg-count", n.rows.length === 0 ? dgw.emptyBox : dgw.members(n.shape, n.rows.length)));
  box.append(head);

  if (!folded && rowsShown > 0) {
    const body = h("div", "dg-rows");
    for (let i = 0; i < rowsShown; i++) body.append(buildRow(n, i, marks));
    if (rowsShown < n.rows.length) {
      const more = h("button", "dg-more", dgw.showMore(n.rows.length - rowsShown));
      more.type = "button";
      more.tabIndex = -1;
      more.dataset["part"] = "more";
      body.append(more);
    }
    box.append(body);
  }
  return box;
}

function buildRow(n: DNode, i: number, marks: BoxMarks): HTMLElement {
  const r = n.rows[i]!;
  const row = h("div", `dg-row dg-t-${r.type}`);
  row.dataset["row"] = String(i);
  if (marks.hits?.has(i)) row.classList.add("dg-hit");
  if (marks.current === i) row.classList.add("dg-current");
  if (marks.caret === i) row.classList.add("dg-caret");
  if (marks.selectedRow === i) row.classList.add("dg-selrow");
  const key = r.key === "" ? "" : n.shape === "array" ? `[${r.key}]` : r.key;
  if (key !== "") {
    const k = h("span", "dg-key", cut(key));
    if (k.textContent !== key) k.title = key;
    row.append(k);
  }
  // A parser's message in a JSON Lines error row is told in the window's language.
  const val = h("span", "dg-val", r.child >= 0 ? r.text : clip(r.type === "error" ? dgw.parseError(r.text) : r.text));
  row.append(val);
  if (r.tag) row.append(h("span", "dg-badge", r.tag));
  if (r.link >= 0) {
    const a = h("span", "dg-alias", "↗");
    a.setAttribute("aria-hidden", "true");
    row.append(a);
  }
  if (r.child < 0 && isCut(r.text)) {
    const cut = h("button", "dg-cut", "…");
    cut.type = "button";
    cut.tabIndex = -1;
    cut.dataset["part"] = "cut";
    cut.title = dgw.showAll;
    cut.setAttribute("aria-label", `${dgw.showAll}: ${key || n.label}`);
    row.append(cut);
  }
  return row;
}
