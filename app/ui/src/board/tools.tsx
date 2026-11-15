// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type JSX, type RefObject, useEffect, useId, useRef, useState } from "react";
import { type CanvasNode, type El } from "./model";
import { type BoardStrings } from "./strings";

/** The window's own "open" mark: a box with an arrow leaving it. */
export function OpenIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5" />
    </svg>
  );
}

/** Two arrows passing each other: the card points at another file. */
export function SwapIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
    </svg>
  );
}

/** Small stroke icons for Verso's tools inside Excalidraw's UI. Sized by
 *  Excalidraw's own CSS (`--default-icon-size`), stroked as its own icons. */
export function BoardIcon({ d, label }: { d: string; label?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label}>
      <path d={d} />
    </svg>
  );
}

export const ICO = {
  insert: "M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6.5h.01",
  note: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3",
  text: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3M6 8h4M6 10.5h4",
  page: "M2.5 3.5h11v9h-11zM2.5 6h11M4 4.75h.01M5.75 4.75h.01",
  link: "M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1",
  arrow: "M2 8h9M9 5l3 3-3 3",
  open: "M9 3h4v4M13 3 7.5 8.5M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5",
  swap: "M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13",
  relation: "M2 3h5v4H2zM9 9h5v4H9zM7 5h2.5a1 1 0 0 1 1 1v3",
  search: "M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.3 10.3 14 14",
  outline: "M3 4h10M5 8h8M7 12h6",
  crop: "M4.5 1.5v10h10M1.5 4.5h10v10",
  map: "M1.5 4l4-1.5 5 1.5 4-1.5v9.5l-4 1.5-5-1.5-4 1.5zM5.5 2.5v9.5M10.5 4v9.5",
  pin: "M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.5 4.5 7.5zM8 7.5h.01",
  back: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  front: "M3.5 3.5h7v7h-7zM5.5 12.5h7v-7",
  lock: "M3.5 7.5h9v6h-9zM5.5 7.5v-2a2.5 2.5 0 0 1 5 0v2",
  reader: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 9.7a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z",
  close: "M4 4l8 8M12 4l-8 8",
  menu: "M2.5 4h11M2.5 8h11M2.5 12h11",
  /** A floor plan: a map's tracing (ADR 0120). */
  trace: "M2.5 2.5h11v11h-11zM2.5 7.5h5v6M7.5 2.5v2.5M10.5 7.5h3",
};

export type ToolButtonProps = {
  label: string;
  title: string;
  onClick: () => void;
  icon: string;
  pressed?: boolean;
  disabled?: boolean;
  testId: string;
};

/** A button in Excalidraw's own clothes: its `ToolIcon` wrapper and
 *  `ToolIcon__icon` box, so its size, hover and colour apply; `is-on` is
 *  Verso's, for the pressed state (style.css). */
export function ToolButton({ label, title, onClick, icon, pressed, disabled, testId }: ToolButtonProps): JSX.Element {
  return (
    <div className="ToolIcon" title={title}>
      <button
        type="button"
        className={`ToolIcon__icon${pressed ? " is-on" : ""}`}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        data-testid={testId}
        onClick={onClick}
      >
        <BoardIcon d={icon} />
      </button>
    </div>
  );
}

export type InsertProps = {
  s: BoardStrings;
  addFile: () => void;
  addText: () => void;
  addLink: () => void;
  /** Put a web page on the board as a live card; absent where the window cannot show one. */
  addPage?: (() => void) | undefined;
  takeFiles: (files: File[]) => Promise<void>;
  looseOn: boolean;
  toggleLoose: () => void;
};

/** What Verso puts on a board, behind one button of Excalidraw's toolbar —
 *  where its own image tool would be — as the plugin for Obsidian does: a
 *  menu in Excalidraw's dropdown clothes. */
export function InsertMenu({ s, addFile, addText, addLink, addPage, takeFiles, looseOn, toggleLoose }: InsertProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>(".board-insert-trigger")?.focus();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  const item = (label: string, title: string, icon: string, testId: string, run: () => void, checked?: boolean): JSX.Element => (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      title={title}
      data-testid={testId}
      className={`dropdown-menu-item dropdown-menu-item-base${checked ? " is-on" : ""}`}
      // The focus stays on the board: Chromium (WebView2) moves it to a
      // clicked button, and the board's keys (a, r, Esc) would stop
      // reaching Excalidraw; WebKit never does (ADR 0069, item 8).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <div className="dropdown-menu-item__icon">
        <BoardIcon d={icon} />
      </div>
      <div className="dropdown-menu-item__text">{label}</div>
      {checked !== undefined && <div className="dropdown-menu-item__shortcut">{checked ? "✓" : ""}</div>}
    </button>
  );
  return (
    <div className="board-insert" ref={box}>
      <ToolButton label={s.addText} title={s.addTextTitle} onClick={addText} icon={ICO.text} testId="board-tool-textcard" />
      <div className="ToolIcon Shape" title={s.insertTitle}>
        <button
          type="button"
          className={`ToolIcon__icon board-insert-trigger${open ? " is-on" : ""}`}
          aria-label={s.insert}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="board-tool-insert"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          <BoardIcon d={ICO.insert} />
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        data-testid="board-image-picker"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (list.length > 0) void takeFiles(list);
        }}
      />
      {open && (
        <div className="dropdown-menu board-insert-menu" role="menu" aria-label={s.insert}>
          <div className="Island dropdown-menu-container">
            {item(s.addImage, s.addImageTitle, ICO.insert, "board-tool-image", () => picker.current?.click())}
            {item(s.addFile, s.addFileTitle, ICO.note, "board-tool-file", addFile)}
            {item(s.addText, s.addTextTitle, ICO.text, "board-tool-text", addText)}
            {item(s.addLink, s.addLinkTitle, ICO.link, "board-tool-link", addLink)}
            {addPage && item(s.addPage, s.addPageTitle, ICO.page, "board-tool-page", addPage)}
            <div className="dropdown-menu-item-separator" />
            {item(s.looseArrows, s.looseArrowsTitle, ICO.arrow, "board-tool-loose", toggleLoose, looseOn)}
          </div>
        </div>
      )}
    </div>
  );
}

