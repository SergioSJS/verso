// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout's block tree (ADR 0099 item 8): one row per block, nested
// blocks under their container, a conditional's branches as rows of their
// own; the selected block's options open right under its row, never in a
// dialog. A `role="tree"` the keyboard walks — the arrows choose, Alt and
// the arrows move, Delete deletes, Ctrl+D duplicates — and a drag by the
// row's grip with pointer events (HTML5 drag and drop does nothing in
// WKWebView). While dragging nothing moves: a line shows where the block
// will go, so the rows never jump under the pointer.

import { icon } from "../../icons";
import { h } from "../h";
import type { Block, Layout } from "../model";
import { word } from "../strings";
import { duplicate, findBlock, indent, isContainer, moveBy, moveTo, outdent, placeOf, removeBlock, walk, type Place } from "./state";
import { E } from "./strings";

/** What the tree needs of the editor. */
export interface TreeHost {
  layout(): Layout;
  selected(): string | null;
  /** Choose a row (a block id, or `id#branch`); `focus` moves the focus to it. */
  select(id: string | null, focus?: boolean): void;
  /** A change of the tree, as one undoable step; `said` is announced. */
  change(next: Layout | null, said: string, select?: string | null): void;
  /** The selected block's options, drawn under its row. */
  options(id: string): HTMLElement;
  /** Rows folded away (not undoable). */
  folded: Set<string>;
  say(text: string): void;
}

type Row = { id: string; block: Block | null; branch: number | null; depth: number; parent: string | null; hasKids: boolean };

/** A block in a word: its type, and its label or keys. */
export function blockName(b: Block): string {
  const t = E().types[b.type][0];
  const what = word(b.label) || b.properties.slice(0, 3).join(", ");
  return what ? `${t} · ${what}` : t;
}

function branchName(b: Block, i: number): string {
  if (b.type !== "conditional") return "";
  const br = b.branches[i];
  if (!br?.when) return E().otherwise;
  const w = br.when;
  const op = w.op === "has" ? "∃" : w.op === "equals" ? "=" : ">";
  return `${E().branch(i + 1)}: ${br.not ? "¬ " : ""}${w.key} ${op}${w.op === "has" ? "" : ` ${String(w.value)}`}`;
}

/** The rows the tree shows, in order, folded ones' children left out. */
export function rowsOf(layout: Layout, folded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const hidden = new Set<string>();
  walk(layout, (b, place, depth) => {
    const parentRow = place.slot.parent === null ? null : place.slot.branch === undefined ? place.slot.parent : `${place.slot.parent}#${place.slot.branch}`;
    if (place.slot.parent !== null && (hidden.has(place.slot.parent) || (parentRow && hidden.has(parentRow)))) {
      hidden.add(b.id);
      return;
    }
    const kids = isContainer(b) ? b.nested.length > 0 : b.type === "conditional";
    rows.push({ id: b.id, block: b, branch: null, depth, parent: parentRow, hasKids: kids });
    if (folded.has(b.id)) hidden.add(b.id);
    if (b.type === "conditional" && !folded.has(b.id)) {
      b.branches.forEach((br, i) => {
        const id = `${b.id}#${i}`;
        rows.push({ id, block: b, branch: i, depth: depth + 1, parent: b.id, hasKids: br.nested.length > 0 });
        if (folded.has(id)) hidden.add(id);
      });
    }
  });
  return rows;
}

/** Where a drop on `row` puts the block: before or after it, or inside it
 *  (a container or a branch, the pointer on its middle). */
function dropPlace(layout: Layout, row: Row, zone: "before" | "after" | "inside"): Place | null {
  if (row.branch !== null && row.block?.type === "conditional") {
    const br = row.block.branches[row.branch];
    return br ? { slot: { parent: row.block.id, branch: row.branch }, index: zone === "before" ? 0 : br.nested.length } : null;
  }
  if (!row.block) return null;
  if (zone === "inside" && isContainer(row.block)) return { slot: { parent: row.block.id }, index: row.block.nested.length };
  const at = placeOf(layout, row.block.id);
  if (!at) return null;
  return { slot: at.slot, index: zone === "after" ? at.index + 1 : at.index };
}

