// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Maps on the board, drawn (ADR 0090): the tiles of a large picture, the
// pins at one size on the screen at any zoom, and the way a pointer reaches
// a pin. The cards lie under Excalidraw's canvas, which takes the pointer,
// so — as the card buttons and the hover preview do (`view.tsx`,
// `hooks.ts`) — the pins say where they are and the board's own listeners
// decide which one a press or a hover reaches.

import { createContext, type JSX, type RefObject, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MapInfo } from "../bindings";
import { type View } from "./cards";
import { fitted, levelFor, nearestFirst, pinPoint, tilesIn, TileCache, type TileRef } from "./maps";
import { type MapStrings } from "./mapStrings";
import { type CanvasNode, type El, isSecret, nodeData, nodeName, pinKey } from "./model";
import { BoardHost } from "./types";

/** The board's view as it moves: a function that calls back with each new
 *  view (not only the settled one) and returns the way to stop. */
export type Watch = (cb: (v: View) => void) => () => void;
export const ViewWatch = createContext<Watch | null>(null);

/** How a map's picture stands, asked of the core while the card is up and
 *  again once a second while the core cuts it. `null` until the first
 *  answer, and for ever where the host cuts nothing. */
export function useMapInfo(host: BoardHost, file: string | null): MapInfo | null {
  const [info, setInfo] = useState<MapInfo | null>(null);
  useEffect(() => {
    const maps = host.maps;
    if (!file || !maps) {
      setInfo(null);
      return;
    }
    let gone = false;
    let timer: number | undefined;
    const ask = (): void => {
      maps.open(file).then(
        (next) => {
          if (gone) return;
          setInfo(next);
          if (next.state === "cutting") timer = window.setTimeout(ask, 1000);
        },
        // The core could not say: the picture is drawn whole, as any is,
        // and the card says why.
        (e: unknown) => !gone && setInfo({ state: "failed", width: 0, height: 0, tile: 256, levels: 0, done: 0, total: 0, message: e instanceof Error ? e.message : String(e) }),
      );
    };
    ask();
    return () => {
      gone = true;
      window.clearTimeout(timer);
    };
  }, [host, file]);
  return info;
}

/** The part of the picture the view shows, in the picture's own pixels,
 *  and the scale: screen pixels (device pixels) to a pixel of the picture. */
function seen(v: View, rect: { x: number; y: number; w: number; h: number }, pic: { width: number; height: number }): { view: [number, number, number, number]; scale: number } {
  const f = fitted({ w: rect.w, h: rect.h }, { w: pic.width, h: pic.height });
  const k = pic.width / f.w;
  const sx = (n: number): number => (n - rect.x - f.x) * k;
  const sy = (n: number): number => (n - rect.y - f.y) * k;
  const x0 = -v.scrollX;
  const y0 = -v.scrollY;
  return {
    view: [sx(x0), sy(y0), sx(x0 + v.width / v.zoom), sy(y0 + v.height / v.zoom)],
    scale: (v.zoom * f.w * (window.devicePixelRatio || 1)) / pic.width,
  };
}

/** The tiles of a map's picture in view, drawn inside the picture's card:
 *  the coarsest level whole beneath, and the level the zoom asks for over
 *  it, only where the view is (a screen of margin). The tiles come from the
 *  core a few at a time, the nearest to the middle first, and are kept. */
