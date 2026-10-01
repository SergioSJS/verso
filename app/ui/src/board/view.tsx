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

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type JSX, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
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
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, NonDeleted, ExcalidrawEmbeddableElement } from "@excalidraw/excalidraw/element/types";
import type { BoardStrings } from "./strings";
import {
  BOARD_VERSION,
  CARD_PAPER,
  MARKER,
  backgroundOf,
  fromElements,
  isNode,
  newNode,
  nodeData,
  nodeName,
  outlineOf,
  parseCanvas,
  relationEnds,
  toElements,
  type CanvasDoc,
  type CanvasNode,
  type El,
  type Outline,
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
};

export type BoardHandle = {
  /** Show a canvas's text; false when it is not JSON. */
  load: (text: string) => boolean;
  /** The folder changed: every card asks for its note again. */
  refresh: () => void;
  /** Go to the board's search (⌘F). */
  find: () => void;
  focus: () => void;
  /** Save now what the board holds and has not saved: before its tab
   *  closes, the window quits or the folder changes. */
  flush: () => Promise<void>;
  destroy: () => void;
};

const SAVE_DELAY = 700;

/** With the window in Portuguese, the words Excalidraw's pt-BR leaves out
 *  (`ptBR.ts`) take the place of the English it falls back to. Excalidraw
 *  is pinned at exactly 0.18.1 in package.json: its English is this
 *  module, a hashed file of its build. */
export async function completeLocale(lang: string): Promise<void> {
  if (!lang.toLowerCase().startsWith("pt")) return;
  // @ts-expect-error — a module of the package's build, without types.
  const en = (await import("../../node_modules/@excalidraw/excalidraw/dist/prod/locales/en-B4ZKOASM.js")) as Record<string, unknown>;
  for (const [path, text] of Object.entries(PT_BR)) {
    const parts = path.split(".");
    let at: Record<string, unknown> | undefined = en[parts[0] ?? ""] as Record<string, unknown> | undefined;
    for (const part of parts.slice(1, -1)) at = at?.[part] as Record<string, unknown> | undefined;
    const last = parts[parts.length - 1];
    if (at && typeof at === "object" && last) at[last] = text;
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
  const picture = node.type === "file" && !missing && IMAGE.test(ext(file));
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
      className={`board-card board-card-${node.type}${missing ? " board-card-missing" : ""}`}
      aria-label={s.card(kind, nodeName(node, s))}
      data-fill={background && fill !== "solid" ? fill : undefined}
      style={background ? ({ "--card-bg": background } as CSSProperties) : undefined}
      ref={root}
      tabIndex={-1}
    >
      {node.type === "file" && (
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
      {picture && copy !== undefined && (
        <div className="board-card-image">
          <img src={copy ?? host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} decoding="async" />
          {copy && <img className="pic-full" src={host.fileSrc(file)} alt="" draggable={false} decoding="async" loading="lazy" />}
        </div>
      )}
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
          // stroke is centred on the shape's edge.
          const sw = typeof e["strokeWidth"] === "number" ? (e["strokeWidth"] as number) : 1;
          const inset = sw / 2;
          const w = Math.max(1, e.width - sw);
          const h = Math.max(1, e.height - sw);
          const r = Math.max(0, Math.min(cornerRadius(e) - inset, w / 2, h / 2));
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
      try {
        const blob = await (await fetch(host.fileSrc(file))).blob();
        const dataURL = await dataUrlOf(blob);
        const size = await sizeOf(dataURL);
        if (size) {
          const k = Math.min((w - 2 * pad) / size.w, room / size.h);
          const iw = size.w * k;
          const ih = size.h * k;
          const id = `picture-${e.id}`;
          files[id] = { id, dataURL, mimeType: blob.type || (ext(file) === "svg" ? "image/svg+xml" : `image/${ext(file)}`), created: Date.now() };
          skels.push({ type: "image", fileId: id, x: x + (w - iw) / 2, y: top + (room - ih) / 2, width: iw, height: ih });
        }
      } catch {
        body = nodeName(node, s);
      }
    }
    if (body) {
      const lines = wrapLines(body, w - 2 * pad, Math.floor(room / (13 * CARD_LINE)), measure(13));
      if (lines.length > 0) skels.push({ type: "text", x: x + pad, y: top, text: lines.join("\n"), fontSize: 13, fontFamily: CARD_FONT, strokeColor: PICTURE.ink });
    }
    out.push(...(convertToExcalidrawElements(skels as never, { regenerateIds: true }) as unknown as ExcalidrawElement[]));
  }
  return { elements: out, files };
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
  if (elements.length > 0) a.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.9, minZoom: 0.1, maxZoom: 1 });
}

