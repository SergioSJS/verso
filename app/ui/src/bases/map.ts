// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The map layout (ADR 0094 items 6 to 10, 14): the notes with a place as
// markers on a map — a click opens the note, a hover shows its preview
// (ADR 0085) — over the world outline shipped with the app, or over tiles
// from an origin the person approved; and the same markers as a list,
// in the view's order, the map's text equivalent. MapLibre GL JS draws
// it, loaded only when a map opens (`import("maplibre-gl")`, its worker a
// file of the window's own, `maplibre-worker.mjs`): the window's start
// pays nothing for it. A marker is not dragged, and the map makes no
// note (items 6 and 11).

import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import { renderLucideSvg } from "../labels";
import { asset } from "../version";
import { cellText, h } from "./cells";
import { chooseTiles, DEFAULT_ZOOM, isTemplate, mapConfig, markersOf, originOf, safeColor, worldFromTopology, type MapConfig, type Marker, type TileChoice } from "./mapData";
import type { RenderCtx } from "./view";
import * as Y from "./yaml";

/** What a map needs from the window, besides a base's host. */
export type MapHost = {
  /** The background the person chose in Settings; empty for the world. */
  sources(): { light: string; dark: string };
  /** The origins approved for tiles. */
  approved(): readonly string[];
  /** Approve an origin for tiles, as Settings would. */
  approve(origin: string): void;
  /** Whether the window is drawn dark. */
  dark(): boolean;
  /** A server's page: its policy is set when it loads, so an origin
   *  approved since is reached after a reload (item 10). */
  reloadToReach(): boolean;
  reload(): void;
};

type MapLib = typeof import("maplibre-gl");

let lib: Promise<MapLib> | null = null;

/** MapLibre, its worker and its stylesheet, the first time a map opens. */
function maplibre(): Promise<MapLib> {
  lib ??= import("maplibre-gl").then((m) => {
    m.setWorkerUrl(new URL(asset("maplibre-worker.mjs"), document.baseURI).href);
    if (!document.querySelector("link[data-maplibre]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = asset("maplibre-gl.css");
      link.dataset["maplibre"] = "";
      document.head.append(link);
    }
    return m;
  });
  lib.catch(() => (lib = null));
  return lib;
}

let world: Promise<{ land: object; borders: object }> | null = null;

/** The shipped world: Natural Earth's countries at 1:110m (public domain),
 *  as world-atlas packs them, a file of the window's own. */
function shippedWorld(): Promise<{ land: object; borders: object }> {
  world ??= fetch(asset("world-110m.json"))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((topo) => worldFromTopology(topo));
  world.catch(() => (world = null));
  return world;
}

/** A colour of the window's palette as MapLibre reads colours (`rgba()`):
 *  resolved by the page, then by a canvas, which takes `oklch()`. */
function paletteColor(probeIn: HTMLElement, variable: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable})`;
  probe.hidden = true;
  probeIn.append(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d");
    if (!x || !css) return fallback;
    x.fillStyle = fallback;
    x.fillStyle = css;
    x.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255).toFixed(3)})`;
  } catch {
    return fallback;
  }
}

/** The style of a background: the world drawn from the shipped outline,
 *  in the window's colours; a style address; or raster tiles from
 *  templates (the plugin's reading of `mapTiles`). */
async function styleFor(choice: TileChoice, colours: HTMLElement): Promise<StyleSpecification | string> {
  if (choice.kind === "tiles") {
    const [first] = choice.urls;
    if (choice.urls.length === 1 && first && !isTemplate(first)) return first;
    return {
      version: 8,
      sources: Object.fromEntries(choice.urls.map((u, k) => [`tiles-${k}`, { type: "raster", tiles: [u], tileSize: 256 }])),
      layers: choice.urls.map((_, k) => ({ id: `tiles-${k}`, type: "raster", source: `tiles-${k}` })),
    } as StyleSpecification;
  }
  const w = await shippedWorld();
  const sea = paletteColor(colours, "--paper-3", "#e8e2d6");
  const land = paletteColor(colours, "--paper", "#fbf8f2");
  const coast = paletteColor(colours, "--ink-3", "#7a6f62");
  const border = paletteColor(colours, "--hair", "#d8cfbf");
  return {
    version: 8,
    sources: {
      land: { type: "geojson", data: w.land as never, attribution: "Natural Earth" },
      borders: { type: "geojson", data: w.borders as never },
    },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": sea } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": land } },
      { id: "coast", type: "line", source: "land", paint: { "line-color": coast, "line-width": 0.7 } },
      { id: "borders", type: "line", source: "borders", paint: { "line-color": border, "line-width": 0.6 } },
    ],
  };
}

