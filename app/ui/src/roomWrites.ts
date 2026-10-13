// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A write to a note that is live in its room (ADR 0073 item 7, ADR 0082)
// made by something other than the keyboard: the properties panel, a
// sticker, a colour or a cover, a cell of a base, a PDF's quote. It goes
// into the room as typing goes — an edit of the tab's editor, which the
// room's binding hands to the others letter by letter — and the room
// writes the file once the edits settle. Written to the file instead, it
// would reach the room as a change from outside: a conflict when edits
// wait to be written, and on a synced folder a second writer of the
// local file, the source of a conflict copy (ADR 0082 item 6). Decided by
// the maintainer on 2026-10-12 (ADR 0082, Status).
//
// A note live only elsewhere — someone else, or another window, has it in
// its room and this window does not — is written the same way: the write
// joins the room, makes its one edit there, has the room write the file,
// and leaves (`writeLive`). Written to the file instead, it would reach
// the room as a change from outside, and on a synced folder through an
// upload that a room's save may have overtaken: a conflict copy. A note in
// no room is written as before.

import { minimalEdit } from "./edit";
import { lineSeparator } from "./leaves/text";

/** One change to a text: what lies between `from` and `to` replaced. */
export type TextChange = { from: number; to: number; insert: string };

/** A note this window holds in its room and may type into: its text as
 *  the editor has it now (`\n` line ends, as the room's), and the way an
 *  edit goes in — the editor's, as a keystroke's does. */
export type LiveHolder = {
  text: () => string;
  edit: (change: TextChange) => void;
};

/** Where a write went. `room`: into the room, as an edit; `same`: it
 *  changed nothing; `refused`: the change does not apply to the text as
 *  the room has it now (the caller says why); `disk`: no room holds the
 *  note here — the caller writes the file, as before. */
export type Through = "room" | "same" | "refused" | "disk";

/** Make the write `change` asks for — the note's text in, the text it
 *  should become out, or null when it does not apply — through the room
 *  when `holder` is live, as the one edit between what the text was and
 *  what it becomes: everything outside it stays where it was, so what
 *  someone else is typing elsewhere in the note merges with it. */
export function throughRoom(holder: LiveHolder | null, change: (text: string) => string | null): Through {
  if (!holder) return "disk";
  const was = holder.text();
  const next = change(was);
  if (next === null) return "refused";
  // The room's text ends its lines with `\n`; the file's own ends are the
  // room's to write.
  const edit = minimalEdit(was, next.replace(/\r\n/g, "\n"));
  if (!edit) return "same";
  holder.edit(edit);
  return "room";
}

/** A room this window joined for one write, holding no tab: the room's
 *  text as it joined, the edit made into it, `send` handing the edit to
 *  the room and having the room write the file — false when the room
 *  took nothing (the person only reads, the link dropped) — and `leave`. */
export type VisitedRoom = LiveHolder & {
  send: () => Promise<boolean>;
  leave: () => Promise<void>;
};

/** What the window asks of the side that keeps the rooms (collab.ts):
 *  whether someone is in the note's room now, and a visit to it. */
export type RoomSide = {
  present: (path: string) => Promise<boolean>;
  visit: (path: string) => Promise<VisitedRoom | null>;
};

/** Make the write `change` asks for to the note at `path`: through this
 *  window's tab when it holds the note live (`throughRoom`); else, when
 *  someone is in the note's room, by joining it for this one edit, the
 *  room writing the file before this window leaves; else `disk`, the
 *  caller writing the file as before — also when the visit could not be
 *  made or the room took nothing, so the write is never lost. */
export async function writeLive(
  path: string,
  holder: LiveHolder | null,
  change: (text: string) => string | null,
  side: RoomSide | null,
): Promise<Through> {
  if (holder) return throughRoom(holder, change);
  if (!side) return "disk";
  const present = await side.present(path).catch(() => false);
  if (!present) return "disk";
  const room = await side.visit(path).catch(() => null);
  if (!room) return "disk";
  try {
    const through = throughRoom(room, change);
    if (through !== "room") return through;
    return (await room.send().catch(() => false)) ? "room" : "disk";
  } finally {
    await room.leave().catch(() => undefined);
  }
}

/** `text` with `change` made. */
export function applyChange(text: string, change: TextChange): string {
  return text.slice(0, change.from) + change.insert + text.slice(change.to);
}

/** `lines` added at the end of `was` after a blank line, ending their
 *  lines as the note ends its own: nothing of it trimmed or converted. */
export function appendLines(was: string, lines: string[]): string {
  const eol = /\r\n$/.test(was) ? "\r\n" : /\n$/.test(was) ? "\n" : (lineSeparator(was) ?? "\n");
  const ended = was === "" || /\n$/.test(was);
  return `${was}${ended ? "" : eol}${eol}${lines.join(eol)}${eol}`;
}
