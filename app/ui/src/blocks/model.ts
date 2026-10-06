// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The blocks of a note in Edit mode (ADR 0061): what a block is (D5), and
// every change the handle, the menu and the keys make — pure functions of
// the editor's state, tested by the window's unit tests. A block is a node
// of CodeMirror's Markdown tree, never a line: a paragraph, a heading (with
// its section when folded), a list item with what is nested in it, a whole
// quote or callout, a code block, a table, a divider, an HTML block. The
// file stays Markdown as Obsidian reads it: a move writes the block's text
// byte for byte, with only the line prefixes of its new place — indentation
// or `> ` — and the numbers of an ordered list it leaves or joins.

import { ensureSyntaxTree, foldedRanges, syntaxTree } from "@codemirror/language";
import { ChangeSet, EditorSelection, type EditorState, type Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { frontmatterClose } from "../frontmatter";

export type BlockKind = "paragraph" | "heading" | "item" | "list" | "quote" | "code" | "table" | "rule" | "html" | "other";

/** Where blocks sit: the note itself, a list (its items), a list item
 *  (what is nested under it), a quote (a place to drop into, S2; the
 *  blocks inside a quote are not handles of their own). A list stands in
 *  its own place as one unit (kind "list"): a paragraph moved past it
 *  passes the whole list; the list has no handle, its items have. */
export type Container = {
  kind: "root" | "list" | "item" | "quote";
  /** What every line of a child carries before the child's own text:
   *  indentation, `> `, or both. */
  prefix: string;
  children: Block[];
  parent: Container | null;
  /** The block the container belongs to: a list item, a quote. */
  owner: Block | null;
  /** A list: ordered or not, tight (no blank line between its items). */
  ordered?: boolean;
  tight?: boolean;
};

export type Block = {
  kind: BlockKind;
  /** The start of its first line. */
  from: number;
  /** The end of its last line, its line break not included. */
  to: number;
  /** Where its own text starts on its first line: after the prefixes of
   *  the containers it sits in. */
  start: number;
  container: Container;
  /** A list item's nested place; a quote's inside. */
  inner: Container | null;
  level?: number;
};

/** Where a run of blocks lands: before the child at `index` of
 *  `container` (its number of children: at the end). */
export type Target = { container: Container; index: number };

/** An edit, ready for a transaction: one change set, so one ⌘Z undoes it. */
export type Edit = { changes: ChangeSet; selection: EditorSelection };

const ID_LINE = /^[ \t>]*\^[A-Za-z0-9-]+[ \t]*$/;
const ID_END = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
const MARK = /^(?:([-+*])|(\d{1,9})([.)]))(?=[ \t]|$)/;

function treeOf(state: EditorState): Tree {
  return ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
}

/** The end of the frontmatter's closing line, or -1 (the core's rule,
 *  ../frontmatter). The frontmatter is never a block. */
export function frontmatterEnd(doc: Text): number {
  const close = frontmatterClose((i) => (i < doc.lines ? doc.line(i + 1).text : undefined));
  return close < 0 ? -1 : doc.line(close + 1).to;
}

function kindOf(name: string): BlockKind | null {
  if (name === "Paragraph") return "paragraph";
  if (/^(ATX|Setext)Heading\d$/.test(name)) return "heading";
  if (name === "ListItem") return "item";
  if (name === "Blockquote") return "quote";
  if (name === "FencedCode" || name === "CodeBlock") return "code";
  if (name === "Table") return "table";
  if (name === "HorizontalRule") return "rule";
  if (name === "HTMLBlock" || name === "CommentBlock" || name === "ProcessingInstructionBlock") return "html";
  if (name === "LinkReference") return "other";
  return null;
}

/** The end of the line a node ends on: a node that ends at a line's start
 *  (after its line break) ends on the line before. */
function lineEnd(doc: Text, to: number): number {
  const line = doc.lineAt(to);
  return to === line.from && to > 0 ? doc.lineAt(to - 1).to : line.to;
}

function isBlank(doc: Text, from: number, to: number): boolean {
  return /\n[ \t>]*\n/.test(doc.sliceString(from, to));
}