function Board({
  host,
  initial,
  bind,
}: {
  host: BoardHost;
  initial: CanvasDoc;
  bind: (load: (doc: CanvasDoc) => void, focus: () => void, refresh: () => void, find: () => void, flush: () => Promise<void>) => void;
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
    // WebKit does not always say when a font is in: asked again later.
    const timers = [400, 1500, 4000].map((ms) => window.setTimeout(remeasure, ms));
    return () => {
      fonts.removeEventListener("loadingdone", remeasure);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [remeasure]);

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
    if (json === sent.current) return Promise.resolve();
    sent.current = json;
    if (!edited.current) return Promise.resolve();
    doc.current = next;
    return Promise.resolve(host.save(json));
  }, [host, noteUser, readOnly]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
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
      const els = (sceneRef.current as unknown as El[]).filter((e) => !e.isDeleted);
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
    if (state.newElement || state.multiElement || state.editingTextElement || state.editingLinearElement || state.resizingElement || state.selectedElementsAreBeingDragged) return false;
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
        state.editingLinearElement ? 1 : 0,
        state.viewBackgroundColor,
      ].join("|");
      if (key !== workKey.current) {
        workKey.current = key;
        noteUser();
        dropMarkers(els);
        syncCards(els);
        scheduleOverlays(els);
        if (!freeEdges(els, state)) liftDrawn(els, state);
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
    [flush, noteUser, dropMarkers, syncCards, scheduleOverlays, liftDrawn, freeEdges, host, place],
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
      a.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.9, maxZoom: 1, animate: true });
      return;
    }
    a.updateScene({ appState: { selectedElementIds: { [id]: true } } as never, captureUpdate: CaptureUpdateAction.NEVER });
    a.scrollToContent(el, { fitToContent: false, animate: true });
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

  // Images are files of the folder on a board (ADR 0057 point 2): a pasted
  // or dropped image is refused, and the user told where they go.
  const refuseFiles = (ev: DragEvent | ClipboardEvent): void => {
    touched.current = true;
    const files = "dataTransfer" in ev ? ev.dataTransfer?.files : ev.clipboardData?.files;
    if (files && files.length > 0) {
      ev.stopPropagation();
      ev.preventDefault();
      host.status(s.imagesAsFiles);
    }
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
      <div className="board-bar" role="toolbar" aria-label={s.toolbar}>
        <button type="button" title={s.addFileTitle} onClick={() => void addFile()}>
          {s.addFile}
        </button>
        <button type="button" title={s.addTextTitle} onClick={() => void addText()}>
          {s.addText}
        </button>
        <button type="button" title={s.addLinkTitle} onClick={() => void addLink()}>
          {s.addLink}
        </button>
        <span className="board-bar-gap" />
        {selectedNode && selectedData?.type === "file" && (
          <button type="button" title={s.swapTitle} onClick={() => void relink(selectedNode, selectedData)}>
            {s.swap}
          </button>
        )}
        <button type="button" title={s.openTitle} disabled={!openable} onClick={() => selectedNode && openNode(selectedNode, false)}>
          {s.open}
        </button>
        <button type="button" title={ends ? s.promoteTitle : s.promoteNeedsArrow} disabled={!ends} onClick={() => void promote()}>
          {s.promote}
        </button>
        <span className="board-search">
          <input
            ref={searchBox}
            type="search"
            autoComplete="off"
            // As the window's own search field: what is typed is searched,
            // never corrected into another word.
            spellCheck={false}
            autoCorrect="off"
            placeholder={s.search}
            aria-label={s.search}
            title={s.searchTitle}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
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
            <span className="board-search-count" aria-live="polite">
              {hits.length > 0 ? s.searchCount(hit + 1, hits.length) : s.noMatches}
            </span>
          )}
        </span>
        <button type="button" title={s.outlineTitle} aria-pressed={showOutline} onClick={() => setShowOutline((v) => !v)}>
          {s.outline}
        </button>
      </div>
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
          onDropCapture={refuseFiles}
          onPasteCapture={refuseFiles}
        >
          <Excalidraw
            excalidrawAPI={(a) => {
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
            UIOptions={{
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, toggleTheme: false, changeViewBackgroundColor: true, saveAsImage: false },
              tools: { image: false },
            }}
          >
            <MainMenu>
              <MainMenu.Item onSelect={() => setExporting(true)} shortcut="⌘⇧E">
                {s.exportImage}
              </MainMenu.Item>
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
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
        {showOutline && (
          <OutlinePanel outline={outline} strings={s} annotations={annotations} onAnnotations={setAnnotations} onFocus={focusElement} onOpen={openFromOutline} />
        )}
      </div>
    </div>
  );
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
  const root = createRoot(el);
  root.render(
    <Board
      host={host}
      initial={initial}
      bind={(l, f, r, fd, fl) => {
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
    flush: () => flush(),
    destroy: () => root.unmount(),
  };
}
