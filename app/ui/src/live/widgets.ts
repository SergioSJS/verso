// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Live Preview's inline widgets (split out of ../live.ts, ADR 0067).

import { EditorView, WidgetType } from "@codemirror/view";
import { icon } from "../icons";
import { fitWhenSizeless } from "../imageFit";
import { imageLink, webFrame } from "../sanitize";

/** Where a widget's range starts now. CodeMirror keeps a widget's DOM while
 *  `eq` holds, across edits elsewhere, so a position taken when it was
 *  drawn goes stale: it is read from the DOM when the event comes. */
export function startOf(view: EditorView, dom: HTMLElement): number | null {
  return dom.isConnected ? view.posAtDOM(dom) : null;
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width: number | null,
    readonly height: number | null = null,
  ) {
    super();
  }
  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.width === this.width && other.height === this.height;
  }
  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = "cm-lp-image-box";
    const img = document.createElement("img");
    img.className = "cm-lp-image";
    img.src = this.src;
    img.alt = this.alt;
    if (this.width) img.style.width = `${this.width}px`;
    if (this.height) img.style.height = `${this.height}px`;
    fitWhenSizeless(img, box);
    const grip = document.createElement("span");
    grip.className = "cm-lp-grip";
    grip.title = "⤡";
    // Dragging the corner rewrites the size in the source (width and height).
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const rect = img.getBoundingClientRect();
      const w0 = rect.width;
      const h0 = rect.height;
      let w = Math.round(w0);
      let h = Math.round(h0);
      const badge = document.createElement("span");
      badge.className = "cm-lp-size";
      badge.textContent = `${w} × ${h} px`;
      box.append(badge);
      const move = (ev: PointerEvent) => {
        w = Math.max(40, Math.round(w0 + (ev.clientX - x0)));
        h = Math.max(40, Math.round(h0 + (ev.clientY - y0)));
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        badge.textContent = `${w} × ${h} px`;
      };
      const up = (ev: PointerEvent) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        badge.remove();
        try { grip.releasePointerCapture(ev.pointerId); } catch {}
        // The embed as the document has it now, at the widget's place.
        const at = startOf(view, box);
        if (at === null) return;
        const line = view.state.doc.lineAt(at);
        const restOfLine = view.state.sliceDoc(at, line.to);

        // 1. Wikilink embed: ![[target]] or ![[target|300]] or ![[target|300x200]]
        const mWiki = /^!\[\[([^\]\n]+)\]\]/.exec(restOfLine);
        if (mWiki) {
          const target = (mWiki[1] ?? "").split("|")[0] ?? "";
          view.dispatch({ changes: { from: at, to: at + mWiki[0].length, insert: `![[${target}|${w}x${h}]]` } });
          return;
        }

        // 2. Markdown image: ![alt](url) or ![alt|size](url)
        const mMd = /^!\[([^\]\n]*)\]\(([^)\n]+)\)/.exec(restOfLine);
        if (mMd) {
          const rawAlt = mMd[1] ?? "";
          const url = mMd[2] ?? "";
          const baseAlt = rawAlt.split("|")[0] ?? "";
          const newAlt = baseAlt ? `${baseAlt}|${w}x${h}` : `${w}x${h}`;
          view.dispatch({ changes: { from: at, to: at + mMd[0].length, insert: `![${newAlt}](${url})` } });
        }
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

/** A web image while remote content is off: the link the reading view
 *  draws in its place, nothing fetched. A click opens it in the browser
 *  (the window's link guard); the source is not revealed. */
export class HeldImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  override eq(other: HeldImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }
  override toDOM(): HTMLElement {
    return imageLink(document, this.src, this.alt);
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }
  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }
  override toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-lp-task-check";
    input.checked = this.checked;
    input.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = !this.checked;
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: next ? "[x]" : "[ ]" },
        userEvent: "input",
      });
    });
    return input;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

export class CodeCopyWidget extends WidgetType {
  constructor(readonly code: string, readonly labels: { copy: string; copied: string }) {
    super();
  }
  override eq(other: CodeCopyWidget): boolean {
    return other.code === this.code && other.labels.copy === this.labels.copy;
  }
  override toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-lp-copy-code";
    btn.title = this.labels.copy;
    btn.setAttribute("aria-label", this.labels.copy);
    btn.append(icon("copy"));
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(this.code).then(() => {
        btn.replaceChildren(icon("check"));
        btn.title = this.labels.copied;
        setTimeout(() => {
          btn.replaceChildren(icon("copy"));
          btn.title = this.labels.copy;
        }, 1500);
      });
    });
    return btn;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}


/** "View as diagram" on a fenced block of structured data (ADR 0106). */
export class DiagramButtonWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly lang: string,
    readonly label: string,
    readonly open: (lang: string, text: string) => void,
  ) {
    super();
  }
  override eq(other: DiagramButtonWidget): boolean {
    return other.code === this.code && other.lang === this.lang && other.label === this.label;
  }
  override toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cm-lp-copy-code cm-lp-diagram-btn";
    btn.title = this.label;
    btn.setAttribute("aria-label", this.label);
    btn.dataset["action"] = "view-diagram";
    btn.append(icon("diagram"));
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.open(this.lang, this.code);
    });
    return btn;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The folded frontmatter: a hint that properties live above. */
export class FrontmatterWidget extends WidgetType {
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

/** Rendered iframe in Live Preview when cursor is outside the HTML block. */
export class IframeWidget extends WidgetType {
  constructor(readonly src: string, readonly styleStr: string, readonly width: string, readonly height: string) {
    super();
  }
  override eq(other: IframeWidget): boolean {
    return other.src === this.src && other.styleStr === this.styleStr && other.width === this.width && other.height === this.height;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-block cm-lp-iframe-wrap";
    // Only web addresses reach here (see the HTMLBlock branch): loaded
    // directly, sandboxed, and asked first on each origin's first embed
    // or when remote content is off — as in the reading view.
    wrap.append(webFrame(this.src, this.width, this.height, this.styleStr));
    return wrap;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}
