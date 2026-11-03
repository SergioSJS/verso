// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// YAML read into the diagram's tree (ADR 0106 item 3), with the `yaml`
// library (ISC) that the window already holds: it keeps where each value
// sits. Each document of a multi-document file is a root of its own; an
// alias is a line to the box of its anchor and never a copy, so a file
// built to expand into millions of values ("billion laughs") draws as a
// few boxes; a tag is a small label; comments are not drawn. The walk over
// the library's nodes is a loop with a stack, not a recursion.

import { type Document, isAlias, isMap, isPair, isScalar, isSeq, type Node, type Pair, parseAllDocuments, type Scalar } from "yaml";
import { Builder, BoxLimit, closeBox, type DNode, type ParseError, type Row, type Tree } from "./model";

type Frame = {
  src: Node;
  items: readonly unknown[];
  at: number;
  box: DNode;
  row: Row | null;
  map: boolean;
};

function tagOf(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  return tag.startsWith("tag:yaml.org,2002:") ? `!!${tag.slice(18)}` : tag;
}

function rangeOf(n: { range?: readonly number[] | null }): [number, number] {
  const r = n.range;
  return r ? [r[0] ?? 0, r[1] ?? r[0] ?? 0] : [0, 0];
}

/** A scalar as a row's value: the text, the type and, for a number, its source text. */
function scalarRow(text: string, s: Scalar): { text: string; type: Row["type"] } {
  const v = s.value;
  if (v === null || v === undefined) return { text: "null", type: "null" };
  if (typeof v === "number") {
    const [a, z] = rangeOf(s);
    const src = text.slice(a, z).trim();
    return { text: src !== "" ? src : String(v), type: "number" };
  }
  if (typeof v === "boolean") return { text: String(v), type: "boolean" };
  if (typeof v === "bigint") return { text: String(v), type: "number" };
  return { text: typeof v === "string" ? v : String(v), type: "string" };
}

function keyText(text: string, k: unknown): string {
  if (isScalar(k)) return k.value === null || k.value === undefined ? "null" : String(k.value);
  if (isAlias(k)) return `*${k.source}`;
  const [a, z] = rangeOf(k as { range?: readonly number[] });
  return text.slice(a, Math.min(z, a + 60)).replace(/\s+/g, " ").trim();
}

function walkDocument(text: string, doc: Document, label: string, b: Builder, anchors: Map<Node, number>): void {
  // Anchors by name as the walk opens them: document order puts an anchor before its aliases, and a name defined again
  // means the nearest one before. One lookup per alias; the library's own resolve() walks the whole document each time.
  const byName = new Map<string, Node>();
  const contents = doc.contents;
  if (contents === null || contents === undefined) return;
  const stack: Frame[] = [];

  // A root that is a plain value: a box with one row.
  if (!isMap(contents) && !isSeq(contents)) {
    const [from, to] = rangeOf(contents as Node);
    const n = b.node(-1, label, "object", from);
    n.to = to;
    if (isAlias(contents)) b.row(n, { key: "", text: `*${contents.source}`, type: "alias", from, to });
    else if (isScalar(contents)) {
      const v = scalarRow(text, contents);
      const row = b.row(n, { key: "", text: v.text, type: v.type, from, to });
      const tag = tagOf(contents.tag);
      if (tag) row.tag = tag;
    }
    return;
  }

  const open = (src: Node, key: string, keyFrom: number, parent: Frame | null): void => {
    const array = isSeq(src);
    const [from, to] = rangeOf(src);
    const row = parent ? b.containerRow(parent.box, key, keyFrom, from, array) : null;
    const box = b.node(parent ? parent.box.id : -1, parent ? key : label, array ? "array" : "object", from);
    box.to = to;
    const anchor = (src as { anchor?: string }).anchor;
    if (anchor) box.anchor = anchor;
    const tag = tagOf((src as { tag?: string }).tag);
    if (tag) box.tag = tag;
    anchors.set(src, box.id);
    if (anchor) byName.set(anchor, src);
    stack.push({ src, items: array ? src.items : (src as { items: unknown[] }).items, at: 0, box, row, map: !array });
  };

  open(contents, label, 0, null);
  while (stack.length > 0) {
    const f = stack[stack.length - 1]!;
    if (f.at >= f.items.length) {
      stack.pop();
      closeBox(f.box, f.row, f.box.to);
      continue;
    }
    const item = f.items[f.at]!;
    const index = f.at++;
    let key = String(index);
    let keyFrom = 0;
    let value: unknown = item;
    if (f.map && isPair(item)) {
      const pair = item as Pair;
      key = keyText(text, pair.key);
      keyFrom = rangeOf(pair.key as { range?: readonly number[] })[0];
      value = pair.value;
    } else if (!f.map) keyFrom = rangeOf(item as { range?: readonly number[] })[0];
    if (value === null || value === undefined) {
      b.row(f.box, { key, text: "null", type: "null", from: keyFrom, to: keyFrom, keyFrom });
    } else if (isMap(value) || isSeq(value)) {
      open(value, key, keyFrom, f);
    } else if (isAlias(value)) {
      const [from, to] = rangeOf(value);
      const target = byName.get(value.source);
      const id = target ? (anchors.get(target) ?? -1) : -1;
      if (id >= 0) b.row(f.box, { key, text: `*${value.source}`, type: "alias", from, to, keyFrom, link: id });
      else if (isScalar(target)) b.row(f.box, { key, text: `*${value.source} = ${scalarRow(text, target).text}`, type: "alias", from, to, keyFrom });
      else b.row(f.box, { key, text: `*${value.source}`, type: "alias", from, to, keyFrom });
    } else if (isScalar(value)) {
      const [from, to] = rangeOf(value);
      const v = scalarRow(text, value);
      const anchor = value.anchor;
      if (anchor) byName.set(anchor, value);
      const row = b.row(f.box, { key, text: anchor ? `&${anchor} ${v.text}` : v.text, type: v.type, from, to, keyFrom });
      const tag = tagOf(value.tag);
      if (tag) row.tag = tag;
    }
  }
}