/** A map kept between drawings of its view: the same element, the same
 *  MapLibre map, its markers replaced. */
class MapState {
  readonly box = h("div", "base-map");
  readonly notices = h("div", "base-map-notices");
  map: MapLibreMap | null = null;
  private markers: MapLibreMarker[] = [];
  private styleKey = "";
  private placedKey = "";
  private failed = false;
  /** Origins a style asked for that were not approved: nothing was asked
   *  of them. */
  private readonly blocked = new Set<string>();
  private approved = new Set<string>();
  private gone = false;
  private pending: Promise<void> = Promise.resolve();
  private tileError = "";

  constructor() {
    this.box.tabIndex = 0;
    this.box.setAttribute("role", "region");
  }

  destroy(): void {
    this.gone = true;
    for (const m of this.markers) m.remove();
    this.map?.remove();
    this.map = null;
  }

  /** Draw `markers` over `choice`, as `cfg` places them. */
  update(ctx: RenderCtx, maps: MapHost, cfg: MapConfig, choice: TileChoice, markers: Marker[]): void {
    this.pending = this.pending.then(() => this.apply(ctx, maps, cfg, choice, markers)).catch(() => undefined);
  }

  private async apply(ctx: RenderCtx, maps: MapHost, cfg: MapConfig, choice: TileChoice, markers: Marker[]): Promise<void> {
    if (this.gone || this.failed) return;
    const s = ctx.s;
    let ml: MapLib;
    try {
      ml = await maplibre();
    } catch {
      this.fail(s.mapLoadFailed);
      return;
    }
    this.approved = new Set(maps.approved());
    const styleKey = JSON.stringify([choice, maps.dark()]);
    let style: StyleSpecification | string;
    try {
      style = await styleFor(choice, this.box);
    } catch {
      this.fail(s.mapLoadFailed);
      return;
    }
    if (this.gone) return;
    if (!this.map) {
      try {
        this.map = new ml.Map({
          container: this.box,
          style,
          center: cfg.center ? [cfg.center[1], cfg.center[0]] : [0, 20],
          zoom: cfg.defaultZoom ?? 1,
          minZoom: cfg.minZoom,
          maxZoom: cfg.maxZoom,
          attributionControl: { compact: true },
          // Only what the person approved is asked for (items 8 and 9);
          // anything a style names elsewhere is not.
          transformRequest: (url) => {
            const o = originOf(url);
            if (o === null || this.approved.has(o) || o === location.origin) return { url };
            if (!this.blocked.has(o)) {
              this.blocked.add(o);
              this.notice(s);
            }
            return { url: "about:blank" };
          },
        });
      } catch {
        this.fail(s.noWebGL);
        return;
      }
      this.map.on("error", (e) => {
        // A tile or a style that did not load: said once, never thrown.
        const msg = (e as { error?: { message?: string } }).error?.message ?? "";
        if (msg && !this.tileError) {
          this.tileError = msg;
          this.notice(s);
        }
      });
      this.styleKey = styleKey;
    } else if (styleKey !== this.styleKey) {
      this.styleKey = styleKey;
      this.tileError = "";
      this.map.setStyle(style);
    }
    const map = this.map;
    map.setMinZoom(cfg.minZoom);
    map.setMaxZoom(cfg.maxZoom);
    map.resize();
    this.place(ctx, ml, map, markers);
    // The camera: the view's centre and zoom, else every marker in sight
    // — the first time, and when the markers or the settings change.
    const placedKey = JSON.stringify([cfg.center, cfg.defaultZoom, markers.map((m) => [m.lat, m.lng])]);
    if (placedKey !== this.placedKey) {
      this.placedKey = placedKey;
      // No flight between places: a change of the view jumps, and the
      // person's own panning and zooming are MapLibre's, which keeps
      // them short.
      if (cfg.center) map.jumpTo({ center: [cfg.center[1], cfg.center[0]], zoom: cfg.defaultZoom ?? DEFAULT_ZOOM });
      else if (markers.length > 0) {
        const b = new ml.LngLatBounds();
        for (const m of markers) b.extend([m.lng, m.lat]);
        map.fitBounds(b, { padding: 40, maxZoom: cfg.defaultZoom ?? (choice.kind === "world" ? 5 : 14), animate: false });
      } else map.jumpTo({ center: [0, 20], zoom: cfg.defaultZoom ?? 1 });
    }
  }

