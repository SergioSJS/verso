// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The properties panel: the frontmatter as a table of typed rows, edited
// in place. Nothing here touches the file: an edit becomes one change to
// the editor's document — only the lines of the key it concerns — and
// goes to disk through the note's ordinary save (invariants 7 and 8: the
// user asked for exactly this change, the rest of the file is untouched).

import type { Property, PropertyValue } from "./bindings";
import { icon } from "./icons";

export type PropsStrings = {
  addProperty: string;
  keyPlaceholder: string;
  emptyValue: string;
  addItem: string;
  remove: string;
};

export type PropsOptions = {
  strings: PropsStrings;
  /** A value changed, or `null`: the property is removed. */
  onChange: (key: string, value: PropertyValue | null) => void;
  /** A tag pill was clicked. */
  onTag: (tag: string) => void;
};

const LIST_KEYS = new Set(["tags", "tag", "aliases", "alias", "cssclasses", "cssclass"]);
const TAG_KEYS = new Set(["tags", "tag"]);

function iconOf(key: string, v: PropertyValue): string {
  if (TAG_KEYS.has(key.toLowerCase())) return "tag";
  switch (v.kind) {
    case "list": return "bullets";
    case "checkbox": return "task";
    case "number": return "hash";
    case "text": return /^\d{4}-\d{2}-\d{2}/.test(v.value) ? "calendar" : "text";
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
  constructor(private readonly opts: PropsOptions) {
    this.el.hidden = true;
  }
  render(items: Property[]): void {
    this.items = items.map((p) => ({ key: p.key, value: p.value }));
    this.paint();
  }
  private paint(focusKey?: string): void {
    const rows = this.items.map((p) => this.row(p));
    const add = h("button", "prop-new");
    add.type = "button";
    add.append(icon("plus"), h("span", "", this.opts.strings.addProperty));
    add.addEventListener("click", () => this.newRow(add));
    this.el.replaceChildren(...rows, add);
    this.el.hidden = false;
    this.el.classList.toggle("empty", this.items.length === 0);
    if (focusKey !== undefined) {
      const target = this.el.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] input, [data-key="${CSS.escape(focusKey)}"] .prop-add`);
      target?.focus();
    }
  }
  private commit(key: string, value: PropertyValue | null): void {
    const i = this.items.findIndex((p) => p.key === key);
    if (value === null) {
      if (i >= 0) this.items.splice(i, 1);
    } else if (i >= 0) this.items[i] = { key, value };
    else this.items.push({ key, value });
    this.opts.onChange(key, value);
    this.paint(value === null ? undefined : key);
  }
  private row(p: Property): HTMLElement {
    const row = h("div", `prop kind-${p.value.kind}`);
    row.dataset["key"] = p.key;
    const key = h("span", "prop-key");
    key.append(icon(iconOf(p.key, p.value)), h("span", "prop-key-text", p.key));
    const value = h("div", "prop-value");
    const isList = p.value.kind === "list" || (p.value.kind === "empty" && LIST_KEYS.has(p.key.toLowerCase()));
    if (isList) this.listEditor(value, p.key, p.value.kind === "list" ? p.value.value : []);
    else if (p.value.kind === "checkbox") {
      const box = h("input");
      box.type = "checkbox";
      box.checked = p.value.value;
      box.addEventListener("change", () => this.commit(p.key, { kind: "checkbox", value: box.checked }));
      value.append(box);
    } else {
      const input = h("input", "prop-input");
      input.type = p.value.kind === "number" ? "number" : "text";
      if (p.value.kind === "number") input.step = "any";
      input.value = p.value.kind === "text" || p.value.kind === "number" ? p.value.value : "";
      input.placeholder = this.opts.strings.emptyValue;
      const initial = input.value;
      const done = () => {
        const v = input.value.trim();
        if (v === initial.trim()) return;
        if (v === "") this.commit(p.key, { kind: "empty" });
        else if (p.value.kind === "number" || (p.value.kind === "empty" && /^-?\d+(\.\d+)?$/.test(v))) this.commit(p.key, { kind: "number", value: v });
        else if (p.value.kind === "empty" && /^(true|false)$/i.test(v)) this.commit(p.key, { kind: "checkbox", value: v.toLowerCase() === "true" });
        else this.commit(p.key, { kind: "text", value: v });
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
    }
    const remove = h("button", "prop-remove");
    remove.type = "button";
    remove.title = this.opts.strings.remove;
    remove.append(icon("close"));
    remove.addEventListener("click", () => this.commit(p.key, null));
    row.append(key, value, remove);
    return row;
  }
  private listEditor(host: HTMLElement, key: string, items: string[]): void {
    const tags = TAG_KEYS.has(key.toLowerCase());
    for (const [i, item] of items.entries()) {
      const pill = h("span", tags ? "pill tag-pill" : "pill");
      const label = h("button", "pill-label", tags ? `#${item.replace(/^#/, "")}` : item);
      label.type = "button";
      if (tags) label.addEventListener("click", () => this.opts.onTag(item.replace(/^#/, "")));
      else label.disabled = true;
      const x = h("button", "pill-x");
      x.type = "button";
      x.title = this.opts.strings.remove;
      x.append(icon("close"));
      x.addEventListener("click", () => {
        const next = items.slice();
        next.splice(i, 1);
        this.commit(key, next.length === 0 ? { kind: "empty" } : { kind: "list", value: next });
      });
      pill.append(label, x);
      host.append(pill);
    }
    const add = h("input", "prop-add");
    add.type = "text";
    add.placeholder = this.opts.strings.addItem;
    const push = () => {
      const v = add.value.trim().replace(/,+$/, "").trim();
      if (!v) return;
      const parts = v.split(",").map((s) => (tags ? s.trim().replace(/^#/, "") : s.trim())).filter(Boolean);
      add.value = "";
      this.commit(key, { kind: "list", value: [...items, ...parts] });
    };
    add.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        push();
      } else if (e.key === "Backspace" && add.value === "" && items.length > 0) {
        e.preventDefault();
        this.commit(key, items.length === 1 ? { kind: "empty" } : { kind: "list", value: items.slice(0, -1) });
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
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const key = input.value.trim().replace(/:+$/, "");
      row.remove();
      if (!commit || !key || this.items.some((p) => p.key === key)) return;
      this.commit(key, { kind: "empty" });
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

function scalar(s: string): string {
  if (s === "") return '""';
  const plainSafe = /^[^\s\-?:,[\]{}#&*!|>'"%@`][^#]*$/.test(s) && !/:\s|\s$/.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/^[-+]?(\d[\d_]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s);
  return plainSafe ? s : JSON.stringify(s);
}

function serialize(key: string, v: PropertyValue): string[] {
  const k = /^[^\s:#"'[\]{},&*!|>%@`-][^:#]*$/.test(key) ? key : JSON.stringify(key);
  switch (v.kind) {
    case "empty": return [`${k}:`];
    case "text": return [`${k}: ${scalar(v.value)}`];
    case "number": return [`${k}: ${v.value}`];
    case "checkbox": return [`${k}: ${v.value ? "true" : "false"}`];
    case "list": return v.value.length === 0 ? [`${k}: []`] : [`${k}:`, ...v.value.map((item) => `  - ${scalar(item)}`)];
  }
}

/** The one change to `doc` that sets `key` to `value` (or removes it when
 *  `null`) in the frontmatter, creating the block when there is none.
 *  Only that key's lines change; `null` when the frontmatter is not
 *  closed (nothing is guessed then). */
export function frontmatterChange(doc: string, key: string, value: PropertyValue | null): { from: number; to: number; insert: string } | null {
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const lines = doc.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    if (value === null) return null;
    return { from: 0, to: 0, insert: ["---", ...serialize(key, value), "---", ""].join(eol) };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i]?.trim() === "---" || lines[i]?.trim() === "...") {
    end = i;
    break;
  }
  if (end < 0) return null;
  const offset = (line: number): number => {
    let n = 0;
    for (let i = 0; i < line; i++) n += (lines[i]?.length ?? 0) + eol.length;
    return n;
  };
  const keyOf = (line: string): string | null => {
    const m = /^("([^"]*)"|'([^']*)'|([^\s#][^:]*?))\s*:(\s|$)/.exec(line);
    return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
  };
  let start = -1;
  for (let i = 1; i < end; i++) if (keyOf(lines[i] ?? "") === key) {
    start = i;
    break;
  }
  const fresh = value === null ? [] : serialize(key, value);
  if (start < 0) {
    if (value === null) return null;
    const at = offset(end);
    return { from: at, to: at, insert: fresh.join(eol) + eol };
  }
  let stop = start + 1;
  while (stop < end && /^(\s|-\s|$)/.test(lines[stop] ?? "")) stop++;
  return { from: offset(start), to: offset(stop), insert: fresh.length === 0 ? "" : fresh.join(eol) + eol };
}
