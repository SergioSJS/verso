// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's table (ADR 0107, phase 2): a `TableSource` that is shared and
// is told this window's own entries too (the server relays every entry to
// every window at the table, the sender's included — one entry is held once,
// by its number). It joins the folder's table, holds the latest entries and
// the pinned ones, pages older ones on request, and keeps the roster. The
// commands and events are handed in (`Api`), so the page's module and the
// unit tests drive the same code.

import type { ContractError, DiceStyles as WireStyles, TableCleared, TableEntry as Wire, TableImages, TableJoin, TableMember, TablePage, TablePinned, TableRemoved, TableRoster } from "../bindings";
import { readDiceStyles } from "../dice3d/look";
import { entryOfServer, TableLog, type Member, type OracleWords, type Role, type ServerTable, type TableEntry } from "./model";

type R<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** The table's commands and events, as the contract has them. Every command
 *  names its table (`table`: the table's folder inside the open folder, `""`
 *  for the folder itself; null: the folder's default, as an old window asks). */
export type Api = {
  join(color: string | null, styles: WireStyles | null, table: string | null): Promise<R<TableJoin>>;
  leave(table: string | null): Promise<unknown>;
  look(color: string | null, styles: WireStyles | null, table: string | null): Promise<R<null>>;
  history(before: string | null, limit: number, table: string | null): Promise<R<TablePage>>;
  say(text: string, table: string | null): Promise<R<Wire>>;
  sendImage(base64: string, table: string | null): Promise<R<Wire>>;
  roll(notation: string, source: string | null, path: string | null, secret: boolean | null, styles: WireStyles | null, occurrence: number | null, table: string | null): Promise<R<Wire>>;
  pin(id: string, pinned: boolean, table: string | null): Promise<R<null>>;
  del(id: string, table: string | null): Promise<R<null>>;
  clear(keepPinned: boolean, table: string | null): Promise<R<null>>;
  listen<T>(event: string, fn: (payload: T) => void): Promise<() => void>;
};

export type Deps = {
  api: Api;
  /** The table to join: its folder inside the open folder; null when the folder has no table to name. */
  table: string | null;
  /** The person's dice, closed form, sent with every roll and the join. */
  styles(): WireStyles | null;
  /** The presence colour of the person named, `#rrggbb`; null: the server's. */
  colorFor(name: string): string | null;
  oracleWords: OracleWords;
  /** A refusal or failure in the person's words. */
  explain(e: ContractError): string;
  /** A random table's row for a table roll, read from its note; null when unknown. */
  rowOf?(e: TableEntry): Promise<string | null>;
  /** An entry of another person, heard live (their dice fall, a notification). */
  onNews?(e: TableEntry, wire: Wire): void;
};

/** How many entries a page of "See earlier" asks for. */
export const PAGE = 50;
/** The entries held in memory per window. */
export const HELD = 1000;

const num = (id: string): bigint => {
  try {
    return BigInt(id);
  } catch {
    return 0n;
  }
};

const memberOf = (m: TableMember): Member => ({ name: m.name, byId: m.by_id, color: m.color, styles: m.styles ? readDiceStyles(m.styles) : null });

/** Join the folder's table; null when the side has none for this folder
 *  (a folder of this computer alone, a share, a refusal): the local source stays. */
export async function openServerTable(deps: Deps): Promise<ServerTable | null> {
  const { api } = deps;
  const log = new TableLog(HELD);
  const subs = new Set<() => void>();
  const tell = (): void => {
    for (const fn of [...subs]) fn();
  };
  let you = "";
  let role: Role = "editor";
  let members: Member[] = [];
  let hasMore = false;
  let closed = false;
  let secret = false;
  // The game master's permission to send images, for a player (ADR 0107 item 3 as amended 2026-10-24).
  let images = false;
  const offs: (() => void)[] = [];
  // The table the events are for: the one asked until the join names it.
  let at: string | null = deps.table;
  const mine = (t: string | undefined): boolean => at === null || t === undefined || t === at;

  const ingest = (wire: Wire, live: boolean): void => {
    if (closed) return;
    const e = entryOfServer(wire, you, deps.oracleWords);
    if (!e || !log.add(e, live && !e.mine)) return;
    if (e.kind === "table" && deps.rowOf) {
      void deps.rowOf(e).then((row) => {
        if (row && log.patch(e.id, { row })) tell();
      });
    }
    if (live && !e.mine) deps.onNews?.(e, wire);
    tell();
  };

  // Listening first: an entry sent while the join is on its way is held
  // once, by its number, whichever way it arrives.
  const listening = [
    api.listen<Wire>("table-entry", (w) => {
      if (mine(w.table)) ingest(w, true);
    }),
    api.listen<TablePinned>("table-pinned", (p) => {
      if (mine(p.table) && log.patch(p.id, { pinned: p.pinned })) tell();
    }),
    api.listen<TableRemoved>("table-removed", (p) => {
      if (mine(p.table) && log.remove(p.id)) tell();
    }),
    api.listen<TableCleared>("table-cleared", (p) => {
      if (!mine(p.table)) return;
      log.clear(p.keep_pinned);
      if (!p.keep_pinned) hasMore = false;
      tell();
    }),
    api.listen<TableImages>("table-images", (p) => {
      if (!mine(p.table) || images === p.images) return;
      images = p.images;
      tell();
    }),
    api.listen<TableRoster>("table-roster", (r) => {
      if (!mine(r.table)) return;
      members = r.members.map(memberOf);
      tell();
    }),
  ];
  for (const l of listening) offs.push(await l.catch(() => () => {}));
  const stop = (): void => {
    closed = true;
    for (const off of offs.splice(0)) off();
  };

  const joined = await api.join(null, deps.styles(), deps.table).catch((): null => null);
  if (!joined || joined.status !== "ok") {
    stop();
    return null;
  }
  const where = joined.data.table;
  at = where;
  you = joined.data.you;
  role = joined.data.role === "owner" || joined.data.role === "reader" ? joined.data.role : "editor";
  images = joined.data.images ?? role !== "reader";
  members = joined.data.roster.map(memberOf);
  hasMore = joined.data.more;
  for (const w of joined.data.entries) ingest(w, false);

  const myColor = (): string | null => {
    const me = members.find((m) => m.byId === you);
    return me ? deps.colorFor(me.name) : null;
  };
  // The presence colour is a hash of the name, which only the join tells.
  const first = members.find((m) => m.byId === you);
  const color = myColor();
  if (first && color && color !== first.color) void api.look(color, deps.styles(), where);

  const said = async (call: Promise<R<Wire | null>>): Promise<string | null> => {
    const r = await call.catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
    if (r.status !== "ok") return deps.explain(r.error);
    if (r.data) ingest(r.data, false);
    return null;
  };

  const table: ServerTable = {
    server: true,
    table: where,
    shared: true,
    receivesOwn: true,
    role: () => role,
    roster: () => members,
    entries: () => log.visible().filter((e) => !e.pinned),
    pinnedEntries: () => log.pinned(),
    more: () => hasMore,
    unread: () => log.unread(),
    markSeen() {
      if (log.unread() === 0) return;
      log.markSeen();
      tell();
    },
    hideUpToHere() {
      log.hideUpToHere();
      tell();
    },
    undoHide() {
      const done = log.undoHide();
      if (done) tell();
      return done;
    },
    hidden: () => log.hidden(),
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    async loadOlder() {
      const held = log.all().filter((e) => !e.pinned);
      const oldest = held.reduce<bigint | null>((m, e) => (m === null || num(e.id) < m ? num(e.id) : m), null);
      const r = await api.history(oldest === null ? null : String(oldest), PAGE, where).catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      if (r.status !== "ok") return deps.explain(r.error);
      for (const w of r.data.entries) ingest(w, false);
      hasMore = r.data.more;
      tell();
      return null;
    },
    say: (text) => said(api.say(text, where)),
    async roll(notation, opts) {
      const r = await api
        .roll(notation, opts?.source ?? null, opts?.path ?? null, opts?.secret ? true : null, deps.styles(), opts?.occurrence ?? null, where)
        .catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      if (r.status !== "ok") return { error: deps.explain(r.error) };
      ingest(r.data, false);
      return { entry: r.data };
    },
    sendImage: (b64) => said(api.sendImage(b64, where)),
    async pin(id, pinned) {
      const r = await api.pin(id, pinned, where).catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      if (r.status !== "ok") return deps.explain(r.error);
      if (log.patch(id, { pinned })) tell();
      return null;
    },
    async remove(id) {
      const r = await api.del(id, where).catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      if (r.status !== "ok") return deps.explain(r.error);
      if (log.remove(id)) tell();
      return null;
    },
    async clear(keepPinned) {
      const r = await api.clear(keepPinned, where).catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      if (r.status !== "ok") return deps.explain(r.error);
      log.clear(keepPinned);
      if (!keepPinned) hasMore = false;
      tell();
      return null;
    },
    get secret() {
      return secret;
    },
    set secret(v: boolean) {
      secret = v;
      tell();
    },
    // The server says it at the join and when it changes (the rules' `SendFile`).
    canSendImage: () => images,
    canClear: () => role === "owner",
    canDelete: (e) => role === "owner" || ((e.kind === "say" || e.kind === "image" || e.kind === "file") && e.mine),
    look() {
      if (!closed) void api.look(myColor(), deps.styles(), where);
    },
    close() {
      if (closed) return Promise.resolve();
      stop();
      return api.leave(where).then(
        () => undefined,
        () => undefined,
      );
    },
  };
  return table;
}
