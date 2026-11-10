// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A base on screen (ADR 0053): its views' menu, the tools that change the
// view (sort and group, filters, properties, settings), a search, and the
// layout — table, cards, list, kanban, calendar. The core evaluates; this
// draws, and changes the base's YAML the way Obsidian's own menus do.

import { commands, type BaseCell, type BaseGroup, type BaseResult, type PropertyValue } from "../bindings";
import { icon } from "../icons";
import { cellText, columnLabel, csv, errorText, h, markdownTable, type CellHost } from "./cells";
import { renderCalendar } from "./calendar";
import { renderCards } from "./cards";
import { renderKanban } from "./kanban";
import { renderList } from "./list";
import { renderMap, type MapHost } from "./map";
import { stringsFor, type BaseStrings } from "./strings";
import { renderTable } from "./table";
import * as Y from "./yaml";
import { placeInView } from "../screen/viewport";
import { fold } from "../text";
import { focusOnOpen } from "../screen/openFocus";

/** What a base needs from the window. */
export type BaseHost = CellHost & {
  /** Write one property of a note (invariant 11: over what was read);
   *  null removes nothing and empties the value. */
  setProperty(path: string, key: string, value: PropertyValue | null): Promise<boolean>;
  /** A new note in `folder` holding `props`; its path, or null. */
  newNote(folder: string, props: [string, PropertyValue][]): Promise<string | null>;
  menu(x: number, y: number, items: [string, () => void][]): void;
  status(text: string): void;
  ask(message: string, yes: string, no: string): Promise<boolean>;
  copy(text: string): Promise<void>;
  /** A new Markdown note named `name` holding `text`, opened. */
  saveNote(name: string, text: string): Promise<void>;
  /** The person only reads the folder (a reader on a server, ADR 0076
   *  item 11): the base and its notes change nothing. */
  readOnly?: () => boolean;
  /** What a map view needs (ADR 0094): the tile sources and their
   *  approval. Absent, a map view lists its places only. */
  maps?: MapHost;
};

/** Where a base comes from. */
export type BaseSource = {
  /** The `.base` file, when it is one. */
  path: string | null;
  /** The file `this` names. */
  thisPath: string | null;
  /** The folder new notes of this base go to. */
  folder: string;
  /** The base's text as it stands (unsaved edits included). */
  text(): string;
  /** Replace the base's text; null when the view cannot change it (a base
   *  embedded from another file, a block in reading mode). */
  edit: ((next: string) => void) | null;
  /** The view an embed names (`![[x.base#Nome]]`). */
  viewName: string | null;
  /** Read the base again before each question: a `.base` file embedded
   *  in a note, which another tab or window may have changed. */
  reload?: () => Promise<void>;
  /** What the chosen view and the calendar's month are remembered by. */
  key: string;
};

/** What a layout draws with. */
export type RenderCtx = {
  host: BaseHost;
  s: BaseStrings;
  result: BaseResult;
  /** The groups after the view's search. */
  groups: BaseGroup[];
  view: Y.ViewConfig;
  /** The view's place in the YAML; null for the default table. */
  index: number | null;
  /** Change the base's text for this view; null when it cannot change. */
  change: ((edit: (text: string, index: number) => string) => void) | null;
  newNote(props: [string, PropertyValue][]): void;
  refresh(): void;
  key: string;
  /** Values committed in a table's cell and not yet in the core's answer
   *  (a live note's room writes its file a moment later): shown in their
   *  cells until an answer agrees, the room saves, or the write fails. By
   *  `cellKey` of the note and property. */
  pending: Map<string, BaseCell>;
  /** What a layout keeps between drawings of this view (a map, with its
   *  MapLibre map); an entry with `destroy` is destroyed with the view. */
  keep: Map<string, unknown>;
  /** Drawn inside a note (a block or an embed), not in a tab of its own. */
  embedded: boolean;
};

const LAYOUTS = ["table", "cards", "list", "kanban", "calendar", "map"] as const;
type Layout = (typeof LAYOUTS)[number];
const LAYOUT_ICONS: Record<string, string> = { table: "table", cards: "grid", list: "list", kanban: "kanban", calendar: "calendar", map: "globe" };

function layoutName(kind: string, s: BaseStrings): string {
  switch (kind) {
    case "table":
      return s.table;
    case "cards":
      return s.cards;
    case "list":
      return s.list;
    case "kanban":
      return s.kanban;
    case "calendar":
      return s.calendar;
    case "map":
      return s.map;
    default:
      return kind;
  }
}

/** A property id as the view's settings name it (`note.x` → `x`). */
export function bareId(id: string): string {
  return id.startsWith("note.") ? id.slice(5) : id;
}

