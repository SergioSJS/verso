// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A table to draw from is a note (ADR 0102 item 3, ADR 0088 item 3): a list
 *  with an `^id`, plain Markdown that reads as a list everywhere. This writes
 *  that text — pure, so the settings can show it before it is written. */

export interface TableToWrite {
  name: string;
  desc?: string;
  entries: readonly string[];
}

/** A block id from a name: letters, digits and hyphens (`[A-Za-z0-9-]`). */
export function blockIdOf(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "tabela";
}

/** One entry as a list item's text: one line, and not ending in what would
 *  read as a block id. */
export function entryText(e: string): string {
  return e.replace(/\s*[\r\n]+\s*/g, " ").trim().replace(/\s+\^[A-Za-z0-9-]+$/, "").trim();
}

/** A file name that a folder and every system take. */
export function noteNameOf(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return clean.slice(0, 80).trim() || "Tabelas";
}

/** The text of a note holding `tables`: a heading, an optional line, the
 *  list, a blank line and the `^id` that names it. Ids are unique in the
 *  note. */
export function tablesNoteText(title: string, tables: readonly TableToWrite[]): { text: string; ids: string[] } {
  const used = new Set<string>();
  const ids: string[] = [];
  const parts: string[] = [`# ${title.replace(/\s*[\r\n]+\s*/g, " ").trim()}`];
  for (const t of tables) {
    let id = blockIdOf(t.name);
    const base = id;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids.push(id);
    const block: string[] = [];
    if (tables.length > 1) block.push(`## ${t.name.replace(/\s*[\r\n]+\s*/g, " ").trim()}`, "");
    const desc = (t.desc ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
    if (desc) block.push(desc, "");
    block.push(...t.entries.map(entryText).filter((e) => e !== "").map((e) => `- ${e}`), "", `^${id}`);
    parts.push(block.join("\n"));
  }
  return { text: `${parts.join("\n\n")}\n`, ids };
}

/** The path of a new note called `name` in `folder` (no leading or trailing
 *  slash, `""` for the folder itself), not one of `taken` (lowercased paths,
 *  with the extension): `name`, then `name 2`… */
export function freeNotePath(folder: string, name: string, taken: ReadonlySet<string>): string {
  const dir = folder.replace(/^\/+|\/+$/g, "");
  const at = (n: string) => `${dir ? `${dir}/` : ""}${n}.md`;
  const base = noteNameOf(name);
  let candidate = base;
  for (let n = 2; taken.has(at(candidate).toLowerCase()); n++) candidate = `${base} ${n}`;
  return at(candidate);
}

/** A folder path typed by the person, made safe: forward slashes, no `..`,
 *  no absolute path, no empty parts. Null when nothing usable is left of
 *  something typed (a path that climbs out). */
export function folderOf(typed: string): string | null {
  const parts = typed.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === ".." || /[:*?"<>|]/.test(p))) return null;
  return parts.join("/");
}
