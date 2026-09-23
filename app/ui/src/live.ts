// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview (Phase 2, item 2.4): the note is edited as Markdown, but
// on every line the cursor is not on, the syntax steps aside — heading
// marks, emphasis marks, code ticks and quote bars are hidden and the text
// is styled — wikilinks read as links and open with ⌘/Ctrl-click, and an
// image embed is the image. The document never changes: these are view
// decorations over the source, and what is saved is the source (ADR
// 0012). Constructs come from the Markdown syntax tree; `[[…]]` is the
// dialect's and is found by hand, outside code.

import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { EditorState, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import katex from "katex";
import { cells } from "./table";
import { frontmatterClose } from "./frontmatter";

export type LiveOptions = {
  /** Where an image embed target loads from, once known; `null` when it is
   *  not an image or not found; `undefined` while being asked. */
  imageUrl: (target: string) => string | null | undefined;
  /** ⌘/Ctrl-click on a wikilink. */
  navigate: (target: string) => void;
  /** The folded frontmatter was clicked: the caller shows the YAML (source mode). */
  editFrontmatter?: () => void;
  /** The folded frontmatter's tooltip, in the interface's language. */
  frontmatterTitle?: (lines: number) => string;
  /** The rendered HTML of an embedded note, once known; `null` when the
   *  target is not a note; `undefined` while being asked. */
  noteHtml?: (target: string) => string | null | undefined;
};

/** Dispatch this when an image URL became known, so the view redraws. */
export const redraw = StateEffect.define<null>();

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** `![[img.png|300]]` or `|300x200`: Obsidian's size after the pipe. */
export function sizeOf(alias: string | null): { w: number; h: number | null } | null {
  if (!alias) return null;
  const m = /^\s*(\d+)(?:x(\d+))?\s*$/.exec(alias);
  return m ? { w: Number(m[1]), h: m[2] ? Number(m[2]) : null } : null;
}

/** Where a widget's range starts now. CodeMirror keeps a widget's DOM while
 *  `eq` holds, across edits elsewhere, so a position taken when it was
 *  drawn goes stale: it is read from the DOM when the event comes. */
function startOf(view: EditorView, dom: HTMLElement): number | null {
  return dom.isConnected ? view.posAtDOM(dom) : null;
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: number | null,
  ) {
    super();
  }
  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.width === this.width;
  }
  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = "cm-lp-image-box";
    const img = document.createElement("img");
    img.className = "cm-lp-image";
    img.src = this.src;
    img.alt = this.alt;
    if (this.width) img.style.width = `${this.width}px`;
    const grip = document.createElement("span");
    grip.className = "cm-lp-grip";
    grip.title = "↔";
    // Dragging the corner rewrites the size after the pipe in the source.
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = img.getBoundingClientRect().width;
      let w = Math.round(w0);
      const badge = document.createElement("span");
      badge.className = "cm-lp-size";
      box.append(badge);
      const move = (ev: PointerEvent) => {
        w = Math.max(40, Math.round(w0 + ev.clientX - x0));
        img.style.width = `${w}px`;
        badge.textContent = `${w} px`;
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        badge.remove();
        // The embed as the document has it now, at the widget's place.
        const at = startOf(view, box);
        if (at === null) return;
        const m = /^!\[\[([^\]\n]+)\]\]/.exec(view.state.sliceDoc(at, view.state.doc.lineAt(at).to));
        if (!m) return;
        const target = (m[1] ?? "").split("|")[0] ?? "";
        view.dispatch({ changes: { from: at, to: at + m[0].length, insert: `![[${target}|${w}]]` } });
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
    box.append(img, grip);
    return box;
  }
  /** Clicks on the image stay on the image: the source is not revealed
   *  and the caret does not move; the grip handles its own pointer. */
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The folded frontmatter: a hint that properties live above. */
class FrontmatterWidget extends WidgetType {
  constructor(readonly lines: number, readonly onClick: (() => void) | undefined, readonly title: string) {
    super();
  }
  override eq(other: FrontmatterWidget): boolean {
    return other.lines === this.lines;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-lp-frontmatter";
    el.textContent = "···";
    el.title = this.title;
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.onClick?.();
    });
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** A `$…$` or `$$…$$` span of a block's inline text: offsets into that
 *  text, and the TeX between the delimiters. */
export type MathSpan = { from: number; to: number; display: boolean; tex: string };

