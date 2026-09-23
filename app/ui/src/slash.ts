// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The `/` menu: blocks to insert, in sections, each with an icon, a name
// and a line that says what it is. It opens when a `/` starts a line
// outside code and the frontmatter, filters as the word after it is
// typed, and puts the block where the `/` was; it closes when its editor
// loses focus or goes away. Ours, not CodeMirror's completion: that one
// shows a label and a detail, no more.

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Prec, type EditorSelection } from "@codemirror/state";
import { ViewPlugin, keymap, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { icon } from "./icons";
import { frontmatterEnd } from "./live";

export type SlashItem = {
  icon: string;
  title: string;
  description: string;
  /** Words that also find it (the markdown itself, synonyms). */
  keywords?: string;
  insert: string | (() => string);
  cursor?: number;
  select?: [number, number];
  run?: (view: EditorView) => void;
};
export type SlashSection = { title: string; items: SlashItem[] };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class SlashMenu {
  readonly el = h("div", "slash");
  private view: EditorView | null = null;
  private from = -1;
  private sel = 0;
  private flat: SlashItem[] = [];
  private empty: string;

  constructor(private readonly sections: () => SlashSection[], strings: { empty: string }) {
    this.empty = strings.empty;
    this.el.hidden = true;
    this.el.setAttribute("role", "listbox");
    document.body.append(this.el);
    this.el.addEventListener("mousedown", (e) => e.preventDefault());
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** A `/` was typed where a block may start: open at its position. */
  private tryOpen(view: EditorView): void {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const before = line.text.slice(0, head - line.from);
    if (!before.endsWith("/")) return;
    const upTo = before.slice(0, -1);
    if (!/^[\s>-]*$/.test(upTo)) return;
    // A `/` in code is code, and the frontmatter is YAML.
    const fm = frontmatterEnd(view.state.doc);
    if (fm >= 0 && head <= fm) return;
    const tree = ensureSyntaxTree(view.state, head, 50) ?? syntaxTree(view.state);
    for (let n: SyntaxNode | null = tree.resolveInner(head - 1, 1); n; n = n.parent) {
      if (/^(FencedCode|CodeBlock|InlineCode|CodeText|HTMLBlock|CommentBlock)$/.test(n.name)) return;
    }
    this.view = view;
    this.from = head - 1;
    this.sel = 0;
    this.render();
  }

  /** Called from the editor's update listener: opens, filters, closes. */
  onUpdate(u: ViewUpdate): void {
    if (!this.open) {
      if (u.docChanged && u.view.hasFocus) this.tryOpen(u.view);
      return;
    }
    // Focus elsewhere (another tab, the tree, a dialog): the menu goes, and
    // with it the reason web views hide.
    if (u.view !== this.view || (u.focusChanged && !u.view.hasFocus)) return this.close();
    const head = u.state.selection.main.head;
    if (head <= this.from || u.state.doc.lineAt(head).number !== u.state.doc.lineAt(this.from).number) return this.close();
    const typed = u.state.sliceDoc(this.from, head);
    if (!typed.startsWith("/") || /\s/.test(typed)) return this.close();
    if (u.docChanged || u.selectionSet) {
      this.sel = 0;
      this.render();
    }
  }

  private query(): string {
    if (!this.view) return "";
    return this.view.state.sliceDoc(this.from + 1, this.view.state.selection.main.head).toLowerCase();
  }

  private render(): void {
    const view = this.view;
    if (!view) return;
    const q = this.query();
    const match = (it: SlashItem) => q === "" || `${it.title} ${it.description} ${it.keywords ?? ""}`.toLowerCase().includes(q);
    this.flat = [];
    const frag = document.createDocumentFragment();
    for (const sec of this.sections()) {
      const items = sec.items.filter(match);
      if (items.length === 0) continue;
      frag.append(h("div", "slash-section", sec.title));
      for (const it of items) {
        const index = this.flat.length;
        this.flat.push(it);
        const row = h("button", "slash-item");
        row.type = "button";
        row.setAttribute("role", "option");
        row.dataset["index"] = String(index);
        const box = h("span", "slash-icon");
        box.append(icon(it.icon));
        const text = h("span", "slash-text");
        text.append(h("span", "slash-title", it.title), h("span", "slash-desc", it.description));
        row.append(box, text);
        row.addEventListener("click", () => this.apply(index));
        row.addEventListener("mousemove", () => {
          if (this.sel !== index) {
            this.sel = index;
            this.paintSelection();
          }
        });
        frag.append(row);
      }
    }
    if (this.flat.length === 0) frag.append(h("div", "slash-empty", this.empty));
    this.el.replaceChildren(frag);
    this.el.hidden = false;
    this.paintSelection();
    this.place();
  }

  private paintSelection(): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>(".slash-item")) {
      const on = Number(b.dataset["index"]) === this.sel;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-selected", String(on));
      if (on) b.scrollIntoView({ block: "nearest" });
    }
  }

  private place(): void {
    const view = this.view;
    if (!view) return;
    const at = view.coordsAtPos(this.from);
    if (!at) return;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    let left = at.left;
    let top = at.bottom + 6;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, at.top - hgt - 6);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  close(): void {
    this.el.hidden = true;
    this.view = null;
    this.from = -1;
  }

  /** Close if the menu belongs to `view`. */
  closeFor(view: EditorView): void {
    if (this.view === view) this.close();
  }

  move(d: 1 | -1): boolean {
    if (!this.open || this.flat.length === 0) return false;
    this.sel = (this.sel + d + this.flat.length) % this.flat.length;
    this.paintSelection();
    return true;
  }

  apply(index = this.sel): boolean {
    const view = this.view;
    const it = this.flat[index];
    if (!view || !it) return false;
    const to = view.state.selection.main.head;
    const from = this.from;
    const text = typeof it.insert === "function" ? it.insert() : it.insert;
    let selection: EditorSelection | { anchor: number; head?: number };
    if (it.select) selection = { anchor: from + it.select[0], head: from + it.select[1] };
    else selection = { anchor: it.cursor === undefined ? from + text.length : from + it.cursor };
    this.close();
    view.dispatch({ changes: { from, to, insert: text }, selection, scrollIntoView: true });
    view.focus();
    it.run?.(view);
    return true;
  }
}

/** Keys the menu takes while it is open; everything else passes. The
 *  plugin closes the menu when its view goes: a new state (a note loaded
 *  into the editor) or the editor destroyed. */
export function slashKeymap(menu: SlashMenu) {
  return [
    Prec.highest(
      keymap.of([
        { key: "ArrowDown", run: () => menu.move(1) },
        { key: "ArrowUp", run: () => menu.move(-1) },
        { key: "Enter", run: () => (menu.open ? menu.apply() : false) },
        { key: "Tab", run: () => (menu.open ? menu.apply() : false) },
        { key: "Escape", run: () => (menu.open ? (menu.close(), true) : false) },
      ]),
    ),
    ViewPlugin.define((view) => ({ destroy: () => menu.closeFor(view) })),
  ];
}
