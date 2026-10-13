// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a page goes once the person is signed in: the `next` of its
// address, only when it is a path of this server.

/** The path `raw` names on `origin`, or `/`. */
export function nextPath(raw: string | null, origin: string): string {
  // Resolved as the browser will: `/\host` and the like are another
  // origin, and only this one's paths are followed. The path it comes out
  // as is not yet safe: `/.//host` and `/a/..//host` resolve on this
  // origin to the path `//host`, which `location.href` reads again as
  // another host. So the path is read once more, and anything that starts
  // as a host would, or lands elsewhere, goes to `/`.
  try {
    const u = new URL(raw ?? "/", origin);
    if (u.origin !== origin) return "/";
    const path = `${u.pathname}${u.search}${u.hash}`;
    if (path.startsWith("//") || path.startsWith("/\\")) return "/";
    return new URL(path, origin).origin === origin ? path : "/";
  } catch {
    return "/";
  }
}
