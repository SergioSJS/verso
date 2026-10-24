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
import type { CampaignAccess, CampaignAudience, CampaignGrant, CampaignNote, CampaignPlayer, CampaignStatus, CampaignTable, ContractError } from "../bindings";
import type { Core } from "./core";

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
  /** The window's account; the others at the table are `players`. */
  readonly account = "acc-ana";
  admin = true;
  tables: CampaignTable[] = [];
  notes = new Map<string, CampaignNote>();
  players: CampaignPlayer[] = [
    { id: "acc-ana", name: "Ana" },
    { id: "acc-bia", name: "Bia" },
  ];
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
      if (!this.tables.some((t) => t.root === root)) this.tables.push({ root, open: true, log_max: 20000, image_max: 10 * 1024 * 1024 });
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
      if (typeof a["open"] === "boolean") t.open = a["open"];
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
      const people = all.map((p) => ({ id: p.id, name: p.name, access: this.accessOf(path, p.id), you: this.viewer === "player" && p.id === this.account }));
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
      if (!/\.md$/i.test(path)) refuse("only a note can be edited by players");
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
    h["campaign_invite"] = (a) => {
      this.owner();
      const root = this.rootOf(a["root"]);
      if (!this.admin) refuse("only the server's admin invites a person who has no account");
      if (!this.tables.some((t) => t.root === root)) refuse("that folder is not a table");
      const link = `/invite/harness-${this.invites.length + 1}`;
      this.invites.push(link);
      return { link, expires: 1_900_000_000 };
    };
    this.wrapReads();
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

  /** Whether a player is kept from `path`. */
  hidden(path: string): boolean {
    const t = this.tableOf(path);
    if (!t) return false;
    if (!t.open) return true;
    if (!noteLike(path)) return false;
    return !this.seenBy(this.notes.get(path), this.account) && !this.mayEdit(path);
  }

  /** A folder of a table is there for a player when a file under it is (the table's own folder always). */
  private folderShown(folder: string): boolean {
    if (!this.tableOf(folder) || this.tables.some((t) => t.root === folder)) return true;
    return [...this.core.files.keys()].some((f) => f.startsWith(`${folder}/`) && !this.hidden(f));
  }

  private mayEdit(path: string): boolean {
    const g = this.notes.get(path)?.grant;
    return g?.kind === "group" || (g?.kind === "player" && g.account === this.account);
  }

  status(): CampaignStatus {
    if (!this.up || this.tables.length === 0) return { viewer: "none", tables: [], notes: [], players: [], can_invite: false };
    if (this.viewer === "owner") {
      const notes = [...this.notes.values()].map((n) => ({ ...n, audience: audOf(n), released: audOf(n).kind !== "hidden" })).sort((a, b) => a.path.localeCompare(b.path));
      return { viewer: "owner", tables: this.tables.map((t) => ({ ...t })), notes, players: this.players.filter((p) => p.id !== this.account), can_invite: this.admin };
    }
    const notes = [...this.notes.values()].filter((n) => this.mayEdit(n.path)).map((n) => ({ ...n, audience: (audOf(n).kind === "table" ? { kind: "table" } : { kind: "players", accounts: [this.account] }) as CampaignAudience, released: true, secret_name: false }));
    return { viewer: "player", tables: this.tables.map((t) => ({ ...t })), notes, players: [], can_invite: false };
  }

  private changed(paths: string[]): CampaignStatus {
    void emit("campaign-changed", { paths: this.viewer === "owner" ? paths : [] });
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
