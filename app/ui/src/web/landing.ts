// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a person lands in a server's window (ADR 0074 item 6, amended
// 2026-11-06): a player with one folder goes straight into it, the start
// page offers nothing to make to someone who may make nothing, and a link's
// note is asked for only as a path inside the folder. Pure: the bridge, the
// start page and the tests use the same answers.

/** What the server lists for the account (`GET /api/folders`, or the
 *  contract's `server_folders`). */
export type Listed = { folders: { id: string; role: string }[]; may_create?: boolean; mayCreate?: boolean };

const mayCreate = (l: Listed): boolean => l.may_create === true || l.mayCreate === true;

/** The folder a person is taken into when they land on the start page: the
 *  only one they have, when they may not make another (a player of a table,
 *  the maintainer's decision of 2026-11-06). Null otherwise — none, several,
 *  or an account that makes folders and may want to. */
export function soleFolder(l: Listed): string | null {
  if (mayCreate(l) || l.folders.length !== 1) return null;
  return l.folders[0]?.id ?? null;
}

/** Whether the start page may offer to import the example vault: only to
 *  someone who may make a folder or write in one of theirs. A reader of
 *  every folder they have is offered nothing to create. */
export function mayOfferExample(l: Listed): boolean {
  return mayCreate(l) || l.folders.some((f) => f.role === "owner" || f.role === "editor");
}

/** The note a link names (`?note=`), if it is a path inside a folder at
 *  all: relative, with no `.` or `..` part and no backslash. Anything else is
 *  not asked for — the folder opens without it, and nothing names it. */
export function linkNotePath(raw: string | null): string | null {
  if (!raw || raw.length > 1024 || raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return null;
  const parts = raw.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return raw;
}