export type TopRightProps = {
  s: BoardStrings;
  insert: JSX.Element | null;
  /** The selected picture card's crop, when one is selected. */
  cropPicture: (() => void) | null;
  /** The selected link card's "show page" / "show as link" switch. */
  pageToggle: { on: boolean; run: () => void } | null;
  /** The map and secret tools (ADR 0090), drawn after the crop. */
  maps?: JSX.Element | null;
  selectedNode: El | undefined;
  selectedData: CanvasNode | null | undefined;
  openable: boolean | undefined;
  openNode: (node: El, preview: boolean) => void;
  ends: { from: string; to: string } | null;
  promote: () => Promise<void>;
  relink: (e: El, n: CanvasNode) => Promise<void>;
  query: string;
  setQuery: (v: string) => void;
  searchBox: RefObject<HTMLInputElement | null>;
  step: (by: number) => void;
  hits: string[];
  hit: number;
  showOutline: boolean;
  setShowOutline: (v: boolean | ((prev: boolean) => boolean)) => void;
  container: RefObject<HTMLDivElement | null>;
};

/** The board's search, what acts on the selection, and the outline: in
 *  Excalidraw's top-right corner (`renderTopRightUI`), in an island of its
 *  own clothes. A component of its own, outside `Board`, so the search
 *  field keeps the focus while the board draws again at each letter. */
export function TopRightTools({
  s,
  insert,
  cropPicture,
  pageToggle,
  maps,
  selectedNode,
  selectedData,
  openable,
  openNode,
  ends,
  promote,
  relink,
  query,
  setQuery,
  searchBox,
  step,
  hits,
  hit,
  showOutline,
  setShowOutline,
  container,
}: TopRightProps): JSX.Element {
  const file = selectedNode && selectedData?.type === "file";
  const searchId = useId();
  return (
    <div className="Island board-ex-tools" role="toolbar" aria-label={s.toolbar}>
      {/* On a phone (css/boardphone.css) what puts on the board and the
          outline are the ⋯ sheet's; what acts on the selection (the
          `board-ex-context` group) and the search, once used, stay here. */}
      {insert && <span className="board-ex-insert">{insert}</span>}
      {insert && <div className="App-toolbar__divider" />}
      <span className="board-ex-search">
        {/* The magnifier focuses the field: on a narrow board the field is
            folded into it until then (style.css). */}
        <label htmlFor={searchId} className="board-ex-search-icon">
          <BoardIcon d={ICO.search} label={s.search} />
        </label>
        <input
          id={searchId}
          ref={searchBox}
          type="search"
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          placeholder={s.search}
          aria-label={s.search}
          title={s.searchTitle}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDownCapture={(e) => {
            // Inside Excalidraw's UI a letter is a tool's key: kept for
            // the field, or "e", "r", "o"… would change the tool.
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setQuery("");
              container.current?.querySelector<HTMLElement>(".excalidraw")?.focus();
            }
          }}
        />
        {query.trim() !== "" && (
          <span className="board-ex-search-count" aria-live="polite">
            {hits.length > 0 ? s.searchCount(hit + 1, hits.length) : s.noMatches}
          </span>
        )}
      </span>
      {(openable || ends || file || cropPicture || pageToggle || maps) && <div className="App-toolbar__divider" />}
      <span className="board-ex-context">
      {openable && <ToolButton label={s.open} title={s.openTitle} onClick={() => selectedNode && openNode(selectedNode, false)} icon={ICO.open} testId="board-tool-open" />}
      {file && <ToolButton label={s.swap} title={s.swapTitle} onClick={() => selectedNode && selectedData && void relink(selectedNode, selectedData)} icon={ICO.swap} testId="board-tool-swap" />}
      {pageToggle && <ToolButton label={pageToggle.on ? s.showLink : s.showPage} title={pageToggle.on ? s.showLinkTitle : s.showPageTitle} onClick={pageToggle.run} icon={pageToggle.on ? ICO.link : ICO.page} testId="board-tool-page-toggle" />}
      {cropPicture && <ToolButton label={s.crop} title={s.cropTitle} onClick={cropPicture} icon={ICO.crop} testId="board-tool-crop" />}
      {maps}
      {ends && <ToolButton label={s.promote} title={s.promoteTitle} onClick={() => void promote()} icon={ICO.relation} testId="board-tool-promote" />}
      </span>
      <div className="App-toolbar__divider board-ex-outline-line" />
      <ToolButton label={s.outline} title={s.outlineTitle} onClick={() => setShowOutline((v) => !v)} icon={ICO.outline} pressed={showOutline} testId="board-tool-outline" />
    </div>
  );
}
