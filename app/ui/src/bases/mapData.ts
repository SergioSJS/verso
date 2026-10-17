// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a map view (ADR 0094 items 6 to 9) reads from a base, without the
// page: its keys as Obsidian's Maps plugin names and bounds them (the
// plugin's public MIT source, `obsidianmd/obsidian-maps` at a5bf456,
// `src/map-view.ts` and `src/map/utils.ts`, read 2026-10-14 — an
// admissible source since ADR 0009's revision of that day), a marker's
// coordinates from a cell, the tiles a view asks for and the origin they
// come from, and the shipped world (Natural Earth's countries at 1:110m,
// public domain, as world-atlas packs them in TopoJSON) as GeoJSON. A
// module without the page, so the unit tests reach it.

import type { BaseCell, BaseResult, BaseRow } from "../bindings";
import type { ViewConfig } from "./yaml";

/** The plugin's defaults (`src/map/constants.ts`). */
export const DEFAULT_HEIGHT = 400;
export const DEFAULT_ZOOM = 4;

/** A map view's settings, read and bounded as the plugin reads them. */
export type MapConfig = {
  /** The property ids of the markers' coordinates, icon and colour. */
  coordinates: string | null;
  markerIcon: string | null;
  markerColor: string | null;
  /** `[lat, lng]`, or null: the markers' centre. */
  center: [number, number] | null;
  /** The centre as written, when it is a formula Verso does not evaluate. */
  centerFormula: string | null;
  /** The zoom the view sets; null when it sets none (fit the markers). */
  defaultZoom: number | null;
  minZoom: number;
  maxZoom: number;
  /** The height of the map when embedded in a note, in pixels. */
  mapHeight: number;
  /** Tile or style addresses the view names, for light and dark. */
  mapTiles: string[];
  mapTilesDark: string[];
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  if (typeof v === "string" && v.trim() !== "") return [v.trim()];
  return [];
}

