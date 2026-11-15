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

import { isLinearElement, LinearElementEditor } from "@excalidraw/element";
import {
  CaptureUpdateAction,
  Excalidraw,
  FONT_FAMILY,
  Footer,
  getFormFactor,
  getSceneVersion,
  MainMenu,
  newElementWith,
  restoreElements,
  viewportCoordsToSceneCoords
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawEmbeddableElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CardLayer, drawQueue, isBarePicture, OutlinePanel, View } from "./cards";
import { hasSecret, keptIds, mapsOf, pinsOf } from "./maps";
import { mapActions, readerActions } from "./mapsActions";
import { pageActions } from "./pageActions";
import { dropActions } from "./dropActions";
import { textCardActions } from "./textCard";
import { MapsPanel } from "./mapsPanel";
import { MapTools } from "./mapsTools";
import { mapStrings } from "./mapStrings";
import { PinLayer, usePinPointer, ViewWatch, type Watch } from "./mapsView";
import { CropDialog, ExportDialog } from "./dialogs";
import { DrawingPreview, DrawingView } from "./drawing";
import { FONT_ID, fontReady, fontsOf } from "./fonts";
import { useCardButtons, useCardPreview, useHintSlot, useMenuName, useTidyContextMenu, useToolbarSlot, useToolsBelow } from "./hooks";
import { useOverlays } from "./overlays";
import { useSceneFixes } from "./arrows";
import {
  backgroundOf,
  BOARD_VERSION,
  cardCrop,
  fromElements,
  isNode,
  isSecret,
  MARKER,
  newNode,
  nodeData,
  nodeName,
  outlineOf,
  parseCanvas,
  relationEnds,
  toElements,
  withCrop,
  type CardView,
  isPage,
  type CanvasDoc,
  type CanvasNode,
  type Crop,
  type El
} from "./model";
import { PT_BR } from "./ptBR";
import { type BoardState, remeasureTargets, remoteScene, stateOver } from "./roomModel";
import { relationKeyOk } from "./relation";
import { InsertMenu, TopRightTools } from "./tools";
import { BoardHandle, BoardHost, type BoardPane, type BoardVerb } from "./types";
import { boardVerbs, usePhone } from "./phoneVerbs";
import { PHONE_MEDIA } from "../screen/phone";
import { ext } from "../paths";
import { prettyKeys } from "../keyNames";
import { MAC } from "../platform";
import { fold } from "../text";
import { fit, margined, randomId } from "./util";

/** A Mac, as Excalidraw tells one: its keys differ there (⌘⌥ for ⌃⇧). */

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

export type Api = ExcalidrawImperativeAPI;

