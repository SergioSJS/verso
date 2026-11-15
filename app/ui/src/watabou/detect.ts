// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the files the person chose are (ADR 0120 item 1): a One Page
// Dungeon (its JSON, its Markdown, or both, and its pictures), a region of
// Perilous Shores, or a house of Dwellings; and what an import of them
// makes. Recognised by what
// the files hold, never by their names. Pure.

import { type Fit, type FloorPicture, dungeonFit, houseFit, settlementPicture } from "./align";
import { type Dungeon, type DungeonText, isDungeonJson, isDungeonMarkdown, readDungeon, readDungeonMarkdown } from "./dungeon";
import { type House, houseTitle, isDwellingJson, readDwelling } from "./dwelling";
import type { PictureInfo } from "./picture";
import { type Region, isRegionJson, readRegion } from "./region";

/** A file as the dialog read it: text for JSON and Markdown, the size for
 *  a picture (its bytes stay in the dialog) and what its first bytes say
 *  of it (`picture.ts`). */
export type Given = { name: string; text: string | null; size: number; picture?: PictureInfo | null };

/** What a file is, one by one. */
export type Seen =
  | { kind: "dungeonJson"; dungeon: Dungeon }
  | { kind: "dungeonMd"; text: DungeonText }
  | { kind: "region"; region: Region }
  | { kind: "dwelling"; house: House }
  | { kind: "picture" }
  /** A map of another of the generators: a city, a village. */
  | { kind: "other"; generator: string; version: string | null }
  | { kind: "unknown" };

/** The pictures an import keeps beside the note. */
export const PICTURE = /\.(png|svg|jpe?g|webp)$/i;

/** The most bytes of a JSON or Markdown file read: the largest export seen
 *  (a region) is about 60 KB. */
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;

/** One file's kind. */
export function see(f: Given): Seen {
  if (PICTURE.test(f.name)) return { kind: "picture" };
  if (f.text === null) return { kind: "unknown" };
  const t = f.text.replace(/^﻿/, "");
  if (/^\s*[[{]/.test(t)) {
    let v: unknown;
    try {
      v = JSON.parse(t);
    } catch {
      return { kind: "unknown" };
    }
    if (isDungeonJson(v)) {
      const dungeon = readDungeon(v);
      return dungeon ? { kind: "dungeonJson", dungeon } : { kind: "unknown" };
    }
    if (isRegionJson(v)) {
      const region = readRegion(v);
      return region ? { kind: "region", region } : { kind: "unknown" };
    }
    if (isDwellingJson(v)) {
      const house = readDwelling(v);
      return house ? { kind: "dwelling", house } : { kind: "unknown" };
    }
    const other = otherGenerator(v);
    return other ? { kind: "other", ...other } : { kind: "unknown" };
  }
  if (isDungeonMarkdown(t)) {
    const text = readDungeonMarkdown(t);
    if (text) return { kind: "dungeonMd", text };
  }
  return { kind: "unknown" };
}

/** The generator of a GeoJSON export — a city's (`mfcg`), a village's
 *  (`vg`), a neighbourhood's — and its version, from its `values` feature. */
function otherGenerator(v: unknown): { generator: string; version: string | null } | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o["type"] === "FeatureCollection" && Array.isArray(o["features"])) {
    const values = (o["features"] as unknown[]).find((f) => f !== null && typeof f === "object" && (f as Record<string, unknown>)["id"] === "values") as Record<string, unknown> | undefined;
    const g = values ? values["generator"] : undefined;
    const ver = values ? values["version"] : undefined;
    return typeof g === "string" && /^[a-z]{1,10}$/.test(g) ? { generator: g, version: typeof ver === "string" && /^[\w.-]{1,20}$/.test(ver) ? ver : null } : null;
  }
  return null;
}

/** The generators whose map is its picture alone (no rooms to draw): the
 *  GeoJSON's name for each, and the generator's path on watabou.github.io. */
export const SETTLEMENTS: Readonly<Record<string, { slug: string; name: string }>> = {
  vg: { slug: "village-generator", name: "Village Generator" },
  mfcg: { slug: "city-generator", name: "Medieval Fantasy City Generator" },
};