/** The key a tree row handles: a move, a choice, a deletion. */
export function treeKey(host: TreeHost, rows: Row[], id: string, e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  const layout = host.layout();
  const i = rows.findIndex((r) => r.id === id);
  const row = rows[i];
  if (!row) return false;
  const name = row.block ? (row.branch === null ? blockName(row.block) : branchName(row.block, row.branch)) : "";
  const isBlock = row.branch === null && row.block !== null;
  if (e.altKey && isBlock) {
    const moves: Record<string, () => Layout | null> = {
      ArrowUp: () => moveBy(layout, id, -1),
      ArrowDown: () => moveBy(layout, id, 1),
      ArrowRight: () => indent(layout, id),
      ArrowLeft: () => outdent(layout, id),
    };
    const f = moves[e.key];
    if (!f) return false;
    const next = f();
    if (next) host.change(next, E().moved(name), id);
    else host.say(E().cantMove);
    return true;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && isBlock) {
    const d = duplicate(layout, id);
    if (d) host.change(d.layout, E().duplicated(name), d.id);
    return true;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && isBlock) {
    const next = removeBlock(layout, id);
    const after = rows[i + 1]?.id ?? rows[i - 1]?.id ?? null;
    host.change(next, E().removed(name), after === id ? null : after);
    return true;
  }
  const go = (to: Row | undefined) => {
    if (to) host.select(to.id, true);
  };
  switch (e.key) {
    case "ArrowDown":
      go(rows[i + 1]);
      return true;
    case "ArrowUp":
      go(rows[i - 1]);
      return true;
    case "Home":
      go(rows[0]);
      return true;
    case "End":
      go(rows[rows.length - 1]);
      return true;
    case "ArrowRight":
      if (row.hasKids && host.folded.has(id)) {
        host.folded.delete(id);
        host.select(id, true);
      } else if (row.hasKids) go(rows[i + 1]);
      return true;
    case "ArrowLeft":
      if (row.hasKids && !host.folded.has(id)) {
        host.folded.add(id);
        host.select(id, true);
      } else go(rows.find((r) => r.id === row.parent));
      return true;
  }
  return false;
}

