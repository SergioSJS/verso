// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Reading an oracle table from text the person brought: pure, so it is tested.

/** What a table the person brings may hold. */
export const TABLE_LIMITS = { name: 80, desc: 300, entries: 500, entry: 300, importKb: 512 } as const;

/** A table read out of untrusted JSON: a name, and entries that are all
 *  text and none empty, within the limits; null when it is not one. */
export function readTable(raw: unknown): { name: string; desc: string; entries: string[] } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r["name"] === "string" ? r["name"].trim() : "";
  if (!name || name.length > TABLE_LIMITS.name) return null;
  const entries = r["entries"];
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > TABLE_LIMITS.entries) return null;
  const clean: string[] = [];
  for (const e of entries) {
    if (typeof e !== "string") return null;
    const text = e.trim();
    if (!text) return null;
    if (text.length > TABLE_LIMITS.entry) return null;
    clean.push(text);
  }
  const desc = typeof r["desc"] === "string" ? r["desc"].trim().slice(0, TABLE_LIMITS.desc) : "";
  return { name, desc, entries: clean };
}

