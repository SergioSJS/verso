// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The board's pane (ADR 0057): Excalidraw draws the whole board (point 3),
// Verso draws each node inside it, and an outline beside it says the same
// in a list the keyboard and a screen reader can walk (point 7). React
// lives only here: the window loads this module when a board opens, and
// the rest of the window stays plain TypeScript.
//
// Nothing here reaches the network (ADR 0050): a node's card is drawn
// from the folder through the host, a link card shows its address and
// opens it only on a click, the fonts come from the app, and Excalidraw's
// online features — sharing, collaboration, the library browser — are not
// offered.

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type JSX, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  Footer,
  MainMenu,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  getCommonBounds,
  getSceneVersion,
  newElementWith,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { AppState, BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { isLinearElement, LinearElementEditor } from "@excalidraw/element";
import type { ExcalidrawElement, NonDeleted, ExcalidrawEmbeddableElement } from "@excalidraw/excalidraw/element/types";
import type { BoardStrings } from "./strings";
import {
  BOARD_VERSION,
  CARD_PAPER,
  MARKER,
  backgroundOf,
  cardCrop,
  fromElements,
  isNode,
  endAt,
  pointIn,
  type Binding,
  newNode,
  nodeData,
  nodeName,
  outlineOf,
  parseCanvas,
  relationEnds,
  toElements,
  withCrop,
  type CanvasDoc,
  type Crop,
  type CanvasEdge,
  type CanvasNode,
  type El,
  type Outline,
  type Side,
} from "./model";
import { relationKeyOk } from "./relation";
import { CARD_COMMAND } from "./command";
import { plainOf, wrapLines } from "./export";
import { PT_BR } from "./ptBR";

/** What the window gives the board: its contract calls and its dialogs. */
export type BoardHost = {
  strings: BoardStrings;
  /** `pt-BR` or `en`: the interface's language. */
  lang: string;
  dark: () => boolean;
  /** The canvas as the board holds it, to be saved (the core lays it over
   *  the file as read). */
  save: (json: string) => Promise<void> | void;
  /** The user changed the board: the tab has unsaved work from now on,
   *  before the save's delay runs out. */
  changed?: () => void;
  /** The change was undone before it was saved: the board holds what was
   *  last sent, and the tab has nothing unsaved of the board's. */
  settled?: () => void;
  openFile: (path: string, aside: boolean) => void;
  /** Draw a note into `el` as the reading view draws it (sanitized, its
   *  images and embeds resolved, its links live). */
  renderNote: (el: HTMLElement, path: string) => Promise<void>;
  /** Draw a text card's Markdown the same way, from the board's folder. */
  renderText: (el: HTMLElement, text: string) => Promise<void>;
  /** A note's text, for the board's search. */
  noteText: (path: string) => Promise<string>;
  fileSrc: (path: string) => string;
  /** A copy of a picture at the size a card shows it (null: none made). */
  pictureCopy: (src: string) => Promise<string | null>;
  exists: (path: string) => boolean;
  /** Choose a file of the folder; `query` fills the search first. */
  pickFile: (query?: string) => Promise<string | null>;
  /** Show the PDF at `path` inside `el` (ADR 0057 point 3); the function
   *  returned takes it down. */
  renderPdf: (el: HTMLElement, path: string) => () => void;
  prompt: (label: string, initial: string, multiline: boolean) => Promise<string | null>;
  /** Write the relation into the source note, after showing the diff;
   *  true when it was written. */
  promote: (from: string, to: string, key: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  /** Run the window's command a key is bound to; true when one ran. */
  appKey: (e: KeyboardEvent) => boolean;
  status: (text: string) => void;
  /** Edit a note inside `el`, in the window's note editor; `onExit` is
   *  asked for by Escape. */
  editNote: (el: HTMLElement, path: string, onExit: () => void) => CardEditing;
  /** A card's editor was left with a history this board keeps. */
  edited: (path: string) => boolean;
  /** The board's settings (ADR 0057, 2026-09-30). */
  prefs: BoardPrefs;
  /** Where this board was last looked at, kept in this window's storage. */
  lastView: () => SavedView | null;
  rememberView: (v: SavedView) => void;
  /** The board's name, for an exported picture's. */
  name: () => string;
  /** Write a picture of the board into the folder, beside the board; the
   *  path written, or null (said). */
  saveImage: (name: string, base64: string) => Promise<string | null>;
};

/** What the settings say of boards. */
export type BoardPrefs = {
  /** The stroke a new shape takes: clean lines or hand-drawn. */
  stroke: "clean" | "hand";
  /** The font of new text drawn on the board. */
  font: "hand" | "sans" | "mono";
  /** The grid, and snapping to it, when a board opens. */
  grid: boolean;
  /** A board opens with all of it in view, or where it was left. */
  open: "fit" | "last";
};

export type SavedView = { scrollX: number; scrollY: number; zoom: number };

const FONT_ID: Record<BoardPrefs["font"], number> = { hand: 5, sans: 6, mono: 3 };

/** A Mac, as Excalidraw tells one: its keys differ there (⌘⌥ for ⌃⇧). */
const MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** The name of each font Excalidraw ships, by its number. */
const FONT_NAME = new Map<number, string>(Object.entries(FONT_FAMILY).map(([name, id]) => [id, name]));

/** Whether a text's font is in the window: registered, and every face its
 *  characters need loaded. A font with no face of its own (a system font)
 *  is measured right from the start and never needs it. */
function fontReady(t: { fontFamily: number; fontSize: number; text: string }): boolean {
  const name = FONT_NAME.get(t.fontFamily);
  if (!name) return false;
  let registered = false;
  document.fonts.forEach((f) => {
    if (f.family.replace(/^["']|["']$/g, "") === name) registered = true;
  });
  return registered && document.fonts.check(`${t.fontSize}px "${name}"`, t.text);
}

/** Settles once the faces the texts need are in, each asked for. WebKit
 *  does not always fire `loadingdone`, and a font that arrives late — a
 *  cold start of the app — would leave its texts cut for good. */
function fontsOf(els: readonly ExcalidrawElement[]): Promise<unknown> {
  const wanted = new Map<string, string>();
  for (const e of els) {
    if (e.type !== "text") continue;
    const name = FONT_NAME.get(e.fontFamily);
    if (!name) continue;
    const font = `${e.fontSize}px "${name}"`;
    wanted.set(font, (wanted.get(font) ?? "") + e.text);
  }
  return Promise.allSettled([...wanted].map(([font, text]) => document.fonts.load(font, text)));
}

/** A note being edited in its card. */
export type CardEditing = {
  /** Save now; true when nothing is left unsaved (false: a conflict waits). */
  flush: () => Promise<boolean>;
  /** The folder changed: meet the note on disk. */
  recheck: () => Promise<void>;
  /** The caret where the pointer is, and the keyboard in the editor. */
  focusAt: (x: number, y: number) => void;
  /** Undo or redo in the editor, the keyboard in it. */
  run: (command: "undo" | "redo") => void;
  destroy: () => void;
  /** True when changes in the card editor are unsaved. */
  isDirty?: () => boolean;
  /** True when a conflict banner is active on the card editor. */
  isConflicted?: () => boolean;
  /** The note path being edited. */
  targetPath?: () => string;
};

export type BoardHandle = {
  /** Show a canvas's text; false when it is not JSON. */
  load: (text: string) => boolean;
  /** The folder changed: every card asks for its note again. */
  refresh: () => void;
  /** Go to the board's search (⌘F). */
  find: () => void;
  focus: () => void;
  /** Put a file of the folder on the board, at a point of the screen (the
   *  middle of the view without one). */
  addPath: (path: string, clientX?: number, clientY?: number) => void;
  /** Save now what the board holds and has not saved: before its tab
   *  closes, the window quits or the folder changes. */
  flush: () => Promise<void>;
  destroy: () => void;
};

const SAVE_DELAY = 700;

/** With the window in Portuguese, Verso's words for Excalidraw's labels
 *  (`ptBR.ts`): the ones its pt-BR leaves out, in place of the English it
 *  falls back to, and the ones Verso says otherwise — the tutorial names
 *  them as Verso does. Excalidraw is pinned at an exact build in
 *  package.json: its English and its pt-BR are these modules, hashed files
 *  of its build. */
export async function completeLocale(lang: string): Promise<void> {
  if (!lang.toLowerCase().startsWith("pt")) return;
  const modules = (await Promise.all([
    // @ts-expect-error — a module of the package's build, without types.
    import("../../node_modules/@excalidraw/excalidraw/dist/prod/locales/en-APPZPZFQ.js"),
    // @ts-expect-error — a module of the package's build, without types.
    import("../../node_modules/@excalidraw/excalidraw/dist/prod/locales/pt-BR-CZDV62R3.js"),
  ])) as Record<string, unknown>[];
  for (const [path, text] of Object.entries(PT_BR)) {
    const parts = path.split(".");
    const last = parts[parts.length - 1];
    for (const m of modules) {
      let at: Record<string, unknown> | undefined = ((m["default"] ?? m) as Record<string, unknown>)[parts[0] ?? ""] as Record<string, unknown> | undefined;
      for (const part of parts.slice(1, -1)) at = at?.[part] as Record<string, unknown> | undefined;
      if (at && typeof at === "object" && last) at[last] = text;
    }
  }
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ext(path: string): string {
  const name = path.split("/").pop() ?? path;
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;

/** Text as the search compares it: lower case, accents off. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The window's own "open" mark: a box with an arrow leaving it. */
function OpenIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5" />
    </svg>
  );
}

/** Two arrows passing each other: the card points at another file. */
function SwapIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13" />
    </svg>
  );
}

/** Small stroke icons for Verso's tools inside Excalidraw's UI. Sized by
 *  Excalidraw's own CSS (`--default-icon-size`), stroked as its own icons. */
function BoardIcon({ d, label }: { d: string; label?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label}>
      <path d={d} />
    </svg>
  );
}

const ICO = {
  insert: "M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6.5h.01",
  note: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3",
  text: "M4 2.5h5.5L12.5 5.5v8h-8.5zM9.5 2.5v3h3M6 8h4M6 10.5h4",
  link: "M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1",
  arrow: "M2 8h9M9 5l3 3-3 3",
  open: "M9 3h4v4M13 3 7.5 8.5M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5",
  swap: "M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13",
  relation: "M2 3h5v4H2zM9 9h5v4H9zM7 5h2.5a1 1 0 0 1 1 1v3",
  search: "M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.3 10.3 14 14",
  outline: "M3 4h10M5 8h8M7 12h6",
  crop: "M4.5 1.5v10h10M1.5 4.5h10v10",
};

type ToolButtonProps = {
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
function ToolButton({ label, title, onClick, icon, pressed, disabled, testId }: ToolButtonProps): JSX.Element {
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

type InsertProps = {
  s: BoardStrings;
  addFile: () => void;
  addText: () => void;
  addLink: () => void;
  takeFiles: (files: File[]) => Promise<void>;
  looseOn: boolean;
  toggleLoose: () => void;
};

/** What Verso puts on a board, behind one button of Excalidraw's toolbar —
 *  where its own image tool would be — as the plugin for Obsidian does: a
 *  menu in Excalidraw's dropdown clothes. */
function InsertMenu({ s, addFile, addText, addLink, takeFiles, looseOn, toggleLoose }: InsertProps): JSX.Element {
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
      <div className="ToolIcon Shape" title={s.insertTitle}>
        <button
          type="button"
          className={`ToolIcon__icon board-insert-trigger${open ? " is-on" : ""}`}
          aria-label={s.insert}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="board-tool-insert"
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
            <div className="dropdown-menu-item-separator" />
            {item(s.looseArrows, s.looseArrowsTitle, ICO.arrow, "board-tool-loose", toggleLoose, looseOn)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Puts the insert menu into Excalidraw's toolbar, before the divider of
 *  its "More tools": Excalidraw has no slot there, so a node of Verso's is
 *  placed among its tools, and placed again whenever the toolbar is drawn
 *  anew (a narrow view, the view mode). `null` while there is no toolbar:
 *  the menu then goes to the top-right tools. */
function useToolbarSlot(canvas: RefObject<HTMLDivElement | null>): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const node = document.createElement("div");
    node.className = "board-insert-slot";
    const place = (): void => {
      const row = c.querySelector<HTMLElement>(".App-toolbar .Stack_horizontal");
      if (!row) {
        node.remove();
        setSlot(null);
        return;
      }
      const dividers = row.querySelectorAll(":scope > .App-toolbar__divider");
      const before = dividers.length > 1 ? dividers[dividers.length - 1]! : null;
      if (node.parentElement !== row || (before && node.nextElementSibling !== before)) row.insertBefore(node, before);
      setSlot(node);
    };
    place();
    const mo = new MutationObserver(() => {
      if (!node.isConnected || !c.querySelector(".App-toolbar .Stack_horizontal")?.contains(node)) place();
    });
    mo.observe(c, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      node.remove();
    };
  }, [canvas]);
  return slot;
}

/** Excalidraw's line of hints under its toolbar, while `on`: Verso's own
 *  hint goes in it as one more line, in its clothes. Excalidraw draws the
 *  line anew as the hint changes, so it is looked for again each time. */
function useHintSlot(canvas: RefObject<HTMLDivElement | null>, on: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !on) {
      setSlot(null);
      return;
    }
    const find = (): void => setSlot(c.querySelector<HTMLElement>(".HintViewer"));
    find();
    const mo = new MutationObserver(find);
    mo.observe(c, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [canvas, on]);
  return slot;
}

/** Whether Verso's tools go to Excalidraw's footer: when the board — not
 *  its desktop layout, which holds until the board is quite narrow — leaves
 *  no room for them beside the menu and the toolbar on the top row (a side
 *  bar open, a narrow pane). Excalidraw's phone layout has its own place for
 *  them (style.css). Their width is read while they are on the top row and
 *  not being typed into, so a search field that widens never moves them. */
/** Excalidraw's right-click menu with the items Verso hides (its copies
 *  as pictures, a card's link, the library) taken out cleanly: a line left
 *  first, last or beside another goes, or the menu shows two together. */
function useTidyContextMenu(canvas: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const tidy = (menu: Element): void => {
      let last: HTMLElement | null = null;
      let seen = false;
      for (const child of Array.from(menu.children) as HTMLElement[]) {
        const line = child.classList.contains("context-menu-item-separator");
        if (line) {
          child.style.display = "";
          if (!seen || last) child.style.display = "none";
          else last = child;
          continue;
        }
        if (getComputedStyle(child).display === "none") continue;
        seen = true;
        last = null;
      }
      if (last) last.style.display = "none";
    };
    const mo = new MutationObserver(() => {
      const menu = c.querySelector(".context-menu");
      if (menu) tidy(menu);
    });
    mo.observe(c, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [canvas]);
}

function useToolsBelow(canvas: RefObject<HTMLDivElement | null>): boolean {
  const [below, setBelow] = useState(false);
  const toolsWidth = useRef(180);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const measure = (): void => {
      // The board's width, for the toolbar of the phone layout (style.css):
      // a percentage there would be of the toolbar's own box.
      c.style.setProperty("--board-width", `${c.clientWidth}px`);
      const ex = c.querySelector(".excalidraw");
      if (ex?.classList.contains("excalidraw--mobile")) {
        setBelow(false);
        return;
      }
      const top = c.querySelector(".App-menu_top");
      const bar = c.querySelector(".App-toolbar");
      if (!ex || !top || !bar) return;
      const tools = c.querySelector<HTMLElement>(".layer-ui__wrapper__top-right .board-ex-tools");
      if (tools && !tools.contains(document.activeElement)) toolsWidth.current = tools.getBoundingClientRect().width;
      const left = c.querySelector(".App-menu_top__left")?.getBoundingClientRect().width ?? 0;
      const room = top.getBoundingClientRect().width - bar.getBoundingClientRect().width - left - 48;
      setBelow(room < toolsWidth.current);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    // The toolbar drawn anew, or Excalidraw turning to its phone layout
    // (a class of its root, set after the size that caused it): measured
    // again, or the tools would wait in a footer the phone layout has not.
    let watched: Element | null = null;
    const mo = new MutationObserver((records) => {
      const bar = c.querySelector(".App-toolbar");
      const layout = records.some((r) => r.type === "attributes" && (r.target as Element).classList.contains("excalidraw"));
      if (bar && bar !== watched) {
        watched = bar;
        ro.observe(bar);
        measure();
      } else if (layout) measure();
    });
    mo.observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [canvas]);
  return below;
}

type TopRightProps = {
  s: BoardStrings;
  insert: JSX.Element | null;
  /** The selected picture card's crop, when one is selected. */
  cropPicture: (() => void) | null;
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
function TopRightTools({
  s,
  insert,
  cropPicture,
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
      {insert}
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
      {(openable || ends || file || cropPicture) && <div className="App-toolbar__divider" />}
      {openable && <ToolButton label={s.open} title={s.openTitle} onClick={() => selectedNode && openNode(selectedNode, false)} icon={ICO.open} testId="board-tool-open" />}
      {file && <ToolButton label={s.swap} title={s.swapTitle} onClick={() => selectedNode && selectedData && void relink(selectedNode, selectedData)} icon={ICO.swap} testId="board-tool-swap" />}
      {cropPicture && <ToolButton label={s.crop} title={s.cropTitle} onClick={cropPicture} icon={ICO.crop} testId="board-tool-crop" />}
      {ends && <ToolButton label={s.promote} title={s.promoteTitle} onClick={() => void promote()} icon={ICO.relation} testId="board-tool-promote" />}
      <div className="App-toolbar__divider" />
      <ToolButton label={s.outline} title={s.outlineTitle} onClick={() => setShowOutline((v) => !v)} icon={ICO.outline} pressed={showOutline} testId="board-tool-outline" />
    </div>
  );
}

/** A card of a picture in the folder: drawn as the picture alone, with no
 *  frame, head or title (its name is the picture's alternative text; open
 *  and swap are in the top-right tools while it is selected). */
function isBarePicture(node: CanvasNode, host: BoardHost): boolean {
  const file = typeof node.file === "string" ? node.file : "";
  return node.type === "file" && IMAGE.test(ext(file)) && host.exists(file);
}

/** A node drawn by Verso inside its element. */
function Card({
  id,
  node,
  host,
  tick,
  editing,
  setEditing,
  swap,
  draw,
  background,
  fill,
  zoom,
}: {
  /** Point the card at another file of the folder (its id). */
  swap: (id: string) => void;
  /** The CSS zoom the card is laid out at (1 when it is scaled instead). */
  zoom: number;
  id: string;
  node: CanvasNode;
  host: BoardHost;
  tick: number;
  /** Enter a card's editor (its id), or leave it (null). */
  setEditing: (id: string | null) => void;
  /** Draw the card's note or text, in its turn (`drawQueue`). */
  draw: Draw;
  /** How the colour fills the card (Excalidraw's fill style). */
  fill: string;
  /** The colour chosen for the card on the board, if not its paper. */
  background: string | null;
  /** The card is entered and asked to edit its note. */
  editing: boolean;
}): JSX.Element {
  const onEdit = useCallback(() => setEditing(id), [id, setEditing]);
  const onExit = useCallback(() => setEditing(null), [setEditing]);
  const body = useRef<HTMLDivElement>(null);
  const editorEl = useRef<HTMLDivElement>(null);
  const editor = useRef<CardEditing | null>(null);
  const at = useRef<[number, number]>([0, 0]);
  const command = useRef<"undo" | "redo" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // The editor stays until what it holds is saved: leaving the card with a
  // conflict on screen keeps it, and the card entered again shows it.
  const [open, setOpen] = useState(false);
  const s = host.strings;
  const file = typeof node.file === "string" ? node.file : "";
  const text = typeof node.text === "string" ? node.text : "";
  const url = typeof node.url === "string" ? node.url : "";
  const missing = node.type === "file" && !host.exists(file);
  const note = node.type === "file" && !missing && ext(file) === "md";
  const picture = isBarePicture(node, host);
  const crop = picture ? cardCrop(node) : null;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // The crop's part as large as the card holds it at its proportions,
  // measured in the card's own pixels: a size from container units went
  // wrong in the app's web view under the cards' zoom until a redraw.
  const cropBox = useRef<HTMLDivElement>(null);
  const [cropView, setCropView] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = cropBox.current;
    if (!crop || !natural || !el) {
      setCropView(null);
      return;
    }
    const ar = (crop.w * natural.w) / (crop.h * natural.h);
    const fit = (): void => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const w = Math.min(cw, ch * ar);
      setCropView((was) => (was && Math.abs(was.w - w) < 0.5 && Math.abs(was.h - w / ar) < 0.5 ? was : { w, h: w / ar }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [crop?.x, crop?.y, crop?.w, crop?.h, natural?.w, natural?.h]);
  const pdf = node.type === "file" && !missing && ext(file) === "pdf";
  const pdfEl = useRef<HTMLDivElement>(null);
  // A PDF card shows the PDF, in its turn, as a note shows an embedded one.
  useEffect(() => {
    const el = pdfEl.current;
    if (!pdf || !el) return;
    let stop: (() => void) | null = null;
    let gone = false;
    const cancel = draw(id, async () => {
      if (!gone) stop = host.renderPdf(el, file);
    });
    return () => {
      gone = true;
      cancel();
      stop?.();
    };
  }, [pdf, id, file, host, draw]);
  // A picture card draws the picture's copy, in its turn, and the original
  // over it for a close view (`cardPicture`): undefined while it waits.
  const [copy, setCopy] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!picture) return;
    let gone = false;
    const cancel = draw(id, async () => {
      const made = await host.pictureCopy(host.fileSrc(file));
      if (!gone) setCopy(made);
    });
    return () => {
      gone = true;
      cancel();
    };
  }, [picture, id, file, host, draw]);
  // Drawn once, in its turn, and kept wherever the view goes: only a
  // change of the note, or of the folder, draws it again.
  useEffect(() => {
    const el = body.current;
    if (!el || open) return;
    if (!note && node.type !== "text") {
      el.replaceChildren();
      return;
    }
    return draw(id, () => (note ? host.renderNote(el, file) : host.renderText(el, text)));
  }, [id, node.type, note, file, text, host, tick, open, draw]);
  useEffect(() => {
    if (editing && note && !open) setOpen(true);
    if (!editing && open) {
      const ed = editor.current;
      void (ed ? ed.flush() : Promise.resolve(true)).then((clean) => {
        if (!clean) return host.status(s.conflictInCard);
        ed?.destroy();
        editor.current = null;
        setOpen(false);
        // The keyboard stays with the card: ⌘Z right after leaving the
        // editor brings it back (CARD_COMMAND).
        if (root.current?.closest(".board-card-slot.is-active")) root.current.focus({ preventScroll: true });
      });
    }
  }, [editing, note, open, host, s]);
  useEffect(() => {
    const el = editorEl.current;
    if (!open || !el) return;
    const ed = host.editNote(el, file, onExit);
    editor.current = ed;
    const cmd = command.current;
    command.current = null;
    if (cmd) ed.run(cmd);
    else ed.focusAt(at.current[0], at.current[1]);
    return () => {
      // Gone from the board (deleted, or the board closed): what was
      // typed is saved first.
      if (editor.current !== ed) return;
      editor.current = null;
      void ed.flush().finally(() => ed.destroy());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file]);
  useEffect(() => {
    if (open) void editor.current?.recheck();
  }, [tick, open]);
  // Undo or redo while the card is entered and reads its note: the note's
  // editor comes back, as it was left, and runs it there — on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const take = (e: Event): void => {
      const cmd = (e as CustomEvent<"undo" | "redo">).detail;
      if (!note) return;
      if (open) {
        e.preventDefault();
        editor.current?.run(cmd);
        return;
      }
      if (!host.edited(file)) return;
      e.preventDefault();
      command.current = cmd;
      onEdit();
    };
    el.addEventListener(CARD_COMMAND, take);
    return () => el.removeEventListener(CARD_COMMAND, take);
  }, [note, open, host, file, onEdit]);
  const kind = node.type === "text" ? s.textCard : node.type === "link" ? s.linkCard : ext(file) || node.type;
  return (
    <div
      className={`board-card board-card-${node.type}${missing ? " board-card-missing" : ""}${picture ? " board-card-bare" : ""}`}
      aria-label={s.card(kind, nodeName(node, s))}
      data-fill={background && fill !== "solid" ? fill : undefined}
      style={background ? ({ "--card-bg": background } as CSSProperties) : undefined}
      ref={root}
      tabIndex={-1}
    >
      {node.type === "file" && !picture && (
        <div className="board-card-head">
          <span className="board-card-title">{nodeName(node, s)}</span>
          <button type="button" className="board-card-open board-card-swap" title={s.swapTitle} aria-label={`${s.swap}: ${nodeName(node, s)}`} onClick={() => swap(id)}>
            <SwapIcon />
          </button>
          {!missing && (
            <button type="button" className="board-card-open" title={s.openTitle} aria-label={`${s.open}: ${nodeName(node, s)}`} onClick={(e) => host.openFile(file, e.metaKey || e.ctrlKey)}>
              <OpenIcon />
            </button>
          )}
        </div>
      )}
      {node.type === "file" && missing && (
        <div className="board-card-note">
          <p>{s.missing}</p>
          <p className="board-card-path">{file}</p>
          <p>{s.relinkHint}</p>
        </div>
      )}
      {pdf && (
        // Laid out at the zoom the card is shown at, not scaled with it:
        // pdf.js draws its pages at the size they are seen.
        <div className="board-card-pdf" style={{ zoom: 1 / zoom } as CSSProperties}>
          <div ref={pdfEl} className="board-card-pdf-view" />
        </div>
      )}
      {picture && copy !== undefined && (crop ? (
        // The part of the picture the card shows (its crop), at the crop's
        // proportions, centred in the card.
        <div className="board-card-image cropped" ref={cropBox} data-path={file}>
          <div className="board-crop-view" style={cropView ? { width: `${cropView.w}px`, height: `${cropView.h}px` } : { visibility: "hidden" }}>
            <div className="board-crop-inner" style={{ left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, width: `${100 / crop.w}%`, height: `${100 / crop.h}%` }}>
              <img src={copy ?? host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} decoding="async" onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })} />
              {copy && <img className="pic-full" src={host.fileSrc(file)} alt="" draggable={false} decoding="async" loading="lazy" />}
            </div>
          </div>
        </div>
      ) : (
        <div className="board-card-image" data-path={file}>
          <img src={copy ?? host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} decoding="async" />
          {copy && <img className="pic-full" src={host.fileSrc(file)} alt="" draggable={false} decoding="async" loading="lazy" />}
        </div>
      ))}
      {node.type === "link" && (
        <div className="board-card-link">
          <div className="board-card-head">
            <span className="board-card-title">{s.linkCard}</span>
            <button type="button" className="board-card-open" title={url} aria-label={`${s.open}: ${url}`} onClick={() => host.openUrl(url)}>
              <OpenIcon />
            </button>
          </div>
          <span className="board-card-url">{url}</span>
        </div>
      )}
      <div
        className="board-card-body preview"
        ref={body}
        hidden={open}
        // Entered, a click on the note's text (not on a link) edits it
        // there, as a second click does on Obsidian's canvas.
        onClick={(e) => {
          if (!note || (e.target as HTMLElement).closest("a, button, input, summary, .embed-note, .embed-pdf")) return;
          at.current = [e.clientX, e.clientY];
          onEdit();
        }}
      />
      {open && <div className="board-card-body board-card-editor" ref={editorEl} />}
    </div>
  );
}

