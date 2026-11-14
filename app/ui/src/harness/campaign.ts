// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A table of ADR 0110, played in the page: the commands of
// `crates/verso-server/src/campaign_cmds.rs` with the same rules — only the
// owner makes a folder a table, a note starts hidden, a closed table keeps
// its players out, the limits have bounds — and, for a window that is a
// player, the lists and the text as the server serves them: a hidden note
// is not in a list and answers as an absent one, and a link to it is text
// with a lock (`campaign_text.rs`). The real thing is the server's; this
// stands in for it in the browser harness, which has no server. A test says
// the table is up (`up`) and who the window is (`viewer`); `?table=owner`
// and `?table=player` start with it up.

import { emit } from "@tauri-apps/api/event";
import type { AccessChange, AccessInfo, AccessLevel, AccessSetView, AccessWhy, CampaignAccess, CampaignAudience, CampaignGrant, CampaignNote, CampaignPlayer, CampaignStatus, CampaignTable, ContractError, FileAccess } from "../bindings";
import { allowed, kindOf, type Setting, type Who } from "./accessRules";
import type { Core } from "./core";
import { fileExt } from "./table";

/** The four rights of a player (ADR 0113 K.6). */
type RightName = "images" | "files" | "create_notes" | "create_boards";
const RIGHTS: readonly RightName[] = ["images", "files", "create_notes", "create_boards"];
const NO_RIGHTS = { images: false, files: false, creates_notes: false, creates_boards: false };

const LOG_LEAST = 1_000;
const LOG_MOST = 200_000;
const IMAGE_LEAST = 1024 * 1024;
const IMAGE_MOST = 30 * 1024 * 1024;
const REDACTED = "▒▒▒▒";

function refuse(message: string, kind: ContractError["kind"] = "refused"): never {
  const e: ContractError = { kind, message };
  throw e;
}

const noteLike = (p: string): boolean => /\.(md|canvas|base)$/i.test(p);
const covers = (root: string, p: string): boolean => root === "" || p === root || p.startsWith(`${root}/`);

/** The text a player is served: a link to a note not released drawn as text
 *  with a lock; `fate` says what each target is. */
export function veilText(text: string, fate: (target: string) => "open" | "locked" | "secret", lang = "pt"): string {
  const hold = lang.startsWith("pt") ? "🔒 (ainda não revelado)" : "🔒 (not revealed yet)";
  return text.replace(/(!?)\[\[([^\]\n]{1,500})\]\]/g, (whole, bang: string, inner: string) => {
    const [before, alias] = ((): [string, string | null] => {
      const i = inner.indexOf("|");
      return i < 0 ? [inner, null] : [inner.slice(0, i), inner.slice(i + 1)];
    })();
    const target = before.split("#")[0]!.trim();
    if (target === "") return whole;
    const f = fate(target);
    if (f === "open") return whole;
    if (bang) return hold;
    if (f === "secret") return REDACTED;
    const last = target.split("/").pop()!.replace(/\.md$/i, "");
    return `${alias && alias.trim() !== "" ? alias.trim() : last} 🔒`;
  });
}

/** A note's audience: a test may set `released` alone, as before the
 *  audience existed (true is the whole table). */
function audOf(n: CampaignNote | undefined): CampaignAudience {
  if (!n) return { kind: "hidden" };
  return n.audience ?? (n.released ? { kind: "table" } : { kind: "hidden" });
}

/** An audience of no players is nobody's: hidden. */
function normal(a: CampaignAudience): CampaignAudience {
  return a.kind === "players" && a.accounts.length === 0 ? { kind: "hidden" } : a;
}

