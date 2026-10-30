// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The handle of a note's blocks in Edit mode (ADR 0061 D6): hovering a
// block shows, in the margin beside its first line, a `+` and a ⋮⋮, and a
// light outline round the whole block. ⋮⋮ dragged moves the block (or the
// blocks a selection touches) — a line shows where it lands, at the depth
// the pointer's horizontal place picks, and the note scrolls near its
// edges; clicked, it opens the block's menu. `+` adds a block below and
// opens the `/` menu there. One handle for the whole note, placed on the
// block under the pointer: nothing is drawn per block.

import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { posAt } from "../editor/posAt";
import { pointerDrag } from "../bases/drag";
import { allowed, blockAt, blocksOfSelection, depthOf, frontmatterEnd, gapsOf, moveBlocks, outline, type Block, type Container, type Target } from "./model";

export type BlockHandleOptions = {
  /** The handles are on (Settings › Edit mode). */
  enabled: () => boolean;
  /** ⋮⋮ clicked: the block menu, at a point of the screen. */
  menu: (view: EditorView, blocks: Block[], x: number, y: number) => void;
  /** `+` clicked: a block below, with the `/` menu. */
  plus: (view: EditorView, block: Block) => void;
  /** `+` clicked on an empty line: a block there, with the `/` menu. */
  plusAt: (view: EditorView, line: number) => void;
  strings: { grip: string; plus: string };
};

/** How far one level of nesting is, on screen, for the drop's depth. */
const INDENT = 24;

