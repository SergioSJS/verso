// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Add to note…" on a line of the table (ADR 0107 item 5): the person picks
// a note, sees exactly what will be added, and only then it is appended
// through the ordinary write — the room when the note is shared live, else
// the file over the revision that was read (invariants 8 and 11), the same
// way a PDF quote reaches its companion note. Nothing is written without
// the yes; a note that changed meanwhile is refused by the revision.

import { roomSide } from "../collab";
import { afterFileChange, flushed, stopped } from "../changes";
import { commands } from "../bindings";
import { ask } from "../dialog";
import { ui } from "../dom";
import { fail } from "../errors";
import { leavesOf, liveHolder } from "../layout/spaces";
import { opening } from "../opening";
import { kindOf, name } from "../paths";
import { linkText } from "../resolve";
import { appendLines, writeLive } from "../roomWrites";
import { howSaid } from "../dice/card";
import type { TableEntry } from "./model";
import { tt } from "./strings";
import { meName } from "./record";
import { LANG, LOCALE } from "../strings";
import { fencedOfEntry } from "../rollblock/entry";

/** The time of an entry, as the log shows it. */
export function clock(at: number): string {
  return new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Who rolled, in the words of the log. */
export function whoOf(e: TableEntry): string {
  return e.mine ? tt.you : e.by || "?";
}

/** A message on one line, as a bullet of a note needs it. */
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim();

/** What an entry says, in one plain sentence (for a screen reader and for a note). */
export function saidOf(e: TableEntry): string {
  if (e.kind === "say") return oneLine(e.text ?? "");
  if (e.kind === "image") return tt.sentImage(whoOf(e));
  if (e.kind === "file") return tt.sentFile(whoOf(e), name(e.image ?? ""));
  if (e.kind === "secret") return tt.secretMasked;
  if (e.kind === "oracle") {
    const label = e.oracle === "question" ? tt.oracleQuestion : e.oracle === "spark" ? tt.oracleSpark : tt.oracleTable(e.notation);
    return `${label}: ${e.row ?? ""}${e.total ? ` (${e.total})` : ""}`;
  }
  const how = howSaid({ notation: e.notation, source: e.source, terms: e.terms, modifier: e.modifier, total: e.total ?? 0, by: e.by, at: "" });
  if (e.kind === "table") return `${e.source ?? e.notation}: ${e.row ?? "?"} (${e.notation}: ${e.total})`;
  return `${e.notation}: ${e.total}${how ? ` (${how})` : ""}`;
}

/** The line appended to a note: who, when, where and what, written as plain Markdown. */
export function lineFor(e: TableEntry, target: string): string {
  const who = e.mine && meName() ? meName() : e.mine && e.by ? e.by : whoOf(e);
  const where = e.path ? ` · [[${linkText(target, e.path)}]]` : "";
  // An image is an embed of its file (ADR 0107 item 5).
  if ((e.kind === "image" || e.kind === "file") && e.image) return `- **${who}** · ${clock(e.at)}${where} — ![[${linkText(target, e.image)}]]`;
  return `- **${who}** · ${clock(e.at)}${where} — ${saidOf(e)}`;
}

/** The roll block of an entry for the note `target` (ADR 0107, "As built"
 *  2026-10-22): who, when, where as a link, the roll itself; null for a
 *  message or an image, which keep their line. */
export function rollBlockFor(e: TableEntry, target: string): string | null {
  const who = e.mine && meName() ? meName() : e.mine && e.by ? e.by : whoOf(e);
  const where = e.path ? linkText(target, e.path) : "";
  return fencedOfEntry(e, who, where, LANG.toLowerCase().startsWith("pt") ? "pt" : "en");
}

/** What the live region says of another person's entry, with their name. */
export function announce(e: TableEntry): string {
  if (e.kind === "say") return tt.wrote(whoOf(e), saidOf(e));
  if (e.kind === "image") return tt.sentImage(whoOf(e));
  if (e.kind === "file") return tt.sentFile(whoOf(e), name(e.image ?? ""));
  if (e.kind === "secret") return tt.secretRolled(whoOf(e));
  return tt.said(whoOf(e), saidOf(e));
}

/** Pick a note, show the line, append it. Resolves when it is over. */
export async function addToNote(e: TableEntry, pick: () => Promise<string | null>): Promise<void> {
  const target = await pick();
  if (!target) return;
  if (kindOf(target) !== "note") {
    ui.status.textContent = tt.notAdded;
    return;
  }
  const line = rollBlockFor(e, target) ?? lineFor(e, target);
  if (!(await ask(tt.addAsk(name(target), line), { yes: tt.add, no: tt.cancel }))) return;
  const live = await writeLive(target, liveHolder(target), (was) => appendLines(was, [line]), roomSide);
  if (live === "room" || live === "same") {
    ui.status.textContent = tt.added(name(target));
    return;
  }
  // The note open in a tab: its text saved first, or nothing is written.
  const unsaved = await flushed(leavesOf(target));
  if (unsaved.length > 0) return stopped(unsaved);
  const existing = await opening.readNote(target);
  if (existing.status !== "ok") return fail(existing.error);
  const r = await commands.writeNote(target, appendLines(existing.data.text, [line]), existing.data.revision);
  if (r.status !== "ok") return fail(r.error);
  await afterFileChange();
  // Open in a tab where nothing was typed meanwhile: read again.
  for (const l of leavesOf(target)) if (!l.dirty) void l.load(target, true);
  ui.status.textContent = tt.added(name(target));
}