export class Campaign {
  /** The tables are a server's: the folder is on one. */
  private isUp = false;
  get up(): boolean {
    return this.linked() ?? this.isUp;
  }
  set up(value: boolean) {
    this.isUp = value;
  }
  /** A synced folder (ADR 0107 item 9): the tables are the server's while the
   *  sync's link is up (`true`), none while it is down (`false`); `null` for a
   *  folder that does not sync, where `up` says. */
  linked: () => boolean | null = () => null;
  /** Who the window is. */
  viewer: "owner" | "player" = "owner";
  /** A player's role in the folder: an editor is a player who edits what they see (ADR 0113 K.1). */
  role: "reader" | "editor" = "reader";
  /** The sets given with `access_set`, by path (a file's or a folder's): ADR 0113's own state.
   *  A note with none follows its folder's, else what `notes` says (the older commands). */
  sets = new Map<string, { whole: AccessLevel; rows: Map<string, AccessLevel> }>();
  /** The window's account; the others at the table are `players`. */
  readonly account = "acc-ana";
  admin = true;
  /** May create folders: on a UniVerso a game master who is not the admin invites too (ADR 0117 D7 (e)). */
  mayCreate = false;
  tables: CampaignTable[] = [];
  notes = new Map<string, CampaignNote>();
  players: CampaignPlayer[] = [
    { id: "acc-ana", name: "Ana" },
    { id: "acc-bia", name: "Bia" },
  ];
  /** The rights given, by right: `root` + NUL + account (ADR 0113 K.6). */
  private readonly grants = new Map<RightName, Set<string>>(RIGHTS.map((r) => [r, new Set<string>()]));
  /** Whether the window's account has `right` at the table at `root` (the
   *  game master always has). */
  rightFor(root: string, right: RightName, account = this.account): boolean {
    return this.viewer === "owner" || (this.grants.get(right)?.has(`${root}\0${account}`) ?? false);
  }
  /** Whether the window's account may send images at `root`. */
  imagesFor(root: string, account = this.account): boolean {
    return this.rightFor(root, "images", account);
  }
  /** Give `account` a right at `root`, or take it away: a window that is
   *  that player is told at once, as the server tells it (images and files
   *  are told to the chat; the rest asks again what it shows). */
  grant(root: string, account: string, right: RightName, on: boolean): void {
    const key = `${root}\0${account}`;
    const set = this.grants.get(right);
    if (on) set?.add(key);
    else set?.delete(key);
    if (this.viewer === "player" && account === this.account) void emit("table-images", { table: root, images: this.rightFor(root, "images"), files: this.rightFor(root, "files") });
  }
  /** `grant` of the right Images, for a test. */
  grantImages(root: string, account: string, on: boolean): void {
    this.grant(root, account, "images", on);
  }
  /** How many files `table_attach` made. */
  private attached = 0;
  /** The links made by `campaign_invite`, for a test to read. */
  invites: string[] = [];
  /** The game master's name, as a player is told it. */
  master = "Mestre Ravena";

