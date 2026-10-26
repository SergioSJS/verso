// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A link the server hands to a window opens where the window reaches the
// server. A server with no public address (VERSO_PUBLIC_URL) cannot know its
// own name — it may listen on every address, and the request's `Host` is not
// trusted (ADR 0045) — so it answers a path, `/invite/<token>`, and the
// window puts its server's address before it: the page's own origin in a
// browser, the address the app is signed in to on the desktop (`window_server`),
// whose window's origin (`tauri://localhost`) is the app's, never the server's.

/** Where a window reaches its server, as the side answers `window_server`. */
export interface ServerWindow {
  url: string;
  folder: string;
}

/** The server's address for this window: the app's connection when there is
 *  one, the page's own origin otherwise. */
export function serverBase(win: ServerWindow | null, origin: string): string {
  return (win?.url ?? origin).replace(/\/+$/, "");
}

/** A link from the server: whole, it stays; a path is put after the server's address. */
export function resolveServerLink(link: string, win: ServerWindow | null, origin: string): string {
  return link.startsWith("/") && !link.startsWith("//") ? `${serverBase(win, origin)}${link}` : link;
}

/** A note's address on the server, as the server's window reads it back. */
export function noteLink(path: string, folder: string, win: ServerWindow | null, origin: string): string {
  const id = win?.folder ?? folder;
  return `${serverBase(win, origin)}/?folder=${encodeURIComponent(id)}&note=${encodeURIComponent(path)}`;
}
