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
import katex from "katex";
import { SEPARATOR, cells } from "./table";

export type LiveOptions = {
  /** Where an image embed target loads from, once known; `null` when it is
   *  not an image or not found; `undefined` while being asked. */
  imageUrl: (target: string) => string | null | undefined;
  /** ⌘/Ctrl-click on a wikilink. */
  navigate: (target: string) => void;
  /** The folded frontmatter was clicked: the caller shows the YAML (source mode). */
  editFrontmatter?: () => void;
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
  constructor(readonly lines: number, readonly onClick: (() => void) | undefined) {
    super();
  }
  override eq(other: FrontmatterWidget): boolean {
    return other.lines === this.lines;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-lp-frontmatter";
    el.textContent = "···";
    el.title = `${this.lines} ${this.lines === 1 ? "line" : "lines"} of properties — click to edit the YAML`;
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

/** A block of the note shown rendered until the caret enters it: a table,
 *  display math, or a note embedded on a line of its own. */
type Block = { from: number; to: number; kind: "table" | "math" | "embed"; text: string };
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\|.*)?$/i;
export function blocksOf(doc: Text): Block[] {
  const out: Block[] = [];
  let inFence = false;
  let n = 1;
  while (n <= doc.lines) {
    const line = doc.line(n);
    const text = line.text;
    const trimmed = text.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      n++;
      continue;
    }
    if (inFence) {
      n++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(text)) {
      let last = n;
      while (last < doc.lines && /^\s*\|.*\|\s*$/.test(doc.line(last + 1).text)) last++;
      if (last > n) out.push({ from: line.from, to: doc.line(last).to, kind: "table", text: doc.sliceString(line.from, doc.line(last).to) });
      n = last + 1;
      continue;
    }
    if (trimmed.startsWith("$$")) {
      if (trimmed.length > 2 && trimmed.endsWith("$$")) {
        out.push({ from: line.from, to: line.to, kind: "math", text: trimmed.slice(2, -2) });
        n++;
        continue;
      }
      let last = n + 1;
      while (last <= doc.lines && !doc.line(last).text.trim().endsWith("$$")) last++;
      if (last <= doc.lines) {
        const inner = doc.sliceString(line.from, doc.line(last).to).trim().replace(/^\$\$/, "").replace(/\$\$$/, "");
        out.push({ from: line.from, to: doc.line(last).to, kind: "math", text: inner });
        n = last + 1;
        continue;
      }
    }
    const embed = /^!\[\[([^\]\n]+)\]\]$/.exec(trimmed);
    if (embed && !IMAGE_EXT.test(embed[1] ?? "")) out.push({ from: line.from, to: line.to, kind: "embed", text: embed[1] ?? "" });
    n++;
  }
  return out;
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
      const lines = b.text.split("\n");
      const table = document.createElement("table");
      const rows = lines.map(cells);
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
      lines.forEach((line, i) => {
        if (i === 0 || SEPARATOR.test(line)) return;
        const r = document.createElement("tr");
        for (const c of rows[i] ?? []) {
          const td = document.createElement("td");
          td.textContent = c;
          r.append(td);
        }
        tbody.append(r);
      });
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
function foldBlocks(state: EditorState, opts: LiveOptions): DecorationSet {
  const sel = state.selection.ranges;
  const touched = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  const fm = frontmatterEnd(state.doc);
  const ranges = [];
  if (fm >= 0) ranges.push(Decoration.replace({ widget: new FrontmatterWidget(state.doc.lineAt(fm).number - 2, opts.editFrontmatter) }).range(0, fm));
  for (const b of blocksOf(state.doc)) {
    if (b.from <= fm || touched(b.from, b.to)) continue;
    const html = b.kind === "embed" ? opts.noteHtml?.(b.text) : undefined;
    ranges.push(Decoration.replace({ widget: new BlockWidget(b, opts, html), block: true }).range(b.from, b.to));
  }
  return Decoration.set(ranges, true);
}

/** `$x$` inline, shown typeset until the caret reaches it. */
class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }
  override eq(other: InlineMathWidget): boolean {
    return other.tex === this.tex;
  }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-lp-imath";
    try {
      el.innerHTML = katex.renderToString(this.tex, { throwOnError: false });
    } catch {
      el.textContent = this.tex;
    }
    return el;
  }
}

type Range = { from: number; to: number; deco: Decoration };

/** End of the closing `---` line of a frontmatter block, or -1. */
export function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return -1;
  for (let n = 2; n <= doc.lines; n++) {
    const l = doc.line(n);
    if (l.text.trim() === "---" || l.text.trim() === "...") return l.to;
  }
  return -1;
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

  // Table rows in the mono face while edited; `$x$` typeset when not touched.
  for (const { from, to } of view.visibleRanges) {
    let n = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (; n <= last; n++) {
      const line = doc.line(n);
      if (line.from < (fmEnd < 0 ? 0 : fmEnd)) continue;
      if (/^\s*\|.*\|\s*$/.test(line.text)) out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: "cm-lp-table" }) });
      if (line.text.includes("$") && !line.text.trim().startsWith("$$")) {
        const re = /(?<![\\$])\$([^$\n]+?)\$(?!\$)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line.text))) {
          const s = line.from + m.index;
          const e = s + m[0].length;
          if (touched(s, e)) continue;
          out.push({ from: s, to: e, deco: Decoration.replace({ widget: new InlineMathWidget(m[1] ?? "") }) });
        }
      }
    }
  }
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (fmEnd >= 0 && node.to <= fmEnd && node.from < fmEnd) return false;
        const name = node.name;
        const shown = touched(node.from, node.to);
        if (/^ATXHeading[1-6]$/.test(name)) {
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
function safely(make: () => DecorationSet): DecorationSet {
  try {
    return make();
  } catch (e) {
    console.error("Live Preview:", e);
    return Decoration.none;
  }
}

export function livePreview(opts: LiveOptions) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = safely(() => build(view, opts));
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(redraw)))) {
          this.decorations = safely(() => build(u.view, opts));
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
  const frontmatter = StateField.define<DecorationSet>({
    create: (state) => safely(() => foldBlocks(state, opts)),
    update: (value, tr) => (tr.docChanged || tr.selection !== undefined || tr.effects.some((e) => e.is(redraw)) ? safely(() => foldBlocks(tr.state, opts)) : value),
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  });
  return [plugin, clicks, frontmatter];
}