/** The math of one block's inline text by pulldown-cmark's rules — the
 *  reader's parser, with math on — ported from its two passes. A `$` opens
 *  when no whitespace follows it and closes when none precedes it and no
 *  digit follows it (`$5 and $10` is not math); `$$` pairs with `$$`, can
 *  be empty and can start with a space; the first `$` of the same brace
 *  level after an opener decides, so `$` inside `{…}` belongs to the
 *  braces; `\$` is text; a code span that starts first wins. Line breaks
 *  are whitespace. */
export function mathSpans(text: string): MathSpan[] {
  type Item = { at: number; code: number; escaped: boolean; open: boolean; close: boolean; ctx: number };
  const items: Item[] = [];
  const ws = (c: string | undefined) => c !== undefined && /[\t\n\v\f\r ]/.test(c);
  // Brace levels as pulldown counts them, in a byte (255 is the root):
  // tracked once a `$` was seen; an unbalanced `}` at the root starts a
  // separate root; past 25 levels, counted rather than matched.
  const MAX = 25;
  const stack: number[] = [];
  let next = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && /[!-/:-@[-`{-~]/.test(text[i + 1] ?? "")) {
      if (text[i + 1] === "`") {
        let n = 1;
        while (text[i + 1 + n] === "`") n++;
        items.push({ at: i + 1, code: n, escaped: true, open: false, close: false, ctx: 0 });
        i += n;
      } else i++;
    } else if (c === "`") {
      let n = 1;
      while (text[i + n] === "`") n++;
      items.push({ at: i, code: n, escaped: false, open: false, close: false, ctx: 0 });
      i += n - 1;
    } else if (c === "$") {
      if (stack.length === 0) stack.push(255);
      const ctx = stack.length > MAX ? next & 255 : stack[stack.length - 1]!;
      const open = i + 1 < text.length && !ws(text[i + 1]);
      const close = i > 0 && !ws(text[i - 1]) && !/[0-9]/.test(text[i + 1] ?? "");
      items.push({ at: i, code: 0, escaped: false, open, close, ctx });
    } else if (c === "{") {
      if (stack.length === MAX) {
        stack.push(next & 255);
        next = MAX;
      } else if (stack.length > MAX) next++;
      else if (stack.length > 0) stack.push(next++ & 255);
    } else if (c === "}") {
      if (stack.length === 1) stack[0] = (stack[0]! - 1) & 255;
      else if (stack.length > MAX) {
        if (next <= MAX) stack.pop();
        else next--;
      } else stack.pop();
    }
  }
  const isMath = (k: number) => items[k] !== undefined && items[k]!.code === 0;
  const pairs = (k: number) => isMath(k) && isMath(k + 1) && items[k + 1]!.at === items[k]!.at + 1;
  const out: MathSpan[] = [];
  let k = 0;
  while (k < items.length) {
    const it = items[k]!;
    if (it.code > 0) {
      // A code span: the next run of as many backticks closes it.
      const n = it.escaped ? it.code - 1 : it.code;
      let j = k + 1;
      while (n > 0 && j < items.length && items[j]!.code !== n) j++;
      k = n > 0 && j < items.length ? j + 1 : k + 1;
      continue;
    }
    if (!it.open) {
      k++;
      continue;
    }
    const display = pairs(k);
    let found = -1;
    for (let j = display ? k + 2 : k + 1; j < items.length; j++) {
      const d = items[j]!;
      if (d.code > 0 || d.ctx !== it.ctx) continue;
      if (display ? pairs(j) : d.close) found = j;
      break;
    }
    if (found < 0) {
      k++;
      continue;
    }
    const at = items[found]!.at;
    if (display && found !== k + 1 && pairs(found)) {
      out.push({ from: it.at, to: at + 2, display: true, tex: text.slice(it.at + 2, at) });
      k = found + 2;
    } else if (at === it.at + 1) k++; // `$$` read as an empty inline span: text
    else {
      out.push({ from: it.at, to: at + 1, display: false, tex: text.slice(it.at + 1, at) });
      k = found + 1;
    }
  }
  return out;
}

/** A block's inline text as the reader's parser reads it: its lines
 *  joined by line breaks, each continuation line without the indentation
 *  and the `>` marks of its containers; `pos` maps an offset back to the
 *  document. */
