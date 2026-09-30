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
  MainMenu,
  newElementWith,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, NonDeleted, ExcalidrawEmbeddableElement } from "@excalidraw/excalidraw/element/types";
import type { BoardStrings } from "./strings";
import {
  MARKER,
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

/** What the window gives the board: its contract calls and its dialogs. */
export type BoardHost = {
  strings: BoardStrings;
  /** `pt-BR` or `en`: the interface's language. */
  lang: string;
  dark: () => boolean;
  /** The canvas as the board holds it, to be saved (the core lays it over
   *  the file as read). */
  save: (json: string) => void;
  openFile: (path: string, aside: boolean) => void;
  /** Draw a note into `el` as the reading view draws it (sanitized, its
   *  images and embeds resolved, its links live). */
  renderNote: (el: HTMLElement, path: string) => Promise<void>;
  /** Draw a text card's Markdown the same way, from the board's folder. */
  renderText: (el: HTMLElement, text: string) => Promise<void>;
  /** A note's text, for the board's search. */
  noteText: (path: string) => Promise<string>;
  fileSrc: (path: string) => string;
  exists: (path: string) => boolean;
  pickFile: () => Promise<string | null>;
  prompt: (label: string, initial: string, multiline: boolean) => Promise<string | null>;
  /** Write the relation into the source note, after showing the diff;
   *  true when it was written. */
  promote: (from: string, to: string, key: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  status: (text: string) => void;
};

export type BoardHandle = {
  /** Show a canvas's text; false when it is not JSON. */
  load: (text: string) => boolean;
  /** The folder changed: every card asks for its note again. */
  refresh: () => void;
  /** Go to the board's search (⌘F). */
  find: () => void;
  focus: () => void;
  destroy: () => void;
};

const SAVE_DELAY = 700;

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

/** A node drawn by Verso inside its element. */
function Card({
  node,
  host,
  tick,
}: {
  node: CanvasNode;
  host: BoardHost;
  tick: number;
}): JSX.Element {
  const body = useRef<HTMLDivElement>(null);
  const s = host.strings;
  const file = typeof node.file === "string" ? node.file : "";
  const text = typeof node.text === "string" ? node.text : "";
  const url = typeof node.url === "string" ? node.url : "";
  const missing = node.type === "file" && !host.exists(file);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    if (node.type === "file" && !missing && ext(file) === "md") void host.renderNote(el, file);
    else if (node.type === "text") void host.renderText(el, text);
    else el.replaceChildren();
  }, [node.type, file, text, missing, host, tick]);
  const kind = node.type === "text" ? s.textCard : node.type === "link" ? s.linkCard : ext(file) || node.type;
  return (
    <div
      className={`board-card board-card-${node.type}${missing ? " board-card-missing" : ""}`}
      aria-label={s.card(kind, nodeName(node, s))}
    >
      {node.type === "file" && (
        <div className="board-card-head">
          <span className="board-card-title">{nodeName(node, s)}</span>
          {!missing && (
            <button type="button" className="board-card-open" title={s.openTitle} aria-label={`${s.open}: ${nodeName(node, s)}`} onClick={(e) => host.openFile(file, e.metaKey || e.ctrlKey)}>
              <OpenIcon />
            </button>
          )}
        </div>
      )}
      {node.type === "file" && missing && <div className="board-card-note">{s.missing}</div>}
      {node.type === "file" && !missing && IMAGE.test(ext(file)) && <img className="board-card-image" src={host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} />}
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
      <div className="board-card-body preview" ref={body} />
    </div>
  );
}

const MemoCard = memo(Card);

/** Where the board is looking: Excalidraw's scroll and zoom, and its size. */
type View = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };

/** The corner Excalidraw draws a card's shape with (its adaptive radius). */
function cornerRadius(w: number, h: number): number {
  const x = Math.min(w, h);
  return x <= 128 ? x * 0.25 : 32;
}

/** Below this zoom a card is scaled down, not laid out at the zoom:
 *  WebKit keeps a minimum font size, and a picture shrunk does not blur. */
const LAYOUT_ZOOM = 0.75;

/** The cards, drawn by Verso over Excalidraw's canvas — not inside
 * Excalidraw's own embeddable boxes. Those are scaled with a CSS transform,
 * and WebKit paints a transformed layer once and then stretches the
 * picture: text read like a blurred screenshot. Here a card at rest is
 * placed in screen pixels and laid out at the zoom itself (CSS `zoom`),
 * with no transform at all: its text is drawn at the size it is seen.
 * While the view moves, the whole layer follows with one transform (see
 * `Board`), and is drawn again, sharp, once the view settles. */