export function MapTiles({ info, host, file, name, rect, strings }: { info: MapInfo; host: BoardHost; file: string; name: string; rect: { x: number; y: number; w: number; h: number }; strings: MapStrings }): JSX.Element {
  const watch = useContext(ViewWatch);
  const refresh = useRef<(() => void) | null>(null);
  const frame = useRef<number | undefined>(undefined);
  /** Drawn again at the next frame: tiles that arrive together draw once. */
  const later = (): void => {
    if (frame.current !== undefined) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = undefined;
      refresh.current?.();
    });
  };
  const cache = useMemo(() => new TileCache((level, x, y) => (host.maps ? host.maps.tile(file, level, x, y) : Promise.resolve(null)), () => later()), [host, file, info.width, info.height]);
  const [shown, setShown] = useState<{ tile: TileRef; url: string }[]>([]);
  const ready = info.state === "ready";
  const last = useRef<View | null>(null);
  refresh.current = () => {
    const v = last.current;
    if (!v || !ready || v.width === 0) return;
    const { view, scale } = seen(v, rect, info);
    const top = info.levels - 1;
    const level = levelFor(scale, info.levels);
    const wanted = [...tilesIn(info, top, view, 0)];
    if (level < top) wanted.push(...nearestFirst(tilesIn(info, level, view, 1), [(view[0] + view[2]) / 2, (view[1] + view[3]) / 2]));
    cache.want(wanted);
    const have = wanted.flatMap((t) => {
      const url = cache.peek(t);
      return url ? [{ tile: t, url }] : [];
    });
    const key = (xs: readonly { tile: TileRef }[]): string => xs.map((s) => `${s.tile.level}/${s.tile.x}/${s.tile.y}`).join("|");
    setShown((was) => (key(was) === key(have) ? was : have));
    for (const t of wanted) {
      if (cache.peek(t) !== undefined) continue;
      cache.get(t).catch(() => undefined);
    }
  };
  useEffect(() => {
    if (!watch || !ready) return;
    const again = (v: View): void => {
      last.current = v;
      later();
    };
    const stop = watch(again);
    return () => {
      stop();
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
      frame.current = undefined;
    };
  }, [watch, ready, cache]);
  useEffect(() => () => cache.clear(), [cache]);
  // The same rectangle when the card is moved or resized, or the picture
  // cut: drawn again.
  useEffect(() => {
    refresh.current?.();
  }, [rect.x, rect.y, rect.w, rect.h, ready, cache]);
  const f = fitted({ w: rect.w, h: rect.h }, { w: info.width, h: info.height });
  const pct = (n: number, of: number): string => `${(n / of) * 100}%`;
  const state = info.state === "cutting" ? Math.round((info.total ?? 0) > 0 ? ((info.done ?? 0) / (info.total ?? 1)) * 100 : 0) : null;
  return (
    <div className="map-tiles" role="img" aria-label={strings.mapOf(name)} data-path={file} data-levels={info.levels}>
      <div className="map-tiles-fit" style={{ left: pct(f.x, rect.w), top: pct(f.y, rect.h), width: pct(f.w, rect.w), height: pct(f.h, rect.h) }}>
        {shown.map(({ tile, url }) => (
          <img
            key={`${tile.level}/${tile.x}/${tile.y}`}
            className="map-tile"
            data-level={tile.level}
            src={url}
            alt=""
            draggable={false}
            decoding="async"
            style={{ left: pct(tile.px, info.width), top: pct(tile.py, info.height), width: pct(tile.pw, info.width), height: pct(tile.ph, info.height) }}
          />
        ))}
      </div>
      {state !== null && (
        <p className="map-tiles-wait" role="status" aria-live="polite">
          {state > 0 ? strings.preparing(state) : strings.preparingShort}
        </p>
      )}
    </div>
  );
}

/** A lock for a card the board's readers do not receive. */
export function SecretBadge({ node, strings, served }: { node: CanvasNode; strings: MapStrings; served: boolean }): JSX.Element | null {
  if (!isSecret(node)) return null;
  const words = served ? strings.hidden : strings.local;
  return (
    <span className="secret-badge board-secret-badge" title={words} data-testid="board-secret-badge">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
        <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
      </svg>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/** A note's sticker, drawn by the window, inside a pin's mark. */
function Sticker({ host, file }: { host: BoardHost; file: string }): JSX.Element {
  const slot = useRef<HTMLSpanElement>(null);
  const [has, setHas] = useState(true);
  useLayoutEffect(() => {
    const node = host.sticker?.(file, 16) ?? null;
    setHas(node !== null);
    if (node) slot.current?.replaceChildren(node);
  }, [host, file]);
  return has ? <span className="board-pin-sticker" ref={slot} /> : <PinIcon />;
}

/** The pin's mark and its place: a drop with the note's sticker (or a dot),
 *  and the note's name. */
function PinIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" />
      <circle cx="8" cy="7" r="1.6" />
    </svg>
  );
}

/** The pins of the board — file cards marked `pin` — each a mark of one
 *  size on the screen, centred on its point at any zoom (ADR 0090 item 3).
 *  Their places follow the live view through `place`, which the board
 *  calls on every move, so a zoom never stretches them; Tab walks them in
 *  reading order, each named after its note. */
