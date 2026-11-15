// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Maps on the board (ADR 0090): the pure parts. A map is a board — the
// picture is a file card marked `"verso": {"map": true}`, locked and at the
// bottom; a pin is a file card marked `"verso": {"pin": true}`; a node
// marked `"verso": {"secret": true}` is left out of what a UniVerso serves
// those who may only read. No node type of Verso's own: Obsidian opens it
// as a canvas with a picture and cards.
//
// No Excalidraw here, no React, no contract: the view applies what these
// say (`view.tsx`, `mapsView.tsx`).

import { type CanvasNode, type El, isMap, isNode, isPin, isSecret, nodeData, nodeName, pinKey } from "./model";

/** The side of a new pin's box on the board, in the board's units: its
 *  place and what is selected when the pin is; the mark itself is drawn at
 *  one size on the screen. */
export const PIN_BOX = 32;

/** Reading order, as the outline has it: top to bottom, then left to right. */
export const reading = (a: El, b: El): number => a.y - b.y || a.x - b.x;

const live = (els: readonly El[]): El[] => els.filter((e) => !e.isDeleted && e.type === "embeddable" && isNode(e));

/** The picture cards that are maps, bottom first. */
export function mapsOf(els: readonly El[]): El[] {
  return live(els).filter((e) => {
    const n = nodeData(e);
    return n !== null && isMap(n);
  });
}

/** The pins, in reading order: the text equivalent of the map (ADR 0090
 *  item 7), and the order Tab walks them in. */
export function pinsOf(els: readonly El[]): El[] {
  return live(els)
    .filter((e) => {
      const n = nodeData(e);
      return n !== null && isPin(n);
    })
    .sort(reading);
}

/** The node with its `verso` flags set (`true`) or taken off (`false`);
 *  every other key of `verso` kept, and `verso` itself gone when empty. */
export function flagged(node: CanvasNode, changes: { map?: boolean; pin?: boolean; secret?: boolean }): CanvasNode {
  const verso: Record<string, unknown> = typeof node["verso"] === "object" && node["verso"] !== null && !Array.isArray(node["verso"]) ? { ...(node["verso"] as Record<string, unknown>) } : {};
  for (const [key, on] of Object.entries(changes)) {
    if (on === true) verso[key] = true;
    else if (on === false) delete verso[key];
  }
  const out: CanvasNode = { ...node };
  if (Object.keys(verso).length > 0) out["verso"] = verso;
  else delete out["verso"];
  return out;
}

/** A new pin's node: a file card for a note, its box centred on `at`. */
export function pinNode(path: string, at: readonly [number, number], id: string): CanvasNode {
  return {
    id,
    type: "file",
    file: path,
    x: Math.round(at[0] - PIN_BOX / 2),
    y: Math.round(at[1] - PIN_BOX / 2),
    width: PIN_BOX,
    height: PIN_BOX,
    verso: { pin: true },
  };
}

/** A pin's name in the map's list: its note's, after its key when it is a
 *  room's key of an imported map ("1 · Swamp Citadel"). */
export function pinLabel(node: CanvasNode, strings: Parameters<typeof nodeName>[1]): string {
  const key = pinKey(node);
  return key !== null ? `${key} · ${nodeName(node, strings)}` : nodeName(node, strings);
}

/** Where a pin is: the middle of its box. */
export function pinPoint(e: { x: number; y: number; width: number; height: number }): [number, number] {
  return [e.x + e.width / 2, e.y + e.height / 2];
}