/** Every block of the note, as a tree of containers. */
export function outline(state: EditorState): Container {
  const doc = state.doc;
  const fm = frontmatterEnd(doc);
  const folds: { from: number; to: number }[] = [];
  foldedRanges(state).between(0, doc.length, (from, to) => void folds.push({ from, to }));

  const make = (node: SyntaxNode, kind: BlockKind, container: Container): Block => {
    const block: Block = { kind, from: doc.lineAt(node.from).from, to: lineEnd(doc, node.to), start: node.from, container, inner: null };
    if (kind === "heading") {
      block.level = Number(/\d$/.exec(node.name)?.[0] ?? "1");
      // Folded, a heading carries its section, as the screen shows it.
      const head = doc.lineAt(node.to).to;
      const fold = folds.find((f) => f.from >= block.from && f.from <= head);
      if (fold) block.to = Math.max(block.to, lineEnd(doc, fold.to));
    }
    if (kind === "quote") {
      const line = doc.lineAt(node.from);
      const own = /^>[ \t]?/.exec(line.text.slice(node.from - line.from))?.[0] ?? "> ";
      block.inner = { kind: "quote", prefix: doc.sliceString(line.from, node.from) + own, children: [], parent: container, owner: block };
    }
    return block;
  };

  const add = (c: Container, b: Block): void => {
    const last = c.children[c.children.length - 1];
    // A folded section belongs to its heading: what it hides is no block.
    if (last && last.kind === "heading" && b.from <= last.to) return;
    c.children.push(b);
  };

  const fill = (parent: SyntaxNode, c: Container, skipFirstParagraph: boolean): void => {
    let first = true;
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (fm >= 0 && n.from <= fm) continue;
      if (n.name === "ListMark" || n.name === "Task") continue;
      const wasFirst = first;
      first = false;
      if (skipFirstParagraph && wasFirst && n.name === "Paragraph") continue;
      if (n.name === "BulletList" || n.name === "OrderedList") {
        const unit = list(n, c);
        if (unit) add(c, unit);
        continue;
      }
      const kind = kindOf(n.name);
      if (kind && kind !== "item") add(c, make(n, kind, c));
    }
  };

  // A list is a unit of its place, and the container of its items, which
  // keeps what every item shares.
  const list = (node: SyntaxNode, parent: Container): Block | null => {
    const c: Container = { kind: "list", prefix: "", children: [], parent, owner: null, ordered: node.name === "OrderedList", tight: true };
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.name !== "ListItem") continue;
      const item = make(n, "item", c);
      c.prefix = doc.sliceString(item.from, item.start);
      const prev = c.children[c.children.length - 1];
      if (prev && isBlank(doc, prev.to, item.from + 1)) c.tight = false;
      const mark = MARK.exec(doc.sliceString(item.start, doc.lineAt(item.start).to));
      const width = Math.max(2, (mark?.[0].length ?? 1) + 1);
      item.inner = { kind: "item", prefix: c.prefix + " ".repeat(width), children: [], parent: c, owner: item };
      fill(n, item.inner, true);
      c.children.push(item);
    }
    const first = c.children[0];
    const last = c.children[c.children.length - 1];
    if (!first || !last) return null;
    const unit: Block = { kind: "list", from: first.from, to: last.to, start: first.start, container: parent, inner: c };
    c.owner = unit;
    return unit;
  };

  const root: Container = { kind: "root", prefix: "", children: [], parent: null, owner: null };
  fill(treeOf(state).topNode, root, false);
  attachIds(doc, root);
  return root;
}

/** A line holding only a `^id`, after a blank line, travels with the
 *  block before it: Obsidian attaches it there (spec Q3, observed). */
function attachIds(doc: Text, c: Container): void {
  const kept: Block[] = [];
  for (const b of c.children) {
    const prev = kept[kept.length - 1];
    if (prev && b.kind === "paragraph" && doc.lineAt(b.from).number === doc.lineAt(b.to).number && ID_LINE.test(doc.sliceString(b.from, b.to))) {
      prev.to = b.to;
      continue;
    }
    if (b.inner) attachIds(doc, b.inner);
    kept.push(b);
  }
  c.children = kept;
}

