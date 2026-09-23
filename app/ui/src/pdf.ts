// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A PDF reader on pdf.js: pages drawn as the scroll reaches them, a text
// layer for selection and search, zoom, a page box, a link to the page
// under the caret, and a quote of the selection into a companion note.
// The bytes come through the core's `verso://` protocol like any file.

import { GlobalWorkerOptions, TextLayer, getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
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
  of: string;
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  search: string;
  noHits: string;
  hits: (n: number, pages: number) => string;
  copyPageLink: string;
  quoteSelection: string;
  selectFirst: string;
  outline: string;
};

export type PdfOptions = {
  strings: PdfStrings;
  onCopyLink: (page: number) => void;
  onQuote: (page: number, text: string) => void;
  onStatus: (message: string) => void;
  onPage: (page: number, total: number) => void;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

type PageSlot = { el: HTMLElement; canvas: HTMLCanvasElement; text: HTMLElement; rendered: number; page: PDFPageProxy | null; rendering: boolean };

export class PdfView {
  readonly el = h("div", "pdf");
  readonly bar = h("div", "pdf-bar");
  readonly scroller = h("div", "pdf-scroll");
  readonly pageInput = h("input", "pdf-page");
  readonly total = h("span", "pdf-total");
  readonly searchInput = h("input", "pdf-search");
  readonly searchInfo = h("span", "pdf-search-info");
  private doc: PDFDocumentProxy | null = null;
  private task: PDFDocumentLoadingTask | null = null;
  private slots: PageSlot[] = [];
  private scale = 1;
  private fit = true;
  private observer: IntersectionObserver | null = null;
  private current = 1;
  private needle = "";
  private hitPages: number[] = [];
  private hitAt = -1;
  private texts = new Map<number, string>();
  private token = 0;
  private visible = new Set<number>();

  constructor(private readonly opts: PdfOptions) {
    const s = opts.strings;
    const btn = (ic: string, title: string, run: () => void) => {
      const b = h("button", "ghost iconic");
      b.type = "button";
      b.title = title;
      b.append(icon(ic, title));
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
    pages.append(btn("chevronUp", s.page, () => this.goTo(this.current - 1)), this.pageInput, this.total, btn("chevron", s.page, () => this.goTo(this.current + 1)));
    const zoom = h("span", "pdf-zoom");
    zoom.append(
      btn("zoomOut", s.zoomOut, () => this.setScale(this.scale / 1.2, false)),
      btn("zoomIn", s.zoomIn, () => this.setScale(this.scale * 1.2, false)),
      btn("fitWidth", s.fitWidth, () => this.setScale(this.fitScale(), true)),
    );
    this.searchInput.type = "search";
    this.searchInput.placeholder = s.search;
    this.searchInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") void this.search(this.searchInput.value, e.shiftKey ? -1 : 1);
      else if (e.key === "Escape") this.searchInput.blur();
    });
    const find = h("span", "pdf-find");
    find.append(icon("search"), this.searchInput, this.searchInfo);
    const acts = h("span", "pdf-acts");
    acts.append(btn("link", s.copyPageLink, () => opts.onCopyLink(this.current)), btn("quote", s.quoteSelection, () => this.quote()));
    this.bar.append(pages, zoom, find, acts);
    this.el.append(this.bar, this.scroller);
    this.scroller.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") this.goTo(this.current + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") this.goTo(this.current - 1);
    });
    this.scroller.tabIndex = 0;
    new ResizeObserver(() => {
      if (this.fit && this.doc) this.setScale(this.fitScale(), true);
    }).observe(this.scroller);
  }

  async load(url: string, page = 1): Promise<void> {
    const token = ++this.token;
    this.destroyDoc();
    // pdf.js only fetches http(s) itself; the bytes come through the
    // core's protocol here, then go in as data.
    let doc: PDFDocumentProxy;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = new Uint8Array(await res.arrayBuffer());
      if (token !== this.token) return;
      const task = getDocument({ data, cMapUrl: new URL("cmaps/", document.baseURI).href, cMapPacked: true, standardFontDataUrl: new URL("standard_fonts/", document.baseURI).href });
      this.task = task;
      doc = await task.promise;
      if (token !== this.token) return void task.destroy();
    } catch (e) {
      this.opts.onStatus(`PDF: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    this.doc = doc;
    this.total.textContent = `${this.opts.strings.of} ${doc.numPages}`;
    this.pageInput.max = String(doc.numPages);
    const first = await doc.getPage(1);
    const base = first.getViewport({ scale: 1 });
    this.scale = this.fit ? Math.max(0.3, (this.scroller.clientWidth - 48) / base.width) : this.scale;
    this.slots = [];
    this.scroller.replaceChildren();
    for (let n = 1; n <= doc.numPages; n++) {
      const el = h("div", "pdf-page");
      el.dataset["page"] = String(n);
      const canvas = h("canvas");
      const text = h("div", "textLayer");
      el.append(canvas, text);
      el.style.width = `${Math.floor(base.width * this.scale)}px`;
      el.style.height = `${Math.floor(base.height * this.scale)}px`;
      this.scroller.append(el);
      this.slots.push({ el, canvas, text, rendered: 0, page: n === 1 ? first : null, rendering: false });
    }
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset["page"]);
          if (e.isIntersecting) this.visible.add(n);
          else this.visible.delete(n);
          if (e.isIntersecting) void this.render(n);
          if (e.isIntersecting && e.intersectionRatio > 0.4) this.setCurrent(n);
        }
      },
      { root: this.scroller, rootMargin: "600px 0px", threshold: [0, 0.4] },
    );
    for (const s of this.slots) this.observer.observe(s.el);
    this.setCurrent(1);
    if (page > 1) this.goTo(page);
  }

  private fitScale(): number {
    const s = this.slots[0];
    if (!s?.page) return this.scale;
    return Math.max(0.3, (this.scroller.clientWidth - 48) / s.page.getViewport({ scale: 1 }).width);
  }

  private setCurrent(n: number): void {
    this.current = n;
    this.pageInput.value = String(n);
    this.opts.onPage(n, this.doc?.numPages ?? 0);
  }

  goTo(n: number): void {
    if (!this.doc) return;
    const p = Math.max(1, Math.min(this.doc.numPages, Math.round(n)));
    const slot = this.slots[p - 1];
    if (!slot) return;
    this.scroller.scrollTo({ top: slot.el.offsetTop - 12 });
    this.setCurrent(p);
    void this.render(p);
  }

  private async setScale(scale: number, fit: boolean): Promise<void> {
    if (!this.doc) return;
    const ratio = this.scroller.scrollTop / Math.max(1, this.scroller.scrollHeight);
    this.scale = Math.max(0.3, Math.min(5, scale));
    this.fit = fit;
    // Every page takes its new size at once; the drawn ones are cleared
    // so a stale bitmap never sits in a box of another size.
    const base = this.slots[0]?.page?.getViewport({ scale: 1 });
    for (const s of this.slots) {
      const v = s.page?.getViewport({ scale: this.scale });
      const w = v ? v.width : (base?.width ?? 600) * this.scale;
      const h = v ? v.height : (base?.height ?? 800) * this.scale;
      s.el.style.width = `${Math.floor(w)}px`;
      s.el.style.height = `${Math.floor(h)}px`;
      s.canvas.width = 0;
      s.canvas.height = 0;
      s.canvas.style.width = "";
      s.canvas.style.height = "";
      s.text.replaceChildren();
      s.rendered = 0;
    }
    this.scroller.scrollTop = ratio * this.scroller.scrollHeight;
    for (const n of [this.current, ...this.visible]) void this.render(n);
  }

  private async render(n: number): Promise<void> {
    const doc = this.doc;
    const slot = this.slots[n - 1];
    if (!doc || !slot || slot.rendering || slot.rendered === this.scale) return;
    slot.rendering = true;
    const token = this.token;
    const wanted = this.scale;
    try {
      const page = slot.page ?? (await doc.getPage(n));
      slot.page = page;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: this.scale });
      slot.canvas.width = Math.floor(viewport.width * dpr);
      slot.canvas.height = Math.floor(viewport.height * dpr);
      slot.canvas.style.width = `${Math.floor(viewport.width)}px`;
      slot.canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = slot.canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvas: slot.canvas, canvasContext: ctx, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
      if (token !== this.token) return;
      slot.text.replaceChildren();
      slot.el.style.setProperty("--scale-factor", String(viewport.scale));
      slot.el.style.setProperty("--total-scale-factor", String(viewport.scale));
      await new TextLayer({ textContentSource: page.streamTextContent(), container: slot.text, viewport }).render();
      slot.rendered = wanted;
      if (this.needle) this.highlight(slot);
    } catch (e) {
      this.opts.onStatus(`PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      slot.rendering = false;
    }
    // The scale moved while this page was drawing: draw it again.
    if (token === this.token && this.scale !== wanted && this.visible.has(n)) void this.render(n);
  }

  private async pageText(n: number): Promise<string> {
    const cached = this.texts.get(n);
    if (cached !== undefined) return cached;
    const doc = this.doc;
    if (!doc) return "";
    const slot = this.slots[n - 1];
    const page = slot?.page ?? (await doc.getPage(n));
    if (slot) slot.page = page;
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    this.texts.set(n, text);
    return text;
  }

  async search(needle: string, dir: 1 | -1): Promise<void> {
    try {
      await this.doSearch(needle, dir);
    } catch (e) {
      this.searchInfo.textContent = "";
      this.opts.onStatus(`PDF: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  private async doSearch(needle: string, dir: 1 | -1): Promise<void> {
    const s = this.opts.strings;
    if (!this.doc) return;
    this.searchInfo.textContent = "…";
    const q = needle.trim().toLowerCase();
    if (q !== this.needle) {
      this.needle = q;
      this.hitPages = [];
      this.hitAt = -1;
      for (const slot of this.slots) for (const el of slot.text.querySelectorAll(".hit")) el.classList.remove("hit");
      if (!q) {
        this.searchInfo.textContent = "";
        return;
      }
      let total = 0;
      for (let n = 1; n <= this.doc.numPages; n++) {
        const text = (await this.pageText(n)).toLowerCase();
        let i = text.indexOf(q);
        let count = 0;
        while (i >= 0) {
          count++;
          i = text.indexOf(q, i + q.length);
        }
        if (count > 0) {
          this.hitPages.push(n);
          total += count;
        }
      }
      this.searchInfo.textContent = total === 0 ? s.noHits : s.hits(total, this.hitPages.length);
      for (const slot of this.slots) if (slot.rendered) this.highlight(slot);
    }
    if (this.hitPages.length === 0) return;
    this.hitAt = (this.hitAt + dir + this.hitPages.length) % this.hitPages.length;
    this.goTo(this.hitPages[this.hitAt] ?? 1);
  }

  private highlight(slot: PageSlot): void {
    const q = this.needle;
    for (const span of slot.text.querySelectorAll<HTMLElement>("span")) {
      span.classList.toggle("hit", q !== "" && (span.textContent ?? "").toLowerCase().includes(q));
    }
  }

  private quote(): void {
    const sel = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!sel) return this.opts.onStatus(this.opts.strings.selectFirst);
    this.opts.onQuote(this.current, sel);
  }

  get page(): number {
    return this.current;
  }

  private destroyDoc(): void {
    this.observer?.disconnect();
    this.observer = null;
    void this.task?.destroy();
    this.task = null;
    this.doc = null;
    this.slots = [];
    this.texts.clear();
    this.needle = "";
    this.hitPages = [];
  }

  destroy(): void {
    this.token++;
    this.destroyDoc();
  }
}
