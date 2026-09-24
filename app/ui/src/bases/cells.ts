// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A value of a base as a view shows it: text, number, date, link, list,
// image, checkbox. Also its plain text — for the view's search, the
// Markdown table and the CSV — and, for a note property, the value a
// write gives it back.

import type { BaseCell, BaseColumn, PropertyValue } from "../bindings";
import type { BaseStrings } from "./strings";

/** What a cell needs from the window around it. */
export type CellHost = {
  locale: string;
  s: BaseStrings;
  /** Open a file of the folder; `aside` in a split. */
  open(path: string, aside: boolean): void;
  /** A URL for an image of the folder named from `source`, or null when
   *  there is none; undefined while it is looked up (`redraw` then). */
  image(source: string, target: string, redraw: () => void): string | null | undefined;
  /** Whether content from the web may load (the settings' choice). */
  remote(): boolean;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A date the core sent (wall clock, read with UTC getters). */
export function formatDate(ms: number, time: boolean, locale: string, style: "short" | "long" = "short"): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = style === "long" ? { dateStyle: "long", timeZone: "UTC" } : { dateStyle: "medium", timeZone: "UTC" };
  if (time) opts.timeStyle = "short";
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

/** `YYYY-MM-DD` of a wall-clock date. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function formatDuration(ms: number, locale: string): string {
  const abs = Math.abs(ms);
  const units: [number, Intl.NumberFormatOptions["unit"]][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
    [1_000, "second"],
  ];
  for (const [size, unit] of units) {
    if (abs >= size || unit === "second") {
      return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(ms / size);
    }
  }
  return String(ms);
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(n);
}

/** The plain text of a cell. */
export function cellText(c: BaseCell | null | undefined, host: Pick<CellHost, "locale" | "s">): string {
  if (!c) return "";
  switch (c.kind) {
    case "empty":
      return "";
    case "text":
    case "html":
    case "icon":
      return c.value;
    case "number":
      return c.value === null ? "" : formatNumber(c.value, host.locale);
    case "bool":
      return c.value ? host.s.yes : host.s.no;
    case "date":
      return c.value.ms === null ? "" : formatDate(c.value.ms, c.value.time, host.locale);
    case "duration":
      return c.value === null ? "" : formatDuration(c.value, host.locale);
    case "list":
      return c.value.map((v) => cellText(v, host)).join(", ");
    case "object":
      return c.value.map(([k, v]) => `${k}: ${cellText(v, host)}`).join(", ");
    case "link":
      return c.value.display ?? c.value.target;
    case "file":
    case "image":
      return c.value;
    case "error":
      return errorText(c.value.kind, c.value.name, host.s);
  }
}

export function errorText(kind: string, name: string, s: BaseStrings): string {
  const f = s.errors[kind];
  return f ? f(name) : name;
}

/** A name a person reads for a column: the base's display name, else the
 *  file field's name in the interface language, else the property's own. */
export function columnLabel(col: Pick<BaseColumn, "id" | "name">, s: BaseStrings): string {
  if (col.name) return col.name;
  if (col.id.startsWith("file.")) return s.fileProps[col.id.slice(5)] ?? col.id.slice(5);
  if (col.id.startsWith("formula.")) return col.id.slice(8);
  return col.id.startsWith("note.") ? col.id.slice(5) : col.id;
}

/** The note property a column shows, when it shows one a view may write:
 *  not a file's field, not a formula. */
export function noteKey(id: string): string | null {
  if (id.startsWith("file.") || id.startsWith("formula.") || id.startsWith("this.")) return null;
  return id.startsWith("note.") ? id.slice(5) : id;
}

/** The value a write gives a property to hold what `c` shows; null when a
 *  view cannot write it back (a list, an object, a link). */
export function propertyValue(c: BaseCell | null): PropertyValue | null {
  if (!c) return { kind: "empty" };
  switch (c.kind) {
    case "empty":
      return { kind: "empty" };
    case "text":
      return { kind: "text", value: c.value };
    case "number":
      return c.value === null ? null : { kind: "number", value: String(c.value) };
    case "bool":
      return { kind: "checkbox", value: c.value };
    case "date":
      return c.value.ms === null ? null : { kind: "text", value: c.value.time ? isoDateTime(c.value.ms) : isoDay(c.value.ms) };
    default:
      return null;
  }
}

/** `YYYY-MM-DDTHH:mm:ss` of a wall-clock time, Obsidian's form. */
export function isoDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${isoDay(ms)}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** A cell drawn. `source` is the row's file, which links and images are
 *  named from. */
export function renderCell(c: BaseCell | null | undefined, host: CellHost, source: string): Node {
  if (!c) return document.createTextNode("");
  switch (c.kind) {
    case "empty":
      return document.createTextNode("");
    case "text":
      return document.createTextNode(c.value);
    case "number": {
      const s = h("span", "base-num", c.value === null ? "" : formatNumber(c.value, host.locale));
      return s;
    }
    case "bool": {
      const box = h("input");
      box.type = "checkbox";
      box.checked = c.value;
      box.disabled = true;
      box.className = "base-check";
      box.setAttribute("aria-label", c.value ? host.s.yes : host.s.no);
      return box;
    }
    case "date": {
      const t = h("time", "base-date", c.value.ms === null ? "" : formatDate(c.value.ms, c.value.time, host.locale));
      if (c.value.ms !== null) t.dateTime = c.value.time ? isoDateTime(c.value.ms) : isoDay(c.value.ms);
      return t;
    }
    case "duration":
      return document.createTextNode(c.value === null ? "" : formatDuration(c.value, host.locale));
    case "list": {
      const wrap = h("span", "base-pills");
      for (const item of c.value) {
        const pill = h("span", "base-pill");
        pill.append(renderCell(item, host, source));
        wrap.append(pill);
      }
      return wrap;
    }
    case "object":
      return document.createTextNode(cellText(c, host));
    case "link":
      return link(c.value.display ?? c.value.target, c.value.path, host);
    case "file":
      return link(c.value.split("/").pop() ?? c.value, c.value, host);
    case "image":
      return image(c.value, host, source);
    case "icon":
      return h("span", "base-icon", c.value);
    case "html": {
      // Shown as its text: a base is content from the folder, and the
      // window runs no markup a file brings with it.
      return document.createTextNode(c.value);
    }
    case "error": {
      const e = h("span", "base-error", "⚠");
      const text = errorText(c.value.kind, c.value.name, host.s);
      e.title = text;
      e.setAttribute("role", "img");
      e.setAttribute("aria-label", text);
      return e;
    }
  }
}

/** A link to a file of the folder; an unresolved one is shown as such. */
export function link(label: string, path: string | null, host: CellHost): HTMLElement {
  if (!path) {
    const u = h("span", "base-link unresolved", label);
    return u;
  }
  const a = h("a", "base-link", label);
  a.href = "#";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    host.open(path, e.metaKey || e.ctrlKey);
  });
  return a;
}

function image(src: string, host: CellHost, source: string): Node {
  if (/^#[0-9a-f]{3,8}$/i.test(src)) {
    const swatch = h("span", "base-swatch");
    swatch.style.background = src;
    return swatch;
  }
  const img = h("img", "base-img");
  img.alt = "";
  img.loading = "lazy";
  if (/^https?:\/\//i.test(src)) {
    if (!host.remote()) return h("span", "base-img-off", "🖼");
    img.src = src;
    img.referrerPolicy = "no-referrer";
    return img;
  }
  const target = src.replace(/^\[\[|\]\]$/g, "").split("|")[0] ?? src;
  const set = () => {
    const url = host.image(source, target, set);
    if (url) img.src = url;
  };
  set();
  return img;
}

/** A Markdown table of the rows: what a view materializes into a note
 *  (ADR 0013). Pipes and line breaks in a value are escaped. */
export function markdownTable(labels: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head = `| ${labels.map(esc).join(" | ")} |`;
  const rule = `| ${labels.map(() => "---").join(" | ")} |`;
  return [head, rule, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n") + "\n";
}

export function csv(labels: string[], rows: string[][]): string {
  const q = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [labels, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
