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
  /** News heard live: another person's entry, or the same account's from another device (the dice fall, a sound, a notification). */
  onNews?(e: TableEntry, wire: Wire): void;
};

/** How many entries a page of "See earlier" asks for. */
export const PAGE = 50;
/** The entries held in memory per window. */
export const HELD = 1000;
/** How long an entry of this account waits for the answer of a command of this window (ms). */
const HOLD = 3000;
/** The longest an entry waits for a command that never answers (ms). */
const HARD = 30000;
/** How long a command's claim on its entry lasts after the answer, for an entry told after it (ms). */
const CLAIM = 5000;

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
  let files = false;
  const offs: (() => void)[] = [];
  // The table the events are for: the one asked until the join names it.
  let at: string | null = deps.table;
  const mine = (t: string | undefined): boolean => at === null || t === undefined || t === at;

  // What this window made itself (ADR 0107): the server tells every window of
  // the account an entry, this one too, usually BEFORE the command's answer. An
  // entry of the SAME account that this window did not make is another device's,
  // and is news here. The commands of this window say which entries are theirs
  // (`claims`, by id for say/roll/image; by content for a note room's roll or
  // draw, whose answer has no table id); an entry that arrives while a command is
  // on its way waits for its answer, at most HOLD ms.
  type Claim = { match: (e: TableEntry) => boolean; until: number };
  let claims: Claim[] = [];
  let inflight = 0;
  let held: { e: TableEntry; wire: Wire }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const claimed = (e: TableEntry): boolean => {
    const now = Date.now();
    claims = claims.filter((c) => c.until > now);
    const i = claims.findIndex((c) => c.match(e));
    if (i < 0) return false;
    claims.splice(i, 1);
    return true;
  };

  const news = (e: TableEntry, wire: Wire): void => {
    if (e.mine) {
      // Removed, cleared or trimmed while held: nothing to hear.
      if (!log.patch(e.id, { elsewhere: true })) return;
      e.elsewhere = true;
      log.countUnread(e);
    }
    deps.onNews?.(e, wire);
  };

  // What was held and no command claimed was another device's.
  let heldSince: number | null = null;
  // The cap: past HOLD an entry still tied to a command in flight keeps waiting for its answer (up to HARD).
  const expire = (): void => {
    timer = null;
    if (inflight > 0 && heldSince !== null && Date.now() - heldSince < HARD) timer = setTimeout(expire, HOLD);
    else release();
  };
  const release = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    heldSince = null;
    const all = held;
    held = [];
    if (closed) return;
    let told = false;
    for (const h of all) {
      if (claimed(h.e)) continue;
      news(h.e, h.wire);
      told = true;
    }
    if (told) tell();
  };
  const settle = (): void => {
    if (inflight > 0) return;
    release();
  };

  const ingest = (wire: Wire, live: boolean): void => {
    if (closed) return;
    const e = entryOfServer(wire, you, deps.oracleWords);
    if (!e) return;
    if (!log.add(e, live && !e.mine)) return;
    if (e.kind === "table" && deps.rowOf) {
      void deps.rowOf(e).then((row) => {
        if (row && log.patch(e.id, { row })) tell();
      });
    }
    if (live && !e.mine) news(e, wire);
    // The same account, heard live: this window's own command's entry, or
    // another device's. Held while a command is on its way.
    else if (live && e.mine && !claimed(e)) {
      if (inflight > 0) {
        held.push({ e, wire });
        heldSince ??= Date.now();
        timer ??= setTimeout(expire, HOLD);
      } else news(e, wire);
    }
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
      if (!mine(p.table) || (images === p.images && files === (p.files ?? p.images))) return;
      images = p.images;
      files = p.files ?? p.images;
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
  files = joined.data.files ?? images;
  members = joined.data.roster.map(memberOf);
  hasMore = joined.data.more;
  // The music (ADR 0116): an older server says nothing of it.
  const sound = { play: joined.data.play ?? false, playback: joined.data.playback ?? [], share: joined.data.share ?? null, broadcast: joined.data.broadcast ?? false };
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
    const r = await making(call, byId);
    if (r.status !== "ok") return deps.explain(r.error);
    if (r.data) ingest(r.data, false);
    return null;
  };
  // Run one command of this window that makes an entry: `claim` names it from the answer.
  const making = async <T>(call: Promise<R<T>>, claim: (r: R<T>) => ((e: TableEntry) => boolean) | null): Promise<R<T>> => {
    inflight++;
    try {
      const r = await call.catch((e: unknown): R<never> => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
      const match = claim(r);
      if (match) claims.push({ match, until: Date.now() + CLAIM });
      return r;
    } finally {
      inflight--;
      settle();
    }
  };
  const byId = (r: R<Wire | null>): ((e: TableEntry) => boolean) | null => (r.status === "ok" && r.data ? ((id) => (e: TableEntry) => e.id === id)(r.data.id) : null);

  const table: ServerTable = {
    server: true,
    table: where,
    shared: true,
    receivesOwn: true,
    role: () => role,
    joinedSound: () => sound,
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
      const r = await making(api.roll(notation, opts?.source ?? null, opts?.path ?? null, opts?.secret ? true : null, deps.styles(), opts?.occurrence ?? null, where), (a) => byId(a) ?? (a.status === "error" && a.error.kind === "unavailable" ? (e) => (e.kind === "roll" || e.kind === "table") && e.notation === notation : null));
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
    canSendFile: () => files,
    canClear: () => role === "owner",
    making,
    canDelete: (e) => role === "owner" || ((e.kind === "say" || e.kind === "image" || e.kind === "file") && e.mine),
    look() {
      if (!closed) void api.look(myColor(), deps.styles(), where);
    },
    close() {
      if (closed) return Promise.resolve();
      stop();
      held = [];
      claims = [];
      if (timer) clearTimeout(timer);
      return api.leave(where).then(
        () => undefined,
        () => undefined,
      );
    },
  };
  return table;
}