  /** The markers, anew: a pin per place, named for the preview, opening
   *  the note at a click. Hidden from assistive technology: the list
   *  below names them, reachable by Tab (item 14). */
  private place(ctx: RenderCtx, ml: MapLib, map: MapLibreMap, markers: Marker[]): void {
    for (const m of this.markers) m.remove();
    this.markers = markers.map((mk) => {
      // MapLibre places the marker's own element with a transform: the
      // pin's shape is drawn by an element inside it.
      const holder = h("div", "base-map-marker");
      const pin = h("div", "base-map-pin");
      holder.append(pin);
      pin.dataset["previewPath"] = mk.path;
      pin.dataset["path"] = mk.path;
      pin.title = cellText(mk.row.cells[0], ctx.host) || mk.path;
      const colour = safeColor(mk.color);
      if (colour) pin.style.setProperty("--pin", colour);
      const glyph = mk.icon ? renderLucideSvg(mk.icon, 14) : null;
      if (glyph) pin.append(glyph);
      else pin.classList.add("dot");
      holder.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.host.open(mk.path, e.metaKey || e.ctrlKey);
      });
      const marker = new ml.Marker({ element: holder, anchor: "bottom", offset: [0, -5] }).setLngLat([mk.lng, mk.lat]).addTo(map);
      const el = marker.getElement();
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
      return marker;
    });
  }

  /** A pin named for `path`, marked as the one the list's focus is on. */
  highlight(path: string | null): void {
    for (const m of this.markers) {
      const pin = m.getElement().querySelector<HTMLElement>(".base-map-pin");
      pin?.classList.toggle("focused", pin.dataset["path"] === path);
    }
  }

  private fail(text: string): void {
    this.failed = true;
    this.box.replaceChildren(h("p", "base-map-failed", text));
    this.box.classList.add("failed");
  }

  /** The background's own lines: what was not asked for, what did not
   *  load. */
  private notice(s: RenderCtx["s"]): void {
    const lines: HTMLElement[] = [];
    if (this.blocked.size > 0) lines.push(h("p", "base-problem", s.tilesBlocked([...this.blocked].join(", "))));
    if (this.tileError) lines.push(h("p", "base-problem", s.tilesFailed(this.tileError)));
    this.notices.replaceChildren(...lines);
  }
}