/** What an import of the chosen files makes, or why it cannot. */
export type Plan =
  | {
      kind: "dungeon";
      title: string;
      json: { name: string; dungeon: Dungeon } | null;
      md: { name: string; text: DungeonText } | null;
      pictures: string[];
      rooms: number;
      keys: number;
      /** Where the generator's picture lies over the rooms, when an SVG
       *  of the export came (`align.ts`); and whether a picture came. */
      fit: Fit | null;
      pictured: boolean;
    }
  | { kind: "region"; title: string; json: { name: string; region: Region }; pictures: string[] }
  | {
      kind: "dwelling";
      title: string;
      json: { name: string; house: House };
      pictures: string[];
      floors: number;
      rooms: number;
      /** Each floor's picture that came, by level. */
      fit: Map<number, FloorPicture>;
    }
  /** A village or a city: its picture is its map. */
  | { kind: "settlement"; title: string; generator: string; version: string | null; json: { name: string }; pictures: string[]; shown: PictureInfo }
  | { kind: "none"; why: "empty" | "unknown" | "two" | "other" | "noPicture"; names: string[]; generator?: string };

/** The plan for the files as a whole: one map at a time; a dungeon's JSON
 *  and Markdown go together (the Markdown carries the seed, the JSON the
 *  drawing), pictures go with whichever map came. */
export function plan(files: Given[]): Plan {
  if (files.length === 0) return { kind: "none", why: "empty", names: [] };
  const seen = files.map((f) => ({ f, s: see(f) }));
  const djson = seen.filter((x) => x.s.kind === "dungeonJson");
  const dmd = seen.filter((x) => x.s.kind === "dungeonMd");
  const regions = seen.filter((x) => x.s.kind === "region");
  const houses = seen.filter((x) => x.s.kind === "dwelling");
  const pictures = seen.filter((x) => x.s.kind === "picture").map((x) => x.f.name);
  const infos = seen.map((x) => (x.s.kind === "picture" ? (x.f.picture ?? null) : null)).filter((p): p is PictureInfo => p !== null);
  const unknown = seen.filter((x) => x.s.kind === "unknown" || x.s.kind === "other").map((x) => x.f.name);
  const other = seen.find((x) => x.s.kind === "other");
  const maps = (djson.length + dmd.length > 0 ? 1 : 0) + regions.length + houses.length;
  if (djson.length > 1 || dmd.length > 1 || maps > 1) {
    return { kind: "none", why: "two", names: [...djson, ...dmd, ...regions, ...houses].map((x) => x.f.name) };
  }
  const j = djson[0];
  const m = dmd[0];
  if (j || m) {
    const dungeon = j && j.s.kind === "dungeonJson" ? j.s.dungeon : null;
    const text = m && m.s.kind === "dungeonMd" ? m.s.text : null;
    return {
      kind: "dungeon",
      title: (dungeon?.title || text?.title || "").trim(),
      json: j && dungeon ? { name: j.f.name, dungeon } : null,
      md: m && text ? { name: m.f.name, text } : null,
      pictures,
      rooms: dungeon ? dungeon.rects.filter((r) => r.w * r.h > 1).length : 0,
      keys: (text?.keys.length ?? 0) || (dungeon?.keys.length ?? 0),
      fit: dungeon ? dungeonFit(infos) : null,
      pictured: infos.length > 0,
    };
  }
  const r = regions[0];
  if (r && r.s.kind === "region") return { kind: "region", title: r.s.region.name, json: { name: r.f.name, region: r.s.region }, pictures };
  const d = houses[0];
  if (d && d.s.kind === "dwelling") {
    const house = d.s.house;
    const rooms = house.floors.reduce((n, f) => n + f.rooms.length, 0);
    const cells = house.floors.flatMap((f) => f.rooms.flatMap((r) => r.cells));
    const grid = { cols: Math.max(...cells.map((c) => c.j)) + 1, rows: Math.max(...cells.map((c) => c.i)) + 1 };
    const fit = houseFit(house.floors.map((f) => f.level), grid, infos);
    return { kind: "dwelling", title: houseTitle(d.f.name), json: { name: d.f.name, house }, pictures, floors: house.floors.length, rooms, fit };
  }
  if (other && other.s.kind === "other") {
    const known = SETTLEMENTS[other.s.generator];
    const others = seen.filter((x) => x.s.kind === "other");
    const shown = settlementPicture(infos);
    if (known && others.length === 1 && unknown.length === 1) {
      if (!shown) return { kind: "none", why: "noPicture", names: unknown, generator: known.name };
      return { kind: "settlement", title: houseTitle(other.f.name), generator: known.slug, version: other.s.version, json: { name: other.f.name }, pictures, shown };
    }
    return { kind: "none", why: "other", names: unknown, generator: other.s.generator };
  }
  return { kind: "none", why: pictures.length > 0 && unknown.length === 0 ? "empty" : "unknown", names: unknown };
}
