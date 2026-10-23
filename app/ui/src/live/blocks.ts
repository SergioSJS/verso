// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's folded blocks (split out of ../live.ts, ADR 0067).

import type { LiveOptions } from "../live";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import katex from "katex";
import { cells } from "../table";
import { TableEditor } from "../tableEditor";
import { icon } from "../icons";
import { t } from "../strings";
import { renderMermaid } from "../mermaid";
import { hasCapability } from "../capabilities";
import { planValueEdit, sameText, type Refusal, type Value, type ValuePath, type WriteOutcome } from "../statblock/edit";
import { isStatblockFence, renderStatblock } from "../statblock/render";
import { isRollFence, parseRoll } from "../rollblock/format";
import { rollCard } from "../rollblock/card";
import { startOf, FrontmatterWidget } from "./widgets";
import { mathSpans, inlineText, aloneInParagraph } from "./math";
import { frontmatterEnd } from "./frontmatter";

/** A block of the note shown rendered until the caret enters it: a table,
 *  display math alone in its paragraph, or a note embedded on a line of
 *  its own. Found in the syntax tree, so a block begins and ends where the
 *  reader's parser has it: a table needs its delimiter row, a fence closes
 *  only on a fence of its own kind, and `$$` math ends with its paragraph. */
export type Block = { from: number; to: number; kind: "table" | "math" | "embed" | "base" | "mermaid" | "pdf" | "statblock" | "roll"; text: string; rows?: string[]; embed?: true; nested?: true; editable?: true; ordinal?: number };
export const BASE_EMBED = /\.base(#[^|]*)?$/i;
export const PDF_EXT = /\.pdf([#|].*)?$/i;
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\|.*)?$/i;
export function blocksOf(state: EditorState): Block[] {
  const doc = state.doc;
  const tree = syntaxTree(state);
  const out: Block[] = [];
  // The note's tables in order, every one counted — a nested one too — as
  // the reading view counts them: a table's widths are kept by its place
  // (tableWidths.ts).
  let tables = 0;
  let statblocks = 0;
  // The block's whole lines, when only indentation or `>` marks precede it
  // on its first line (after a list marker it stays source).
  const lines = (from: number, to: number) => {
    const line = doc.lineAt(from);
    return /^[\s>]*$/.test(doc.sliceString(line.from, from)) ? { from: line.from, to: doc.lineAt(to).to } : null;
  };
  tree.iterate({
    enter: (n) => {
      if (n.name === "FencedCode") {
        // A `base`, `mermaid` or `statblock` block: the view in place of the fence.
        const info = n.node.getChild("CodeInfo");
        const infoStr = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : "";
        if (infoStr === "base") {
          // Inside a quote, a callout or a list the parser gives the text a
          // line at a time, without the marks: such a block is shown, and
          // its menus do not edit it — they would write it back unmarked.
          const text = n.node.getChildren("CodeText").map((c) => doc.sliceString(c.from, c.to)).join("\n");
          let nested = false;
          for (let p = n.node.parent; p; p = p.parent) if (p.name === "Blockquote" || p.name === "ListItem") nested = true;
          const at = lines(n.from, n.to);
          if (at) out.push({ ...at, kind: "base", text, ...(nested ? { nested: true as const } : {}) });
        } else if (infoStr === "mermaid") {
          const text = n.node.getChildren("CodeText").map((c) => doc.sliceString(c.from, c.to)).join("\n");
          const at = lines(n.from, n.to);
          if (at) out.push({ ...at, kind: "mermaid", text });
        } else if (isRollFence(infoStr)) {
          // A roll of the table kept in the note (ADR 0107): a card when it
          // reads, the plain code when it does not.
          const text = n.node.getChildren("CodeText").map((c) => doc.sliceString(c.from, c.to)).join("\n");
          const at = lines(n.from, n.to);
          if (at && parseRoll(text)) out.push({ ...at, kind: "roll", text });
        } else if (isStatblockFence(infoStr) && hasCapability("statblocks")) {
          const text = n.node.getChildren("CodeText").map((c) => doc.sliceString(c.from, c.to)).join("\n");
          const at = lines(n.from, n.to);
          // Counted in order, as the card's place for the last card that read.
          const ordinal = statblocks++;
          let nested = false;
          for (let p = n.node.parent; p; p = p.parent) if (p.name === "Blockquote" || p.name === "ListItem") nested = true;
          if (at) out.push({ ...at, kind: "statblock", text, ordinal, ...(nested ? { nested: true as const } : {}) });
        }
        return false;
      }
      if (n.name === "Table") {
        const ordinal = tables++;
        const rows: string[] = [];
        for (let c = n.node.firstChild; c; c = c.nextSibling) {
          if (c.name === "TableHeader" || c.name === "TableDelimiter" || c.name === "TableRow") rows.push(doc.sliceString(c.from, c.to));
        }
        const at = lines(n.from, n.to);
        // Edited as a table (ADR 0064) when it stands on its own lines, out
        // of a list or a quote, every row between pipes: written back, it
        // keeps all it had.
        let nested = false;
        for (let p = n.node.parent; p; p = p.parent) if (p.name === "Blockquote" || p.name === "ListItem") nested = true;
        const editable = !nested && rows.length >= 2 && rows.every((r) => /^\|.*\|$/.test(r.trim())) && at !== null && doc.sliceString(at.from, at.to).split("\n").every((l) => /^\s*\|/.test(l));
        if (at) out.push({ ...at, kind: "table", text: rows.join("\n"), rows, ordinal, ...(editable ? { editable: true as const } : {}) });
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
    if (!code) {
      const raw = embed[1] ?? "";
      if (BASE_EMBED.test(raw)) {
        out.push({ from: line.from, to: line.to, kind: "base", text: raw, embed: true });
      } else if (PDF_EXT.test(raw)) {
        out.push({ from: line.from, to: line.to, kind: "pdf", text: raw, embed: true });
      } else {
        out.push({ from: line.from, to: line.to, kind: "embed", text: raw });
      }
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** What takes a drawn base down, by its widget's element. */
export const bases = new WeakMap<HTMLElement, () => void>();

/** The text between a fenced block's fences, in `from`..`to` of `doc`:
 *  the lines after the first and before the last. */
export function fenceInside(doc: Text, from: number, to: number): { from: number; to: number } | null {
  const first = doc.lineAt(from);
  const last = doc.lineAt(to);
  if (last.number - first.number < 1) return null;
  const inside = { from: Math.min(first.to + 1, doc.length), to: last.from };
  return inside.from <= inside.to ? inside : null;
}

/** A tracker's value written into the statblock the widget `el` draws
 *  (ADR 0099 item 5): that one value's text, through the editor — in a
 *  room, the room's edit — once the block is found where the widget is and
 *  still holds the text the card was drawn from. */
function writeStatblock(view: EditorView, el: HTMLElement, text: string, key: ValuePath, value: Value, refusal: Refusal | null): WriteOutcome {
  if (refusal) return { ok: false, why: refusal };
  if (view.state.readOnly) return { ok: false, why: "readOnly" };
  const at = startOf(view, el);
  const found = at === null ? undefined : blocksOf(view.state).find((x) => x.kind === "statblock" && x.from === at);
  const inside = found ? fenceInside(view.state.doc, found.from, found.to) : null;
  if (!found || !inside) return { ok: false, why: "moved" };
  const slice = view.state.doc.sliceString(inside.from, inside.to);
  if (!sameText(slice, text) || !sameText(found.text, text)) return { ok: false, why: "stale" };
  const plan = planValueEdit(slice, key, value);
  if ("why" in plan) return { ok: false, why: plan.why };
  view.dispatch({ changes: { from: inside.from + plan.from, to: inside.from + plan.to, insert: plan.insert } });
  return { ok: true };
}

export class BlockWidget extends WidgetType {
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
    if (b.kind === "base") {
      const isEmbed = b.embed === true;
      // The block's source, a click away: the caret into the fence.
      const code = document.createElement("button");
      code.type = "button";
      code.className = "cm-lp-base-source";
      code.textContent = "</>";
      code.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) } });
        view.focus();
      });
      el.append(code);
      const mount = document.createElement("div");
      el.append(mount);
      const edit = isEmbed || b.nested === true
        ? null
        : (next: string) => {
            const at = startOf(view, el);
            if (at === null) return;
            const found = blocksOf(view.state).find((x) => x.kind === "base" && x.from === at);
            const inside = found ? fenceInside(view.state.doc, found.from, found.to) : null;
            if (!inside) return;
            const body = next.endsWith("\n") ? next : `${next}\n`;
            view.dispatch({ changes: { from: inside.from, to: inside.to, insert: body } });
          };
      const stop = this.opts.base?.(b.text, isEmbed ? b.text : null, mount, edit);
      if (stop) bases.set(el, stop);
      return el;
    }
    if (b.kind === "mermaid") {
      el.className = "cm-lp-block cm-lp-mermaid";
      el.style.position = "relative";
      el.title = t.mermaidEditTip;

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "cm-lp-base-source";
      editBtn.textContent = "</>";
      editBtn.title = t.mermaidEditCode;
      editBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at + 4, view.state.doc.length) } });
        view.focus();
      });
      el.append(editBtn);

      const mount = document.createElement("div");
      mount.className = "mermaid-svg-container";
      el.append(mount);

      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at + 4, view.state.doc.length) } });
        view.focus();
      });

      void renderMermaid(b.text, mount);
      return el;
    }
    if (b.kind === "roll") {
      el.className = "cm-lp-block cm-lp-roll";
      const parsed = parseRoll(b.text);
      if (parsed) el.append(rollCard(parsed, this.opts.notePath?.() ?? "", this.opts.roll ?? { resolve: () => null, open: () => undefined }));
      // A click on the card (not on its link) puts the caret in the block's text.
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at + 4, view.state.doc.length) } });
        view.focus();
      });
      return el;
    }
    if (b.kind === "statblock") {
      el.className = "cm-lp-block cm-lp-statblock";
      el.style.position = "relative";

      const edit = () => {
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at + 4, view.state.doc.length) } });
        view.focus();
      };
      const notePath = this.opts.notePath?.();
      const sb = this.opts.statblock;
      const dice = hasCapability("diceRolling");
      const card = renderStatblock(b.text, edit, {
        ...(notePath === undefined ? {} : { source: notePath }),
        key: notePath ?? "",
        ...(dice && sb?.die ? { dice: sb.die } : {}),
        rolls: dice,
        ...(b.nested ? {} : { write: (key: ValuePath, value: Value) => writeStatblock(view, el, b.text, key, value, sb?.refusal?.() ?? null) }),
      });
      el.append(card);
      return el;
    }
    if (b.kind === "pdf") {
      el.className = "cm-lp-block cm-lp-pdf-wrap";
      el.style.position = "relative";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "cm-lp-base-source";
      editBtn.textContent = "</>";
      editBtn.title = t.pdfEditLink;
      editBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const at = startOf(view, el);
        if (at === null) return;
        view.dispatch({ selection: { anchor: Math.min(at + 3, view.state.doc.length) } });
        view.focus();
      });
      el.append(editBtn);

      const mount = document.createElement("div");
      mount.className = "embed-pdf";
      el.append(mount);

      const stop = this.opts.pdf?.(b.text, mount);
      if (stop) bases.set(el, stop);
      return el;
    }
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
        th.style.position = "relative";
        const grip = document.createElement("div");
        grip.className = "table-col-grip";
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          grip.setPointerCapture(e.pointerId);
          const startX = e.clientX;
          const startWidth = th.offsetWidth;
          const onMove = (ev: PointerEvent) => {
            const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
            th.style.width = `${newWidth}px`;
            th.style.minWidth = `${newWidth}px`;
          };
          const onUp = (ev: PointerEvent) => {
            grip.removeEventListener("pointermove", onMove);
            grip.removeEventListener("pointerup", onUp);
            try { grip.releasePointerCapture(ev.pointerId); } catch {}
          };
          grip.addEventListener("pointermove", onMove);
          grip.addEventListener("pointerup", onUp);
        });
        th.append(grip);
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
      // Drawn as the reading view draws an embedded note: its frame
      // (`.embed-note`) inside the block, which takes the frame's margins
      // as padding — CodeMirror measures a block without its margins.
      const frame = document.createElement("div");
      frame.className = "embed-note";
      const title = document.createElement("div");
      title.className = "embed-note-title";
      title.textContent = b.text;
      frame.append(title);
      const body = document.createElement("div");
      // And its text as the reading view's (`.preview`), not the editor's.
      body.className = "cm-lp-embed-body embed-note-body preview";
      if (this.html === undefined) body.textContent = "…";
      else if (this.html === null) body.textContent = `![[${b.text}]]`;
      else body.innerHTML = this.html;
      frame.append(body);
      el.append(frame);

      if (this.opts.editEmbed && this.opts.canEditEmbed?.() !== false) {
        const labels = this.opts.embedLabels;
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "ghost iconic embed-edit";
        edit.title = labels?.edit ?? "";
        edit.append(icon("edit"));
        frame.append(edit);

        let teardown: (() => void) | undefined;
        const exit = () => {
          frame.classList.remove("editing");
          edit.replaceChildren(icon("edit"));
          edit.title = labels?.edit ?? "";
          teardown = undefined;
        };
        const start = (e?: Event) => {
          if (teardown) {
            teardown();
            return;
          }
          e?.stopPropagation();
          frame.classList.add("editing");
          edit.replaceChildren(icon("check"));
          edit.title = labels?.done ?? "";
          teardown = this.opts.editEmbed!(b.text, body, exit);
          // Refused (a note that cannot be edited here, the setting off):
          // the frame goes back to showing the note.
          if (!teardown) exit();
        };
        edit.addEventListener("click", start);
        body.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).closest("a, button, input, select, textarea, .card-editor")) return;
          if (teardown) return;
          start(e);
        });
        bases.set(el, () => {
          teardown?.();
        });
      }
    }
    // A click puts the caret at the block, which opens it as text.
    el.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest("a, .embed-edit, .embed-note-body")) return;
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
  override destroy(dom: HTMLElement): void {
    bases.get(dom)?.();
    bases.delete(dom);
  }
}

