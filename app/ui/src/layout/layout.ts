// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { h, ui } from "../dom";
import { allFiles, allNotes } from "../folder";
import { Leaf } from "../leaves/leaf";
import { TerminalLeaf } from "../leaves/terminal";
import { terminalOn } from "../terminal/open";
import { quietPaths } from "../opening";
import { refreshFrame } from "../frame";
import { t } from "../strings";
import { allFolders } from "../tree/tree";
import { Pane } from "./pane";
import { persistSoon } from "./spaces";

/* ---------- Layout: a tree of splits ---------- */
export type Dir = "row" | "col";
export type Split = { kind: "split"; dir: Dir; children: LNode[]; el: HTMLElement };
export type PaneNode = { kind: "pane"; pane: Pane };
export type LNode = Split | PaneNode;

export class Layout {
  root: LNode = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
  focused: Pane | null = null;
  maximized: Pane | null = null;

  paneCount(): number {
    return this.panes().length;
  }
  panes(node: LNode = this.root): Pane[] {
    return node.kind === "pane" ? [node.pane] : node.children.flatMap((c) => this.panes(c));
  }
  private parentOf(target: Pane, node: LNode = this.root): Split | null {
    if (node.kind === "pane") return null;
    for (const c of node.children) {
      if (c.kind === "pane" && c.pane === target) return node;
      const deeper = this.parentOf(target, c);
      if (deeper) return deeper;
    }
    return null;
  }
  reset(): Pane {
    for (const p of this.panes()) for (const l of p.leaves.slice()) {
      l.destroy();
      p.remove(l, true);
    }
    this.root = { kind: "split", dir: "row", children: [], el: h("div", "split row") };
    const pane = new Pane();
    this.root.children.push({ kind: "pane", pane });
    this.maximized = null;
    this.render();
    this.focus(pane);
    return pane;
  }
  split(from: Pane, dir: Dir, where: "before" | "after" = "after"): Pane {
    const pane = new Pane();
    const parent = this.parentOf(from);
    const node: PaneNode = { kind: "pane", pane };
    if (!parent) return this.reset();
    const i = parent.children.findIndex((c) => c.kind === "pane" && c.pane === from);
    if (parent.dir === dir) parent.children.splice(where === "after" ? i + 1 : i, 0, node);
    else {
      const me = parent.children[i]!;
      parent.children[i] = { kind: "split", dir, children: where === "after" ? [me, node] : [node, me], el: h("div", `split ${dir}`) };
    }
    this.maximized = null;
    this.render();
    this.focus(pane);
    return pane;
  }
  remove(pane: Pane): void {
    const parent = this.parentOf(pane);
    if (!parent) return;
    const i = parent.children.findIndex((c) => c.kind === "pane" && c.pane === pane);
    parent.children.splice(i, 1);
    pane.dispose();
    this.collapse();
    if (this.maximized === pane) this.maximized = null;
    this.render();
    const left = this.panes();
    this.focus(left[Math.min(i, left.length - 1)] ?? null);
  }
  private collapse(node: LNode = this.root): void {
    if (node.kind === "pane") return;
    for (const c of node.children) this.collapse(c);
    node.children = node.children.filter((c) => c.kind === "pane" || c.children.length > 0);
    node.children = node.children.map((c) => (c.kind === "split" && c.children.length === 1 ? c.children[0]! : c));
  }
  focus(pane: Pane | null): void {
    this.focused = pane;
    const all = this.panes();
    all.forEach((p, i) => {
      p.el.classList.toggle("focused", p === pane);
      p.paintSwitch(i + 1, all.length);
    });
    // The phone's back follows the pane in front (screen/frame.ts).
    document.dispatchEvent(new Event("verso:nav"));
  }
  get activeLeaf(): Leaf | null {
    return this.focused?.active ?? null;
  }
  toggleMaximize(pane: Pane): void {
    this.maximized = this.maximized === pane ? null : pane;
    this.render();
    this.focus(pane);
  }
  render(): void {
    if (this.maximized && this.paneCount() > 1) {
      ui.panes.replaceChildren(this.maximized.el);
      ui.panes.classList.add("maximized");
    } else {
      ui.panes.classList.remove("maximized");
      ui.panes.replaceChildren(this.build(this.root));
    }
    // On a phone a split layout shows one pane at a time, and its switcher
    // (ADR 0076 item 2): kept whole, the layout comes back on a wider window.
    ui.panes.classList.toggle("many", this.paneCount() > 1);
    // New tab bars may reach the window buttons' corner (ADR 0072).
    refreshFrame();
    persistSoon();
  }
  private build(node: LNode): HTMLElement {
    if (node.kind === "pane") {
      if (!node.pane.el.style.flexGrow) node.pane.el.style.flexGrow = "1";
      return node.pane.el;
    }
    node.el.className = `split ${node.dir}`;
    const parts: HTMLElement[] = [];
    node.children.forEach((c, i) => {
      if (i > 0) parts.push(this.divider(node, i));
      const e = this.build(c);
      if (c.kind === "split" && !e.style.flexGrow) e.style.flexGrow = "1";
      parts.push(e);
    });
    node.el.replaceChildren(...parts);
    return node.el;
  }
  private elOf(node: LNode): HTMLElement {
    return node.kind === "pane" ? node.pane.el : node.el;
  }
  private divider(split: Split, i: number): HTMLElement {
    const d = h("div", `divider ${split.dir}`);
    d.setAttribute("role", "separator");
    // From the keyboard: focusable, the arrow keys move it 24 px.
    d.tabIndex = 0;
    d.setAttribute("aria-orientation", split.dir === "row" ? "vertical" : "horizontal");
    d.setAttribute("aria-label", t.resizeKeys);
    d.setAttribute("aria-valuemin", "0");
    d.setAttribute("aria-valuemax", "100");
    d.addEventListener("keydown", (e) => {
      const back = split.dir === "row" ? "ArrowLeft" : "ArrowUp";
      const on = split.dir === "row" ? "ArrowRight" : "ArrowDown";
      if (e.key !== back && e.key !== on) return;
      e.preventDefault();
      const a = split.children[i - 1];
      const b = split.children[i];
      if (!a || !b) return;
      const ea = this.elOf(a);
      const eb = this.elOf(b);
      const size = (x: HTMLElement) => (split.dir === "row" ? x.getBoundingClientRect().width : x.getBoundingClientRect().height);
      const total = size(ea) + size(eb);
      const sum = Number(ea.style.flexGrow || 1) + Number(eb.style.flexGrow || 1);
      const na = Math.min(Math.max(size(ea) + (e.key === on ? 24 : -24), 140), total - 140);
      ea.style.flexGrow = String((sum * na) / total);
      eb.style.flexGrow = String((sum * (total - na)) / total);
      d.setAttribute("aria-valuenow", String(Math.round((na / total) * 100)));
      persistSoon();
    });
    d.addEventListener("pointerdown", (e) => {
      const a = split.children[i - 1];
      const b = split.children[i];
      if (!a || !b) return;
      const ea = this.elOf(a);
      const eb = this.elOf(b);
      d.setPointerCapture(e.pointerId);
      const horizontal = split.dir === "row";
      const start = horizontal ? e.clientX : e.clientY;
      const sa = horizontal ? ea.getBoundingClientRect().width : ea.getBoundingClientRect().height;
      const sb = horizontal ? eb.getBoundingClientRect().width : eb.getBoundingClientRect().height;
      const total = sa + sb;
      const sum = Number(ea.style.flexGrow || 1) + Number(eb.style.flexGrow || 1);
      const move = (ev: PointerEvent) => {
        const delta = (horizontal ? ev.clientX : ev.clientY) - start;
        const na = Math.min(Math.max(sa + delta, 140), total - 140);
        ea.style.flexGrow = String((sum * na) / total);
        eb.style.flexGrow = String((sum * (total - na)) / total);
      };
      const up = () => {
        d.removeEventListener("pointermove", move);
        d.removeEventListener("pointerup", up);
        persistSoon();
      };
      d.addEventListener("pointermove", move);
      d.addEventListener("pointerup", up);
    });
    return d;
  }
  serialize(node: LNode = this.root): unknown {
    if (node.kind === "pane") {
      // The active tab by its place among the tabs saved, not among all.
      const saved = node.pane.leaves.filter((l) => l.path || l.kind === "folder" || l.kind === "graph" || l.kind === "terminal");
      return {
        // A terminal is kept by its id and folder: a reload finds the same
        // shell, a restart starts one in the same place (ADR 0115 Q6).
        tabs: saved.map((l) => ({ path: l.path, kind: l.kind, pinned: l.pinned, ...(l instanceof TerminalLeaf ? { term: { id: l.id, folder: l.folder } } : {}) })),
        active: node.pane.active ? Math.max(0, saved.indexOf(node.pane.active)) : 0,
        grow: node.pane.el.style.flexGrow || "1",
        vertical: node.pane.vertical,
        tabsHidden: node.pane.tabsHidden,
        tabsWidth: node.pane.el.style.getPropertyValue("--tabs-w") || null,
      };
    }
    return { dir: node.dir, children: node.children.map((c) => this.serialize(c)), grow: node.el.style.flexGrow || "1" };
  }
  restore(saved: unknown): boolean {
    const build = (v: unknown): LNode | null => {
      if (typeof v !== "object" || v === null) return null;
      const o = v as { tabs?: unknown; active?: unknown; dir?: unknown; children?: unknown; grow?: unknown; vertical?: unknown; tabsHidden?: unknown; tabsWidth?: unknown };
      if (Array.isArray(o.tabs)) {
        const pane = new Pane();
        pane.el.style.flexGrow = String(o.grow ?? "1");
        if (o.vertical === true) pane.setVertical(true);
        if (o.tabsHidden === true) pane.setTabsHidden(true);
        if (typeof o.tabsWidth === "string" && o.tabsWidth) pane.el.style.setProperty("--tabs-w", o.tabsWidth);
        // What no longer exists is skipped; the saved active tab is found by
        // its place in the saved list, or the one before it when it is gone.
        const wanted = typeof o.active === "number" ? o.active : 0;
        let active: Leaf | null = null;
        for (let i = 0; i < o.tabs.length; i++) {
          const tt = o.tabs[i] as { path?: unknown; kind?: unknown; pinned?: unknown; term?: { id?: unknown; folder?: unknown } };
          if (typeof tt.path !== "string") continue;
          let made: Leaf | null = null;
          if (tt.kind === "terminal") {
            const folder = typeof tt.term?.folder === "string" ? tt.term.folder : "";
            const id = typeof tt.term?.id === "string" ? tt.term.id : null;
            made = terminalOn() && (folder === "" || allFolders.includes(folder)) ? pane.openTerminal({ folder, attach: id }) : null;
          } else if (tt.kind === "folder") made = tt.path === "" || allFolders.includes(tt.path) ? pane.openFolder(tt.path) : null;
          else if (tt.kind === "graph") made = tt.path === "" || allNotes.includes(tt.path) ? pane.openGraph(tt.path) : null;
          else if (allNotes.includes(tt.path) || allFiles.includes(tt.path)) {
            quietPaths.add(tt.path);
            made = tt.kind === "data" ? pane.openDiagram(tt.path) : pane.open(tt.path, false);
          }
          if (made && tt.pinned === true) made.setPinned(true);
          if (made && (i <= wanted || !active)) active = made;
        }
        if (active) pane.activate(active, false);
        return pane.leaves.length > 0 ? { kind: "pane", pane } : null;
      }
      if ((o.dir === "row" || o.dir === "col") && Array.isArray(o.children)) {
        const children = o.children.map(build).filter((c): c is LNode => c !== null);
        if (children.length === 0) return null;
        if (children.length === 1) return children[0]!;
        const e = h("div", `split ${o.dir}`);
        e.style.flexGrow = String(o.grow ?? "1");
        return { kind: "split", dir: o.dir, children, el: e };
      }
      return null;
    };
    const root = build(saved);
    if (!root) return false;
    this.root = root.kind === "split" ? root : { kind: "split", dir: "row", children: [root], el: h("div", "split row") };
    this.render();
    // Tabs brought back are not places this session went to.
    for (const p of this.panes()) p.resetTrail();
    // Every tab has asked for its file by now: the restore is over.
    window.setTimeout(() => quietPaths.clear(), 0);
    this.focus(this.panes()[0] ?? null);
    return true;
  }
}
