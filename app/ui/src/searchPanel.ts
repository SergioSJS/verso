// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  findNext,
  findPrevious,
  selectMatches,
  replaceNext,
  replaceAll,
  closeSearchPanel,
  getSearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { icon } from "./icons";
import { LOCALE } from "./strings";

export interface SearchStrings {
  find: string;
  replace: string;
  next: string;
  previous: string;
  all: string;
  matchCase: string;
  byWord: string;
  regexp: string;
  replaceOne: string;
  replaceAll: string;
  close: string;
  noHits: string;
  hits: (current: number, total: number) => string;
  toggleReplace: string;
  badRegex: string;
}

const PT_SEARCH: SearchStrings = {
  find: "Localizar…",
  replace: "Substituir…",
  next: "Próxima (Enter)",
  previous: "Anterior (Shift+Enter)",
  all: "Selecionar todas as ocorrências",
  matchCase: "Diferenciar maiúsculas/minúsculas (Alt+C)",
  byWord: "Palavra inteira (Alt+W)",
  regexp: "Expressão regular (Alt+R)",
  replaceOne: "Substituir",
  replaceAll: "Todas",
  close: "Fechar (Esc)",
  noHits: "Nenhum resultado",
  hits: (cur, tot) => `${cur} de ${tot}`,
  toggleReplace: "Alternar substituição",
  badRegex: "Regex inválido",
};

const EN_SEARCH: SearchStrings = {
  find: "Find…",
  replace: "Replace…",
  next: "Next (Enter)",
  previous: "Previous (Shift+Enter)",
  all: "Select all matches",
  matchCase: "Match case (Alt+C)",
  byWord: "Whole word (Alt+W)",
  regexp: "Regular expression (Alt+R)",
  replaceOne: "Replace",
  replaceAll: "All",
  close: "Close (Esc)",
  noHits: "No results",
  hits: (cur, tot) => `${cur} of ${tot}`,
  toggleReplace: "Toggle replace",
  badRegex: "Invalid regex",
};

/** The in-note search panel's words, in the window's language (ADR 0035). */
export function searchStrings(): SearchStrings {
  return LOCALE.startsWith("pt") ? PT_SEARCH : EN_SEARCH;
}

function createBtn(
  className: string,
  title: string,
  content: HTMLElement | SVGSVGElement | string,
  onClick: () => void
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.title = title;
  b.setAttribute("aria-label", title);
  if (typeof content === "string") {
    b.textContent = content;
  } else {
    b.appendChild(content);
  }
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

function createToggleBtn(title: string, label: string, onClick: (pressed: boolean) => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "verso-search-toggle";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.setAttribute("aria-pressed", "false");
  const span = document.createElement("span");
  span.textContent = label;
  b.appendChild(span);
  b.addEventListener("click", (e) => {
    e.preventDefault();
    const pressed = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(pressed));
    onClick(pressed);
  });
  return b;
}

function countMatches(view: EditorView, query: SearchQuery): { total: number; current: number } {
  if (!query.valid || !query.search) return { total: 0, current: 0 };
  let total = 0;
  let current = 0;
  const sel = view.state.selection.main;
  try {
    const cursor = query.getCursor(view.state.doc);
    while (true) {
      const match = cursor.next();
      if (match.done || !match.value) break;
      total++;
      if (match.value.from === sel.from && match.value.to === sel.to) {
        current = total;
      }
      if (total >= 5000) break;
    }
  } catch {
    return { total: 0, current: 0 };
  }
  return { total, current };
}

/**
 * Modern, icon-rich search panel for CodeMirror (Live Preview and Source mode).
 */