/** Draw the tree into `root`. */
export function renderTree(root: HTMLElement, host: TreeHost): void {
  const layout = host.layout();
  const rows = rowsOf(layout, host.folded);
  const selected = host.selected();
  const tree = h("div", "sbe-tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", E().treeLabel);
  const hint = h("p", "sr-only", E().treeKeys);
  hint.id = "sbe-tree-keys";
  tree.setAttribute("aria-describedby", hint.id);
  if (rows.length === 0) tree.append(h("p", "sbe-empty", E().empty));
  const focusId = selected && rows.some((r) => r.id === selected) ? selected : (rows[0]?.id ?? null);

  for (const row of rows) {
    const item = h("div", "sbe-row");
    item.dataset["row"] = row.id;
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", String(row.depth + 1));
    item.setAttribute("aria-selected", String(row.id === selected));
    if (row.hasKids) item.setAttribute("aria-expanded", String(!host.folded.has(row.id)));
    item.tabIndex = row.id === focusId ? 0 : -1;
    item.style.setProperty("--sbe-depth", String(row.depth));
    if (row.branch !== null) item.classList.add("sbe-branch");
    const name = row.block ? (row.branch === null ? blockName(row.block) : branchName(row.block, row.branch)) : "";
    item.setAttribute("aria-label", name);

    if (row.branch === null) {
      const grip = h("span", "sbe-grip");
      grip.setAttribute("aria-hidden", "true");
      grip.title = E().drag;
      grip.append(icon("grip"));
      grip.addEventListener("pointerdown", (e) => startDrag(e, row, item, tree, rows, host));
      item.append(grip);
    }
    if (row.hasKids) {
      const fold = h("button", "sbe-fold");
      fold.type = "button";
      fold.tabIndex = -1;
      fold.setAttribute("aria-hidden", "true");
      fold.append(icon(host.folded.has(row.id) ? "chevron" : "chevronDown"));
      fold.addEventListener("click", (e) => {
        e.stopPropagation();
        if (host.folded.has(row.id)) host.folded.delete(row.id);
        else host.folded.add(row.id);
        host.select(row.id, true);
      });
      item.append(fold);
    }
    item.append(h("span", "sbe-row-name", name));
    if (row.id === selected && row.branch === null && row.block) item.append(rowActions(host, row.block, name));
    item.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button, .sbe-grip")) return;
      host.select(row.id, true);
    });
    item.addEventListener("keydown", (e) => {
      if (e.target !== item) return;
      if (treeKey(host, rows, row.id, e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    tree.append(item);
    if (row.id === selected) {
      const form = host.options(row.id);
      form.setAttribute("role", "group");
      form.setAttribute("aria-label", name);
      form.style.setProperty("--sbe-depth", String(row.depth));
      tree.append(form);
    }
  }
  root.replaceChildren(tree, hint);
}

function rowActions(host: TreeHost, b: Block, name: string): HTMLElement {
  const bar = h("span", "sbe-row-actions");
  const act = (ic: string, label: string, run: () => void) => {
    const btn = h("button", "sbe-icon");
    btn.type = "button";
    btn.title = label;
    btn.setAttribute("aria-label", `${label}: ${name}`);
    btn.append(icon(ic));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    bar.append(btn);
  };
  const layout = () => host.layout();
  const move = (next: Layout | null) => (next ? host.change(next, E().moved(name), b.id) : host.say(E().cantMove));
  act("chevronUp", E().moveUp, () => move(moveBy(layout(), b.id, -1)));
  act("chevronDown", E().moveDown, () => move(moveBy(layout(), b.id, 1)));
  act("indent", E().indent, () => move(indent(layout(), b.id)));
  act("outdent", E().outdent, () => move(outdent(layout(), b.id)));
  act("copy", E().duplicate, () => {
    const d = duplicate(layout(), b.id);
    if (d) host.change(d.layout, E().duplicated(name), d.id);
  });
  act("trash", E().remove, () => host.change(removeBlock(layout(), b.id), E().removed(name), null));
  return bar;
}

/** A drag by the grip: the pointer captured, a line where the block would
 *  land, the move made on release; Escape or a release outside, nothing. */
function startDrag(e: PointerEvent, row: Row, item: HTMLElement, tree: HTMLElement, rows: Row[], host: TreeHost): void {
  if (e.button !== 0 || !row.block) return;
  e.preventDefault();
  const grip = e.currentTarget as HTMLElement;
  try {
    grip.setPointerCapture(e.pointerId);
  } catch {
    // A pointer the page cannot capture (a test): the moves still come.
  }
  item.classList.add("sbe-dragging");
  let target: { row: Row; zone: "before" | "after" | "inside"; el: HTMLElement } | null = null;
  const clear = () => {
    for (const el of tree.querySelectorAll(".sbe-drop-before, .sbe-drop-after, .sbe-drop-inside")) el.classList.remove("sbe-drop-before", "sbe-drop-after", "sbe-drop-inside");
  };
  const onMove = (ev: PointerEvent) => {
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const el = under instanceof Element ? under.closest<HTMLElement>(".sbe-row") : null;
    clear();
    target = null;
    if (!el || !tree.contains(el)) return;
    const r = rows.find((x) => x.id === el.dataset["row"]);
    if (!r || r.id === row.id) return;
    const box = el.getBoundingClientRect();
    const y = (ev.clientY - box.top) / Math.max(1, box.height);
    const holds = r.branch !== null || (r.block !== null && isContainer(r.block));
    const zone = holds && y > 0.3 && y < 0.7 ? "inside" : y < 0.5 ? "before" : "after";
    target = { row: r, zone, el };
    el.classList.add(`sbe-drop-${zone}`);
  };
  const end = (drop: boolean) => {
    grip.removeEventListener("pointermove", onMove);
    grip.removeEventListener("pointerup", onUp);
    grip.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("keydown", onKey, true);
    item.classList.remove("sbe-dragging");
    clear();
    if (!drop || !target || !row.block) return;
    const layout = host.layout();
    const place = dropPlace(layout, target.row, target.zone);
    const next = place ? moveTo(layout, row.block.id, place) : null;
    if (next) host.change(next, E().moved(blockName(row.block)), row.block.id);
    else host.say(E().cantMove);
  };
  const onUp = () => end(true);
  const onCancel = () => end(false);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    end(false);
  };
  grip.addEventListener("pointermove", onMove);
  grip.addEventListener("pointerup", onUp);
  grip.addEventListener("pointercancel", onCancel);
  document.addEventListener("keydown", onKey, true);
}

export { findBlock };