/** The map layout. `maps` absent (a window without one): the list only. */
export function renderMap(ctx: RenderCtx, maps: MapHost | undefined): HTMLElement {
  const { s, view } = ctx;
  const cfg = mapConfig(view);
  const wrap = h("div", "base-map-wrap");
  const lines = h("div", "base-map-lines");
  lines.setAttribute("role", "status");
  wrap.append(lines);
  const say: HTMLElement[] = [];
  if (!cfg.coordinates) {
    wrap.append(h("p", "base-hint", s.chooseCoordinates));
    return wrap;
  }
  const markers = markersOf(ctx.result, ctx.groups, cfg);
  const rows = ctx.groups.reduce((n, g) => n + g.rows.length, 0);
  const choice = maps ? chooseTiles(cfg, maps.dark(), maps.sources(), maps.approved(), ctx.host.remote()) : ({ kind: "world", why: "none" } as TileChoice);
  if (choice.kind === "world" && choice.why === "unapproved" && choice.origin && maps) {
    const origin = choice.origin;
    const p = h("p", "base-problem base-map-ask", s.tilesAsk(origin));
    const yes = h("button", "base-link-button", s.tilesApprove(origin));
    yes.type = "button";
    yes.addEventListener("click", () => {
      maps.approve(origin);
      if (maps.reloadToReach()) {
        const again = h("p", "base-problem", s.tilesReload(origin));
        const reload = h("button", "base-link-button", s.reload);
        reload.type = "button";
        reload.addEventListener("click", () => maps.reload());
        again.append(" ", reload);
        p.replaceWith(again);
        reload.focus();
      } else ctx.refresh();
    });
    p.append(" ", yes);
    say.push(p);
  } else if (choice.kind === "world" && choice.why === "remoteOff") say.push(h("p", "base-problem", s.tilesRemoteOff));
  else if (choice.kind === "world" && choice.why === "invalid") say.push(h("p", "base-problem", s.tilesInvalid));
  if (cfg.centerFormula) say.push(h("p", "base-problem", s.centerFormula(cfg.centerFormula)));
  if (markers.length < rows) say.push(h("p", "base-hint", s.noPlace(rows - markers.length)));
  lines.append(...say);

  // The map itself, kept between drawings.
  let state = ctx.keep.get("map") as MapState | undefined;
  if (!state) {
    state = new MapState();
    ctx.keep.set("map", state);
  }
  const st = state;
  st.box.setAttribute("aria-label", s.mapLabel(markers.length));
  // Embedded in a note, the view's height; in its own tab, the pane's.
  if (ctx.embedded) st.box.style.height = `${cfg.mapHeight}px`;
  else st.box.style.removeProperty("height");
  if (maps) wrap.append(st.notices, st.box);
  if (maps) {
    st.update(ctx, maps, cfg, choice, markers);
    menuOn(ctx, st, s);
  }

  // The markers as a list, the map's text equivalent (item 14).
  const list = h("ol", "base-map-list");
  list.setAttribute("aria-label", s.mapPlaces);
  for (const mk of markers) {
    const li = h("li");
    const a = h("a", "base-file", cellText(mk.row.cells[0], ctx.host) || mk.path);
    a.href = "#";
    a.dataset["previewPath"] = mk.path;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      ctx.host.open(mk.path, e.metaKey || e.ctrlKey);
    });
    a.addEventListener("focus", () => st.highlight(mk.path));
    a.addEventListener("blur", () => st.highlight(null));
    const at = h("span", "base-map-coords", ` — ${formatPlace(mk.lat, mk.lng, ctx.host.locale)}`);
    li.append(a, at);
    list.append(li);
  }
  const head = h("h3", "base-map-list-head", s.mapPlaces);
  wrap.append(head, markers.length > 0 ? list : h("p", "base-empty", s.emptyView));
  return wrap;
}

function formatPlace(lat: number, lng: number, locale: string): string {
  const f = new Intl.NumberFormat(locale, { maximumFractionDigits: 5 });
  return `${f.format(lat)}, ${f.format(lng)}`;
}

/** The map's own menu, at a right click: copy the place, or make it the
 *  view's centre or zoom (the plugin's menu, without "New note": not in
 *  V1, item 6). Each is also a field of the view's settings. */
function menuOn(ctx: RenderCtx, st: MapState, s: RenderCtx["s"]): void {
  st.box.oncontextmenu = (e) => {
    const map = st.map;
    if (!map) return;
    e.preventDefault();
    const r = st.box.getBoundingClientRect();
    const at = map.unproject([e.clientX - r.left, e.clientY - r.top]);
    const lat = Number(at.lat.toFixed(5));
    const lng = Number(at.lng.toFixed(5));
    const zoom = Math.round(map.getZoom() * 10) / 10;
    const items: [string, () => void][] = [
      [s.copyCoords, () => void ctx.host.copy(`${lat}, ${lng}`).then(() => ctx.host.status(s.coordsCopied))],
    ];
    const change = ctx.change;
    if (change) {
      items.push([s.setCenter, () => change((t, i) => Y.setViewKey(t, i, "center", `[${lat}, ${lng}]`))]);
      items.push([s.setZoom(zoom), () => change((t, i) => Y.setViewKey(t, i, "defaultZoom", zoom))]);
    }
    ctx.host.menu(e.clientX, e.clientY, items);
  };
}
