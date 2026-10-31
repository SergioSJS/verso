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

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorState, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutterLineClass, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { tableArrows, type TableEditorOptions } from "./tableEditor";
import { heldImage } from "./sanitize";
import { hasCapability } from "./capabilities";
import { ImageWidget, HeldImageWidget, TaskCheckboxWidget, CodeCopyWidget, DiagramButtonWidget, IframeWidget } from "./live/widgets";
import { inlineText, mathSpans, aloneInParagraph, InlineMathWidget } from "./live/math";
import { blankGaps } from "./live/gaps";
import { gapArrowsKeymap } from "./live/gapNav";
import { blocksOf, foldBlocks, type Block } from "./live/blocks";
import { frontmatterEnd, outOfFrontmatter, keepFrontmatter } from "./live/frontmatter";
import { liveListNavKeymap, snapOutOfListPrefix } from "./live/lists";
import { OracleCalloutButtonWidget, oracleHeadAt } from "./oracle/live";
import { oracleTracker } from "./oracle/track";

// Names other modules took from here before the split (ADR 0067).
export { mathSpans, type MathSpan } from "./live/math";
export { blocksOf } from "./live/blocks";
export { frontmatterEnd, outOfFrontmatter, keepFrontmatter } from "./live/frontmatter";
export { liveListNavKeymap, snapOutOfListPrefix } from "./live/lists";

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
  /** A base drawn into `mount` (ADR 0053): a `base` block's text (`embed`
   *  null; `edit` replaces the block's text), or a `.base` file embedded on
   *  a line of its own. Returns what takes it down. */
  base?: (text: string, embed: string | null, mount: HTMLElement, edit: ((next: string) => void) | null) => () => void;
  /** A PDF file embedded on a line of its own, drawn into `mount`. */
  pdf?: (text: string, mount: HTMLElement) => () => void;
  /** An embedded note edited in place inside `mount` (ADR 0060 S4).
   *  Called when the embed is clicked to edit. Returns what takes it down. */
  editEmbed?: (target: string, mount: HTMLElement, onExit: () => void) => (() => void) | undefined;
  /** The edit-in-place button's tooltips, in the interface's language. */
  embedLabels?: { edit: string; done: string };
  /** A code block's copy button and what it says once copied, in the
   *  interface's language (ADR 0035). */
  copyLabels?: { copy: string; copied: string };
  /** A code block of JSON, YAML, TOML, XML or CSV gets "View as diagram"
   *  (ADR 0106): `label` is the button's name, `wants` says whether the
   *  language word is one the diagram reads (and the feature is on),
   *  `open` shows the block's text as a diagram beside the note. */
  diagram?: { label: string; wants: (lang: string) => boolean; open: (lang: string, text: string) => void };
  /** Whether an embed may be edited in place now (the setting). */
  canEditEmbed?: () => boolean;
  /** True when an embedded note is actively being edited, dirty, or conflicted. */
  isEmbedActive?: (target: string) => boolean;
  /** Tables edited as tables (ADR 0064): the editor's words and the
   *  window's menu and renderer. */
  table?: TableEditorOptions;
  /** The note being edited: a statblock's image path is read from the
   *  folder as this note names it. */
  notePath?: () => string;
  /** What a roll block's card needs of the window (ADR 0107's roll block). */
  roll?: { resolve: (target: string, from: string) => string | null; open: (path: string) => void };
  /** A `dice:` code drawn as its die (ADR 0088), or null. */
  dice?: (code: string, occ?: number) => WidgetType | null;
  /** A statblock card's dice — the note's own dice, which roll in a room
   *  through the server — and why its trackers cannot write now (ADR 0099
   *  items 4 and 5). */
  statblock?: { die?: (notation: string, look?: { text?: string; label?: string }) => HTMLElement; refusal?: () => "readOnly" | "conflict" | null };
};

/** Dispatch this when an image URL became known, so the view redraws. */
export const redraw = StateEffect.define<null>();

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** The syntax nodes that are code: nothing in them is decorated as text. */
const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

