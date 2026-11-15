// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The properties panel: the frontmatter as a table of typed rows, edited
// in place. Nothing here touches the file: an edit becomes one change to
// the editor's document — only the lines of the key it concerns — and
// goes to disk through the note's ordinary save (invariants 7 and 8: the
// user asked for exactly this change, the rest of the file is untouched).
//
// The rows are what the core read from the saved text. Every edit is
// made against the editor's text as it is now, and only when the key's
// lines there are still the ones the row was drawn from; otherwise the
// panel refuses and the note saves, which draws it again. A value the
// panel cannot rewrite without loss — a comment in it, several lines, a
// nested value, an anchor — is shown read-only: Source mode edits it.
//
// A schema that says `layout: infobox` (ADR 0086) draws the same panel —
// the same rows, widgets and writes — as a card beside the text: the
// first picture at its head, the type under it, the declared properties,
// the note's other keys folded below.

import { propSwatch } from "./colour/prop";
import type { Label, NoteType, Property, PropertyValue, TypedProperty } from "./bindings";
import { frontmatterClose, opensWithFence } from "./frontmatter";
import { icon } from "./icons";
import { asLink, linkParts, pictureNode, type PictureHost, type PictureStrings, suggestions } from "./infobox";

export type PropsStrings = {
  addProperty: string;
  keyPlaceholder: string;
  emptyValue: string;
  addItem: string;
  remove: string;
  /** Why a row is read-only. */
  fixed: string;
  /** The button that opens a value's web address. */
  open: string;
  propertiesTitle?: string;
  /** The typed note's words (ADR 0052). */
  typed?: TypedStrings;
};

export type TypedStrings = {
  /** The type's name above the properties. */
  type: (label: string) => string;
  /** The button that opens the note holding the schema. */
  openSchema: string;
  /** Two schemas share the name: neither applies. */
  conflict: (name: string, schemas: string[]) => string;
  /** The schema of the type does not parse. */
  invalid: (name: string, schema: string, error: string) => string;
  /** A value that does not fit its declared kind, shown as written. */
  misfit: (kind: string) => string;
  /** The kinds, by name, in the interface language. */
  kinds: Record<string, string>;
  /** Why a schema types nothing, by kind (spec §4.8). */
  errors: Record<string, string>;
  /** A picture that is not shown, and why (ADR 0086 item 1). */
  picture: PictureStrings;
  /** A link whose note does not exist. */
  unresolved: string;
  /** The field that adds a link. */
  addLink: string;
  /** The infobox's fold of the note's other keys. */
  others: (n: number) => string;
  /** The narrow infobox's button that shows every property, and back. */
  more: (n: number) => string;
  less: string;
};

export type Change = { from: number; to: number; insert: string };
/** Why an edit was not made: the key's lines changed in the text since
 *  the panel was drawn; the value is not one the panel can rewrite; the
 *  key to add is already there. */
export type Refusal = "changed" | "fixed" | "exists";

export type PropsOptions = {
  strings: PropsStrings;
  /** The editor's text now. */
  doc: () => string;
  /** Make one change to the editor's document. */
  apply: (change: Change) => void;
  /** An edit was not made; the rows are back as they were. */
  refused: (why: Refusal) => void;
  /** A tag pill was clicked. */
  onTag: (tag: string) => void;
  /** A value that is a web address was opened. */
  onLink?: (url: string) => void;
  /** A note was asked for: the one holding a type's schema. */
  onOpen?: (path: string) => void;
  /** The interface language (`pt-BR`, `en`), for a schema's labels. */
  lang?: string;
  /** A link of a `link` property followed (ADR 0086 item 1). */
  onFollow?: (target: string) => void;
  /** The note a link's target reaches: its path, null when none, or
   *  undefined when not known. */
  resolveLink?: (target: string) => string | null | undefined;
  /** A picture of the folder, asked of the core: its address, or null. */
  picture?: (target: string) => Promise<string | null>;
  /** The note's title: names the infobox; a picture's alternative text
   *  when its link gives none (ADR 0086 item 6). */
  title?: () => string;
  /** The folder's notes (`link`) or pictures (`image`), offered as `[[`
   *  offers them; each value as it is written (`[[Barão]]`). */
  suggest?: (kind: "link" | "image") => { value: string; label: string }[];
  /** Something to say on the status line. */
  status?: (message: string) => void;
  /** Whether a colour code as a value shows its colour (ADR 0108); not asked: it does. */
  swatches?: () => boolean;
};

/** A label for `lang` among a schema's labels: the language itself, its
 *  base (`pt` for `pt-BR`), or none — the caller falls back to the name. */