const MemoCard = memo(Card);

/** Queue a card's drawing; the function returned takes it back if it has
 *  not started. */
type Draw = (id: string, run: () => Promise<void>) => () => void;

/** Cards draw their notes a few at a time, the nearest to the view first
 *  (`rank`, lowest first): a board of many notes shows what is on screen at
 *  once, and the rest follows while it is looked at. */
function drawQueue(rank: (id: string) => number, limit = 3): Draw {
  const waiting: { id: string; run: () => Promise<void> }[] = [];
  let running = 0;
  let queued = false;
  const pump = (): void => {
    queued = false;
    while (running < limit && waiting.length > 0) {
      let best = 0;
      let bestRank = rank(waiting[0]!.id);
      for (let i = 1; i < waiting.length; i++) {
        const r = rank(waiting[i]!.id);
        if (r < bestRank) {
          best = i;
          bestRank = r;
        }
      }
      const [job] = waiting.splice(best, 1);
      if (!job) break;
      running++;
      void job
        .run()
        .catch(() => undefined)
        .finally(() => {
          running--;
          pump();
        });
    }
  };
  return (id, run) => {
    const job = { id, run };
    waiting.push(job);
    // The cards mounted in one render all join before the nearest is picked.
    if (!queued) {
      queued = true;
      queueMicrotask(pump);
    }
    return () => {
      const i = waiting.indexOf(job);
      if (i >= 0) waiting.splice(i, 1);
    };
  };
}