function inlineText(doc: Text, node: SyntaxNode): { text: string; pos: (offset: number) => number } {
  let quoted = false;
  for (let p = node.parent; p; p = p.parent) if (p.name === "Blockquote") quoted = true;
  const segments: { at: number; from: number }[] = [];
  let text = "";
  const first = doc.lineAt(node.from).number;
  const last = doc.lineAt(node.to).number;
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    const to = n === last ? node.to : line.to;
    let from = node.from;
    if (n > first) {
      const lead = (quoted ? /^[ \t]*(?:>[ \t]?)*[ \t]*/ : /^[ \t]*/).exec(line.text)?.[0].length ?? 0;
      from = Math.min(line.from + lead, to);
      text += "\n";
    }
    segments.push({ at: text.length, from });
    text += doc.sliceString(from, to);
  }
  const pos = (offset: number): number => {
    let s = segments[0] ?? { at: 0, from: node.from };
    for (const x of segments) if (x.at <= offset) s = x;
    return s.from + (offset - s.at);
  };
  return { text, pos };
}

/** The TeX of a paragraph that is display math and nothing else. */
function aloneInParagraph(text: string, spans: MathSpan[]): string | null {
  const only = spans.length === 1 ? spans[0] : undefined;
  return only && only.display && text.slice(0, only.from).trim() === "" && text.slice(only.to).trim() === "" ? only.tex : null;
}

/** A block of the note shown rendered until the caret enters it: a table,
 *  display math alone in its paragraph, or a note embedded on a line of
 *  its own. Found in the syntax tree, so a block begins and ends where the
 *  reader's parser has it: a table needs its delimiter row, a fence closes
 *  only on a fence of its own kind, and `$$` math ends with its paragraph. */
type Block = { from: number; to: number; kind: "table" | "math" | "embed"; text: string; rows?: string[] };
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\|.*)?$/i;
export function blocksOf(state: EditorState): Block[] {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const out: Block[] = [];
  // The block's whole lines, when only indentation or `>` marks precede it
  // on its first line (after a list marker it stays source).
  const lines = (from: number, to: number) => {
    const line = doc.lineAt(from);
    return /^[\s>]*$/.test(doc.sliceString(line.from, from)) ? { from: line.from, to: doc.lineAt(to).to } : null;
  };
  tree.iterate({
    enter: (n) => {
      if (n.name === "Table") {
        const rows: string[] = [];
        for (let c = n.node.firstChild; c; c = c.nextSibling) {
          if (c.name === "TableHeader" || c.name === "TableDelimiter" || c.name === "TableRow") rows.push(doc.sliceString(c.from, c.to));
        }
        const at = lines(n.from, n.to);
        if (at) out.push({ ...at, kind: "table", text: rows.join("\n"), rows });
        return false;
      }
      if (n.name === "Paragraph") {
        if (!doc.sliceString(n.from, n.to).includes("$$")) return false;
        const { text } = inlineText(doc, n.node);
        const tex = aloneInParagraph(text, mathSpans(text));
        const at = tex === null ? null : lines(n.from, n.to);
        if (at && tex !== null) out.push({ ...at, kind: "math", text: tex });
        return false;
      }
      return undefined;
    },
  });
  // A line that is an embed and nothing else, outside code and outside
  // the blocks above.
  const taken = out.slice();
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const embed = /^!\[\[([^\]\n]+)\]\]$/.exec(line.text.trim());
    if (!embed || IMAGE_EXT.test(embed[1] ?? "")) continue;
    if (taken.some((b) => line.from <= b.to && line.to >= b.from)) continue;
    let code = false;
    for (let p: SyntaxNode | null = tree.resolveInner(line.from + line.text.search(/\S/), 1); p; p = p.parent) if (p.name === "FencedCode" || p.name === "CodeBlock") code = true;
    if (!code) out.push({ from: line.from, to: line.to, kind: "embed", text: embed[1] ?? "" });
  }
  return out.sort((a, b) => a.from - b.from);
}