export class CustomSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly view: EditorView;
  private readonly strings: SearchStrings;
  private query: SearchQuery;
  private searchInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private countBadge: HTMLElement;
  private caseBtn: HTMLButtonElement;
  private wordBtn: HTMLButtonElement;
  private regexBtn: HTMLButtonElement;
  private replaceToggleBtn: HTMLButtonElement;
  private replaceRow: HTMLElement;
  private isCommitting = false;

  constructor(view: EditorView, strings: SearchStrings) {
    this.view = view;
    this.strings = strings;
    this.query = getSearchQuery(view.state);

    this.dom = document.createElement("div");
    this.dom.className = "verso-search-bar cm-search";

    // Row 1: Search
    const searchRow = document.createElement("div");
    searchRow.className = "verso-search-row";

    const inputWrap = document.createElement("div");
    inputWrap.className = "verso-search-input-wrap";

    const searchIc = icon("search");
    searchIc.classList.add("search-icon");

    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.className = "verso-search-input";
    this.searchInput.placeholder = strings.find;
    this.searchInput.value = this.query.search;
    this.searchInput.setAttribute("main-field", "true");
    this.searchInput.setAttribute("aria-label", strings.find);

    this.countBadge = document.createElement("span");
    this.countBadge.className = "verso-search-count";

    inputWrap.append(searchIc, this.searchInput, this.countBadge);

    const actions = document.createElement("div");
    actions.className = "verso-search-actions";

    const prevBtn = createBtn("verso-search-btn", strings.previous, icon("chevronUp"), () => {
      findPrevious(this.view);
      this.updateCount();
    });

    const nextBtn = createBtn("verso-search-btn", strings.next, icon("chevronDown"), () => {
      findNext(this.view);
      this.updateCount();
    });

    this.caseBtn = createToggleBtn(strings.matchCase, "Aa", () => this.commit());
    this.caseBtn.setAttribute("aria-pressed", String(this.query.caseSensitive));

    this.wordBtn = createToggleBtn(strings.byWord, "\\b", () => this.commit());
    this.wordBtn.setAttribute("aria-pressed", String(this.query.wholeWord));

    this.regexBtn = createToggleBtn(strings.regexp, ".*", () => this.commit());
    this.regexBtn.setAttribute("aria-pressed", String(this.query.regexp));

    const selectBtn = createBtn("verso-search-btn", strings.all, icon("check"), () => {
      selectMatches(this.view);
    });

    const hasReplace = Boolean(this.query.replace);
    this.replaceToggleBtn = createBtn("verso-search-toggle", strings.toggleReplace, icon("replace"), () => {
      const open = this.replaceRow.hidden;
      this.replaceRow.hidden = !open;
      this.replaceToggleBtn.setAttribute("aria-pressed", String(open));
      if (open) {
        this.replaceInput.focus();
        this.replaceInput.select();
      } else {
        this.searchInput.focus();
      }
    });
    this.replaceToggleBtn.setAttribute("aria-pressed", String(hasReplace));

    const closeBtn = createBtn("verso-search-btn verso-search-close", strings.close, icon("close"), () => {
      closeSearchPanel(this.view);
      this.view.focus();
    });

    actions.append(
      prevBtn,
      nextBtn,
      this.caseBtn,
      this.wordBtn,
      this.regexBtn,
      selectBtn,
      this.replaceToggleBtn,
      closeBtn,
    );

    searchRow.append(inputWrap, actions);

    // Row 2: Replace
    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "verso-replace-row";
    this.replaceRow.hidden = !hasReplace;

    const replaceWrap = document.createElement("div");
    replaceWrap.className = "verso-search-input-wrap";

    const replaceIc = icon("replace");
    replaceIc.classList.add("search-icon");

    this.replaceInput = document.createElement("input");
    this.replaceInput.type = "text";
    this.replaceInput.className = "verso-replace-input";
    this.replaceInput.placeholder = strings.replace;
    this.replaceInput.value = this.query.replace;
    this.replaceInput.setAttribute("aria-label", strings.replace);

    replaceWrap.append(replaceIc, this.replaceInput);

    const replaceActions = document.createElement("div");
    replaceActions.className = "verso-search-actions";

    const replaceBtn = createBtn("verso-search-text-btn", strings.replaceOne, strings.replaceOne, () => {
      replaceNext(this.view);
      this.updateCount();
    });

    const replaceAllBtn = createBtn("verso-search-text-btn", strings.replaceAll, strings.replaceAll, () => {
      replaceAll(this.view);
      this.updateCount();
    });

    replaceActions.append(replaceBtn, replaceAllBtn);
    this.replaceRow.append(replaceWrap, replaceActions);

    this.dom.append(searchRow, this.replaceRow);

    this.searchInput.addEventListener("input", () => this.commit());
    this.replaceInput.addEventListener("input", () => this.commit());
    this.dom.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  private commit(): void {
    if (this.isCommitting) return;
    this.isCommitting = true;
    try {
      const q = new SearchQuery({
        search: this.searchInput.value,
        caseSensitive: this.caseBtn.getAttribute("aria-pressed") === "true",
        wholeWord: this.wordBtn.getAttribute("aria-pressed") === "true",
        regexp: this.regexBtn.getAttribute("aria-pressed") === "true",
        replace: this.replaceInput.value,
      });
      if (!q.eq(this.query)) {
        this.query = q;
        this.view.dispatch({ effects: setSearchQuery.of(q) });
      }
      this.updateCount();
    } finally {
      this.isCommitting = false;
    }
  }

  private updateCount(): void {
    if (!this.query.valid || !this.query.search) {
      this.countBadge.textContent = "";
      this.countBadge.classList.remove("no-hits");
      return;
    }
    const { total, current } = countMatches(this.view, this.query);
    if (total === 0) {
      this.countBadge.textContent = this.strings.noHits;
      this.countBadge.classList.add("no-hits");
    } else {
      this.countBadge.classList.remove("no-hits");
      this.countBadge.textContent = current > 0 ? this.strings.hits(current, total) : `${total}`;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(this.view);
      this.view.focus();
      return;
    }
    if (e.altKey && e.code === "KeyC") {
      e.preventDefault();
      const pressed = this.caseBtn.getAttribute("aria-pressed") !== "true";
      this.caseBtn.setAttribute("aria-pressed", String(pressed));
      this.commit();
      return;
    }
    if (e.altKey && e.code === "KeyW") {
      e.preventDefault();
      const pressed = this.wordBtn.getAttribute("aria-pressed") !== "true";
      this.wordBtn.setAttribute("aria-pressed", String(pressed));
      this.commit();
      return;
    }
    if (e.altKey && e.code === "KeyR") {
      e.preventDefault();
      const pressed = this.regexBtn.getAttribute("aria-pressed") !== "true";
      this.regexBtn.setAttribute("aria-pressed", String(pressed));
      this.commit();
      return;
    }
    if (e.key === "Enter" && e.target === this.searchInput) {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious(this.view);
      } else {
        findNext(this.view);
      }
      this.updateCount();
      return;
    }
    if (e.key === "Enter" && e.target === this.replaceInput) {
      e.preventDefault();
      if (e.altKey) {
        replaceAll(this.view);
      } else {
        replaceNext(this.view);
      }
      this.updateCount();
      return;
    }
  }

  update(update: ViewUpdate): void {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.query = effect.value;
          if (this.searchInput.value !== this.query.search) {
            this.searchInput.value = this.query.search;
          }
          if (this.replaceInput.value !== this.query.replace) {
            this.replaceInput.value = this.query.replace;
          }
          this.caseBtn.setAttribute("aria-pressed", String(this.query.caseSensitive));
          this.wordBtn.setAttribute("aria-pressed", String(this.query.wholeWord));
          this.regexBtn.setAttribute("aria-pressed", String(this.query.regexp));
        }
      }
    }
    if (update.docChanged || update.selectionSet) {
      this.updateCount();
    }
  }

  mount(): void {
    this.searchInput.focus();
    this.searchInput.select();
    this.updateCount();
  }
}