/** What each layout asks the core for besides the view's columns. */
function extraFor(view: Y.ViewConfig): string[] {
  const out: string[] = [];
  const str = (k: string) => (typeof view[k] === "string" ? (view[k] as string) : "");
  if ((view.type === "cards" || view.type === "kanban") && str("image")) out.push(str("image"));
  if (view.type === "calendar") {
    if (str("startDate")) out.push(str("startDate"));
    if (str("endDate")) out.push(str("endDate"));
  }
  // A map's markers: their place, icon and colour (the Maps plugin's keys).
  if (view.type === "map") for (const k of ["coordinates", "markerIcon", "markerColor"]) if (str(k)) out.push(str(k));
  const g = view["groupBy"];
  const groupProp = typeof g === "string" ? g : (g && typeof g === "object" && typeof (g as { property?: unknown }).property === "string" ? (g as { property: string }).property : "");
  if (view.type === "kanban" && groupProp) out.push(groupProp);
  return out;
}

/** A small panel of controls under a toolbar button; Escape, a click
 *  outside or the button again close it, and the focus goes back. */
class Popover {
  static current: Popover | null = null;
  readonly el = h("div", "base-pop");
  private readonly onDoc = (e: MouseEvent) => {
    if (!this.el.contains(e.target as Node) && !this.anchor.contains(e.target as Node)) this.close();
  };
  constructor(private readonly anchor: HTMLElement, label: string) {
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", label);
    this.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
  }
  open(): void {
    Popover.current?.close();
    Popover.current = this;
    document.body.append(this.el);
    // Inside what the screen shows: on a phone, above the on-screen
    // keyboard its fields bring up (ADR 0076 item 7).
    const r = this.anchor.getBoundingClientRect();
    const { left, top } = placeInView(r.left, r.bottom + 4, this.el.offsetWidth, this.el.offsetHeight, r.top);
    this.el.style.top = `${Math.round(top)}px`;
    this.el.style.left = `${Math.round(left)}px`;
    this.anchor.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", this.onDoc, true);
    focusOnOpen(this.el.querySelector<HTMLElement>("input, select, button, textarea"));
  }
  close(): void {
    if (Popover.current === this) Popover.current = null;
    document.removeEventListener("mousedown", this.onDoc, true);
    this.anchor.setAttribute("aria-expanded", "false");
    const had = this.el.contains(document.activeElement);
    this.el.remove();
    if (had) this.anchor.focus();
  }
  get isOpen(): boolean {
    return this.el.isConnected;
  }
}

function tool(label: string, ic: string, text?: string): HTMLButtonElement {
  const b = h("button", "base-tool");
  b.type = "button";
  b.append(icon(ic));
  if (text !== undefined) b.append(h("span", "", text));
  b.title = label;
  b.setAttribute("aria-label", label);
  return b;
}

