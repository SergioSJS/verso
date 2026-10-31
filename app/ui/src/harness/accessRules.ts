// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The rules of ADR 0113 as the server's own test writes them
// (`crates/verso-server/src/access/vectors.rs` → `test/access-vectors.json`):
// the harness does not state them a fourth time, it LOOKS THEM UP. It says
// what a path is to a person (is it in a table, where its level comes from
// and what the level is, what kind of file, which of the four rights of
// ADR 0113 K.6 the person has) and the vectors say what may be done.

import vectors from "../../test/access-vectors.json";

export type TableState = "none" | "open" | "closed";
export type Source = "nothing" | "file" | "folder";
export type Lvl = "none" | "see" | "edit";
export type Kind = "note" | "board" | "base" | "attachment" | "other-file" | "folder" | "table";
export type Who = "owner/write" | "editor/write" | "reader/write" | "reader/read-token" | "owner/read-token" | "link/read-link";

/** Which of the four rights the person has at the table. */
export type Rights = { images: boolean; files: boolean; creates_notes: boolean; creates_boards: boolean };

export type Setting = { table: TableState; source: Source; level: Lvl; kind: Kind; rights: Rights; derived: boolean };

type Case = { action: string; table: string; source?: string; level?: string; kind?: string; images?: boolean; files?: boolean; creates_notes?: boolean; creates_boards?: boolean; derived?: boolean; allow: string };
const cases = (vectors as { cases: Case[] }).cases;
const names = (vectors as { who: { name: string }[] }).who.map((w) => w.name);

/** The kind of a path by its name, as the rules read it. */
export function kindOf(path: string, folder = false): Kind {
  if (folder) return "folder";
  const p = path.replace(/[. ]+$/, "").toLowerCase();
  if (p.endsWith(".md")) return "note";
  if (p.endsWith(".canvas")) return "board";
  if (p.endsWith(".base")) return "base";
  if (/\.(png|jpe?g|gif|webp|avif|pdf|mp3|ogg|wav|m4a|mp4|webm)$/.test(p)) return "attachment";
  return "other-file";
}

/** Whether `who` may `action` on a path in `s`, by the vectors. */
export function allowed(who: Who, action: string, s: Setting): boolean {
  const i = names.indexOf(who);
  if (i < 0) throw new Error(`the vectors do not know ${who}`);
  const hit = cases.find(
    (c) =>
      c.action === action &&
      c.table === s.table &&
      (s.table === "none" || (c.source === s.source && c.level === s.level)) &&
      (c.kind === undefined || c.kind === s.kind) &&
      (c.images === undefined || c.images === s.rights.images) &&
      (c.files === undefined || c.files === s.rights.files) &&
      (c.creates_notes === undefined || c.creates_notes === s.rights.creates_notes) &&
      (c.creates_boards === undefined || c.creates_boards === s.rights.creates_boards) &&
      (c.derived === undefined || c.derived === s.derived),
  );
  if (!hit) throw new Error(`no vector for ${action} ${JSON.stringify(s)}`);
  return hit.allow[i] === "y";
}
