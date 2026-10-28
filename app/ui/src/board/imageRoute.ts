// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a NEW image put on a board is written (ADR 0113 item 5, D): pure, so
// that a test sees the rule without a window.
//
//  - a player at a table: never a write of the folder (they only read it);
//    the server writes the file (`table_attach`, as for the chat) when the
//    player edits the board and has the right to send files; the image then
//    reaches the board as an element through the room, by element;
//  - anyone else: the file is made in the folder beside the board, as before.

export type ImageRoute = "folder" | "server" | "no-edit" | "no-send";

export function imageRoute(seat: string, atTable: boolean, mayEdit: boolean, maySend: boolean): ImageRoute {
  if (seat !== "player" || !atTable) return "folder";
  if (!mayEdit) return "no-edit";
  return maySend ? "server" : "no-send";
}

/** The name a file put on the board is given when the browser names it
 *  nothing, or a generic `image.png`: the extension follows the bytes' own
 *  type (a GIF stays a GIF), never a fixed `.png`. */
export function imageFileName(name: string, type: string): string {
  if (/\.[A-Za-z0-9]{2,5}$/.test(name)) return name;
  const kind = type.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "";
  const ext = kind === "jpeg" ? "jpg" : /^(png|gif|webp|avif|bmp|jpg|svg)$/.test(kind) ? kind : "png";
  return `${name || "image"}.${ext}`;
}
