// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A base's YAML changed from the view's menus — a sort, a column, a new
// view — the way Obsidian's own menus change it: the keys touched and
// nothing else. The `yaml` package keeps the comments, the order of the
// keys and the quoting of what it does not touch (ADR 0053). The core
// reads the result; nothing here evaluates anything.

import { Document, isMap, isSeq, parseDocument, YAMLMap, YAMLSeq } from "yaml";

/** A view as the menus read it: plain values, never the document's nodes. */
export type ViewConfig = {
  type: string;
  name: string;
  [key: string]: unknown;
};

function doc(text: string): Document {
  // YAML 1.2, the core's reading (spec Q24); duplicate keys are the core's
  // to report, not a reason to refuse an edit here.
  return parseDocument(text, { version: "1.2", uniqueKeys: false, keepSourceTokens: false });
}

/** The text of `d`, as close to what `was` wrote as the package keeps it:
 *  inline lists and maps padded with spaces (`[ a, b ]`) only when the
 *  text already pads them, since the package applies one style to all.
 *  An empty document stays empty. */
function out(d: Document, was: string): string {
  const padded = /[[{] +[^\s\]}]/.test(was);
  const tight = /[[{][^\s\]}]/.test(was);
  const s = d.toString({ lineWidth: 0, indentSeq: true, flowCollectionPadding: padded || !tight });
  if (s === "null\n") return "";
  // No final line break added where the file had none.
  return was !== "" && !was.endsWith("\n") && s.endsWith("\n") ? s.slice(0, -1) : s;
}

/** Whether `text` reads as YAML the menus can change: a mapping, or
 *  nothing yet, that the package writes back exactly as it is — so that an
 *  edit changes the keys it touches and not one other character. A base
 *  left mid-edit, or written in a style the package does not keep (other
 *  indentation, a folded text, blank lines), is edited as text only. */
export function editable(text: string): boolean {
  if (text.trim() === "") return true;
  const d = doc(text);
  return d.errors.length === 0 && (d.contents === null || isMap(d.contents)) && out(d, text) === text;
}

/** The views of a base, as plain values. */
export function views(text: string): ViewConfig[] {
  const d = doc(text);
  const v = d.get("views");
  if (!isSeq(v)) return [];
  return v.items.map((item) => {
    const plain = (isMap(item) ? item.toJSON() : {}) as Record<string, unknown>;
    return { ...plain, type: String(plain["type"] ?? ""), name: String(plain["name"] ?? "") };
  });
}

/** The base's own filters, as plain values (`null` when it has none). */
export function baseFilters(text: string): unknown {
  const d = doc(text);
  const f = d.get("filters");
  return f === undefined ? null : ((f as { toJSON?: () => unknown })?.toJSON?.() ?? f);
}

/** The formulas' names. */
export function formulaNames(text: string): string[] {
  const d = doc(text);
  const f = d.get("formulas");
  return isMap(f) ? f.items.map((p) => String((p.key as { value?: unknown })?.value ?? p.key)) : [];
}

/** The view list, made if absent. */
function viewSeq(d: Document): YAMLSeq {
  let v = d.get("views");
  if (!isSeq(v)) {
    if (d.contents === null || !isMap(d.contents)) d.contents = d.createNode({}) as unknown as typeof d.contents;
    v = new YAMLSeq();
    d.set("views", v);
  }
  return v as YAMLSeq;
}

function viewAt(d: Document, index: number): YAMLMap | null {
  const v = d.get("views");
  if (!isSeq(v)) return null;
  const item = v.items[index];
  return isMap(item) ? item : null;
}

/** `key` of view `index` set to `value`, or removed when `value` is
 *  `undefined`. A view that is not there changes nothing. */
export function setViewKey(text: string, index: number, key: string, value: unknown): string {
  const d = doc(text);
  const view = viewAt(d, index);
  if (!view) return text;
  if (value === undefined) view.delete(key);
  else view.set(key, d.createNode(value));
  return out(d, text);
}

/** `key` inside the view's own `verso:` mapping: what Verso keeps for a
 *  layout that Obsidian names no key for (ADR 0053), apart from the keys
 *  Obsidian and its plugins use. */
export function setVersoKey(text: string, index: number, key: string, value: unknown): string {
  const d = doc(text);
  const view = viewAt(d, index);
  if (!view) return text;
  let own = view.get("verso");
  if (!isMap(own)) {
    own = new YAMLMap();
    view.set("verso", own);
  }
  const m = own as YAMLMap;
  if (value === undefined) m.delete(key);
  else m.set(key, d.createNode(value));
  if (m.items.length === 0) view.delete("verso");
  return out(d, text);
}

/** A key at the base's top (`filters`), set or removed. */
export function setBaseKey(text: string, key: string, value: unknown): string {
  const d = doc(text);
  if (d.contents === null || !isMap(d.contents)) d.contents = d.createNode({}) as unknown as typeof d.contents;
  if (value === undefined) d.delete(key);
  else d.set(key, d.createNode(value));
  return out(d, text);
}

/** A view added at the end; its index comes back with the text. */
export function addView(text: string, view: ViewConfig): { text: string; index: number } {
  const d = doc(text);
  const seq = viewSeq(d);
  seq.items.push(d.createNode(view));
  return { text: out(d, text), index: seq.items.length - 1 };
}

export function removeView(text: string, index: number): string {
  const d = doc(text);
  const v = d.get("views");
  if (!isSeq(v) || index < 0 || index >= v.items.length) return text;
  v.items.splice(index, 1);
  return out(d, text);
}

export function duplicateView(text: string, index: number, name: string): { text: string; index: number } {
  const d = doc(text);
  const v = d.get("views");
  if (!isSeq(v) || !isMap(v.items[index])) return { text, index };
  const copy = d.createNode((v.items[index] as YAMLMap).toJSON()) as YAMLMap;
  copy.set("name", name);
  v.items.splice(index + 1, 0, copy);
  return { text: out(d, text), index: index + 1 };
}

/** A property's display name (`properties.<id>.displayName`). */
export function setDisplayName(text: string, id: string, name: string | undefined): string {
  const d = doc(text);
  if (d.contents === null || !isMap(d.contents)) d.contents = d.createNode({}) as unknown as typeof d.contents;
  let props = d.get("properties");
  if (!isMap(props)) {
    props = new YAMLMap();
    d.set("properties", props);
  }
  const p = props as YAMLMap;
  let entry = p.get(id);
  if (!isMap(entry)) {
    entry = new YAMLMap();
    p.set(id, entry);
  }
  const e = entry as YAMLMap;
  if (name === undefined || name === "") e.delete("displayName");
  else e.set("displayName", name);
  if (e.items.length === 0) p.delete(id);
  if (p.items.length === 0) d.delete("properties");
  return out(d, text);
}