/** Where the board is looking: Excalidraw's scroll and zoom, and its size. */
type View = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };

/** The corner Excalidraw draws a shape with, for its roundness. */
function cornerRadius(e: El): number {
  const round = e["roundness"] as { type?: number; value?: number } | null | undefined;
  const x = Math.min(e.width, e.height);
  if (!round) return 0;
  if (round.type === 1 || round.type === 2) return x * 0.25;
  const fixed = typeof round.value === "number" ? round.value : 32;
  return x <= fixed / 0.25 ? x * 0.25 : fixed;
}

/** The outline of a card as Excalidraw strokes it — straight sides joined
 *  by quadratic curves whose control point is the corner, not circular
 *  arcs, so no `border-radius` meets it — for a box `w` × `h` with corner
 *  `r`, in the unit the numbers are given in. */
function cardPath(w: number, h: number, r: number): string {
  const f = (n: number): string => String(Math.round(n * 100) / 100);
  return `M ${f(r)} 0 L ${f(w - r)} 0 Q ${f(w)} 0 ${f(w)} ${f(r)} L ${f(w)} ${f(h - r)} Q ${f(w)} ${f(h)} ${f(w - r)} ${f(h)} L ${f(r)} ${f(h)} Q 0 ${f(h)} 0 ${f(h - r)} L 0 ${f(r)} Q 0 0 ${f(r)} 0 Z`;
}

/** A picture's copy is this wide (`pictureCopy` in the window), and a
 *  card shows a picture about this wide at 100 %: past the zoom where the
 *  copy would be stretched, the originals are laid over the copies. */
const PICTURE_COPY = 800;
const CARD_PICTURE_WIDTH = 420;

/** Below this zoom a card is scaled down, not laid out at the zoom:
 *  WebKit keeps a minimum font size, and a picture shrunk does not blur. */
const LAYOUT_ZOOM = 0.75;

/** What is drawn above a card: the elements above it in the board's order
 *  that reach into it, as one vector picture placed in scene units. */
type Overlay = { x: number; y: number; svg: string };

/** The cards, drawn by Verso over Excalidraw's canvas — not inside
 * Excalidraw's own embeddable boxes. Those are scaled with a CSS transform,
 * and WebKit paints a transformed layer once and then stretches the
 * picture: text read like a blurred screenshot. Here a card at rest is
 * placed in screen pixels and laid out at the zoom itself (CSS `zoom`),
 * with no transform at all: its text is drawn at the size it is seen.
 *
 * Every card is mounted once and keeps what it drew: a card far from the
 * view is only hidden (`cull`), so coming back to it shows it at once, as
 * it was. The cards sit on a plane that is not cut to the view: while the
 * view moves, the plane follows with one transform (see `Board`), and what
 * was just outside the view slides in already drawn. Only a change of zoom
 * lays the cards out again, sharp, once the view settles.
 *
 * The layer sits above Excalidraw's drawing and below its selection, so a
 * shape selected over a card shows its handles. What is drawn above a card
 * in the board's order is drawn again over it, cut to the card's shape. */