/** Display math and tables not under the caret, replaced by their rendering. */
export function foldBlocks(state: EditorState, opts: LiveOptions, blocks: Block[]): DecorationSet {
  const sel = state.selection.ranges;
  const touched = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  const fm = frontmatterEnd(state.doc);
  const ranges = [];
  if (fm >= 0) {
    const lines = state.doc.lineAt(fm).number - 2;
    ranges.push(Decoration.replace({ widget: new FrontmatterWidget(lines, opts.editFrontmatter, opts.frontmatterTitle?.(lines) ?? "") }).range(0, fm));
  }
  for (const b of blocks) {
    if (b.from <= fm) continue;
    // A table is edited as a table, the caret in it or not (ADR 0064).
    if (b.kind === "table" && b.editable && opts.table) {
      ranges.push(Decoration.replace({ widget: new TableEditor(b.text, opts.table, b.ordinal ?? 0), block: true }).range(b.from, b.to));
      continue;
    }
    const active = b.kind === "embed" && Boolean(opts.isEmbedActive?.(b.text));
    if (touched(b.from, b.to) && !active) continue;
    const html = b.kind === "embed" ? opts.noteHtml?.(b.text) : undefined;
    ranges.push(Decoration.replace({ widget: new BlockWidget(b, opts, html), block: true }).range(b.from, b.to));
  }
  return Decoration.set(ranges, true);
}