/** The map under a point of the board, the topmost one. */
export function mapAt(els: readonly El[], x: number, y: number): El | undefined {
  return [...mapsOf(els)].reverse().find((m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
}

/** Whether a drawn element is secret itself, as the core's projection
 *  reads it (`canvas_secret::drawn_is_secret`): marked under its
 *  `customData.verso` — the Watabou import's secret door — or the import's
 *  unmarked secret door of before (a dashed line of stroke 3). */
export function drawnIsSecret(e: El): boolean {
  if (isNode(e)) return false;
  const v = e.customData?.["verso"];
  const marked = typeof v === "object" && v !== null && "secret" in v && (v as { secret: unknown }).secret !== false && (v as { secret: unknown }).secret !== null;
  return marked || (e.type === "line" && e["strokeStyle"] === "dashed" && e["strokeWidth"] === 3);
}

/** Whether any node of the board is secret, or any drawn element: what a
 *  reader is not served, so "view as a reader" and the export without
 *  secrets are offered. */
export function hasSecret(els: readonly El[]): boolean {
  return (
    live(els).some((e) => {
      const n = nodeData(e);
      return n !== null && isSecret(n);
    }) || els.some((e) => !e.isDeleted && drawnIsSecret(e))
  );
}

/** The ids of everything a canvas document draws: its nodes, its edges
 *  and their labels, the elements of its drawing. The export asks the
 *  projection of the board which of these a reader keeps. */
export function keptIds(doc: { nodes?: unknown; edges?: unknown; verso?: { drawing?: unknown } }): Set<string> {
  const ids = new Set<string>();
  const take = (list: unknown, label = false): void => {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      const id = typeof x === "object" && x !== null ? (x as { id?: unknown }).id : undefined;
      if (typeof id !== "string") continue;
      ids.add(id);
      if (label) ids.add(`${id}-label`);
    }
  };
  take(doc.nodes);
  take(doc.edges, true);
  take(doc.verso?.drawing);
  return ids;
}

/** The group id the pins of `map` are in (ADR 0090 item 3): the map's own
 *  first group, or `fresh` when it has none. */
export function mapGroup(map: El, fresh: string): string {
  const groups = Array.isArray(map["groupIds"]) ? (map["groupIds"] as unknown[]) : [];
  const own = groups.find((g): g is string => typeof g === "string");
  return own ?? fresh;
}

/* -------------------------------------------------------------- tiles -- */

/** The side of a tile, as the core cuts them. */
export const TILE = 256;

/** The levels a picture of this size has (the core's `pyramid`): level 0 is
 *  the picture, each level above half the one below, the last small enough
 *  for one tile. */
export function levelsOf(width: number, height: number): number {
  let [w, h, n] = [Math.max(1, width), Math.max(1, height), 1];
  while (w > TILE || h > TILE) {
    w = Math.ceil(w / 2);
    h = Math.ceil(h / 2);
    n++;
  }
  return n;
}

/** The level to draw at: the most reduced one that is still as sharp as
 *  the screen, `scale` being the screen's pixels (device pixels) to one
 *  pixel of the picture. */
export function levelFor(scale: number, levels: number): number {
  if (!(scale > 0)) return levels - 1;
  const level = Math.floor(Math.log2(1 / scale) + 1e-9);
  return Math.max(0, Math.min(levels - 1, level));
}

/** The picture fitted in a box, centred — `object-fit: contain`. */
export function fitted(box: { w: number; h: number }, pic: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (!(pic.w > 0 && pic.h > 0 && box.w > 0 && box.h > 0)) return { x: 0, y: 0, w: box.w, h: box.h };
  const k = Math.min(box.w / pic.w, box.h / pic.h);
  const w = pic.w * k;
  const h = pic.h * k;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

/** A tile of level `level`: its column and row, and the part of the
 *  picture it covers in the picture's own pixels. */
export type TileRef = { level: number; x: number; y: number; px: number; py: number; pw: number; ph: number };

/** The tiles of `level` that meet `view` (a rectangle in the picture's
 *  pixels, `[x0, y0, x1, y1]`), widened by `margin` tiles each way. */
export function tilesIn(size: { width: number; height: number }, level: number, view: readonly [number, number, number, number], margin = 0): TileRef[] {
  const span = TILE * 2 ** level;
  const cols = Math.ceil(size.width / span);
  const rows = Math.ceil(size.height / span);
  const clamp = (n: number, hi: number): number => Math.max(0, Math.min(hi - 1, n));
  const c0 = clamp(Math.floor(view[0] / span) - margin, cols);
  const c1 = clamp(Math.floor(view[2] / span) + margin, cols);
  const r0 = clamp(Math.floor(view[1] / span) - margin, rows);
  const r1 = clamp(Math.floor(view[3] / span) + margin, rows);
  const out: TileRef[] = [];
  if (view[2] < 0 || view[3] < 0 || view[0] > size.width || view[1] > size.height) return out;
  for (let y = r0; y <= r1; y++) {
    for (let x = c0; x <= c1; x++) {
      const px = x * span;
      const py = y * span;
      out.push({ level, x, y, px, py, pw: Math.min(span, size.width - px), ph: Math.min(span, size.height - py) });
    }
  }
  return out;
}

/** The tiles nearest `centre` first (in the picture's pixels): what to ask
 *  for first. */
export function nearestFirst(tiles: readonly TileRef[], centre: readonly [number, number]): TileRef[] {
  const d = (t: TileRef): number => (t.px + t.pw / 2 - centre[0]) ** 2 + (t.py + t.ph / 2 - centre[1]) ** 2;
  return [...tiles].sort((a, b) => d(a) - d(b));
}

/** Tiles kept as data URLs, the least recently used going first when more
 *  than `most` are held; asked for a few at a time, and only while the view
 *  still wants them (`want`). `fetch` gives a tile's PNG as base64, or null
 *  when it is not there (yet). */
export class TileCache {
  private readonly held = new Map<string, string>();
  private readonly asking = new Map<string, Promise<string | null>>();
  private waiting: (() => void)[] = [];
  private wanted = new Set<string>();
  private running = 0;
  constructor(
    private readonly fetch: (level: number, x: number, y: number) => Promise<string | null>,
    /** Told when a tile has come in. */
    private readonly changed: () => void = () => undefined,
    private readonly most = 300,
    private readonly parallel = 4,
  ) {}

  private static key(t: { level: number; x: number; y: number }): string {
    return `${t.level}/${t.x}/${t.y}`;
  }

  /** The tiles the view wants now: a tile waiting for its turn that is not
   *  among them is let go. */
  want(tiles: readonly { level: number; x: number; y: number }[]): void {
    this.wanted = new Set(tiles.map((t) => TileCache.key(t)));
  }

  /** The tile if held, now. */
  peek(t: { level: number; x: number; y: number }): string | undefined {
    const key = TileCache.key(t);
    const url = this.held.get(key);
    if (url !== undefined) {
      this.held.delete(key);
      this.held.set(key, url);
    }
    return url;
  }

  /** The tile, asked for if it is not held; null when the core has none or
   *  the view no longer wanted it when its turn came. */
  get(t: { level: number; x: number; y: number }): Promise<string | null> {
    const key = TileCache.key(t);
    const url = this.peek(t);
    if (url !== undefined) return Promise.resolve(url);
    const pending = this.asking.get(key);
    if (pending) return pending;
    const job = new Promise<string | null>((resolve, reject) => {
      const next = (): void => {
        this.running--;
        this.asking.delete(key);
        this.waiting.shift()?.();
      };
      const run = (): void => {
        if (!this.wanted.has(key)) {
          this.asking.delete(key);
          resolve(null);
          this.waiting.shift()?.();
          return;
        }
        this.running++;
        this.fetch(t.level, t.x, t.y).then(
          (b64) => {
            const data = b64 === null ? null : `data:image/png;base64,${b64}`;
            if (data !== null) {
              this.held.set(key, data);
              while (this.held.size > this.most) {
                const oldest = this.held.keys().next().value;
                if (oldest === undefined) break;
                this.held.delete(oldest);
              }
            }
            next();
            resolve(data);
            if (data !== null) this.changed();
          },
          (e: unknown) => {
            next();
            reject(e instanceof Error ? e : new Error(String(e)));
          },
        );
      };
      if (this.running < this.parallel) run();
      else this.waiting.push(run);
    });
    this.asking.set(key, job);
    return job;
  }

  clear(): void {
    this.held.clear();
    this.wanted = new Set();
  }
}