/** `![[img.png|300]]` or `|300x200` or `![|60](url)` or, after an alt
 *  text, `![Diagrama|320](url)`: Obsidian's size after the last pipe. */
export function sizeOf(alias: string | null): { w: number; h: number | null } | null {
  if (!alias) return null;
  const clean = alias.slice(alias.lastIndexOf("|") + 1).trim();
  const m = /^(\d+)(?:x(\d+))?$/.exec(clean);
  return m ? { w: Number(m[1]), h: m[2] ? Number(m[2]) : null } : null;
}

type Range = { from: number; to: number; deco: Decoration };


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
  const oracleButtons = new Set<number>();
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
  // The tree up to the end of what is drawn, parsed now (a few ms at most):
  // after a jump to a long note's end the background parse has not reached
  // it yet, and the marks drawn raw wait for it to land.
  const tree = ensureSyntaxTree(view.state, view.viewport.to, 30) ?? syntaxTree(view.state);
  const inCode = (pos: number): boolean => {
    for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) if (CODE_NODES.has(n.name)) return true;
    return false;
  };

  // The frontmatter is shown by the properties panel above the editor;
  // here it folds to one quiet line (the YAML itself is for source mode).
  // (The fold itself is a state field below: a replacement that spans
  // lines cannot come from a view plugin.)
  const fmEnd = frontmatterEnd(doc);

  // A blank line that only separates two blocks is a thin gap, full height
  // under the caret (ADR 0061, revised 2026-10-22); a further blank line in
  // the same run is smaller than a line but kept.
  for (const { from, to } of view.visibleRanges) {
    for (const [n, kind] of blankGaps(doc, tree, from, to, fmEnd)) {
      if (active.has(n)) continue;
      const at = doc.line(n).from;
      out.push({ from: at, to: at, deco: Decoration.line({ class: kind === "gap" ? "cm-lp-gap" : "cm-lp-gap-extra" }) });
    }
  }

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
        } else if (/^(ATXHeading[1-6]|SetextHeading[12])$/.test(name)) {
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
          const text = doc.sliceString(node.from, node.to);
          // Which of the note's identical codes this is: two dice of the
          // same notation are two dice (dice/card.ts).
          let occ = 0;
          if (!shown && opts.dice) {
            const before = doc.sliceString(0, node.from);
            for (let at = before.indexOf(text); at >= 0; at = before.indexOf(text, at + text.length)) occ++;
          }
          const die = shown ? null : (opts.dice?.(text, occ) ?? null);
          if (die) out.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: die }) });
          else out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-lp-code" }) });
          if (!shown && !die) for (const m of node.node.getChildren("CodeMark")) hide(m.from, m.to);
        } else if (name === "FencedCode") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          const codeMarks = node.node.getChildren("CodeMark");
          const openMark = codeMarks[0];
          const closeMark = codeMarks.length > 1 ? codeMarks[codeMarks.length - 1] : null;
          const info = node.node.getChild("CodeInfo");

          for (let n = a; n <= b; n++) {
            const l = doc.line(n);
            const isFirst = n === a;
            const isLast = n === b && b > a;
            const isSingle = a === b;
            let lineCls = "cm-lp-fence";
            if (isSingle) lineCls += " cm-lp-fence-single";
            else if (isFirst) lineCls += " cm-lp-fence-first" + (!active.has(a) ? " cm-lp-fence-closed" : "");
            else if (isLast) lineCls += " cm-lp-fence-last" + (!active.has(b) ? " cm-lp-fence-closed" : "");
            else lineCls += " cm-lp-fence-body";
            out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: lineCls }) });
          }

          if (openMark && !active.has(a)) {
            hide(openMark.from, openMark.to);
            if (info) {
              out.push({ from: info.from, to: info.to, deco: Decoration.mark({ class: "cm-lp-fence-lang" }) });
            }
          }
          if (closeMark && b > a && !active.has(b)) {
            hide(closeMark.from, closeMark.to);
          }

          const raw = doc.sliceString(node.from, node.to);
          const fLines = raw.split("\n");
          const codeText = (fLines.length > 2 ? fLines.slice(1, -1).join("\n") : fLines.slice(1).join("\n")).trimEnd();
          if (codeText.length > 0) {
            out.push({
              from: node.from,
              to: node.from,
              deco: Decoration.widget({ widget: new CodeCopyWidget(codeText, opts.copyLabels ?? { copy: "Copy code", copied: "Copied." }), side: 1 }),
            });
            const lang = info ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] ?? "" : "";
            if (opts.diagram && lang !== "" && opts.diagram.wants(lang)) {
              out.push({
                from: node.from,
                to: node.from,
                deco: Decoration.widget({ widget: new DiagramButtonWidget(codeText, lang, opts.diagram.label, opts.diagram.open), side: 2 }),
              });
            }
          }
        } else if (name === "Blockquote") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          const firstLine = doc.lineAt(node.from);
          const cleanLead = firstLine.text.replace(/^[ \t]*(?:>[ \t]?)+[ \t]*/, "");
          const calloutMatch = /^\[!([a-zA-Z0-9_-]+)\]([+-]?)(?:[ \t]+(.*))?$/.exec(cleanLead);
          const calloutKind = calloutMatch ? calloutMatch[1]!.toLowerCase() : null;

          for (let n = a; n <= b; n++) {
            const l = doc.line(n);
            const isFirst = n === a;
            const isLast = n === b;
            if (calloutKind) {
              let cls = `cm-lp-callout cm-lp-callout-${calloutKind}`;
              if (isFirst) cls += " cm-lp-callout-head";
              if (isLast) cls += " cm-lp-callout-tail";
              out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: cls }) });
            } else {
              let cls = "cm-lp-quote";
              if (isFirst) cls += " cm-lp-quote-head";
              if (isLast) cls += " cm-lp-quote-tail";
              out.push({ from: l.from, to: l.from, deco: Decoration.line({ class: cls }) });
            }
          }

          if (calloutKind && !active.has(a)) {
            const m = /(?:^>[ \t]*)\[!([a-zA-Z0-9_-]+)\][+-]?/.exec(firstLine.text);
            if (m) {
              const bStart = firstLine.from + m[0].indexOf("[!");
              const kStart = bStart + 2;
              const kEnd = kStart + m[1]!.length;
              const bEnd = firstLine.from + m[0].length;
              hide(bStart, kStart);
              out.push({ from: kStart, to: kEnd, deco: Decoration.mark({ class: "cm-lp-callout-tag" }) });
              hide(kEnd, bEnd);
            }
            if (calloutKind === "oracle" && hasCapability("oracles") && !oracleButtons.has(firstLine.from) && oracleHeadAt(firstLine.text, a > 1 ? doc.line(a - 1).text : null)) {
              // One button per callout: a nested one is seen by both quotes.
              oracleButtons.add(firstLine.from);
              out.push({
                from: firstLine.to,
                to: firstLine.to,
                deco: Decoration.widget({ widget: new OracleCalloutButtonWidget(), side: 1 }),
              });
            }
          }
        } else if (name === "HTMLBlock" || name === "HTMLTag") {
          const raw = doc.sliceString(node.from, node.to);
          const m = /<iframe\b([^>]*?)>(?:.*?<\/iframe>)?/is.exec(raw);
          if (m && !shown) {
            const attrs = m[1] ?? "";
            const src = /src=["'](.*?)["']/i.exec(attrs)?.[1] ?? "";
            const style = /style=["'](.*?)["']/i.exec(attrs)?.[1] ?? "";
            const width = /width=["'](.*?)["']/i.exec(attrs)?.[1] ?? "";
            const height = /height=["'](.*?)["']/i.exec(attrs)?.[1] ?? "";
            if (src.startsWith("http://") || src.startsWith("https://")) {
              out.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new IframeWidget(src, style, width, height) }),
              });
            }
          }
        } else if (name === "QuoteMark") {
          // Every `>` of a quote, those inside its paragraphs too, with the
          // space after it when there is one, hidden if line is not active.
          const line = doc.lineAt(node.from);
          if (!active.has(line.number)) {
            hide(node.from, /[ \t]/.test(doc.sliceString(node.to, node.to + 1)) ? node.to + 1 : node.to);
          }
        } else if (name === "ListItem") {
          const line = doc.lineAt(node.from);
          const mark = node.node.getChild("ListMark");
          const taskMarker = node.node.getChild("TaskMarker") ?? node.node.getChild("Task")?.getChild("TaskMarker") ?? null;
          const isTask = taskMarker !== null;
          const markText = mark ? doc.sliceString(mark.from, mark.to) : "";
          const hasTrailingSpace = mark !== null && mark.to < line.to && /[ \t]/.test(doc.sliceString(mark.to, mark.to + 1));
          const bullet = !isTask && mark !== null && hasTrailingSpace && /^[-*+]$/.test(markText);
          const isOrdered = !isTask && mark !== null && hasTrailingSpace && /^\d+\.$/.test(markText);

          if (!isTask && !bullet && !isOrdered) {
            // A bare marker without trailing space (e.g. '-' or '1.' while typing) is not decorated
            return;
          }

          let depth = 0;
          let p = node.node.parent;
          while (p) {
            if (p.name === "ListItem") depth++;
            p = p.parent;
          }
          const indentText = line.text.match(/^([ \t]*)/)?.[1] ?? "";
          const tabs = (indentText.match(/\t/g) ?? []).length;
          const spaces = indentText.replace(/\t/g, "").length;
          const visualDepth = Math.max(depth, tabs > 0 ? tabs : Math.floor(spaces / (isOrdered ? 4 : 2)));
          const lineAttrs: Record<string, string> = {};

          if (taskMarker) {
            const taskText = doc.sliceString(taskMarker.from, taskMarker.to);
            const checked = /^\[[xX]\]$/.test(taskText);

            if (visualDepth > 0) lineAttrs["style"] = `--lp-depth: ${visualDepth};`;
            const cls = checked ? "cm-lp-li cm-lp-task cm-lp-task-done" : "cm-lp-li cm-lp-task";
            out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: cls, attributes: lineAttrs }) });
            if (mark) hide(line.from, Math.min(mark.to + 1, line.to));

            out.push({
              from: taskMarker.from,
              to: taskMarker.to,
              deco: Decoration.replace({ widget: new TaskCheckboxWidget(checked, taskMarker.from) }),
            });
          } else {
            const showBullet = bullet;
            if (visualDepth > 0) lineAttrs["style"] = `--lp-depth: ${visualDepth};`;
            const cls = showBullet ? "cm-lp-li cm-lp-bullet" : isOrdered ? "cm-lp-li cm-lp-ordered" : "cm-lp-li";
            out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: cls, attributes: lineAttrs }) });
            if (bullet && mark) {
              hide(line.from, Math.min(mark.to + 1, line.to));
            } else if (isOrdered && mark) {
              if (mark.from > line.from) hide(line.from, mark.from);
              // Its digits size the mark (`12.`, `100)`): it grows to the left
              // and the text after it stays where a `1.` item's text is.
              const digits = Math.max(1, mark.to - mark.from - 1);
              const attributes = { style: `--lp-order-digits: ${digits};` };
              out.push({ from: mark.from, to: mark.to, deco: Decoration.mark({ class: "cm-lp-order-mark", attributes }) });
            }
          }
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
        } else if (name === "Image" && !shown) {
          const urlNode = node.node.getChild("URL");
          const marks = node.node.getChildren("LinkMark");
          if (urlNode) {
            const rawUrl = doc.sliceString(urlNode.from, urlNode.to);
            let alt = "";
            const m0 = marks[0];
            const m1 = marks[1];
            if (m0 && m1) alt = doc.sliceString(m0.to, m1.from);
            const size = sizeOf(alt);
            const src = /^https?:\/\//i.test(rawUrl) ? rawUrl : opts.imageUrl(rawUrl);
            if (src && heldImage(src)) {
              // Remote content off: a link, as in the reading view (the
              // alt when it is text, not only a size: `Diagrama|320` reads
              // "Diagrama").
              const words = alt.includes("|") ? alt.slice(0, alt.lastIndexOf("|")).trim() : size ? "" : alt;
              out.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new HeldImageWidget(src, words) }) });
            } else if (src) {
              out.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new ImageWidget(src, alt, size?.w ?? null, size?.h ?? null) }),
              });
            }
          }
        } else if (name === "HorizontalRule") {
          const line = doc.lineAt(node.from);
          if (!active.has(line.number)) {
            out.push({ from: line.from, to: line.from, deco: Decoration.line({ class: "cm-lp-hr-line" }) });
            hide(node.from, node.to);
          } else {
            out.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-lp-hr" }) });
          }
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
      if (inCode(start + 2)) continue;
      if (math.some((r) => start < r.to && end > r.from)) continue;
      const target = (inner.split("|")[0] ?? "").split("#")[0] ?? "";
      const alias = inner.includes("|") ? (inner.split("|")[1] ?? "") : null;
      const shown = embed && IMAGE.test(target)
        ? view.state.selection.ranges.some((r) => r.empty && r.from <= end && r.to >= start && !(r.from === r.to && (r.from === start || r.from === end)))
        : touched(start, end);
      if (embed && IMAGE.test(target) && !shown) {
        const url = opts.imageUrl(target);
        if (url) {
          const size = sizeOf(alias);
          out.push({ from: start, to: end, deco: Decoration.replace({ widget: new ImageWidget(url, target, size?.w ?? null, size?.h ?? null) }) });
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

    // Highlight marks: `==highlight==`
    const MARK_RE = /==([^=\n]+)==/g;
    MARK_RE.lastIndex = 0;
    while ((m = MARK_RE.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (inCode(start + 2)) continue;
      if (math.some((r) => start < r.to && end > r.from)) continue;
      const isSpanTouched = touched(start, end);
      out.push({ from: start, to: end, deco: Decoration.mark({ class: "cm-lp-mark" }) });
      if (!isSpanTouched) {
        hide(start, start + 2);
        hide(end - 2, end);
      }
    }

    // A block's `^id` stays, quiet, as Obsidian's Live Preview shows it
    // (the reading view drops it; observed 2026-10-07).
    const BLOCK_ID = /(?:^|[ \t])(\^[A-Za-z0-9-]+)[ \t]*$/gm;
    while ((m = BLOCK_ID.exec(text)) !== null) {
      const end = from + m.index + m[0].trimEnd().length;
      const start = end - (m[1] ?? "").length;
      if (!inCode(start) && !math.some((r) => start < r.to && end > r.from)) out.push({ from: start, to: end, deco: Decoration.mark({ class: "cm-blockid" }) });
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
  class HeadingGutterMarker extends GutterMarker {
    constructor(readonly elementClass: string) {
      super();
    }
  }

  const headingGutter = gutterLineClass.compute(["doc"], (state) => {
    const markers: ReturnType<GutterMarker["range"]>[] = [];
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      const m = /^(#{1,6})\s/.exec(line.text);
      if (m) {
        const level = m[1]!.length;
        markers.push(new HeadingGutterMarker(`cm-lp-gutter-h cm-lp-gutter-h${level}`).range(line.from));
      }
    }
    return RangeSet.of(markers);
  });

  return [
    plugin,
    clicks,
    opts.table ? tableArrows((state) => safely(() => blocksOf(state), []).filter((b) => b.kind === "table" && b.editable)) : [],
    frontmatter,
    outOfFrontmatter,
    keepFrontmatter,
    headingGutter,
    liveListNavKeymap,
    gapArrowsKeymap,
    snapOutOfListPrefix,
    oracleTracker,
  ];
}
