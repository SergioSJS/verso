// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A PDF reader on pdf.js's own viewer components: pages, text layer,
// zoom, find. Ours around it: the bar, a link to a page or to a selected
// passage (`#page=N&selection=a,b,c,d`, as Obsidian writes it), and the
// passages already quoted into the companion note painted on the page.
// The bytes come through the core's `verso://` protocol like any file.

import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { icon } from "./icons";

GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", document.baseURI).href;

// WebKit has no async iteration over ReadableStream, which pdf.js uses to
// read a page's text. The same loop, spelled out.
type AsyncIterableStream = ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };
const proto = ReadableStream.prototype as AsyncIterableStream;
if (!proto[Symbol.asyncIterator]) {
  const iterate = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  Object.defineProperty(proto, Symbol.asyncIterator, { value: iterate, writable: true, configurable: true });
  if (!proto.values) Object.defineProperty(proto, "values", { value: iterate, writable: true, configurable: true });
}

export type PdfStrings = {
  page: string;
  prevPage: string;
  nextPage: string;
  of: string;
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  fitPage: string;
  search: string;
  noHits: string;
  hits: (n: number, current: number) => string;
  copyPageLink: string;
  quoteSelection: string;
  selectFirst: string;
  /** The PDF could not be read; pdf.js's or the HTTP status's own text
   *  follows as the detail. */
  loadFailed: string;
};

/** A passage: page, then start span/offset and end span/offset in the
 *  page's text layer — Obsidian's `selection=` numbers. */
export type Passage = { page: number; s: [number, number, number, number] };

