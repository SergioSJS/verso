// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The data diagram's window (ADR 0106): HTML boxes over SVG lines in one
// layer that is panned and zoomed, with only the boxes in view in the page
// (item 4). A box is dragged by its title bar and carries what hangs under
// it, Alt for the box alone (item 2); a branch folds from its box; the
// search reaches into folded branches (item 7); the whole is a tree to a
// screen reader, in the data's order, walked with the arrows (item 11).
// It never writes the file (item 8): it only asks its host to show a range
// of the text. The idea of the box-and-line view is JSON Crack's.

import { button, h } from "../dom";
import { icon } from "../icons";
import { group, type MenuItem, showMenu } from "../menu";
import { buildBox, type BoxMarks } from "./boxes";
import { curve, edgeEnds, type Layout } from "./layout";
import { locate, MAX_BYTES, type Format, pathOf, rowPath, type Tree } from "./model";
import { parse } from "./parse";
import { searchTree, type Found } from "./search";
import { DiagramModel, type Saved } from "./state";
import { dgw } from "./words";

export type Range = { from: number; to: number };

/** What the diagram asks of the tab around it. */
export interface DiagramHost {
  /** The file's name, for the tree's name. */
  readonly name: string;
  /** Whether there is a text view of this data to go to (not for a block of a note). */
  readonly canText: boolean;
  /** Show this range in the text view, if one is open beside the diagram. */
  select(range: Range): void;
  /** Take the person to the text, at this range. */
  toText(range: Range): void;
  /** The moves or folds changed: keep them. */
  changed(): void;
  say(message: string): void;
  copy(text: string): void;
  /** "Save as board…", when the host offers it. */
  saveBoard?(): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const STEP = 16;

export class DataDiagram {
  readonly el = h("div", "dg");
  readonly stage = h("div", "dg-stage");
  private readonly layer = h("div", "dg-layer");
  private readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly edges = document.createElementNS("http://www.w3.org/2000/svg", "path");
  private readonly aliases = document.createElementNS("http://www.w3.org/2000/svg", "path");
  private readonly lit = document.createElementNS("http://www.w3.org/2000/svg", "path");
  private readonly bar = h("div", "dg-bar");
  private readonly search = h("input", "dg-search");
  private readonly count = h("span", "dg-matches");
  private readonly error = h("div", "dg-error");
  private readonly note = h("p", "dg-empty");
  private readonly hint = h("p", "dg-hint");
  private readonly levels = h("select", "dg-levels");
  private readonly dirButton = h("button", "ghost dg-dir");
  private readonly hintClose = h("button", "ghost dg-hint-close");
  private readonly hintText = h("span", "dg-hint-text");
  private compact = false;
  private hintSeen = false;

  model: DiagramModel | null = null;
  /** Why nothing is drawn: the text past the size limit, or more boxes than are drawn. */
  limit: "tooBig" | "tooMany" | null = null;
  /** Why the text last set could not be read as a diagram, in the words shown; null when it was. */
  private failure: string | null = null;
  text = "";
  format: Format = "json";
  private lay: Layout | null = null;
  private zoom = 1;
  private px = 0;
  private py = 0;
  private focusId = -1;
  private selId = -1;
  private selRow = -1;
  private caretId = -1;
  private caretRow = -1;
  private version = 1;
  private frame = 0;
  private fitted = false;
  /** The first drawing waits for the stage to have a size: a tab may be built hidden. */
  private needFit = false;
  private hasGood = false;
  private boxes = new Map<number, { el: HTMLElement; v: number; x: number; y: number }>();
  private found: Found = { matches: [], more: false };
  private hits = new Map<number, Set<number>>();
  private at = -1;
  private searchTimer = 0;
  /** The query changed and its answer is not in yet (the pause after typing). */
  private searchStale = false;
  private fullPanel: HTMLElement | null = null;
  private readonly resizer: ResizeObserver | null;