  constructor(private readonly core: Core) {
    const h = core.handlers;
    h["campaign_status"] = () => this.status();
    h["campaign_make"] = (a) => {
      const root = this.rootOf(a["root"]);
      this.owner();
      if (root !== "" && !core.folders.has(root)) refuse("no folder there");
      if (!this.tables.some((t) => t.root === root)) this.tables.push({ root, open: true, log_max: 20000, image_max: 10 * 1024 * 1024, image_players: [], file_players: [], note_players: [], board_players: [], images: true, files: true });
      return this.changed([]);
    };
    h["campaign_unmake"] = (a) => {
      const root = this.rootOf(a["root"]);
      this.owner();
      this.tables = this.tables.filter((t) => t.root !== root);
      for (const p of [...this.notes.keys()]) if (covers(root, p) && !this.tables.some((t) => covers(t.root, p))) this.notes.delete(p);
      return this.changed([]);
    };
    h["campaign_settings"] = (a) => {
      const root = this.rootOf(a["root"]);
      this.owner();
      const t = this.tables.find((x) => x.root === root);
      if (!t) refuse("that folder is not a table");
      const logMax = a["logMax"] as number | null | undefined;
      const imageMax = a["imageMax"] as number | null | undefined;
      if (typeof logMax === "number" && (logMax < LOG_LEAST || logMax > LOG_MOST)) refuse("the log keeps 1000 to 200000 entries");
      if (typeof imageMax === "number" && (imageMax < IMAGE_LEAST || imageMax > IMAGE_MOST)) refuse("an image is 1 to 30 MB");
      // Moved to its other server (ADR 0117 R9): the host's act, never the
      // switch; a moved table does not open again.
      if (t.moved && a["open"] === true) refuse("this table moved to the other server: undo it here to free it");
      if (typeof a["open"] === "boolean") t.open = a["open"];
      if (a["moved"] === true) {
        t.open = false;
        t.moved = true;
      }
      if (typeof logMax === "number") t.log_max = logMax;
      if (typeof imageMax === "number") t.image_max = imageMax;
      return this.changed([]);
    };
    h["campaign_release"] = (a) => {
      this.owner();
      const released = a["released"] === true;
      const notes = this.expand(a["paths"] as string[]);
      for (const p of notes) this.audit(p, released ? { kind: "table" } : { kind: "hidden" });
      return this.changed(notes);
    };
    h["campaign_audience"] = (a) => {
      this.owner();
      const audience = normal(a["audience"] as CampaignAudience);
      if (audience.kind === "players") {
        const ids = this.seated().map((p) => p.id);
        if (audience.accounts.some((x) => !ids.includes(x))) refuse("not a player of this table");
      }
      const notes = this.expand(a["paths"] as string[]);
      for (const p of notes) this.audit(p, audience);
      return this.changed(notes);
    };
    h["campaign_access"] = (a) => {
      if (!this.up) refuse("a table is a server's; a folder of this computer alone has none");
      const path = this.note(String(a["path"]));
      if (this.viewer === "player" && this.hidden(path) && !this.mayEdit(path)) refuse("not found", "not_found");
      const all = this.seated();
      const s = this.notes.get(path);
      const people = all.map((p) => ({ id: this.viewer === "player" && p.id !== this.account ? "" : p.id, name: p.name, access: this.accessOf(path, p.id), you: this.viewer === "player" && p.id === this.account }));
      const out: CampaignAccess = {
        path,
        viewer: this.viewer,
        audience: audOf(s),
        people: this.viewer === "owner" ? people : people.filter((p) => p.access !== "none"),
        master: this.master,
      };
      return out;
    };
    h["campaign_release_all"] = (a) => {
      this.owner();
      const notes = this.expand([this.rootOf(a["root"])]);
      for (const p of notes) this.audit(p, { kind: "table" });
      return this.changed(notes);
    };
    h["campaign_secret_name"] = (a) => {
      this.owner();
      const path = this.note(String(a["path"]));
      this.state(path).secret_name = a["on"] === true;
      return this.changed([path]);
    };
    h["campaign_grant"] = (a) => {
      this.owner();
      const path = this.note(String(a["path"]));
      if (!/\.(md|canvas)$/i.test(path)) refuse("only a note or a board can be edited by players");
      const grant = a["grant"] as CampaignGrant;
      if (grant.kind === "player" && !this.players.some((p) => p.id === grant.account && p.id !== this.account)) refuse("not a player of this table");
      const s = this.state(path);
      s.grant = grant;
      // An edit grant lets the player see the note: the server adds them to its audience.
      const aud = audOf(s);
      if (grant.kind === "group") this.setAud(s, { kind: "table" });
      else if (grant.kind === "player" && aud.kind !== "table" && !(aud.kind === "players" && aud.accounts.includes(grant.account))) {
        this.setAud(s, { kind: "players", accounts: [...(aud.kind === "players" ? aud.accounts : []), grant.account] });
      }
      return this.changed([path]);
    };
    h["table_rights_set"] = (a) => {
      this.owner();
      const right = RIGHTS.find((r) => r === a["right"]);
      if (!right) refuse("no such right");
      const root = this.rootOf(a["root"]);
      if (!this.tables.some((t) => t.root === root)) refuse("that folder is not a table");
      const accounts = a["accounts"] as string[];
      if (!Array.isArray(accounts) || accounts.length === 0 || accounts.length > 500) refuse("name between 1 and 500 players");
      if (!accounts.every((id) => this.seated().some((p) => p.id === id && (!p.roots || p.roots.length === 0 || p.roots.includes(root))))) refuse("not a player of this table");
      for (const id of accounts) this.grant(root, id, right as RightName, a["on"] === true);
      return this.changed([]);
    };
    h["campaign_invite"] = (a) => {
      this.owner();
      const root = this.rootOf(a["root"]);
      if (!this.admin && !this.mayCreate) refuse("only the server's admin, or an account the admin lets make folders, invites a person who has no account");
      if (!this.tables.some((t) => t.root === root)) refuse("that folder is not a table");
      const link = `/invite/harness-${this.invites.length + 1}`;
      this.invites.push(link);
      return { link, expires: 1_900_000_000 };
    };
    h["table_attach"] = (a) => {
      // Into a note or board the person edits: the vectors' `attach-image` for an image, `attach` for any other file (ADR 0113 D, K.6).
      const into = String(a["into"] ?? "");
      const ext = fileExt(String(a["base64"] ?? ""));
      if (!ext) refuse("an image, a PDF or an audio file (not SVG, a page or a script)");
      const access = this.fileAccess(into);
      if (!this.up || !(["png", "jpg", "webp", "gif"].includes(ext) ? access.attach_image : access.attach)) refuse("you may only read this folder");
      this.attached += 1;
      // Beside the file it is put into, in the person's subfolder (ADR 0113 item 5, where the file goes); a player never names it: `assets`.
      const given = String(a["sub"] ?? "");
      const sub = this.viewer !== "owner" ? "assets" : /^[^./\\][^\\]*$/.test(given) && !given.split("/").some((p) => p === "" || p.startsWith(".")) ? given : "assets";
      const dir = into.includes("/") ? into.slice(0, into.lastIndexOf("/") + 1) : "";
      const path = `${dir}${sub}/mesa-attach-${this.attached}.${ext}`;
      core.handlers["create_file"]?.({ path, base64: String(a["base64"] ?? "") });
      return path;
    };
    h["access_get"] = (a) => this.accessGet(a["paths"] as string[]);
    h["access_set"] = (a) => this.accessSet(a["paths"] as string[], a["change"] as AccessChange);
    const caps = h["capabilities"];
    if (caps)
      h["capabilities"] = (a) => {
        const base = caps(a) as Record<string, unknown>;
        if (!this.up || this.tables.length === 0) return base;
        return { ...base, access: { seat: this.viewer === "owner" ? "master" : "player", role: this.viewer === "owner" ? "owner" : this.role, cap: "write", table: true } };
      };
    this.wrapReads();
  }

