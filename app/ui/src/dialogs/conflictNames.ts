// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A conflict's copy, read from its name (ADR 0079 item 8): `<name>
// (conflict, <device>, <yyyy-mm-dd hh.mm>[ n]).<ext>`, in either language
// — and whether it can be compared as text. Pure, for the Sync section and
// its tests.

import { kindOf } from "../paths";

/** The last copy group of a name, before its extension: a copy of a copy
 *  is named after the first copy, so only the last group is this one's.
 *  A device's name holds no parenthesis or comma (the engine replaces
 *  them), so the group cannot reach back into an earlier one. */
const LAST = / \((?:conflict|conflito), ([^(),]+), (\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})(?: \d+)?\)(?=(?:\.[^./]*)?$)/;
/** The same, loosely: any last group, whatever its date says. */
const LAST_LOOSE = / \((?:conflict|conflito), [^()]*\)(?=(?:\.[^./]*)?$)/;

/** The file a conflict's copy is of: its name without its last copy
 *  group — for a copy of a copy, the first copy, as the engine names it. */
export function originalOf(copy: string): string {
  return copy.replace(LAST_LOOSE, "");
}

/** Who made a copy and when, from its name; none when the name says
 *  neither. */
export function copyParts(copy: string): { device: string; date: Date } | null {
  const m = LAST.exec(copy);
  if (!m) return null;
  const [, device, y, mo, d, hh, mm] = m;
  return { device: device!.trim(), date: new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)) };
}

/** Whether a file's kind says it is text (a note, a text file, a board, a
 *  view, a page), not text (an image, a PDF), or nothing (any other
 *  extension, or none): then its bytes tell. */
export function textByName(path: string): boolean | null {
  const kind = kindOf(path);
  if (kind === "note" || kind === "text" || kind === "board" || kind === "base" || kind === "frame") return true;
  if (kind === "image" || kind === "pdf") return false;
  return null;
}

/** Whether text read lossily from a file came from bytes that are not
 *  text: a character that stands for bytes that were not UTF-8, or a
 *  control character other than tab, line feed and carriage return. */
export function looksBinary(text: string): boolean {
  return /[�\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
}

/** The name a conflict's copy takes (ADR 0079 item 8), as sync names one
 *  (`verso_core::sync::conflict_name`): `<stem> (conflito|conflict,
 *  <device>, <yyyy-mm-dd hh.mm>[ n]).<ext>` beside the file, the device's
 *  name in characters every system keeps (at most 40), `n` from 2 on when
 *  the name is taken. For the editor's "keep both", whose copy the Sync
 *  section and every device then read as sync's own. */
export function conflictName(path: string, device: string, when: Date, pt: boolean, n = 1): string {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
  const safe = Array.from(Array.from(device, (c) => (/[\p{Alphabetic}\p{N} _-]/u.test(c) ? c : "-")).join("").trim())
    .slice(0, 40)
    .join("");
  const two = (v: number) => String(v).padStart(2, "0");
  const at = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}.${two(when.getMinutes())}`;
  return `${dir}${stem} (${pt ? "conflito" : "conflict"}, ${safe}, ${at}${n > 1 ? ` ${n}` : ""})${ext}`;
}