function select(label: string, options: [string, string][], value: string, onChange: (v: string) => void): HTMLLabelElement {
  const wrap = h("label", "base-field");
  wrap.append(h("span", "", label));
  const s = h("select");
  for (const [v, text] of options) {
    const o = h("option", "", text);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  wrap.append(s);
  return wrap;
}

function numberField(label: string, value: number | null, placeholder: string, onChange: (v: number | null) => void, step = "1"): HTMLLabelElement {
  const wrap = h("label", "base-field");
  wrap.append(h("span", "", label));
  const input = h("input");
  input.type = "number";
  input.step = step;
  input.placeholder = placeholder;
  if (value !== null) input.value = String(value);
  input.addEventListener("change", () => {
    const v = input.value.trim();
    onChange(v === "" ? null : Number(v));
  });
  wrap.append(input);
  return wrap;
}

function textField(label: string, value: string, onChange: (v: string) => void): HTMLLabelElement {
  const wrap = h("label", "base-field");
  wrap.append(h("span", "", label));
  const input = h("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  wrap.append(input);
  return wrap;
}

/** A filter as the menus edit it: one conjunction over statements, or
 *  something deeper, shown and left to the source. */
type FlatFilter = { op: "and" | "or" | "not"; items: string[]; nested: number } | null;

function flatten(f: unknown): FlatFilter {
  if (f === null || f === undefined) return { op: "and", items: [], nested: 0 };
  if (typeof f === "string" || typeof f === "number" || typeof f === "boolean") return { op: "and", items: [String(f)], nested: 0 };
  if (typeof f !== "object" || Array.isArray(f)) return null;
  const keys = Object.keys(f as object);
  if (keys.length !== 1) return null;
  const op = keys[0] as "and" | "or" | "not";
  if (op !== "and" && op !== "or" && op !== "not") return null;
  const list = (f as Record<string, unknown>)[op];
  if (!Array.isArray(list)) return null;
  const items: string[] = [];
  let nested = 0;
  for (const x of list) {
    if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") items.push(String(x));
    else nested++;
  }
  return { op, items, nested };
}

export class BaseView {
  readonly el = h("div", "base");
  private readonly s: BaseStrings;
  private readonly bar = h("div", "base-bar");
  private readonly notices = h("div", "base-notices");
  private readonly body = h("div", "base-body");
  private readonly viewButton = h("button", "base-views");
  private readonly count = h("span", "base-count");
  private readonly searchInput = h("input", "base-search");
  private readonly tools: HTMLButtonElement[] = [];
  private result: BaseResult | null = null;
  private configs: Y.ViewConfig[] = [];
  private index: number | null = null;
  private chosen: string | null;
  private seq = 0;
  /** Taken down: asked nothing more. */
  private gone = false;
  private retry = 0;
  private pending = new Map<string, BaseCell>();
  private keep = new Map<string, unknown>();
  private search = "";
  private timer: number | undefined;

  constructor(private readonly host: BaseHost, private readonly src: BaseSource) {
    this.s = stringsFor(host.locale);
    this.chosen = src.viewName ?? this.remembered();
    this.viewButton.type = "button";
    this.viewButton.setAttribute("aria-haspopup", "menu");
    this.viewButton.addEventListener("click", () => this.viewMenu());
    this.searchInput.type = "search";
    this.searchInput.placeholder = this.s.search;
    this.searchInput.setAttribute("aria-label", this.s.search);
    this.searchInput.addEventListener("input", () => {
      this.search = this.searchInput.value;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.render(), 120);
    });
    const sort = tool(this.s.sort, "sort");
    sort.addEventListener("click", () => this.sortPop(sort));
    const filter = tool(this.s.filter, "filter");
    filter.addEventListener("click", () => this.filterPop(filter));
    const props = tool(this.s.properties, "props");
    props.addEventListener("click", () => this.propsPop(props));
    const gear = tool(this.s.settings, "gear");
    gear.addEventListener("click", () => this.settingsPop(gear));
    for (const b of [sort, filter, props, gear]) {
      b.setAttribute("aria-haspopup", "dialog");
      b.setAttribute("aria-expanded", "false");
    }
    this.tools.push(sort, filter, props, gear);
    const add = tool(this.s.new, "plus", this.s.new);
    add.classList.add("base-new");
    add.addEventListener("click", () => this.newNote([]));
    const more = tool(this.s.more, "more");
    more.setAttribute("aria-haspopup", "menu");
    more.addEventListener("click", () => {
      const r = more.getBoundingClientRect();
      this.host.menu(r.left, r.bottom + 4, [
        [this.s.copyMarkdown, () => void this.copyMarkdown()],
        [this.s.exportCsv, () => void this.copyCsv()],
        [this.s.saveMarkdown, () => void this.saveMarkdown()],
      ]);
    });
    const left = h("div", "base-bar-left");
    left.append(this.viewButton, this.count);
    const right = h("div", "base-bar-right");
    right.append(sort, filter, props, gear, this.searchInput, add, more);
    this.bar.append(left, right);
    this.bar.setAttribute("role", "toolbar");
    this.bar.setAttribute("aria-label", this.s.views);
    this.notices.setAttribute("role", "status");
    this.el.append(this.bar, this.notices, this.body);
  }

  private remembered(): string | null {
    try {
      return localStorage.getItem(`verso.baseView.${this.src.key}`);
    } catch {
      return null;
    }
  }

  private remember(name: string): void {
    try {
      localStorage.setItem(`verso.baseView.${this.src.key}`, name);
    } catch {
      // No storage: the first view next time.
    }
  }

  /** The view to evaluate: the one chosen, if the base still has it. */
  private config(text: string): { cfg: Y.ViewConfig; index: number | null } {
    this.configs = Y.views(text);
    if (this.configs.length === 0) return { cfg: { type: "table", name: "" }, index: null };
    const i = this.chosen === null ? 0 : this.configs.findIndex((v) => v.name === this.chosen);
    const index = i < 0 ? 0 : i;
    return { cfg: this.configs[index] ?? { type: "table", name: "" }, index };
  }

  /** Ask the core again and draw. Answers that come back out of order are
   *  dropped: only the last question is drawn. */
  async refresh(): Promise<void> {
    if (this.gone) return;
    // A value being typed into the view is not drawn over — the field
    // would go, and its text with it: asked again once it is left.
    window.clearTimeout(this.retry);
    const typing = document.activeElement;
    if (typing instanceof HTMLElement && this.body.contains(typing) && typing.matches("input, textarea, select")) {
      this.retry = window.setTimeout(() => void this.refresh(), 400);
      return;
    }
    const seq = ++this.seq;
    if (this.src.reload) {
      await this.src.reload();
      if (seq !== this.seq || this.gone) return;
    }
    const text = this.src.text();
    const { cfg, index } = this.config(text);
    const r = await commands.queryBase({
      path: this.src.path,
      text,
      this: this.src.thisPath,
      view: cfg.name || null,
      extra: extraFor(cfg),
      now: Date.now(),
      offset: -new Date().getTimezoneOffset(),
      lang: this.host.locale,
    });
    if (seq !== this.seq) return;
    if (r.status !== "ok") {
      this.body.replaceChildren(h("p", "base-empty", `${this.s.baseEmbedFailed} ${r.error.message}`));
      return;
    }
    this.result = r.data;
    this.index = index;
    // The cell that held the focus (a value just committed with Enter)
    // holds it again in the table drawn anew.
    const focused = document.activeElement;
    const at = focused instanceof HTMLElement && this.body.contains(focused) ? focused.dataset.cell : undefined;
    this.render();
    if (at !== undefined) {
      for (const td of this.body.querySelectorAll<HTMLElement>("[data-cell]")) {
        if (td.dataset.cell === at) {
          td.focus();
          break;
        }
      }
    }
  }

  /** A live note's room wrote its file: what was committed into it is the
   *  file's now, or what the room made of it — the next answer says. */
  roomSaved(path: string): void {
    let had = false;
    for (const k of [...this.pending.keys()]) {
      if (k.startsWith(`${path}\n`)) {
        this.pending.delete(k);
        had = true;
      }
    }
    if (had) void this.refresh();
  }

  private get view(): Y.ViewConfig {
    return (this.index !== null ? this.configs[this.index] : null) ?? { type: "table", name: "" };
  }

  private get editable(): boolean {
    // A reader on a server changes no base (ADR 0076 item 11).
    return this.src.edit !== null && !this.host.readOnly?.() && Y.editable(this.src.text());
  }

  /** Apply `edit` to the base's text for the current view. */
  private change(edit: (text: string, index: number) => string): void {
    if (!this.src.edit) return;
    const text = this.src.text();
    if (!Y.editable(text)) {
      this.host.status(this.s.editedAsText);
      return;
    }
    let index = this.index;
    let base = text;
    if (index === null) {
      // No view yet: the default table becomes the first view, so that
      // what the menus change has somewhere to go.
      const made = Y.addView(base, { type: "table", name: this.s.table });
      base = made.text;
      index = made.index;
      this.chosen = this.s.table;
    }
    const next = edit(base, index);
    if (next === text) return;
    this.src.edit(next);
    void this.refresh();
  }

  private render(): void {
    const r = this.result;
    if (!r) return;
    const view = this.view;
    const s = this.s;
    // The views' button: the layout's icon and the view's name.
    this.viewButton.replaceChildren(icon(LAYOUT_ICONS[view.type] ?? "table"), h("span", "", view.name || layoutName(view.type, s)), icon("chevron"));
    this.viewButton.setAttribute("aria-label", `${s.views}: ${view.name || layoutName(view.type, s)}`);
    for (const b of this.tools) b.hidden = !this.editable;
    // Problems, once each, above the view.
    const notes: HTMLElement[] = r.problems.map((p) => {
      const f = s.problems[p.kind];
      // An evaluation's line says why, as a sentence (ADR 0094 item 14).
      const why = p.error ? ` — ${errorText(p.error.kind, p.error.name, s)}` : "";
      return h("p", "base-problem", `${f ? f(p.detail) : p.detail}${why}`);
    });
    if (!(LAYOUTS as readonly string[]).includes(view.type) && this.index !== null) notes.push(h("p", "base-problem", s.unknownLayout(view.type)));
    this.notices.replaceChildren(...notes);
    // The search, over what each row shows.
    const q = fold(this.search.trim());
    const groups = q === ""
      ? r.groups
      : r.groups.map((g) => ({
          ...g,
          rows: g.rows.filter((row) => fold(`${row.path} ${row.cells.map((c) => cellText(c, this.host)).join(" ")}`).includes(q)),
        }));
    const shown = groups.reduce((n, g) => n + g.rows.length, 0);
    this.count.textContent = shown === r.total ? s.results(r.total) : s.resultsOf(shown, r.total);
    const ctx: RenderCtx = {
      host: this.host,
      s,
      result: r,
      groups,
      view,
      index: this.index,
      change: this.editable ? (e) => this.change(e) : null,
      newNote: (props) => this.newNote(props),
      refresh: () => void this.refresh(),
      key: this.src.key,
      pending: this.pending,
      keep: this.keep,
      embedded: this.src.path === null || this.src.thisPath !== this.src.path,
    };
    const layout = (LAYOUTS as readonly string[]).includes(view.type) ? (view.type as Layout) : "table";
    if (layout !== "map") this.forget("map");
    const drawn =
      layout === "cards"
        ? renderCards(ctx)
        : layout === "list"
          ? renderList(ctx)
          : layout === "kanban"
            ? renderKanban(ctx)
            : layout === "calendar"
              ? renderCalendar(ctx)
              : layout === "map"
                ? renderMap(ctx, this.host.maps)
                : renderTable(ctx);
    this.body.replaceChildren(drawn);
    this.body.dataset["layout"] = layout;
  }

  /** The views' menu: switch, add, rename, duplicate, delete. */
  private viewMenu(): void {
    const s = this.s;
    const r = this.viewButton.getBoundingClientRect();
    const items: [string, () => void][] = this.configs.map((v, i) => [
      `${i === this.index ? "✓ " : "   "}${v.name || layoutName(v.type, s)} · ${layoutName(v.type, s)}`,
      () => {
        this.chosen = v.name;
        this.remember(v.name);
        void this.refresh();
      },
    ]);
    if (this.editable) {
      if (items.length > 0) items.push(["—", () => {}]);
      for (const kind of LAYOUTS) {
        items.push([
          `${s.addView}: ${layoutName(kind, s)}`,
          () => {
            const name = this.freshName(layoutName(kind, s));
            this.chosen = name;
            this.remember(name);
            const view: Y.ViewConfig = { type: kind, name };
            if (this.view.type && this.index !== null) {
              const order = this.view["order"];
              if (Array.isArray(order)) view["order"] = order;
            }
            this.change((text) => Y.addView(text, view).text);
          },
        ]);
      }
      if (this.index !== null) {
        items.push(["—", () => {}]);
        items.push([
          s.duplicateView,
          () => {
            const name = this.freshName(this.view.name || layoutName(this.view.type, s));
            this.chosen = name;
            this.remember(name);
            this.change((text, i) => Y.duplicateView(text, i, name).text);
          },
        ]);
        items.push([
          s.deleteView,
          () =>
            void this.host.ask(s.deleteViewAsk(this.view.name || layoutName(this.view.type, s)), s.delete, s.cancel).then((yes) => {
              if (!yes) return;
              this.chosen = null;
              this.change((text, i) => Y.removeView(text, i));
            }),
        ]);
      }
    }
    this.host.menu(r.left, r.bottom + 4, items);
  }

  private freshName(base: string): string {
    const names = new Set(this.configs.map((v) => v.name));
    if (!names.has(base)) return base;
    for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
  }

  /** Every property a menu may offer: the file's fields, the folder's
   *  note properties, the base's formulas. */
  private propertyOptions(): [string, string][] {
    const s = this.s;
    const fileFields = ["name", "basename", "path", "folder", "ext", "size", "ctime", "mtime", "tags", "links", "embeds", "backlinks"];
    const out: [string, string][] = fileFields.map((f) => [`file.${f}`, `${s.fileProps[f] ?? f} (file)`]);
    for (const p of this.result?.properties ?? []) out.push([p, p]);
    for (const f of Y.formulaNames(this.src.text())) out.push([`formula.${f}`, `${f} (ƒ)`]);
    return out;
  }

  private sortPop(anchor: HTMLButtonElement): void {
    const s = this.s;
    const pop = new Popover(anchor, s.sort);
    const options = this.propertyOptions();
    // Read from the text when the change is made, never from the drawing:
    // a second change must not undo the first.
    type Rule = { property?: string; direction?: string };
    const sortOf = (t: string, i: number): Rule[] => {
      const v = Y.views(t)[i]?.["sort"];
      if (!Array.isArray(v)) return [];
      return (v as unknown[]).map((x) => (typeof x === "string" ? { property: x, direction: "ASC" } : (x as Rule)));
    };
    const groupOf = (t: string, i: number): Rule | null => {
      const g = Y.views(t)[i]?.["groupBy"];
      if (typeof g === "string") return { property: g, direction: "ASC" };
      return (g ?? null) as Rule | null;
    };
    const draw = () => {
      const v = this.view;
      pop.el.replaceChildren();
      pop.el.append(h("h3", "", s.sortBy));
      const rawRules = Array.isArray(v["sort"]) ? (v["sort"] as unknown[]) : [];
      const rules: Rule[] = rawRules.map((x) => (typeof x === "string" ? { property: x, direction: "ASC" } : (x as Rule)));
      rules.forEach((rule, k) => {
        const row = h("div", "base-row");
        row.append(
          select(s.sortBy, options, rule.property ?? "", (p) => this.change((t, i) => Y.setViewKey(t, i, "sort", sortOf(t, i).map((x, j) => (j === k ? { property: p, direction: x.direction ?? "ASC" } : x))))),
          select(s.ascending, [["ASC", s.ascending], ["DESC", s.descending]], (rule.direction ?? "ASC").toUpperCase(), (d) => this.change((t, i) => Y.setViewKey(t, i, "sort", sortOf(t, i).map((x, j) => (j === k ? { property: x.property, direction: d } : x))))),
        );
        const rm = tool(s.remove, "close");
        rm.addEventListener("click", () => {
          this.change((t, i) => {
            const next = sortOf(t, i).filter((_, j) => j !== k);
            return Y.setViewKey(t, i, "sort", next.length ? next : undefined);
          });
          window.setTimeout(draw, 50);
        });
        row.append(rm);
        pop.el.append(row);
      });
      const add = h("button", "base-link-button", `+ ${s.addSort}`);
      add.type = "button";
      add.addEventListener("click", () => {
        this.change((t, i) => Y.setViewKey(t, i, "sort", [...sortOf(t, i), { property: "file.name", direction: "ASC" }]));
        window.setTimeout(draw, 50);
      });
      pop.el.append(add, h("h3", "", s.groupBy));
      const gRaw = v["groupBy"];
      const g: Rule | null = typeof gRaw === "string" ? { property: gRaw, direction: "ASC" } : ((gRaw ?? null) as Rule | null);
      const row = h("div", "base-row");
      row.append(
        select(s.groupBy, [["", s.noGroup], ...options], g?.property ?? "", (p) => this.change((t, i) => Y.setViewKey(t, i, "groupBy", p === "" ? undefined : { property: p, direction: groupOf(t, i)?.direction ?? "ASC" }))),
        select(s.ascending, [["ASC", s.ascending], ["DESC", s.descending]], (g?.direction ?? "ASC").toUpperCase(), (d) =>
          this.change((t, i) => {
            const now = groupOf(t, i);
            return now?.property ? Y.setViewKey(t, i, "groupBy", { property: now.property, direction: d }) : t;
          }),
        ),
      );
      pop.el.append(row);
    };
    draw();
    pop.open();
  }

  private filterPop(anchor: HTMLButtonElement): void {
    const s = this.s;
    const pop = new Popover(anchor, s.filter);
    const section = (title: string, get: () => unknown, set: (f: unknown) => void) => {
      const box = h("section", "base-filter");
      box.append(h("h3", "", title));
      const flat = flatten(get());
      // A group inside the group is left to the source: the menus write a
      // flat list back, and would drop it.
      if (!flat || flat.nested > 0) {
        box.append(h("p", "base-hint", s.nested));
        return box;
      }
      let op = flat.op;
      const save = (op: string, items: string[]) => {
        const clean = items.map((x) => x.trim()).filter((x) => x !== "");
        set(clean.length === 0 && flat.nested === 0 ? undefined : { [op]: clean });
      };
      const inputs: HTMLInputElement[] = [];
      box.append(
        select(s.filter, [["and", s.allTrue], ["or", s.anyTrue], ["not", s.noneTrue]], flat.op, (next) => {
          op = next as typeof op;
          save(op, inputs.map((x) => x.value));
        }),
      );
      const list = h("div", "base-conditions");
      const addRow = (value: string) => {
        const row = h("div", "base-row");
        const input = h("input");
        input.type = "text";
        input.value = value;
        input.placeholder = s.conditionPlaceholder;
        input.setAttribute("aria-label", s.filter);
        input.spellcheck = false;
        input.addEventListener("change", () => save(op, inputs.map((x) => x.value)));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save(op, inputs.map((x) => x.value));
          }
        });
        const rm = tool(s.remove, "close");
        rm.addEventListener("click", () => {
          inputs.splice(inputs.indexOf(input), 1);
          row.remove();
          save(op, inputs.map((x) => x.value));
        });
        inputs.push(input);
        row.append(input, rm);
        list.append(row);
        return input;
      };
      for (const item of flat.items) addRow(item);
      const add = h("button", "base-link-button", `+ ${s.addCondition}`);
      add.type = "button";
      add.addEventListener("click", () => addRow("").focus());
      box.append(list, add);
      return box;
    };
    pop.el.append(
      section(s.thisView, () => this.view["filters"] ?? null, (f) => this.change((t, i) => Y.setViewKey(t, i, "filters", f))),
      section(s.allViews, () => Y.baseFilters(this.src.text()), (f) => this.change((t) => Y.setBaseKey(t, "filters", f))),
    );
    pop.open();
  }

  private propsPop(anchor: HTMLButtonElement): void {
    const s = this.s;
    const pop = new Popover(anchor, s.properties);
    const draw = () => {
      pop.el.replaceChildren(h("h3", "", s.properties));
      const order: string[] = Array.isArray(this.view["order"]) ? (this.view["order"] as unknown[]).map(String) : ["file.name"];
      const all = this.propertyOptions();
      const label = (id: string) => all.find(([v]) => bareId(v) === bareId(id))?.[1] ?? id;
      const list = h("ul", "base-props");
      const set = (next: string[]) => {
        this.change((t, i) => Y.setViewKey(t, i, "order", next));
        window.setTimeout(draw, 60);
      };
      order.forEach((id, k) => {
        const li = h("li");
        const box = h("input");
        box.type = "checkbox";
        box.checked = true;
        box.id = `base-prop-${k}-${Math.random().toString(36).slice(2, 7)}`;
        box.addEventListener("change", () => set(order.filter((x) => x !== id)));
        const lab = h("label", "", label(id));
        lab.htmlFor = box.id;
        const up = tool("↑", "chevronUp");
        up.disabled = k === 0;
        up.addEventListener("click", () => {
          const next = order.slice();
          [next[k - 1], next[k]] = [next[k] ?? "", next[k - 1] ?? ""];
          set(next);
        });
        li.append(box, lab, up);
        list.append(li);
      });
      const shown = new Set(order.map(bareId));
      for (const [id, text] of all) {
        if (shown.has(bareId(id))) continue;
        const li = h("li", "off");
        const box = h("input");
        box.type = "checkbox";
        box.id = `base-prop-off-${Math.random().toString(36).slice(2, 9)}`;
        box.addEventListener("change", () => set([...order, id]));
        const lab = h("label", "", text);
        lab.htmlFor = box.id;
        li.append(box, lab);
        list.append(li);
      }
      pop.el.append(list);
    };
    draw();
    pop.open();
  }

  private settingsPop(anchor: HTMLButtonElement): void {
    const s = this.s;
    const pop = new Popover(anchor, s.settings);
    const v = this.view;
    const set = (key: string, value: unknown) => this.change((t, i) => Y.setViewKey(t, i, key, value));
    const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
    const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
    const props = this.propertyOptions();
    pop.el.append(
      h("h3", "", s.settings),
      textField(s.viewName, v.name, (name) => {
        const clean = name.trim();
        if (!clean) return;
        this.chosen = clean;
        this.remember(clean);
        set("name", clean);
      }),
      select(s.layout, LAYOUTS.map((k) => [k, layoutName(k, s)] as [string, string]), (LAYOUTS as readonly string[]).includes(v.type) ? v.type : "table", (k) => set("type", k)),
      numberField(s.limit, num("limit"), s.noLimit, (n) => set("limit", n === null || n <= 0 ? undefined : Math.floor(n))),
    );
    if (v.type === "table") {
      pop.el.append(select(s.rowHeight, [["short", s.short], ["medium", s.medium], ["tall", s.tall], ["extraTall", s.extraTall]], str("rowHeight") || "short", (x) => set("rowHeight", x === "short" ? undefined : x)));
    }
    if (v.type === "cards" || v.type === "kanban") {
      pop.el.append(
        select(s.image, [["", s.noImage], ...props], str("image"), (x) => set("image", x || undefined)),
        select(s.imageFit, [["cover", s.cover], ["contain", s.contain]], str("imageFit") || "cover", (x) => set("imageFit", x === "cover" ? undefined : x)),
        numberField(s.aspect, num("imageAspectRatio"), "0.5", (n) => set("imageAspectRatio", n === null ? undefined : Math.min(Math.max(n, 0.25), 2.5)), "0.05"),
      );
    }
    if (v.type === "cards") pop.el.append(numberField(s.cardSize, num("cardSize"), "220", (n) => set("cardSize", n === null ? undefined : Math.min(Math.max(Math.round(n), 120), 600))));
    if (v.type === "list") {
      pop.el.append(
        select(s.markers, [["bullet", s.bullets], ["number", s.numbers], ["none", s.none]], str("markers") || "bullet", (x) => set("markers", x === "bullet" ? undefined : x)),
        textField(s.separator, str("separator") || ", ", (x) => set("separator", x === ", " || x === "" ? undefined : x)),
      );
      const wrap = h("label", "base-field base-check-field");
      const box = h("input");
      box.type = "checkbox";
      box.checked = v["indentProperties"] === true;
      box.addEventListener("change", () => set("indentProperties", box.checked ? true : undefined));
      wrap.append(box, h("span", "", s.indent));
      pop.el.append(wrap);
    }
    if (v.type === "calendar") {
      pop.el.append(
        select(s.startDate, [["", "—"], ...props], str("startDate"), (x) => set("startDate", x || undefined)),
        select(s.endDate, [["", s.noEndDate], ...props], str("endDate"), (x) => set("endDate", x || undefined)),
        select(s.weekStart, [["sunday", s.sunday], ["monday", s.monday]], str("weekStartDay") || "sunday", (x) => set("weekStartDay", x === "sunday" ? undefined : x)),
      );
    }
    if (v.type === "kanban") pop.el.append(h("p", "base-hint", s.chooseGroup));
    if (v.type === "map") this.mapSettings(pop.el, v, set, props);
    pop.open();
  }

  /** A map view's settings, the Maps plugin's keys (ADR 0094 item 6). */
  private mapSettings(el: HTMLElement, v: Y.ViewConfig, set: (key: string, value: unknown) => void, props: [string, string][]): void {
    const s = this.s;
    const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
    const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
    const notFile = props.filter(([id]) => !id.startsWith("file."));
    const zoom = (key: string, label: string) => numberField(label, num(key), "", (n) => set(key, n === null ? undefined : Math.min(Math.max(n, 0), 24)));
    const center = v["center"];
    // One address or several (a list, as the plugin's "multitext").
    const addresses = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).map(String).join(" ") : str(k));
    const asAddresses = (x: string) => {
      const parts = x.split(/\s+/).filter((p) => p !== "");
      return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : parts;
    };
    el.append(
      select(s.mapCoordinates, [["", "—"], ...notFile], str("coordinates"), (x) => set("coordinates", x || undefined)),
      select(s.mapIcon, [["", "—"], ...notFile], str("markerIcon"), (x) => set("markerIcon", x || undefined)),
      select(s.mapColor, [["", "—"], ...notFile], str("markerColor"), (x) => set("markerColor", x || undefined)),
      textField(s.mapCenter, Array.isArray(center) ? `[${center.join(", ")}]` : str("center"), (x) => set("center", x.trim() === "" ? undefined : x.trim())),
      zoom("defaultZoom", s.mapZoom),
      zoom("minZoom", s.mapMinZoom),
      zoom("maxZoom", s.mapMaxZoom),
      numberField(s.mapHeight, num("mapHeight"), "400", (n) => set("mapHeight", n === null ? undefined : Math.min(Math.max(Math.round(n), 100), 2000))),
      textField(s.mapTiles, addresses("mapTiles"), (x) => set("mapTiles", asAddresses(x))),
      textField(s.mapTilesDark, addresses("mapTilesDark"), (x) => set("mapTilesDark", asAddresses(x))),
      h("p", "base-hint", s.mapTilesHint),
    );
  }

  /** Destroy what a layout kept under `key`. */
  private forget(key: string): void {
    const kept = this.keep.get(key) as { destroy?: () => void } | undefined;
    kept?.destroy?.();
    this.keep.delete(key);
  }

  /** A new note in the base's folder, holding `props` — a column's value,
   *  a day — and opened. */
  private newNote(props: [string, PropertyValue][]): void {
    void this.host.newNote(this.src.folder, props).then((path) => {
      if (path) {
        this.host.open(path, false);
        void this.refresh();
      }
    });
  }

  /** The rows as a person reads them, for the copies. */
  private table(): { labels: string[]; rows: string[][] } {
    const r = this.result;
    if (!r) return { labels: [], rows: [] };
    const labels = r.columns.map((c) => columnLabel(c, this.s));
    const md = (c: BaseCell): string => {
      if (c.kind === "link") return c.value.display ? `[[${c.value.target}|${c.value.display}]]` : `[[${c.value.target}]]`;
      if (c.kind === "file") return `[[${c.value.replace(/\.md$/i, "")}]]`;
      if (c.kind === "list") return c.value.map(md).join(", ");
      return cellText(c, this.host);
    };
    const rows = r.groups.flatMap((g) => g.rows.map((row) => row.cells.map((c, k) => (r.columns[k]?.id === "file.name" && row.note ? `[[${row.path.replace(/\.md$/i, "")}]]` : md(c)))));
    return { labels, rows };
  }

  private async copyMarkdown(): Promise<void> {
    const { labels, rows } = this.table();
    await this.host.copy(markdownTable(labels, rows));
    this.host.status(this.s.copied);
  }

  private async copyCsv(): Promise<void> {
    const r = this.result;
    if (!r) return;
    const labels = r.columns.map((c) => columnLabel(c, this.s));
    const rows = r.groups.flatMap((g) => g.rows.map((row) => row.cells.map((c) => cellText(c, this.host))));
    await this.host.copy(csv(labels, rows));
    this.host.status(this.s.csvCopied);
  }

  private async saveMarkdown(): Promise<void> {
    const { labels, rows } = this.table();
    const base = (this.src.path ?? this.src.thisPath ?? "Base").split("/").pop() ?? "Base";
    const name = `${base.replace(/\.(base|md)$/i, "")} — ${this.view.name || layoutName(this.view.type, this.s)}`;
    await this.host.saveNote(name, markdownTable(labels, rows));
  }

  destroy(): void {
    this.gone = true;
    this.seq++;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.retry);
    Popover.current?.close();
    for (const k of [...this.keep.keys()]) this.forget(k);
  }
}