function prop(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** A coordinate as the plugin parses one: a number, or a text read by
 *  `parseFloat`. */
function coordinate(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** `[lat, lng]` when both are in range (the plugin's `verifyLatLng`). */
function pair(lat: number | null, lng: number | null): [number, number] | null {
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

/** A centre as the view writes it: `"[lat, lng]"` (what the plugin's menu
 *  writes), `"lat, lng"`, or a YAML list of two. Anything else is a
 *  formula, which the window does not evaluate. */
function centerOf(v: unknown): { center: [number, number] | null; formula: string | null } {
  if (Array.isArray(v) && v.length >= 2) return { center: pair(coordinate(v[0]), coordinate(v[1])), formula: null };
  if (typeof v !== "string" || v.trim() === "") return { center: null, formula: null };
  const m = /^\s*\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]?\s*$/.exec(v);
  if (m) return { center: pair(coordinate(m[1]), coordinate(m[2])), formula: null };
  return { center: null, formula: v.trim() };
}

/** The view's settings, as the plugin's `loadConfig` bounds them. */
export function mapConfig(view: ViewConfig): MapConfig {
  const minZoom = clamp(num(view["minZoom"]) ?? 0, 0, 24);
  const maxZoom = clamp(num(view["maxZoom"]) ?? 18, 0, 24);
  const zoom = num(view["defaultZoom"]);
  const { center, formula } = centerOf(view["center"]);
  return {
    coordinates: prop(view["coordinates"]),
    markerIcon: prop(view["markerIcon"]),
    markerColor: prop(view["markerColor"]),
    center,
    centerFormula: formula,
    defaultZoom: zoom === null ? null : clamp(zoom, minZoom, maxZoom),
    minZoom,
    maxZoom,
    mapHeight: clamp(num(view["mapHeight"]) ?? DEFAULT_HEIGHT, 100, 2000),
    mapTiles: list(view["mapTiles"]),
    mapTilesDark: list(view["mapTilesDark"]),
  };
}

/** A marker's place from its cell: a text `"lat, lng"` or a list of two,
 *  numbers or texts (the plugin's `coordinateFromValue`); null when it is
 *  neither or out of range. */
export function coordinateOf(c: BaseCell | null | undefined): [number, number] | null {
  if (!c) return null;
  if (c.kind === "list") {
    if (c.value.length < 2) return null;
    const part = (x: BaseCell | undefined) => (x?.kind === "number" ? x.value : x?.kind === "text" ? coordinate(x.value) : null);
    return pair(part(c.value[0]), part(c.value[1]));
  }
  if (c.kind === "text") {
    const parts = c.value.trim().split(",");
    if (parts.length < 2) return null;
    return pair(coordinate(parts[0]?.trim()), coordinate(parts[1]?.trim()));
  }
  return null;
}

/** A marker: a note at a place, with what its icon and colour say. */
export type Marker = {
  path: string;
  /** What the list and the pin's name show: the first column's text. */
  row: BaseRow;
  lat: number;
  lng: number;
  icon: string | null;
  color: string | null;
};

/** The id a property of the view asks the core for, as the result's
 *  columns name it (`note.x` and `x` are one property). */
function sameProp(a: string, b: string): boolean {
  const bare = (x: string) => (x.startsWith("note.") ? x.slice(5) : x);
  return bare(a) === bare(b);
}

function columnOf(result: BaseResult, id: string | null): number {
  if (!id) return -1;
  return result.columns.findIndex((c) => sameProp(c.id, id));
}

function textOf(c: BaseCell | undefined): string | null {
  if (!c) return null;
  if (c.kind === "text" || c.kind === "icon") return c.value.trim() || null;
  if (c.kind === "list") return textOf(c.value[0]);
  if (c.kind === "link") return (c.value.display ?? c.value.target).trim() || null;
  return null;
}

/** Every row of `groups` with a place, in the view's order. */
export function markersOf(result: BaseResult, groups: BaseResult["groups"], cfg: MapConfig): Marker[] {
  const at = columnOf(result, cfg.coordinates);
  if (at < 0) return [];
  const ic = columnOf(result, cfg.markerIcon);
  const co = columnOf(result, cfg.markerColor);
  const out: Marker[] = [];
  for (const g of groups) {
    for (const row of g.rows) {
      const place = coordinateOf(row.cells[at]);
      if (!place) continue;
      out.push({ path: row.path, row, lat: place[0], lng: place[1], icon: ic >= 0 ? textOf(row.cells[ic]) : null, color: co >= 0 ? textOf(row.cells[co]) : null });
    }
  }
  return out;
}

/** A colour a marker may take: a CSS colour word, `#hex`, or `rgb()`/
 *  `hsl()`/`oklch()` with plain numbers — never a `url()` or `var()` a
 *  note could use to reach elsewhere. */
export function safeColor(c: string | null): string | null {
  if (!c) return null;
  const v = c.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^[a-z]{3,30}$/i.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab)\(\s*[-\d.%\s,/a-z]*\)$/i.test(v) && !/url|var|expression/i.test(v)) return v;
  return null;
}

/** Whether an address is a tile template (`{z}/{x}/{y}`) rather than a
 *  style's or a TileJSON's: the plugin's own test. */
export function isTemplate(url: string): boolean {
  return url.includes("{z}") || url.includes("{x}") || url.includes("{y}");
}

/** The origin an address of tiles is fetched from, `https://host[:port]`;
 *  null for anything but http(s). */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url.replace(/\{[a-z]\}/gi, "0"));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Where a map's background comes from, and why. */
export type TileChoice =
  | { kind: "world"; why: "none" | "remoteOff" | "unapproved" | "invalid"; origin?: string }
  | { kind: "tiles"; urls: string[]; origins: string[] };

/** What a view shows under its markers (items 8 and 9): its own
 *  `mapTiles` once every origin they name is approved, else the person's
 *  chosen source, else the shipped world; nothing from the network while
 *  remote content is off (ADR 0050). */