function Board({
  host,
  initial,
  roomElements,
  bind,
}: {
  host: BoardHost;
  initial: CanvasDoc;
  /** In a room: the room's elements, drawn as they are (ADR 0082 item 12). */
  roomElements?: readonly El[];
  bind: (load: (doc: CanvasDoc) => void, focus: () => void, refresh: () => void, find: () => void, flush: () => Promise<void>, addPath: (path: string, clientX?: number, clientY?: number) => void, addText: (text: string, clientX?: number, clientY?: number) => void, verbs: () => BoardVerb[]) => void;
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
  // Nor by a reader on a server (ADR 0076 item 11).
  const newer = typeof initial.verso?.version === "number" && initial.verso.version > BOARD_VERSION;
  const readOnly = newer || Boolean(host.readOnly?.());
  /** The board opened where it was left (the setting): the pane's size no
   *  longer brings the whole board back into view. */
  const restoredView = useRef(false);
  /** The view is the user's from the first frame on: only then is it kept. */
  const viewReady = useRef(false);
  const [exporting, setExporting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  /** A font came in while a text was being typed or drawn (`remeasure`). */
  const remeasureLater = useRef(false);
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
  /** The pins (ADR 0090), drawn by `PinLayer` at one size at any zoom. */
  const [pins, setPins] = useState<readonly El[]>([]);
  const cardsKey = useRef("");
  /** Who asked to hear the view move (`ViewWatch`), and the pins' place. */
  const watchers = useRef(new Set<(v: View) => void>());
  const pinsPlace = useRef<((v: View) => void) | null>(null);
  /** The board's own elements, kept while it is shown as a reader receives
   *  it (ADR 0090 item 5): never written, nothing of it sent to a room. */
  const [asReader, setAsReader] = useState<readonly ExcalidrawElement[] | null>(null);
  const reading = useRef(false);
  const ms = mapStrings(host.lang);
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
  // A room's elements are drawn as the room holds them: measured again
  // here, one would differ from the others' at the same version.
  const initialElements = useMemo(
    () => (roomElements ? restoreElements(roomElements as never, null, { refreshDimensions: false, repairBindings: false }) : restored(initial)),
    [initial, restored, roomElements],
  );

  const baseline = useCallback((els: readonly ExcalidrawElement[], d: CanvasDoc) => {
    doc.current = d;
    sent.current = JSON.stringify(fromElements(els as unknown as El[], d));
  }, []);

  /** The scene's signature: what an edit, the user's or the board's, moves.
   *  None while Excalidraw still loads the board: until then its state is
   *  its own defaults (a white background), not the board's, and a slower
   *  engine (WebKitGTK) has the board's fonts in before the board. */
  const sigOf = (a: Api): string | null =>
    a.getAppState().isLoading ? null : `${getSceneVersion(a.getSceneElementsIncludingDeleted() as never)}|${a.getAppState().viewBackgroundColor}`;
  /** A change past what the board itself made is the user's (`edited`). The
   *  first signature seen once the board is loaded is the board as drawn. */
  const noteUser = useCallback((): void => {
    const a = api.current;
    if (!a) return;
    const sig = sigOf(a);
    if (sig === null) return;
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
    // A text being typed or drawn is Excalidraw's to measure; the board
    // measures again once that is over (`onChange`): a font that came in
    // while the first text was typed would leave it measured with another.
    const st = a.getAppState();
    if (st.editingTextElement || st.newElement || st.resizingElement) {
      remeasureLater.current = true;
      return;
    }
    remeasureLater.current = false;
    const els = a.getSceneElements();
    // In a room, only the texts this window laid out: another engine's
    // layout, measured here again, would be written again in this one's
    // (roomModel.ts `remeasureTargets`).
    const room = host.room;
    const targets = remeasureTargets(els as unknown as El[], (e) => fontReady(e as never), room ? { mine: (e) => room.mine(e), layouts: room.layouts } : null);
    const ready = new Set(targets.map((e) => e.id));
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
  }, [own, host]);
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
        // The file changed under a reader's view of it: the whole board again.
        if (reading.current) {
          reading.current = false;
          setAsReader(null);
        }
        const els = restored(d);
        window.clearTimeout(timer.current);
        touched.current = false;
        baseline(els, d);
        // What of the board's state named an element the file no longer
        // draws lets go of it in the same change (`stateOver`).
        own((a) =>
          a.updateScene({
            elements: els,
            appState: { ...stateOver(els as unknown as El[], a.getAppState() as unknown as BoardState), viewBackgroundColor: backgroundOf(d) ?? "transparent" } as never,
            captureUpdate: CaptureUpdateAction.NEVER,
          }),
        );
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
      (text, x, y) => addTextRef.current(text, x, y),
      () => verbsRef.current(),
    );
    // In a room: the others' changes come in as the room's, merged over
    // what this window is changing right now (roomModel.ts), and never
    // counted as this person's edit; the others are drawn where they are.
    const room = host.room;
    const pane: BoardPane = {
      apply: (remote, background) => {
        const a = api.current;
        // Not up yet: it is drawn from the room's elements as they are.
        if (!a || !alive.current) return remote.map((e) => e.id);
        // The scene merged (what this window is changing right now kept),
        // and what of the board's state names an element the room deleted
        // let go — a selection, a group, a line — in the same change.
        const { elements: merged, appState: fixed } = remoteScene(
          a.getSceneElementsIncludingDeleted() as unknown as El[],
          remote,
          a.getAppState() as unknown as BoardState,
          (e) => room?.mine(e) ?? false,
        );
        const appState = { ...fixed, ...(background !== undefined ? { viewBackgroundColor: background ?? "transparent" } : {}) };
        // Committed at once. Excalidraw changes its scene there and then,
        // but its state only when React renders, in a task of its own: in
        // between, a key or a pointer handled — Delete on the selection, a
        // press — read the deleted element still selected, and a render
        // for them drew it so ("[NONDELETED][INVARIANT] getSelectedElements
        // skipping deleted selected element", the board stress test,
        // 2026-10-14). Called from a task of the room's own (`pull`), never
        // from inside a render.
        flushSync(() =>
          own((b) =>
            b.updateScene({
              elements: merged as never,
              ...(Object.keys(appState).length > 0 ? { appState: appState as never } : {}),
              captureUpdate: CaptureUpdateAction.NEVER,
            }),
          ),
        );
        // Taken: the room's version is what the board now holds — the
        // same object, or a copy of it with its index repaired, at the same
        // version and nonce (roomModel.ts `repairedIndices`).
        const now = new Map(merged.map((e) => [e.id, e] as const));
        return remote
          .filter((e) => {
            const m = now.get(e.id);
            return m === e || (m !== undefined && m["version"] === e["version"] && m["versionNonce"] === e["versionNonce"]);
          })
          .map((e) => e.id);
      },
      people: (people) => api.current?.updateScene({ collaborators: new Map(people) as never }),
    };
    room?.attach(pane, initialElements as unknown as El[]);
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
      host.room?.detach(pane);
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
    if (!a || readOnly || reading.current || !alive.current) return Promise.resolve();
    noteUser();
    // In a room the board saves nothing itself: what it changed goes to the
    // room, which writes the file.
    if (host.room) {
      host.room.scene(a.getSceneElementsIncludingDeleted() as unknown as El[], a.getAppState().viewBackgroundColor, edited.current);
      edited.current = false;
      host.room.push();
      return Promise.resolve();
    }
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
  const addTextRef = useRef<(text: string, x?: number, y?: number) => void>(() => undefined);
  // The person's part in the folder may be known after the board is up (the
  // sync's state on the desktop, the capabilities on a server): the board
  // draws again, as a viewer where it only reads.
  useEffect(() => {
    const again = (): void => setTick((n) => n + 1);
    addEventListener("verso:sync-state", again);
    addEventListener("verso:role", again);
    addEventListener("verso:can-changed", again);
    addEventListener("verso:files-listed", again);
    return () => {
      removeEventListener("verso:files-listed", again);
      removeEventListener("verso:sync-state", again);
      removeEventListener("verso:role", again);
      removeEventListener("verso:can-changed", again);
    };
  }, []);
  useEffect(() => {
    // Only a board of a later Verso says so: a reader's window already
    // says that the folder is read-only.
    if (newer) host.status(s.newerBoard);
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
    // A pin is drawn by its own layer, not among the cards.
    const pinned = new Set(pinsOf(list).map((p) => p.id));
    setCards(list.filter((e) => !pinned.has(e.id)));
    setPins(pinsOf(list));
  }, []);

  const { overlays, scheduleOverlays } = useOverlays(api, dark);
  useCardPreview(container, host.preview);

  useCardButtons(container);

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
  // On a phone the free arrows are the ⋯ sheet's (board/phoneVerbs.ts).
  const phone = usePhone();
  const arrowHint = looseOn ? (phone ? s.looseOnHintPhone : s.looseOnHint) : phone ? s.looseHintPhone : touchOnly ? s.looseHintTouch : s.looseHint;
  const { freeEdges, orbitOnCards, looseFresh, liftDrawn } = useSceneFixes(own, loose);

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
      if (remeasureLater.current && !state.editingTextElement && !state.newElement && !state.resizingElement) {
        remeasureLater.current = false;
        window.setTimeout(() => alive.current && remeasure(), 0);
      }
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
        if (host.room && !readOnly && !reading.current) {
          host.room.scene(els as unknown as El[], state.viewBackgroundColor, edited.current);
          edited.current = false;
        }
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
        pinsPlace.current?.(v);
        for (const cb of watchers.current) cb(v);
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
      setSelected((was) => {
        if (was.length === ids.length && was.every((v, i) => v === ids[i])) return was;
        host.room?.selected(ids);
        return ids;
      });
    },
    [flush, noteUser, dropMarkers, syncCards, scheduleOverlays, liftDrawn, freeEdges, orbitOnCards, looseFresh, host, place, remeasure],
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
  const stair = useRef({ busy: 0, next: 0 });
  const drop = dropActions({ api, host, center, add, byId: (id) => byId(id), pin: (...a) => mapAct.pin(...a), stair, touched });
  const { sceneAt, addPath, takeFiles, onFiles } = drop;
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const textCard = textCardActions({ api, host, locked: () => readOnly || asReader !== null, add, sceneAt, lastTap, touched });
  const { addText, emptySpot, onTouchStart, editText } = textCard;
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
  // Page cards (ADR 0057 point 10): the commands in `pageActions`; the card
  // gets one function that does not change between renders.
  const pageAct = pageActions({ api, host, touched, center, add, focusBoard });
  const pageRef = useRef(pageAct);
  pageRef.current = pageAct;
  const interact = useCallback((id: string, on: boolean): void => pageRef.current.interact(id, on), []);
  const setView = useCallback((id: string, view: CardView): void => pageRef.current.setView(id, view), []);
  const swapCard = useCallback((id: string): void => {
    const e = (api.current?.getSceneElements() as unknown as El[] | undefined)?.find((x) => x.id === id);
    const n = e ? nodeData(e) : null;
    if (e && n && n.type === "file") void relinkRef.current(e, n);
  }, []);


  const selectedArrow = selected.length === 1 ? byId(selected[0] ?? "") : undefined;
  const ends = selectedArrow ? relationEnds(selectedArrow, (api.current?.getSceneElements() ?? []) as unknown as El[]) : null;
  const selectedNode = selected.length === 1 ? byId(selected[0] ?? "") : undefined;
  const selectedData = selectedNode && isNode(selectedNode) ? nodeData(selectedNode) : null;
  const lost = selectedData?.type === "file" && typeof selectedData.file === "string" && !host.exists(selectedData.file);
  const openable = !lost && selectedNode && isNode(selectedNode) && ["file", "link"].includes(nodeData(selectedNode)?.type ?? "");

  const pageToggle = !readOnly && host.web && selectedNode && selectedData?.type === "link" ? { on: isPage(selectedData), run: () => pageAct.setPage(selectedNode, selectedData, !isPage(selectedData)) } : null;

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
    if (!hit) {
      // An empty spot: a Markdown text card, unless the setting says Excalidraw's drawn text.
      if (emptySpot(ev.target)) {
        ev.stopPropagation();
        ev.preventDefault();
        void addText(ev.clientX, ev.clientY);
      }
      return;
    }
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
    // A page card is entered, as a note's card is; its button opens it.
    if (kind === "link" && data && isPage(data) && host.web && !(ev.metaKey || ev.ctrlKey)) return;
    if (openNode(hit, ev.metaKey || ev.ctrlKey)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };

  addPathRef.current = (path, clientX, clientY) => void addPath(path, clientX, clientY);
  // A text card put where something was dropped (a roll block from the table).
  addTextRef.current = drop.addTextAt;

  // Maps (ADR 0090): the commands, the pointer on the pins, and the
  // writer's "view as a reader".
  const dragFrom = useRef(new Map<string, [number, number]>());
  const mapAct = mapActions({ api, host, touched, center, dragFrom });
  const watch = useCallback<Watch>((cb) => {
    watchers.current.add(cb);
    if (liveRef.current.width > 0) cb(liveRef.current);
    return () => {
      watchers.current.delete(cb);
    };
  }, []);
  const pinAct = useRef({ writable: false, open: (_id: string, _aside: boolean): void => undefined, move: (_id: string, _dx: number, _dy: number, _done: boolean): void => undefined });
  pinAct.current = {
    writable: !readOnly && asReader === null,
    open: (id, aside) => {
      const e = byId(id);
      if (e) openNode(e, aside);
    },
    move: mapAct.movePin,
  };
  usePinPointer(container, pinAct);
  const everything = useMemo(() => [...cards, ...pins], [cards, pins]);
  const mapEls = useMemo(() => mapsOf(everything), [everything]);
  const holdsSecret = host.secret !== undefined && hasSecret(everything);
  const reader = readerActions({ api, host, doc, flush: () => flushRef.current(), own, restored, rekey: () => void (workKey.current = ""), remeasure: remeasureWhenFontsIn, asReader, setAsReader, reading, notABoard: s.notABoard });
  const toggleReader = reader.toggle;
  const secretIds = reader.secretIds;
  const mapTools = (
    <MapTools
      ms={ms}
      host={host}
      selected={selectedNode && isNode(selectedNode) ? selectedNode : undefined}
      data={selectedData}
      hasMap={mapEls.length > 0}
      writable={!readOnly && asReader === null}
      holdsSecret={holdsSecret || asReader !== null}
      viewing={asReader !== null}
      actions={mapAct}
      toggleReader={() => void toggleReader()}
    />
  );
  const mapsPanel = (
    <MapsPanel
      ms={ms}
      maps={mapEls.map((m) => ({ id: m.id, label: nodeName(nodeData(m) ?? ({} as CanvasNode), s) }))}
      pins={pins.map((p) => ({ id: p.id, label: nodeName(nodeData(p) ?? ({} as CanvasNode), s), secret: isSecret(nodeData(p) ?? ({} as CanvasNode)) }))}
      writable={!readOnly && asReader === null}
      onFocus={focusElement}
      onOpenPin={(id) => {
        const e = byId(id);
        if (e) openNode(e, false);
      }}
      stopMap={mapAct.stopMap}
    />
  );

  const slot = useToolbarSlot(container);
  useMenuName(container, s.boardMenu);
  const toolsBelow = useToolsBelow(container);
  useTidyContextMenu(container);
  const toggleLoose = (): void => {
    loose.current = !loose.current;
    setLooseOn(loose.current);
    focusBoard();
  };
  const insertMenu = readOnly ? null : (
    <InsertMenu
      s={s}
      addFile={() => void addFile()}
      addText={() => void addText()}
      addLink={() => void addLink()}
      addPage={host.web ? () => void pageAct.addPage() : undefined}
      takeFiles={takeFiles}
      looseOn={looseOn}
      toggleLoose={toggleLoose}
    />
  );
  // The same verbs for the phone's ⋯ sheet, as the board is now.
  const inBoard = (sel: string): HTMLElement | null => container.current?.querySelector<HTMLElement>(sel) ?? null;
  const verbsRef = useRef<() => BoardVerb[]>(() => []);
  verbsRef.current = () =>
    boardVerbs({
      s,
      writable: !readOnly && asReader === null,
      web: Boolean(host.web),
      looseOn,
      outlineOn: showOutline,
      addText: () => void addText(),
      addImage: () => inBoard('[data-testid="board-image-picker"]')?.click(),
      addFile: () => void addFile(),
      addLink: () => void addLink(),
      addPage: () => void pageAct.addPage(),
      toggleLoose,
      search: () => searchBox.current?.focus(),
      outline: () => setShowOutline((v) => !v),
      menu: () => inBoard('[data-testid="main-menu-trigger"]')?.click(),
    });

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
          // The board says itself what lies under the pointer (useCardPreview).
          data-preview-surface=""
          onDoubleClickCapture={onDoubleClick}
          onTouchStartCapture={onTouchStart}
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
                // The others already on the board, before any of them moves;
                // and what the room changed while Excalidraw was starting.
                if (host.room) {
                  a.updateScene({ collaborators: new Map(host.room.people()) as never });
                  host.room.resync();
                }
                const st = a.getAppState();
                const v: View = { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value, width: st.width, height: st.height };
                settledRef.current = v;
                liveRef.current = v;
                setSettled(v);
                pinsPlace.current?.(v);
                for (const cb of watchers.current) cb(v);
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
            onPointerUpdate={host.room ? (p) => host.room?.pointer(p.pointer.x, p.pointer.y, p.pointer.tool, p.button) : undefined}
            theme={dark ? "dark" : "light"}
            viewModeEnabled={readOnly || asReader !== null}
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
                pageToggle={pageToggle}
                maps={mapTools}
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
              // A phone's window (the app's own measure) is a phone's board
              // too, whatever the board's own width: its tools are laid out
              // for a phone by css/boardphone.css.
              getFormFactor: (w: number, h: number) => (window.matchMedia?.(PHONE_MEDIA).matches ? "phone" : getFormFactor(w, h)),
            }}
          >
            {toolsBelow && (
              <Footer>
                <TopRightTools
                  s={s}
                  insert={slot ? null : insertMenu}
                  cropPicture={cropPicture}
                pageToggle={pageToggle}
                  maps={mapTools}
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
              <MainMenu.Item onSelect={() => setExporting(true)} shortcut={prettyKeys("Mod-Shift-e")}>
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
              <ViewWatch.Provider value={watch}>
              <CardLayer
                editing={editing}
                setEditing={setEditing}
                swap={swapCard}
                interact={interact}
                setView={setView}
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
              />
              </ViewWatch.Provider>,
              layerHost,
            )}
          {layerHost &&
            createPortal(
              <PinLayer pins={pins} host={host} strings={ms} live={liveRef} place={pinsPlace} selected={selected} served={host.secret?.served() ?? false} open={pinAct.current.open} remove={readOnly || asReader !== null ? undefined : (id) => {
                mapAct.removePin(id);
                // The focus was on the pin, which is gone: on the board, so
                // ⌘Z reaches it (`focusBoard` finds it already inside).
                container.current?.querySelector<HTMLElement>(".excalidraw")?.focus({ preventScroll: true });
              }} />,
              layerHost,
            )}
          {asReader !== null && (
            <div className="reader-banner board-reader-banner" role="status" data-testid="board-reader-banner">
              <span>{ms.viewing}</span>
              <button type="button" className="reader-back" onClick={() => void toggleReader()}>
                {ms.back}
              </button>
            </div>
          )}
        </div>
        {exporting && api.current && <ExportDialog api={api.current} host={host} selected={selected} secretIds={holdsSecret && asReader === null ? secretIds : undefined} onClose={() => setExporting(false)} />}
        {cropping && <CropDialog src={host.fileSrc(cropping.file)} crop={cropping.crop} strings={s} onApply={applyCrop} onClose={() => setCropping(null)} />}
        {showOutline && (
          <OutlinePanel outline={outline} strings={s} maps={mapsPanel} annotations={annotations} onAnnotations={setAnnotations} onFocus={focusElement} onOpen={openFromOutline} onClose={() => setShowOutline(false)} />
        )}
      </div>
    </div>
  );
}

