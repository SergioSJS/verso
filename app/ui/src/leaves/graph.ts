// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands, type NoteText } from "../bindings";
import { button, h } from "../dom";
import { allNotes } from "../folder";
import { calm } from "../format";
import { Pane } from "../layout/pane";
import { openNote, persistSoon } from "../layout/spaces";
import { Kind, name } from "../paths";
import { t } from "../strings";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";

/* The graph: every note of the vault and every resolved link, or the
 * neighbourhood of one note to a chosen depth. Force-laid in SVG,
 * zoomed and panned, filtered by name or tag, colored by folder. */
export type GraphOpts = { filter: string; tag: string; depth: number; orphans: boolean; repel: number; distance: number; size: number; colors: boolean; labels: boolean };
export const GRAPH_DEFAULTS: GraphOpts = { filter: "", tag: "", depth: 2, orphans: true, repel: 1, distance: 1, size: 1, colors: true, labels: true };
export type GNode = { id: string; x: number; y: number; vx: number; vy: number; degree: number; depth: number; folder: string };
export class GraphLeaf extends Leaf {
  readonly kind: Kind = "graph";
  readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  readonly world = document.createElementNS("http://www.w3.org/2000/svg", "g");
  readonly title = h("h1", "note-title");
  readonly count = h("span", "graph-count");
  readonly controls = h("aside", "graph-controls");
  readonly legend = h("div", "graph-legend");
  private opts: GraphOpts = { ...GRAPH_DEFAULTS };
  private edges: [string, string][] = [];
  private tags: { name: string; notes: string[] }[] = [];
  private nodes: GNode[] = [];
  private stop: (() => void) | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private held: GNode | null = null;
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
    const head = h("div", "graph-head");
    head.append(this.title, this.count);
    // How many notes and links the filters leave, announced as they change.
    this.count.setAttribute("role", "status");
    stage.append(head, this.svg, h("p", "graph-hint", t.graphHint));
    const body = h("div", "graph-body");
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
    filter.addEventListener("keydown", (e) => e.stopPropagation());
    c.append(filter);
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
    const check = (label: string, key: "orphans" | "colors" | "labels") => {
      const box = h("input");
      box.type = "checkbox";
      box.checked = this.opts[key];
      box.addEventListener("change", () => { this.opts[key] = box.checked; this.save(); this.rebuild(); });
      const l = h("label", "graph-check");
      l.append(box, h("span", "", label));
      c.append(l);
    };
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
    const whole = button("ghost", t.graphWhole);
    whole.dataset["role"] = "whole";
    whole.addEventListener("click", () => void this.load(""));
    c.append(whole, this.legend);
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
    // WebKit's pinch: a gesture, not a wheel.
    let pinchStart = 1;
    svg.addEventListener("gesturestart", (e) => { e.preventDefault(); pinchStart = this.zoom; });
    svg.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      const scale = (e as Event & { scale: number }).scale;
      this.zoomTo(Math.max(0.15, Math.min(6, pinchStart * scale)));
    });
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as Element).closest(".node")) return;
      const start = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      svg.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        this.pan.x = start.px + (ev.clientX - start.x);
        this.pan.y = start.py + (ev.clientY - start.y);
        this.applyView();
      };
      const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up);
    });
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
    const whole = this.controls.querySelector<HTMLElement>('[data-role="whole"]');
    if (whole) whole.hidden = !local;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.rebuild();
    markCurrent();
    persistSoon();
  }
  /** Nodes and edges after the filters, laid out from scratch. */
  private rebuild(): void {
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
    const edges = this.edges.filter(([a, b]) => keep.has(a) && keep.has(b) && a !== b);
    const degree = new Map<string, number>();
    for (const [a, b] of edges) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    if (!this.opts.orphans) keep = new Set(Array.from(keep).filter((p) => (degree.get(p) ?? 0) > 0 || p === this.path));
    const spread = Math.sqrt(keep.size) * 40;
    const old = new Map(this.nodes.map((n) => [n.id, n]));
    this.nodes = Array.from(keep).map((id) => {
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
    this.count.textContent = t.graphNodes(this.nodes.length, edges.filter(([a, b]) => keep.has(a) && keep.has(b)).length);
    this.draw(edges.filter(([a, b]) => keep.has(a) && keep.has(b)));
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
  private dots: { g: SVGGElement; n: GNode }[] = [];
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
    this.dots = this.nodes.map((n) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `node${n.id === this.path ? " center" : ""}`);
      g.setAttribute("data-id", n.id);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", String(this.radius(n)));
      c.style.fill = this.color(n);
      const label = document.createElementNS(NS, "text");
      label.textContent = name(n.id);
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
      g.addEventListener("click", () => { if (!moved) openNote(n.id, false); });
      g.addEventListener("dblclick", () => void this.load(n.id));
      // From the keyboard: the graph is one Tab stop (the note in its
      // middle, else the first); the arrows walk the notes, Home and End
      // reach the ends, Enter opens one and Shift-Enter centers the graph
      // on it. Every node used to be a Tab stop of its own, hundreds of
      // them between the note and the graph's controls.
      g.setAttribute("tabindex", "-1");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", name(n.id));
      g.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
        if (step !== 0 || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const all = this.dots.length;
          const i = this.dots.findIndex((d) => d.g === g);
          const j = e.key === "Home" ? 0 : e.key === "End" ? all - 1 : (i + step + all) % all;
          this.dots[j]?.g.focus();
          return;
        }
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (e.shiftKey) void this.load(n.id);
        else openNote(n.id, false);
      });
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
      g.addEventListener("focus", () => {
        // The Tab stop follows the keyboard, and the note is brought into view.
        for (const d of this.dots) d.g.setAttribute("tabindex", d.g === g ? "0" : "-1");
        this.reveal(n);
        light();
      });
      g.addEventListener("blur", unlight);
      world.append(g);
      return { g, n };
    });
    (this.dots.find((d) => d.n.id === this.path) ?? this.dots[0])?.g.setAttribute("tabindex", "0");
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
    this.applyView();
    this.frames = 0;
    this.resume();
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
    this.stop?.();
  }
}