/** Every block, in the note's order. */
export function allBlocks(root: Container): Block[] {
  const out: Block[] = [];
  const walk = (c: Container): void => {
    for (const b of c.children) {
      out.push(b);
      if (b.inner) walk(b.inner);
    }
  };
  walk(root);
  return out;
}

/** The innermost block whose lines hold `pos`. */
export function blockAt(root: Container, doc: Text, pos: number): Block | null {
  const line = doc.lineAt(Math.max(0, Math.min(pos, doc.length)));
  let found: Block | null = null;
  for (let c: Container | null = root; c; ) {
    const hit: Block | undefined = c.children.find((b) => b.from <= line.from && line.to <= b.to);
    if (!hit) break;
    if (hit.kind !== "list") found = hit;
    c = hit.inner && hit.inner.kind !== "quote" ? hit.inner : null;
  }
  return found;
}

/** A block and the blocks it sits in, from the outermost. */
function chain(b: Block): Block[] {
  const out = [b];
  for (let c = b.container; c.owner; c = c.owner.container) out.unshift(c.owner);
  return out;
}

/** The blocks a selection touches: one run of siblings of the innermost
 *  container that holds both of its ends (S2). */
export function blocksOfSelection(root: Container, state: EditorState): Block[] {
  const { from, to } = state.selection.main;
  const doc = state.doc;
  // A selection ending at a line's start does not take that line.
  const end = to > from && doc.lineAt(to).from === to ? to - 1 : to;
  const a = blockAt(root, doc, from);
  const b = blockAt(root, doc, end);
  if (!a || !b) return a ? [a] : b ? [b] : [];
  if (a === b) return [a];
  const ca = chain(a);
  const cb = chain(b);
  let i = 0;
  while (i < ca.length - 1 && i < cb.length - 1 && ca[i] === cb[i]) i++;
  let first = ca[i]!;
  let last = cb[i]!;
  if (first.container !== last.container) {
    first = ca[0]!;
    last = cb[0]!;
  }
  const sibs = first.container.children;
  const i0 = sibs.indexOf(first);
  const i1 = sibs.indexOf(last);
  return sibs.slice(Math.min(i0, i1), Math.max(i0, i1) + 1);
}

/** Is the target inside the blocks that move: a block into itself? */
function into(target: Target, blocks: Block[]): boolean {
  for (let c: Container | null = target.container; c; c = c.owner ? c.owner.container : null) {
    if (c.owner && blocks.includes(c.owner)) return true;
  }
  return false;
}

/** The run's lines without its container's prefix. A line that does not
 *  carry it (a lazy continuation line) is kept as it is. */
function bareLines(doc: Text, blocks: Block[]): string[] {
  const prefix = blocks[0]!.container.prefix;
  const trimmed = prefix.replace(/[ \t]+$/, "");
  const text = doc.sliceString(blocks[0]!.from, blocks[blocks.length - 1]!.to);
  return text.split("\n").map((l) => {
    if (l.startsWith(prefix)) return l.slice(prefix.length);
    if (l.trim() === "" || l.trim() === trimmed.trim()) return "";
    // Indentation only: take what there is of it.
    if (/^[ \t]*$/.test(prefix)) return l.replace(/^[ \t]+/, (ws) => ws.slice(Math.min(ws.length, prefix.length)));
    return l;
  });
}

/** Lines given a prefix; a blank line keeps only its marks (`>`). */
function withPrefix(lines: string[], prefix: string): string {
  const blank = prefix.replace(/[ \t]+$/, "");
  return lines.map((l) => (l === "" ? blank : prefix + l)).join("\n");
}

/** An item's marker made its new list's: a bullet's character, an
 *  ordered list's delimiter — its number is renumbered after. */
function asListMarker(line: string, list: Container, like: string | null): string {
  const m = MARK.exec(line);
  const l = like ? MARK.exec(like) : null;
  if (!m || !l) return line;
  const rest = line.slice(m[0].length);
  return list.ordered ? `${l[2] ?? "1"}${l[3] ?? "."}${rest}` : `${l[1] ?? "-"}${rest}`;
}

/** The separator between two neighbours: a tight list's items touch;
 *  every other two blocks are apart by one blank line (with the
 *  container's marks: `>` inside a quote). */
