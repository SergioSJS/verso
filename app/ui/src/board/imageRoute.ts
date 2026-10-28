// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a NEW image put on a board is written (ADR 0113 item 5, D): pure, so
// that a test sees the rule without a window.
//
//  - a player at a table: never a write of the folder (they only read it);
//    the server writes the file (`table_attach`, as for the chat) when the
//    player edits the board (a new image needs no other right, K.6); the image then
//    reaches the board as an element through the room, by element;
//  - anyone else: the file is made in the folder beside the board, as before.

/** The attachments subfolder the window sends with a player's new file
 *  (`table_attach`) and uses for its own paste: the setting without the slashes
 *  at either end; the server falls back to `assets` for one it does not accept. */
export function attachSub(setting: string): string {
  return setting.trim().replace(/^\/+|\/+$/g, "");
}

/** The folder a made file is in, as the status line says it ("copiado para
 *  ..."): the path below the folder of the file it was put into when it is
 *  there, else the whole folder; the server may have used another place than
 *  the one asked for. */
export function usedFolder(into: string, made: string): string {
  const dir = made.includes("/") ? made.slice(0, made.lastIndexOf("/")) : "";
  const beside = into.includes("/") ? into.slice(0, into.lastIndexOf("/")) : "";
  if (beside && dir.startsWith(`${beside}/`)) return dir.slice(beside.length + 1);
  return dir === beside ? "" : dir;
}

export type ImageRoute = "folder" | "server" | "no-edit" | "no-send";

export function imageRoute(seat: string, atTable: boolean, mayEdit: boolean, maySend: boolean): ImageRoute {
  if (seat !== "player" || !atTable) return "folder";
  if (!mayEdit) return "no-edit";
  return maySend ? "server" : "no-send";
}

const KNOWN = /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?|heic|ico|mp3|wav|ogg|m4a|flac|aac|pdf)$/i;
// What a browser names a pasted or dropped picture it has no name for: a name that says nothing, whatever its extension.
const GENERIC = /^(image|blob)?(\.png)?$/i;

/** The name a file put on the board is given when the browser names it
 *  nothing, or a generic `image.png`: the extension follows the bytes' own
 *  type (a GIF stays a GIF), never a fixed `.png`. A real name with a known
 *  image, sound or PDF extension stays as it is (`photo.v2` has none). */
export function imageFileName(name: string, type: string): string {
  if (!GENERIC.test(name) && KNOWN.test(name)) return name;
  const kind = type.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "";
  const ext = kind === "jpeg" ? "jpg" : /^(png|gif|webp|avif|bmp|jpg|svg)$/.test(kind) ? kind : "png";
  const base = GENERIC.test(name) ? "image" : name;
  return `${base}.${ext}`;
}
