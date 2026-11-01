// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { nextPictureWait, pictureShouldRestart } from "./pictureRetry";
import { type CSSProperties, type JSX, memo, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_COMMAND } from "./command";
import { mapStrings } from "./mapStrings";
import { MapTiles, SecretBadge, useMapInfo } from "./mapsView";
import { DataBody, DataControls, useDiagramAvailable, useFileText } from "./dataCard";
import { type CanvasNode, CARD_PAPER, cardCrop, cardView, type CardView, type El, isMap, isPage, nodeData, nodeName, type Outline } from "./model";
import { PageCard } from "./page";
import { type BoardStrings } from "./strings";
import { OpenIcon, SwapIcon } from "./tools";
import { BoardHost, CardEditing } from "./types";
import { ext, IMAGE, kindOf } from "../paths";
import { sharpFactor } from "./sharp";
import { audioTarget } from "../audio/state";

/** A card of a picture in the folder: drawn as the picture alone, with no
 *  frame, head or title (its name is the picture's alternative text; open
 *  and swap are in the top-right tools while it is selected). */
/** An SVG picture laid out `factor` times larger and scaled back (see
 *  `sharpFactor`): the same size on the card, drawn at the zoom. */
function Sharp({ factor, w, h, children }: { factor: number; w: number; h: number; children: ReactNode }): JSX.Element {
  if (factor <= 1) return <>{children}</>;
  return (
    <div className="board-svg-fit" style={{ zoom: 1 / factor, width: `${factor * w}px`, height: `${factor * h}px` } as CSSProperties}>
      {children}
    </div>
  );
}

export function isBarePicture(node: CanvasNode, host: BoardHost): boolean {
  const file = typeof node.file === "string" ? node.file : "";
  return node.type === "file" && IMAGE.test(ext(file)) && host.exists(file);
}