function separator(c: Container, prefix: string): string {
  if (c.kind === "list" && c.tight) return "\n";
  return "\n" + prefix.replace(/[ \t]+$/, "") + "\n";
}

/** The text the run takes where it lands, with what goes before and after
 *  it there, and where in the old text it goes. */
function landing(doc: Text, blocks: Block[], target: Target): { at: number; insert: string; textFrom: number; textLength: number } {
  const c = target.container;
  const lines = bareLines(doc, blocks);
  if (c.kind === "list") {
    const like = c.children.find((b) => !blocks.includes(b));
    const likeText = like ? doc.sliceString(like.start, doc.lineAt(like.start).to) : null;
    for (const b of blocks) {
      const i = doc.sliceString(blocks[0]!.from, b.from).split("\n").length - 1;
      lines[i] = asListMarker(lines[i]!, c, likeText);
    }
  }
  const text = withPrefix(lines, c.prefix);
  const sep = separator(c, c.prefix);
  const sibs = c.children;
  // The neighbours where the run lands, the run itself left out.
  let next: Block | undefined;
  for (let i = target.index; i < sibs.length; i++) if (!blocks.includes(sibs[i]!)) { next = sibs[i]; break; }
  let prev: Block | undefined;
  for (let i = target.index - 1; i >= 0; i--) if (!blocks.includes(sibs[i]!)) { prev = sibs[i]; break; }
  if (next) return { at: next.from, insert: text + sep, textFrom: 0, textLength: text.length };
  if (prev) return { at: prev.to, insert: sep + text, textFrom: sep.length, textLength: text.length };
  // An empty place: under an item with nothing nested yet, or the end of a
  // quote. A nested item touches its parent; anything else is apart.
  const owner = c.owner;
  if (owner) {
    const before = c.kind === "item" && blocks[0]!.kind === "item" ? "\n" : separator(c, c.prefix);
    return { at: owner.to, insert: before + text, textFrom: before.length, textLength: text.length };
  }
  const before = doc.length > 0 ? "\n\n" : "";
  return { at: doc.length, insert: before + text, textFrom: before.length, textLength: text.length };
}

/** The range a run leaves: its text and the blank lines after it, or, for
 *  the last of its container, the blank lines and line break before it. */
function leaving(doc: Text, blocks: Block[]): { from: number; to: number } {
  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;
  const sibs = first.container.children;
  const next = sibs[sibs.indexOf(last) + 1];
  if (next) return { from: first.from, to: next.from };
  if (first.from === 0) {
    let to = last.to;
    while (to < doc.length && doc.lineAt(Math.min(doc.length, to + 1)).text.trim() === "") to = doc.lineAt(Math.min(doc.length, to + 1)).to;
    return { from: 0, to: Math.min(doc.length, to + (to < doc.length ? 1 : 0)) };
  }
  return { from: textEndBefore(doc, first.from), to: last.to };
}

/** The end of the last line with text before a line start. */
function textEndBefore(doc: Text, from: number): number {
  let line = doc.lineAt(from - 1);
  while (line.number > 1 && line.text.replace(/[>\s]/g, "") === "") line = doc.line(line.number - 1);
  return line.to;
}

/** The number an ordered list starts at; null for a bullet list. */
function startOf(doc: Text, c: Container): number | null {
  if (c.kind !== "list" || !c.ordered || !c.children[0]) return null;
  const m = MARK.exec(doc.sliceString(c.children[0].start, doc.lineAt(c.children[0].start).to));
  return m?.[2] ? Number(m[2]) : 1;
}

/** Renumber, in the new text, the ordered lists at these positions, each
 *  from the number it started at. */