export function labelFor(labels: Label[], lang: string): string | null {
  const exact = labels.find((l) => l.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact.text;
  const base = lang.toLowerCase().split("-")[0];
  return labels.find((l) => l.lang.toLowerCase().split("-")[0] === base)?.text ?? null;
}

const LIST_KEYS = new Set(["tags", "tag", "aliases", "alias", "cssclasses", "cssclass"]);
const TAG_KEYS = new Set(["tags", "tag"]);
const KINDS = new Set(["text", "number", "checkbox", "list", "empty"]);
/** A declared kind's icon (ADR 0052). */
const KIND_ICON: Record<string, string> = { text: "text", list: "bullets", number: "hash", checkbox: "task", date: "calendar", datetime: "calendar", link: "link", image: "image" };
/** Under this width the infobox goes above the text, collapsed to the
 *  picture and the first three properties (ADR 0086 item 3). */
const NARROW = 760;
/** The properties the narrow infobox shows before "show all". */
const FIRST = 3;

function iconOf(key: string, v: PropertyValue): string {
  if (TAG_KEYS.has(key.toLowerCase())) return "tag";
  switch (v.kind) {
    case "list": return "bullets";
    case "checkbox": return "task";
    case "number": return "hash";
    case "text": return /^\d{4}-\d{2}-\d{2}/.test(v.value) ? "calendar" : /^https?:\/\//i.test(v.value) ? "link" : "text";
    default: return LIST_KEYS.has(key.toLowerCase()) ? "bullets" : "text";
  }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class PropertiesView {
  readonly el = h("div", "props");
  private items: Property[] = [];
  /** The note's type, when a schema types it (ADR 0052). */
  private type: NoteType | null = null;
  /** Each key's lines as the rows were drawn from them: an edit goes
   *  through only while the editor's text still has exactly these. */
  private drawn = new Map<string, string | null>();
  private readOnly = false;
  /** A redraw asked for while an input of the panel has the focus: it
   *  waits for the focus to leave, so nothing typed there is lost. */
  private pending: (() => void) | null = null;
  /** The strip's own folding, as the person left it: the infobox does
   *  not fold, and gives it back when the note is a strip again. */
  private collapsed = false;
  /** The narrow infobox shows every property. */
  private expanded = false;
  private watching: ResizeObserver | null = null;
  constructor(private readonly opts: PropsOptions) {
    this.el.hidden = true;
    try {
      if (localStorage.getItem("verso.props.collapsed") === "true") {
        this.collapsed = true;
        this.el.classList.add("collapsed");
      }
    } catch {
      // No storage.
    }
    // A press inside the panel: in WebKit a checkbox or a button takes no
    // focus, so the field that had it loses it on the press — and a redraw
    // run then would take the control away under the pointer, its click
    // with it. While the pointer is down inside, the redraw waits for the
    // click to land.
    let pressed = false;
    const release = (): void => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      pressed = false;
      if (this.pending && !this.el.contains(document.activeElement)) {
        const run = this.pending;
        this.pending = null;
        setTimeout(run, 0);
      }
    };
    this.el.addEventListener(
      "pointerdown",
      () => {
        if (pressed) return;
        pressed = true;
        // Only while pressed: no listener outlives the press.
        window.addEventListener("pointerup", release, true);
        window.addEventListener("pointercancel", release, true);
      },
      true,
    );
    this.el.addEventListener("focusout", (e) => {
      if (pressed) return;
      if (this.pending && !this.el.contains(e.relatedTarget as Node | null)) {
        const run = this.pending;
        this.pending = null;
        queueMicrotask(run);
      }
    });
  }
  /** Draw the rows the core read from `text`; `readOnly` for a note that
   *  is never edited here. */
  render(items: Property[], text: string, readOnly = false, type: NoteType | null = null): void {
    const draw = () => {
      this.type = type;
      this.items = items.map((p) => ({ key: p.key, value: p.value }));
      this.drawn = new Map(this.items.map((p) => [p.key, keyText(text, p.key)]));
      this.readOnly = readOnly;
      this.paint();
    };
    if (this.el.contains(document.activeElement)) this.pending = draw;
    else draw();
  }
  /** Open the new property input, expanding the panel if folded. */
  addProperty(): void {
    if (this.readOnly) return;
    if (this.collapsed) {
      this.collapsed = false;
      this.el.classList.remove("collapsed");
      try { localStorage.setItem("verso.props.collapsed", "false"); } catch {}
    }
    const btn = this.el.querySelector<HTMLElement>(".prop-new");
    if (btn) this.newRow(btn);
  }
  /** The line above the properties that names the note's type, or says
   *  why its schema types nothing. */
  private typeLine(): HTMLElement | null {
    const s = this.opts.strings.typed;
    const t = this.type;
    if (!s || !t) return null;
    const line = h("div", "props-type");
    const open = (path: string, label: string): HTMLButtonElement => {
      const b = h("button", "props-type-schema", label);
      b.type = "button";
      b.title = `${s.openSchema}: ${path}`;
      // The focus stays where it is: in WebKit a button takes none, and a
      // field of the panel losing it on the press redrew the panel — the
      // button under the pointer went, and the click with it.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => this.opts.onOpen?.(path));
      return b;
    };
    const st = t.state;
    if (st.kind === "typed") {
      const label = labelFor(st.labels, this.opts.lang ?? "en") ?? st.name;
      line.append(icon("note"), h("span", "props-type-name", s.type(label)), open(st.schema, s.openSchema));
    } else if (st.kind === "conflict") {
      line.classList.add("problem");
      line.append(icon("warn"), h("span", "", s.conflict(t.written, st.schemas)));
      for (const p of st.schemas) line.append(open(p, p.replace(/\.md$/, "")));
    } else {
      line.classList.add("problem");
      line.append(icon("warn"), h("span", "", s.invalid(t.written, st.schema, s.errors[st.error] ?? st.error)), open(st.schema, st.schema.replace(/\.md$/, "")));
    }
    return line;
  }
  /** The rows, the declared ones first in the schema's order when a
   *  schema types the note, then the note's other keys (ADR 0052 point 6). */
  private rows(): HTMLElement[] {
    const st = this.type?.state;
    if (!st || st.kind !== "typed") return this.items.map((p) => this.row(p));
    const declared = new Set(st.properties.map((d) => d.key));
    const out: HTMLElement[] = [];
    for (const d of st.properties) {
      const p = this.items.find((x) => x.key === d.key);
      out.push(p ? this.row(p, d) : this.absentRow(d));
    }
    for (const p of this.items) if (!declared.has(p.key)) out.push(this.row(p));
    return out;
  }
  /** Whether the schema lays this note out as an infobox (ADR 0086). */
  private infobox(): boolean {
    const st = this.type?.state;
    return st?.kind === "typed" && st.layout === "infobox" && this.opts.strings.typed !== undefined;
  }
  private paint(focusKey?: string): void {
    const card = this.infobox();
    this.el.classList.toggle("infobox", card);
    this.placeText();
    if (card) {
      this.paintInfobox(focusKey);
      return;
    }
    const rows = this.rows();
    const typeLine = this.typeLine();
    if (typeLine) rows.unshift(typeLine);
    const empty = this.items.length === 0 && !typeLine;
    this.el.classList.toggle("collapsed", this.collapsed && !empty);
    this.el.classList.remove("narrow", "expanded");
    this.el.removeAttribute("role");
    this.el.removeAttribute("aria-label");
    const add = h("button", "prop-new");
    add.type = "button";
    add.append(icon("plus"), h("span", "", this.opts.strings.addProperty));
    add.addEventListener("click", () => this.newRow(add));
    add.hidden = this.readOnly;
    if (this.items.length > 0 || typeLine) {
      const header = h("div", "props-header");
      const toggle = h("button", "props-toggle");
      toggle.type = "button";
      // Folded, the header says how many it holds: a bare title read as an
      // empty section (the maintainer, 2026-10-31).
      toggle.append(icon("chevron"), h("span", "", this.opts.strings.propertiesTitle ?? "Propriedades"), h("span", "props-count", this.items.length ? String(this.items.length) : ""));
      toggle.setAttribute("aria-expanded", String(!this.el.classList.contains("collapsed")));
      toggle.addEventListener("click", () => {
        const collapsed = !this.el.classList.contains("collapsed");
        this.collapsed = collapsed;
        this.el.classList.toggle("collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        try { localStorage.setItem("verso.props.collapsed", String(collapsed)); } catch {}
      });
      header.append(toggle);
      this.el.replaceChildren(header, ...rows, add);
    } else {
      this.el.replaceChildren(...rows, add);
    }
    this.el.hidden = false;
    this.el.classList.toggle("empty", empty);
    this.focusRow(focusKey);
  }
  private focusRow(focusKey?: string): void {
    if (focusKey === undefined) return;
    const target = this.el.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] input, [data-key="${CSS.escape(focusKey)}"] .prop-add`);
    target?.focus();
  }
  /** The infobox (ADR 0086 item 3): a complementary region named after
   *  the note, in the panel's keyboard order — the first picture, the
   *  type, the declared properties in the schema's order, the note's
   *  other keys folded, the button that adds a key. On a narrow pane it
   *  goes above the text, collapsed to the picture and the first three
   *  properties, with a button for the rest. */
  private paintInfobox(focusKey?: string): void {
    const st = this.type?.state;
    const s = this.opts.strings.typed;
    if (!st || st.kind !== "typed" || !s) return;
    this.watchWidth();
    this.el.classList.remove("collapsed", "empty", "adding");
    this.el.classList.toggle("expanded", this.expanded);
    this.el.setAttribute("role", "complementary");
    this.el.setAttribute("aria-label", this.opts.title?.() ?? labelFor(st.labels, this.opts.lang ?? "en") ?? st.name);
    const parts: HTMLElement[] = [];
    const head = st.properties.find((d) => d.kind === "image" && d.present && d.fits);
    const headValue = head ? this.items.find((p) => p.key === head.key)?.value : undefined;
    if (head && headValue?.kind === "text") {
      const picture = pictureNode(headValue.value, this.pictureHost(), "ib-picture-img");
      if (picture) {
        const figure = h("figure", "ib-picture");
        figure.append(picture);
        parts.push(figure);
      }
    }
    const typeLine = this.typeLine();
    if (typeLine) parts.push(typeLine);
    const declared = new Set(st.properties.map((d) => d.key));
    const more: HTMLElement[] = [];
    st.properties.forEach((d, i) => {
      const p = this.items.find((x) => x.key === d.key);
      const row = p ? this.row(p, d, true) : this.absentRow(d);
      if (i >= FIRST) row.classList.add("ib-more");
      (i < FIRST ? parts : more).push(row);
    });
    const others = this.items.filter((p) => !declared.has(p.key));
    if (others.length > 0) {
      const fold = h("details", "ib-others ib-more");
      const summary = h("summary", "", s.others(others.length));
      fold.append(summary, ...others.map((p) => this.row(p)));
      // A key of the fold asked for (just added): the fold opens on it.
      if (focusKey !== undefined && others.some((p) => p.key === focusKey)) fold.open = true;
      more.push(fold);
    }
    const add = h("button", "prop-new ib-more");
    add.type = "button";
    add.append(icon("plus"), h("span", "", this.opts.strings.addProperty));
    add.addEventListener("click", () => this.newRow(add));
    add.hidden = this.readOnly;
    more.push(add);
    if (more.some((e) => !e.hidden)) {
      const toggle = h("button", "ib-expand", this.expanded ? s.less : s.more(st.properties.length + others.length));
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(this.expanded));
      toggle.addEventListener("click", () => {
        this.expanded = !this.expanded;
        this.el.classList.toggle("expanded", this.expanded);
        toggle.setAttribute("aria-expanded", String(this.expanded));
        toggle.textContent = this.expanded ? s.less : s.more(st.properties.length + others.length);
      });
      parts.push(toggle);
    }
    this.el.replaceChildren(...parts, ...more);
    this.el.hidden = false;
    this.focusRow(focusKey);
  }
  /** The card's place follows the pane's width, not the window's: a
   *  split pane is narrow on a wide screen. */
  private watchWidth(): void {
    if (this.watching || typeof ResizeObserver === "undefined") return;
    const host = this.el.parentElement;
    if (!host) return;
    const set = () => {
      this.el.classList.toggle("narrow", host.clientWidth > 0 && host.clientWidth < NARROW);
      this.placeText();
    };
    this.watching = new ResizeObserver(set);
    this.watching.observe(host);
    set();
  }
  /** The text beside a wide card keeps a column clear of it; above a
   *  narrow one, or with no card, the text is as it always was. */
  private placeText(): void {
    const beside = this.el.classList.contains("infobox") && !this.el.classList.contains("narrow");
    this.el.parentElement?.classList.toggle("with-infobox", beside);
  }
  private pictureHost(): PictureHost {
    const s = this.opts.strings.typed;
    return {
      strings: s?.picture ?? { pictureOrigin: (o) => o, pictureRemote: "", approve: (o) => o, approveFailed: "", load: "", pictureMissing: (t) => t },
      resolve: (target) => this.opts.picture?.(target) ?? Promise.resolve(null),
      title: this.opts.title?.() ?? "",
      status: (m) => this.opts.status?.(m),
    };
  }
  /** One edit of `key`, against the editor's text now. */
  private edit(key: string, edit: Edit, focus = true): void {
    // A read-only note (mixed line endings, no write access, a reader) is
    // never edited through the panel, whatever drew a control for it
    // (invariants 7 and 8; ADR 0076 item 11).
    if (this.readOnly) return;
    // A redraw waiting for the focus is older than this edit: the save
    // that follows the edit draws the panel again.
    this.pending = null;
    const doc = this.opts.doc();
    const was = this.drawn.get(key);
    const r = edit.op === "create" ? propertyChange(doc, key, edit) : keyText(doc, key) !== was || was === undefined ? ({ refused: "changed" } as const) : propertyChange(doc, key, edit);
    if ("refused" in r) {
      this.opts.refused(r.refused);
      this.paint();
      return;
    }
    this.opts.apply(r.change);
    const i = this.items.findIndex((p) => p.key === key);
    if (r.value === null) {
      if (i >= 0) this.items.splice(i, 1);
      this.drawn.delete(key);
    } else {
      if (i >= 0) this.items[i] = { key, value: r.value };
      else this.items.push({ key, value: r.value });
      this.drawn.set(key, keyText(this.opts.doc(), key));
    }
    this.paint(r.value === null || !focus ? undefined : key);
  }
  /** Whether the panel may rewrite `p` in the text it was drawn from. */
  private editable(p: Property): boolean {
    if (this.readOnly || !KINDS.has((p.value as { kind: string }).kind)) return false;
    const text = this.drawn.get(p.key);
    return text !== null && text !== undefined && shapeOf(text.split("\n")).kind !== "fixed";
  }
  /** A declared key the note lacks: an empty row in its kind's widget
   *  that writes nothing until it is given a value — then the key goes
   *  where a new key goes, at the end of the frontmatter (ADR 0052). */
  private absentRow(d: TypedProperty): HTMLElement {
    const row = h("div", `prop declared absent kind-${d.kind}`);
    row.dataset["key"] = d.key;
    const label = labelFor(d.labels, this.opts.lang ?? "en") ?? d.key;
    const key = h("span", "prop-key");
    key.title = d.key;
    key.append(icon(KIND_ICON[d.kind] ?? "text"), h("span", "prop-key-text", label));
    const value = h("div", "prop-value");
    const give = (v: PropertyValue | { add: string[] }) => {
      this.edit(d.key, { op: "create" }, false);
      if ("add" in v) this.edit(d.key, { op: "add", values: v.add });
      else this.edit(d.key, { op: "set", value: v });
    };
    if (d.kind === "checkbox") {
      const box = h("input");
      box.type = "checkbox";
      box.disabled = this.readOnly;
      box.setAttribute("aria-label", label);
      box.addEventListener("change", () => give({ kind: "checkbox", value: box.checked }));
      value.append(box);
    } else if (d.kind === "list") {
      const add = h("input", "prop-add");
      add.type = "text";
      add.placeholder = this.opts.strings.addItem;
      add.disabled = this.readOnly;
      add.setAttribute("aria-label", `${label}: ${this.opts.strings.addItem}`);
      const push = () => {
        const parts = add.value.split(",").map((s) => s.trim()).filter(Boolean);
        // Cleared first: the repaint takes the field away, and its blur
        // would push the same items again.
        add.value = "";
        if (parts.length > 0) give({ add: parts });
      };
      add.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") push();
      });
      add.addEventListener("blur", push);
      value.append(add);
    } else {
      const input = h("input", "prop-input");
      input.type = d.kind === "number" ? "number" : d.kind === "date" ? "date" : d.kind === "datetime" ? "datetime-local" : "text";
      if (d.kind === "number") input.step = "any";
      input.placeholder = d.kind === "link" ? (this.opts.strings.typed?.addLink ?? this.opts.strings.emptyValue) : this.opts.strings.emptyValue;
      input.disabled = this.readOnly;
      input.setAttribute("aria-label", label);
      if (d.kind === "link" || d.kind === "image") value.append(this.suggestFor(input, d.kind));
      const commit = () => {
        const v = d.kind === "link" ? asLink(input.value) : input.value.trim();
        if (v === "") return;
        give(d.kind === "number" ? { kind: "number", value: v } : { kind: "text", value: v });
      };
      input.addEventListener(d.kind === "date" || d.kind === "datetime" ? "change" : "blur", commit);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
      });
      value.append(input);
    }
    row.append(key, value);
    return row;
  }
  /** The folder's notes or pictures for `input`, as `[[` offers them. */
  private suggestFor(input: HTMLInputElement, kind: "link" | "image"): HTMLDataListElement {
    return suggestions(input, () => this.opts.suggest?.(kind) ?? []);
  }
  /** A link of a `link` property: followed with a click (or Enter), an
   *  unresolved one said as such. Its class and `data-target` are the
   *  reading view's own, so what a wikilink there gets, it gets too. */
  private linkEl(item: string): HTMLElement {
    const parts = linkParts(item);
    if (!parts) return h("span", "pill-label", item);
    // Named by its alias, else by the note's name — the path's last part,
    // a `#heading` kept; the whole target is the link's title.
    const a = h("a", "pill-label wikilink prop-link", parts.alias ?? parts.target.split("/").pop() ?? parts.target);
    a.href = "#";
    a.dataset["target"] = parts.target;
    const to = this.opts.resolveLink?.(parts.target);
    if (to === null) {
      a.classList.add("unresolved");
      a.title = this.opts.strings.typed?.unresolved ?? "";
    } else a.title = to ?? parts.target;
    // The note it names shows where the pointer rests (ADR 0085 item 2),
    // through the window's finder: the panel and the infobox lie outside
    // the reading view, whose own finder reads `data-target`.
    a.dataset["previewTarget"] = parts.target;
    if (to) a.dataset["previewPath"] = to;
    // The focus stays in the panel's field until the click lands.
    a.addEventListener("mousedown", (e) => e.preventDefault());
    a.addEventListener("click", (e) => {
      e.preventDefault();
      this.opts.onFollow?.(parts.target);
    });
    return a;
  }
  /** A declared `link` whose value fits (ADR 0086 item 1): its links as
   *  pills, each followed with a click; a list takes more, a single link
   *  is cleared with its ×, an empty one takes one. */
  private linkValue(value: HTMLElement, p: Property, fixed: boolean, label: string): void {
    const v = p.value;
    const items = v.kind === "list" ? v.value : v.kind === "text" ? [v.value] : [];
    for (const [i, item] of items.entries()) {
      const pill = h("span", "pill link-pill");
      pill.append(this.linkEl(item));
      if (!fixed) {
        const x = h("button", "pill-x");
        x.type = "button";
        x.title = this.opts.strings.remove;
        x.setAttribute("aria-label", `${this.opts.strings.remove}: ${linkParts(item)?.target ?? item}`);
        x.append(icon("close"));
        x.addEventListener("click", () => this.edit(p.key, v.kind === "list" ? { op: "drop", index: i } : { op: "set", value: { kind: "empty" } }));
        pill.append(x);
      }
      value.append(pill);
    }
    if (fixed || v.kind === "text") return;
    const add = h("input", "prop-add");
    add.type = "text";
    add.placeholder = this.opts.strings.typed?.addLink ?? this.opts.strings.addItem;
    add.setAttribute("aria-label", `${label}: ${add.placeholder}`);
    value.append(this.suggestFor(add, "link"));
    const push = () => {
      const link = asLink(add.value);
      add.value = "";
      if (link === "") return;
      if (v.kind === "list") this.edit(p.key, { op: "add", values: [link] });
      else this.edit(p.key, { op: "set", value: { kind: "text", value: link } }, false);
    };
    add.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        push();
      } else if (e.key === "Escape") add.blur();
    });
    add.addEventListener("change", () => {
      // A suggestion picked from the list: taken at once.
      if (linkParts(add.value)) push();
    });
    add.addEventListener("blur", push);
    value.append(add);
  }
  private row(p: Property, d?: TypedProperty, inCard = false): HTMLElement {
    const fixed = !this.editable(p);
    const misfit = d !== undefined && !d.fits;
    const row = h("div", `prop kind-${p.value.kind}${fixed ? " fixed" : ""}${d ? " declared" : ""}${misfit ? " misfit" : ""}`);
    row.dataset["key"] = p.key;
    if (fixed && !this.readOnly) row.title = this.opts.strings.fixed;
    const s = this.opts.strings.typed;
    if (misfit && s && d) row.title = s.misfit(s.kinds[d.kind] ?? d.kind);
    const key = h("span", "prop-key");
    const label = d ? (labelFor(d.labels, this.opts.lang ?? "en") ?? p.key) : p.key;
    if (d) key.title = p.key;
    key.append(icon(d ? (KIND_ICON[d.kind] ?? "text") : iconOf(p.key, p.value)), h("span", "prop-key-text", label));
    const value = h("div", "prop-value");
    const isList = p.value.kind === "list" || (p.value.kind === "empty" && LIST_KEYS.has(p.key.toLowerCase()));
    // An `image` written as a wikilink is a link too: its name, followed to
    // the picture (the maintainer, 2026-11-15: the raw `[[…]]` showed); a
    // path or an address stays a field.
    const imageLink = d?.kind === "image" && d.fits && p.value.kind === "text" && linkParts(p.value.value) !== null;
    if (d && ((d.kind === "link" && d.fits) || imageLink)) {
      // The infobox groups the links under its rule; the picture's row keeps its place.
      if (!imageLink) row.classList.add("links");
      this.linkValue(value, p, fixed, label);
    } else if (isList) this.listEditor(value, p.key, p.value.kind === "list" ? p.value.value : [], fixed);
    else if (p.value.kind === "checkbox") {
      const box = h("input");
      box.type = "checkbox";
      box.checked = p.value.value;
      box.disabled = fixed;
      box.setAttribute("aria-label", p.key);
      box.addEventListener("change", () => this.edit(p.key, { op: "set", value: { kind: "checkbox", value: box.checked } }));
      value.append(box);
    } else {
      const input = h("input", "prop-input");
      const asDate = d !== undefined && d.fits && (d.kind === "date" || d.kind === "datetime");
      input.type = asDate ? (d.kind === "date" ? "date" : "datetime-local") : p.value.kind === "number" ? "number" : "text";
      if (p.value.kind === "number") input.step = "any";
      const shown = p.value as { kind: string; value?: unknown };
      input.value = typeof shown.value === "string" ? shown.value : "";
      input.placeholder = this.opts.strings.emptyValue;
      input.disabled = fixed;
      // Named by its key: the key beside it is not its label, and the
      // placeholder said only "Empty".
      input.setAttribute("aria-label", p.key);
      const initial = input.value;
      const done = () => {
        const v = input.value.trim();
        if (fixed || v === initial.trim()) return;
        if (v === "") this.edit(p.key, { op: "set", value: { kind: "empty" } }, false);
        else if (p.value.kind === "number" || (p.value.kind === "empty" && /^-?\d+(\.\d+)?$/.test(v))) this.edit(p.key, { op: "set", value: { kind: "number", value: v } }, false);
        else if (p.value.kind === "empty" && /^(true|false)$/i.test(v)) this.edit(p.key, { op: "set", value: { kind: "checkbox", value: v.toLowerCase() === "true" } }, false);
        else this.edit(p.key, { op: "set", value: { kind: "text", value: v } }, false);
      };
      input.addEventListener(asDate ? "change" : "blur", done);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
        else if (e.key === "Escape") {
          input.value = initial;
          input.blur();
        }
      });
      // A colour code as the value shows its colour (ADR 0108).
      if (input.type === "text") value.append(propSwatch(input, { enabled: this.opts.swatches, commit: fixed ? undefined : done }));
      value.append(input);
      if (d && d.kind === "image") {
        value.append(this.suggestFor(input, "image"));
        // The picture beside its address; in the infobox the head shows it.
        if (d.fits && !inCard && p.value.kind === "text") {
          const thumb = pictureNode(p.value.value, this.pictureHost(), "prop-thumb");
          if (thumb) value.prepend(thumb);
        }
      }
      if (p.value.kind === "text" && /^https?:\/\//i.test(p.value.value)) {
        const go = h("button", "prop-go");
        go.type = "button";
        go.title = p.value.value;
        go.textContent = "↗";
        go.setAttribute("aria-label", this.opts.strings.open);
        const url = p.value.value;
        go.addEventListener("click", () => this.opts.onLink?.(url));
        value.append(go);
      }
    }
    const remove = h("button", "prop-remove");
    remove.type = "button";
    remove.title = this.opts.strings.remove;
    remove.setAttribute("aria-label", `${this.opts.strings.remove}: ${p.key}`);
    remove.append(icon("close"));
    remove.hidden = fixed;
    remove.addEventListener("click", () => this.edit(p.key, { op: "remove" }));
    row.append(key, value, remove);
    return row;
  }
  private listEditor(host: HTMLElement, key: string, items: string[], fixed: boolean): void {
    const tags = TAG_KEYS.has(key.toLowerCase());
    for (const [i, item] of items.entries()) {
      const pill = h("span", tags ? "pill tag-pill" : "pill");
      const label = h("button", "pill-label", tags ? `#${item.replace(/^#/, "")}` : item);
      label.type = "button";
      if (tags) label.addEventListener("click", () => this.opts.onTag(item.replace(/^#/, "")));
      else label.disabled = true;
      pill.append(label);
      if (!fixed) {
        const x = h("button", "pill-x");
        x.type = "button";
        x.title = this.opts.strings.remove;
        x.setAttribute("aria-label", `${this.opts.strings.remove}: ${item}`);
        x.append(icon("close"));
        x.addEventListener("click", () => this.edit(key, { op: "drop", index: i }));
        pill.append(x);
      }
      host.append(pill);
    }
    if (fixed) return;
    const add = h("input", "prop-add");
    add.type = "text";
    add.placeholder = this.opts.strings.addItem;
    add.setAttribute("aria-label", `${key}: ${this.opts.strings.addItem}`);
    const push = () => {
      const v = add.value.trim().replace(/,+$/, "").trim();
      if (!v) return;
      const parts = v.split(",").map((s) => (tags ? s.trim().replace(/^#/, "") : s.trim())).filter(Boolean);
      add.value = "";
      this.edit(key, { op: "add", values: parts });
    };
    add.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        push();
      } else if (e.key === "Backspace" && add.value === "" && items.length > 0) {
        e.preventDefault();
        this.edit(key, { op: "drop", index: items.length - 1 });
      } else if (e.key === "Escape") add.blur();
    });
    add.addEventListener("blur", push);
    host.append(add);
  }
  private newRow(before: HTMLElement): void {
    if (this.readOnly) return;
    const row = h("div", "prop kind-new");
    const keyCol = h("span", "prop-key");
    const input = h("input", "prop-input prop-key-input");
    input.type = "text";
    input.placeholder = this.opts.strings.keyPlaceholder;
    input.setAttribute("aria-label", this.opts.strings.keyPlaceholder);
    keyCol.append(icon("tag"), input);
    const valueCol = h("div", "prop-value");
    const remove = h("button", "prop-remove");
    remove.type = "button";
    remove.title = this.opts.strings.remove;
    remove.append(icon("close"));
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const key = input.value.trim().replace(/:+$/, "");
      row.remove();
      this.el.classList.remove("adding");
      if (this.items.length === 0) this.el.classList.add("empty");
      if (!commit || !key) return;
      this.edit(key, { op: "create" });
    };
    remove.addEventListener("click", () => finish(false));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    row.append(keyCol, valueCol, remove);
    this.el.classList.remove("empty");
    this.el.classList.add("adding");
    before.before(row);
    input.focus();
  }
}

/* ---------- The text change for one property ---------- */

/** What the panel asks of a key: a new value, one item dropped (by its
 *  place in the list the row shows), items added, the key removed, or an
 *  empty key added. */
export type Edit =
  | { op: "set"; value: PropertyValue }
  | { op: "drop"; index: number }
  | { op: "add"; values: string[] }
  | { op: "remove" }
  | { op: "create" };

/** Characters a plain scalar cannot hold as they are: controls, line and
 *  paragraph separators, a byte-order mark. */
const CONTROL = new RegExp(`[\\x00-\\x1f\\x7f\\x85${String.fromCharCode(0x2028, 0x2029, 0xfeff)}]`);
/** What YAML (1.2, and 1.1 readers such as Obsidian's) reads as a number. */
const NUMBER = /^[-+]?(\.?\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|0x[\da-f_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(:[0-5]?\d)+(\.\d*)?|\.(inf|nan))$/i;

/** `s` as a YAML scalar that reads back as the same text: plain when
 *  nothing in it means something else to YAML, double-quoted otherwise
 *  (`foo:` would be a mapping, `0x1F` a number, `a #b` a comment…). */
export function scalar(s: string, flow = false): string {
  const plain =
    s !== "" &&
    !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) &&
    !/\s$/.test(s) &&
    !CONTROL.test(s) &&
    !/:(\s|$)/.test(s) &&
    !/\s#/.test(s) &&
    !(flow && /[,[\]{}]/.test(s)) &&
    !/^(true|false|yes|no|on|off|y|n|null|~)$/i.test(s) &&
    !NUMBER.test(s);
  return plain ? s : JSON.stringify(s);
}

function keyName(key: string): string {
  return /^[^\s:#"'[\]{},&*!|>%@`\-?][^:#]*$/.test(key) && !/\s$/.test(key) ? key : JSON.stringify(key);
}

function valueText(v: PropertyValue): string {
  switch (v.kind) {
    case "empty": return "";
    case "text": return scalar(v.value);
    case "number": return v.value;
    case "checkbox": return v.value ? "true" : "false";
    case "list": return v.value.length === 0 ? "[]" : "";
    // A kind the panel does not know is shown read-only (KINDS): never set.
    default: return "";
  }
}

/** A top-level key line: the key, and the line up to its colon. */
function keyOf(line: string): { key: string; head: string } | null {
  const m = /^("([^"]*)"|'([^']*)'|([^\s#][^:]*?))\s*:(?=\s|$)/.exec(line);
  return m ? { key: (m[2] ?? m[3] ?? m[4] ?? "").trim(), head: m[0] } : null;
}

/** Where `key`'s lines are in `lines` (between the fences `0` and `end`):
 *  its line, and the lines under it — indented, or `-` items — with the
 *  blank and comment lines between them, not those after them. `null`
 *  when absent, or present twice (which one the core took is unknown). */
function extent(lines: string[], end: number, key: string): { start: number; stop: number } | null {
  let found: { start: number; stop: number } | null = null;
  for (let i = 1; i < end; i++) {
    if (keyOf(lines[i] ?? "")?.key !== key) continue;
    if (found) return null;
    let stop = i + 1;
    for (let j = i + 1; j < end; j++) {
      const l = lines[j] ?? "";
      if (/^\s*(#.*)?$/.test(l)) continue;
      if (/^[ \t]/.test(l) || /^-(\s|$)/.test(l)) {
        stop = j + 1;
        continue;
      }
      break;
    }
    found = { start: i, stop };
  }
  return found;
}

/** `key`'s lines in `text`, one string, or null when it has none. */
export function keyText(text: string, key: string): string | null {
  const lines = text.split(/\r?\n/);
  const end = frontmatterClose((i) => lines[i]);
  const at = end < 0 ? null : extent(lines, end, key);
  return at ? lines.slice(at.start, at.stop).join("\n") : null;
}

/** A one-line value as written after `key:` or `- `: one the panel can
 *  stand for (a closed quoted scalar, or a plain one with no mapping in
 *  it) and without a comment after it. */
function simple(v: string): boolean {
  const quoted = /^"(?:[^"\\]|\\.)*"|^'(?:[^']|'')*'/.exec(v);
  if (quoted) return /^\s*$/.test(v.slice(quoted[0].length));
  if (/^["'[\]{}&*!|>%@`#]/.test(v) || /^[-?:](\s|$)/.test(v)) return false;
  return !/:(\s|$)/.test(v) && !/(^|\s)#/.test(v);
}

/** A flow list on one line, `[a, "b, c"]`, as its items' own text; null
 *  for anything else (nesting, a comment, a quote left open). */
function flowItems(v: string): string[] | null {
  const m = /^\[(.*)\]\s*$/.exec(v);
  if (!m) return null;
  const body = m[1] ?? "";
  const items: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i] ?? "";
    cur += c;
    if (quote) {
      if (quote === '"' && c === "\\") cur += body[++i] ?? "";
      else if (c === quote) {
        if (quote === "'" && body[i + 1] === "'") cur += body[++i];
        else quote = null;
      }
    } else if ((c === '"' || c === "'") && cur.trim() === c) quote = c;
    else if ("[]{}#".includes(c)) return null;
    else if (c === ",") {
      items.push(cur.slice(0, -1).trim());
      cur = "";
    }
  }
  if (quote) return null;
  if (cur.trim() !== "" || items.length > 0) items.push(cur.trim());
  if (items.length > 0 && items[items.length - 1] === "") items.pop();
  return items.every((it) => it !== "" && simple(it)) ? items : null;
}

/** What `key`'s lines are to the panel. */
type Shape =
  | { kind: "empty" | "scalar" }
  | { kind: "flow"; items: string[] }
  | { kind: "block"; items: number[]; indent: string }
  | { kind: "fixed" };
function shapeOf(lines: string[]): Shape {
  const k = keyOf(lines[0] ?? "");
  if (!k) return { kind: "fixed" };
  const value = (lines[0] ?? "").slice(k.head.length).trim();
  if (lines.length === 1) {
    if (value === "") return { kind: "empty" };
    if (value.startsWith("[")) {
      const items = flowItems(value);
      return items ? { kind: "flow", items } : { kind: "fixed" };
    }
    return simple(value) ? { kind: "scalar" } : { kind: "fixed" };
  }
  // Lines under the key: a list of one-line items, or nothing the panel rewrites.
  if (value !== "") return { kind: "fixed" };
  const items: number[] = [];
  let indent: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^\s*$/.test(l)) continue;
    const m = /^([ \t]*)-(?:[ \t]+(.*))?$/.exec(l);
    if (!m || (m[2] !== undefined && !simple(m[2].trim()))) return { kind: "fixed" };
    if (indent === null) indent = m[1] ?? "";
    else if (m[1] !== indent) return { kind: "fixed" };
    items.push(i);
  }
  return { kind: "block", items, indent: indent ?? "  " };
}

