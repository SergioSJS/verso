// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Colour swatches (ADR 0108): a small square of the colour before a colour
// code. In the editor (Live Preview and Source) it is a widget beside the
// code, drawn for the visible part of the note only, and a click or Enter
// opens the picker, which writes the code back as an ordinary edit (⌘Z
// undoes it). In the reading view it is a picture beside the code and
// nothing more. The file is never touched by showing a swatch (invariant 7).

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { Extension, Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import { hasCapability } from "../capabilities";
import { redraw } from "../live";
import { frontmatterEnd } from "../live/frontmatter";
import { type Found, cssOf, findCodes, formatLike, swatchesIn } from "./code";
import { openPicker } from "./picker";
import { cs } from "./strings";

/** The most swatches one drawing makes, and the longest line looked at. */
const MAX_SWATCHES = 2000;
const MAX_LINE = 20000;

const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);
/** Where a hash is no colour: a link's address, raw HTML, a comment. */
const SKIP_NODES = new Set(["URL", "Autolink", "HTMLTag", "HTMLBlock", "Comment", "CommentBlock", "LinkTitle", "LinkReference"]);

type Where = "code" | "prose" | "skip";

function whereIs(tree: Tree, pos: number): Where {
  for (let n: ReturnType<Tree["resolve"]> | null = tree.resolve(pos, 1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return "code";
    if (SKIP_NODES.has(n.name)) return "skip";
  }
  return "prose";
}

/** The lines of the frontmatter that hold tags or aliases: a hash there is
 *  a tag, not a colour. */
function tagLines(doc: Text, fmEnd: number): Set<number> {
  const out = new Set<number>();
  let inTags = false;
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.from > fmEnd) break;
    const key = /^([A-Za-z_][\w-]*)\s*:/.exec(line.text);
    if (key) inTags = /^(tags?|aliases|alias|cssclasses?)$/i.test(key[1]!);
    if (inTags) out.add(i);
  }
  return out;
}

/** Whether the editor lets this person change the note. */
function editable(view: EditorView): boolean {
  return !view.state.readOnly && view.state.facet(EditorView.editable);
}

class SwatchWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly css: string,
    readonly canEdit: boolean,
  ) {
    super();
  }
  override eq(o: SwatchWidget): boolean {
    return o.code === this.code && o.canEdit === this.canEdit;
  }
  override toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "swatch-chip";
    chip.style.setProperty("--sw", this.css);
    if (!this.canEdit) {
      const s = document.createElement("span");
      s.className = "swatch cm-swatch";
      s.setAttribute("role", "img");
      s.setAttribute("aria-label", cs.shows(this.code));
      s.append(chip);
      return s;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch cm-swatch";
    b.setAttribute("aria-label", cs.adjust(this.code));
    b.title = cs.adjust(this.code);
    b.append(chip);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      pick(view, b);
    });
    // A mousedown on it must not move the caret under the picker.
    b.addEventListener("mousedown", (e) => e.preventDefault());
    return b;
  }
  /** The swatch's own click and keys; the editor leaves them alone. */
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The code the swatch `dom` stands before, found again in the text now. */
function codeAt(view: EditorView, dom: HTMLElement): { from: number; to: number; found: Found } | null {
  const pos = view.posAtDOM(dom);
  const line = view.state.doc.lineAt(pos);
  if (line.length > MAX_LINE) return null;
  const found = findCodes(line.text).find((f) => line.from + f.from === pos);
  return found ? { from: pos, to: line.from + found.to, found } : null;
}

function pick(view: EditorView, dom: HTMLElement): void {
  const at = codeAt(view, dom);
  if (!at || !editable(view)) return;
  const { found } = at;
  const from = at.from;
  const original = found.code;
  let now = original;
  const put = (code: string): boolean => {
    if (view.state.doc.sliceString(from, from + now.length) !== now) return false;
    view.dispatch({ changes: { from, to: from + now.length, insert: code }, userEvent: "input.colour" });
    now = code;
    return true;
  };
  openPicker({
    anchor: dom,
    colour: found.colour,
    format: (c) => formatLike(found.style, c),
    write: put,
    restore: () => void put(original),
    onClose: () => view.focus(),
  });
}

/** The swatches of what is on screen, as decorations. */
function build(view: EditorView): DecorationSet {
  if (!hasCapability("colorSwatches")) return Decoration.none;
  const { state } = view;
  const doc = state.doc;
  const tree = ensureSyntaxTree(state, view.viewport.to, 30) ?? syntaxTree(state);
  const fmEnd = frontmatterEnd(doc);
  const skipFront = fmEnd >= 0 ? tagLines(doc, fmEnd) : new Set<number>();
  const can = editable(view);
  const out: ReturnType<Decoration["range"]>[] = [];
  let lastLine = 0;
  for (const range of view.visibleRanges) {
    for (let n = Math.max(doc.lineAt(range.from).number, lastLine + 1); n <= doc.lineAt(range.to).number; n++) {
      lastLine = n;
      const line = doc.line(n);
      if (line.length > MAX_LINE || line.length < 4 || !/[#(]/.test(line.text)) continue;
      const inFront = fmEnd >= 0 && line.from <= fmEnd;
      if (inFront && (skipFront.has(n) || n === 1)) continue;
      // The syntax decides per code whether it is in code, a link or text.
      const prose = new Set(swatchesIn(line.text, "prose").map((p) => p.from));
      for (const f of swatchesIn(line.text, inFront ? "property" : "code")) {
        const at: Where = inFront ? "code" : whereIs(tree, line.from + f.from);
        if (at === "skip" || (at === "prose" && !prose.has(f.from))) continue;
        out.push(Decoration.widget({ widget: new SwatchWidget(f.code, cssOf(f.colour), can), side: -1 }).range(line.from + f.from));
        if (out.length >= MAX_SWATCHES) return Decoration.set(out, true);
      }
    }
  }
  return Decoration.set(out, true);
}

/** The editor extension: swatches in Live Preview and Source. */
export function colourSwatches(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = safely(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState) || u.startState.readOnly !== u.state.readOnly || u.transactions.some((t) => t.effects.some((e) => e.is(redraw)))) {
          this.decorations = safely(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function safely(view: EditorView): DecorationSet {
  try {
    return build(view);
  } catch {
    return Decoration.none;
  }
}
