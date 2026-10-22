// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type NoteText } from "../bindings";
import { ask } from "../dialog";
import { button, h } from "../dom";
import { allNotes } from "../folder";
import { icon } from "../icons";
import { calm } from "../format";
import { Pane } from "../layout/pane";
import { openNote, persistSoon } from "../layout/spaces";
import { tapKind, type Tap } from "./tapKind";
import { arrowDir, firstCurrent, walk } from "./graphWalk";
import { createNote } from "../files";
import { Kind, dirOf, name } from "../paths";
import { type MissingLink, type MissingNode, isMissingId, missingNodes } from "./graphMissing";
import { st } from "../screen/strings";
import { t } from "../strings";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";

/** How long typing in the filter must pause before the count is announced. */
const COUNT_PAUSE_MS = 1000;

/* The graph: every note of the vault and every resolved link, or the
 * neighbourhood of one note to a chosen depth. Force-laid in SVG,
 * zoomed and panned, filtered by name or tag, colored by folder. */
export type GraphOpts = { filter: string; tag: string; depth: number; orphans: boolean; repel: number; distance: number; size: number; colors: boolean; labels: boolean; existingOnly: boolean };
export const GRAPH_DEFAULTS: GraphOpts = { filter: "", tag: "", depth: 2, orphans: true, repel: 1, distance: 1, size: 1, colors: true, labels: true, existingOnly: true };
export type GNode = { id: string; x: number; y: number; vx: number; vy: number; degree: number; depth: number; folder: string; missing?: MissingNode };
export class GraphLeaf extends Leaf {
  readonly kind: Kind = "graph";
  readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  readonly world = document.createElementNS("http://www.w3.org/2000/svg", "g");
  readonly title = h("h1", "note-title");
  readonly count = h("span", "graph-count");
  /** What a screen reader hears of the count: the same words, a second after
   *  typing in the filter stops (A11Y.16), not at every key. */
  private readonly countLive = h("span", "sr-only");
  private countTimer = 0;
  readonly controls = h("aside", "graph-controls");
  readonly legend = h("div", "graph-legend");
  private opts: GraphOpts = { ...GRAPH_DEFAULTS };
  private edges: [string, string][] = [];
  private tags: { name: string; notes: string[] }[] = [];
  /** Links no note answers to, asked of the core once the filter that hides
   *  them is turned off (spec Q14, decision B). */
  private missingLinks: MissingLink[] | null = null;
  /** The core would not name missing notes here (a shared folder). */
  private missingRefused = false;
  private nodes: GNode[] = [];
  private stop: (() => void) | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private held: GNode | null = null;
  /** The note the arrows are on: kept across redraws, so a click that centres
   *  the graph (and redraws every node) does not lose the keyboard. */
  private cur: string | null = null;
  /** The note the arrows reached, said once to a screen reader. */
  private readonly curLive = h("span", "sr-only graph-current-live");
  /** The one control that clears the centre, the filter and the tag. */
  private readonly showAll = button("ghost graph-show-all", st.graphShowAll);
  /** The same control inside the controls panel, for where the panel covers the head. */
  private readonly showAllInPanel = button("ghost graph-show-all in-panel", st.graphShowAll);
  private filterInput: HTMLInputElement | null = null;
  private filterClear: HTMLButtonElement | null = null;
  constructor(pane: Pane) {
    super(pane);
    try {
      const raw = localStorage.getItem("verso.graph");
      if (raw) this.opts = { ...GRAPH_DEFAULTS, ...(JSON.parse(raw) as Partial<GraphOpts>) };
    } catch { /* no storage */ }
    const top = h("header", "leaf-head");
    top.append(h("span", "crumbs", t.graph));
    const stage = h("div", "graph-stage");
    this.svg.setAttribute("class", "graph");
    // The drawing is a group of notes, named by the graph's title.
    this.title.id = `verso-graph-${this.tab.id}`;
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-labelledby", this.title.id);
    this.svg.append(this.world);
    // The graph takes the keys: one Tab stop, focused by a click on the
    // background or on a note (a click used to leave the focus on a note that
    // centring then redrew away, so the arrows reached nothing).
    this.svg.tabIndex = 0;
    this.svg.addEventListener("keydown", (e) => this.onKey(e));
    this.svg.addEventListener("pointerdown", () => this.svg.focus({ preventScroll: true }), true);
    this.svg.addEventListener("focus", () => this.markCurrent(false));
    this.svg.addEventListener("blur", () => this.dots.forEach((d) => d.unlight()));
    this.showAll.dataset["role"] = "whole";
    for (const b of [this.showAll, this.showAllInPanel]) {
      b.hidden = true;
      b.addEventListener("click", () => this.clearAll());
    }
    this.curLive.setAttribute("role", "status");
    const head = h("div", "graph-head");
    // On a phone, or in a pane under 520 px, the controls are a panel
    // closed by default, opened by this button over the graph (ADR 0076
    // item 3; `css/screen.css` says when it shows).
    this.controls.id = `verso-graph-controls-${this.tab.id}`;
    const toggle = h("button", "ghost graph-controls-toggle");
    toggle.type = "button";
    toggle.append(icon("filter"), h("span", "", st.graphControls));
    toggle.setAttribute("aria-controls", this.controls.id);
    toggle.setAttribute("aria-expanded", "false");
    const body = h("div", "graph-body");
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("controls-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    head.append(this.title, this.count, this.countLive, this.showAll, toggle);
    // How many notes and links the filters leave, announced once the typing
    // pauses; the count drawn changes at once.
    this.countLive.setAttribute("role", "status");
    this.count.setAttribute("aria-hidden", "true");
    // The help for the input the screen has: a finger, or a mouse and keys.
    const hint = h("p", "graph-hint");
    const coarse = window.matchMedia("(pointer: coarse)");
    const paintHint = (): void => void (hint.textContent = coarse.matches ? st.graphHintTouch : t.graphHint);
    paintHint();
    coarse.addEventListener("change", paintHint);
    stage.append(head, this.svg, hint, this.curLive);
    body.append(stage, this.controls);
    this.el.append(top, body);
    this.buildControls();
    this.wireStage();
  }
  override headings(): NoteText["headings"] {
    return [];
  }
  private save(): void {
    try { localStorage.setItem("verso.graph", JSON.stringify(this.opts)); } catch { /* no storage */ }
  }
  private buildControls(): void {
    const c = this.controls;
    c.append(this.showAllInPanel);
    const field = (label: string, input: HTMLElement) => {
      const l = h("label", "graph-field");
      l.append(h("span", "", label), input);
      c.append(l);
      return l;
    };
    const filter = h("input", "graph-filter");
    filter.type = "search";
    filter.placeholder = t.graphFilter;
    filter.setAttribute("aria-label", t.graphFilter);
    filter.value = this.opts.filter;
    filter.addEventListener("input", () => { this.opts.filter = filter.value; this.save(); this.rebuild(); });
    // Esc in the field clears it; the keys stay the field's, not the window's.
    filter.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" && filter.value !== "") { e.preventDefault(); this.clearFilter(); }
    });
    this.filterInput = filter;
    const clearX = button("ghost iconic graph-filter-clear", st.graphClearFilter);
    clearX.textContent = "×";
    clearX.setAttribute("aria-label", st.graphClearFilter);
    clearX.title = st.graphClearFilter;
    clearX.hidden = filter.value === "";
    clearX.addEventListener("click", () => { this.clearFilter(); filter.focus(); });
    this.filterClear = clearX;
    const wrap = h("div", "graph-filter-wrap");
    wrap.append(filter, clearX);
    c.append(wrap);
    const tag = h("select");
    tag.addEventListener("change", () => { this.opts.tag = tag.value; this.save(); this.rebuild(); });
    tag.dataset["role"] = "tag";
    field(t.tags, tag);
    const depth = h("select");
    for (const d of [1, 2, 3]) {
      const o = h("option", "", String(d));
      o.value = String(d);
      o.selected = this.opts.depth === d;
      depth.append(o);
    }
    depth.addEventListener("change", () => { this.opts.depth = Number(depth.value); this.save(); void this.load(this.path); });
    field(t.graphDepth, depth).dataset["role"] = "depth";
    const check = (label: string, key: "orphans" | "colors" | "labels" | "existingOnly") => {
      const box = h("input");
      box.type = "checkbox";
      box.checked = this.opts[key];
      box.addEventListener("change", () => {
        this.opts[key] = box.checked;
        this.save();
        if (key === "existingOnly" && !box.checked) void this.askMissing().then(() => this.rebuild());
        else this.rebuild();
      });
      const l = h("label", "graph-check");
      l.append(box, h("span", "", label));
      c.append(l);
    };
    check(st.graphExisting, "existingOnly");
    check(t.graphOrphans, "orphans");
    check(t.graphLabels, "labels");
    check(t.graphColors, "colors");
    const slider = (label: string, key: "repel" | "distance" | "size") => {
      const r = h("input");
      r.type = "range";
      r.min = "0.3"; r.max = "2.5"; r.step = "0.05";
      r.value = String(this.opts[key]);
      r.addEventListener("input", () => { this.opts[key] = Number(r.value); this.save(); this.restyle(); this.resume(); });
      field(label, r);
    };
    slider(t.graphRepel, "repel");
    slider(t.graphDistance, "distance");
    slider(t.graphSize, "size");
    const zoomRow = h("div", "graph-zoom");
    const zb = (ic: string, title: string, run: () => void) => {
      const b = button("ghost iconic", title, ic);
      b.addEventListener("click", run);
      zoomRow.append(b);
    };
    zb("zoomOut", t.graphZoomOut, () => this.zoomTo(Math.max(0.15, this.zoom / 1.25)));
    zb("zoomIn", t.graphZoomIn, () => this.zoomTo(Math.min(6, this.zoom * 1.25)));
    zb("fitWidth", t.graphFit, () => this.fit());
    c.append(zoomRow);
    c.append(this.legend);
  }
  private wireStage(): void {
    const svg = this.svg;
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;

      // Trackpad pinch gesture (WebKit sets ctrlKey: true) or Ctrl/Meta + wheel
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const next = Math.max(0.15, Math.min(6, this.zoom * factor));
        const k = next / this.zoom;
        this.pan.x = mx - (mx - this.pan.x) * k;
        this.pan.y = my - (my - this.pan.y) * k;
        this.zoom = next;
        this.applyView();
        return;
      }

      // Trackpad 2-finger pan or Shift+wheel pan
      if (e.shiftKey || Math.abs(e.deltaX) > 0) {
        this.pan.x -= (e.shiftKey ? e.deltaY : e.deltaX);
        if (!e.shiftKey) this.pan.y -= e.deltaY;
        this.applyView();
        return;
      }

      // Mouse wheel zoom centered at cursor
      const factor = Math.exp(-e.deltaY * 0.0025);
      const next = Math.max(0.15, Math.min(6, this.zoom * factor));
      const k = next / this.zoom;
      this.pan.x = mx - (mx - this.pan.x) * k;
      this.pan.y = my - (my - this.pan.y) * k;
      this.zoom = next;
      this.applyView();
    }, { passive: false });
    // A trackpad's pinch in WebKit: a gesture, not a wheel. Two fingers on
    // a touch screen are the pointers' (below), which every engine sends:
    // the gesture is left to them then.
    let pinchStart = 1;
    svg.addEventListener("gesturestart", (e) => { e.preventDefault(); pinchStart = this.zoom; });
    svg.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      if (fingers.size > 1) return;
      const scale = (e as Event & { scale: number }).scale;
      this.zoomTo(Math.max(0.15, Math.min(6, pinchStart * scale)));
    });
    // Two fingers pinch and pan by pointer events (ADR 0076 item 3): the
    // zoom follows the distance between them, about their middle, and the
    // graph follows the middle.
    const fingers = new Map<number, { x: number; y: number }>();
    let two: { d: number; mx: number; my: number; zoom: number; px: number; py: number } | null = null;
    const pair = (): { d: number; mx: number; my: number } | null => {
      const [a, b] = [...fingers.values()];
      if (!a || !b) return null;
      const r = svg.getBoundingClientRect();
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left - r.width / 2, my: (a.y + b.y) / 2 - r.top - r.height / 2 };
    };
    svg.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = fingers.size === 2 ? pair() : null;
      if (p) two = { ...p, zoom: this.zoom, px: this.pan.x, py: this.pan.y };
    }, true);
    svg.addEventListener("pointermove", (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = two ? pair() : null;
      if (!two || !p || two.d === 0) return;
      const next = Math.max(0.15, Math.min(6, (two.zoom * p.d) / two.d));
      const k = next / two.zoom;
      // The point under the fingers' first middle stays under their middle.
      this.pan.x = p.mx - (two.mx - two.px) * k;
      this.pan.y = p.my - (two.my - two.py) * k;
      this.zoom = next;
      this.applyView();
    }, true);
    const lift = (e: PointerEvent): void => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) two = null;
    };
    svg.addEventListener("pointerup", lift, true);
    svg.addEventListener("pointercancel", lift, true);
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as Element).closest(".node")) return;
      const start = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      svg.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        // A second finger came: the pinch moves the graph now.
        if (two || ev.pointerId !== e.pointerId) return;
        this.pan.x = start.px + (ev.clientX - start.x);
        this.pan.y = start.py + (ev.clientY - start.y);
        this.applyView();
      };
      const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
    });
  }
  /** The filter text emptied: the graph shows what the centre and the tag leave. */
  private clearFilter(): void {
    this.opts.filter = "";
    if (this.filterInput) this.filterInput.value = "";
    this.save();
    this.rebuild();
  }
  /** Everything narrowing the view cleared at once: no centre, no filter, no
   *  tag. The whole vault's graph, as it opens from the ribbon. */
  private clearAll(): void {
    this.opts.filter = "";
    this.opts.tag = "";
    if (this.filterInput) this.filterInput.value = "";
    const tagSel = this.controls.querySelector<HTMLSelectElement>('select[data-role="tag"]');
    if (tagSel) tagSel.value = "";
    this.save();
    if (this.path !== "") void this.load("");
    else this.rebuild();
    this.svg.focus({ preventScroll: true });
  }
  /** The clear control shows whenever a centre, a filter or a tag narrows the view. */
  private syncClear(): void {
    const narrowed = this.path !== "" || this.opts.filter.trim() !== "" || this.opts.tag !== "";
    this.showAll.hidden = !narrowed;
    this.showAllInPanel.hidden = !narrowed;
    if (this.filterClear) this.filterClear.hidden = this.opts.filter === "";
  }
  /** The arrows, Home and End walk the notes, Enter opens, Shift-Enter centres. */
  private onKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = arrowDir(e.key);
    if (dir || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const to = dir ? walk(this.nodes, this.cur, dir) : (e.key === "Home" ? this.nodes[0] : this.nodes[this.nodes.length - 1])?.id ?? null;
      if (to) this.setCurrent(to, true);
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    const n = this.nodes.find((x) => x.id === this.cur);
    if (!n) return;
    e.preventDefault();
    this.lastTap = null;
    if (e.shiftKey && !n.missing) void this.load(n.id);
    else this.openNode(n);
  }
  /** Open the note, or for one that does not exist yet make it, as a click on
   *  its link in a note does. */
  private openNode(n: GNode): void {
    if (n.missing) void this.make(n.missing);
    else openNote(n.id, false);
  }
  /** Make this note the current one: ringed, its neighbours lit, in view, and
   *  said to a screen reader. */
  private setCurrent(id: string, say: boolean): void {
    this.cur = id;
    this.markCurrent(say);
    const d = this.dots.find((x) => x.n.id === id);
    if (d && say) this.reveal(d.n);
  }
  private markCurrent(say: boolean): void {
    let now: { g: SVGGElement; n: GNode; light: () => void } | undefined;
    for (const d of this.dots) {
      const on = d.n.id === this.cur;
      d.g.classList.toggle("current", on);
      if (on) now = d;
    }
    if (now) {
      this.svg.setAttribute("aria-activedescendant", now.g.id);
      if (document.activeElement === this.svg) now.light();
      if (say) this.curLive.textContent = st.graphCurrent(now.n.missing ? now.n.missing.target : name(now.n.id));
    } else this.svg.removeAttribute("aria-activedescendant");
  }
  /** Zoom about the middle of the stage. */
  private zoomTo(next: number): void {
    const k = next / this.zoom;
    this.pan.x *= k;
    this.pan.y *= k;
    this.zoom = next;
    this.applyView();
  }
  /** Everything in view: zoom and pan so the nodes fit the stage. */
  private fit(): void {
    if (this.nodes.length === 0) return;
    const r = this.svg.getBoundingClientRect();
    const xs = this.nodes.map((n) => n.x);
    const ys = this.nodes.map((n) => n.y);
    const w = Math.max(...xs) - Math.min(...xs) + 120;
    const hgt = Math.max(...ys) - Math.min(...ys) + 120;
    this.zoom = Math.max(0.15, Math.min(3, Math.min(r.width / w, r.height / hgt)));
    this.pan = { x: -((Math.max(...xs) + Math.min(...xs)) / 2) * this.zoom, y: -((Math.max(...ys) + Math.min(...ys)) / 2) * this.zoom };
    this.applyView();
  }
  private applyView(): void {
    const r = this.svg.getBoundingClientRect();
    this.world.setAttribute("transform", `translate(${r.width / 2 + this.pan.x} ${r.height / 2 + this.pan.y}) scale(${this.zoom})`);
  }
  /** A note the keyboard reached, panned to the middle when it is outside
   *  the stage: a focused note must not be out of sight (WCAG 2.4.11). */
  private reveal(n: GNode): void {
    const r = this.svg.getBoundingClientRect();
    const x = r.width / 2 + this.pan.x + n.x * this.zoom;
    const y = r.height / 2 + this.pan.y + n.y * this.zoom;
    const edge = 24;
    if (x >= edge && x <= r.width - edge && y >= edge && y <= r.height - edge) return;
    this.pan = { x: -n.x * this.zoom, y: -n.y * this.zoom };
    this.applyView();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    if (path !== "") this.cur = path;
    const local = path !== "";
    this.setTitle(local ? `${t.graph}: ${name(path)}` : t.graphWhole);
    this.title.textContent = local ? `${t.graphOf} ${name(path)}` : t.graphWhole;
    const [edges, tags] = await Promise.all([commands.graph(), commands.listTags()]);
    if (this.path !== path) return;
    this.edges = edges.status === "ok" ? edges.data.map((e) => [e.from, e.to] as [string, string]) : [];
    this.tags = tags.status === "ok" ? tags.data : [];
    const tagSel = this.controls.querySelector<HTMLSelectElement>('select[data-role="tag"]');
    if (tagSel) {
      tagSel.replaceChildren(h("option", "", t.graphAllTags));
      (tagSel.firstElementChild as HTMLOptionElement).value = "";
      for (const tg of this.tags) {
        const o = h("option", "", `#${tg.name} (${tg.notes.length})`);
        o.value = tg.name;
        o.selected = this.opts.tag === tg.name;
        tagSel.append(o);
      }
    }
    const depthField = this.controls.querySelector<HTMLElement>('[data-role="depth"]');
    if (depthField) depthField.hidden = !local;
    this.syncClear();
    this.missingLinks = null;
    this.missingRefused = false;
    if (!this.opts.existingOnly) await this.askMissing();
    if (this.path !== path) return;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.rebuild();
    markCurrent();
    persistSoon();
  }
  /** The links no note answers to, once per load; none when the core will not
   *  say (a shared folder), so the graph is then the existing files. */
  private async askMissing(): Promise<void> {
    if (this.missingLinks) return;
    const r = await commands.graphUnresolved();
    this.missingLinks = r.status === "ok" ? r.data : [];
    this.missingRefused = r.status !== "ok";
  }
  /** Nodes and edges after the filters, laid out from scratch. */
  private rebuild(): void {
    this.syncClear();
    const local = this.path !== "";
    const all = new Set(allNotes);
    let keep: Set<string>;
    let depthOf = new Map<string, number>();
    if (local) {
      // Breadth-first from the note, both directions, to the depth chosen.
      keep = new Set([this.path]);
      depthOf.set(this.path, 0);
      let frontier = [this.path];
      for (let d = 1; d <= this.opts.depth && frontier.length > 0; d++) {
        const next: string[] = [];
        for (const [a, b] of this.edges) {
          for (const [from, to] of [[a, b], [b, a]]) {
            if (frontier.includes(from!) && !keep.has(to!) && all.has(to!)) {
              keep.add(to!);
              depthOf.set(to!, d);
              next.push(to!);
            }
          }
        }
        frontier = next;
      }
    } else keep = new Set(all);
    const q = this.opts.filter.trim().toLowerCase();
    if (q) {
      const tagQ = q.startsWith("tag:") ? q.slice(4).replace(/^#/, "") : "";
      if (tagQ) {
        const inTag = new Set(this.tags.filter((tg) => tg.name.toLowerCase() === tagQ || tg.name.toLowerCase().startsWith(`${tagQ}/`)).flatMap((tg) => tg.notes));
        keep = new Set(Array.from(keep).filter((p) => inTag.has(p) || p === this.path));
      } else keep = new Set(Array.from(keep).filter((p) => p.toLowerCase().includes(q) || p === this.path));
    }
    if (this.opts.tag) {
      const inTag = new Set(this.tags.filter((tg) => tg.name === this.opts.tag).flatMap((tg) => tg.notes));
      keep = new Set(Array.from(keep).filter((p) => inTag.has(p) || p === this.path));
    }
    const edges: [string, string][] = this.edges.filter(([a, b]) => keep.has(a) && keep.has(b) && a !== b);
    const degree = new Map<string, number>();
    for (const [a, b] of edges) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    // Notes that do not exist yet, from the notes the filters kept.
    let missing: MissingNode[] = [];
    if (!this.opts.existingOnly && this.missingLinks) {
      const shaped = missingNodes(this.missingLinks, keep, local ? { depthOf, maxDepth: this.opts.depth } : undefined);
      missing = shaped.nodes;
      for (const [a, b] of shaped.edges) {
        edges.push([a, b]);
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
    }
    if (!this.opts.orphans) keep = new Set(Array.from(keep).filter((p) => (degree.get(p) ?? 0) > 0 || p === this.path));
    const spread = Math.sqrt(keep.size + missing.length) * 40;
    const old = new Map(this.nodes.map((n) => [n.id, n]));
    const real: GNode[] = Array.from(keep).map((id) => {
      const prev = old.get(id);
      return {
        id,
        x: prev?.x ?? (Math.random() - 0.5) * spread,
        y: prev?.y ?? (Math.random() - 0.5) * spread,
        vx: 0,
        vy: 0,
        degree: degree.get(id) ?? 0,
        depth: depthOf.get(id) ?? 1,
        folder: id.includes("/") ? id.split("/")[0] ?? "" : "",
      };
    });
    const hollow: GNode[] = missing.map((m) => {
      const prev = old.get(m.id);
      return { id: m.id, x: prev?.x ?? (Math.random() - 0.5) * spread, y: prev?.y ?? (Math.random() - 0.5) * spread, vx: 0, vy: 0, degree: degree.get(m.id) ?? 0, depth: m.depth, folder: "", missing: m };
    });
    this.nodes = [...real, ...hollow];
    const shown = edges.filter(([a, b]) => (keep.has(a) || isMissingId(a)) && (keep.has(b) || isMissingId(b)));
    let counted = missing.length > 0 ? st.graphNodesMissing(real.length, shown.length, missing.length) : t.graphNodes(real.length, shown.length);
    // Every action shows something: the filter turned off in a shared folder says why nothing appeared.
    if (!this.opts.existingOnly && this.missingRefused) counted += ` · ${st.graphMissingShared}`;
    this.count.textContent = counted;
    window.clearTimeout(this.countTimer);
    if (this.countLive.textContent === "") this.countLive.textContent = counted;
    else this.countTimer = window.setTimeout(() => void (this.countLive.textContent = counted), COUNT_PAUSE_MS);
    this.draw(shown);
  }
  private hue(folder: string): number {
    let x = 0;
    for (const ch of folder) x = (x * 31 + ch.charCodeAt(0)) % 360;
    return x;
  }
  private color(n: GNode): string {
    if (n.id === this.path) return "var(--seal)";
    if (!this.opts.colors) return "var(--brass)";
    return n.folder === "" ? "var(--brass)" : `oklch(62% 0.12 ${this.hue(n.folder)})`;
  }
  private restyle(): void {
    for (const el of this.svg.querySelectorAll<SVGCircleElement>(".node circle")) {
      const id = el.parentElement?.getAttribute("data-id") ?? "";
      const n = this.nodes.find((x) => x.id === id);
      if (n) el.setAttribute("r", String(this.radius(n)));
    }
  }
  private radius(n: GNode): number {
    return (n.id === this.path ? 9 : 3.5 + Math.min(6, Math.sqrt(n.degree) * 1.4)) * this.opts.size;
  }
  private frames = 0;
  private raf = 0;
  private lines: { l: SVGLineElement; a: GNode; b: GNode }[] = [];
  private dots: { g: SVGGElement; n: GNode; light: () => void; unlight: () => void }[] = [];
  /** The last click on a node, kept here because centring redraws the nodes. */
  private lastTap: Tap = null;
  private draw(edges: [string, string][]): void {
    this.stop?.();
    const NS = "http://www.w3.org/2000/svg";
    const world = this.world;
    world.replaceChildren();
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.lines = edges.flatMap(([a, b]) => {
      const na = byId.get(a);
      const nb = byId.get(b);
      if (!na || !nb) return [];
      const l = document.createElementNS(NS, "line");
      l.setAttribute("class", "edge");
      world.append(l);
      return [{ l, a: na, b: nb }];
    });
    const neighbours = new Map<string, Set<string>>();
    for (const { a, b } of this.lines) {
      (neighbours.get(a.id) ?? neighbours.set(a.id, new Set()).get(a.id)!).add(b.id);
      (neighbours.get(b.id) ?? neighbours.set(b.id, new Set()).get(b.id)!).add(a.id);
    }
    this.dots = this.nodes.map((n, idx) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `node${n.id === this.path ? " center" : ""}${n.missing ? " missing" : ""}`);
      g.setAttribute("data-id", n.id);
      g.id = `${this.title.id}-n${idx}`;
      // Its note where the pointer rests, and under a finger held still
      // (ADR 0085 items 2 and 5). A note that does not exist has none.
      if (!n.missing) {
        g.setAttribute("data-preview-path", n.id);
        g.setAttribute("data-preview-press", "");
      }
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", String(this.radius(n)));
      // A note that does not exist yet is hollow and dashed (css), not only
      // another colour (A11Y.12).
      if (!n.missing) c.style.fill = this.color(n);
      const label = document.createElementNS(NS, "text");
      label.textContent = n.missing ? n.missing.target : name(n.id);
      label.setAttribute("dy", String(-this.radius(n) - 4));
      if (!this.opts.labels && n.id !== this.path) label.classList.add("quiet");
      g.append(c, label);
      let moved = false;
      g.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        moved = false;
        this.held = n;
        const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
        g.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const dx = (ev.clientX - start.x) / this.zoom;
          const dy = (ev.clientY - start.y) / this.zoom;
          if (Math.hypot(dx, dy) > 3) moved = true;
          n.x = start.nx + dx;
          n.y = start.ny + dy;
          n.vx = 0;
          n.vy = 0;
          this.resume();
        };
        const up = () => {
          g.removeEventListener("pointermove", move);
          g.removeEventListener("pointerup", up);
          this.held = null;
        };
        g.addEventListener("pointermove", move);
        g.addEventListener("pointerup", up);
      });
      // Open the note, or for one that does not exist yet make it, as a
      // click on its link in a note does.
      const open = (): void => this.openNode(n);
      // A click centres the graph on the note; a second on it, inside the
      // double-click interval, opens it (a hollow one: makes it). Both mouse
      // and touch arrive as `click`; a drag does neither.
      g.addEventListener("click", () => {
        if (moved) return;
        this.cur = n.id;
        this.markCurrent(false);
        const r = tapKind(this.lastTap, n.id, performance.now());
        this.lastTap = r.last;
        if (r.kind === "double") open();
        else if (!n.missing && n.id !== this.path) void this.load(n.id);
      });
      // From the keyboard the graph is one Tab stop (its stage, see onKey);
      // the notes are named and reached through it.
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", n.missing ? st.graphMissingNode(n.missing.target) : name(n.id));
      // Its neighbours lit, by the pointer or the keyboard alike.
      const light = () => {
        const near = neighbours.get(n.id) ?? new Set();
        for (const d of this.dots) d.g.classList.toggle("dim", d.n !== n && !near.has(d.n.id));
        for (const ln of this.lines) ln.l.classList.toggle("lit", ln.a === n || ln.b === n);
        for (const ln of this.lines) ln.l.classList.toggle("dim", !(ln.a === n || ln.b === n));
      };
      const unlight = () => {
        for (const d of this.dots) d.g.classList.remove("dim");
        for (const ln of this.lines) ln.l.classList.remove("lit", "dim");
      };
      g.addEventListener("mouseenter", light);
      g.addEventListener("mouseleave", unlight);
      world.append(g);
      return { g, n, light, unlight };
    });
    this.cur = firstCurrent(this.nodes, this.path, this.cur);
    this.markCurrent(false);
    this.legend.replaceChildren();
    if (this.opts.colors) {
      const folders = Array.from(new Set(this.nodes.map((n) => n.folder).filter(Boolean))).sort().slice(0, 12);
      for (const f of folders) {
        const row = h("span", "graph-legend-item");
        const dot = h("span", "graph-legend-dot");
        dot.style.background = `oklch(62% 0.12 ${this.hue(f)})`;
        row.append(dot, h("span", "", f));
        this.legend.append(row);
      }
    }
    if (this.nodes.some((n) => n.missing)) {
      const row = h("span", "graph-legend-item");
      const mark = h("span", "graph-legend-dot missing");
      row.append(mark, h("span", "", st.graphMissingLegend));
      this.legend.append(row);
    }
    this.applyView();
    this.frames = 0;
    this.resume();
  }
  /** A note that does not exist yet, made — once the person says yes — in the
   *  folder of the first note that links to it and opened (the way a click on
   *  its link does). */
  private async make(m: MissingNode): Promise<void> {
    // A click, an Enter or a double click on a hollow node is easy to give
    // by accident: it asks first (G.1b, decided 2026-10-21).
    if (!(await ask(st.graphMakeAsk(m.target), { yes: st.graphMakeYes, no: t.cancel }))) return;
    const made = await createNote(dirOf(m.from[0] ?? ""), m.target, this.pane);
    if (made !== "exists" && this.el.isConnected) void this.load(this.path);
  }
  /** The simulation runs until it settles; any change wakes it. With
   *  reduced motion it settles out of sight and is painted once; only a
   *  node being dragged moves on screen. */
  private resume(): void {
    this.frames = 0;
    if (this.raf) return;
    const step = (): number => {
      const nodes = this.nodes;
      const repel = 1400 * this.opts.repel;
      const rest = 80 * this.opts.distance;
      const many = nodes.length > 400;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (many && d2 > 90000) continue;
          const d = Math.sqrt(Math.max(d2, 1));
          const f = repel / Math.max(d2, 1);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      for (const { a, b } of this.lines) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - rest) * 0.02;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      let energy = 0;
      for (const n of nodes) {
        if (n === this.held) { n.vx = 0; n.vy = 0; continue; }
        n.vx -= n.x * 0.002; n.vy -= n.y * 0.002;
        n.vx *= 0.8; n.vy *= 0.8;
        n.x += n.vx; n.y += n.vy;
        energy += n.vx * n.vx + n.vy * n.vy;
      }
      return energy;
    };
    const tick = () => {
      this.raf = 0;
      const settled = (energy: number) => energy <= 0.05 * this.nodes.length && this.frames >= 30;
      let energy = step();
      if (calm.matches && !this.held) while (++this.frames < 600 && !settled(energy)) energy = step();
      for (const { l, a, b } of this.lines) {
        l.setAttribute("x1", String(a.x)); l.setAttribute("y1", String(a.y));
        l.setAttribute("x2", String(b.x)); l.setAttribute("y2", String(b.y));
      }
      for (const { g, n } of this.dots) g.setAttribute("transform", `translate(${n.x} ${n.y})`);
      if (++this.frames < 600 && (!settled(energy) || this.held)) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.stop = () => { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  }
  override destroy(): void {
    window.clearTimeout(this.countTimer);
    this.stop?.();
  }
}