/** The change to `doc` that makes `edit` to `key` — only that key's
 *  lines change — and the value the row shows afterwards (null: gone). */
export function propertyChange(doc: string, key: string, edit: Edit): { change: Change; value: PropertyValue | null } | { refused: Refusal } {
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const lines = doc.split(/\r?\n/);
  const offset = (line: number): number => {
    let n = 0;
    for (let i = 0; i < line; i++) n += (lines[i]?.length ?? 0) + eol.length;
    return n;
  };
  // Where the core finds the block (./frontmatter). A file that opens
  // with a fence the core does not close gets no second block on top.
  const end = frontmatterClose((i) => lines[i]);
  if (edit.op === "create") {
    const line = `${keyName(key)}:`;
    if (end < 0) {
      if (opensWithFence(lines[0])) return { refused: "fixed" };
      return { change: { from: 0, to: 0, insert: ["---", line, "---", ""].join(eol) }, value: { kind: "empty" } };
    }
    if (lines.slice(1, end).some((l) => keyOf(l)?.key === key)) return { refused: "exists" };
    const at = offset(end);
    return { change: { from: at, to: at, insert: line + eol }, value: { kind: "empty" } };
  }
  const at = end < 0 ? null : extent(lines, end, key);
  if (!at) return { refused: "changed" };
  const own = lines.slice(at.start, at.stop);
  const shape = shapeOf(own);
  if (shape.kind === "fixed") return { refused: "fixed" };
  const head = keyOf(own[0] ?? "")?.head ?? `${keyName(key)}:`;
  const replace = (from: number, to: number, next: string[]): Change => ({ from: offset(from), to: offset(to), insert: next.map((l) => l + eol).join("") });
  switch (edit.op) {
    case "remove":
      return { change: replace(at.start, at.stop, []), value: null };
    case "set": {
      if (shape.kind !== "scalar" && shape.kind !== "empty") return { refused: "fixed" };
      const v = valueText(edit.value);
      return { change: replace(at.start, at.start + 1, [v === "" ? head : `${head} ${v}`]), value: edit.value };
    }
    case "drop": {
      if (shape.kind === "flow") {
        if (edit.index >= shape.items.length) return { refused: "changed" };
        const items = shape.items.filter((_, i) => i !== edit.index);
        return { change: replace(at.start, at.start + 1, [`${head} [${items.join(", ")}]`]), value: listValue(items) };
      }
      if (shape.kind !== "block") return { refused: "fixed" };
      const line = shape.items[edit.index];
      if (line === undefined) return { refused: "changed" };
      const kept = shape.items.filter((_, i) => i !== edit.index).map((i) => own[i] ?? "");
      return { change: replace(at.start + line, at.start + line + 1, []), value: kept.length === 0 ? { kind: "empty" } : listValue(kept.map((l) => l.replace(/^[ \t]*-[ \t]*/, ""))) };
    }
    case "add": {
      if (shape.kind === "flow") {
        const items = [...shape.items, ...edit.values.map((v) => scalar(v, true))];
        return { change: replace(at.start, at.start + 1, [`${head} [${items.join(", ")}]`]), value: listValue(items) };
      }
      const fresh = edit.values.map((v) => `${shape.kind === "block" ? shape.indent : "  "}- ${scalar(v)}`);
      if (shape.kind === "empty") return { change: replace(at.start, at.start + 1, [head, ...fresh]), value: listValue(edit.values) };
      if (shape.kind !== "block") return { refused: "fixed" };
      const last = shape.items[shape.items.length - 1] ?? 0;
      const after = at.start + last + 1;
      const all = [...shape.items.map((i) => (own[i] ?? "").replace(/^[ \t]*-[ \t]*/, "")), ...edit.values];
      return { change: replace(after, after, fresh), value: listValue(all) };
    }
  }
}

/** A list as a row shows it, from the items' text as written (quotes off). */
function listValue(raw: string[]): PropertyValue {
  const unquote = (s: string): string => {
    if (/^".*"$/.test(s)) {
      try {
        return JSON.parse(s) as string;
      } catch {
        return s.slice(1, -1);
      }
    }
    return /^'.*'$/.test(s) ? s.slice(1, -1).replaceAll("''", "'") : s;
  };
  return { kind: "list", value: raw.map(unquote) };
}
