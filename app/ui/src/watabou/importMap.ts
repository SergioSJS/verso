// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The import itself (ADR 0120 item 1): a folder named after the map, the
// files the person exported kept in it as they came, the note, and — for a
// dungeon or a house — the board with Verso's drawing. Everything through the
// contract's create commands (createFolder, createFile, createNote,
// boardText): confined, written atomically, never over a file that is
// there (`exists` is answered, and a name taken moves on).

import { fitName } from "../attachName";
import { type ContractError, commands } from "../bindings";
import { textBase64 } from "../files";
import { placeFile } from "../placeFile";
import { type Plan } from "./detect";
import { dungeonBoard } from "./draw";
import { houseBoard } from "./drawHouse";
import { houseNote } from "./houseNote";
import { dungeonNote, regionNote, settlementBoard, settlementNote } from "./notes";
import { ww } from "./words";

/** A file the person chose, with its bytes as base64. */
export type Chosen = { name: string; base64: string };

export type Made = { folder: string; note: string; board: string | null } | { failed: ContractError | null } | { exists: true };

/** The folder's name for a map: its title made fit for a file, then
 *  "Title 2", "Title 3"… while `parent` holds one of that name. */
export function folderName(p: Plan, parent = "", taken: ReadonlySet<string> = new Set()): string {
  const fallback = p.kind === "region" ? ww.untitledRegion : p.kind === "dwelling" ? ww.untitledHouse : p.kind === "settlement" ? ww.untitledSettlement : ww.untitledDungeon;
  const base = p.kind === "none" ? fallback : fitName(p.title) || fallback;
  const at = (n: string): string => `${parent ? `${parent}/` : ""}${n}`.toLowerCase();
  let name = base;
  for (let i = 2; taken.has(at(name)) || taken.has(`${at(name)}.md`); i++) name = `${base} ${i}`;
  return name;
}

/** Import the map of `p` into a new folder `name` inside `parent` (`""`:
 *  the root). `taken` holds the folder's paths, lowercased. */
export async function importMap(p: Plan, files: Chosen[], parent: string, name: string, taken: Set<string>): Promise<Made> {
  if (p.kind === "none") return { failed: null };
  const folder = `${parent ? `${parent}/` : ""}${name}`;
  if (taken.has(folder.toLowerCase())) return { exists: true };
  const made = await commands.createFolder(folder);
  if (made.status !== "ok") return made.error.kind === "exists" ? { exists: true } : { failed: made.error };
  const dir = made.data;
  const inside = new Set<string>();
  // The exports, as they came: the JSON and the pictures (the Markdown
  // becomes the note itself).
  const keep = new Set([p.json?.name, ...p.pictures].filter((n): n is string => typeof n === "string"));
  const placed = new Map<string, string>();
  for (const f of files) {
    if (!keep.has(f.name) || placed.has(f.name)) continue;
    const r = await placeFile(dir, f.name, inside, (path) => commands.createFile(path, f.base64));
    if ("failed" in r) return { failed: r.failed };
    placed.set(f.name, r.made);
  }
  const jsonFile = p.json ? (placed.get(p.json.name) ?? null) : null;
  const pictures = p.pictures.map((n) => placed.get(n)).filter((x): x is string => typeof x === "string");
  const stem = `${dir}/${name}`;
  let board: string | null = null;
  const shownPath = (name: string): string | null => placed.get(name) ?? null;
  const dungeonPicture = p.kind === "dungeon" && p.fit ? shownPath(p.fit.shown.name) : null;
  const doc =
    p.kind === "dungeon" && p.json
      ? dungeonBoard(p.json.dungeon, `${stem}.md`, p.fit && dungeonPicture ? { path: dungeonPicture, fit: p.fit } : null)
      : p.kind === "dwelling"
        ? houseBoard(p.json.house, p.title || ww.untitledHouse, ww.house, `${stem}.md`, p.fit, (f) => shownPath(f.shown.name))
        : p.kind === "settlement" && shownPath(p.shown.name)
          ? settlementBoard(shownPath(p.shown.name) ?? "", p.shown, `${stem}.md`)
          : null;
  if (doc) {
    const text = await commands.boardText(JSON.stringify(doc));
    if (text.status !== "ok") return { failed: text.error };
    const b = await commands.createFile(`${stem}.canvas`, textBase64(text.data));
    if (b.status !== "ok") return { failed: b.error };
    board = b.data;
  }
  const noteText =
    p.kind === "dungeon"
      ? dungeonNote({ json: p.json?.dungeon ?? null, md: p.md?.text ?? null, board, jsonFile, pictures })
      : p.kind === "dwelling"
        ? houseNote({ house: p.json.house, title: p.title || ww.untitledHouse, board, jsonFile, pictures }, ww.house)
        : p.kind === "settlement"
          ? settlementNote({ title: p.title || ww.untitledSettlement, generator: p.generator, version: p.version, board, jsonFile, pictures })
          : regionNote(p.json.region, ww.note, jsonFile, pictures);
  const note = await commands.createNote(stem, noteText);
  if (note.status !== "ok") return { failed: note.error };
  return { folder: dir, note: note.data.path, board };
}