const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
const cssHighlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;

export function applyReadingHighlights(ranges: Range[], activeIndex: number): void {
  if (cssHighlights && HighlightCtor) {
    cssHighlights.set("verso-search-match", new HighlightCtor(...ranges));
    if (ranges[activeIndex]) {
      cssHighlights.set("verso-search-active", new HighlightCtor(ranges[activeIndex]));
    } else {
      cssHighlights.delete("verso-search-active");
    }
  }
}

export function clearReadingHighlights(): void {
  if (cssHighlights) {
    cssHighlights.delete("verso-search-match");
    cssHighlights.delete("verso-search-active");
  }
}

/**
 * In-text search bar and highlighter for Reading Mode.
 */
export class ReadingSearch {
  readonly el: HTMLElement;
  private readonly host: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly strings: SearchStrings;
  private readonly searchInput: HTMLInputElement;
  private readonly countBadge: HTMLElement;
  private readonly caseBtn: HTMLButtonElement;
  private readonly wordBtn: HTMLButtonElement;
  private readonly regexBtn: HTMLButtonElement;
  private matchRanges: Range[] = [];
  private currentIndex = 0;
  private _isOpen = false;

  get isOpen(): boolean {
    return this._isOpen;
  }

  getQuery(): string {
    return this.searchInput.value;
  }