function renumber(state: EditorState, next: Text, at: { pos: number; start: number }[]): ChangeSet | null {
  if (at.length === 0) return null;
  const after = state.update({ changes: { from: 0, to: state.doc.length, insert: next } }).state;
  const tree = treeOf(after);
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const { pos, start } of at) {
    let node: SyntaxNode | null = tree.resolveInner(Math.max(0, Math.min(pos, next.length)), 1);
    while (node && node.name !== "OrderedList") node = node.parent;
    if (!node || seen.has(node.from)) continue;
    seen.add(node.from);
    let n = start;
    for (let item = node.firstChild; item; item = item.nextSibling) {
      const mark = item.name === "ListItem" ? item.getChild("ListMark") : null;
      if (!mark) continue;
      const text = next.sliceString(mark.from, mark.to);
      const m = /^(\d{1,9})([.)])$/.exec(text);
      if (!m) continue;
      const want = `${n}${m[2]}`;
      if (want !== text) changes.push({ from: mark.from, to: mark.to, insert: want });
      n++;
    }
  }
  return changes.length ? ChangeSet.of(changes, next.length) : null;
}

/** One change set and the moved text selected, ordered lists renumbered. */
function finish(state: EditorState, main: ChangeSet, lists: { pos: number; start: number | null }[], select: { from: number; to: number }): Edit {
  const next = main.apply(state.doc);
  const more = renumber(state, next, lists.filter((l): l is { pos: number; start: number } => l.start !== null));
  const changes = more ? main.compose(more) : main;
  const from = more ? more.mapPos(select.from, -1) : select.from;
  const to = more ? more.mapPos(select.to, 1) : select.to;
  return { changes, selection: EditorSelection.single(from, Math.max(from, to)) };
}

/** Move a run of sibling blocks to a target. Null: nothing to do — the
 *  run dropped where it is, or into itself. */
export function moveBlocks(state: EditorState, blocks: Block[], target: Target): Edit | null {
  if (blocks.length === 0 || into(target, blocks)) return null;
  const doc = state.doc;
  const src = blocks[0]!.container;
  if (target.container === src) {
    const i0 = src.children.indexOf(blocks[0]!);
    const i1 = src.children.indexOf(blocks[blocks.length - 1]!);
    if (target.index >= i0 && target.index <= i1 + 1) return null;
  }
  const out = leaving(doc, blocks);
  const land = landing(doc, blocks, target);
  if (land.at > out.from && land.at < out.to) return null;
  const main = ChangeSet.of(
    [
      { from: out.from, to: out.to },
      { from: land.at, insert: land.insert },
    ].sort((a, b) => a.from - b.from || (a.to === undefined ? 1 : -1)),
    doc.length,
  );
  const at = main.mapPos(land.at, -1) + land.textFrom;
  const remaining = src.children.find((b) => !blocks.includes(b));
  const lists = [
    { pos: remaining ? main.mapPos(remaining.start, 1) : -1, start: startOf(doc, src) },
    { pos: at, start: startOf(doc, target.container) },
  ].filter((l) => l.pos >= 0);
  return finish(state, main, lists, { from: at, to: at + land.textLength });
}

/** The run one place up (-1) or down (1) among its siblings. */
export function moveBy(state: EditorState, blocks: Block[], dir: -1 | 1): Edit | null {
  if (blocks.length === 0) return null;
  const c = blocks[0]!.container;
  const i0 = c.children.indexOf(blocks[0]!);
  const i1 = c.children.indexOf(blocks[blocks.length - 1]!);
  const index = dir < 0 ? i0 - 1 : i1 + 2;
  if (index < 0 || index > c.children.length) return null;
  return moveBlocks(state, blocks, { container: c, index });
}

/** A copy of the run below it, apart as a moved block is. A `^id` is not
 *  copied: two blocks would answer to it. */
export function duplicateBlocks(state: EditorState, blocks: Block[]): Edit | null {
  if (blocks.length === 0) return null;
  const doc = state.doc;
  const c = blocks[0]!.container;
  const last = blocks[blocks.length - 1]!;
  const text = doc
    .sliceString(blocks[0]!.from, last.to)
    .split("\n")
    .filter((l) => !ID_LINE.test(l))
    .map((l) => l.replace(ID_END, ""))
    .join("\n")
    .replace(/\n[ \t>]*$/, "");
  const sep = separator(c, c.prefix);
  const main = ChangeSet.of([{ from: last.to, insert: sep + text }], doc.length);
  const at = last.to + sep.length;
  return finish(state, main, [{ pos: at, start: startOf(doc, c) }], { from: at, to: at + text.length });
}