class BlockWidget extends WidgetType {
  constructor(readonly block: Block, readonly opts: LiveOptions, readonly html: string | null | undefined) {
    super();
  }
  override eq(other: BlockWidget): boolean {
    return other.block.kind === this.block.kind && other.block.text === this.block.text && other.html === this.html;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = `cm-lp-block cm-lp-${this.block.kind}`;
    const b = this.block;
    if (b.kind === "math") {
      try {
        el.innerHTML = katex.renderToString(b.text, { displayMode: true, throwOnError: false });
      } catch {
        el.textContent = b.text;
      }
    } else if (b.kind === "table") {
      // Rows by place: the header, the delimiter row, then the body — a
      // body row of dashes is a row like any other.
      const table = document.createElement("table");
      const rows = (b.rows ?? []).map(cells);
      const head = rows[0] ?? [];
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const c of head) {
        const th = document.createElement("th");
        th.textContent = c;
        tr.append(th);
      }
      thead.append(tr);
      table.append(thead);
      const tbody = document.createElement("tbody");
      for (const row of rows.slice(2)) {
        const r = document.createElement("tr");
        for (const c of row) {
          const td = document.createElement("td");
          td.textContent = c;
          r.append(td);
        }
        tbody.append(r);
      }
      table.append(tbody);
      el.append(table);
    } else {
      const title = document.createElement("div");
      title.className = "cm-lp-embed-title";
      title.textContent = b.text;
      el.append(title);
      const body = document.createElement("div");
      body.className = "cm-lp-embed-body";
      if (this.html === undefined) body.textContent = "…";
      else if (this.html === null) body.textContent = `![[${b.text}]]`;
      else body.innerHTML = this.html;
      el.append(body);
    }
    // A click puts the caret at the block, which opens it as text.
    el.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      e.preventDefault();
      const at = startOf(view, el);
      if (at === null) return;
      view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } });
      view.focus();
    });
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Display math and tables not under the caret, replaced by their rendering. */
function foldBlocks(state: EditorState, opts: LiveOptions, blocks: Block[]): DecorationSet {
  const sel = state.selection.ranges;
  const touched = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  const fm = frontmatterEnd(state.doc);
  const ranges = [];
  if (fm >= 0) {
    const lines = state.doc.lineAt(fm).number - 2;
    ranges.push(Decoration.replace({ widget: new FrontmatterWidget(lines, opts.editFrontmatter, opts.frontmatterTitle?.(lines) ?? "") }).range(0, fm));
  }
  for (const b of blocks) {
    if (b.from <= fm || touched(b.from, b.to)) continue;
    const html = b.kind === "embed" ? opts.noteHtml?.(b.text) : undefined;
    ranges.push(Decoration.replace({ widget: new BlockWidget(b, opts, html), block: true }).range(b.from, b.to));
  }
  return Decoration.set(ranges, true);
}

/** `$x$` inline, shown typeset until the caret reaches it; `$$x$$` among
 *  other text too, in display style, as the reader has it. */
class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean) {
    super();
  }
  override eq(other: InlineMathWidget): boolean {
    return other.tex === this.tex && other.display === this.display;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-lp-imath";
    try {
      el.innerHTML = katex.renderToString(this.tex, { displayMode: this.display, throwOnError: false });
    } catch {
      el.textContent = this.tex;
    }
    return el;
  }
}

type Range = { from: number; to: number; deco: Decoration };

/** End of the closing `---` line of the frontmatter, or -1: where the
 *  core finds it (./frontmatter), as the properties panel does. */
export function frontmatterEnd(doc: Text): number {
  const close = frontmatterClose((i) => (i < doc.lines ? doc.line(i + 1).text : undefined));
  return close < 0 ? -1 : doc.line(close + 1).to;
}