export function chooseTiles(cfg: MapConfig, dark: boolean, chosen: { light: string; dark: string }, approved: readonly string[], remote: boolean): TileChoice {
  const own = dark && cfg.mapTilesDark.length > 0 ? cfg.mapTilesDark : cfg.mapTiles;
  const mine = (dark && chosen.dark.trim() ? chosen.dark : chosen.light).trim();
  const urls = own.length > 0 ? own : mine ? [mine] : [];
  if (urls.length === 0) return { kind: "world", why: "none" };
  const origins = [...new Set(urls.map(originOf))];
  if (origins.some((o) => o === null)) return { kind: "world", why: "invalid" };
  const unapproved = (origins as string[]).find((o) => !approved.includes(o));
  if (unapproved) return { kind: "world", why: "unapproved", origin: unapproved };
  if (!remote) return { kind: "world", why: "remoteOff" };
  return { kind: "tiles", urls, origins: origins as string[] };
}

/* ---------- The shipped world: TopoJSON to GeoJSON ---------- */

type Arc = [number, number][];
type Topology = {
  type: "Topology";
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: Arc[];
  objects: Record<string, { type: string; geometries?: TopoGeometry[] }>;
};
type TopoGeometry = { type: string; arcs?: unknown; id?: string };
type Position = [number, number];
type Feature = { type: "Feature"; properties: Record<string, never>; geometry: { type: string; coordinates: unknown } };
export type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

/** The arcs of `topo`, delta-decoded and placed. */
function decodedArcs(topo: Topology): Position[][] {
  const t = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      if (!t) return [dx, dy] as Position;
      x += dx;
      y += dy;
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as Position;
    });
  });
}

/** `points` with no step across the antimeridian: a longitude past it is
 *  carried on beyond ±180 (MapLibre draws it there), so that a ring
 *  around Fiji or Chukotka is not drawn as a line across the world. */
function unwrapped(points: Position[]): Position[] {
  // A ring closed along a pole (Antarctica's) is drawn as it is: its step
  // across the world runs along the pole, outside the map.
  if (points.some(([, lat]) => Math.abs(lat) > 89)) return points;
  let shift = 0;
  let prev: number | null = null;
  return points.map(([lng, lat]) => {
    if (prev !== null) {
      const step = lng + shift - prev;
      if (step > 180) shift -= 360;
      else if (step < -180) shift += 360;
    }
    prev = lng + shift;
    return [lng + shift, lat] as Position;
  });
}

function ring(arcs: Position[][], refs: number[]): Position[] {
  const out: Position[] = [];
  for (const ref of refs) {
    const arc = ref < 0 ? [...(arcs[~ref] ?? [])].reverse() : (arcs[ref] ?? []);
    arc.forEach((p, k) => {
      if (k > 0 || out.length === 0) out.push(p);
    });
  }
  return out;
}

/** The land as polygons and the borders between countries as lines —
 *  each arc two countries share, once — from world-atlas's
 *  `countries-110m.json`. */
export function worldFromTopology(topo: Topology): { land: FeatureCollection; borders: FeatureCollection } {
  const arcs = decodedArcs(topo);
  const polygons = (g: TopoGeometry): Position[][][] => {
    if (g.type === "Polygon") return [(g.arcs as number[][]).map((r) => unwrapped(ring(arcs, r)))];
    if (g.type === "MultiPolygon") return (g.arcs as number[][][]).map((p) => p.map((r) => unwrapped(ring(arcs, r))));
    return [];
  };
  const land: Feature[] = [];
  for (const g of topo.objects["land"]?.geometries ?? []) {
    for (const p of polygons(g)) land.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: p } });
  }
  // An arc used by two countries is a border; one used once is a coast.
  const uses = new Map<number, number>();
  for (const g of topo.objects["countries"]?.geometries ?? []) {
    const seen = new Set<number>();
    const walk = (x: unknown): void => {
      if (typeof x === "number") seen.add(x < 0 ? ~x : x);
      else if (Array.isArray(x)) x.forEach(walk);
    };
    walk(g.arcs);
    for (const a of seen) uses.set(a, (uses.get(a) ?? 0) + 1);
  }
  const borders: Feature[] = [];
  for (const [a, n] of uses) {
    const arc = arcs[a];
    if (n > 1 && arc) borders.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: unwrapped(arc) } });
  }
  return { land: { type: "FeatureCollection", features: land }, borders: { type: "FeatureCollection", features: borders } };
}
