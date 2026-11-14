// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A table moved to its other server (ADR 0117 D8, R9): what the table's
// window offers, and how the window goes to the new host. A folder of this
// computer served from here that also syncs with a UniVerso has two hosts;
// the host says which is the other (`local_server_table_host`), and the
// move (`local_server_move_table`) answers where the table went. Apart and
// with no imports but types, for its unit test; the way to open a folder is
// handed in by the window's start (main.ts), as the seat's is.

import type { CampaignTable, TableHost } from "./bindings";

/** What the table's window shows of the other host. */
export type MoveOffer =
  | { kind: "none" }
  /** The game master may move the table there. */
  | { kind: "move"; to: TableHost }
  /** The table moved; `to` is where, when the window knows it. */
  | { kind: "moved"; to: TableHost | null };

/** The offer for the table `table`, seen by `viewer`, whose other host is
 *  `host`: only the game master is offered anything. */
export function moveOffer(table: CampaignTable | undefined, host: TableHost | null, viewer: string): MoveOffer {
  if (!table || viewer !== "owner") return { kind: "none" };
  if (table.moved) return { kind: "moved", to: host };
  return host ? { kind: "move", to: host } : { kind: "none" };
}

/** The other host, named for the person. */
export function hostName(host: TableHost | null, words: { thisComputer: string; universo: (name: string) => string; elsewhere: string }): string {
  if (!host) return words.elsewhere;
  if (host.to === "here") return words.thisComputer;
  return host.name ? words.universo(host.name) : words.elsewhere;
}

/** Whether the window shows the table at `root` on its new host: there,
 *  and not the moved one. */
export function arrived(tables: CampaignTable[], root: string): boolean {
  return tables.some((t) => t.root === root && !t.moved);
}

/** Open the new host's folder in this window: handed by the window's start
 *  on the desktop, where there are two hosts (a browser has none to give). */
let go: ((host: TableHost) => Promise<boolean>) | null = null;
export function setTableGo(fn: (host: TableHost) => Promise<boolean>): void {
  go = fn;
}
export function tableGo(): ((host: TableHost) => Promise<boolean>) | null {
  return go;
}