const roots = new WeakMap<EditorState, Container>();
/** The note's blocks, once per state. */
export function blocksOf(state: EditorState): Container {
  let root = roots.get(state);
  if (!root) {
    root = outline(state);
    roots.set(state, root);
  }
  return root;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** The element that scrolls the note: the sheet, not the editor. */
function scrollerOf(node: HTMLElement): HTMLElement | null {
  for (let p = node.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function blockHandles(opts: BlockHandleOptions) {
  return ViewPlugin.fromClass(
    class {
      readonly box = el("div", "cm-block-handle");
      readonly plusBtn = el("button", "cm-block-plus");
      readonly grip = el("button", "cm-block-grip");
      readonly frame = el("div", "cm-block-outline");
      readonly line = el("div", "cm-block-drop");
      block: Block | null = null;
      /** Where `block` starts in the document as it is now. */
      at: number | null = null;
      /** An empty line under the pointer: the `+` alone, for a new block. */
      empty: number | null = null;
      dragging = false;
      hideTimer = 0;
      refreshFrame = 0;

      constructor(readonly view: EditorView) {
        this.plusBtn.type = "button";
        this.grip.type = "button";
        this.plusBtn.tabIndex = -1;
        this.grip.tabIndex = -1;
        this.plusBtn.title = opts.strings.plus;
        this.plusBtn.setAttribute("aria-label", opts.strings.plus);
        this.grip.title = opts.strings.grip;
        this.grip.setAttribute("aria-label", opts.strings.grip);
        this.plusBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        this.grip.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + [4, 8, 12].map((y) => `<circle cx="6" cy="${y}" r="1.2"/><circle cx="10" cy="${y}" r="1.2"/>`).join("") + "</svg>";
        this.box.append(this.plusBtn, this.grip);
        this.box.hidden = true;
        this.frame.hidden = true;
        this.line.hidden = true;
        view.dom.append(this.frame, this.line, this.box);
        // The editor keeps its focus and selection while the handle is used.
        this.box.addEventListener("mousedown", (e) => e.preventDefault());
        this.plusBtn.addEventListener("click", () => {
          if (this.block) opts.plus(view, this.block);
          else if (this.empty !== null) opts.plusAt(view, this.empty);
          this.hide();
        });
        this.grip.addEventListener("click", (e) => {
          if (!this.block) return;
          const r = this.grip.getBoundingClientRect();
          opts.menu(view, this.run(), e.clientX || r.left, e.clientY || r.bottom);
        });
        this.armDrag();
        view.dom.addEventListener("mousemove", this.onMove);
        view.dom.addEventListener("mouseleave", this.onLeave);
      }

      /** The blocks the handle acts on: the selection's, when the block
       *  under the handle is among them; else the block alone. */
      run(): Block[] {
        const b = this.block;
        if (!b) return [];
        const sel = this.view.state.selection.main;
        if (!sel.empty) {
          const run = blocksOfSelection(blocksOf(this.view.state), this.view.state);
          if (run.includes(b)) return run;
        }
        return [b];
      }

      onMove = (e: MouseEvent): void => {
        if (this.dragging) return;
        if (!opts.enabled()) return this.hide();
        window.clearTimeout(this.hideTimer);
        if (this.box.contains(e.target as Node)) return;
        const content = this.view.contentDOM.getBoundingClientRect();
        const pos = posAt(this.view, { x: content.left + 8, y: e.clientY }, false);
        if (pos === null) return this.hide();
        const block = blockAt(blocksOf(this.view.state), this.view.state.doc, pos);
        if (block) return this.show(block);
        // An empty line, outside the frontmatter: the `+` alone, as Notion
        // shows it on an empty block.
        const line = this.view.state.doc.lineAt(pos);
        const fm = frontmatterEnd(this.view.state.doc);
        if (line.text.trim() === "" && line.from > fm) return this.showEmpty(line.from);
        this.hide();
      };

      showEmpty(at: number): void {
        const view = this.view;
        const dom = view.dom.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const lb = view.lineBlockAt(at);
        const top = lb.top + view.documentTop - dom.top;
        this.block = null;
        this.at = null;
        this.empty = at;
        this.box.style.top = `${top + lb.height / 2 - 11}px`;
        this.box.style.left = `${content.left - dom.left - 48}px`;
        this.grip.hidden = true;
        this.box.hidden = false;
        this.frame.hidden = true;
      }

      onLeave = (): void => {
        if (this.dragging) return;
        window.clearTimeout(this.hideTimer);
        this.hideTimer = window.setTimeout(() => this.hide(), 250);
      };

      /** A block's box on screen, relative to the editor's own box. */
      rect(b: Block): { top: number; bottom: number; first: { top: number; bottom: number } } | null {
        const view = this.view;
        const dom = view.dom.getBoundingClientRect();
        const top = view.lineBlockAt(b.from).top + view.documentTop - dom.top;
        const bottom = view.lineBlockAt(b.to).bottom + view.documentTop - dom.top;
        const at = view.coordsAtPos(b.start, 1) ?? view.coordsAtPos(b.from, 1);
        const first = at ? { top: at.top - dom.top, bottom: at.bottom - dom.top } : { top, bottom: Math.min(bottom, top + 24) };
        return { top, bottom, first };
      }

      show(b: Block): void {
        const r = this.rect(b);
        if (!r) return this.hide();
        this.block = b;
        this.at = b.start;
        this.empty = null;
        this.grip.hidden = false;
        const view = this.view;
        const dom = view.dom.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const lineLeft = (view.coordsAtPos(b.start, 1)?.left ?? content.left) - dom.left;
        const mid = (r.first.top + r.first.bottom) / 2;
        this.box.style.top = `${mid - 11}px`;
        // In the margin, left of the block's own text and of the fold
        // chevrons: never over the text.
        this.box.style.left = `${Math.min(lineLeft, content.left - dom.left) - 48}px`;
        this.box.hidden = false;
        this.frame.style.top = `${r.top}px`;
        this.frame.style.height = `${Math.max(4, r.bottom - r.top)}px`;
        this.frame.style.left = `${lineLeft - 4}px`;
        this.frame.style.width = `${content.right - dom.left - lineLeft + 4}px`;
        this.frame.hidden = false;
      }

      hide(): void {
        this.block = null;
        this.at = null;
        this.empty = null;
        this.box.hidden = true;
        this.frame.hidden = true;
      }

      armDrag(): void {
        let blocks: Block[] = [];
        let startDoc = this.view.state.doc;
        let target: Target | null = null;
        let lastY = 0;
        let scrollFrame = 0;
        const view = this.view;
        const scrollLoop = () => {
          scrollFrame = 0;
          if (!this.dragging) return;
          const sc = scrollerOf(view.dom) ?? view.scrollDOM;
          const r = sc.getBoundingClientRect();
          const edge = 48;
          const dy = lastY < r.top + edge ? -Math.ceil((r.top + edge - lastY) / 4) : lastY > r.bottom - edge ? Math.ceil((lastY - (r.bottom - edge)) / 4) : 0;
          if (dy !== 0) {
            sc.scrollTop += dy;
            scrollFrame = window.requestAnimationFrame(scrollLoop);
          }
        };
        pointerDrag(this.grip, {
          label: () => {
            const b = blocks[0] ?? this.block;
            const text = b ? view.state.sliceDoc(b.start, view.state.doc.lineAt(b.start).to).trim() : "";
            return (text.length > 48 ? text.slice(0, 47) + "…" : text) + (blocks.length > 1 ? ` (+${blocks.length - 1})` : "");
          },
          start: () => {
            blocks = this.run();
            startDoc = view.state.doc;
            this.dragging = true;
            view.dom.classList.add("cm-blocks-dragging");
          },
          move: (e) => {
            lastY = e.clientY;
            target = this.targetAt(blocks, e.clientX, e.clientY);
            if (!scrollFrame) scrollFrame = window.requestAnimationFrame(scrollLoop);
          },
          end: (e, dropped) => {
            this.dragging = false;
            view.dom.classList.remove("cm-blocks-dragging");
            this.line.hidden = true;
            window.cancelAnimationFrame(scrollFrame);
            scrollFrame = 0;
            const r = view.dom.getBoundingClientRect();
            // A release outside the note drops nothing; nor does a note
            // another program wrote while the block was in the air.
            const outside = !e || e.clientX < r.left - 80 || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
            if (!dropped || outside || !target || view.state.doc !== startDoc) return;
            const edit = moveBlocks(view.state, blocks, target);
            if (!edit) return;
            view.dispatch({ changes: edit.changes, selection: edit.selection, userEvent: "move.drop", scrollIntoView: true });
            view.focus();
            this.hide();
          },
        });
      }

      /** Where a drop at a point lands, and the line that says so. */
      targetAt(blocks: Block[], x: number, y: number): Target | null {
        const view = this.view;
        const root = blocksOf(view.state);
        const doc = view.state.doc;
        const dom = view.dom.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        let best: { gapY: number; targets: Target[] } | null = null;
        for (const g of gapsOf(root, doc)) {
          const targets = allowed(g, blocks);
          if (targets.length === 0) continue;
          const gy = g.at > doc.length ? view.lineBlockAt(doc.length).bottom : view.lineBlockAt(g.at).top;
          const gapY = gy + view.documentTop;
          if (!best || Math.abs(gapY - y) < Math.abs(best.gapY - y)) best = { gapY, targets };
        }
        if (!best) {
          this.line.hidden = true;
          return null;
        }
        // The pointer's horizontal place picks the depth: one level per
        // indent from the text's left edge, the nearest one there is.
        const want = Math.max(0, Math.round((x - content.left) / INDENT));
        let pick = best.targets[0]!;
        for (const t of best.targets) if (Math.abs(depthOf(t.container) - want) < Math.abs(depthOf(pick.container) - want)) pick = t;
        const depth = depthOf(pick.container);
        this.line.style.top = `${best.gapY - dom.top - 1}px`;
        this.line.style.left = `${content.left - dom.left + depth * INDENT}px`;
        this.line.style.width = `${Math.max(40, content.right - content.left - depth * INDENT)}px`;
        this.line.hidden = false;
        return pick;
      }

      update(u: ViewUpdate): void {
        // Every change is mapped at once, dragging or not: a second change
        // before the frame below runs (a collaborator's typing) would
        // otherwise map a position of a document that is gone.
        if (u.docChanged) {
          if (this.at !== null) this.at = u.changes.mapPos(this.at, 1);
          if (this.empty !== null) this.empty = u.changes.mapPos(this.empty, -1);
        }
        if (this.dragging || !this.block || this.at === null) return;
        if (!u.docChanged && !u.geometryChanged && !u.viewportChanged) return;
        // The block under the handle may have moved or gone. The layout is
        // read after the update, as CodeMirror requires.
        const pos = this.at;
        window.cancelAnimationFrame(this.refreshFrame);
        this.refreshFrame = window.requestAnimationFrame(() => {
          if (this.dragging) return;
          const now = blockAt(blocksOf(this.view.state), this.view.state.doc, Math.min(pos, this.view.state.doc.length));
          if (now && opts.enabled()) this.show(now);
          else this.hide();
        });
      }

      destroy(): void {
        this.view.dom.removeEventListener("mousemove", this.onMove);
        this.view.dom.removeEventListener("mouseleave", this.onLeave);
        window.clearTimeout(this.hideTimer);
        window.cancelAnimationFrame(this.refreshFrame);
        this.box.remove();
        this.frame.remove();
        this.line.remove();
      }
    },
  );
}