/** A node drawn by Verso inside its element. */
export function Card({
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
  rect,
  interacting,
  interact,
  setView,
}: {
  /** A data file's card shows its text or its diagram (`verso.view`). */
  setView: (id: string, view: CardView) => void;
  /** The card is entered (the pointer is the page's, not the board's), and
   *  the way in and out of that for a page card (ADR 0057 point 10). */
  interacting: boolean;
  interact: (id: string, on: boolean) => void;
  /** Point the card at another file of the folder (its id). */
  swap: (id: string) => void;
  /** Where the card is on the board, for a map's tiles (ADR 0090). */
  rect?: { x: number; y: number; w: number; h: number };
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
  const sharp = ext(file) === "svg" ? sharpFactor(zoom, Number(node.width) || 250, window.devicePixelRatio || 1) : 1;
  const note = node.type === "file" && !missing && ext(file) === "md";
  const picture = isBarePicture(node, host);
  const crop = picture ? cardCrop(node) : null;
  // A map's picture is cut into tiles when it is large (ADR 0090 item 4):
  // asked of the core before the picture is loaded at all, or the whole of
  // it would be.
  const ms = mapStrings(host.lang);
  const isMapPicture = picture && isMap(node);
  const mapInfo = useMapInfo(host, isMapPicture ? file : null);
  const tiled = isMapPicture && rect !== undefined && (mapInfo?.state === "ready" || mapInfo?.state === "cutting");
  const mapPending = isMapPicture && host.maps !== undefined && mapInfo === null;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // The crop's part as large as the card holds it at its proportions,
  // measured in the card's own pixels: a size from container units went
  // wrong in the app's web view under the cards' zoom until a redraw.
  const cropBox = useRef<HTMLDivElement>(null);
  const [cropView, setCropView] = useState<{ w: number; h: number } | null>(null);
  const cropSharp = crop && cropView && ext(file) === "svg" ? sharpFactor(zoom, cropView.w / crop.w, window.devicePixelRatio || 1) : 1;
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
  // A file of text — JSON, YAML, CSV… — shows its text, or its diagram when
  // the feature is on; any other file that has no body of its own says what
  // it is (never an empty box).
  const textFile = node.type === "file" && !missing && !note && kindOf(file) === "text";
  const diagramOk = useDiagramAvailable(host, file, textFile);
  const fileText = useFileText(host, file, tick, textFile);
  const [localView, setLocalView] = useState<CardView>("text");
  const readOnly = host.readOnly?.() ?? false;
  const view: CardView = !diagramOk ? "text" : readOnly ? localView : cardView(node);
  const pdf = node.type === "file" && !missing && ext(file) === "pdf";
  // A sound file is its player (ADR 0116, amendment of 2026-11-01).
  const audio = node.type === "file" && !missing && audioTarget(file) && host.renderAudio !== undefined;
  const bodyless = node.type === "file" && !missing && !note && !pdf && !picture && !textFile && !audio;
  const pdfEl = useRef<HTMLDivElement>(null);
  const audioEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = audioEl.current;
    if (!audio || !el || !host.renderAudio) return;
    return host.renderAudio(el, file);
  }, [audio, file, host]);
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
  // A picture that another person put on the board can reach the room before
  // its file reaches this folder by sync: it fails to load once. It is tried
  // again a few times, each later than the last (the window's own signal of
  // arrived files draws the card again at once), without drawing the scene.
  const [tries, setTries] = useState(0);
  // A picture that gave up (or is waiting for its next try) is `broken`; the window's signal of listed files
  // (`tick`) then draws it again from the start, once per signal, and a change of the file starts over too.
  const [epoch, setEpoch] = useState(0);
  const broken = useRef(false);
  const retryTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(retryTimer.current), []);
  const failedToLoad = useCallback((): void => {
    broken.current = true;
    const wait = nextPictureWait(tries);
    if (wait === null) return;
    window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => setTries((n) => n + 1), wait);
  }, [tries]);
  const pictureLoaded = useCallback((): void => {
    broken.current = false;
  }, []);
  useEffect(() => {
    if (!picture || !pictureShouldRestart(broken.current)) return;
    window.clearTimeout(retryTimer.current);
    broken.current = false;
    setTries(0);
    setEpoch((n) => n + 1);
  }, [tick]);
  useEffect(() => {
    window.clearTimeout(retryTimer.current);
    broken.current = false;
    setTries(0);
  }, [file]);
  useEffect(() => {
    if (!picture || tiled || mapPending) return;
    let gone = false;
    const cancel = draw(id, async () => {
      const made = await host.pictureCopy(host.fileSrc(file));
      if (!gone) setCopy(made);
    });
    return () => {
      gone = true;
      cancel();
    };
  }, [picture, tiled, mapPending, id, file, host, draw, tries, epoch]);
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
  const kind = node.type === "text" ? s.textCard : node.type === "link" ? (isPage(node) && host.web ? s.pageCard : s.linkCard) : ext(file) || node.type;
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
        <div className="board-card-head" onKeyDown={(e) => { if (e.key === "Escape" && interacting && textFile && view === "diagram") { e.stopPropagation(); e.preventDefault(); interact(id, false); } }}>
          <span className="board-card-title" data-preview-path={note ? file : undefined}>{nodeName(node, s)}</span>
          {textFile && diagramOk && (
            <DataControls id={id} file={file} view={view} setView={(v) => (readOnly ? setLocalView(v) : setView(id, v))} interacting={interacting} interact={interact} host={host} />
          )}
          <button type="button" className="board-card-open board-card-swap" title={s.swapTitle} aria-label={`${s.swap}: ${nodeName(node, s)}`} onClick={() => swap(id)}>
            <SwapIcon />
          </button>
          {!missing && (
            <button type="button" className="board-card-open" title={s.openTitle} aria-label={`${s.open}: ${nodeName(node, s)}`} onClick={(e) => host.openFile(file, e.metaKey || e.ctrlKey, textFile && diagramOk ? view : undefined)}>
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
      {textFile && <DataBody id={id} file={file} host={host} view={view} text={fileText} draw={draw} zoom={zoom} interacting={interacting} interact={interact} />}
      {bodyless && (
        <div className="board-card-note board-card-generic">
          <span className="board-card-ext" aria-hidden="true">{ext(file) ? `.${ext(file)}` : "?"}</span>
          <p>{s.dataBinary(ext(file))}</p>
        </div>
      )}
      {audio && <div ref={audioEl} className="board-card-audio" />}
      {pdf && (
        // Laid out at the zoom the card is shown at, not scaled with it:
        // pdf.js draws its pages at the size they are seen.
        <div className="board-card-pdf" style={{ zoom: 1 / zoom } as CSSProperties}>
          <div ref={pdfEl} className="board-card-pdf-view" />
        </div>
      )}
      {tiled && mapInfo && rect && (
        <div className="board-card-image board-map">
          <MapTiles info={mapInfo} host={host} file={file} name={nodeName(node, s)} rect={rect} strings={ms} />
        </div>
      )}
      {isMapPicture && !tiled && (mapInfo?.state === "unsupported" || mapInfo?.state === "failed") && (
        <p className="board-map-note" role="status">
          {mapInfo.state === "unsupported" ? ms.tooBig : ms.tilesFailed(mapInfo.message)}
        </p>
      )}
      {picture && !tiled && !mapPending && copy !== undefined && (crop ? (
        // The part of the picture the card shows (its crop), at the crop's
        // proportions, centred in the card.
        <div className="board-card-image cropped" ref={cropBox} data-path={file}>
          <div className="board-crop-view" style={cropView ? { width: `${cropView.w}px`, height: `${cropView.h}px` } : { visibility: "hidden" }}>
            <div className="board-crop-inner" style={{ left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, width: `${100 / crop.w}%`, height: `${100 / crop.h}%` }}>
              {/* The whole picture is what is laid out larger (and rasterised): the factor is bounded by its full width. */}
              <Sharp factor={cropSharp} w={cropView ? cropView.w / crop.w : 0} h={cropView ? cropView.h / crop.h : 0}>
                <img key={`${epoch}-${tries}`} src={copy ?? host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} decoding="async" onError={failedToLoad} onLoad={(e) => { pictureLoaded(); setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 }); }} />
              </Sharp>
              {copy && <img className="pic-full" src={host.fileSrc(file)} alt="" draggable={false} decoding="async" loading="lazy" />}
            </div>
          </div>
        </div>
      ) : (
        <div className="board-card-image" data-path={file}>
          <Sharp factor={sharp} w={Number(node.width) || 250} h={Number(node.height) || 250}>
            <img key={`${epoch}-${tries}`} src={copy ?? host.fileSrc(file)} alt={nodeName(node, s)} draggable={false} decoding="async" onError={failedToLoad} onLoad={pictureLoaded} />
          </Sharp>
          {copy && <img className="pic-full" src={host.fileSrc(file)} alt="" draggable={false} decoding="async" loading="lazy" />}
        </div>
      ))}
      {node.type === "link" && isPage(node) && host.web && <PageCard id={id} url={url} host={host} web={host.web} interacting={interacting} interact={interact} />}
      {node.type === "link" && !(isPage(node) && host.web) && (
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
      <SecretBadge node={node} strings={ms} served={host.secret?.served() ?? false} />
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

export const MemoCard = memo(Card);

/** Queue a card's drawing; the function returned takes it back if it has
 *  not started. */
export type Draw = (id: string, run: () => Promise<void>) => () => void;

/** Cards draw their notes a few at a time, the nearest to the view first
 *  (`rank`, lowest first): a board of many notes shows what is on screen at
 *  once, and the rest follows while it is looked at. */
export function drawQueue(rank: (id: string) => number, limit = 3): Draw {
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
export type View = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };

/** The corner Excalidraw draws a shape with, for its roundness. */
export function cornerRadius(e: El): number {
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
export function cardPath(w: number, h: number, r: number): string {
  const f = (n: number): string => String(Math.round(n * 100) / 100);
  return `M ${f(r)} 0 L ${f(w - r)} 0 Q ${f(w)} 0 ${f(w)} ${f(r)} L ${f(w)} ${f(h - r)} Q ${f(w)} ${f(h)} ${f(w - r)} ${f(h)} L ${f(r)} ${f(h)} Q 0 ${f(h)} 0 ${f(h - r)} L 0 ${f(r)} Q 0 0 ${f(r)} 0 Z`;
}

/** A picture's copy is this wide (`pictureCopy` in the window), and a
 *  card shows a picture about this wide at 100 %: past the zoom where the
 *  copy would be stretched, the originals are laid over the copies. */
export const PICTURE_COPY = 800;
export const CARD_PICTURE_WIDTH = 420;

/** Below this zoom a card is scaled down, not laid out at the zoom:
 *  WebKit keeps a minimum font size, and a picture shrunk does not blur. */
export const LAYOUT_ZOOM = 0.75;

/** What is drawn above a card: the elements above it in the board's order
 *  that reach into it, as one vector picture placed in scene units. */
export type Overlay = { x: number; y: number; svg: string };

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
export function CardLayer({
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
  interact,
  setView,
}: {
  setView: (id: string, view: CardView) => void;
  swap: (id: string) => void;
  /** Enter a page card, or leave it. */
  interact: (id: string, on: boolean) => void;
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
      const target = e.target as Element | null;
      if (!target?.closest?.(".board-card-slot.is-active")) return;
      // With ⌘ or ⌃ it is a zoom, and the board still takes it — except
      // over an entered diagram, which zoomed itself (its listener ran first).
      if ((e.metaKey || e.ctrlKey) && !target.closest(".board-card-dg")) return;
      e.stopPropagation();
    };
    el.addEventListener("wheel", wheel, { passive: true });
    // An entered card takes the pointer (its links, its text), so a right
    // click on it never reached the board, and the board's menu did not
    // open: a card selected, then right-clicked a moment later, showed no
    // menu. The click goes on to the board's canvas at the same point —
    // but what has a menu of its own keeps it: the card's text editor, a
    // link, a picture (the window's image menu, which listens in the
    // capture phase and answers first anyway; skipped here too, so that
    // this never depends on that order).
    const menu = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      if (!target?.closest?.(".board-card-slot.is-active") || target.closest(".board-card-editor, .board-card-image, img, a")) return;
      const canvas = el.closest(".board-canvas")?.querySelector<HTMLCanvasElement>("canvas.excalidraw__canvas.interactive");
      if (!canvas) return;
      e.preventDefault();
      e.stopPropagation();
      canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, button: 2, buttons: 2 }));
    };
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
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
                  rect={isMap(node) ? { x: e.x, y: e.y, w: e.width, h: e.height } : undefined}
                  node={node}
                  host={host}
                  tick={tick}
                  editing={editing === e.id}
                  setEditing={setEditing}
                  swap={swap}
                  draw={draw}
                  interacting={active === e.id}
                  interact={interact}
                  setView={setView}
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

export function OutlinePanel({
  outline,
  strings,
  annotations,
  onAnnotations,
  onFocus,
  onOpen,
  maps,
}: {
  /** The maps and their pins (ADR 0090), above the cards. */
  maps?: JSX.Element | null;
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
  const empty = outline.groups.length === 0 && outline.loose.length === 0 && outline.edges.length === 0 && outline.annotations.length === 0 && !maps;
  return (
    <aside className="board-outline" aria-label={strings.outlineHeading}>
      <h2 className="board-outline-heading">{strings.outlineHeading}</h2>
      {empty && <p className="board-outline-empty">{strings.empty}</p>}
      {maps}
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