function CardLayer({
  cards,
  overlays,
  view,
  live,
  cullRef,
  laidOut: onLaidOut,
  active,
  host,
  tick,
  plane,
  editing,
  setEditing,
  swap,
  draw,
}: {
  swap: (id: string) => void;
  cards: readonly El[];
  overlays: ReadonlyMap<string, Overlay>;
  /** The view the cards are placed for. */
  view: View;
  /** The view as it is now, which may have moved on since. */
  live: RefObject<View>;
  /** Where the layer leaves the function that shows and hides its cards. */
  cullRef: RefObject<((v: View) => void) | null>;
  /** Told, before paint, that the cards are placed for `view`. */
  laidOut: (view: View) => void;
  active: string | null;
  host: BoardHost;
  tick: number;
  plane: RefObject<HTMLDivElement | null>;
  editing: string | null;
  setEditing: (id: string | null) => void;
  draw: Draw;
}): JSX.Element {
  const z = view.zoom;
  const laidOut = z >= LAYOUT_ZOOM;
  const keep = useRef({ editing, active });
  keep.current = { editing, active };
  // The wheel inside an entered card scrolls the card. Excalidraw pans the
  // board for a wheel on any <canvas>, and a PDF's pages are canvases: the
  // event stops at the layer, before Excalidraw's own listener on its root.
  // With ⌘ or ⌃ it is a zoom, and the board still takes it.
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const wheel = (e: WheelEvent): void => {
      if (e.metaKey || e.ctrlKey) return;
      if ((e.target as Element | null)?.closest?.(".board-card-slot.is-active")) e.stopPropagation();
    };
    el.addEventListener("wheel", wheel, { passive: true });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  // Shown within a screen of the view, hidden past two: a card at the edge
  // does not come and go as the view trembles. The one entered or edited is
  // always shown.
  useLayoutEffect(() => {
    const rects = new Map(cards.map((e) => [e.id, [e.x, e.y, e.x + e.width, e.y + e.height] as const]));
    const slots = Array.from(plane.current?.children ?? []) as HTMLElement[];
    const cull = (v: View): void => {
      if (v.width === 0 || v.zoom <= 0) return;
      const mx = v.width / v.zoom;
      const my = v.height / v.zoom;
      const vx0 = -v.scrollX;
      const vy0 = -v.scrollY;
      for (const el of slots) {
        const id = el.dataset["card"] ?? "";
        const r = rects.get(id);
        if (!r) continue;
        const far = el.classList.contains("is-far");
        if (id === keep.current.editing || id === keep.current.active) {
          if (far) el.classList.remove("is-far");
          continue;
        }
        const m = far ? 1 : 2;
        const out = r[2] < vx0 - m * mx || r[0] > vx0 + (m + 1) * mx || r[3] < vy0 - m * my || r[1] > vy0 + (m + 1) * my;
        if (out !== far) el.classList.toggle("is-far", out);
      }
    };
    cullRef.current = cull;
    cull(live.current ?? view);
    onLaidOut(view);
  });
  return (
    <div className={`board-cards${active ? " has-active" : ""}`} ref={layer}>
      <div className={`board-cards-plane${z * (window.devicePixelRatio || 1) * CARD_PICTURE_WIDTH > PICTURE_COPY ? " is-close" : ""}`} ref={plane}>
        {cards.map((e) => {
          const node = nodeData(e);
          if (!node) return null;
          // The card fills the shape up to the inner edge of its stroke: the
          // stroke is centred on the shape's edge. A picture is shown alone,
          // as on Obsidian's canvas: its card covers the stroke and the
          // rounded corners, and the shape's frame is not seen.
          const sw = typeof e["strokeWidth"] === "number" ? (e["strokeWidth"] as number) : 1;
          const bare = isBarePicture(node, host);
          // Excalidraw's stroke spreads past half its width by its
          // antialiasing: a picture covers one unit more.
          const inset = bare ? -(sw / 2 + 1) : sw / 2;
          const w = Math.max(1, e.width - 2 * inset);
          const h = Math.max(1, e.height - 2 * inset);
          const r = bare ? 0 : Math.max(0, Math.min(cornerRadius(e) - inset, w / 2, h / 2));
          const box = {
            width: `${w}px`,
            height: `${h}px`,
            ...(laidOut ? { zoom: z } : { transform: `scale(${z})`, transformOrigin: "0 0" }),
          } as CSSProperties;
          const angle = typeof e.angle === "number" && e.angle !== 0 ? e.angle : 0;
          const over = angle ? undefined : overlays.get(e.id);
          return (
            <div
              key={e.id}
              data-card={e.id}
              className={`board-card-slot${active === e.id ? " is-active" : ""}`}
              style={{
                left: `${(e.x + inset + view.scrollX) * z}px`,
                top: `${(e.y + inset + view.scrollY) * z}px`,
                width: `${w * z}px`,
                height: `${h * z}px`,
                clipPath: `path("${cardPath(w * z, h * z, r * z)}")`,
                ...(angle ? { transform: `rotate(${angle}rad)`, transformOrigin: "50% 50%" } : {}),
              }}
            >
              <div className="board-card-box" style={box}>
                <MemoCard
                  zoom={laidOut ? z : 1}
                  id={e.id}
                  fill={typeof e.fillStyle === "string" ? e.fillStyle : "solid"}
                  background={typeof e.backgroundColor === "string" && e.backgroundColor !== "transparent" && e.backgroundColor.toLowerCase() !== CARD_PAPER ? e.backgroundColor : null}
                  node={node}
                  host={host}
                  tick={tick}
                  editing={editing === e.id}
                  setEditing={setEditing}
                  swap={swap}
                  draw={draw}
                />
                {over && (
                  <div
                    className="board-card-over"
                    style={{ left: `${over.x - e.x - inset}px`, top: `${over.y - e.y - inset}px` }}
                    dangerouslySetInnerHTML={{ __html: over.svg }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OutlinePanel({
  outline,
  strings,
  annotations,
  onAnnotations,
  onFocus,
  onOpen,
}: {
  outline: Outline;
  strings: BoardStrings;
  annotations: boolean;
  onAnnotations: (on: boolean) => void;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}): JSX.Element {
  const row = (id: string, label: string): JSX.Element => (
    <li key={id}>
      <button type="button" className="board-outline-item" onFocus={() => onFocus(id)} onClick={() => onOpen(id)}>
        {label}
      </button>
    </li>
  );
  const empty = outline.groups.length === 0 && outline.loose.length === 0 && outline.edges.length === 0 && outline.annotations.length === 0;
  return (
    <aside className="board-outline" aria-label={strings.outlineHeading}>
      <h2 className="board-outline-heading">{strings.outlineHeading}</h2>
      {empty && <p className="board-outline-empty">{strings.empty}</p>}
      {outline.groups.length > 0 && (
        <section>
          <h3>{strings.groups}</h3>
          <ul>
            {outline.groups.map((g) => (
              <li key={g.group.id}>
                <button type="button" className="board-outline-item board-outline-group" onFocus={() => onFocus(g.group.id)} onClick={() => onOpen(g.group.id)}>
                  {g.group.label}
                </button>
                {g.items.length > 0 && <ul>{g.items.map((i) => row(i.id, i.label))}</ul>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {outline.loose.length > 0 && (
        <section>
          <h3>{outline.groups.length > 0 ? strings.outsideGroups : strings.cards}</h3>
          <ul>{outline.loose.map((i) => row(i.id, i.label))}</ul>
        </section>
      )}
      {outline.edges.length > 0 && (
        <section>
          <h3>{strings.connections}</h3>
          <ul>{outline.edges.map((i) => row(i.id, i.label))}</ul>
        </section>
      )}
      <label className="board-outline-toggle">
        <input type="checkbox" checked={annotations} onChange={(e) => onAnnotations(e.currentTarget.checked)} />
        {strings.showAnnotations}
      </label>
      {annotations && outline.annotations.length > 0 && (
        <section>
          <h3>{strings.annotations}</h3>
          <ul>{outline.annotations.map((i) => row(i.id, i.label))}</ul>
        </section>
      )}
    </aside>
  );
}

type Api = ExcalidrawImperativeAPI;

/** The colours a card is drawn in on a picture: the app's light paper, as
 *  an exported picture is light unless asked dark (Excalidraw inverts it). */
const PICTURE = { paper: "#f7f1e8", ink: "#2b2622", title: "#8a5a24", hair: "#d9cfc2", page: "#fbf7f0" };
const CARD_FONT = 6;
const CARD_LINE = 1.35;

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function sizeOf(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** The part `crop` of a picture, as a PNG of its own pixels. */
function cropped(url: string, size: { w: number; h: number }, crop: Crop): Promise<{ dataURL: string; size: { w: number; h: number } } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sw = Math.max(1, Math.round(crop.w * size.w));
      const sh = Math.max(1, Math.round(crop.h * size.h));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, crop.x * size.w, crop.y * size.h, sw, sh, 0, 0, sw, sh);
      resolve({ dataURL: canvas.toDataURL("image/png"), size: { w: sw, h: sh } });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A picture of the folder as an image element of the picture's export,
 *  fitted in a box and centred: its bytes go in `files`. Null when the
 *  file cannot be read. */
async function pictureOf(host: BoardHost, file: string, id: string, files: Record<string, unknown>, x: number, y: number, w: number, h: number, crop: Crop | null = null): Promise<unknown> {
  try {
    const blob = await (await fetch(host.fileSrc(file))).blob();
    let dataURL = await dataUrlOf(blob);
    let size = await sizeOf(dataURL);
    if (!size) return null;
    // A cropped card: the picture's part it shows, drawn anew as a PNG.
    if (crop) {
      const cut = await cropped(dataURL, size, crop);
      if (cut) {
        dataURL = cut.dataURL;
        size = cut.size;
      }
    }
    const k = Math.min(w / size.w, h / size.h);
    const iw = size.w * k;
    const ih = size.h * k;
    const fileId = `picture-${id}`;
    files[fileId] = { id: fileId, dataURL, mimeType: dataURL.startsWith("data:image/png") && crop ? "image/png" : blob.type || (ext(file) === "svg" ? "image/svg+xml" : `image/${ext(file)}`), created: Date.now() };
    return { type: "image", fileId, x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih };
  } catch {
    return null;
  }
}

/** The board's elements with each card turned into shapes Excalidraw
 *  draws — its box, its name, a line, its text or picture — in its place in
 *  the order; `only`: the selection and what belongs to it. */
async function pictureScene(api: Api, host: BoardHost, only: readonly string[] | null): Promise<{ elements: ExcalidrawElement[]; files: Record<string, unknown> }> {
  const s = host.strings;
  let all = api.getSceneElements() as readonly ExcalidrawElement[];
  if (only && only.length > 0) {
    const keep = new Set(only);
    all = all.filter((e) => keep.has(e.id) || (e.frameId && keep.has(e.frameId)) || ("containerId" in e && e.containerId && keep.has(e.containerId as string)));
  }
  try {
    await document.fonts.load("16px Nunito");
  } catch {
    // Measured with the fallback font.
  }
  const ctx = document.createElement("canvas").getContext("2d");
  const measure = (size: number) => (text: string): number => {
    if (!ctx) return text.length * size * 0.55;
    ctx.font = `${size}px Nunito, sans-serif`;
    return ctx.measureText(text).width;
  };
  const files: Record<string, unknown> = { ...api.getFiles() };
  const out: ExcalidrawElement[] = [];
  for (const e of all) {
    const node = e.type === "embeddable" && isNode(e as unknown as El) ? nodeData(e as unknown as El) : null;
    if (!node) {
      out.push(e);
      continue;
    }
    const { x, y, width: w, height: h } = e;
    const pad = 12;
    const file = typeof node.file === "string" ? node.file : "";
    const missing = node.type === "file" && !host.exists(file);
    // A picture card is the picture alone, as the board shows it.
    if (isBarePicture(node, host)) {
      const picture = await pictureOf(host, file, e.id, files, x, y, w, h, cardCrop(node));
      if (picture) {
        out.push(...(convertToExcalidrawElements([picture] as never, { regenerateIds: true }) as unknown as ExcalidrawElement[]));
        continue;
      }
    }
    const skels: unknown[] = [
      {
        type: "rectangle",
        x,
        y,
        width: w,
        height: h,
        strokeColor: e.strokeColor,
        backgroundColor: e.backgroundColor && e.backgroundColor !== "transparent" ? e.backgroundColor : PICTURE.paper,
        fillStyle: "solid",
        strokeWidth: e.strokeWidth,
        roughness: 0,
        roundness: e.roundness,
      },
    ];
    let top = y + 10;
    const title = node.type === "file" ? nodeName(node, s) : node.type === "link" ? s.linkCard : "";
    if (title) {
      const line = wrapLines(title, w - 2 * pad, 1, measure(16));
      skels.push({ type: "text", x: x + pad, y: top, text: line.join("\n"), fontSize: 16, fontFamily: CARD_FONT, strokeColor: PICTURE.title });
      top += 16 * CARD_LINE + 6;
      skels.push({ type: "line", x, y: top, width: w, height: 0, points: [[0, 0], [w, 0]], strokeColor: PICTURE.hair, strokeWidth: 1, roughness: 0 });
      top += 8;
    }
    const room = y + h - pad - top;
    let body = "";
    if (missing) body = s.missing;
    else if (node.type === "file" && ext(file) === "md") {
      // The note's own first heading repeats the card's name: said once.
      const lines = plainOf(await host.noteText(file)).split("\n");
      if ((lines[0] ?? "").trim().toLowerCase() === title.trim().toLowerCase()) lines.shift();
      body = lines.join("\n").trim();
    }
    else if (node.type === "text" && typeof node.text === "string") body = plainOf(node.text);
    else if (node.type === "link" && typeof node.url === "string") body = node.url;
    else if (node.type === "file" && IMAGE.test(ext(file)) && room > 8) {
      const picture = await pictureOf(host, file, e.id, files, x + pad, top, w - 2 * pad, room);
      if (picture) skels.push(picture);
      else body = nodeName(node, s);
    }
    if (body) {
      const lines = wrapLines(body, w - 2 * pad, Math.floor(room / (13 * CARD_LINE)), measure(13));
      if (lines.length > 0) skels.push({ type: "text", x: x + pad, y: top, text: lines.join("\n"), fontSize: 13, fontFamily: CARD_FONT, strokeColor: PICTURE.ink });
    }
    out.push(...(convertToExcalidrawElements(skels as never, { regenerateIds: true }) as unknown as ExcalidrawElement[]));
  }
  return { elements: out, files };
}

/** A picture card's crop (ADR 0057 point 10, revised 2026-10-06): the whole
 *  picture, and over it the part the card shows, moved by dragging inside
 *  it and sized by its corners and sides. Applied, the card shows that part
 *  at its proportions; the picture's file is never written. */
function CropDialog({ src, crop, strings: s, onApply, onClose }: { src: string; crop: Crop | null; strings: BoardStrings; onApply: (crop: Crop | null, aspect: number) => void; onClose: () => void }): JSX.Element {
  const [c, setC] = useState<Crop>(crop ?? { x: 0, y: 0, w: 1, h: 1 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button.primary")?.focus();
  }, []);
  const MIN = 0.03;
  /** A drag of the rectangle (`move`) or of its edges (`n`, `se`...). */
  const drag = (kind: string) => (down: ReactPointerEvent<HTMLElement>) => {
    down.preventDefault();
    down.stopPropagation();
    const f = frame.current?.getBoundingClientRect();
    if (!f) return;
    const start = { ...c };
    const x0 = down.clientX;
    const y0 = down.clientY;
    const target = down.currentTarget;
    target.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x0) / f.width;
      const dy = (e.clientY - y0) / f.height;
      let { x, y, w, h } = start;
      if (kind === "move") {
        x = Math.min(Math.max(0, x + dx), 1 - w);
        y = Math.min(Math.max(0, y + dy), 1 - h);
      } else {
        if (kind.includes("w")) {
          const nx = Math.min(Math.max(0, x + dx), x + w - MIN);
          w += x - nx;
          x = nx;
        }
        if (kind.includes("e")) w = Math.min(Math.max(MIN, w + dx), 1 - x);
        if (kind.includes("n")) {
          const ny = Math.min(Math.max(0, y + dy), y + h - MIN);
          h += y - ny;
          y = ny;
        }
        if (kind.includes("s")) h = Math.min(Math.max(MIN, h + dy), 1 - y);
      }
      setC({ x, y, w, h });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  const apply = () => {
    if (!size) return;
    onApply(c, (c.w * size.w) / (c.h * size.h));
  };
  const pct = (n: number) => `${n * 100}%`;
  return (
    <div
      className="board-export board-crop-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        else if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      }}
    >
      <div className="board-export-box" role="dialog" aria-modal="true" aria-label={s.cropTitle} ref={box}>
        <h2>{s.cropTitle}</h2>
        <p className="board-crop-hint">{s.cropHint}</p>
        <div className="board-crop-stage">
          <div className="board-crop-frame" ref={frame}>
            <img
              src={src}
              alt=""
              draggable={false}
              // Laid out at a size from its own proportions: a picture with
              // no size of its own (an SVG) would show at none.
              style={size ? (() => {
                const k = Math.min((Math.min(window.innerWidth * 0.7, 640)) / size.w, (window.innerHeight * 0.55) / size.h);
                return { width: `${Math.round(size.w * k)}px`, height: `${Math.round(size.h * k)}px` };
              })() : { width: "1px", height: "1px" }}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
            />
            <div className="board-crop-dim" aria-hidden="true">
              <div style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} />
            </div>
            <div className="board-crop-rect" data-testid="board-crop-rect" style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} onPointerDown={drag("move")}>
              {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((k) => (
                <span key={k} className={`board-crop-handle h-${k}`} data-handle={k} onPointerDown={drag(k)} />
              ))}
            </div>
          </div>
        </div>
        <div className="board-export-actions">
          <button type="button" className="primary" disabled={!size} onClick={apply}>
            {s.cropApply}
          </button>
          {crop && (
            <button type="button" onClick={() => onApply(null, size ? size.w / size.h : 1)}>
              {s.cropRestore}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}


/** Excalidraw's export dialog drew each card as an empty web embed; this
 *  one draws the board as it reads (`pictureScene`), and saves the picture
 *  in the folder, in Downloads, or copies it. */
function ExportDialog({ api, host, selected, onClose }: { api: Api; host: BoardHost; selected: readonly string[]; onClose: () => void }): JSX.Element {
  const s = host.strings;
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(false);
  const [only, setOnly] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hasSelection = selected.length > 0;

  const render = useCallback(
    async (fmt: "png" | "svg", k: number): Promise<Blob> => {
      const { elements, files } = await pictureScene(api, host, only && hasSelection ? selected : null);
      const bg = api.getAppState().viewBackgroundColor;
      const appState = {
        exportBackground: background,
        viewBackgroundColor: bg && bg !== "transparent" ? bg : PICTURE.page,
        exportWithDarkMode: dark,
        exportEmbedScene: false,
      };
      if (fmt === "svg") {
        const svg = await exportToSvg({ elements: elements as never, appState: appState as never, files: files as never, exportPadding: 24 });
        return new Blob([svg.outerHTML], { type: "image/svg+xml" });
      }
      return exportToBlob({
        elements: elements as never,
        appState: appState as never,
        files: files as never,
        mimeType: "image/png",
        exportPadding: 24,
        getDimensions: (w: number, h: number) => ({ width: w * k, height: h * k, scale: k }),
      });
    },
    [api, host, only, hasSelection, selected, background, dark],
  );

  useEffect(() => {
    let gone = false;
    let url: string | null = null;
    void render("png", 1).then(
      (blob) => {
        if (gone) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      },
      () => !gone && host.status(s.exportFailed),
    );
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [render, host, s]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, []);

  const name = `${host.name()}.${format}`;
  const run = (task: () => Promise<void>): void => {
    setBusy(true);
    void task()
      .catch(() => host.status(s.exportFailed))
      .finally(() => setBusy(false));
  };
  const toFolder = (): void =>
    run(async () => {
      const blob = await render(format, scale);
      const url = await dataUrlOf(blob);
      const path = await host.saveImage(name, url.split(",")[1] ?? "");
      if (path) {
        host.status(s.exportSavedTo(path));
        onClose();
      }
    });
  const toDownloads = (): void =>
    run(async () => {
      const blob = await render(format, scale);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      host.status(s.exportDownloaded(name));
      onClose();
    });
  const copy = (): void =>
    run(async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": render("png", scale) })]);
        host.status(s.exportCopied);
        onClose();
      } catch {
        host.status(s.exportCopyFailed);
      }
    });

  return (
    <div
      className="board-export"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="board-export-box" role="dialog" aria-modal="true" aria-label={s.exportTitle} ref={box}>
        <h2>{s.exportTitle}</h2>
        <div className="board-export-preview" aria-hidden="true">
          {preview ? <img src={preview} alt="" /> : <span>{s.exportRendering}</span>}
        </div>
        <div className="board-export-options">
          <div className="board-export-row" role="radiogroup" aria-label={s.exportFormat}>
            <span>{s.exportFormat}</span>
            {(["png", "svg"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {format === "png" && (
            <div className="board-export-row" role="radiogroup" aria-label={s.exportScale}>
              <span>{s.exportScale}</span>
              {[1, 2, 3].map((k) => (
                <button key={k} type="button" role="radio" aria-checked={scale === k} onClick={() => setScale(k)}>
                  {k}×
                </button>
              ))}
            </div>
          )}
          <label>
            <input type="checkbox" checked={background} onChange={(e) => setBackground(e.currentTarget.checked)} /> {s.exportBackground}
          </label>
          <label>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.currentTarget.checked)} /> {s.exportDark}
          </label>
          <label className={hasSelection ? "" : "is-off"}>
            <input type="checkbox" disabled={!hasSelection} checked={only && hasSelection} onChange={(e) => setOnly(e.currentTarget.checked)} /> {s.exportSelection}
          </label>
        </div>
        <div className="board-export-actions">
          <button type="button" className="primary" disabled={busy} title={s.exportToFolderTitle} onClick={toFolder}>
            {s.exportToFolder}
          </button>
          <button type="button" disabled={busy} onClick={toDownloads}>
            {s.exportToDownloads}
          </button>
          {format === "png" && (
            <button type="button" disabled={busy} onClick={copy}>
              {s.exportCopy}
            </button>
          )}
          <span className="board-export-gap" />
          <button type="button" onClick={onClose}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The whole board in view, as a canvas opens in Obsidian — never zoomed
 *  in past 100 %. */
function fit(a: Api): void {
  const elements = a.getSceneElements();
  if (elements.length > 0) a.setViewport({ target: margined(elements), fit: "scale-down", animation: false });
}

/** The box of `elements` with a margin, so that they fill 90 % of the view
 *  that fits it — as Excalidraw 0.18's `viewportZoomFactor: 0.9` did. */
function margined(elements: readonly ExcalidrawElement[]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of elements) {
    x0 = Math.min(x0, e.x);
    y0 = Math.min(y0, e.y);
    x1 = Math.max(x1, e.x + e.width);
    y1 = Math.max(y1, e.y + e.height);
  }
  const px = ((x1 - x0) * (1 / 0.9 - 1)) / 2;
  const py = ((y1 - y0) * (1 / 0.9 - 1)) / 2;
  return [x0 - px, y0 - py, x1 + px, y1 + py];
}

function Board({
  host,
  initial,
  bind,
}: {
  host: BoardHost;
  initial: CanvasDoc;
  bind: (load: (doc: CanvasDoc) => void, focus: () => void, refresh: () => void, find: () => void, flush: () => Promise<void>, addPath: (path: string, clientX?: number, clientY?: number) => void) => void;
}): JSX.Element {
  const s = host.strings;
  const api = useRef<Api | null>(null);
  const doc = useRef<CanvasDoc>(initial);
  const sent = useRef<string>("");
  /** Whether the user has acted on the board or its view since it was
   *  drawn: from then on the view is theirs, and the pane's size no longer
   *  brings the whole board back. A press is not an edit (`edited`). */
  const touched = useRef(false);
  /** Whether the user changed the board since it was drawn from the file:
   *  only then is anything written (invariant 7; decided on 2026-10-01,
   *  review `board.md` §6 item 3). A change is the user's when the scene
   *  moved past what the board itself last made of it (`own`): a text
   *  measured again once its font is in, a marker dropped, an edge lifted
   *  out of a group. A press, a selection, a pan or a zoom changes no
   *  element and writes nothing; what the board adjusted rides along with
   *  the first real edit. */
  const edited = useRef(false);
  /** The scene's signature — the sum of its elements' versions and the
   *  background — as the board itself last left it; null until the first
   *  change Excalidraw reports. */
  const ownSig = useRef<string | null>(null);
  /** False once the board is unmounting: nothing is read from Excalidraw
   *  after that. */
  const alive = useRef(true);
  /** A board of a later Verso (`verso.version` above the one this build
   *  writes) is shown and never written (review `board.md`, reading 2,
   *  finding 8). */
  const readOnly = typeof initial.verso?.version === "number" && initial.verso.version > BOARD_VERSION;
  /** The board opened where it was left (the setting): the pane's size no
   *  longer brings the whole board back into view. */
  const restoredView = useRef(false);
  /** The view is the user's from the first frame on: only then is it kept. */
  const viewReady = useRef(false);
  const [exporting, setExporting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const container = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(host.dark());
  const [showOutline, setShowOutline] = useState(false);
  const [annotations, setAnnotations] = useState(false);
  const [elements, setElements] = useState<readonly El[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  /** Bumped when the folder changes: the cards draw their notes again. */
  const [tick, setTick] = useState(0);
  const searchBox = useRef<HTMLInputElement>(null);
  // The cards Verso draws over the canvas (CardLayer): which, where the
  // view is when it last settled, which one is entered.
  const [cards, setCards] = useState<readonly El[]>([]);
  const cardsKey = useRef("");
  const settledRef = useRef<View>({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 });
  const [settled, setSettled] = useState<View>(settledRef.current);
  const settleTimer = useRef<number | undefined>(undefined);
  const plane = useRef<HTMLDivElement | null>(null);
  /** The view as it is now; the view the cards are placed for (`base`). */
  const liveRef = useRef<View>(settledRef.current);
  const baseRef = useRef<View>(settledRef.current);
  const cullRef = useRef<((v: View) => void) | null>(null);
  const rememberTimer = useRef<number | undefined>(undefined);
  /** What the elements are, and what an edit under way is, when the work
   *  that reads them last ran (`onChange`). */
  const workKey = useRef("");
  const cardById = useRef(new Map<string, El>());
  // The plane follows the view from where its cards are placed: a
  // translation snapped to the screen's pixels (text stays crisp), and a
  // scale while a zoom is under way, until the cards are laid out again.
  const place = useCallback(() => {
    const p = plane.current;
    const base = baseRef.current;
    const v = liveRef.current;
    if (!p || base.width === 0 || base.zoom <= 0) return;
    const k = v.zoom / base.zoom;
    const dpr = window.devicePixelRatio || 1;
    const snap = (n: number): number => Math.round(n * dpr) / dpr;
    const dx = (v.scrollX - base.scrollX) * v.zoom;
    const dy = (v.scrollY - base.scrollY) * v.zoom;
    p.style.transform = k === 1 ? (dx === 0 && dy === 0 ? "" : `translate(${snap(dx)}px, ${snap(dy)}px)`) : `translate(${dx}px, ${dy}px) scale(${k})`;
  }, []);
  const laidOut = useCallback(
    (v: View) => {
      baseRef.current = v;
      place();
    },
    [place],
  );
  const [active, setActive] = useState<string | null>(null);
  // The card whose note is edited in it; leaving the card leaves the editor.
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (editing && active !== editing) setEditing(null);
  }, [active, editing]);
  const [layerHost, setLayerHost] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const [hit, setHit] = useState(0);
  /** The search the view last went to the first match of. */
  const searched = useRef("");
  /** The notes' text, read once per change of the folder, for the search. */
  const noteTexts = useRef(new Map<string, string>());
  const outlineTimer = useRef<number | undefined>(undefined);

  const restored = useCallback((d: CanvasDoc): ExcalidrawElement[] => {
    return restoreElements(toElements(d) as never, null, { refreshDimensions: true, repairBindings: true });
  }, []);
  const initialElements = useMemo(() => restored(initial), [initial, restored]);

  const baseline = useCallback((els: readonly ExcalidrawElement[], d: CanvasDoc) => {
    doc.current = d;
    sent.current = JSON.stringify(fromElements(els as unknown as El[], d));
  }, []);

  /** The scene's signature: what an edit, the user's or the board's, moves. */
  const sigOf = (a: Api): string => `${getSceneVersion(a.getSceneElementsIncludingDeleted() as never)}|${a.getAppState().viewBackgroundColor}`;
  /** A change past what the board itself made is the user's (`edited`). The
   *  first signature seen is the board as drawn. */
  const noteUser = useCallback((): void => {
    const a = api.current;
    if (!a) return;
    const sig = sigOf(a);
    if (ownSig.current === null) {
      ownSig.current = sig;
      return;
    }
    if (sig === ownSig.current) return;
    ownSig.current = sig;
    if (!edited.current) {
      edited.current = true;
      host.changed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  /** A change the board makes by itself: whatever the user changed before
   *  it is counted first, and the change itself is not theirs. */
  const own = useCallback(
    (update: (a: Api) => void): void => {
      const a = api.current;
      if (!a) return;
      noteUser();
      update(a);
      ownSig.current = sigOf(a);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteUser],
  );

  // Text is measured with the fonts the window has when the board opens:
  // before a font arrives, with a fallback, narrower or wider. Excalidraw
  // 0.18 draws the text again once its font is in but keeps the box it
  // measured, and the text comes out cut. Once the fonts of a board's text
  // are in, that text is measured again — not a change of the user's: no
  // history, and nothing written until the user changes something.
  const remeasure = useCallback(() => {
    const a = api.current;
    if (!a) return;
    // A text being typed or drawn is Excalidraw's to measure.
    const st = a.getAppState();
    if (st.editingTextElement || st.newElement || st.resizingElement) return;
    const els = a.getSceneElements();
    const ready = new Set(els.filter((e) => e.type === "text" && fontReady(e)).map((e) => e.id));
    if (ready.size === 0) return;
    // Excalidraw measures text again only while it repairs bindings (on
    // copies: the scene's elements are not touched), and from the text as
    // typed, as it lays a text out when its box changes: a line broken at a
    // fallback's widths is laid out again, not broken once more.
    const input = els.map((e) => (e.type === "text" && ready.has(e.id) ? { ...e, text: e.originalText } : e));
    const fresh = new Map(restoreElements(input, null, { refreshDimensions: true, repairBindings: true }).map((e) => [e.id, e] as const));
    const near = (p: number, q: number): boolean => Math.abs(p - q) < 0.5;
    let changed = false;
    const next = els.map((e) => {
      const f = ready.has(e.id) ? fresh.get(e.id) : undefined;
      if (!f || e.type !== "text" || f.type !== "text") return e;
      if (near(f.width, e.width) && near(f.height, e.height) && near(f.x, e.x) && near(f.y, e.y) && f.text === e.text) return e;
      changed = true;
      return newElementWith(e, { width: f.width, height: f.height, x: f.x, y: f.y, text: f.text });
    });
    if (changed) own((b) => b.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER }));
  }, [own]);
  useEffect(() => {
    const fonts = document.fonts;
    fonts.addEventListener("loadingdone", remeasure);
    return () => fonts.removeEventListener("loadingdone", remeasure);
  }, [remeasure]);
  /** Measure the texts of `els` again once their fonts are in (`fontsOf`). */
  const remeasureWhenFontsIn = useCallback(
    (els: readonly ExcalidrawElement[]) => void fontsOf(els).then(() => alive.current && remeasure()),
    [remeasure],
  );

  useEffect(() => {
    baseline(initialElements, initial);
    setElements(initialElements as unknown as El[]);
    bind(
      (d) => {
        const els = restored(d);
        window.clearTimeout(timer.current);
        touched.current = false;
        baseline(els, d);
        own((a) => a.updateScene({ elements: els, appState: { viewBackgroundColor: backgroundOf(d) ?? "transparent" } as never, captureUpdate: CaptureUpdateAction.NEVER }));
        remeasureWhenFontsIn(els);
        // The file as it is now: nothing of the user's is left over.
        edited.current = false;
        setElements(els as unknown as El[]);
        syncCards(els);
      },
      () => container.current?.querySelector<HTMLElement>(".excalidraw")?.focus(),
      () => setTick((n) => n + 1),
      () => {
        searchBox.current?.focus();
        searchBox.current?.select();
      },
      () => {
        window.clearTimeout(timer.current);
        return flushRef.current();
      },
      (path, x, y) => addPathRef.current(path, x, y),
    );
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = (): void => setDark(host.dark());
    media.addEventListener("change", theme);
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", theme);
      watch.disconnect();
      // The tab saves what is left before it lets the board go (its
      // `flush`); once Excalidraw has unmounted, its scene is empty, and a
      // save from here would write an empty board.
      alive.current = false;
      window.clearTimeout(timer.current);
      window.clearTimeout(outlineTimer.current);
    };
    // Once: `initial` is the document the pane was mounted with.
  }, []);

  // Until the user touches the board, it follows the size of its pane —
  // a tab shown after being hidden, a window resized or maximized — with
  // its whole content in view.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let wait: number | undefined;
    const watch = new ResizeObserver(() => {
      window.clearTimeout(wait);
      wait = window.setTimeout(() => {
        const a = api.current;
        if (!a || touched.current || restoredView.current || el.clientWidth === 0 || el.clientHeight === 0) return;
        a.refresh();
        fit(a);
      }, 150);
    });
    watch.observe(el);
    return () => {
      window.clearTimeout(wait);
      watch.disconnect();
    };
  }, []);

  const flush = useCallback((): Promise<void> => {
    const a = api.current;
    if (!a || readOnly || !alive.current) return Promise.resolve();
    noteUser();
    const next = fromElements(a.getSceneElementsIncludingDeleted() as unknown as El[], doc.current, a.getAppState().viewBackgroundColor);
    const json = JSON.stringify(next);
    if (json === sent.current) {
      // An edit undone before its save: nothing is left to write, and the
      // tab is told so (review `board.md`, second reading, finding 3).
      if (edited.current) {
        edited.current = false;
        host.settled?.();
      }
      return Promise.resolve();
    }
    sent.current = json;
    if (!edited.current) return Promise.resolve();
    doc.current = next;
    // What follows this save is the user's again only when they act again:
    // a font that arrives later is measured, and rides with the next edit,
    // never written on its own (second reading, finding 4). The scene as
    // saved is the board's own from here.
    edited.current = false;
    ownSig.current = sigOf(a);
    return Promise.resolve(host.save(json));
  }, [host, noteUser, readOnly]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const addPathRef = useRef<(path: string, x?: number, y?: number) => void>(() => undefined);
  useEffect(() => {
    if (readOnly) host.status(s.newerBoard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A card's link is the marker Excalidraw validates before it draws the
  // card, once per element; it also paints a link icon on every element
  // with a link. Once validated, the marker goes: the card stays drawn, and
  // no icon, no address in a copy. Not a change of the user's (the file
  // never held it), so nothing is written for it.
  const markerTimer = useRef<number | undefined>(undefined);
  const dropMarkers = useCallback((els: readonly ExcalidrawElement[]) => {
    if (!els.some((e) => e.type === "embeddable" && e.link === MARKER && !e.isDeleted)) return;
    window.clearTimeout(markerTimer.current);
    markerTimer.current = window.setTimeout(() => {
      const a = api.current;
      if (!a) return;
      const now = a.getSceneElementsIncludingDeleted();
      if (!now.some((e) => e.type === "embeddable" && e.link === MARKER)) return;
      own((b) =>
        b.updateScene({
          elements: now.map((e) => (e.type === "embeddable" && e.link === MARKER ? newElementWith(e, { link: null }) : e)),
          captureUpdate: CaptureUpdateAction.NEVER,
        }),
      );
    }, 300);
  }, [own]);

  const syncCards = useCallback((els: readonly ExcalidrawElement[]) => {
    const list = (els as unknown as El[]).filter((e) => e.type === "embeddable" && !e.isDeleted && isNode(e));
    cardById.current = new Map(list.map((e) => [e.id, e]));
    const key = list.map((e) => `${e.id}:${String(e["version"])}`).join("|");
    if (key === cardsKey.current) return;
    cardsKey.current = key;
    setCards(list);
  }, []);

  // What is drawn above each card, in the board's order, drawn again over
  // it. Worked out one frame after a change, and only for a card whose
  // elements above changed: moving a card alone keeps its picture.
  const [overlays, setOverlays] = useState<ReadonlyMap<string, Overlay>>(new Map());
  const overlaysRef = useRef<{ map: ReadonlyMap<string, Overlay>; keys: Map<string, string> }>({ map: new Map(), keys: new Map() });
  const sceneRef = useRef<readonly ExcalidrawElement[]>([]);
  const overlayFrame = useRef(0);
  const overlayBusy = useRef(false);
  const overlayAgain = useRef(false);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const runOverlays = useCallback(async (): Promise<void> => {
    if (overlayBusy.current) {
      overlayAgain.current = true;
      return;
    }
    overlayBusy.current = true;
    try {
      // What is being drawn is Excalidraw's own canvas's, above the cards
      // (style.css); a copy here would trail the pointer beside it.
      const st = api.current?.getAppState();
      const drawing = new Set([st?.newElement?.id, st?.multiElement?.id].filter((v): v is string => typeof v === "string"));
      const els = (sceneRef.current as unknown as El[]).filter((e) => !e.isDeleted && !drawing.has(e.id));
      const bounds = els.map((e) => getCommonBounds([e as unknown as ExcalidrawElement]));
      const prev = overlaysRef.current;
      const map = new Map<string, Overlay>();
      const keys = new Map<string, string>();
      const jobs: Promise<void>[] = [];
      els.forEach((card, i) => {
        if (card.type !== "embeddable" || !isNode(card)) return;
        const [cx0, cy0, cx1, cy1] = bounds[i]!;
        const above: El[] = [];
        let aboveBounds: [number, number, number, number] | null = null;
        for (let j = i + 1; j < els.length; j++) {
          const o = els[j]!;
          if (o.type === "embeddable" || o.type === "iframe" || o.type === "frame" || o.type === "magicframe") continue;
          const [ox0, oy0, ox1, oy1] = bounds[j]!;
          if (ox1 < cx0 || ox0 > cx1 || oy1 < cy0 || oy0 > cy1) continue;
          above.push(o);
          aboveBounds = aboveBounds
            ? [Math.min(aboveBounds[0], ox0), Math.min(aboveBounds[1], oy0), Math.max(aboveBounds[2], ox1), Math.max(aboveBounds[3], oy1)]
            : [ox0, oy0, ox1, oy1];
        }
        if (!above.length || !aboveBounds) return;
        const key = `${darkRef.current ? "d" : "l"}|${above.map((o) => `${o.id}:${String(o["version"])}`).join("|")}`;
        keys.set(card.id, key);
        const kept = prev.map.get(card.id);
        if (kept && prev.keys.get(card.id) === key) {
          map.set(card.id, kept);
          return;
        }
        const [minX, minY] = getCommonBounds(above as unknown as ExcalidrawElement[]);
        jobs.push(
          exportToSvg({
            elements: above as unknown as ExcalidrawElement[],
            appState: { exportBackground: false, exportWithDarkMode: darkRef.current, viewBackgroundColor: "transparent" },
            files: api.current?.getFiles() ?? null,
            exportPadding: 0,
            skipInliningFonts: true,
          }).then(
            (svg: SVGSVGElement) => void map.set(card.id, { x: minX, y: minY, svg: svg.outerHTML }),
            () => keys.delete(card.id),
          ),
        );
      });
      await Promise.all(jobs);
      const same = map.size === prev.map.size && [...map].every(([k, v]) => prev.map.get(k) === v);
      overlaysRef.current = { map, keys };
      if (!same) setOverlays(map);
    } finally {
      overlayBusy.current = false;
      if (overlayAgain.current) {
        overlayAgain.current = false;
        void runOverlays();
      }
    }
  }, []);
  const scheduleOverlays = useCallback(
    (els: readonly ExcalidrawElement[]) => {
      sceneRef.current = els;
      if (overlayFrame.current) return;
      overlayFrame.current = window.requestAnimationFrame(() => {
        overlayFrame.current = 0;
        void runOverlays();
      });
    },
    [runOverlays],
  );
  useEffect(() => {
    overlaysRef.current = { map: overlaysRef.current.map, keys: new Map() };
    scheduleOverlays(sceneRef.current);
  }, [dark, scheduleOverlays]);
  useEffect(() => () => window.cancelAnimationFrame(overlayFrame.current), []);

  // A card's buttons (open, swap), under Excalidraw's selection canvas, are pressed
  // here: the topmost card under the pointer decides, as the eye does.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let pressed: HTMLElement | null = null;
    let hover: HTMLElement | null = null;
    const inside = (r: DOMRect, x: number, y: number): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const buttonAt = (x: number, y: number): HTMLElement | null => {
      const slots = root.querySelectorAll<HTMLElement>(".board-card-slot:not(.is-far)");
      for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i]!;
        if (!inside(slot.getBoundingClientRect(), x, y)) continue;
        if (slot.classList.contains("is-active")) return null;
        for (const b of slot.querySelectorAll<HTMLElement>("button.board-card-open")) if (inside(b.getBoundingClientRect(), x, y)) return b;
        return null;
      }
      return null;
    };
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const b = buttonAt(e.clientX, e.clientY);
      if (!b) return;
      pressed = b;
      e.stopPropagation();
      e.preventDefault();
    };
    const up = (e: PointerEvent): void => {
      if (!pressed) return;
      const b = pressed;
      pressed = null;
      e.stopPropagation();
      if (buttonAt(e.clientX, e.clientY) === b) b.click();
    };
    const move = (e: PointerEvent): void => {
      const b = e.buttons ? null : buttonAt(e.clientX, e.clientY);
      if (b === hover) return;
      hover?.classList.remove("is-hover");
      b?.classList.add("is-hover");
      root.classList.toggle("is-over-open", !!b);
      hover = b;
    };
    root.addEventListener("pointerdown", down, true);
    root.addEventListener("pointerup", up, true);
    root.addEventListener("pointermove", move, true);
    return () => {
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("pointerup", up, true);
      root.removeEventListener("pointermove", move, true);
    };
  }, []);

  // Excalidraw puts a shape drawn inside a frame just under the frame, and
  // a group's frame sits under its cards (the canvas's order): a shape
  // drawn on a card in a group would land under the card. Once drawn, it
  // goes to the top of its frame's range instead, as a shape drawn
  // anywhere else goes to the top.
  const seen = useRef<Set<string> | null>(null);
  // An arrow between two cards is a canvas edge: it belongs to no group
  // and passes under the cards, as the board reads it from the file.
  // Excalidraw puts an arrow begun inside a frame in that frame and clips it
  // to the frame's box, so an edge to a card of another group was cut at the
  // group's border until the board was opened again.
  const freeEdges = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const byId = new Map(els.map((e) => [e.id, e] as const));
    const node = (id: string | undefined): boolean => {
      const e = id ? byId.get(id) : undefined;
      return !!e && !e.isDeleted && isNode(e as unknown as El);
    };
    const edge = (e: ExcalidrawElement): boolean => {
      const a = e as unknown as El;
      return e.type === "arrow" && !e.isDeleted && node(a.startBinding?.elementId) && node(a.endBinding?.elementId);
    };
    const firstNode = els.findIndex((e) => !e.isDeleted && isNode(e as unknown as El));
    // An edge in a group, above the first card, or with its label in a
    // group (a label typed on the edge later is put in the edge's group,
    // and a text in a frame is drawn only inside the frame's box).
    const labelInFrame = (e: ExcalidrawElement): boolean => (e.boundElements ?? []).some((b) => b.type === "text" && !!byId.get(b.id)?.frameId);
    const wrong = els.filter((e, i) => edge(e) && (e.frameId || (firstNode >= 0 && i > firstNode) || labelInFrame(e)));
    if (wrong.length === 0) return false;
    const moving = new Set<string>();
    for (const e of wrong) {
      moving.add(e.id);
      for (const b of e.boundElements ?? []) if (b.type === "text") moving.add(b.id);
    }
    const lifted = els
      .filter((e) => moving.has(e.id))
      .map((e) => (e.frameId ? newElementWith(e as never, { frameId: null } as never) : e) as ExcalidrawElement);
    const rest = els.filter((e) => !moving.has(e.id));
    const at = rest.findIndex((e) => !e.isDeleted && isNode(e as unknown as El));
    const list = at < 0 ? [...rest, ...lifted] : [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
    own((a) => a.updateScene({ elements: list, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  // An edge — an arrow from a card to a card — passes under the cards, as
  // the canvas draws it: an end bound inside a card would end under it and
  // its head would not show. Such an end is bound on the card's outline
  // instead, aimed at the same point (ADR 0057 point 20). An arrow with an
  // end on a shape of the drawing is the drawing's, drawn over the cards:
  // Excalidraw's own way stands, its head at the point inside a picture.
  const orbitOnCards = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const byId = new Map(els.map((e) => [e.id, e] as const));
    const card = (b: Binding | null | undefined): El | undefined => {
      const n = b ? (byId.get(b.elementId) as unknown as El | undefined) : undefined;
      return n && !n.isDeleted && isNode(n) ? n : undefined;
    };
    let changed = false;
    const next = els.map((e) => {
      if (e.type !== "arrow" || e.isDeleted) return e;
      const a = e as unknown as El;
      const pts = a.points;
      if (a["elbowed"] === true || !pts || pts.length < 2) return e;
      const from = card(a.startBinding);
      const to = card(a.endBinding);
      if (!from || !to) return e;
      const fromAt = from && a.startBinding?.mode === "inside" ? a.startBinding.fixedPoint : null;
      const toAt = to && a.endBinding?.mode === "inside" ? a.endBinding.fixedPoint : null;
      if (!fromAt && !toAt) return e;
      const abs = pts.map((p) => [a.x + p[0], a.y + p[1]] as [number, number]);
      const n = abs.length - 1;
      // Each end aimed from the point the other end is bound at, or from
      // the arrow's next point when it bends.
      const target = (c: El | undefined, b: Binding | null | undefined, drawn: [number, number]): [number, number] => (c && b?.fixedPoint ? pointIn(c, b.fixedPoint) : drawn);
      if (fromAt) abs[0] = endAt(from, { fixedPoint: [fromAt[0], fromAt[1]], mode: "orbit" }, n > 1 ? abs[1]! : target(to, a.endBinding, abs[n]!));
      if (toAt) abs[n] = endAt(to, { fixedPoint: [toAt[0], toAt[1]], mode: "orbit" }, n > 1 ? abs[n - 1]! : target(from, a.startBinding, abs[0]!));
      const [x, y] = abs[0]!;
      const rel = abs.map(([px, py]) => [px - x, py - y] as [number, number]);
      const xs = rel.map((p) => p[0]);
      const ys = rel.map((p) => p[1]);
      changed = true;
      return newElementWith(e as never, {
        x,
        y,
        points: rel,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        startBinding: fromAt ? { ...a.startBinding, mode: "orbit" } : a.startBinding,
        endBinding: toAt ? { ...a.endBinding, mode: "orbit" } : a.endBinding,
      } as never) as ExcalidrawElement;
    });
    if (!changed) return false;
    own((api2) => api2.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  // "Loose arrows": an arrow drawn while it is on attaches to no card, as
  // one drawn with ⌘ held does (Excalidraw's own way, which nothing
  // shows). An edge read from the file is never touched: it carries its
  // canvas data.
  const loose = useRef(false);
  const [looseOn, setLooseOn] = useState(false);
  // How to draw a free arrow, said while the arrow tool is held: nothing
  // else on screen shows ⌘'s part, and a touch screen has no ⌘ at all.
  const [arrowTool, setArrowTool] = useState(false);
  const hintSlot = useHintSlot(container, arrowTool);
  const touchOnly = useMemo(() => typeof window.matchMedia === "function" && !window.matchMedia("(any-pointer: fine)").matches, []);
  const arrowHint = looseOn ? s.looseOnHint : touchOnly ? s.looseHintTouch : s.looseHint;
  const born = useRef<Set<string> | null>(null);
  const looseFresh = useCallback((els: readonly ExcalidrawElement[], state: AppState): boolean => {
    const known = born.current;
    if (!known) {
      born.current = new Set(els.map((e) => e.id));
      return false;
    }
    if (state.newElement || state.multiElement || state.editingTextElement || state.selectedLinearElement?.isEditing || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
    const fresh = els.filter((e) => !known.has(e.id));
    for (const e of fresh) known.add(e.id);
    if (!loose.current) return false;
    const ids = new Set(
      fresh
        .filter((e) => e.type === "arrow" && !e.isDeleted && (e.startBinding || e.endBinding) && !(e as unknown as El).customData?.canvas)
        .map((e) => e.id),
    );
    if (ids.size === 0) return false;
    const next = els.map((e) => {
      if (ids.has(e.id)) return newElementWith(e as never, { startBinding: null, endBinding: null } as never) as ExcalidrawElement;
      if ((e.boundElements ?? []).some((b) => ids.has(b.id))) return newElementWith(e as never, { boundElements: (e.boundElements ?? []).filter((b) => !ids.has(b.id)) } as never) as ExcalidrawElement;
      return e;
    });
    own((api2) => api2.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER }));
    return true;
  }, [own]);

  const liftDrawn = useCallback((els: readonly ExcalidrawElement[], state: AppState): void => {
    const known = seen.current;
    if (!known) {
      seen.current = new Set(els.map((e) => e.id));
      return;
    }
    if (state.newElement || state.multiElement || state.editingTextElement || state.resizingElement || state.selectedElementsAreBeingDragged) return;
    const fresh = els.filter((e) => !known.has(e.id));
    if (fresh.length === 0) return;
    for (const e of fresh) known.add(e.id);
    const list = [...els];
    let moved = false;
    for (const e of fresh) {
      if (!e.frameId || e.isDeleted || isNode(e as unknown as El)) continue;
      const at = list.indexOf(e);
      let last = -1;
      list.forEach((o, k) => {
        if (o !== e && !o.isDeleted && (o.frameId === e.frameId || o.id === e.frameId)) last = k;
      });
      if (last <= at) continue;
      list.splice(at, 1);
      list.splice(last, 0, e);
      moved = true;
    }
    if (moved) own((a) => a.updateScene({ elements: list, captureUpdate: CaptureUpdateAction.NEVER }));
  }, [own]);

  // The layer lives inside Excalidraw's own root, beside its canvases, so
  // that its menus and toolbar stay above the cards.
  useEffect(() => {
    setLayerHost(container.current?.querySelector<HTMLElement>(".excalidraw") ?? null);
  }, []);
  // Nearest the view first: the distance from a card's centre to the
  // view's, in the board's units.
  const draw = useMemo(
    () =>
      drawQueue((id) => {
        const e = cardById.current.get(id);
        const v = liveRef.current;
        if (!e || v.width === 0 || v.zoom <= 0) return Number.MAX_VALUE;
        const dx = e.x + e.width / 2 - (-v.scrollX + v.width / (2 * v.zoom));
        const dy = e.y + e.height / 2 - (-v.scrollY + v.height / (2 * v.zoom));
        return dx * dx + dy * dy;
      }),
    [],
  );

  const onChange = useCallback(
    (els: readonly ExcalidrawElement[], state: AppState) => {
      setArrowTool(state.activeTool.type === "arrow");
      // Excalidraw calls this on every frame the view moves. What reads the
      // elements — the cards, the overlays, the edges, the save, the
      // outline — runs only when they, an edit under way, or the background
      // changed: a view that moves changes none of them.
      const key = [
        getSceneVersion(els as never),
        state.newElement?.id ?? "",
        state.multiElement?.id ?? "",
        state.editingTextElement?.id ?? "",
        state.resizingElement?.id ?? "",
        state.selectedElementsAreBeingDragged ? 1 : 0,
        state.selectedLinearElement?.isEditing ? 1 : 0,
        state.viewBackgroundColor,
      ].join("|");
      if (key !== workKey.current) {
        workKey.current = key;
        noteUser();
        dropMarkers(els);
        syncCards(els);
        scheduleOverlays(els);
        if (!looseFresh(els, state) && !orbitOnCards(els, state) && !freeEdges(els, state)) liftDrawn(els, state);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, SAVE_DELAY);
        window.clearTimeout(outlineTimer.current);
        // A copy: Excalidraw changes some elements in place (a frame's name
        // typed over it) and hands back the same list, which React would
        // take for no change at all.
        outlineTimer.current = window.setTimeout(() => setElements([...els] as unknown as El[]), 300);
      }
      // The view: the cards follow it at once, with one transform of their
      // plane; cards near it are shown, far ones hidden. A change of zoom
      // or size lays them out again once the view settles; a view that only
      // moves never does.
      const v: View = { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value, width: state.width, height: state.height };
      const was = liveRef.current;
      if (v.scrollX !== was.scrollX || v.scrollY !== was.scrollY || v.zoom !== was.zoom || v.width !== was.width || v.height !== was.height) {
        liveRef.current = v;
        place();
        cullRef.current?.(v);
        const s0 = settledRef.current;
        const settle = (): void => {
          settledRef.current = liveRef.current;
          setSettled(liveRef.current);
        };
        if (s0.width === 0) settle();
        else if (v.zoom !== s0.zoom || v.width !== s0.width || v.height !== s0.height) {
          window.clearTimeout(settleTimer.current);
          settleTimer.current = window.setTimeout(settle, 150);
        }
        window.clearTimeout(rememberTimer.current);
        rememberTimer.current = window.setTimeout(() => {
          const r = liveRef.current;
          if (viewReady.current) host.rememberView({ scrollX: r.scrollX, scrollY: r.scrollY, zoom: r.zoom });
        }, 400);
      }
      const entered = state.activeEmbeddable?.state === "active" ? state.activeEmbeddable.element.id : null;
      setActive((was) => (was === entered ? was : entered));
      const ids = Object.keys(state.selectedElementIds).filter((k) => state.selectedElementIds[k]);
      setSelected((was) => (was.length === ids.length && was.every((v, i) => v === ids[i]) ? was : ids));
    },
    [flush, noteUser, dropMarkers, syncCards, scheduleOverlays, liftDrawn, freeEdges, orbitOnCards, looseFresh, host, place],
  );

  const center = (): [number, number] => {
    const a = api.current;
    if (!a) return [0, 0];
    const st = a.getAppState();
    const p = viewportCoordsToSceneCoords({ clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 }, st);
    return [p.x, p.y];
  };

  // Excalidraw hears the keyboard only while focus is inside it — a key
  // pressed in another pane must not delete what the board has selected —
  // and a press on its canvas does not move focus there by itself: it stays
  // where it was, in the file list's search or on a toolbar button, and
  // ⌘Z, Delete and the tools' keys went nowhere.
  const focusBoard = (): void => {
    const root = container.current?.querySelector<HTMLElement>(".excalidraw");
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  };
  const writable = (t: EventTarget | null): boolean =>
    t instanceof HTMLElement && (t.isContentEditable || !!t.closest(".board-card-editor") || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "button", "range"].includes(t.type)));

  const add = (node: CanvasNode): void => {
    const a = api.current;
    if (!a) return;
    touched.current = true;
    focusBoard();
    const [el] = restoreElements(toElements({ nodes: [node], edges: [] }) as never, null, { refreshDimensions: false });
    if (!el) return;
    a.updateScene({
      elements: [...a.getSceneElementsIncludingDeleted(), el],
      appState: { selectedElementIds: { [el.id]: true } } as never,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const addFile = async (): Promise<void> => {
    const path = await host.pickFile();
    if (path) add(newNode("file", path, center(), randomId()));
  };
  const addText = async (): Promise<void> => {
    const text = await host.prompt(s.editText, "", true);
    if (text !== null && text.trim() !== "") add(newNode("text", text, center(), randomId()));
  };
  const addLink = async (): Promise<void> => {
    const url = (await host.prompt(s.linkAddress, "https://", false))?.trim();
    if (url && /^https?:\/\/\S+$/.test(url)) add(newNode("link", url, center(), randomId()));
  };

  const byId = (id: string): El | undefined => (api.current?.getSceneElements() as unknown as El[] | undefined)?.find((e) => e.id === id);

  const openNode = (e: El, aside: boolean): boolean => {
    const n = nodeData(e);
    if (!n) return false;
    if (n.type === "file" && typeof n.file === "string") host.openFile(n.file, aside);
    else if (n.type === "link" && typeof n.url === "string") host.openUrl(n.url);
    else if (n.type === "text") void editText(e, n);
    else return false;
    return true;
  };

  // A file card whose file is not in the folder (renamed or moved outside
  // the app, or written by another app from another root): pointed at a
  // file of the folder again, the search filled with the name it had.
  const relink = async (e: El, n: CanvasNode): Promise<void> => {
    const a = api.current;
    if (!a) return;
    const was = typeof n.file === "string" ? n.file : "";
    const chosen = await host.pickFile(was.split("/").pop() ?? was);
    if (!chosen || chosen === was) return;
    touched.current = true;
    const now = a.getSceneElementsIncludingDeleted();
    a.updateScene({
      elements: now.map((x) => (x.id === e.id ? newElementWith(x, { customData: { ...(x.customData ?? {}), canvas: { ...n, file: chosen } } }) : x)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    host.status(s.relinked(chosen));
  };

  const relinkRef = useRef(relink);
  relinkRef.current = relink;
  const swapCard = useCallback((id: string): void => {
    const e = (api.current?.getSceneElements() as unknown as El[] | undefined)?.find((x) => x.id === id);
    const n = e ? nodeData(e) : null;
    if (e && n && n.type === "file") void relinkRef.current(e, n);
  }, []);

  const editText = async (e: El, n: CanvasNode): Promise<void> => {
    const a = api.current;
    if (!a) return;
    const next = await host.prompt(s.editText, typeof n.text === "string" ? n.text : "", true);
    if (next === null) return;
    touched.current = true;
    const now = a.getSceneElementsIncludingDeleted();
    a.updateScene({
      elements: now.map((x) => (x.id === e.id ? newElementWith(x, { customData: { ...(x.customData ?? {}), canvas: { ...n, text: next } } }) : x)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const selectedArrow = selected.length === 1 ? byId(selected[0] ?? "") : undefined;
  const ends = selectedArrow ? relationEnds(selectedArrow, (api.current?.getSceneElements() ?? []) as unknown as El[]) : null;
  const selectedNode = selected.length === 1 ? byId(selected[0] ?? "") : undefined;
  const selectedData = selectedNode && isNode(selectedNode) ? nodeData(selectedNode) : null;
  const lost = selectedData?.type === "file" && typeof selectedData.file === "string" && !host.exists(selectedData.file);
  const openable = !lost && selectedNode && isNode(selectedNode) && ["file", "link"].includes(nodeData(selectedNode)?.type ?? "");

  const promote = async (): Promise<void> => {
    const a = api.current;
    if (!a || !selectedArrow || !ends) {
      host.status(s.promoteNeedsArrow);
      return;
    }
    const key = (await host.prompt(s.relationKey, "", false))?.trim();
    if (!key) return;
    if (!relationKeyOk(key)) {
      host.status(s.badRelationKey);
      return;
    }
    if (!(await host.promote(ends.from, ends.to, key))) return;
    touched.current = true;
    const arrow = a.getSceneElementsIncludingDeleted().find((x) => x.id === selectedArrow.id);
    if (!arrow) return;
    const canvas = (arrow.customData?.["canvas"] as Record<string, unknown> | undefined) ?? { id: arrow.id };
    const verso = typeof canvas["verso"] === "object" && canvas["verso"] !== null ? (canvas["verso"] as Record<string, unknown>) : {};
    const labelId = arrow.boundElements?.find((b) => b.type === "text")?.id;
    let elements = a.getSceneElementsIncludingDeleted().map((x) => {
      if (x.id === arrow.id) return newElementWith(x, { customData: { ...(x.customData ?? {}), canvas: { ...canvas, verso: { ...verso, relation: key } } } });
      if (x.id === labelId) return newElementWith(x as never, { text: key, originalText: key } as never);
      return x;
    });
    if (!labelId) {
      const id = `${arrow.id}-label`;
      // Made as an edge's label is made when the board opens (`toElements`,
      // then `restored`): in the board's font, measured — Excalidraw
      // measures a text only while it repairs bindings, and only with its
      // container beside it (alone, the label lost its arrow). Unmeasured,
      // it was 0 × 0, and invisible until the board was opened again.
      const label = { type: "text", id, x: arrow.x, y: arrow.y, width: 10, height: 10, text: key, originalText: key, containerId: arrow.id, textAlign: "center", verticalAlign: "middle", fontSize: 16, fontFamily: FONT_FAMILY.Excalifont, lineHeight: 1.25 };
      const text = restoreElements([arrow, label] as never, null, { refreshDimensions: true, repairBindings: true }).find((x) => x.id === id);
      if (text && arrow.type === "arrow") {
        // At the arrow's middle, where Excalidraw keeps an arrow's label
        // (the middle point, or the middle of the middle segment) — not
        // at its start, under the card it leaves.
        const pts = arrow.points;
        const n = pts.length;
        const p = n % 2 === 1 ? pts[(n - 1) / 2] : pts[n / 2 - 1] && pts[n / 2] ? [(pts[n / 2 - 1]![0] + pts[n / 2]![0]) / 2, (pts[n / 2 - 1]![1] + pts[n / 2]![1]) / 2] : undefined;
        const mid = p ? [arrow.x + p[0]!, arrow.y + p[1]!] : [arrow.x, arrow.y];
        // In no group, as the edge it labels (`freeEdges`): a text in a
        // frame is drawn only inside the frame's box.
        const placed = newElementWith(text, { x: mid[0]! - text.width / 2, y: mid[1]! - text.height / 2, strokeColor: arrow.strokeColor, frameId: null });
        elements = elements.map((x) => (x.id === arrow.id ? newElementWith(x, { boundElements: [...(x.boundElements ?? []), { id, type: "text" }] }) : x));
        elements.push(placed);
      }
    }
    a.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    host.status(s.promoted(key, ends.from));
  };

  const focusElement = (id: string): void => {
    const a = api.current;
    const el = a?.getSceneElements().find((e) => e.id === id);
    if (!a || !el) return;
    // Chosen in the outline or the search, outside the canvas: the view is
    // the user's now, and the outline closing (the pane grows) must not
    // bring the whole board back over it.
    touched.current = true;
    // A group is a part of the board to look at: shown whole, as near as
    // it fits, with nothing selected over it. Anything else is selected
    // and brought to the middle at the zoom it is seen at.
    if (el.type === "frame") {
      a.updateScene({ appState: { selectedElementIds: {} } as never, captureUpdate: CaptureUpdateAction.NEVER });
      a.setViewport({ target: margined([el]), fit: "scale-down", animation: true });
      return;
    }
    // An arrow or a line is selected as a click selects it, with its
    // editor: Excalidraw's "Edit arrow" looks for it and fails without.
    const linear = isLinearElement(el) ? new LinearElementEditor(el as never, a.getSceneElementsMapIncludingDeleted() as never) : null;
    a.updateScene({ appState: { selectedElementIds: { [id]: true }, selectedLinearElement: linear } as never, captureUpdate: CaptureUpdateAction.NEVER });
    a.setViewport({ target: el, fit: "none", animation: true });
  };
  const openFromOutline = (id: string): void => {
    const el = byId(id);
    if (!el || !openNode(el, false)) focusElement(id);
  };

  // A double click on a node opens it (a note, a file, a link) or edits it
  // (a text card), before Excalidraw sees the click: its embeddables take
  // pointer events only once activated.
  const onDoubleClick = (ev: MouseEvent): void => {
    const a = api.current;
    if (!a) return;
    const st = a.getAppState();
    const p = viewportCoordsToSceneCoords({ clientX: ev.clientX, clientY: ev.clientY }, st);
    const hit = [...(a.getSceneElements() as unknown as El[])]
      .reverse()
      .find((e) => e.type === "embeddable" && isNode(e) && p.x >= e.x && p.x <= e.x + e.width && p.y >= e.y && p.y <= e.y + e.height);
    if (!hit) return;
    // A note's card is entered, as Excalidraw enters any embeddable on a
    // double click: its text scrolls, selects, and its links open. ⌘ opens
    // the note itself; a text card is edited, a link card opened.
    const data = nodeData(hit);
    const kind = data?.type;
    // A card whose file is not found has nothing to enter: a double click
    // points it at a file again.
    if (data && kind === "file" && typeof data.file === "string" && !host.exists(data.file)) {
      ev.stopPropagation();
      ev.preventDefault();
      void relink(hit, data);
      return;
    }
    if (kind === "file" && !(ev.metaKey || ev.ctrlKey)) return;
    if (openNode(hit, ev.metaKey || ev.ctrlKey)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };

  // A picture or PDF dropped or pasted from outside is copied into the
  // folder (beside the board, in the attachments folder) and shown by a
  // file card, never kept inside the drawing (ADR 0057 point 2, ADR 0063).
  const sceneAt = (clientX?: number, clientY?: number): [number, number] => {
    const a = api.current;
    if (!a || clientX === undefined || clientY === undefined) return center();
    const p = viewportCoordsToSceneCoords({ clientX, clientY }, a.getAppState());
    return [p.x, p.y];
  };
  // A picture comes in at its own proportions, its longer side as long as
  // a new card's: a box of another shape would show the paper round it.
  const pictureSize = (path: string): Promise<[number, number] | null> =>
    new Promise((resolve) => {
      if (!IMAGE.test(ext(path))) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(null);
        const k = 400 / Math.max(w, h);
        resolve([Math.max(40, Math.round(w * k)), Math.max(40, Math.round(h * k))]);
      };
      img.onerror = () => resolve(null);
      img.src = host.fileSrc(path);
    });
  const addPath = async (path: string, clientX?: number, clientY?: number, nth = 0): Promise<void> => {
    const [x, y] = sceneAt(clientX, clientY);
    const size = await pictureSize(path);
    const node = newNode("file", path, [x + nth * 32, y + nth * 32], randomId());
    if (size) {
      node.x = Math.round(x + nth * 32 - size[0] / 2);
      node.y = Math.round(y + nth * 32 - size[1] / 2);
      [node.width, node.height] = size;
    }
    add(node);
  };
  addPathRef.current = (path, clientX, clientY) => void addPath(path, clientX, clientY);
  // Several files go in a staircase, also when two drops overlap: the step
  // counts on until the last of them is in.
  const stair = useRef({ busy: 0, next: 0 });
  const takeFiles = async (files: File[], clientX?: number, clientY?: number): Promise<void> => {
    const st = stair.current;
    st.busy++;
    try {
      for (const f of files) {
        if (!IMAGE.test(ext(f.name)) && ext(f.name) !== "pdf") {
          host.status(s.imagesAsFiles);
          continue;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        const path = await host.saveImage(f.name.includes(".") ? f.name : `${f.name}.png`, base64);
        if (path) await addPath(path, clientX, clientY, st.next++);
      }
    } finally {
      if (--st.busy === 0) st.next = 0;
    }
  };
  const onFiles = (ev: DragEvent | ClipboardEvent): void => {
    touched.current = true;
    const list = "dataTransfer" in ev ? ev.dataTransfer?.files : ev.clipboardData?.files;
    // A card being edited takes a file as its note's text does.
    if (!list || list.length === 0 || (ev.target as Element | null)?.closest?.(".board-card-slot.is-active")) return;
    ev.stopPropagation();
    ev.preventDefault();
    const at = "dataTransfer" in ev ? ev : null;
    void takeFiles(Array.from(list), at?.clientX, at?.clientY);
  };

  const slot = useToolbarSlot(container);
  const toolsBelow = useToolsBelow(container);
  useTidyContextMenu(container);
  const insertMenu = readOnly ? null : (
    <InsertMenu
      s={s}
      addFile={() => void addFile()}
      addText={() => void addText()}
      addLink={() => void addLink()}
      takeFiles={takeFiles}
      looseOn={looseOn}
      toggleLoose={() => {
        loose.current = !loose.current;
        setLooseOn(loose.current);
        focusBoard();
      }}
    />
  );

  // A picture card's crop (ADR 0057 point 10): the dialog over the board;
  // applied, the card's node keeps the crop and the card takes its shape.
  const [cropping, setCropping] = useState<{ id: string; file: string; crop: Crop | null } | null>(null);
  const cropPicture =
    !readOnly && selectedNode && selectedData && isBarePicture(selectedData, host)
      ? () => setCropping({ id: selectedNode.id, file: String(selectedData.file), crop: cardCrop(selectedData) })
      : null;
  const applyCrop = (crop: Crop | null, aspect: number): void => {
    const a = api.current;
    const at = cropping;
    setCropping(null);
    if (!a || !at) return;
    touched.current = true;
    a.updateScene({
      elements: a.getSceneElements().map((x) => {
        if (x.id !== at.id) return x;
        const data = nodeData(x as unknown as El);
        if (!data) return x;
        const height = Math.max(20, Math.round(x.width / Math.max(0.05, aspect)));
        return newElementWith(x, { height, customData: { ...(x.customData ?? {}), canvas: withCrop(data, crop) } });
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const outline = useMemo(() => outlineOf(elements, s), [elements, s]);

  useEffect(() => {
    noteTexts.current.clear();
  }, [tick]);

  // The board's search: every card by its name, its file's path, its text
  // or address, and a note's card by the note's own text; the drawing's
  // texts too. Case and accents do not count. In reading order.
  useEffect(() => {
    const q = fold(query.trim());
    if (q === "") {
      searched.current = "";
      setHits([]);
      return;
    }
    let live = true;
    void (async () => {
      const els = ((api.current?.getSceneElements() ?? []) as unknown as El[]).slice().sort((a, b) => a.y - b.y || a.x - b.x);
      const found: string[] = [];
      for (const e of els) {
        const n = nodeData(e);
        const parts: string[] = [];
        if (n) {
          parts.push(nodeName(n, s));
          for (const k of ["file", "text", "url", "label"]) if (typeof n[k] === "string") parts.push(n[k] as string);
          if (n.type === "file" && typeof n.file === "string" && ext(n.file) === "md") {
            let text = noteTexts.current.get(n.file);
            if (text === undefined) {
              text = await host.noteText(n.file);
              noteTexts.current.set(n.file, text);
            }
            parts.push(text);
          }
        } else if (e.type === "text" && typeof e.text === "string") {
          parts.push(e.text);
        } else continue;
        if (parts.some((p) => fold(p).includes(q))) found.push(e.id);
      }
      if (!live) return;
      setHits(found);
      // The view goes to the first match when the search changes. The
      // board saving, or a note changing, finds again where the user is:
      // the view stays, and so does the match they had stepped to.
      if (searched.current !== q) {
        searched.current = q;
        setHit(0);
        if (found[0]) focusElement(found[0]);
      } else setHit((at) => Math.min(at, Math.max(0, found.length - 1)));
    })();
    return () => {
      live = false;
    };
    // `focusElement` and `host` do not change what is found.
  }, [query, tick, s]);

  const step = (by: number): void => {
    if (hits.length === 0) return;
    const next = (hit + by + hits.length) % hits.length;
    setHit(next);
    const id = hits[next];
    if (id) focusElement(id);
  };

  return (
    <div
      className="board-root"
      data-lang={host.lang.toLowerCase().startsWith("pt") ? "pt" : "en"}
      onKeyDownCapture={(e) => {
        // ⌘⇧E exports the board with its cards drawn (Excalidraw's own
        // export draws a card as an empty web embed).
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
          e.preventDefault();
          e.stopPropagation();
          setExporting(true);
          return;
        }
        // ⌘F finds on the board, not Excalidraw's search of drawn text only.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          e.stopPropagation();
          searchBox.current?.focus();
          searchBox.current?.select();
          return;
        }
        // ⌘⌥] and ⌘⌥[ — to the front, to the back, on a Mac — matched
        // "forward" and "backward" too in Excalidraw 0.18 (their test does
        // not look at ⌥), which then runs neither of two matches. Asked
        // again with ⇧, which only "to the front" and "to the back" accept.
        if (MAC && e.metaKey && e.altKey && !e.shiftKey && (e.code === "BracketRight" || e.code === "BracketLeft")) {
          e.preventDefault();
          e.stopPropagation();
          e.target.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, code: e.code, metaKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
          return;
        }
        // ⌘P is the window's: Excalidraw only answers it with a hint about
        // a palette of its own the board does not have, and keeps the
        // window from seeing the key.
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
          e.preventDefault();
          e.stopPropagation();
          host.appKey(e.nativeEvent);
        }
      }}
    >
      <div className="board-main">
        <div
          className="board-canvas"
          // Excalidraw offers a link editor for any embeddable selected; a
          // card's link is only the marker that lets it be drawn, and
          // editing it would break the card: hidden while a card is selected.
          data-card-selected={selectedNode && isNode(selectedNode) ? "" : undefined}
          ref={container}
          onDoubleClickCapture={onDoubleClick}
          onPointerDownCapture={(e) => {
            touched.current = true;
            if (!writable(e.target)) focusBoard();
          }}
          onKeyDownCapture={() => (touched.current = true)}
          onDropCapture={onFiles}
          onPasteCapture={onFiles}
        >
          <Excalidraw
            onExcalidrawAPI={(a) => {
              if (!a) return;
              api.current = a;
              // The browser harness's tests read the scene (e2e/): only when the
              // harness asks for it (`__VERSO_TEST__`); the app never does.
              const test = (window as unknown as { __VERSO_TEST__?: { board?: unknown } }).__VERSO_TEST__;
              if (test) test.board = a;
              window.requestAnimationFrame(() => {
                const el = container.current;
                const last = host.prefs.open === "last" ? host.lastView() : null;
                if (last) {
                  restoredView.current = true;
                  a.updateScene({ appState: { scrollX: last.scrollX, scrollY: last.scrollY, zoom: { value: last.zoom } } as never, captureUpdate: CaptureUpdateAction.NEVER });
                } else if (el && el.clientWidth > 0 && el.clientHeight > 0) fit(a);
                viewReady.current = true;
                // The card layer starts from the scene and the view as they
                // are: Excalidraw says nothing until something changes.
                setLayerHost(container.current?.querySelector<HTMLElement>(".excalidraw") ?? null);
                syncCards(a.getSceneElements());
                scheduleOverlays(a.getSceneElements());
                remeasureWhenFontsIn(a.getSceneElements());
                const st = a.getAppState();
                const v: View = { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value, width: st.width, height: st.height };
                settledRef.current = v;
                liveRef.current = v;
                setSettled(v);
              });
            }}
            initialData={{
              elements: initialElements,
              appState: {
                viewBackgroundColor: backgroundOf(initial) ?? "transparent",
                currentItemRoughness: host.prefs.stroke === "clean" ? 0 : 1,
                currentItemFontFamily: FONT_ID[host.prefs.font],
                gridModeEnabled: host.prefs.grid,
              } as never,
              scrollToContent: host.prefs.open !== "last" || host.lastView() === null,
            }}
            aiEnabled={false}
            onChange={onChange}
            theme={dark ? "dark" : "light"}
            viewModeEnabled={readOnly}
            langCode={host.lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en"}
            validateEmbeddable={(link: string) => link === MARKER}
            onLinkOpen={(element, event) => {
              // A node's link is the marker: its icon opens the node, never
              // the address. A drawing element's own link opens as a link.
              const node = element as unknown as El;
              if (isNode(node)) {
                event.preventDefault();
                openNode(node, false);
              } else if (typeof element.link === "string" && /^https?:\/\//.test(element.link)) {
                event.preventDefault();
                host.openUrl(element.link);
              }
            }}
            renderEmbeddable={(element: NonDeleted<ExcalidrawEmbeddableElement>) => {
              const node = nodeData(element as unknown as El);
              // Drawn by the card layer; Excalidraw's own box stays empty.
              return node ? <div className="board-card-placeholder" /> : null;
            }}
            renderTopRightUI={() => toolsBelow ? null : (
              <TopRightTools
                s={s}
                insert={slot ? null : insertMenu}
                cropPicture={cropPicture}
                selectedNode={selectedNode}
                selectedData={selectedData}
                openable={openable}
                openNode={openNode}
                ends={ends}
                promote={promote}
                relink={relink}
                query={query}
                setQuery={setQuery}
                searchBox={searchBox}
                step={step}
                hits={hits}
                hit={hit}
                showOutline={showOutline}
                setShowOutline={setShowOutline}
                container={container}
              />
            )}
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, toggleTheme: false, changeViewBackgroundColor: true, saveAsImage: false },
              tools: { image: false },
            }}
          >
            {toolsBelow && (
              <Footer>
                <TopRightTools
                  s={s}
                  insert={slot ? null : insertMenu}
                  cropPicture={cropPicture}
                  selectedNode={selectedNode}
                  selectedData={selectedData}
                  openable={openable}
                  openNode={openNode}
                  ends={ends}
                  promote={promote}
                  relink={relink}
                  query={query}
                  setQuery={setQuery}
                  searchBox={searchBox}
                  step={step}
                  hits={hits}
                  hit={hit}
                  showOutline={showOutline}
                  setShowOutline={setShowOutline}
                  container={container}
                />
              </Footer>
            )}
            <MainMenu>
              <MainMenu.Item onSelect={() => setExporting(true)} shortcut="⌘⇧E">
                {s.exportImage}
              </MainMenu.Item>
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
          {slot && readOnly === false && createPortal(insertMenu, slot)}
          {hintSlot && readOnly === false && createPortal(<span className="board-hint" data-testid="board-arrow-hint">{arrowHint}</span>, hintSlot)}
          {/* Excalidraw's phone layout has no line of hints: the hint
              stands alone over its toolbar. */}
          {!hintSlot && arrowTool && readOnly === false && (
            <span className="board-hint board-hint-alone" data-testid="board-arrow-hint">
              {arrowHint}
            </span>
          )}
          {layerHost &&
            createPortal(
              <CardLayer
                editing={editing}
                setEditing={setEditing}
                swap={swapCard}
                draw={draw}
                cards={cards}
                overlays={overlays}
                view={settled}
                live={liveRef}
                cullRef={cullRef}
                laidOut={laidOut}
                active={active}
                host={host}
                tick={tick}
                plane={plane}
              />,
              layerHost,
            )}
        </div>
        {exporting && api.current && <ExportDialog api={api.current} host={host} selected={selected} onClose={() => setExporting(false)} />}
        {cropping && <CropDialog src={host.fileSrc(cropping.file)} crop={cropping.crop} strings={s} onApply={applyCrop} onClose={() => setCropping(null)} />}
        {showOutline && (
          <OutlinePanel outline={outline} strings={s} annotations={annotations} onAnnotations={setAnnotations} onFocus={focusElement} onOpen={openFromOutline} />
        )}
      </div>
    </div>
  );
}

/** A drawing of Obsidian's Excalidraw plugin, shown as it is drawn and
 *  never changed (ADR 0057 point 5, revised 2026-10-06): its scene's
 *  elements, and its pictures by the files `pictures` names (fileId →
 *  path of the folder). */
export type DrawingPreview = {
  elements: readonly Record<string, unknown>[];
  pictures: ReadonlyMap<string, string>;
  fileSrc: (path: string) => string;
  /** Whether the window is dark now: the drawing follows a change of it. */
  dark: () => boolean;
  lang: string;
};

function DrawingView({ elements, pictures, fileSrc, dark: isDark, lang }: DrawingPreview): JSX.Element {
  const [api, setApi] = useState<Api | null>(null);
  // The theme, as the board follows it: the system's, or the one chosen.
  const [dark, setDark] = useState(isDark());
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = (): void => setDark(isDark());
    media.addEventListener("change", theme);
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", theme);
      watch.disconnect();
    };
  }, [isDark]);
  const scene = useMemo(() => restoreElements(elements as never, null, { repairBindings: true }), [elements]);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    void (async () => {
      const files: BinaryFileData[] = [];
      for (const [id, path] of pictures) {
        try {
          const blob = await (await fetch(fileSrc(path))).blob();
          files.push({ id: id as never, dataURL: (await dataUrlOf(blob)) as never, mimeType: (blob.type || `image/${ext(path) === "svg" ? "svg+xml" : ext(path)}`) as never, created: Date.now() });
        } catch {
          // A picture that cannot be read is drawn as Excalidraw draws a missing one.
        }
      }
      if (alive && files.length > 0) api.addFiles(files);
    })();
    return () => {
      alive = false;
    };
  }, [api, pictures, fileSrc]);
  return (
    <Excalidraw
      onExcalidrawAPI={(a) => a && setApi(a)}
      initialData={{ elements: scene, scrollToContent: true }}
      viewModeEnabled
      aiEnabled={false}
      theme={dark ? "dark" : "light"}
      langCode={lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en"}
      UIOptions={{
        canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, toggleTheme: false, changeViewBackgroundColor: false, saveAsImage: false },
      }}
    />
  );
}

/** Show a drawing of the plugin in `el`; the function returned takes it away. */
export function mountDrawing(el: HTMLElement, preview: DrawingPreview): () => void {
  const root = createRoot(el);
  root.render(<DrawingView {...preview} />);
  return () => root.unmount();
}

/** Mount a board in `el`, showing the canvas `text`; null when the text is
 *  not JSON (the pane then says so and offers the text view). */
export function mountBoard(el: HTMLElement, host: BoardHost, text: string): BoardHandle | null {
  const initial = parseCanvas(text);
  if (!initial) return null;
  let load: (doc: CanvasDoc) => void = () => undefined;
  let focus: () => void = () => undefined;
  let refresh: () => void = () => undefined;
  let find: () => void = () => undefined;
  let flush: () => Promise<void> = () => Promise.resolve();
  let addPath: (path: string, x?: number, y?: number) => void = () => undefined;
  const root = createRoot(el);
  root.render(
    <Board
      host={host}
      initial={initial}
      bind={(l, f, r, fd, fl, ap) => {
        addPath = ap;
        load = l;
        focus = f;
        refresh = r;
        find = fd;
        flush = fl;
      }}
    />,
  );
  return {
    load: (next: string) => {
      const doc = parseCanvas(next);
      if (!doc) return false;
      load(doc);
      return true;
    },
    refresh: () => refresh(),
    find: () => find(),
    focus: () => focus(),
    addPath: (path, x, y) => addPath(path, x, y),
    flush: () => flush(),
    destroy: () => root.unmount(),
  };
}