  // ---- ADR 0113: the one model. The state is the sets; what may be done is the vectors'.

  private who(): Who {
    return this.viewer === "owner" ? "owner/write" : this.role === "editor" ? "editor/write" : "reader/write";
  }

  /** A note's set as the older commands left it. */
  private setOfNote(n: CampaignNote | undefined): { whole: AccessLevel; rows: Map<string, AccessLevel> } | null {
    if (!n) return null;
    const a = audOf(n);
    const rows = new Map<string, AccessLevel>();
    let whole: AccessLevel = "none";
    if (a.kind === "table") whole = "see";
    else if (a.kind === "players") for (const x of a.accounts) rows.set(x, "see");
    if (n.grant.kind === "group") whole = "edit";
    else if (n.grant.kind === "player") rows.set(n.grant.account, "edit");
    return { whole, rows };
  }

  /** The set a path has of its own: given with `access_set`, else its note's. */
  private ownSet(path: string): { whole: AccessLevel; rows: Map<string, AccessLevel> } | null {
    return this.sets.get(path) ?? (this.derived.has(path) ? null : this.setOfNote(this.notes.get(path)));
  }

  /** Files under a folder that was set: their note state follows the folder's set (for the older readers), it is no set of their own. */
  private readonly derived = new Set<string>();

  /** The nearest set up to the table's root, and whether it is the path's own. */
  private nearest(path: string): { set: { whole: AccessLevel; rows: Map<string, AccessLevel> }; own: boolean; at: string } | null {
    const root = this.tableOf(path)?.root ?? "";
    let at = path;
    for (;;) {
      const set = this.ownSet(at);
      if (set) return { set, own: at === path, at };
      if (at === "" || at === root) return null;
      const i = at.lastIndexOf("/");
      at = i < 0 ? "" : at.slice(0, i);
      if (!covers(root, at)) return null;
    }
  }

  private levelIn(set: { whole: AccessLevel; rows: Map<string, AccessLevel> }, id: string): AccessLevel {
    return set.rows.get(id) ?? set.whole;
  }

  /** What a path is to the window's person, in the words of the vectors. */
  private settingFor(path: string, folder = false): Setting {
    const t = this.tableOf(path);
    const kind = path === "" && folder ? "folder" : kindOf(path, folder);
    if (!t) return { table: "none", source: "nothing", level: "none", kind, rights: NO_RIGHTS, derived: false };
    const found = this.nearest(path);
    return {
      table: t.open ? "open" : "closed",
      source: !found ? "nothing" : found.own ? "file" : "folder",
      level: found ? this.levelIn(found.set, this.account) : "none",
      kind,
      rights: { images: this.rightFor(t.root, "images"), files: this.rightFor(t.root, "files"), creates_notes: this.rightFor(t.root, "create_notes"), creates_boards: this.rightFor(t.root, "create_boards") },
      derived: !noteLike(path),
    };
  }

  /** What the window's person may do with `path`, answered with every read. */
  fileAccess(path: string, folder = false): FileAccess {
    const s = this.settingFor(path, folder);
    const who = this.who();
    const level: AccessLevel = allowed(who, "edit", s) ? "edit" : allowed(who, "see", s) ? "see" : "none";
    const found = this.nearest(path);
    const why: AccessWhy = this.viewer === "owner" ? { kind: "master" } : s.table === "none" ? { kind: "role" } : s.table === "closed" ? { kind: "closed" } : !found ? (s.derived && level !== "none" ? { kind: "derived" } : { kind: "default" }) : found.own ? { kind: "own" } : { kind: "folder", path: found.at };
    // What can be made is told of a folder only (K.6).
    return { level, attach: allowed(who, "attach", s), attach_image: allowed(who, "attach-image", s), create_note: folder && allowed(who, "create-note", s), create_board: folder && allowed(who, "create-board", s), why };
  }