/** The elements a canvas draws, as the board draws them when it opens: for
 *  a change of the file given anew to a board in a room (roomModel.ts). */
export function drawnOf(doc: CanvasDoc): El[] {
  return restoreElements(toElements(doc) as never, null, { refreshDimensions: true, repairBindings: true }) as unknown as El[];
}

/** Show a drawing of the plugin in `el`; the function returned takes it away. */
export function mountDrawing(el: HTMLElement, preview: DrawingPreview): () => void {
  const root = createRoot(el);
  root.render(<DrawingView {...preview} />);
  return () => root.unmount();
}

/** Mount a board in `el`, showing the canvas `text`; null when the text is
 *  not JSON (the pane then says so and offers the text view). */
export function mountBoard(el: HTMLElement, host: BoardHost, text: string, roomElements?: readonly El[]): BoardHandle | null {
  const initial = parseCanvas(text);
  if (!initial) return null;
  let load: (doc: CanvasDoc) => void = () => undefined;
  let focus: () => void = () => undefined;
  let refresh: () => void = () => undefined;
  let find: () => void = () => undefined;
  let flush: () => Promise<void> = () => Promise.resolve();
  let addPath: (path: string, x?: number, y?: number) => void = () => undefined;
  let addText: (text: string, x?: number, y?: number) => void = () => undefined;
  let verbs: () => BoardVerb[] = () => [];
  const root = createRoot(el);
  root.render(
    <Board
      host={host}
      initial={initial}
      roomElements={roomElements}
      bind={(l, f, r, fd, fl, ap, at, vb) => {
        verbs = vb;
        addPath = ap;
        addText = at;
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
    addText: (text, x, y) => addText(text, x, y),
    flush: () => flush(),
    verbs: () => verbs(),
    destroy: () => root.unmount(),
  };
}