export type PdfOptions = {
  strings: PdfStrings;
  onCopyLink: (fragment: string) => void;
  onQuote: (fragment: string, page: number, text: string) => void;
  onStatus: (message: string) => void;
  onPage: (page: number, total: number) => void;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The text spans of a page's text layer, in reading order. */
function spansOf(layer: Element): HTMLElement[] {
  return Array.from(layer.querySelectorAll<HTMLElement>(":scope > span, :scope > br")).filter((e) => e.tagName === "SPAN");
}

export class PdfView {
  readonly el = h("div", "pdf");
  readonly bar = h("div", "pdf-bar");
  readonly body = h("div", "pdf-body");
  readonly container = h("div", "pdf-scroll");
  readonly pageInput = h("input", "pdf-page");
  readonly total = h("span", "pdf-total");
  readonly searchInput = h("input", "pdf-search");
  readonly searchInfo = h("span", "pdf-search-info");
  private readonly eventBus = new EventBus();
  private readonly linkService: PDFLinkService;
  private readonly findController: PDFFindController;
  private readonly viewer: PDFViewer;
  private task: PDFDocumentLoadingTask | null = null;
  private doc: PDFDocumentProxy | null = null;
  private token = 0;
  private passages: Passage[] = [];
  private pendingPage = 1;
  private fitMode: "page-width" | "page-fit" | null = "page-width";

  constructor(private readonly opts: PdfOptions) {
    const s = opts.strings;
    const btn = (ic: string, title: string, run: () => void) => {
      const b = h("button", "ghost iconic");
      b.type = "button";
      b.title = title;
      b.append(icon(ic, title));
      // The click must not steal the selection the action is about.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", run);
      return b;
    };
    this.pageInput.type = "number";
    this.pageInput.min = "1";
    this.pageInput.setAttribute("aria-label", s.page);
    this.pageInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") this.goTo(Number(this.pageInput.value));
    });
    const pages = h("span", "pdf-pages");
    pages.append(btn("chevronUp", s.prevPage, () => this.goTo(this.page - 1)), this.pageInput, this.total, btn("chevron", s.nextPage, () => this.goTo(this.page + 1)));
    const zoom = h("span", "pdf-zoom");
    zoom.append(
      btn("zoomOut", s.zoomOut, () => this.zoom(1 / 1.2)),
      btn("zoomIn", s.zoomIn, () => this.zoom(1.2)),
      btn("fitWidth", s.fitWidth, () => this.fit("page-width")),
      btn("fitPage", s.fitPage, () => this.fit("page-fit")),
    );
    this.searchInput.type = "search";
    this.searchInput.placeholder = s.search;
    this.searchInput.setAttribute("aria-label", s.search);
    this.searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") this.find(this.searchInput.value, e.shiftKey);
      else if (e.key === "Escape") this.searchInput.blur();
    });
    this.searchInput.addEventListener("input", () => {
      if (this.searchInput.value === "") this.find("", false);
    });
    // "3 of 10", "Nothing found": announced as they change.
    this.searchInfo.setAttribute("role", "status");
    const find = h("span", "pdf-find");
    find.append(icon("search"), this.searchInput, this.searchInfo);
    const acts = h("span", "pdf-acts");
    acts.append(btn("link", s.copyPageLink, () => opts.onCopyLink(this.fragment())), btn("quote", s.quoteSelection, () => this.quote()));
    this.bar.append(pages, zoom, find, acts);
    // The pages: a region named after the file (by the caller), in the
    // Tab order, so that the arrows and Page Down scroll them.
    this.container.tabIndex = 0;
    this.container.setAttribute("role", "region");
    this.container.append(h("div", "pdfViewer"));
    this.body.append(this.container);
    this.el.append(this.bar, this.body);

    this.linkService = new PDFLinkService({ eventBus: this.eventBus });
    this.findController = new PDFFindController({ eventBus: this.eventBus, linkService: this.linkService });
    this.viewer = new PDFViewer({
      container: this.container,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      removePageBorders: true,
    });
    this.linkService.setViewer(this.viewer);
    this.eventBus.on("pagesinit", () => {
      this.viewer.currentScaleValue = this.fitMode ?? "page-width";
      if (this.pendingPage > 1) this.viewer.currentPageNumber = this.pendingPage;
      this.setCurrent(this.viewer.currentPageNumber);
    });
    this.eventBus.on("pagechanging", (e: { pageNumber: number }) => this.setCurrent(e.pageNumber));
    this.eventBus.on("textlayerrendered", (e: { pageNumber: number }) => this.paintPassages(e.pageNumber));
    this.eventBus.on("updatefindmatchescount", (e: { matchesCount: { current: number; total: number } }) => {
      this.searchInfo.textContent = e.matchesCount.total === 0 ? s.noHits : s.hits(e.matchesCount.total, e.matchesCount.current);
    });
    this.eventBus.on("updatefindcontrolstate", (e: { matchesCount: { current: number; total: number }; state: number }) => {
      // state 1 = not found, 3 = pending
      if (e.state === 1) this.searchInfo.textContent = s.noHits;
      else if (e.state !== 3) this.searchInfo.textContent = e.matchesCount.total === 0 ? "" : s.hits(e.matchesCount.total, e.matchesCount.current);
    });
    new ResizeObserver(() => {
      if (this.doc && this.fitMode) this.viewer.currentScaleValue = this.fitMode;
    }).observe(this.container);
  }

  async load(url: string, page = 1): Promise<void> {
    const token = ++this.token;
    this.pendingPage = page;
    this.destroyDoc();
    try {
      // pdf.js only fetches http(s) itself; the bytes come through the
      // core's protocol here, then go in as data.
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = new Uint8Array(await res.arrayBuffer());
      if (token !== this.token) return;
      const task = getDocument({ data, cMapUrl: new URL("cmaps/", document.baseURI).href, cMapPacked: true, standardFontDataUrl: new URL("standard_fonts/", document.baseURI).href });
      this.task = task;
      const doc = await task.promise;
      if (token !== this.token) return void task.destroy();
      this.doc = doc;
      this.total.textContent = `${this.opts.strings.of} ${doc.numPages}`;
      this.pageInput.max = String(doc.numPages);
      this.viewer.setDocument(doc);
      this.linkService.setDocument(doc, null);
    } catch (e) {
      this.opts.onStatus(`${this.opts.strings.loadFailed} (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  /** Passages already quoted, to paint on their pages. */
  setPassages(list: Passage[]): void {
    this.passages = list;
    if (!this.doc) return;
    for (let n = 1; n <= this.doc.numPages; n++) this.paintPassages(n);
  }

  get page(): number {
    return this.viewer.currentPageNumber || 1;
  }

  private setCurrent(n: number): void {
    this.pageInput.value = String(n);
    this.opts.onPage(n, this.doc?.numPages ?? 0);
  }

  goTo(n: number): void {
    if (!this.doc) return;
    this.viewer.currentPageNumber = Math.max(1, Math.min(this.doc.numPages, Math.round(n)));
  }

  private zoom(factor: number): void {
    if (!this.doc) return;
    this.fitMode = null;
    this.viewer.currentScale = Math.max(0.25, Math.min(6, this.viewer.currentScale * factor));
  }

  private fit(mode: "page-width" | "page-fit"): void {
    this.fitMode = mode;
    if (this.doc) this.viewer.currentScaleValue = mode;
  }

  find(query: string, previous: boolean): void {
    if (!this.doc) return;
    if (query.trim() === "") {
      this.searchInfo.textContent = "";
      this.eventBus.dispatch("findbarclose", { source: this });
      return;
    }
    // "again", as pdf.js's own find bar sends on Enter: the same query moves
    // to the next (or previous) hit, a new one starts over. An empty type
    // is "the query changed" to pdf.js, which then goes back to the first.
    this.eventBus.dispatch("find", {
      source: this,
      type: "again",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  }

  /** `page=N`, plus `&selection=a,b,c,d` when text is selected on a page. */
  private fragment(): string {
    const sel = this.selection();
    return sel ? `page=${sel.page}&selection=${sel.s.join(",")}` : `page=${this.page}`;
  }

  /** The current selection as a passage, or null when it is not on a page. */
  private selection(): (Passage & { text: string }) | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const layer = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest(".textLayer");
    if (!layer) return null;
    const pageEl = layer.closest<HTMLElement>(".page");
    const page = Number(pageEl?.dataset["pageNumber"] ?? "0");
    if (!page) return null;
    const spans = spansOf(layer);
    const locate = (node: Node, offset: number): [number, number] | null => {
      const span = (node instanceof Element ? node : node.parentElement)?.closest("span");
      if (!span) return null;
      const i = spans.indexOf(span as HTMLElement);
      return i < 0 ? null : [i, node.nodeType === Node.TEXT_NODE ? offset : 0];
    };
    const a = locate(range.startContainer, range.startOffset);
    const b = locate(range.endContainer, range.endOffset);
    if (!a || !b) return null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return { page, s: [a[0], a[1], b[0], b[1]], text };
  }

  private quote(): void {
    const sel = this.selection();
    if (!sel || !sel.text) return this.opts.onStatus(this.opts.strings.selectFirst);
    this.opts.onQuote(`page=${sel.page}&selection=${sel.s.join(",")}`, sel.page, sel.text);
  }

  /** The quoted passages of a page as a CSS highlight over its text layer. */
  private paintPassages(pageNumber: number): void {
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!highlights || !HighlightCtor) return;
    const pageEl = this.container.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"] .textLayer`);
    if (!pageEl) return;
    const spans = spansOf(pageEl);
    const ranges: Range[] = [];
    for (const p of this.passages) {
      if (p.page !== pageNumber) continue;
      const [si, so, ei, eo] = p.s;
      const start = spans[si]?.firstChild;
      const end = spans[ei]?.firstChild;
      if (!start || !end) continue;
      try {
        const r = document.createRange();
        r.setStart(start, Math.min(so, start.textContent?.length ?? 0));
        r.setEnd(end, Math.min(eo, end.textContent?.length ?? 0));
        ranges.push(r);
      } catch {
        // A passage the text layer no longer matches: skipped.
      }
    }
    const key = `verso-quote-${pageNumber}`;
    if (ranges.length === 0) highlights.delete(key);
    else highlights.set(key, new HighlightCtor(...ranges));
  }

  private destroyDoc(): void {
    void this.task?.destroy();
    this.task = null;
    this.doc = null;
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (highlights) for (const k of Array.from(highlights.keys())) if (k.startsWith("verso-quote-")) highlights.delete(k);
  }

  destroy(): void {
    this.token++;
    this.destroyDoc();
    this.viewer.cleanup();
  }
}
