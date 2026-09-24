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

import type { Property, PropertyValue } from "./bindings";
import { frontmatterClose, opensWithFence } from "./frontmatter";
import { icon } from "./icons";

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
};

const LIST_KEYS = new Set(["tags", "tag", "aliases", "alias", "cssclasses", "cssclass"]);
const TAG_KEYS = new Set(["tags", "tag"]);
const KINDS = new Set(["text", "number", "checkbox", "list", "empty"]);

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
  /** Each key's lines as the rows were drawn from them: an edit goes
   *  through only while the editor's text still has exactly these. */
  private drawn = new Map<string, string | null>();
  private readOnly = false;
  /** A redraw asked for while an input of the panel has the focus: it
   *  waits for the focus to leave, so nothing typed there is lost. */
  private pending: (() => void) | null = null;
  constructor(private readonly opts: PropsOptions) {
    this.el.hidden = true;
    this.el.addEventListener("focusout", (e) => {
      if (this.pending && !this.el.contains(e.relatedTarget as Node | null)) {
        const run = this.pending;
        this.pending = null;
        queueMicrotask(run);
      }
    });
  }
  /** Draw the rows the core read from `text`; `readOnly` for a note that
   *  is never edited here. */
  render(items: Property[], text: string, readOnly = false): void {
    const draw = () => {
      this.items = items.map((p) => ({ key: p.key, value: p.value }));
      this.drawn = new Map(this.items.map((p) => [p.key, keyText(text, p.key)]));
      this.readOnly = readOnly;
      this.paint();
    };
    if (this.el.contains(document.activeElement)) this.pending = draw;
    else draw();
  }
  private paint(focusKey?: string): void {
    const rows = this.items.map((p) => this.row(p));
    const add = h("button", "prop-new");
    add.type = "button";
    add.append(icon("plus"), h("span", "", this.opts.strings.addProperty));
    add.addEventListener("click", () => this.newRow(add));
    add.hidden = this.readOnly;
    this.el.replaceChildren(...rows, add);
    this.el.hidden = false;
    this.el.classList.toggle("empty", this.items.length === 0);
    if (focusKey !== undefined) {
      const target = this.el.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] input, [data-key="${CSS.escape(focusKey)}"] .prop-add`);
      target?.focus();
    }
  }
  /** One edit of `key`, against the editor's text now. */
  private edit(key: string, edit: Edit, focus = true): void {
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
  private row(p: Property): HTMLElement {
    const fixed = !this.editable(p);
    const row = h("div", `prop kind-${p.value.kind}${fixed ? " fixed" : ""}`);
    row.dataset["key"] = p.key;
    if (fixed && !this.readOnly) row.title = this.opts.strings.fixed;
    const key = h("span", "prop-key");
    key.append(icon(iconOf(p.key, p.value)), h("span", "prop-key-text", p.key));
    const value = h("div", "prop-value");
    const isList = p.value.kind === "list" || (p.value.kind === "empty" && LIST_KEYS.has(p.key.toLowerCase()));
    if (isList) this.listEditor(value, p.key, p.value.kind === "list" ? p.value.value : [], fixed);
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
      input.type = p.value.kind === "number" ? "number" : "text";
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
      input.addEventListener("blur", done);
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") input.blur();
        else if (e.key === "Escape") {
          input.value = initial;
          input.blur();
        }
      });
      value.append(input);
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
    const row = h("div", "prop kind-new");
    const input = h("input", "prop-input prop-key-input");
    input.type = "text";
    input.placeholder = this.opts.strings.keyPlaceholder;
    input.setAttribute("aria-label", this.opts.strings.keyPlaceholder);
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const key = input.value.trim().replace(/:+$/, "");
      row.remove();
      if (!commit || !key) return;
      this.edit(key, { op: "create" });
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    row.append(h("span", "prop-key"), input);
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