/** The run removed, with the blank lines that set it apart. */
export function deleteBlocks(state: EditorState, blocks: Block[]): Edit | null {
  if (blocks.length === 0) return null;
  const doc = state.doc;
  const c = blocks[0]!.container;
  const out = leaving(doc, blocks);
  const main = ChangeSet.of([{ from: out.from, to: out.to }], doc.length);
  const at = Math.min(main.mapPos(out.from, -1), main.newLength);
  const remaining = c.children.find((b) => !blocks.includes(b));
  return finish(state, main, remaining ? [{ pos: main.mapPos(remaining.start, 1), start: startOf(doc, c) }] : [], { from: at, to: at });
}

// ---------- Turn into (D7) ----------

export type TurnKind = "text" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "task" | "quote" | "callout" | "code";

/** A block's own text, without its marks: a heading's `#`, an item's
 *  marker and box, a plain quote's `>`. Null: its kind does not turn into
 *  another (code, a table, a callout, an item with nested blocks...). */
function contentOf(doc: Text, b: Block): string[] | null {
  const lines = bareLines(doc, [b]);
  if (b.kind === "paragraph") return lines.some((l) => ID_LINE.test(l)) ? null : lines;
  if (b.kind === "heading") {
    if (lines.length !== 1) return null;
    return [lines[0]!.replace(/^#{1,6}[ \t]+/, "").replace(/[ \t]+#+[ \t]*$/, "")];
  }
  if (b.kind === "item") {
    if (b.inner && b.inner.children.length > 0) return null;
    const m = /^(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/.exec(lines[0]!);
    if (!m) return null;
    const pad = " ".repeat(m[0].length);
    return [lines[0]!.slice(m[0].length), ...lines.slice(1).map((l) => (l.startsWith(pad) ? l.slice(pad.length) : l.replace(/^[ \t]+/, "")))];
  }
  if (b.kind === "quote") {
    if (/^>[ \t]*\[!/.test(lines[0]!)) return null;
    return lines.map((l) => l.replace(/^>[ \t]?/, ""));
  }
  return null;
}

function ownKind(doc: Text, b: Block): TurnKind | null {
  if (b.kind === "paragraph") return "text";
  if (b.kind === "heading") return b.level === 1 ? "h1" : b.level === 2 ? "h2" : b.level === 3 ? "h3" : null;
  if (b.kind === "quote") return "quote";
  if (b.kind === "item") {
    const line = doc.sliceString(b.start, doc.lineAt(b.start).to);
    if (/^(?:[-+*]|\d{1,9}[.)])[ \t]+\[[ xX]\]/.test(line)) return "task";
    return /^\d/.test(line) ? "numbered" : "bullet";
  }
  return null;
}

/** What a block can turn into: the kinds that hold its text unchanged — a
 *  heading only one line. */
export function turnTargets(state: EditorState, b: Block): TurnKind[] {
  const content = contentOf(state.doc, b);
  if (!content) return [];
  const own = ownKind(state.doc, b);
  const kinds: TurnKind[] = ["text", ...(content.length === 1 ? (["h1", "h2", "h3"] as TurnKind[]) : []), "bullet", "numbered", "task", "quote", "callout", "code"];
  return kinds.filter((k) => k !== own);
}

/** The block turned into another kind, its text unchanged. */
export function turnInto(state: EditorState, b: Block, kind: TurnKind): Edit | null {
  const content = contentOf(state.doc, b);
  if (!content || !turnTargets(state, b).includes(kind)) return null;
  const hang = (mark: string) => [mark + content[0]!, ...content.slice(1).map((l) => (l === "" ? "" : " ".repeat(mark.length) + l))];
  const quoted = (l: string) => (l === "" ? ">" : "> " + l);
  const lines =
    kind === "text" ? content
    : kind === "h1" || kind === "h2" || kind === "h3" ? ["#".repeat(Number(kind[1])) + " " + content[0]!]
    : kind === "bullet" ? hang("- ")
    : kind === "numbered" ? hang("1. ")
    : kind === "task" ? hang("- [ ] ")
    : kind === "quote" ? content.map(quoted)
    : kind === "callout" ? ["> [!note]", ...content.map(quoted)]
    : ["```", ...content, "```"];
  const text = withPrefix(lines, b.container.prefix);
  const main = ChangeSet.of([{ from: b.from, to: b.to, insert: text }], state.doc.length);
  const at = b.from + text.length;
  return finish(state, main, [], { from: at, to: at });
}

// ---------- Copy link to block (D7) ----------

/** What a link to a block needs: a heading's text; or a `^id` — the one
 *  it has, or a new one and the change that writes it at the end of the
 *  block's own text (the positions spec Q3 decided: a paragraph, a list
 *  item). Null: no link is offered for this kind. */
export function blockLink(state: EditorState, b: Block, newId: () => string): { heading: string } | { id: string; changes: ChangeSet | null } | null {
  const doc = state.doc;
  if (b.kind === "heading") {
    const line = doc.sliceString(b.start, doc.lineAt(b.start).to);
    return { heading: line.replace(/^#{1,6}[ \t]+/, "").replace(/[ \t]+#+[ \t]*$/, "").trim() };
  }
  if (b.kind !== "paragraph" && b.kind !== "item") return null;
  // An item's own text ends where what is nested in it starts.
  const nested = b.kind === "item" ? b.inner?.children[0] : undefined;
  const end = nested ? textEndBefore(doc, nested.from) : b.to;
  const lines = doc.sliceString(b.from, end).split("\n");
  const last = lines[lines.length - 1] ?? "";
  const has = ID_END.exec(last) ?? (ID_LINE.test(last) ? /\^([A-Za-z0-9-]+)/.exec(last) : null);
  if (has) return { id: has[1]!, changes: null };
  const taken = new Set(Array.from(doc.toString().matchAll(/\^([A-Za-z0-9-]+)[ \t]*$/gm), (m) => m[1]));
  let id = newId();
  while (taken.has(id)) id = newId();
  return { id, changes: ChangeSet.of([{ from: end, insert: ` ^${id}` }], doc.length) };
}

/** Six lowercase letters and digits, inside the charset Obsidian's
 *  documentation gives (spec Q22). */
export function randomBlockId(): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => a[x % a.length]).join("");
}

// ---------- Where a drop lands (D6, S2) ----------

/** How deep a container is: the note 0, one more for each list item and
 *  quote it sits in. */
export function depthOf(c: Container): number {
  let d = 0;
  for (let x: Container | null = c; x; x = x.parent) if (x.kind === "item" || x.kind === "quote") d++;
  return d;
}

/** A place between blocks, top to bottom: the line it sits before (`at`;
 *  the note's length + 1 past its end) and the targets possible there,
 *  shallowest first — the pointer's horizontal place picks one. */
export type Gap = { at: number; targets: Target[] };

export function gapsOf(root: Container, doc: Text): Gap[] {
  const by = new Map<number, Target[]>();
  const put = (at: number, t: Target) => {
    const key = Math.min(at, doc.length + 1);
    const list = by.get(key) ?? [];
    list.push(t);
    by.set(key, list);
  };
  const visit = (c: Container): void => {
    c.children.forEach((b, i) => {
      put(b.from, { container: c, index: i });
      if (b.inner) {
        if (b.inner.kind !== "quote") visit(b.inner);
        // An empty place: nothing nested yet, the inside of a quote.
        if (b.inner.kind !== "list" && (b.inner.children.length === 0 || b.inner.kind === "quote")) put(b.to + 1, { container: b.inner, index: b.inner.children.length });
      }
    });
    const last = c.children[c.children.length - 1];
    if (last) put(last.to + 1, { container: c, index: c.children.length });
  };
  visit(root);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, targets]) => ({ at, targets: targets.sort((x, y) => depthOf(x.container) - depthOf(y.container) || (x.container.kind === "list" ? -1 : 0) - (y.container.kind === "list" ? -1 : 0)) }));
}

/** The targets a run may take at a gap: a list's place only for list
 *  items — another block put among items nests under the item above, or
 *  stands after the list at the list's own level. */
export function allowed(gap: Gap, blocks: Block[]): Target[] {
  const items = blocks.every((b) => b.kind === "item");
  return gap.targets.filter((t) => !into(t, blocks) && (t.container.kind !== "list" || items));
}