export function PinLayer({
  pins,
  host,
  strings,
  live,
  place,
  selected,
  served,
  open,
  remove,
}: {
  pins: readonly El[];
  host: BoardHost;
  strings: MapStrings;
  live: RefObject<View>;
  /** Where the layer leaves the function that places the marks. */
  place: RefObject<((v: View) => void) | null>;
  selected: readonly string[];
  served: boolean;
  open: (id: string, aside: boolean) => void;
  /** Take a pin off the board with Delete, where the board may be written. */
  remove?: (id: string) => void;
}): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const byId = useRef(new Map<string, El>());
  byId.current = new Map(pins.map((p) => [p.id, p] as const));
  const put = (v: View): void => {
    const el = root.current;
    if (!el || v.width === 0 || v.zoom <= 0) return;
    for (const mark of Array.from(el.children) as HTMLElement[]) {
      const pin = byId.current.get(mark.dataset["pin"] ?? "");
      if (!pin) continue;
      const [cx, cy] = pinPoint(pin);
      const x = (cx + v.scrollX) * v.zoom;
      const y = (cy + v.scrollY) * v.zoom;
      // Hidden past the view, a mark's width of margin: not laid out.
      const far = x < -240 || y < -60 || x > v.width + 240 || y > v.height + 60;
      mark.classList.toggle("is-far", far);
      mark.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  };
  place.current = put;
  useLayoutEffect(() => {
    if (live.current) put(live.current);
  });
  return (
    <div className="board-pins" ref={root}>
      {pins.map((p) => {
        const node = nodeData(p);
        if (!node) return null;
        const file = typeof node.file === "string" ? node.file : "";
        const missing = !host.exists(file);
        const name = nodeName(node, host.strings);
        const sticker = host.sticker !== undefined && !missing;
        const secret = isSecret(node);
        // A room's key of an imported map (ADR 0120): its number, on the
        // picture's own number, and no name beside it.
        const key = pinKey(node);
        return (
          <button
            key={p.id}
            type="button"
            className={`board-pin${key !== null ? " is-key" : ""}${selected.includes(p.id) ? " is-selected" : ""}${secret ? " is-secret" : ""}${missing ? " is-missing" : ""}`}
            data-pin={p.id}
            data-preview-path={missing ? undefined : file}
            aria-label={(key !== null ? strings.pinKey(name, key) : strings.pinOpen(name)) + (secret ? ` (${strings.secretCard})` : "")}
            onClick={(e) => open(p.id, e.metaKey || e.ctrlKey)}
            onKeyDown={(e) => {
              if (remove && (e.key === "Delete" || e.key === "Backspace")) {
                e.preventDefault();
                e.stopPropagation();
                remove(p.id);
              }
            }}
          >
            <span className="board-pin-mark" aria-hidden="true">
              {key !== null ? key : sticker ? <Sticker host={host} file={file} /> : <PinIcon />}
            </span>
            {key === null && <span className="board-pin-label">{name}</span>}
            {secret && <SecretBadge node={node} strings={strings} served={served} />}
          </button>
        );
      })}
    </div>
  );
}

/** The pointer on the pins. A press on a pin opens its note (⌘ or Ctrl
 *  beside the board); a press that moves drags the pin, where the board
 *  may be written; a finger held still shows the note (the hover preview's
 *  own, `hooks.ts`), and the lift then opens nothing. The marks take no
 *  pointer events themselves — Excalidraw's canvas does — so the press is
 *  caught on the board before it, and does not reach Excalidraw. */
export function usePinPointer(
  root: RefObject<HTMLElement | null>,
  act: RefObject<{ writable: boolean; open: (id: string, aside: boolean) => void; move: (id: string, dx: number, dy: number, done: boolean) => void }>,
): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const inside = (r: DOMRect, x: number, y: number): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const pinAt = (x: number, y: number): HTMLElement | null => {
      const marks = el.querySelectorAll<HTMLElement>(".board-pin:not(.is-far)");
      for (let i = marks.length - 1; i >= 0; i--) if (inside(marks[i]!.getBoundingClientRect(), x, y)) return marks[i]!;
      return null;
    };
    let hover: HTMLElement | null = null;
    let press: { id: string; x: number; y: number; at: number; moved: boolean; aside: boolean; touch: boolean } | null = null;
    const finish = (): void => {
      press = null;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
    const move = (e: PointerEvent): void => {
      if (!press) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.moved && Math.hypot(dx, dy) < 5) return;
      press.moved = true;
      if (act.current?.writable) act.current.move(press.id, dx, dy, false);
    };
    const up = (e: PointerEvent): void => {
      const p = press;
      finish();
      if (!p) return;
      e.stopPropagation();
      if (p.moved) {
        if (act.current?.writable) act.current.move(p.id, e.clientX - p.x, e.clientY - p.y, true);
        return;
      }
      // A finger held for the preview opened it; the lift is not a tap.
      if (p.touch && performance.now() - p.at >= 450) return;
      act.current?.open(p.id, p.aside);
    };
    const cancel = (): void => {
      const p = press;
      finish();
      if (p?.moved && act.current?.writable) act.current.move(p.id, 0, 0, true);
    };
    const down = (e: PointerEvent): void => {
      if (e.button !== 0 || e.shiftKey || e.altKey) return;
      const mark = pinAt(e.clientX, e.clientY);
      if (!mark) return;
      e.stopPropagation();
      e.preventDefault();
      press = { id: mark.dataset["pin"] ?? "", x: e.clientX, y: e.clientY, at: performance.now(), moved: false, aside: e.metaKey || e.ctrlKey, touch: e.pointerType === "touch" };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
    };
    const over = (e: PointerEvent): void => {
      const mark = e.buttons ? null : pinAt(e.clientX, e.clientY);
      if (mark === hover) return;
      hover = mark;
      el.classList.toggle("is-over-pin", !!mark);
    };
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", over, true);
    return () => {
      finish();
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", over, true);
      el.classList.remove("is-over-pin");
    };
  }, [root, act]);
}
