// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A One Page Dungeon exported from watabou.github.io (ADR 0120): its JSON
// (rooms, doors, numbered notes, columns, water, in cells) and its
// Markdown (title, story, the numbered keys and the permalink with the
// seed), read defensively — the format changes between the generator's
// versions, and a file is whatever the person dropped. Pure: no DOM, no
// contract. The generated text is kept as the generator wrote it.

export type Cell = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number; ending: boolean };
export type Door = { x: number; y: number; dx: number; dy: number; type: number };
export type Key = { ref: string; text: string; x: number; y: number };

export type Dungeon = {
  version: string | null;
  title: string;
  story: string;
  rects: Rect[];
  doors: Door[];
  keys: Key[];
  columns: Cell[];
  water: Cell[];
};

export type DungeonText = {
  title: string;
  story: string;
  /** The numbered keys, in the file's order: "1" → text. */
  keys: { ref: string; text: string }[];
  /** The permalink the export ends with, and the seed in it. */
  link: string | null;
  seed: string | null;
  /** The Markdown as the generator wrote it. */
  text: string;
};

/** The most rooms and corridors a dungeon may have, and the farthest a
 *  cell may lie from the middle: a file past these is no One Page Dungeon,
 *  and drawing it would freeze the board. */
export const MAX_RECTS = 2000;
export const MAX_SPAN = 2000;
const MAX_LIST = 20000;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inSpan = (n: number): boolean => Math.abs(n) <= MAX_SPAN;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_LIST) : []);

function cellOf(v: unknown): Cell | null {
  if (!isRecord(v) || !finite(v["x"]) || !finite(v["y"])) return null;
  const x = Math.round(v["x"]);
  const y = Math.round(v["y"]);
  return inSpan(x) && inSpan(y) ? { x, y } : null;
}

/** Whether a parsed JSON value looks like a One Page Dungeon: rooms in
 *  `rects` and a title or a story beside them. */
export function isDungeonJson(v: unknown): boolean {
  return isRecord(v) && Array.isArray(v["rects"]) && (typeof v["title"] === "string" || typeof v["story"] === "string");
}

/** The dungeon of a parsed JSON value; null when it has no room at all or
 *  more than a dungeon can hold. Entries that are not what they should be
 *  are left out, one by one. */
export function readDungeon(v: unknown): Dungeon | null {
  if (!isDungeonJson(v) || !isRecord(v)) return null;
  const raw = v["rects"] as unknown[];
  if (raw.length > MAX_RECTS) return null;
  const rects: Rect[] = [];
  for (const r of raw) {
    if (!isRecord(r) || !finite(r["x"]) || !finite(r["y"]) || !finite(r["w"]) || !finite(r["h"])) continue;
    const x = Math.round(r["x"]);
    const y = Math.round(r["y"]);
    const w = Math.round(r["w"]);
    const h = Math.round(r["h"]);
    if (w < 1 || h < 1 || !inSpan(x) || !inSpan(y) || !inSpan(x + w) || !inSpan(y + h)) continue;
    rects.push({ x, y, w, h, ending: r["ending"] === true });
  }
  if (rects.length === 0) return null;
  const doors: Door[] = [];
  for (const d of list(v["doors"])) {
    const at = cellOf(d);
    if (!at || !isRecord(d)) continue;
    const dir = isRecord(d["dir"]) ? d["dir"] : {};
    const dx = finite(dir["x"]) ? Math.sign(dir["x"]) : 0;
    const dy = finite(dir["y"]) ? Math.sign(dir["y"]) : 0;
    doors.push({ ...at, dx, dy: dx !== 0 ? 0 : dy, type: finite(d["type"]) ? Math.round(d["type"]) : -1 });
  }
  const keys: Key[] = [];
  for (const n of list(v["notes"])) {
    if (!isRecord(n) || typeof n["text"] !== "string") continue;
    const ref = typeof n["ref"] === "string" || finite(n["ref"]) ? String(n["ref"]).trim() : "";
    const pos = isRecord(n["pos"]) ? n["pos"] : {};
    const x = finite(pos["x"]) && inSpan(pos["x"]) ? pos["x"] : NaN;
    const y = finite(pos["y"]) && inSpan(pos["y"]) ? pos["y"] : NaN;
    keys.push({ ref, text: n["text"], x, y });
  }
  keys.sort((a, b) => refOrder(a.ref, b.ref));
  const cells = (k: string): Cell[] => list(v[k]).map(cellOf).filter((c): c is Cell => c !== null);
  return {
    version: typeof v["version"] === "string" ? v["version"] : null,
    title: typeof v["title"] === "string" ? v["title"].trim() : "",
    story: typeof v["story"] === "string" ? v["story"].trim() : "",
    rects,
    doors,
    keys,
    columns: cells("columns"),
    water: cells("water"),
  };
}

/** Keys in their numbers' order ("2" before "10"), any other ref after. */
function refOrder(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity;
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity;
  return na !== nb ? na - nb : a.localeCompare(b);
}

/** Whether a Markdown text is the One Page Dungeon's own export: a title,
 *  then the permalink to the generator at its end. */
export function isDungeonMarkdown(text: string): boolean {
  return /^#\s+\S/m.test(text) && /watabou\.github\.io\/one-page-dungeon\//.test(text);
}

/** The parts of the generator's Markdown: its first heading, the story (the
 *  paragraph in italics), the numbered keys and the permalink's seed. */
export function readDungeonMarkdown(text: string): DungeonText | null {
  if (!isDungeonMarkdown(text)) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const title = (lines.find((l) => /^#\s+\S/.test(l)) ?? "").replace(/^#\s+/, "").trim();
  const storyLine = lines.find((l) => /^\*[^*].*\*\s*$/.test(l.trim()));
  const story = storyLine ? storyLine.trim().replace(/^\*|\*$/g, "").trim() : "";
  const keys: { ref: string; text: string }[] = [];
  for (const l of lines) {
    const m = /^(\d+)\.\s+(.*)$/.exec(l.trim());
    if (m) keys.push({ ref: m[1] ?? "", text: (m[2] ?? "").trim() });
  }
  const urls = [...text.matchAll(/https:\/\/watabou\.github\.io\/one-page-dungeon\/[^\s)\]]*/g)].map((m) => m[0]);
  const link = urls[urls.length - 1] ?? null;
  return { title, story, keys, link, seed: link ? seedOf(link) : null, text };
}

/** The `seed` parameter of a generator's address, when it is a number. */
export function seedOf(url: string): string | null {
  try {
    const s = new URL(url).searchParams.get("seed");
    return s !== null && /^\d{1,20}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** The body of a dungeon's note as the generator's Markdown has it, made
 *  from the JSON when no Markdown came: the title, the story in italics
 *  and the numbered keys. */
export function dungeonBody(d: Dungeon): string {
  const out = [`# ${d.title}`, ""];
  if (d.story) out.push(`*${d.story}*`, "");
  for (const k of d.keys) out.push(`${/^\d+$/.test(k.ref) ? `${k.ref}.` : "-"} ${k.text.replace(/\s*\n\s*/g, " ")}`);
  return `${out.join("\n").trimEnd()}\n`;
}