  constructor(readonly host: DiagramHost) {
    this.stage.setAttribute("role", "tree");
    this.stage.setAttribute("aria-label", dgw.diagramOf(host.name));
    this.stage.setAttribute("aria-orientation", "vertical");
    this.stage.tabIndex = -1;
    this.layer.setAttribute("role", "none");
    this.svg.setAttribute("class", "dg-lines");
    this.svg.setAttribute("aria-hidden", "true");
    this.edges.setAttribute("class", "dg-edge");
    this.aliases.setAttribute("class", "dg-edge dg-alias-edge");
    this.lit.setAttribute("class", "dg-edge dg-lit");
    this.svg.append(this.edges, this.aliases, this.lit);
    this.layer.append(this.svg);
    this.stage.append(this.layer);
    this.note.hidden = true;
    this.note.setAttribute("role", "status");
    this.error.hidden = true;
    const coarse = window.matchMedia?.("(pointer: coarse)");
    this.hintText.textContent = coarse?.matches ? dgw.hintTouch : dgw.hint;
    this.hintClose.type = "button";
    this.hintClose.append(icon("close", dgw.hintDismiss));
    this.hintClose.title = dgw.hintDismiss;
    this.hintClose.setAttribute("aria-label", dgw.hintDismiss);
    this.hintClose.addEventListener("click", () => this.dismissHint());
    this.hint.append(this.hintText, this.hintClose);
    this.buildBar();
    this.el.append(this.bar, this.error, this.stage, this.note, this.hint);
    this.wire();
    this.resizer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      this.checkCompact();
      this.schedule();
    });
    this.resizer?.observe(this.stage);
    this.resizer?.observe(this.el);
  }

  /* ---------- Narrow panes: one slim row ---------- */

  /** A narrow pane (a phone, a thin split) gets icons and an overflow menu; a card on a board keeps its own small bar. */
  private checkCompact(): void {
    const w = this.el.clientWidth;
    if (w === 0) return;
    const on = w < 560 && !this.el.closest(".board-card-dg");
    if (on === this.compact) return;
    this.compact = on;
    this.el.classList.toggle("dg-compact", on);
    if (!on) this.el.classList.remove("dg-searching");
    this.paintHint();
  }

  private paintHint(): void {
    if (!this.compact) {
      this.hint.hidden = false;
      this.hintText.textContent = window.matchMedia?.("(pointer: coarse)")?.matches ? dgw.hintTouch : dgw.hint;
      return;
    }
    this.hintText.textContent = dgw.hintShort;
    let seen = this.hintSeen;
    try {
      seen = seen || localStorage.getItem("verso.dg.hintSeen") === "1";
    } catch {
      /* storage blocked: the tip shows until dismissed in this window */
    }
    this.hint.hidden = seen;
  }

  private dismissHint(): void {
    this.hintSeen = true;
    try {
      localStorage.setItem("verso.dg.hintSeen", "1");
    } catch {
      /* storage blocked */
    }
    this.hint.hidden = true;
  }

  private openSearch(on: boolean): void {
    this.el.classList.toggle("dg-searching", on);
    if (on) this.focusSearch();
    else {
      this.search.value = "";
      this.runSearch();
    }
  }

  private overflow(anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    const levels: MenuItem[] = [];
    for (let i = 1; i <= 6; i++) levels.push([dgw.level(i), () => this.setBase({ kind: "depth", depth: i })]);
    const lr = (this.model?.dir ?? "lr") === "lr";
    const items: MenuItem[] = [
      [dgw.foldAll, () => this.setBase({ kind: "depth", depth: 1 }), "collapse"],
      [dgw.unfoldAll, () => this.setBase({ kind: "depth", depth: Number.MAX_SAFE_INTEGER }), "expand"],
      group(dgw.levelMenu, "outline", levels),
      [`${dgw.direction}: ${lr ? dgw.topToBottom : dgw.leftToRight}`, () => this.toggleDirection(), "sort"],
      [dgw.arrange, () => this.rearrange(), "refresh"],
    ];
    if (this.host.saveBoard) items.push([dgw.saveBoard, () => this.host.saveBoard?.(), "board"]);
    items.push([dgw.hintShow, () => { this.hintSeen = false; try { localStorage.removeItem("verso.dg.hintSeen"); } catch { /* storage blocked */ } this.hint.hidden = false; }, "info"]);
    showMenu(r.right, r.bottom + 4, items, dgw.moreActions);
  }

  /* ---------- The toolbar ---------- */

  private buildBar(): void {
    const find = h("div", "dg-find");
    this.search.type = "search";
    this.search.placeholder = dgw.searchPlaceholder;
    this.search.setAttribute("aria-label", dgw.searchLabel);
    this.search.addEventListener("input", () => {
      window.clearTimeout(this.searchTimer);
      this.searchStale = true;
      this.searchTimer = window.setTimeout(() => this.runSearch(), 120);
    });
    this.search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        window.clearTimeout(this.searchTimer);
        // Enter before the pause is over asks for the answer to what is typed now, not for the next of the last one.
        if (this.searchStale || this.found.matches.length === 0 || this.search.value.trim() === "") this.runSearch();
        else this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.search.value = "";
        this.runSearch();
        this.focusBox();
      }
    });
    this.count.className = "dg-matches";
    this.count.setAttribute("role", "status");
    const prev = button("ghost", dgw.prev, "chevronUp");
    prev.addEventListener("click", () => this.step(-1));
    const next = button("ghost", dgw.next, "chevronDown");
    next.addEventListener("click", () => this.step(1));
    const searchBtn = button("ghost dg-c-only dg-search-open", dgw.searchOpen, "search");
    searchBtn.addEventListener("click", () => this.openSearch(true));
    const searchX = button("ghost dg-c-only dg-search-close", dgw.searchClose, "close");
    searchX.addEventListener("click", () => this.openSearch(false));
    find.append(this.search, prev, next, this.count, searchX);

    const text = (label: string, run: () => void, cls = "ghost"): HTMLButtonElement => {
      const b = h("button", cls, label);
      b.type = "button";
      b.addEventListener("click", run);
      return b;
    };
    this.levels.setAttribute("aria-label", dgw.levelMenu);
    const first = h("option", "", dgw.levelMenu);
    first.value = "";
    this.levels.append(first);
    for (let i = 1; i <= 6; i++) {
      const o = h("option", "", dgw.level(i));
      o.value = String(i);
      this.levels.append(o);
    }
    this.levels.addEventListener("change", () => {
      const d = Number(this.levels.value);
      this.levels.value = "";
      if (d > 0) this.setBase({ kind: "depth", depth: d });
    });
    this.dirButton.type = "button";
    this.dirButton.addEventListener("click", () => this.toggleDirection());
    const zoomOut = button("ghost", dgw.zoomOut, "zoomOut");
    zoomOut.addEventListener("click", () => this.zoomBy(1 / 1.25));
    const zoomIn = button("ghost", dgw.zoomIn, "zoomIn");
    zoomIn.addEventListener("click", () => this.zoomBy(1.25));
    const wide = (b: HTMLElement): HTMLElement => {
      b.classList.add("dg-w-only");
      return b;
    };
    const fit = wide(text(dgw.fit, () => this.fit()));
    const fitIcon = button("ghost dg-c-only", dgw.fit, "fitPage");
    fitIcon.addEventListener("click", () => this.fit());
    const more = button("ghost dg-c-only dg-overflow", dgw.moreActions, "more");
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", () => this.overflow(more));
    this.levels.classList.add("dg-w-only");
    this.dirButton.classList.add("dg-w-only");
    const row = h("div", "dg-actions");
    row.append(
      wide(text(dgw.foldAll, () => this.setBase({ kind: "depth", depth: 1 }))),
      wide(text(dgw.unfoldAll, () => this.setBase({ kind: "depth", depth: Number.MAX_SAFE_INTEGER }))),
      this.levels,
      this.dirButton,
      wide(text(dgw.arrange, () => this.rearrange())),
      zoomOut,
      zoomIn,
      fit,
      fitIcon,
    );
    if (this.host.saveBoard) row.append(wide(text(dgw.saveBoard, () => this.host.saveBoard?.())));
    row.append(more);
    this.bar.append(searchBtn, find, row);
    // An icon-only button is named on itself (title and aria-label), not only on its drawing.
    for (const b of this.bar.querySelectorAll("button")) {
      if (!b.textContent?.trim() && b.title) b.setAttribute("aria-label", b.title);
    }
    this.paintDirection();
  }

  private paintDirection(): void {
    const lr = (this.model?.dir ?? "lr") === "lr";
    this.dirButton.textContent = lr ? dgw.leftToRight : dgw.topToBottom;
    this.dirButton.title = dgw.direction;
    this.dirButton.setAttribute("aria-label", `${dgw.direction}: ${this.dirButton.textContent}`);
  }

  /* ---------- Reading the text ---------- */

  /** The text of the file, read again. Refused whole past the size limit. */
  setText(text: string, format: Format): void {
    this.text = text;
    this.format = format;
    this.limit = null;
    if (text.length >= MAX_BYTES) {
      this.limit = "tooBig";
      this.failure = dgw.tooBig(Math.round(text.length / 1048576));
      this.showNote(this.failure);
      return;
    }
    this.setTree(parse(text, format));
  }

  /** Why the text last set could not be read as a diagram — too large, too
   *  many boxes, or not valid — in the diagram's own words; null when it
   *  was read. A file opened without its folder opens as its text with
   *  this line (ADR 0114 item 32). */
  unreadable(): string | null {
    return this.failure;
  }

  setTree(tree: Tree): void {
    this.limit = null;
    this.failure = tree.tooMany ? dgw.tooMany : tree.error ? dgw.errorLine(tree.error.message) : null;
    if (tree.tooMany) {
      // Too many boxes to draw: no diagram, whatever was there before; the text stays one key away.
      this.limit = "tooMany";
      this.error.hidden = true;
      this.model = null;
      this.lay = null;
      this.hasGood = false;
      this.clearBoxes();
      this.showNote(dgw.tooMany);
      return;
    }
    if (tree.error && this.hasGood && this.model) {
      // The last good diagram stays; the error is told, with a way to its place.
      this.showError(tree.error.message, tree.error.from, tree.error.to, true);
      return;
    }
    this.error.hidden = true;
    if (tree.error) this.showError(tree.error.message, tree.error.from, tree.error.to, false);
    if (tree.nodes.length === 0) {
      this.model = null;
      this.lay = null;
      this.hasGood = false;
      this.clearBoxes();
      this.showNote(tree.error ? "" : dgw.empty);
      return;
    }
    this.note.hidden = true;
    if (this.model) {
      const saved = this.model.dir;
      this.model.adopt(tree);
      this.model.dir = saved;
    } else this.model = new DiagramModel(tree);
    this.hasGood = tree.error === null;
    this.focusId = this.focusId >= 0 && this.focusId < tree.nodes.length ? this.focusId : (tree.roots[0] ?? -1);
    if (this.selId >= tree.nodes.length) this.selId = -1;
    this.version++;
    this.relayout();
    if (!this.fitted) {
      this.fit();
      this.fitted = true;
      this.needFit = true;
    }
    this.runSearch(false);
    this.schedule();
  }

  /** Restore what was kept for the file; before the first drawing. */
  restore(saved: Saved | null): void {
    if (!saved || !this.model) return;
    this.model.restore(saved);
    this.paintDirection();
    this.version++;
    this.relayout();
    this.fit();
    this.fitted = true;
    this.needFit = true;
    this.schedule();
  }

  snapshot(): Saved | null {
    return this.model ? this.model.snapshot() : null;
  }

  private showNote(message: string): void {
    this.note.textContent = message;
    this.note.hidden = message === "";
    this.clearBoxes();
  }

  private showError(message: string, from: number, to: number, stale: boolean): void {
    this.error.replaceChildren();
    const line = h("span", "dg-error-text", `${dgw.errorLine(message)}${stale ? ` ${dgw.staleNote}` : ""}`);
    const go = h("button", "ghost dg-error-go", dgw.errorGo);
    go.type = "button";
    go.addEventListener("click", () => this.host.toText({ from, to }));
    if (this.host.canText) this.error.append(line, go);
    else this.error.append(line);
    this.error.setAttribute("role", "status");
    this.error.hidden = false;
  }

  /* ---------- Layout and drawing ---------- */

  private relayout(): void {
    this.lay = this.model ? this.model.layout() : null;
  }

  private clearBoxes(): void {
    for (const b of this.boxes.values()) b.el.remove();
    this.boxes.clear();
    this.edges.setAttribute("d", "");
    this.aliases.setAttribute("d", "");
    this.lit.setAttribute("d", "");
  }

  schedule(): void {
    if (this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private applyView(): void {
    this.layer.style.transform = `translate(${this.px}px, ${this.py}px) scale(${this.zoom})`;
  }

  private marksFor(id: number): BoxMarks {
    const hits = this.hits.get(id);
    const cur = this.found.matches[this.at];
    return {
      hits,
      current: cur && cur.node === id ? cur.row : -1,
      caret: this.caretId === id ? this.caretRow : -1,
      selectedRow: this.selId === id ? this.selRow : -1,
    };
  }

  private render(): void {
    const model = this.model;
    const lay = this.lay;
    if (!model || !lay) return;
    if (this.needFit && this.stage.clientWidth > 0 && this.stage.clientHeight > 0) {
      this.needFit = false;
      this.fit();
    }
    this.applyView();
    const z = this.zoom;
    const W = this.stage.clientWidth || 800;
    const H = this.stage.clientHeight || 600;
    const margin = 240 / z;
    const x0 = -this.px / z - margin;
    const y0 = -this.py / z - margin;
    const x1 = (W - this.px) / z + margin;
    const y1 = (H - this.py) / z + margin;
    const wanted: number[] = [];
    for (let i = 0; i < lay.order.length; i++) {
      const id = lay.order[i]!;
      const x = lay.x[id]!;
      const y = lay.y[id]!;
      // The focused box stays in the page wherever it is: focus must not be lost to culling.
      if (id === this.focusId || (x < x1 && x + lay.w[id]! > x0 && y < y1 && y + lay.h[id]! > y0)) wanted.push(id);
    }
    const hadFocus = this.stage.contains(document.activeElement);
    const want = new Set(wanted);
    for (const [id, b] of this.boxes) {
      if (!want.has(id)) {
        b.el.remove();
        this.boxes.delete(id);
      }
    }
    const els: HTMLElement[] = [];
    for (const id of wanted) {
      let b = this.boxes.get(id);
      if (!b || b.v !== this.version) {
        const el = buildBox(model, id, lay.rowsShown[id]!, this.marksFor(id));
        el.style.width = `${lay.w[id]}px`;
        el.style.height = `${lay.h[id]}px`;
        if (b) b.el.replaceWith(el);
        b = { el, v: this.version, x: NaN, y: NaN };
        this.boxes.set(id, b);
      }
      const x = lay.x[id]!;
      const y = lay.y[id]!;
      if (b.x !== x || b.y !== y) {
        b.el.style.transform = `translate(${x}px, ${y}px)`;
        b.x = x;
        b.y = y;
      }
      b.el.tabIndex = id === this.focusId ? 0 : -1;
      b.el.classList.toggle("dg-sel", id === this.selId);
      b.el.setAttribute("aria-selected", String(id === this.selId));
      b.el.classList.toggle("dg-caret-box", id === this.caretId && this.caretRow < 0);
      els.push(b.el);
    }
    // The page keeps the boxes in the data's order (the tree to a screen reader), moving none that is already in place.
    let ref: ChildNode | null = this.svg.nextSibling;
    for (const el of els) {
      if (el === ref) ref = ref.nextSibling;
      else this.layer.insertBefore(el, ref);
    }
    if (hadFocus && !this.stage.contains(document.activeElement) && this.boxes.has(this.focusId) && !this.search.matches(":focus")) {
      this.boxes.get(this.focusId)?.el.focus({ preventScroll: true });
    }
    this.drawLines(model, lay, x0, y0, x1, y1);
  }

  private drawLines(model: DiagramModel, lay: Layout, x0: number, y0: number, x1: number, y1: number): void {
    const tree = model.tree;
    const dir = model.dir;
    let normal = "";
    let alias = "";
    let lit = "";
    let drawn = 0;
    for (let i = 0; i < lay.order.length && drawn < 4000; i++) {
      const id = lay.order[i]!;
      const n = tree.nodes[id]!;
      const rows = lay.rowsShown[id]!;
      if (rows === 0) continue;
      for (let r = 0; r < rows; r++) {
        const row = n.rows[r]!;
        const target = row.child >= 0 ? row.child : row.link;
        if (target < 0 || lay.at[target]! < 0) continue;
        const e = edgeEnds(lay, id, r, target, dir, row.child < 0);
        const left = Math.min(e[0], e[2]);
        const right = Math.max(e[0], e[2]);
        const top = Math.min(e[1], e[3]);
        const bottom = Math.max(e[1], e[3]);
        if (right < x0 || left > x1 || bottom < y0 || top > y1) continue;
        const d = curve(e, dir);
        drawn++;
        if (row.child < 0) alias += d;
        else if (target === this.selId || id === this.selId) lit += d;
        else normal += d;
      }
    }
    this.edges.setAttribute("d", normal);
    this.aliases.setAttribute("d", alias);
    this.lit.setAttribute("d", lit);
  }

  /** Redraw every box (its content changed), keeping the view. */
  private refresh(): void {
    this.version++;
    this.relayout();
    this.schedule();
  }

  /* ---------- The view ---------- */

  private zoomAbout(next: number, cx: number, cy: number): void {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    const k = z / this.zoom;
    this.px = cx - (cx - this.px) * k;
    this.py = cy - (cy - this.py) * k;
    this.zoom = z;
    this.schedule();
  }

  zoomBy(factor: number): void {
    this.zoomAbout(this.zoom * factor, this.stage.clientWidth / 2, this.stage.clientHeight / 2);
  }

  /** The whole diagram in view when it fits at 100 %; else its first box, at a readable size. */
  fit(): void {
    const lay = this.lay;
    if (!lay || lay.order.length === 0) return;
    const W = this.stage.clientWidth || 800;
    const H = this.stage.clientHeight || 600;
    const b = lay.bounds;
    const pad = 32;
    const z = Math.min(1, (W - pad * 2) / Math.max(b.w, 1), (H - pad * 2) / Math.max(b.h, 1));
    if (z >= 0.4) {
      this.zoom = Math.max(MIN_ZOOM, z);
      this.px = (W - b.w * this.zoom) / 2 - b.x * this.zoom;
      this.py = (H - b.h * this.zoom) / 2 - b.y * this.zoom;
    } else {
      // Too large to read whole: the first box at 100 %, the rest by panning.
      this.zoom = 1;
      const first = lay.order[0]!;
      this.px = pad - lay.x[first]!;
      this.py = H / 2 - (lay.y[first]! + lay.h[first]! / 2);
    }
    this.schedule();
  }

  /** Pan so that a box is in view (centred when it was not). */
  private bring(id: number, always = false): void {
    const lay = this.lay;
    if (!lay || lay.at[id]! < 0) return;
    const W = this.stage.clientWidth || 800;
    const H = this.stage.clientHeight || 600;
    const sx = lay.x[id]! * this.zoom + this.px;
    const sy = lay.y[id]! * this.zoom + this.py;
    const sw = lay.w[id]! * this.zoom;
    const sh = lay.h[id]! * this.zoom;
    const inside = sx >= 0 && sy >= 0 && sx + sw <= W && sy + sh <= H;
    if (inside && !always) return;
    this.px = W / 2 - (lay.x[id]! + lay.w[id]! / 2) * this.zoom;
    this.py = H / 2 - (lay.y[id]! + lay.h[id]! / 2) * this.zoom;
    this.schedule();
  }

  private toggleDirection(): void {
    if (!this.model) return;
    this.model.dir = this.model.dir === "lr" ? "tb" : "lr";
    this.paintDirection();
    this.refresh();
    this.fit();
    this.host.changed();
  }

  /* ---------- Folding, moving ---------- */

  private setBase(base: Parameters<DiagramModel["setBase"]>[0]): void {
    if (!this.model) return;
    this.model.setBase(base);
    this.refresh();
    this.host.changed();
    if (this.focusId >= 0) this.ensureFocusVisible();
  }

  /** A fold may have hidden the focused box: focus goes to the nearest one still drawn. */
  private ensureFocusVisible(): void {
    const lay = this.lay;
    const model = this.model;
    if (!lay || !model) return;
    let id = this.focusId;
    while (id >= 0 && lay.at[id]! < 0) id = model.tree.nodes[id]!.parent;
    if (id >= 0 && id !== this.focusId) this.focusId = id;
  }

  toggleFold(id: number): void {
    const model = this.model;
    if (!model || !model.isFoldable(id)) return;
    model.toggle(id);
    this.refresh();
    this.ensureFocusVisible();
    this.host.changed();
    const n = model.node(id);
    this.host.say(`${n.label || dgw.rootLabel}: ${model.folded[id] === 1 ? dgw.fold : dgw.unfold}`);
  }

  private rearrange(): void {
    if (!this.model) return;
    this.model.rearrange();
    this.refresh();
    this.fit();
    this.host.changed();
    this.host.say(dgw.arranged);
  }

  /** Move a box by (dx, dy) world units: with what hangs under it, or alone. */
  moveBox(id: number, dx: number, dy: number, alone: boolean): void {
    if (!this.model) return;
    this.model.move(id, dx, dy, alone);
    this.relayout();
    this.schedule();
  }

  /* ---------- Search ---------- */

  private runSearch(jump = true): void {
    this.searchStale = false;
    const model = this.model;
    const q = this.search.value;
    this.hits.clear();
    this.at = -1;
    if (!model || q.trim() === "") {
      this.found = { matches: [], more: false };
      this.count.textContent = "";
      this.version++;
      this.schedule();
      return;
    }
    this.found = searchTree(model.tree, q);
    for (const m of this.found.matches) {
      let set = this.hits.get(m.node);
      if (!set) this.hits.set(m.node, (set = new Set()));
      set.add(m.row);
    }
    // The ones that are drawn are marked as drawn; the way to the first is opened on request.
    if (this.found.matches.length > 0 && jump) this.goTo(0);
    else {
      this.count.textContent = dgw.matchCount(0, this.found.matches.length, this.found.more);
      this.version++;
      this.schedule();
    }
  }

  private step(delta: 1 | -1): void {
    const n = this.found.matches.length;
    if (n === 0) return void this.runSearch();
    this.goTo((this.at + delta + n) % n);
  }

  /** Open the way to match `i` and show it. */
  private goTo(i: number): void {
    const model = this.model;
    const m = this.found.matches[i];
    if (!model || !m) return;
    this.at = i;
    model.revealRow(m.node, m.row);
    this.count.textContent = dgw.matchCount(i + 1, this.found.matches.length, this.found.more);
    this.refresh();
    this.bring(m.node, true);
    this.host.say(this.count.textContent);
  }

  /* ---------- Selection, text sync, focus ---------- */

  private select(id: number, row = -1, tell = true): void {
    const model = this.model;
    if (!model) return;
    this.selId = id;
    this.selRow = row;
    this.focusId = id;
    this.version++;
    this.schedule();
    if (!tell) return;
    const n = model.node(id);
    const r = row >= 0 ? n.rows[row] : undefined;
    if (r) this.host.select({ from: Math.min(r.keyFrom, r.from), to: Math.max(r.to, r.from) });
    else this.host.select({ from: n.from, to: n.to });
  }

  /** The caret of the text is at `pos`: mark the box (and row) that holds it. */
  showCaret(pos: number): void {
    const model = this.model;
    const lay = this.lay;
    if (!model || !lay) return;
    const at = locate(model.tree, pos);
    let id = at?.node ?? -1;
    let row = at?.row ?? -1;
    // Inside a branch that is folded, the nearest box still drawn stands for it.
    while (id >= 0 && lay.at[id]! < 0) {
      row = -1;
      id = model.tree.nodes[id]!.parent;
    }
    if (id === this.caretId && row === this.caretRow) return;
    this.caretId = id;
    this.caretRow = row;
    this.version++;
    if (id >= 0) this.bring(id);
    this.schedule();
  }

  /** The box in the tree that has the tab stop, or the first. */
  focusBox(): void {
    if (this.focusId < 0) return;
    this.setFocus(this.focusId);
  }

  private setFocus(id: number, bring = true): void {
    if (!this.lay || this.lay.at[id]! < 0) return;
    this.focusId = id;
    if (bring) this.bring(id);
    this.render();
    this.boxes.get(id)?.el.focus({ preventScroll: true });
  }

  focusSearch(): void {
    this.search.focus();
    this.search.select();
  }

  /* ---------- The boxes' menu ---------- */

  private menu(id: number, row: number, x: number, y: number): void {
    const model = this.model;
    if (!model) return;
    const n = model.node(id);
    const r = row >= 0 ? n.rows[row] : undefined;
    const items: MenuItem[] = [];
    const path = r ? rowPath(model.tree, id, row) : pathOf(model.tree, id);
    items.push([dgw.copyPath, () => { this.host.copy(path); this.host.say(dgw.copiedPath(path)); }, "copy"]);
    const value = r && r.child < 0 ? r.text : this.text.slice(r ? r.from : n.from, Math.min(r ? r.to : n.to, (r ? r.from : n.from) + 200_000));
    items.push([dgw.copyValue, () => { this.host.copy(value); this.host.say(dgw.copiedValue); }, "copy"]);
    if (this.host.canText) items.push([dgw.showInText, () => this.host.toText(r ? { from: Math.min(r.keyFrom, r.from), to: r.to } : { from: n.from, to: n.to }), "source"]);
    if (model.isFoldable(id)) items.push([model.folded[id] === 1 ? dgw.unfold : dgw.fold, () => this.toggleFold(id), "chevron"]);
    showMenu(x, y, items);
  }

  private showFull(id: number, row: number, opener: HTMLElement): void {
    const model = this.model;
    const r = model?.node(id).rows[row];
    if (!r) return;
    this.fullPanel?.remove();
    const panel = h("div", "dg-full");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", dgw.showAllTitle);
    const body = h("pre", "dg-full-text", r.text);
    body.tabIndex = 0;
    const actions = h("div", "dg-full-actions");
    const copy = h("button", "ghost", dgw.copyValue);
    copy.type = "button";
    copy.addEventListener("click", () => { this.host.copy(r.text); this.host.say(dgw.copiedValue); });
    const close = h("button", "ghost", dgw.close);
    close.type = "button";
    const done = (): void => {
      panel.remove();
      this.fullPanel = null;
      (opener.isConnected ? opener : this.boxes.get(id)?.el)?.focus({ preventScroll: true });
    };
    close.addEventListener("click", done);
    panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        done();
      }
    });
    actions.append(copy, close);
    panel.append(body, actions);
    this.el.append(panel);
    this.fullPanel = panel;
    body.focus();
  }

  /* ---------- Input ---------- */

  private wire(): void {
    const stage = this.stage;
    stage.addEventListener("scroll", () => {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    });
    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        if (e.ctrlKey || e.metaKey) {
          // A trackpad's pinch comes as Ctrl with the wheel.
          this.zoomAbout(this.zoom * Math.exp(-e.deltaY * 0.01), cx, cy);
          return;
        }
        this.px -= e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        if (!e.shiftKey || e.deltaX !== 0) this.py -= e.deltaY;
        this.schedule();
      },
      { passive: false },
    );
    // A trackpad's pinch in WebKit is a gesture.
    let pinchFrom = 1;
    stage.addEventListener("gesturestart", (e) => {
      e.preventDefault();
      pinchFrom = this.zoom;
    });
    stage.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      if (fingers.size > 1) return;
      const r = stage.getBoundingClientRect();
      this.zoomAbout(pinchFrom * (e as Event & { scale: number }).scale, r.width / 2, r.height / 2);
    });

    // Two fingers pinch and move the diagram (ADR 0076 item 3).
    const fingers = new Map<number, { x: number; y: number }>();
    let two: { d: number; mx: number; my: number; zoom: number; px: number; py: number } | null = null;
    const pair = (): { d: number; mx: number; my: number } | null => {
      const [a, b] = [...fingers.values()];
      if (!a || !b) return null;
      const r = stage.getBoundingClientRect();
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
    };
    type Gesture =
      | { kind: "pan"; id: number; x: number; y: number; px: number; py: number; moved: boolean }
      | { kind: "drag"; id: number; pointer: number; x: number; y: number; lastX: number; lastY: number; started: boolean; alone: boolean };
    let gesture: Gesture | null = null;

    stage.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = fingers.size === 2 ? pair() : null;
        if (p) {
          two = { ...p, zoom: this.zoom, px: this.px, py: this.py };
          gesture = null;
        }
      },
      true,
    );
    stage.addEventListener(
      "pointermove",
      (e) => {
        if (!fingers.has(e.pointerId)) return;
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = two ? pair() : null;
        if (!two || !p || two.d === 0) return;
        const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (two.zoom * p.d) / two.d));
        const k = z / two.zoom;
        this.px = p.mx - (two.mx - two.px) * k;
        this.py = p.my - (two.my - two.py) * k;
        this.zoom = z;
        this.schedule();
      },
      true,
    );
    const lift = (e: PointerEvent): void => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) two = null;
    };
    stage.addEventListener("pointerup", lift, true);
    stage.addEventListener("pointercancel", lift, true);

    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || two) return;
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;
      const head = target.closest<HTMLElement>(".dg-head");
      const box = target.closest<HTMLElement>(".dg-box");
      if (head && box) {
        stage.setPointerCapture(e.pointerId);
        gesture = { kind: "drag", id: Number(box.dataset["id"]), pointer: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, started: false, alone: e.altKey };
        return;
      }
      if (box) return; // rows: a click, below
      stage.setPointerCapture(e.pointerId);
      gesture = { kind: "pan", id: e.pointerId, x: e.clientX, y: e.clientY, px: this.px, py: this.py, moved: false };
    });
    stage.addEventListener("pointermove", (e) => {
      const g = gesture;
      if (!g || two) return;
      if (g.kind === "pan") {
        if (e.pointerId !== g.id) return;
        if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3) g.moved = true;
        this.px = g.px + (e.clientX - g.x);
        this.py = g.py + (e.clientY - g.y);
        this.schedule();
        return;
      }
      if (e.pointerId !== g.pointer) return;
      if (!g.started) {
        if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) < 4) return;
        g.started = true;
        stage.classList.add("dg-dragging");
      }
      this.moveBox(g.id, (e.clientX - g.lastX) / this.zoom, (e.clientY - g.lastY) / this.zoom, g.alone);
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    });
    const end = (e: PointerEvent): void => {
      const g = gesture;
      if (!g) return;
      if (g.kind === "pan" ? e.pointerId !== g.id : e.pointerId !== g.pointer) return;
      gesture = null;
      stage.classList.remove("dg-dragging");
      if (g.kind === "drag") {
        if (g.started) {
          this.host.changed();
          const n = this.model?.node(g.id);
          if (n) this.host.say(dgw.moved(n.label || dgw.rootLabel));
        } else {
          this.select(g.id);
          this.setFocus(g.id, false);
        }
      }
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    stage.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const box = t.closest<HTMLElement>(".dg-box");
      if (!box) return;
      const id = Number(box.dataset["id"]);
      const part = t.closest<HTMLElement>("[data-part]")?.dataset["part"];
      if (part === "fold") return this.toggleFold(id);
      if (part === "more") {
        this.model?.showMore(id);
        this.refresh();
        return;
      }
      const rowEl = t.closest<HTMLElement>(".dg-row");
      const row = rowEl ? Number(rowEl.dataset["row"]) : -1;
      if (part === "cut") return this.showFull(id, row, t);
      if (row >= 0) {
        this.select(id, row);
        this.setFocus(id, false);
        // A line's row leads to its box: following it is a second click on the box.
      }
    });
    stage.addEventListener("dblclick", (e) => {
      const head = (e.target as HTMLElement).closest(".dg-head");
      const box = (e.target as HTMLElement).closest<HTMLElement>(".dg-box");
      if (head && box && !(e.target as HTMLElement).closest("button")) this.toggleFold(Number(box.dataset["id"]));
    });
    stage.addEventListener("contextmenu", (e) => {
      const box = (e.target as HTMLElement).closest<HTMLElement>(".dg-box");
      if (!box) return;
      e.preventDefault();
      const rowEl = (e.target as HTMLElement).closest<HTMLElement>(".dg-row");
      this.menu(Number(box.dataset["id"]), rowEl ? Number(rowEl.dataset["row"]) : -1, e.clientX, e.clientY);
    });
    stage.addEventListener("focusin", (e) => {
      const box = (e.target as HTMLElement).closest<HTMLElement>(".dg-box");
      if (box && (e.target as HTMLElement) === box) {
        const id = Number(box.dataset["id"]);
        if (id !== this.focusId) {
          this.focusId = id;
          this.schedule();
        }
      }
    });
    stage.addEventListener("keydown", (e) => this.key(e));
  }

  private kidsDrawn(id: number): number[] {
    const lay = this.lay;
    if (!lay || !this.model) return [];
    return this.model.node(id).kids.filter((k) => lay.at[k]! >= 0);
  }

  private siblings(id: number): number[] {
    const model = this.model;
    if (!model) return [];
    const n = model.node(id);
    return n.parent < 0 ? model.tree.roots : this.kidsDrawn(n.parent);
  }

  private key(e: KeyboardEvent): void {
    const model = this.model;
    const lay = this.lay;
    const target = e.target as HTMLElement;
    if (!model || !lay || !target.classList.contains("dg-box") || e.ctrlKey || e.metaKey) return;
    const id = Number(target.dataset["id"]);
    const n = model.node(id);
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = arrows[e.key];
    if (e.altKey) {
      if (!mv) return;
      e.preventDefault();
      e.stopPropagation();
      // Alt with an arrow is the twin of a drag (the box and what hangs under it);
      // Alt and Shift with it, the twin of an Alt-drag (the box alone). WCAG 2.5.7.
      this.moveBox(id, mv[0] * STEP, mv[1] * STEP, e.shiftKey);
      this.host.changed();
      this.host.say(dgw.moved(n.label || dgw.rootLabel));
      return;
    }
    if (e.shiftKey && e.key === "F10") {
      e.preventDefault();
      const r = target.getBoundingClientRect();
      this.menu(id, -1, r.left + 12, r.bottom);
      return;
    }
    let go = -1;
    switch (e.key) {
      case "ArrowLeft":
        go = n.parent;
        break;
      case "ArrowRight": {
        if (model.folded[id] === 1 && model.isFoldable(id)) {
          e.preventDefault();
          this.toggleFold(id);
          return;
        }
        go = this.kidsDrawn(id)[0] ?? -1;
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
        const sib = this.siblings(id);
        const at = sib.indexOf(id);
        go = sib[at + (e.key === "ArrowUp" ? -1 : 1)] ?? -1;
        break;
      }
      case "Home":
        go = lay.order[0] ?? -1;
        break;
      case "End":
        go = lay.order[lay.order.length - 1] ?? -1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        e.stopPropagation();
        this.toggleFold(id);
        return;
      case "t":
      case "T":
        if (!this.host.canText) return;
        e.preventDefault();
        e.stopPropagation();
        this.host.toText({ from: n.from, to: n.to });
        return;
      case "/":
        e.preventDefault();
        e.stopPropagation();
        this.focusSearch();
        return;
      case "ContextMenu": {
        e.preventDefault();
        const r = target.getBoundingClientRect();
        this.menu(id, -1, r.left + 12, r.bottom);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (go >= 0 && lay.at[go]! >= 0) {
      this.select(go, -1);
      this.setFocus(go);
    }
  }

  /** Drawn boxes with their places, for "Save as board". */
  arranged(): { tree: Tree; lay: Layout; dir: "lr" | "tb" } | null {
    return this.model && this.lay ? { tree: this.model.tree, lay: this.lay, dir: this.model.dir } : null;
  }

  destroy(): void {
    window.clearTimeout(this.searchTimer);
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.resizer?.disconnect();
    this.fullPanel?.remove();
  }
}