  constructor(host: HTMLElement, preview: HTMLElement, strings: SearchStrings) {
    this.host = host;
    this.preview = preview;
    this.strings = strings;

    this.el = document.createElement("div");
    this.el.className = "verso-reading-search";

    const searchRow = document.createElement("div");
    searchRow.className = "verso-search-row";

    const inputWrap = document.createElement("div");
    inputWrap.className = "verso-search-input-wrap";

    const searchIc = icon("search");
    searchIc.classList.add("search-icon");

    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.className = "verso-search-input";
    this.searchInput.placeholder = strings.find;
    this.searchInput.setAttribute("aria-label", strings.find);

    this.countBadge = document.createElement("span");
    this.countBadge.className = "verso-search-count";

    inputWrap.append(searchIc, this.searchInput, this.countBadge);

    const actions = document.createElement("div");
    actions.className = "verso-search-actions";

    const prevBtn = createBtn("verso-search-btn", strings.previous, icon("chevronUp"), () => this.prev());
    const nextBtn = createBtn("verso-search-btn", strings.next, icon("chevronDown"), () => this.next());

    this.caseBtn = createToggleBtn(strings.matchCase, "Aa", () => this.find());
    this.wordBtn = createToggleBtn(strings.byWord, "\\b", () => this.find());
    this.regexBtn = createToggleBtn(strings.regexp, ".*", () => this.find());

    const closeBtn = createBtn("verso-search-btn verso-search-close", strings.close, icon("close"), () => this.close());

    actions.append(prevBtn, nextBtn, this.caseBtn, this.wordBtn, this.regexBtn, closeBtn);
    searchRow.append(inputWrap, actions);
    this.el.append(searchRow);

    this.searchInput.addEventListener("input", () => this.find());
    this.el.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  open(initialQuery?: string): void {
    if (!this.el.parentElement) {
      this.host.insertBefore(this.el, this.preview);
    }
    this.el.hidden = false;
    this._isOpen = true;
    if (initialQuery !== undefined) {
      this.searchInput.value = initialQuery;
    }
    this.searchInput.focus();
    this.searchInput.select();
    this.find();
  }

  close(): void {
    this._isOpen = false;
    this.el.remove();
    clearReadingHighlights();
    this.matchRanges = [];
    this.currentIndex = 0;
  }

  find(): void {
    const text = this.searchInput.value;
    if (!text) {
      clearReadingHighlights();
      this.matchRanges = [];
      this.countBadge.textContent = "";
      this.countBadge.classList.remove("no-hits");
      return;
    }

    const isCase = this.caseBtn.getAttribute("aria-pressed") === "true";
    const isWord = this.wordBtn.getAttribute("aria-pressed") === "true";
    const isRegex = this.regexBtn.getAttribute("aria-pressed") === "true";

    let re: RegExp;
    try {
      if (isRegex) {
        re = new RegExp(text, isCase ? "g" : "gi");
      } else {
        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(isWord ? `\\b${escaped}\\b` : escaped, isCase ? "g" : "gi");
      }
    } catch {
      this.countBadge.textContent = this.strings.badRegex;
      this.countBadge.classList.add("no-hits");
      clearReadingHighlights();
      return;
    }

    this.matchRanges = [];
    const walker = document.createTreeWalker(this.preview, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || parent.closest(".verso-search-bar") || parent.closest(".reading-line-gutter")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const content = node.textContent ?? "";
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content))) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        this.matchRanges.push(range);
        if (match[0].length === 0) re.lastIndex++;
        if (this.matchRanges.length >= 5000) break;
      }
      if (this.matchRanges.length >= 5000) break;
    }

    if (this.matchRanges.length === 0) {
      this.countBadge.textContent = this.strings.noHits;
      this.countBadge.classList.add("no-hits");
      clearReadingHighlights();
      return;
    }

    this.countBadge.classList.remove("no-hits");
    this.currentIndex = Math.min(Math.max(0, this.currentIndex), this.matchRanges.length - 1);
    this.applyHighlights();
    this.scrollToCurrent();
  }

  next(): void {
    if (this.matchRanges.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.matchRanges.length;
    this.applyHighlights();
    this.scrollToCurrent();
  }

  prev(): void {
    if (this.matchRanges.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.matchRanges.length) % this.matchRanges.length;
    this.applyHighlights();
    this.scrollToCurrent();
  }

  private scrollToCurrent(): void {
    const range = this.matchRanges[this.currentIndex];
    if (range) {
      const parent = range.startContainer.parentElement;
      if (parent) {
        const details = parent.closest("details");
        if (details) details.open = true;
        const callout = parent.closest(".callout.is-collapsed");
        if (callout) callout.classList.remove("is-collapsed");
        parent.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  private applyHighlights(): void {
    this.countBadge.textContent = this.strings.hits(this.currentIndex + 1, this.matchRanges.length);
    applyReadingHighlights(this.matchRanges, this.currentIndex);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      this.preview.focus();
      return;
    }
    if (e.altKey && e.code === "KeyC") {
      e.preventDefault();
      const pressed = this.caseBtn.getAttribute("aria-pressed") !== "true";
      this.caseBtn.setAttribute("aria-pressed", String(pressed));
      this.find();
      return;
    }
    if (e.altKey && e.code === "KeyW") {
      e.preventDefault();
      const pressed = this.wordBtn.getAttribute("aria-pressed") !== "true";
      this.wordBtn.setAttribute("aria-pressed", String(pressed));
      this.find();
      return;
    }
    if (e.altKey && e.code === "KeyR") {
      e.preventDefault();
      const pressed = this.regexBtn.getAttribute("aria-pressed") !== "true";
      this.regexBtn.setAttribute("aria-pressed", String(pressed));
      this.find();
      return;
    }
    if (e.key === "Enter" && e.target === this.searchInput) {
      e.preventDefault();
      if (e.shiftKey) {
        this.prev();
      } else {
        this.next();
      }
      return;
    }
  }
}
