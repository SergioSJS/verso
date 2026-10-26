// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's math (split out of ../live.ts, ADR 0067).

import { WidgetType } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import katex from "katex";

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
export function inlineText(doc: Text, node: SyntaxNode): { text: string; pos: (offset: number) => number } {
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
export function aloneInParagraph(text: string, spans: MathSpan[]): string | null {
  const only = spans.length === 1 ? spans[0] : undefined;
  return only && only.display && text.slice(0, only.from).trim() === "" && text.slice(only.to).trim() === "" ? only.tex : null;
}

/** `$x$` inline, shown typeset until the caret reaches it; `$$x$$` among
 *  other text too, in display style, as the reader has it. */
export class InlineMathWidget extends WidgetType {
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
