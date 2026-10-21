// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Structured data drawn as a diagram (ADR 0106): the one tree every format
// is read into. A box is an object, an array, an XML element or a CSV
// record; a row is one member of it, a plain value or a line to a child
// box. Each value keeps where it sits in the text, and a number keeps its
// source text. Pure: no DOM, no CodeMirror, no contract; nothing here
// recurses on the call stack, so no depth of nesting can overflow it.
//
// The idea of the box-and-line view is JSON Crack's (Apache-2.0, see the
// credits page); no code of it is carried over.

export type Format = "json" | "jsonc" | "jsonl" | "yaml" | "toml" | "xml" | "csv" | "tsv";

export type ValueType = "string" | "number" | "boolean" | "null" | "alias" | "container" | "error" | "other";

export type Row = {
  /** The key, or the index of an array's member, or `@name` for an XML attribute. */
  key: string;
  /** The value as written (a number as its source text); a container's row says `{3}` or `[5]`. */
  text: string;
  type: ValueType;
  /** Where the value sits in the text. */
  from: number;
  to: number;
  /** Where the key sits (equal to `from` when the member has none). */
  keyFrom: number;
  /** The child box this row leads to, or -1. */
  child: number;
  /** The box an alias points to (YAML), or -1. */
  link: number;
  /** A YAML tag shown as a small label. */
  tag?: string;
};

export type Shape = "object" | "array" | "element" | "record";

export type DNode = {
  id: number;
  parent: number;
  depth: number;
  /** The key on the line from the parent (`""` for a root); an array's member is its index. */
  label: string;
  /** This box's place among its parent's rows. */
  row: number;
  shape: Shape;
  rows: Row[];
  /** The child boxes, in the order of the rows that lead to them. */
  kids: number[];
  from: number;
  to: number;
  anchor?: string;
  tag?: string;
};

export type ParseError = { message: string; from: number; to: number };

export type Tree = {
  format: Format;
  nodes: DNode[];
  roots: number[];
  /** The first error, if the text did not parse; the tree holds what was read before it. */
  error: ParseError | null;
  /** The file holds more than MAX_BOXES boxes: no box was kept and none is drawn. */
  tooMany?: true;
};

/** The deepest a document may nest before it is refused: far past any real file. */
export const MAX_DEPTH = 1_000_000;

/** A text this long or longer is not offered as a diagram (ADR 0106 item 9). */
export const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Past this many boxes the diagram is not built (review I6, a safety guard: the maintainer's open question D.1
 * recommends it). The drawing would take the window down long before the 20 MiB byte limit is met by a file of
 * millions of tiny boxes.
 */
export const MAX_BOXES = 200_000;

/** Thrown by the builder at the box limit; `parse` turns it into a tree that says so. Not a ParseFailure: no parser reports it as a text error. */
export class BoxLimit extends Error {
  constructor() {
    super("too many boxes");
  }
}

export class ParseFailure extends Error {
  constructor(
    message: string,
    readonly at: number,
    readonly end = at + 1,
  ) {
    super(message);
  }
}

/** Builds a tree; every parser goes through it. */
export class Builder {
  readonly nodes: DNode[] = [];
  readonly roots: number[] = [];
  constructor(readonly format: Format) {}

  /** A box under `parent` (-1 for a root), led to by the row `containerRow` just added to `parent`. */
  node(parent: number, label: string, shape: Shape, from: number): DNode {
    if (this.nodes.length >= MAX_BOXES) throw new BoxLimit();
    const p = parent < 0 ? null : this.nodes[parent]!;
    const n: DNode = {
      id: this.nodes.length,
      parent,
      depth: p ? p.depth + 1 : 0,
      label,
      row: p ? p.rows.length - 1 : 0,
      shape,
      rows: [],
      kids: [],
      from,
      to: from,
    };
    this.nodes.push(n);
    if (p) p.kids.push(n.id);
    else this.roots.push(n.id);
    return n;
  }

  /** A row of `node`; a row that leads to a child box is made by `child`. */
  row(node: DNode, r: Omit<Row, "child" | "link" | "keyFrom"> & { keyFrom?: number; child?: number; link?: number }): Row {
    const row: Row = { child: -1, link: -1, keyFrom: r.from, ...r } as Row;
    node.rows.push(row);
    return row;
  }

  /** A row of `node` leading to a box about to be made with `node(parent, ...)`: call before it. */
  containerRow(parent: DNode, key: string, keyFrom: number, from: number, array: boolean): Row {
    return this.row(parent, { key, text: array ? "[0]" : "{0}", type: "container", from, to: from, keyFrom, child: this.nodes.length });
  }

  done(error: ParseError | null): Tree {
    return { format: this.format, nodes: this.nodes, roots: this.roots, error };
  }
}