  private view(set: { whole: AccessLevel; rows: Map<string, AccessLevel> }): AccessSetView {
    return { whole: set.whole, rows: [...set.rows].sort((a, b) => a[0].localeCompare(b[0])).map(([account, level]) => ({ account, level })) };
  }

  private accessGet(paths: string[]): AccessInfo[] {
    if (!this.up) refuse("a table is a server's; a folder of this computer alone has none");
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 500) refuse("name between 1 and 500 paths");
    return paths.map((path) => {
      const t = this.tableOf(path);
      if (!t) refuse("not inside a table");
      const owner = this.viewer === "owner";
      if (!owner && this.hidden(path)) refuse("not found", "not_found");
      const folder = path === "" || this.core.folders.has(path);
      const found = this.nearest(path);
      const set = found?.set ?? { whole: "none" as AccessLevel, rows: new Map<string, AccessLevel>() };
      const under = folder ? [...this.core.files.keys()].filter((f) => covers(path, f) && f !== path && this.tableOf(f)) : [];
      const exceptions = owner && folder
        ? [...new Set([...this.sets.keys(), ...this.notes.keys()])].filter((p) => p !== path && covers(path, p) && this.ownSet(p)).sort().map((p) => ({ path: p, folder: this.core.folders.has(p), set: this.view(this.ownSet(p)!) }))
        : [];
      const own = this.ownSet(path);
      const players = this.players
        .filter((p) => owner ? p.id !== this.account : true)
        .filter((p) => owner || p.id === this.account || this.levelIn(set, p.id) !== "none")
        .map((p) => ({ id: owner || p.id === this.account ? p.id : "", name: p.name, editor: p.id === this.account && this.role === "editor", you: !owner && p.id === this.account }));
      const text = this.core.files.get(path);
      const count = (md: string): number => (md.match(/^(?:\s*>)*\s*\[!secret/gim) ?? []).length;
      // A board's text cards are notes to whoever edits it; a secret pin is not shown to them (ADR 0113 H).
      const boardTexts = (json: string): string => {
        try {
          const nodes = (JSON.parse(json) as { nodes?: { text?: unknown; verso?: { secret?: unknown } }[] }).nodes ?? [];
          return nodes.filter((n) => !n.verso?.secret && typeof n.text === "string").map((n) => n.text as string).join("\n");
        } catch {
          return "";
        }
      };
      const decoded = text ? new TextDecoder().decode(text.bytes) : "";
      const blocks = /\.md$/i.test(path) ? count(decoded) : /\.canvas$/i.test(path) ? count(boardTexts(decoded)) : 0;
      return {
        path,
        folder,
        table: t.root,
        own: owner && own ? this.view(own) : null,
        set: owner ? this.view(set) : { whole: set.whole, rows: [...set.rows].filter(([a]) => a === this.account).map(([account, level]) => ({ account, level })) },
        why: found ? (found.own ? { kind: "own" } : { kind: "folder", path: found.at }) : { kind: "default" },
        files: under.length,
        exceptions,
        secret_name: owner && this.notes.get(path)?.secret_name === true,
        secret_blocks: blocks,
        players,
        manage: owner,
        master: "Mestre Ravena",
      } satisfies AccessInfo;
    });
  }