function CardLayer({
  cards,
  view,
  active,
  host,
  tick,
  plane,
}: {
  cards: readonly El[];
  view: View;
  active: string | null;
  host: BoardHost;
  tick: number;
  plane: RefObject<HTMLDivElement | null>;
}): JSX.Element {
  const z = view.zoom;
  const laidOut = z >= LAYOUT_ZOOM;
  // Only what is near the view is drawn: a board of hundreds of notes
  // lays out the few it shows.
  const x0 = -view.scrollX - view.width / z;
  const y0 = -view.scrollY - view.height / z;
  const x1 = -view.scrollX + (2 * view.width) / z;
  const y1 = -view.scrollY + (2 * view.height) / z;
  return (
    <div className="board-cards" ref={plane}>
      {cards.map((e) => {
        const node = nodeData(e);
        if (!node) return null;
        if (e.x > x1 || e.y > y1 || e.x + e.width < x0 || e.y + e.height < y0) return null;
        const sw = typeof e["strokeWidth"] === "number" ? (e["strokeWidth"] as number) : 1;
        const w = Math.max(1, e.width - 2 * sw);
        const h = Math.max(1, e.height - 2 * sw);
        const radius = Math.max(0, cornerRadius(e.width, e.height) - sw);
        const box = {
          width: `${w}px`,
          height: `${h}px`,
          ["--embeddable-radius" as string]: `${radius}px`,
          ...(laidOut ? { zoom: z } : { transform: `scale(${z})`, transformOrigin: "0 0" }),
        } as CSSProperties;
        const angle = typeof e.angle === "number" && e.angle !== 0 ? e.angle : 0;
        return (
          <div
            key={e.id}
            className={`board-card-slot${active === e.id ? " is-active" : ""}`}
            style={{
              left: `${(e.x + sw + view.scrollX) * z}px`,
              top: `${(e.y + sw + view.scrollY) * z}px`,
              ...(angle ? { transform: `rotate(${angle}rad)`, transformOrigin: `${(w * z) / 2}px ${(h * z) / 2}px` } : {}),
            }}
          >
            <div className="board-card-box" style={box}>
              <MemoCard node={node} host={host} tick={tick} />
            </div>
          </div>
        );
      })}
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
  bind: (load: (doc: CanvasDoc) => void, focus: () => void, refresh: () => void, find: () => void) => void;
}): JSX.Element {
  const s = host.strings;
  const api = useRef<Api | null>(null);
  const doc = useRef<CanvasDoc>(initial);
  const sent = useRef<string>("");
  /** Whether the user has done anything since the board was drawn from the
   *  file: only then is a change theirs. What Excalidraw adjusts by itself
   *  — a text measured again once its font loads — is not written back
   *  (invariant 7: opening never rewrites). */
  const touched = useRef(false);
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
  const [active, setActive] = useState<string | null>(null);
  const [layerHost, setLayerHost] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const [hit, setHit] = useState(0);
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

  useEffect(() => {
    baseline(initialElements, initial);
    setElements(initialElements as unknown as El[]);
    bind(
      (d) => {
        const els = restored(d);
        window.clearTimeout(timer.current);
        touched.current = false;
        baseline(els, d);
        api.current?.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.NEVER });
        setElements(els as unknown as El[]);
        syncCards(els);
      },
      () => container.current?.querySelector<HTMLElement>(".excalidraw")?.focus(),
      () => setTick((n) => n + 1),
      () => {
        searchBox.current?.focus();
        searchBox.current?.select();
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
        if (!a || touched.current || el.clientWidth === 0 || el.clientHeight === 0) return;
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

  const flush = useCallback(() => {
    const a = api.current;
    if (!a) return;
    const next = fromElements(a.getSceneElementsIncludingDeleted() as unknown as El[], doc.current);
    const json = JSON.stringify(next);
    if (json === sent.current) return;
    sent.current = json;
    if (!touched.current) return;
    doc.current = next;
    host.save(json);
  }, [host]);

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
      a.updateScene({
        elements: now.map((e) => (e.type === "embeddable" && e.link === MARKER ? newElementWith(e, { link: null }) : e)),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }, 300);
  }, []);

  const syncCards = useCallback((els: readonly ExcalidrawElement[]) => {
    const list = (els as unknown as El[]).filter((e) => e.type === "embeddable" && !e.isDeleted && isNode(e));
    const key = list.map((e) => `${e.id}:${String(e["version"])}`).join("|");
    if (key === cardsKey.current) return;
    cardsKey.current = key;
    setCards(list);
  }, []);

  // The layer lives inside Excalidraw's own root, beside its canvases, so
  // that its menus and toolbar stay above the cards.
  useEffect(() => {
    setLayerHost(container.current?.querySelector<HTMLElement>(".excalidraw") ?? null);
  }, []);
  // The cards drawn at the settled view replace the moving layer's
  // transform in the same frame.
  useLayoutEffect(() => {
    if (plane.current) plane.current.style.transform = "";
  }, [settled]);

  const onChange = useCallback(
    (els: readonly ExcalidrawElement[], state: AppState) => {
      dropMarkers(els);
      syncCards(els);
      // The view: while it moves, the card layer follows with one transform
      // from where it last settled; once it settles, the cards are drawn
      // again where they are, at the zoom they are shown at.
      const v: View = { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value, width: state.width, height: state.height };
      const s0 = settledRef.current;
      if (v.scrollX !== s0.scrollX || v.scrollY !== s0.scrollY || v.zoom !== s0.zoom || v.width !== s0.width || v.height !== s0.height) {
        const k = v.zoom / s0.zoom;
        if (plane.current && s0.width > 0) {
          plane.current.style.transformOrigin = "0 0";
          plane.current.style.transform = `translate(${(v.scrollX - s0.scrollX) * v.zoom}px, ${(v.scrollY - s0.scrollY) * v.zoom}px) scale(${k})`;
        }
        window.clearTimeout(settleTimer.current);
        const settle = (): void => {
          settledRef.current = v;
          setSettled(v);
        };
        if (s0.width === 0) settle();
        else settleTimer.current = window.setTimeout(settle, 150);
      }
      const entered = state.activeEmbeddable?.state === "active" ? state.activeEmbeddable.element.id : null;
      setActive((was) => (was === entered ? was : entered));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
      const ids = Object.keys(state.selectedElementIds).filter((k) => state.selectedElementIds[k]);
      setSelected((was) => (was.length === ids.length && was.every((v, i) => v === ids[i]) ? was : ids));
      window.clearTimeout(outlineTimer.current);
      outlineTimer.current = window.setTimeout(() => setElements(els as unknown as El[]), 300);
    },
    [flush, dropMarkers, syncCards],
  );

  const center = (): [number, number] => {
    const a = api.current;
    if (!a) return [0, 0];
    const st = a.getAppState();
    const p = viewportCoordsToSceneCoords({ clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 }, st);
    return [p.x, p.y];
  };

  const add = (node: CanvasNode): void => {
    const a = api.current;
    if (!a) return;
    touched.current = true;
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
  const openable = selectedNode && isNode(selectedNode) && ["file", "link"].includes(nodeData(selectedNode)?.type ?? "");

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
      const [text] = restoreElements(
        [{ type: "text", id, x: arrow.x, y: arrow.y, text: key, originalText: key, containerId: arrow.id, textAlign: "center", verticalAlign: "middle", fontSize: 16 }] as never,
        null,
        { refreshDimensions: true },
      );
      if (text) {
        elements = elements.map((x) => (x.id === arrow.id ? newElementWith(x, { boundElements: [...(x.boundElements ?? []), { id, type: "text" }] }) : x));
        elements.push(text);
      }
    }
    a.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    host.status(s.promoted(key, ends.from));
  };

  const focusElement = (id: string): void => {
    const a = api.current;
    const el = a?.getSceneElements().find((e) => e.id === id);
    if (!a || !el) return;
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
    const kind = nodeData(hit)?.type;
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
      setHit(0);
      if (found[0]) focusElement(found[0]);
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
      onKeyDownCapture={(e) => {
        // ⌘F finds on the board, not Excalidraw's search of drawn text only.
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          e.stopPropagation();
          searchBox.current?.focus();
          searchBox.current?.select();
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
          onPointerDownCapture={() => (touched.current = true)}
          onKeyDownCapture={() => (touched.current = true)}
          onDropCapture={refuseFiles}
          onPasteCapture={refuseFiles}
        >
          <Excalidraw
            excalidrawAPI={(a) => {
              api.current = a;
              window.requestAnimationFrame(() => {
                const el = container.current;
                if (el && el.clientWidth > 0 && el.clientHeight > 0) fit(a);
                // The card layer starts from the scene and the view as they
                // are: Excalidraw says nothing until something changes.
                setLayerHost(container.current?.querySelector<HTMLElement>(".excalidraw") ?? null);
                syncCards(a.getSceneElements());
                const st = a.getAppState();
                const v: View = { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value, width: st.width, height: st.height };
                settledRef.current = v;
                setSettled(v);
              });
            }}
            initialData={{ elements: initialElements, appState: { viewBackgroundColor: "transparent" }, scrollToContent: true }}
            onChange={onChange}
            theme={dark ? "dark" : "light"}
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
              canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, toggleTheme: false, changeViewBackgroundColor: true, saveAsImage: true },
              tools: { image: false },
            }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
          {layerHost &&
            createPortal(<CardLayer cards={cards} view={settled} active={active} host={host} tick={tick} plane={plane} />, layerHost)}
        </div>
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
  const root = createRoot(el);
  root.render(
    <Board
      host={host}
      initial={initial}
      bind={(l, f, r, fd) => {
        load = l;
        focus = f;
        refresh = r;
        find = fd;
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
    destroy: () => root.unmount(),
  };
}
