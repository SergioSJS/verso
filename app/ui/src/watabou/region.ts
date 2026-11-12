// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A region of Perilous Shores saved as JSON from watabou.github.io (ADR
// 0120 item 4): its name, its seed, the towns and the dangers on its hexes
// — each with the address of the generator that makes it, seed included —
// and its named places. Read defensively; pure.

export type Town = {
  name: string;
  /** village, town or city, as the generator says. */
  kind: string;
  walled: boolean | null;
  info: string;
  seed: string | null;
  link: string | null;
};

export type Danger = { name: string; seed: string | null; link: string | null };

export type Region = {
  name: string;
  seed: string | null;
  tags: string[];
  version: string | null;
  link: string | null;
  towns: Town[];
  dangers: Danger[];
  places: string[];
};

/** Where the generators live: a link the export gives without its host
 *  is read from here. */
export const WATABOU = "https://watabou.github.io";
const MAX_ITEMS = 5000;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const seedText = (v: unknown): string | null => {
  const s = typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,20}$/.test(s) ? s : null;
};

/** Whether a parsed JSON value looks like a region of Perilous Shores:
 *  hexes, and the blueprint or the layout beside them. */
export function isRegionJson(v: unknown): boolean {
  return isRecord(v) && isRecord(v["hexes"]) && (isRecord(v["bp"]) || typeof v["layout"] === "string");
}

/** An address of the web for a link of the export: a whole address as it
 *  is, a path read from the generators' site, or — as some copies of the
 *  file have it — a path with its parameters apart. Only `https:` and
 *  `http:`; anything else is no link. */
export function linkOf(v: unknown, base = `${WATABOU}/perilous-shores/`): string | null {
  let url: URL | null = null;
  try {
    if (typeof v === "string" && v.trim() !== "") url = new URL(v.trim(), base);
    else if (isRecord(v) && typeof v["_link_path"] === "string") {
      url = new URL(v["_link_path"], WATABOU);
      const params = isRecord(v["_link_params"]) ? v["_link_params"] : {};
      for (const [k, p] of Object.entries(params)) if (typeof p === "string" || typeof p === "number" || typeof p === "boolean") url.searchParams.set(k, String(p));
    }
  } catch {
    return null;
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
  return url.href;
}

/** The region of a parsed JSON value; null when it is none. */
export function readRegion(v: unknown): Region | null {
  if (!isRegionJson(v) || !isRecord(v)) return null;
  const bp = isRecord(v["bp"]) ? v["bp"] : {};
  const tags = Array.isArray(bp["tags"]) ? bp["tags"].filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean) : [];
  const seed = seedText(bp["seed"]);
  const towns: Town[] = [];
  const dangers: Danger[] = [];
  const hexes = Object.values(v["hexes"] as Record<string, unknown>).slice(0, 100_000);
  for (const h of hexes) {
    if (!isRecord(h)) continue;
    const t = h["town"];
    if (isRecord(t) && text(t["name"]) !== "" && towns.length < MAX_ITEMS) {
      towns.push({
        name: text(t["name"]),
        kind: text(t["type"]),
        walled: typeof t["walled"] === "boolean" ? t["walled"] : null,
        info: text(t["info"]),
        seed: seedText(t["seed"]),
        link: linkOf(t["link"]),
      });
    }
    const d = h["danger"];
    if (isRecord(d) && text(d["name"]) !== "" && dangers.length < MAX_ITEMS) {
      dangers.push({ name: text(d["name"]), seed: seedText(d["seed"]), link: linkOf(d["link"]) });
    }
  }
  const named = new Set([...towns.map((t) => t.name), ...dangers.map((d) => d.name)]);
  const places: string[] = [];
  for (const f of Array.isArray(v["features"]) ? v["features"].slice(0, MAX_ITEMS) : []) {
    const name = isRecord(f) ? text(f["name"]) : "";
    if (name !== "" && !named.has(name) && !places.includes(name)) places.push(name);
  }
  return {
    name: text(v["name"]),
    seed,
    tags,
    version: typeof v["version"] === "string" ? v["version"] : null,
    link: regionLink(v, bp, seed, tags),
    towns,
    dangers,
    places,
  };
}

/** The region's own address: the one it was made at (`origin`), else one
 *  made from its seed, tags and size. */
function regionLink(v: Record<string, unknown>, bp: Record<string, unknown>, seed: string | null, tags: string[]): string | null {
  const origin = linkOf(v["origin"]);
  if (origin && /\/perilous-shores\//.test(origin)) return origin;
  if (!seed) return null;
  const url = new URL(`${WATABOU}/perilous-shores/`);
  url.searchParams.set("seed", seed);
  if (tags.length > 0) url.searchParams.set("tags", tags.join(","));
  for (const [k, p] of [["w", bp["width"]], ["h", bp["height"]]] as const) if (typeof p === "number" && Number.isFinite(p)) url.searchParams.set(k, String(Math.round(p)));
  return url.href;
}

/** Which generator an address is of, by the first part of its path
 *  (`city-generator`, `village-generator`, `one-page-dungeon`…). */
export function generatorOf(link: string | null): string | null {
  if (!link) return null;
  try {
    const part = new URL(link).pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[a-z0-9-]{1,40}$/.test(part) ? part : null;
  } catch {
    return null;
  }
}