/** Fixes a container's row and box once its end is known. */
export function closeBox(n: DNode, parentRow: Row | null, end: number): void {
  n.to = end;
  if (!parentRow) return;
  parentRow.to = end;
  const count = n.rows.length;
  parentRow.text = n.shape === "array" ? `[${count}]` : `{${count}}`;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A key as a path writes it: `.name`, or `["with space"]`. */
export function pathPart(key: string, parentShape: Shape | null): string {
  if (parentShape === "array") return `[${key}]`;
  if (IDENT.test(key)) return `.${key}`;
  return `[${JSON.stringify(key)}]`;
}

/** The path of a box, `$.npcs[3].name` style; walks up, never recurses. */
export function pathOf(tree: Tree, id: number): string {
  const parts: string[] = [];
  let at = tree.nodes[id];
  while (at && at.parent >= 0) {
    const parent = tree.nodes[at.parent]!;
    parts.push(pathPart(at.label, parent.shape));
    at = parent;
  }
  parts.reverse();
  const root = at ?? tree.nodes[id]!;
  // Several roots (YAML documents, JSON lines) are told apart by their number.
  const which = tree.roots.length > 1 ? `#${tree.roots.indexOf(root.id) + 1}` : "";
  return `${which}$${parts.join("")}`;
}

/** The path of one row: the box's, then the row's key. */
export function rowPath(tree: Tree, id: number, row: number): string {
  const n = tree.nodes[id]!;
  const r = n.rows[row];
  if (!r) return pathOf(tree, id);
  if (r.child >= 0) return pathOf(tree, r.child);
  return pathOf(tree, id) + pathPart(r.key, n.shape);
}

/** The box at `path` (as `pathOf` wrote it), or -1. A path is the labels from the root. */
export function resolve(tree: Tree, labels: readonly string[], root = 0): number {
  const start = tree.roots[root];
  if (start === undefined) return -1;
  let at = start;
  for (const label of labels) {
    const n = tree.nodes[at]!;
    let next = -1;
    if (n.shape === "array") {
      const r = n.rows[Number(label)];
      if (r && r.child >= 0 && r.key === label) next = r.child;
    }
    if (next < 0) for (const k of n.kids) if (tree.nodes[k]!.label === label) { next = k; break; }
    if (next < 0) return -1;
    at = next;
  }
  return at;
}

/** The labels from the root to a box, and which root. */
export function labelsOf(tree: Tree, id: number): { root: number; labels: string[] } {
  const labels: string[] = [];
  let at = tree.nodes[id]!;
  while (at.parent >= 0) {
    labels.push(at.label);
    at = tree.nodes[at.parent]!;
  }
  labels.reverse();
  return { root: tree.roots.indexOf(at.id), labels };
}

/** The box and row holding the text offset `pos`, deepest first; the row is -1 when only the box does. */
export function locate(tree: Tree, pos: number): { node: number; row: number } | null {
  let level = tree.roots;
  let found = -1;
  for (;;) {
    let next = -1;
    // The boxes of a level are in text order: binary search for the last one starting at or before pos.
    let lo = 0;
    let hi = level.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const n = tree.nodes[level[mid]!]!;
      if (n.from <= pos) {
        next = level[mid]!;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (next < 0 || tree.nodes[next]!.to < pos) break;
    found = next;
    level = tree.nodes[next]!.kids;
    if (level.length === 0) break;
  }
  if (found < 0) return null;
  const n = tree.nodes[found]!;
  let best = -1;
  let lo = 0;
  let hi = n.rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = n.rows[mid]!;
    if (Math.min(r.keyFrom, r.from) <= pos) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best >= 0) {
    const r = n.rows[best]!;
    if (r.child >= 0) {
      // A container row: the child box owns what is inside its range.
      if (pos > r.to) best = -1;
    } else if (pos > r.to) best = -1;
  }
  return { node: found, row: best };
}

/** How a folded or unfolded box counts what it holds: "12 keys", "340 items". */
export function memberCount(n: DNode): number {
  return n.rows.length;
}

/** The formats by file extension, or null for a file that is not one. */
export function formatOfPath(path: string): Format | null {
  const base = path.split("/").pop() ?? path;
  const i = base.lastIndexOf(".");
  if (i <= 0) return null;
  switch (base.slice(i + 1).toLowerCase()) {
    case "json": return "json";
    case "jsonc": return "jsonc";
    case "jsonl":
    case "ndjson": return "jsonl";
    case "yaml":
    case "yml": return "yaml";
    case "toml": return "toml";
    case "xml": return "xml";
    case "csv": return "csv";
    case "tsv": return "tsv";
    default: return null;
  }
}

/** The formats of a code block's language word, or null. */
export function formatOfLang(lang: string): Format | null {
  switch (lang.toLowerCase()) {
    case "json": return "json";
    case "jsonc": case "json5": return "jsonc";
    case "jsonl": case "ndjson": return "jsonl";
    case "yaml": case "yml": return "yaml";
    case "toml": return "toml";
    case "xml": return "xml";
    case "csv": return "csv";
    case "tsv": return "tsv";
    default: return null;
  }
}

/** The kind of file for "the last view used for that type": json, yaml… (jsonl and ndjson are one). */
export function typeKey(path: string): string | null {
  const f = formatOfPath(path);
  return f;
}
