// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The name an image gets in the folder when it is attached to a note
// (the editor's "insert image", a paste, a drop): pure, so that a test can
// see the rules without a window. Nothing here touches a file.

/** The most bytes of one image the window sends to a server: a server's
 *  message may be 48 MiB (`crates/verso-server/src/rpc.rs`, MAX_MESSAGE)
 *  and the bytes cross as base64, a third larger; 32 MiB is 42.7 MiB of
 *  it, with room for the rest of the message. */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

/** What a name may not hold to be reached by a link (`[ ] | # ^`) or to be
 *  kept on every system (`\ / : * ? " < >` and control characters). */
// eslint-disable-next-line no-control-regex
const UNFIT = /[[\]|#^\\/:*?"<>\u0000-\u001f]/g;

/** A file name made fit: the characters above replaced by a space, spaces
 *  gathered, the ends trimmed. Empty when nothing is left. */
export function fitName(raw: string): string {
  return raw.replace(UNFIT, " ").replace(/ {2,}/g, " ").replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
}

/** The names Windows keeps for devices, with any extension (`con.txt` is the console). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A stem that is a reserved device name, with an underscore after it (`con.tar` becomes `con_.tar`). */
function unreserved(stem: string): string {
  const first = stem.split(".")[0] ?? "";
  return RESERVED.test(first) ? `${first}_${stem.slice(first.length)}` : stem;
}

/** The extension an image's type gives, when its name gives none. */
export function extensionOf(type: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) return fitName(fileName.slice(dot + 1)).toLowerCase();
  const sub = type.split("/")[1]?.toLowerCase() ?? "";
  if (sub === "jpeg") return "jpg";
  if (sub === "svg+xml") return "svg";
  return /^[a-z0-9]{2,5}$/.test(sub) ? sub : "jpg";
}

/** "Foto 2026-10-15 142530.jpg": a photo from the camera, named by when it
 *  was taken, in the person's local time. */
export function cameraName(taken: Date, ext: string, word = "Foto"): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  const day = `${p(taken.getFullYear(), 4)}-${p(taken.getMonth() + 1)}-${p(taken.getDate())}`;
  const time = `${p(taken.getHours())}${p(taken.getMinutes())}${p(taken.getSeconds())}`;
  return `${word} ${day} ${time}.${ext}`;
}

/** The path for `fileName` in `folder` that nothing holds: the name as it
 *  came, then `name (2).ext`, `name (3).ext`… `taken` holds the paths of
 *  the folder (compared without regard to case: a Mac and a Windows folder
 *  treat `A.png` and `a.png` as one file). */
export function freeAttachment(folder: string, fileName: string, taken: ReadonlySet<string>): string {
  const fit = fitName(fileName);
  const dot = fit.lastIndexOf(".");
  const stem = unreserved((dot > 0 ? fit.slice(0, dot) : fit) || "Imagem");
  const ext = dot > 0 ? fit.slice(dot) : "";
  const at = (n: number) => `${folder ? folder + "/" : ""}${stem}${n > 1 ? ` (${n})` : ""}${ext}`;
  let n = 1;
  while (taken.has(at(n).toLowerCase())) n++;
  return at(n);
}
