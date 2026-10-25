// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the person types at the table, before anything is sent (ADR 0107
// items 3, 4 and 12): a message, or `/r 1d20+3` for a roll; an image chosen,
// pasted or dropped, checked by its bytes and its size. Pure: the server
// checks again, these checks only spare the trip and say why in the
// person's words.

import { readNotation } from "../dice/notation";

/** A message is at most this many characters (the server's bound). */
export const MESSAGE_MAX = 500;
/** The counter shows from here. */
export const COUNTER_FROM = 400;
/** An image is at most 10 MB (the server's bound). */
export const IMAGE_MAX = 10 * 1024 * 1024;

export type Typed =
  | { kind: "empty" }
  | { kind: "say"; text: string }
  | { kind: "roll"; notation: string }
  /** `/r` followed by something that is no roll Verso reads. */
  | { kind: "badRoll"; typed: string }
  | { kind: "long"; length: number };

/** What a line typed into the table's field means. `/r` and `/roll`
 *  start a roll; any other text, a leading `/` included, is a message. */
export function readTyped(raw: string): Typed {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  // A roll is the first line (`/r 2d6+1d4`): the field is several lines tall, and what follows is not read.
  const first = text.split("\n", 1)[0]!.trim();
  const roll = /^\/(?:r|roll)(?:[ \t]+(.*))?$/i.exec(first);
  if (roll) {
    const typed = (roll[1] ?? "").trim();
    const notation = readNotation(typed);
    return notation ? { kind: "roll", notation } : { kind: "badRoll", typed };
  }
  const length = [...text].length;
  if (length > MESSAGE_MAX) return { kind: "long", length };
  return { kind: "say", text };
}

/** How many characters of the 500 a field holds, for the counter. */
export function charsOf(raw: string): number {
  return [...raw.trim()].length;
}

export type ImageWhy = "type" | "size" | "empty";

/** The kind of image the first bytes are, or null (never the name). */
export function imageKind(head: Uint8Array): "png" | "jpeg" | "webp" | "gif" | null {
  const at = (...b: number[]) => b.every((v, i) => head[i] === v);
  if (at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0xff, 0xd8, 0xff)) return "jpeg";
  if (at(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return "webp";
  if (at(0x47, 0x49, 0x46, 0x38) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return "gif";
  return null;
}

/** Why `bytes` is not an image the table takes, or null when it is. */
export function checkImage(bytes: Uint8Array): ImageWhy | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > IMAGE_MAX) return "size";
  return imageKind(bytes.subarray(0, 16)) ? null : "type";
}

export type FileKind = "image" | "pdf" | "audio";

/** The kind of file the first bytes are for *Send files* (ADR 0113 K.4): an
 *  image, a PDF or audio (MP3, Ogg, WAV, M4A); never the name. SVG, a page
 *  and a script are none. The server's `table::file_ext`. */
export function fileKind(head: Uint8Array): FileKind | null {
  if (imageKind(head)) return "image";
  const at = (from: number, ...b: number[]) => b.every((v, i) => head[from + i] === v);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf";
  if (at(0, 0x49, 0x44, 0x33) || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio";
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return "audio";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45)) return "audio";
  if (at(4, 0x66, 0x74, 0x79, 0x70) && at(8, 0x4d, 0x34, 0x41, 0x20)) return "audio";
  return null;
}

/** Why `bytes` is not a file the table takes, or null when it is. */
export function checkFile(bytes: Uint8Array): ImageWhy | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > IMAGE_MAX) return "size";
  return fileKind(bytes.subarray(0, 16)) ? null : "type";
}

/** Whether a picked, pasted or dropped file is one *Send files* may carry, by what the browser says of it. */
export function sendable(f: { type: string; name: string }): boolean {
  return f.type.startsWith("image/") || f.type === "application/pdf" || f.type.startsWith("audio/") || (f.type === "" && /\.(pdf|mp3|m4a|ogg|wav)$/i.test(f.name));
}

/** Base64 of `bytes`, in slices (a 10 MB image does not fit one call's arguments). */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The server's pace refusal ("too fast: wait 2 s") as the seconds to wait, or null. */
export function paceWait(message: string): number | null {
  const m = /^too fast: wait (\d+)/.exec(message);
  return m ? Number(m[1]) : null;
}