  private accessSet(paths: string[], change: AccessChange): { changed: number } {
    this.owner();
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 500) refuse("name between 1 and 500 paths");
    let changed = 0;
    const touched: string[] = [];
    for (const path of paths) {
      this.tableOrRefuse(path);
      const folder = path === "" || this.core.folders.has(path);
      if (change.kind === "follow") {
        this.derived.delete(path);
        const hadSet = this.sets.delete(path);
        const hadNote = this.notes.delete(path);
        if (hadSet || hadNote) changed += 1;
        touched.push(path);
        continue;
      }
      const ids = this.seated().map((p) => p.id);
      if (change.set.rows.some((r) => !ids.includes(r.account))) refuse("not a player of this table");
      const set = { whole: change.set.whole, rows: new Map(change.set.rows.map((r) => [r.account, r.level] as const)) };
      if (folder) {
        const under = [...this.core.files.keys()].filter((f) => covers(path, f) && f !== path && this.tableOf(f));
        changed += under.length;
        const keep = change.keep_exceptions === true;
        for (const k of [...this.sets.keys(), ...this.notes.keys()]) if (k !== path && covers(path, k) && !(keep && this.ownSet(k))) { this.sets.delete(k); this.notes.delete(k); this.derived.delete(k); }
        touched.push(...under);
        for (const f of under) {
          if (keep && this.ownSet(f)) continue;
          this.mirror(f, set);
          this.derived.add(f);
        }
      } else changed += 1;
      this.sets.set(path, set);
      this.derived.delete(path);
      touched.push(path);
      if (typeof change.secret_name === "boolean") this.state(path).secret_name = change.secret_name;
      this.mirror(path, set);
    }
    this.changed(touched);
    return { changed };
  }

  /** The older shapes of a note's state follow its set, for what still reads them. */
  private mirror(path: string, set: { whole: AccessLevel; rows: Map<string, AccessLevel> }): void {
    if (!noteLike(path)) return;
    const s = this.state(path);
    const seers = [...set.rows].filter(([, l]) => l !== "none" && (set.whole === "none" || l !== set.whole)).map(([a]) => a);
    const edits = [...set.rows].filter(([, l]) => l === "edit").map(([a]) => a);
    s.audience = set.whole !== "none" ? { kind: "table" } : seers.length > 0 ? { kind: "players", accounts: seers } : { kind: "hidden" };
    s.released = s.audience.kind !== "hidden";
    s.grant = set.whole === "edit" ? { kind: "group" } : edits[0] ? { kind: "player", account: edits[0] } : { kind: "none" };
  }

  private tableOrRefuse(path: string): void {
    if (path.startsWith("/") || path.split("/").includes("..")) refuse("not a path of this folder");
    if (!this.tableOf(path)) refuse("not inside a table");
  }

  private rootOf(given: unknown): string {
    const root = String(given ?? "");
    if (root.startsWith("/") || root.split("/").some((p) => p === ".." || p.startsWith("."))) refuse("not a folder inside this folder");
    return root;
  }

  private owner(): void {
    if (!this.up) refuse("a table is a server's; a folder of this computer alone has none");
    if (this.viewer !== "owner") refuse("only the folder's owner runs its table");
  }

  private tableOf(path: string): CampaignTable | undefined {
    return [...this.tables].filter((t) => covers(t.root, path)).sort((a, b) => b.root.length - a.root.length)[0];
  }

  private note(path: string): string {
    if (path === "" || path.startsWith("/") || path.split("/").includes("..")) refuse("not a note of this folder");
    if (!this.tableOf(path)) refuse("not inside a table");
    return path;
  }

  private state(path: string): CampaignNote {
    let s = this.notes.get(path);
    if (!s) {
      s = { path, released: false, audience: { kind: "hidden" }, secret_name: false, grant: { kind: "none" } };
      this.notes.set(path, s);
    }
    return s;
  }

  private setAud(s: CampaignNote, a: CampaignAudience): void {
    s.audience = normal(a);
    s.released = s.audience.kind !== "hidden";
  }

  /** A narrower audience drops a group grant and a grant to a player who left. */
  private audit(path: string, a: CampaignAudience): void {
    const s = this.state(path);
    this.setAud(s, a);
    const g = s.grant;
    if (s.audience.kind === "hidden" || (g.kind === "group" && s.audience.kind !== "table") || (g.kind === "player" && !this.seenBy(s, g.account))) s.grant = { kind: "none" };
  }

  /** The players of the table: those the owner invited, never the owner. */
  private seated(): CampaignPlayer[] {
    return this.viewer === "owner" ? this.players.filter((p) => p.id !== this.account) : [...this.players];
  }

  private seenBy(s: CampaignNote | undefined, id: string): boolean {
    const a = audOf(s);
    return a.kind === "table" ? this.seated().some((p) => p.id === id) : a.kind === "players" && a.accounts.includes(id);
  }

  private accessOf(path: string, id: string): "edits" | "sees" | "none" {
    const s = this.notes.get(path);
    const g = s?.grant;
    if (g?.kind === "group" || (g?.kind === "player" && g.account === id)) return "edits";
    return this.seenBy(s, id) ? "sees" : "none";
  }

  /** The notes a list of paths stands for: a folder, the notes under it. */
  private expand(paths: string[]): string[] {
    const all = [...this.core.files.keys()].filter((p) => noteLike(p) && this.tableOf(p));
    const out = new Set<string>();
    for (const p of paths) {
      if (p === "" || this.core.folders.has(p)) {
        for (const f of all) if (covers(p, f)) out.add(f);
      } else if (noteLike(p) && this.tableOf(p)) {
        out.add(p);
      }
    }
    return [...out];
  }

  /** Whether a player is kept from `path`: the vectors' `see`. */
  hidden(path: string): boolean {
    const t = this.tableOf(path);
    if (!t) return false;
    return !allowed(this.who(), "see", this.settingFor(path, this.core.folders.has(path)));
  }

  /** A folder of a table is there for a player when a file under it is (the table's own folder always). */
  private folderShown(folder: string): boolean {
    if (!this.tableOf(folder) || this.tables.some((t) => t.root === folder)) return true;
    return [...this.core.files.keys()].some((f) => f.startsWith(`${folder}/`) && !this.hidden(f));
  }

  private mayEdit(path: string): boolean {
    return this.viewer === "player" && allowed(this.who(), "edit", this.settingFor(path));
  }

  status(): CampaignStatus {
    if (!this.up || this.tables.length === 0) return { viewer: "none", tables: [], notes: [], players: [], can_invite: false };
    if (this.viewer === "owner") {
      const who = (path: string, at: AccessLevel): string[] => {
        const set = this.nearest(path)?.set;
        return set ? this.seated().filter((p) => (at === "see" ? this.levelIn(set, p.id) !== "none" : this.levelIn(set, p.id) === "edit")).map((p) => p.id) : [];
      };
      const notes = [...this.notes.values()].map((n) => ({ ...n, audience: audOf(n), released: audOf(n).kind !== "hidden", sees: who(n.path, "see"), edits: who(n.path, "edit") })).sort((a, b) => a.path.localeCompare(b.path));
      const given = (root: string, right: RightName): string[] => this.seated().filter((p) => this.grants.get(right)?.has(`${root}\0${p.id}`)).map((p) => p.id);
      return { viewer: "owner", tables: this.tables.map((t) => ({ ...t, images: true, files: true, image_players: given(t.root, "images"), file_players: given(t.root, "files"), note_players: given(t.root, "create_notes"), board_players: given(t.root, "create_boards") })), notes, players: this.players.filter((p) => p.id !== this.account), can_invite: this.admin || this.mayCreate };
    }
    const notes = [...this.notes.values()].filter((n) => this.mayEdit(n.path)).map((n) => ({ ...n, audience: (audOf(n).kind === "table" ? { kind: "table" } : { kind: "players", accounts: [this.account] }) as CampaignAudience, released: true, secret_name: false }));
    return { viewer: "player", tables: this.tables.map((t) => ({ ...t, images: this.rightFor(t.root, "images"), files: this.rightFor(t.root, "files"), image_players: [], file_players: [], note_players: [], board_players: [] })), notes, players: [], can_invite: false };
  }

  private changed(paths: string[]): CampaignStatus {
    void emit("campaign-changed", { paths: this.viewer === "owner" ? paths : [] });
    void emit("access-changed", { paths: this.viewer === "owner" ? paths : [] });
    return this.status();
  }

  /** The reads of a player, through the table's veil. */
  private wrapReads(): void {
    const h = this.core.handlers;
    const player = (): boolean => this.up && this.viewer === "player" && this.tables.length > 0;
    const absent = (): never => refuse("not found", "not_found");
    const fate = (source: string) => (target: string): "open" | "locked" | "secret" => {
      const to = this.reach(source, target);
      if (!to || !this.hidden(to)) return "open";
      return this.notes.get(to)?.secret_name ? "secret" : "locked";
    };
    const keepPaths = (list: unknown): unknown => (Array.isArray(list) ? list.filter((p) => typeof p !== "string" || !this.hidden(p)) : list);
    for (const cmd of ["list_notes", "list_files"]) {
      const was = h[cmd]!;
      h[cmd] = (a) => (player() ? keepPaths(was(a)) : was(a));
    }
    const ofType = h["notes_of_type"]!;
    h["notes_of_type"] = (a) => (player() ? keepPaths(ofType({ name: a["name"] })) : ofType({ name: a["name"] }));
    const folders = h["list_folders"]!;
    h["list_folders"] = (a) => {
      const all = folders(a);
      return player() && Array.isArray(all) ? all.filter((d: string) => this.folderShown(d)) : all;
    };
    const entries = h["list_entries"]!;
    h["list_entries"] = (a) => {
      const all = entries(a);
      if (!player() || !Array.isArray(all)) return all;
      return all.filter((e: { path: string; kind: string }) => (e.kind === "folder" ? this.folderShown(e.path) : !this.hidden(e.path)));
    };
    const note = h["read_note"]!;
    h["read_note"] = (a) => {
      if (!player()) return note(a);
      const path = String(a["path"]);
      if (this.hidden(path) && !this.mayEdit(path)) absent();
      const n = note(a) as { text: string; lines: string[]; html: string; path: string };
      if (this.mayEdit(path)) return n;
      const text = veilText(n.text, fate(n.path));
      return { ...n, text, lines: text.split("\n"), html: String(h["render_markdown"]!({ text })) };
    };
    for (const cmd of ["read_text", "read_file_text"]) {
      const read = h[cmd]!;
      h[cmd] = (a) => {
        if (!player()) return read(a);
        const path = String(a["path"]);
        if (this.hidden(path) && !this.mayEdit(path)) absent();
        const got = read(a);
        if (this.mayEdit(path) || !/\.md$/i.test(path)) return got;
        return typeof got === "string" ? veilText(got, fate(path)) : { ...(got as { text: string }), text: veilText((got as { text: string }).text, fate(path)) };
      };
    }
    const search = h["search"]!;
    h["search"] = (a) => {
      const hits = search({ words: a["words"], limit: a["limit"] });
      return player() && Array.isArray(hits) ? hits.filter((x: { path: string }) => !this.hidden(x.path)) : hits;
    };
    const backlinks = h["backlinks"]!;
    h["backlinks"] = (a) => {
      if (!player()) return backlinks(a);
      if (this.hidden(String(a["path"]))) absent();
      const list = backlinks(a);
      return Array.isArray(list) ? list.filter((b: { from: string }) => !this.hidden(b.from)) : list;
    };
    const links = h["links"]!;
    h["links"] = (a) => {
      if (!player()) return links(a);
      if (this.hidden(String(a["path"]))) absent();
      const list = links(a);
      return Array.isArray(list)
        ? list.map((l: { resolved: string | null; target: string; alias: string | null }) => {
            if (!l.resolved || !this.hidden(l.resolved)) return l;
            const shown = this.notes.get(l.resolved)?.secret_name ? REDACTED : (l.alias ?? l.target.split("/").pop()!.replace(/\.md$/i, ""));
            return { ...l, target: shown, resolved: null, heading: null, block: null, alias: null };
          })
        : list;
    };
    // Every read says what the person may do with the file (ADR 0113 section C).
    const up = (): boolean => this.up && this.tables.length > 0;
    for (const cmd of ["read_note", "read_text", "create_note", "write_text"]) {
      const was = h[cmd]!;
      const wrapped = (a: Parameters<typeof was>[0]) => {
        const got = was(a);
        return up() && got && typeof got === "object" ? { ...(got as object), access: this.fileAccess((got as { path: string }).path) } : got;
      };
      // Read by the harness's own test as the handler it wraps (the arguments it reads).
      Object.defineProperty(wrapped, "toString", { value: () => String(was) });
      h[cmd] = wrapped;
    }
    const listed = h["list_entries"]!;
    h["list_entries"] = (a) => {
      const all = listed(a);
      return up() && Array.isArray(all) ? all.map((e: { path: string; kind: string }) => ({ ...e, access: this.fileAccess(e.path, e.kind === "folder") })) : all;
    };
    const graph = h["graph"]!;
    h["graph"] = (a) => {
      const edges = graph(a);
      return player() && Array.isArray(edges) ? edges.filter((e: { from: string; to: string }) => !this.hidden(e.from) && !this.hidden(e.to)) : edges;
    };
  }

  /** What `[[target]]` written in `source` reaches, by name or by path. */
  private reach(source: string, target: string): string | null {
    const t = target.replace(/\.md$/i, "").toLowerCase();
    const notes = [...this.core.files.keys()].filter((p) => /\.md$/i.test(p));
    const exact = notes.find((p) => p.replace(/\.md$/i, "").toLowerCase() === t);
    if (exact) return exact;
    const named = notes.filter((p) => p.replace(/\.md$/i, "").split("/").pop()!.toLowerCase() === t);
    return named.sort((a, b) => (a.startsWith(source.split("/").slice(0, -1).join("/")) ? -1 : 1) - (b.startsWith(source.split("/").slice(0, -1).join("/")) ? -1 : 1))[0] ?? null;
  }
}
