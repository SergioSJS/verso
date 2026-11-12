// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the side the window talks to can do (ADR 0027; ADR 0076 item 11):
// a menu, a button or a command that means nothing there is absent, never
// shown and failing — "Show in Finder" in a browser, a new window, the
// terminal and the agents, the updates, the console, the child web views.
// And the reader's role on a server: without `write` the window only
// reads — the editor, the tree, the boards and the bases change nothing.
//
// Asked at the start and kept, so that a menu built on a click asks
// nothing; asked again when the window shows another folder
// (`verso:folder-shown`: a person's role is per folder, and on the desktop
// the folder may be a server's) and when the server says the person's role
// changed (`verso:role`, web.ts). Until the answer, the desktop's set stands: the
// side refuses what it cannot do anyway, and the desktop app answers at
// once.

import { listen } from "@tauri-apps/api/event";
import { commands, type Can, type Capabilities, type FolderAccess, type Host } from "./bindings";
import { forgetCapabilities } from "./collab";
import { FOLDER_CAN } from "./folderCan";
import { noteLink, resolveServerLink, type ServerWindow } from "./serverLink";

export { FOLDER_CAN };

const DESKTOP: Capabilities = {
  host: "desktop",
  can: ["write", "reveal", "copy_path", "windows", "web_views", "agents", "updates", "devtools", "local_folders", "loose_files", "link", "discover", "serve_away", ...FOLDER_CAN, "terminal"],
  latency_ms: null,
};

let known: Capabilities = DESKTOP;
let asked: Promise<Capabilities> | null = null;
let answered = false;
let turn = 0;

/** Ask the side; the answer is kept until the window asks again, and drawn on the page. */
export function loadCan(): Promise<Capabilities> {
  if (asked) return asked;
  const mine = ++turn;
  void askServer();
  asked = commands.capabilities().then(
    (r) => {
      // An answer to a question asked before the last one is stale.
      if (mine !== turn) return known;
      const next = r.status === "ok" ? r.data : DESKTOP;
      const same = answered && JSON.stringify(next) === JSON.stringify(known);
      known = next;
      answered = true;
      if (!same) paintCan();
      return known;
    },
    () => known,
  );
  return asked;
}

/** Ask again: the folder or the person's role in it changed. */
export function refreshCan(): void {
  askAgain();
}
function askAgain(): void {
  asked = null;
  forgetCapabilities();
  void loadCan();
}

/** Whether the side can do `what`, as last answered. */
export function can(what: Can): boolean {
  return known.can.includes(what);
}

/** The window changes the folder: not a reader on a server. */
export function canWrite(): boolean {
  return can("write");
}

/** Who the person is at the open folder, as the side last said it; none
 *  for a host with no server's model (`access.ts` is what asks). */
export function folderAccessNow(): FolderAccess | null {
  return known.access ?? null;
}

/** The server's size cap for a folder's bin, in bytes, as last answered;
 *  null when there is none (ADR 0080). */
export function trashCapNow(): number | null {
  return known.trash_cap ?? null;
}

/** Which side the window talks to: the desktop app or a server. */
export function host(): Host {
  return known.host;
}

/** The note's address on the server, for "Copy link" (ADR 0076 item 11):
 *  the folder of this tab's address and the note's path, as the server's
 *  window reads them back (web/bridge.ts, `popout_target`). */
export function noteAddress(path: string): string {
  const folder = new URLSearchParams(location.search).get("folder") ?? "";
  return noteLink(path, folder, windowServer, location.origin);
}

/** Where this window reaches its server (`window_server`), as last asked; null
 *  for a folder of this computer. Asked with the capabilities. */
let windowServer: ServerWindow | null = null;
function askServer(): Promise<ServerWindow | null> {
  return commands.windowServer().then(
    (r) => (windowServer = r.status === "ok" ? r.data : null),
    () => windowServer,
  );
}

/** A link the server made, opened where this window reaches the server:
 *  a path is put after the server's address, not after the app's own origin. */
export async function serverLink(link: string): Promise<string> {
  if (!link.startsWith("/")) return link;
  return resolveServerLink(link, await askServer(), location.origin);
}

/** What may draw itself again when the answer changes. */
const listeners = new Set<() => void>();
export function onCan(run: () => void): void {
  listeners.add(run);
}

/** The answer on the page: a class per thing the side cannot do, for the
 *  rules that hide a control (`css/screen.css`), and every listener told. */
function paintCan(): void {
  const root = document.documentElement;
  for (const c of [...root.classList]) if (c.startsWith("cannot-")) root.classList.remove(c);
  for (const c of DESKTOP.can) if (!known.can.includes(c)) root.classList.add(`cannot-${c.replace(/_/g, "-")}`);
  root.classList.toggle("on-server", known.host === "server");
  for (const run of listeners) run();
  // What draws itself elsewhere (a board, in React) hears the answer changed.
  dispatchEvent(new Event("verso:can-changed"));
}

// The person's role in the folder changed (web.ts), or another folder is
// shown: asked again.
addEventListener("verso:role", askAgain);
addEventListener("verso:folder-shown", askAgain);
// A synced folder's server said who this device is there (ADR 0113 S8): the
// seat is the host's answer, so the window asks the capabilities again.
void listen("seat-changed", askAgain).catch(() => {});