/** The deepest nesting handed to the library. It recurses on each level and
 *  its stack ran out between 700 and 1000 levels in Node; when the stack
 *  runs out while the engine compiles one of its regular expressions, V8
 *  aborts the whole process instead of throwing (seen in CI, 2026-11-03),
 *  and a WebView2 page is V8. Far past any real file. */
export const YAML_MAX_DEPTH = 256;

/** Whether the quote at `at` opens a quoted value: first on its line, or
 *  after `:`, `,`, `[`, `{`, `-` or `?` and spaces. An apostrophe inside a
 *  plain value (`Rowan's sword`) is not one. */
function opensValue(text: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
  return j < 0 || ":,[{-?\n".includes(text[j] ?? "");
}

/** An upper bound of the text's nesting, in one pass with no recursion:
 *  the deepest flow brackets outside quotes and comments, plus the widest
 *  indentation with the compact `- ` or `? ` entries that open a line. */
export function yamlDepthBound(text: string): number {
  let flow = 0;
  let deepestFlow = 0;
  let deepestBlock = 0;
  let lineStart = true;
  let block = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") {
      lineStart = true;
      block = 0;
      continue;
    }
    if (lineStart) {
      if (c === " " || c === "\t") {
        block++;
        continue;
      }
      if ((c === "-" || c === "?") && (text[i + 1] === " " || text[i + 1] === "\t")) {
        block += 2;
        i++;
        continue;
      }
      lineStart = false;
      if (block > deepestBlock) deepestBlock = block;
    }
    if (c === "#" && (i === 0 || /\s/.test(text[i - 1] ?? ""))) {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (c === '"' && opensValue(text, i)) {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (c === "'" && opensValue(text, i)) {
      for (i++; i < text.length; i++) if (text[i] === "'" && text[++i] !== "'") break;
      i--;
    } else if (c === "[" || c === "{") {
      if (++flow > deepestFlow) deepestFlow = flow;
    } else if ((c === "]" || c === "}") && flow > 0) {
      flow--;
    }
  }
  if (block > deepestBlock) deepestBlock = block;
  return deepestFlow + deepestBlock;
}

/** YAML: every document a root. */
export function parseYaml(text: string): Tree {
  const b = new Builder("yaml");
  let error: ParseError | null = null;
  if (yamlDepthBound(text) > YAML_MAX_DEPTH) {
    return b.done({ message: "The YAML nests too deeply to draw", from: 0, to: Math.min(1, text.length) });
  }
  try {
    const docs = parseAllDocuments(text, { uniqueKeys: false, prettyErrors: false, merge: false });
    const list = Array.isArray(docs) ? docs : [docs];
    const anchors = new Map<Node, number>();
    let n = 0;
    for (const doc of list) {
      const e = doc.errors[0];
      // The library recurses on nesting and reports the engine's own words when its stack runs out: ours say it plainly.
      const message = /call stack/i.test(e?.message ?? "") ? "The YAML nests too deeply to draw" : (e?.message.split("\n")[0] ?? "");
      if (e && !error) error = { message, from: e.pos[0], to: Math.max(e.pos[1], e.pos[0] + 1) };
      n++;
      walkDocument(text, doc, String(n), b, anchors);
    }
  } catch (e) {
    if (e instanceof BoxLimit) throw e;
    // The library itself recurses on nesting: past its stack it says so, and the diagram says it too.
    const range = e instanceof RangeError;
    error = { message: range ? "The YAML nests too deeply to draw" : e instanceof Error ? e.message : "Not YAML", from: 0, to: Math.min(1, text.length) };
  }
  return b.done(error);
}