function linesOfSelection(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView, opts: LiveOptions): DecorationSet {
  const out: Range[] = [];
  const doc = view.state.doc;
  const active = linesOfSelection(view);
  const touched = (from: number, to: number): boolean => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(to).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  // A view plugin may not replace a line break: a hidden run stops at the
  // end of the line it starts on (a bare `>`, a link whose destination is
  // on the next line).
  const hide = (from: number, to: number): void => {
    const end = Math.min(to, doc.lineAt(from).to);
    if (end > from) out.push({ from, to: end, deco: Decoration.replace({}) });
  };
  const tree = syntaxTree(view.state);

  // The frontmatter is shown by the properties panel above the editor;
  // here it folds to one quiet line (the YAML itself is for source mode).
  // (The fold itself is a state field below: a replacement that spans
  // lines cannot come from a view plugin.)
  const fmEnd = frontmatterEnd(doc);

  // Math the reader typesets, by its parser's rules, in the blocks that
  // hold inline text — never in code, which is not such a block, nor over
  // a code span or a link's destination. A span on the caret's lines, or
  // across lines, stays source; a paragraph that is display math alone is
  // the fold field's.
  const math: { from: number; to: number }[] = [];
  const seen = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (!/^(Paragraph|ATXHeading[1-6]|SetextHeading[12])$/.test(node.name)) return undefined;
        if (seen.has(node.from) || (fmEnd >= 0 && node.from < fmEnd) || !doc.sliceString(node.from, node.to).includes("$")) return false;
        seen.add(node.from);
        const block = inlineText(doc, node.node);
        const spans = mathSpans(block.text);
        if (node.name === "Paragraph" && aloneInParagraph(block.text, spans) !== null) return false;
        for (const s of spans) {
          const a = block.pos(s.from);
          const b = block.pos(s.to);
          if (doc.lineAt(a).number !== doc.lineAt(b).number || touched(a, b)) continue;
          let raw = false;
          tree.iterate({ from: a, to: b, enter: (n) => void (/^(InlineCode|URL|Autolink|HTMLTag|Comment|LinkTitle|LinkLabel)$/.test(n.name) && n.from < b && n.to > a && (raw = true)) });
          if (raw) continue;
          math.push({ from: a, to: b });
          out.push({ from: a, to: b, deco: Decoration.replace({ widget: new InlineMathWidget(s.tex, s.display) }) });
        }
        return false;
      },
    });
  }
  // A node that cuts through a typeset span is inside the math: its marks
  // are TeX, not Markdown.
  const inMath = (from: number, to: number) => math.some((m) => from < m.to && to > m.from && !(from <= m.from && to >= m.to));
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (fmEnd >= 0 && node.to <= fmEnd && node.from < fmEnd) return false;
        if (inMath(node.from, node.to)) return false;
        const name = node.name;
        const shown = touched(node.from, node.to);
        if (name === "Table") {
          // Table rows in the mono face while edited.
          for (let n = doc.lineAt(node.from).number; n <= doc.lineAt(node.to).number; n++) {
            const l = doc.line(n);
            out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: "cm-lp-table" }) });
          }
        } else if (/^ATXHeading[1-6]$/.test(name)) {
          const level = name.slice(-1);
          const line = doc.lineAt(node.from);
          out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-lp-h cm-lp-h${level}` }) });
          if (!shown) {
            const mark = node.node.getChild("HeaderMark");
            if (mark) hide(mark.from, Math.min(mark.to + 1, node.to));
          }
        } else if (name === "StrongEmphasis" || name === "Emphasis" || name === "Strikethrough") {
          const cls = name === "StrongEmphasis" ? "cm-lp-strong" : name === "Emphasis" ? "cm-lp-em" : "cm-lp-strike";
          out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: cls }) });
          if (!shown) {
            for (const m of node.node.getChildren(name === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark")) hide(m.from, m.to);
          }
        } else if (name === "InlineCode") {
          out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-lp-code" }) });
          if (!shown) for (const m of node.node.getChildren("CodeMark")) hide(m.from, m.to);
        } else if (name === "FencedCode") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          for (let n = a; n <= b; n++) {
            const l = doc.line(n);
            out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: "cm-lp-fence" }) });
          }
        } else if (name === "Blockquote") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          for (let n = a; n <= b; n++) {
            const l = doc.line(n);
            out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: "cm-lp-quote" }) });
          }
        } else if (name === "QuoteMark") {
          // Every `>` of a quote, those inside its paragraphs too, with the
          // space after it when there is one.
          let quote = node.node.parent;
          while (quote && quote.name !== "Blockquote") quote = quote.parent;
          if (quote && !touched(quote.from, quote.to)) hide(node.from, /[ \t]/.test(doc.sliceString(node.to, node.to + 1)) ? node.to + 1 : node.to);
        } else if (name === "ListItem") {
          const line = doc.lineAt(node.from);
          const mark = node.node.getChild("ListMark");
          const bullet = mark !== null && /^[-*+]$/.test(doc.sliceString(mark.from, mark.to));
          out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: bullet ? "cm-lp-li cm-lp-bullet" : "cm-lp-li" }) });
          if (bullet && mark && !touched(line.from, line.to)) hide(mark.from, Math.min(mark.to + 1, line.to));
        } else if (name === "Link" && !shown) {
          out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-lp-link" }) });
          const url = node.node.getChild("URL");
          const marks = node.node.getChildren("LinkMark");
          if (url && marks.length >= 3 && doc.lineAt(node.from).number === doc.lineAt(node.to).number) {
            // [text](url): keep the text, hide "[", "](url)" — when the
            // link is on one line; one that spans lines shows its source.
            const first = marks[0];
            if (first) hide(first.from, first.to);
            const close = marks[1];
            if (close) hide(close.from, node.to);
          }
        } else if (name === "HorizontalRule" && !shown) {
          out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-lp-hr" }) });
        }
      },
    });

    // Wikilinks and embeds: the dialect's, outside code.
    const text = doc.sliceString(from, to);
    WIKILINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      const inner = m[2] ?? "";
      const embed = m[1] === "!";
      const kind = tree.resolveInner(start + 2, 1).name;
      if (kind === "InlineCode" || kind === "FencedCode" || kind === "CodeText") continue;
      if (math.some((r) => start < r.to && end > r.from)) continue;
      const target = (inner.split("|")[0] ?? "").split("#")[0] ?? "";
      const alias = inner.includes("|") ? (inner.split("|")[1] ?? "") : null;
      const shown = embed && IMAGE.test(target) ? view.state.selection.ranges.some((r) => r.from <= end && r.to >= start && !(r.from === r.to && (r.from === start || r.from === end))) : touched(start, end);
      if (embed && IMAGE.test(target) && !shown) {
        const url = opts.imageUrl(target);
        if (url) {
          const size = sizeOf(alias);
          out.push({ from: start, to: end, deco: Decoration.replace({ widget: new ImageWidget(url, target, size?.w ?? null) }) });
          continue;
        }
      }
      out.push({
        from: start,
        to: end,
        deco: Decoration.mark({ class: embed ? "cm-lp-wikilink cm-lp-embed" : "cm-lp-wikilink", attributes: { "data-target": target } }),
      });
      if (!shown) {
        // Hide "[[" (or "![["), the "target|" before an alias, and "]]".
        hide(start, start + (embed ? 3 : 2));
        if (alias !== null) hide(start + (embed ? 3 : 2), end - 2 - alias.length);
        hide(end - 2, end);
      }
    }
  }
  // Nothing the view would refuse: a mark is never empty, and a widget or
  // a hidden run never crosses a line break.
  const valid = out.filter((r) => r.from >= 0 && r.to <= doc.length && (r.deco.point ? r.from <= r.to && r.to <= doc.lineAt(r.from).to : r.from < r.to));
  return Decoration.set(
    valid.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
}

/** Decorations that cannot take the editor down: a note the builder does
 *  not expect is shown as its source, and the error goes to the console. */
function safely<T>(make: () => T, fallback: T): T {
  try {
    return make();
  } catch (e) {
    console.error("Live Preview:", e);
    return fallback;
  }
}

/** The blocks of the note (kept while only the selection moves), their
 *  decorations, and what the caret skips: the frontmatter only — a folded
 *  table, math or embed is reached with the arrow keys too, and opens. */
type Folds = { blocks: Block[]; decorations: DecorationSet; atomic: DecorationSet };
function folds(state: EditorState, opts: LiveOptions, blocks?: Block[]): Folds {
  const found = blocks ?? safely(() => blocksOf(state), []);
  const fm = frontmatterEnd(state.doc);
  return {
    blocks: found,
    decorations: safely(() => foldBlocks(state, opts, found), Decoration.none),
    atomic: fm > 0 ? Decoration.set([Decoration.replace({}).range(0, fm)]) : Decoration.none,
  };
}

export function livePreview(opts: LiveOptions) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = safely(() => build(view, opts), Decoration.none);
      }
      update(u: ViewUpdate): void {
        // The syntax tree grows in the background on a long note: a new
        // tree is a reason to redraw as much as an edit is.
        if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState) || u.transactions.some((t) => t.effects.some((e) => e.is(redraw)))) {
          this.decorations = safely(() => build(u.view, opts), Decoration.none);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  const clicks = EditorView.domEventHandlers({
    mousedown(event) {
      if (!(event.metaKey || event.ctrlKey)) return false;
      const a = (event.target as HTMLElement).closest<HTMLElement>(".cm-lp-wikilink");
      if (!a) return false;
      const target = a.dataset["target"];
      if (target) {
        event.preventDefault();
        opts.navigate(target);
        return true;
      }
      return false;
    },
  });
  // The frontmatter folded to one quiet line, from state (a view plugin
  // may not replace line breaks), and atomic so the caret skips it.
  const frontmatter = StateField.define<Folds>({
    create: (state) => folds(state, opts),
    update: (value, tr) => {
      if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) return folds(tr.state, opts);
      if (tr.selection !== undefined || tr.effects.some((e) => e.is(redraw))) return folds(tr.state, opts, value.blocks);
      return value;
    },
    provide: (f) => [EditorView.decorations.from(f, (v) => v.decorations), EditorView.atomicRanges.of((view) => view.state.field(f).atomic)],
  });
  return [plugin, clicks, frontmatter];
}
