// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's answers for periodic notes (ADR 0093), as the core gives
// them (`crates/verso-core/src/periodic.rs`): `periodic` in the folder's
// settings, read and merged key by key, a folder or template out of the
// folder refused; and Obsidian's two settings files, read as they are,
// nothing else under `.obsidian/`.

import type { ContractError, ErrorKind, ObsidianPeriodic, PeriodicSettings, PeriodSettings } from "../bindings";

type Stored = { bytes: Uint8Array };

const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const strict = new TextDecoder("utf-8", { fatal: true });

function refuse(kind: ErrorKind, message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

/** Empty, or a plain path relative to the folder, a trailing `/` let go. */
function plainOrEmpty(p: string): boolean {
  const t = p.trim().replace(/\/+$/, "");
  if (t === "") return true;
  if (t.startsWith("/") || t.includes("\0") || /^[A-Za-z]:/.test(t)) return false;
  return t.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function periodOf(v: unknown): PeriodSettings | null {
  const o = rec(v);
  if (!o) return null;
  const text = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);
  const path = (k: string) => {
    const t = text(k);
    return t !== null && plainOrEmpty(t) ? t : null;
  };
  const format = text("format");
  return { on: typeof o["on"] === "boolean" ? o["on"] : null, format: format && format.trim() ? format : null, folder: path("folder"), template: path("template") };
}

export function readPeriodic(o: Record<string, unknown>): PeriodicSettings | null {
  const p = rec(o["periodic"]);
  if (!p) return null;
  const ws = typeof p["weekStart"] === "string" && WEEKDAYS.includes(p["weekStart"]) ? p["weekStart"] : null;
  const lang = p["language"] === "pt-BR" || p["language"] === "en" ? p["language"] : null;
  return { day: periodOf(p["day"]), week: periodOf(p["week"]), month: periodOf(p["month"]), quarter: periodOf(p["quarter"]), year: periodOf(p["year"]), week_start: ws, language: lang };
}

/** `change` laid over the file's `periodic`, after the core's checks. */
export function applyPeriodic(obj: Record<string, unknown>, change: PeriodicSettings): void {
  for (const name of PERIODS) {
    const c = change[name];
    for (const p of [c?.folder, c?.template]) if (p !== null && p !== undefined && !plainOrEmpty(p)) refuse("refused", `not a path of the folder: ${p}`);
    if (c?.format !== null && c?.format !== undefined && !c.format.trim()) refuse("refused", "a periodic note's format cannot be empty");
  }
  if (change.week_start && !WEEKDAYS.includes(change.week_start)) refuse("refused", `not a day of the week: ${change.week_start}`);
  if (change.language && change.language !== "pt-BR" && change.language !== "en") refuse("refused", `not a language of the names: ${change.language}`);
  const p = rec(obj["periodic"]) ?? {};
  for (const name of PERIODS) {
    const c = change[name];
    if (!c) continue;
    const at = rec(p[name]) ?? {};
    if (c.on !== null && c.on !== undefined) at["on"] = c.on;
    if (c.format !== null && c.format !== undefined) at["format"] = c.format;
    if (c.folder !== null && c.folder !== undefined) at["folder"] = c.folder.trim().replace(/\/+$/, "");
    if (c.template !== null && c.template !== undefined) at["template"] = c.template.trim().replace(/\/+$/, "");
    p[name] = at;
  }
  if (change.week_start) p["weekStart"] = change.week_start;
  if (change.language) p["language"] = change.language;
  obj["periodic"] = p;
}

/** Keys sorted at every depth, as the core writes the file. */
export function sortedDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortedDeep);
  const o = rec(v);
  if (!o) return v;
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortedDeep(o[k])]));
}

export const OBSIDIAN_DAILY = ".obsidian/daily-notes.json";
export const OBSIDIAN_PERIODIC = ".obsidian/plugins/periodic-notes/data.json";

/** Obsidian's two settings files as they are, at most 64 KiB each. */
export function obsidianPeriodic(files: Map<string, Stored>): ObsidianPeriodic {
  const read = (path: string): string | null => {
    const f = files.get(path);
    if (!f || f.bytes.length > 64 * 1024) return null;
    try {
      return strict.decode(f.bytes);
    } catch {
      return null;
    }
  };
  const unavailable = [OBSIDIAN_DAILY, OBSIDIAN_PERIODIC].filter((p) => !files.has(p) && files.has(p.replace(/([^/]+)$/, ".$1.icloud")));
  return { daily_notes: read(OBSIDIAN_DAILY), periodic_notes: read(OBSIDIAN_PERIODIC), unavailable };
}
