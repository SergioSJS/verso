// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the files the person chose are (ADR 0120 item 1): a One Page
// Dungeon (its JSON, its Markdown, or both, and its pictures), or a region
// of Perilous Shores; and what an import of them makes. Recognised by what
// the files hold, never by their names. Pure.

import { type Dungeon, type DungeonText, isDungeonJson, isDungeonMarkdown, readDungeon, readDungeonMarkdown } from "./dungeon";
import { type Region, isRegionJson, readRegion } from "./region";

/** A file as the dialog read it: text for JSON and Markdown, the size for
 *  a picture (its bytes stay in the dialog). */
export type Given = { name: string; text: string | null; size: number };

/** What a file is, one by one. */
export type Seen =
  | { kind: "dungeonJson"; dungeon: Dungeon }
  | { kind: "dungeonMd"; text: DungeonText }
  | { kind: "region"; region: Region }
  | { kind: "picture" }
  /** A map of another of the generators: a city, a village, a house. */
  | { kind: "other"; generator: string }
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
    const other = otherGenerator(v);
    return other ? { kind: "other", generator: other } : { kind: "unknown" };
  }
  if (isDungeonMarkdown(t)) {
    const text = readDungeonMarkdown(t);
    if (text) return { kind: "dungeonMd", text };
  }
  return { kind: "unknown" };
}

/** The generator of an export this import does not take yet: the cities',
 *  villages' and neighbourhoods' GeoJSON names it; a house has floors. */
function otherGenerator(v: unknown): string | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o["type"] === "FeatureCollection" && Array.isArray(o["features"])) {
    const values = (o["features"] as unknown[]).find((f) => f !== null && typeof f === "object" && (f as Record<string, unknown>)["id"] === "values");
    const g = values ? (values as Record<string, unknown>)["generator"] : undefined;
    return typeof g === "string" && /^[a-z]{1,10}$/.test(g) ? g : null;
  }
  return Array.isArray(o["floors"]) ? "dwellings" : null;
}

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
    }
  | { kind: "region"; title: string; json: { name: string; region: Region }; pictures: string[] }
  | { kind: "none"; why: "empty" | "unknown" | "two" | "other"; names: string[]; generator?: string };

/** The plan for the files as a whole: one map at a time; a dungeon's JSON
 *  and Markdown go together (the Markdown carries the seed, the JSON the
 *  drawing), pictures go with whichever map came. */
export function plan(files: Given[]): Plan {
  if (files.length === 0) return { kind: "none", why: "empty", names: [] };
  const seen = files.map((f) => ({ f, s: see(f) }));
  const djson = seen.filter((x) => x.s.kind === "dungeonJson");
  const dmd = seen.filter((x) => x.s.kind === "dungeonMd");
  const regions = seen.filter((x) => x.s.kind === "region");
  const pictures = seen.filter((x) => x.s.kind === "picture").map((x) => x.f.name);
  const unknown = seen.filter((x) => x.s.kind === "unknown" || x.s.kind === "other").map((x) => x.f.name);
  const other = seen.find((x) => x.s.kind === "other");
  if (djson.length > 1 || dmd.length > 1 || regions.length > 1 || (regions.length > 0 && djson.length + dmd.length > 0)) {
    return { kind: "none", why: "two", names: [...djson, ...dmd, ...regions].map((x) => x.f.name) };
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
    };
  }
  const r = regions[0];
  if (r && r.s.kind === "region") return { kind: "region", title: r.s.region.name, json: { name: r.f.name, region: r.s.region }, pictures };
  if (other && other.s.kind === "other") return { kind: "none", why: "other", names: unknown, generator: other.s.generator };
  return { kind: "none", why: pictures.length > 0 && unknown.length === 0 ? "empty" : "unknown", names: unknown };
}
