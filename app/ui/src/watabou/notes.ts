// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The notes an import writes (ADR 0120): the dungeon's, the region's, and
// a town's or a danger's when the person follows its link. The generator's
// text goes in as it came, in English; only Verso's own few words (a
// heading, a link's label) are in the interface's language. Pure.

import { fitName } from "../attachName";
import type { Dungeon, DungeonText } from "./dungeon";
import { dungeonBody } from "./dungeon";
import { type Danger, type Region, type Town, generatorOf } from "./region";

/** Verso's words in a note, in the interface's language. */
export type NoteWords = {
  towns: string;
  dangers: string;
  places: string;
  openGenerator: string;
};

/** Who made the map, said in every note an import writes. */
export const CREDIT = "Watabou, Procgen Arcana (https://watabou.github.io)";

type Value = string | number | boolean | string[] | null;

/** A YAML front matter of the properties that have a value; a string is
 *  written double-quoted (JSON's quoting is YAML's), a seed as a number. */
export function frontMatter(props: [string, Value][]): string {
  const lines = props
    .filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map((s) => JSON.stringify(s)).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/** A seed as the property holds it: a number while it is one exactly. */
const seedValue = (s: string | null): Value => (s === null ? null : Number.isSafeInteger(Number(s)) ? Number(s) : s);

/** A wikilink to a note named `name`, the name made fit for a file. */
export function noteLink(name: string): string {
  const fit = fitName(name);
  return fit === name ? `[[${fit}]]` : `[[${fit}|${name.replace(/[[\]|]/g, " ").trim()}]]`;
}

/** A Markdown link to an address of the web, its brackets escaped. */
export function webLink(label: string, url: string): string {
  return `[${label.replace(/[[\]]/g, "\\$&")}](${url.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20")})`;
}

/** The file name of `path`, for a wikilink by name. */
const base = (path: string): string => path.split("/").pop() ?? path;

/** The dungeon's note: its properties, then the generator's Markdown when
 *  it came (else the same made from the JSON), then the pictures that came
 *  with it. `board` and `json` are the paths the import made. */
export function dungeonNote(o: { json: Dungeon | null; md: DungeonText | null; board: string | null; jsonFile: string | null; pictures: string[] }): string {
  const props = frontMatter([
    ["generator", "one-page-dungeon"],
    ["generator_version", o.json?.version ?? null],
    ["seed", seedValue(o.md?.seed ?? null)],
    ["generator_link", o.md?.link ?? null],
    ["map", o.board ? `[[${base(o.board)}]]` : null],
    ["export", o.jsonFile ? `[[${base(o.jsonFile)}]]` : null],
    ["credit", CREDIT],
  ]);
  const body = o.md ? o.md.text.replace(/\r\n?/g, "\n") : o.json ? dungeonBody(o.json) : "";
  const pictures = o.pictures.map((p) => `![[${base(p)}]]`).join("\n\n");
  return `${props}${body.trimEnd()}\n${pictures ? `\n${pictures}\n` : ""}`;
}

/** The region's note: its properties, the towns and the dangers as links
 *  to notes that are made when followed, and the named places. */
export function regionNote(r: Region, w: NoteWords, jsonFile: string | null, pictures: string[] = []): string {
  const props = frontMatter([
    ["generator", "perilous-shores"],
    ["generator_version", r.version],
    ["seed", seedValue(r.seed)],
    ["generator_tags", r.tags],
    ["generator_link", r.link],
    ["export", jsonFile ? `[[${base(jsonFile)}]]` : null],
    ["credit", CREDIT],
  ]);
  const out = [`# ${r.name}`, ""];
  if (r.towns.length > 0) {
    out.push(`## ${w.towns}`, "");
    for (const t of r.towns) out.push(`- ${noteLink(t.name)}${t.kind ? ` (${t.kind})` : ""}${t.info ? `: ${oneLine(t.info)}` : ""}`);
    out.push("");
  }
  if (r.dangers.length > 0) {
    out.push(`## ${w.dangers}`, "");
    for (const d of r.dangers) out.push(`- ${noteLink(d.name)}`);
    out.push("");
  }
  if (r.places.length > 0) {
    out.push(`## ${w.places}`, "");
    for (const p of r.places) out.push(`- ${oneLine(p)}`);
    out.push("");
  }
  if (r.link) out.push(webLink(w.openGenerator, r.link), "");
  for (const p of pictures) out.push(`![[${base(p)}]]`, "");
  return `${props}${out.join("\n").trimEnd()}\n`;
}

const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, " ");

/** The note of a town or a danger of a region, made when its link is
 *  followed: what the region says of it, and its generator's address with
 *  its seed. `region` is the region note's name. */
export function placeNote(p: { town: Town } | { danger: Danger }, region: string, w: NoteWords): string {
  const town = "town" in p ? p.town : null;
  const item = "town" in p ? p.town : p.danger;
  const props = frontMatter([
    ["generator", generatorOf(item.link) ?? (town ? null : "one-page-dungeon")],
    ["seed", seedValue(item.seed)],
    ["generator_link", item.link],
    ["settlement", town?.kind || null],
    ["walled", town?.walled ?? null],
    ["region", `[[${region}]]`],
    ["credit", CREDIT],
  ]);
  const out = [`# ${item.name}`, ""];
  if (town?.info) out.push(town.info, "");
  if (item.link) out.push(webLink(w.openGenerator, item.link), "");
  return `${props}${out.join("\n").trimEnd()}\n`;
}

/** The town or the danger of a region a note's name stands for: the name
 *  as written or as made fit for a file, in any case. */
export function placeNamed(r: Region, name: string): { town: Town } | { danger: Danger } | null {
  const want = name.trim().toLowerCase();
  const is = (n: string): boolean => n.toLowerCase() === want || fitName(n).toLowerCase() === want;
  const town = r.towns.find((t) => is(t.name));
  if (town) return { town };
  const danger = r.dangers.find((d) => is(d.name));
  return danger ? { danger } : null;
}
