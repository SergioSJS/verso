// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The table of ADR 0107, played in the page: the commands of
// `crates/verso-server/src/table.rs` with the same rules — who hears what
// by role, a message of 500 characters, an image by its bytes, only an
// owner clears, only an owner deletes a roll — so a test of the
// window's panel runs against what the server answers. The folder's table
// is a server's: a test says it is up (`up`), who the window is (`role`,
// `name`), and plays the others (`say`, `roll`, `oracle`, `image`, `join`,
// `leave`). While it is down the commands answer as the desktop's do. One
// log per table (ADR 0107, 2026-10-23): every command may name its table (a
// table of the campaign, or `""` in a folder with none); none named is the
// folder's default, its shortest-rooted table.

import { emit } from "@tauri-apps/api/event";
import type { ContractError, DiceRoll, DiceStyles, OracleAsk, TableEntry, TableMember } from "../bindings";
import { readNotation, rollHere } from "../dice/notation";
import type { Core } from "./core";
import { oracleDrawHere } from "./oracleDraw";

const MESSAGE_CHARS = 500;
const JOIN_ENTRIES = 100;
const PAGE_MOST = 200;
const TEXTURES = ["none", "marble", "speckles", "glitter", "stars", "astral", "cloudy", "fire", "water", "ice", "paper", "wood", "metal", "stainedglass", "skulls", "dragon", "leopard", "tiger", "lizard", "bird"];
const MATERIALS = ["auto", "plastic", "metal", "wood", "glass", "none"];

type Role = "owner" | "editor" | "reader";

function refuse(message: string, kind: ContractError["kind"] = "refused"): never {
  const e: ContractError = { kind, message };
  throw e;
}

const colour = (c: unknown): boolean => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

/** The closed form of a dice look: the server refuses anything else. */
export function checkStyles(raw: unknown): DiceStyles | null {
  if (raw === null || raw === undefined) return null;
  const s = raw as Record<string, Record<string, unknown>>;
  const keys = Object.keys(s).sort().join();
  if (keys !== "1,2,3") refuse("dice style: three looks");
  const one = (v: Record<string, unknown>) => {
    const extra = Object.keys(v).filter((k) => !["body", "number", "outline", "texture", "material", "app"].includes(k));
    if (extra.length > 0) refuse(`dice style: unknown field ${extra[0]}`);
    for (const f of ["body", "number", "outline"]) if (!colour(v[f])) refuse(`dice style: ${f} is a colour as #rrggbb`);
    if (!TEXTURES.includes(String(v["texture"]))) refuse("dice style: a texture of the list");
    if (!MATERIALS.includes(String(v["material"]))) refuse("dice style: a material of the list");
    return { body: String(v["body"]).toLowerCase(), number: String(v["number"]).toLowerCase(), outline: String(v["outline"]).toLowerCase(), texture: String(v["texture"]), material: String(v["material"]), ...(v["app"] === true ? { app: true } : {}) };
  };
  return { "1": one(s["1"]!), "2": one(s["2"]!), "3": one(s["3"]!) };
}

/** The kind of file the first bytes are (base64) for *Send files* (ADR 0113 K.4): an image, a PDF or audio; or null. */
export function fileExt(b64: string): string | null {
  const image = imageKind(b64);
  if (image) return image;
  let bin = "";
  try {
    bin = atob(b64.slice(0, 24));
  } catch {
    return null;
  }
  if (bin.startsWith("%PDF-")) return "pdf";
  if (bin.startsWith("ID3") || (bin.charCodeAt(0) === 0xff && (bin.charCodeAt(1) & 0xe0) === 0xe0)) return "mp3";
  if (bin.startsWith("OggS")) return "ogg";
  if (bin.startsWith("RIFF") && bin.slice(8, 12) === "WAVE") return "wav";
  if (bin.slice(4, 8) === "ftyp" && bin.slice(8, 12) === "M4A ") return "m4a";
  return null;
}

/** The kind of image the first bytes are (base64), or null. */
function imageKind(b64: string): string | null {
  let bin = "";
  try {
    bin = atob(b64.slice(0, 24));
  } catch {
    return null;
  }
  const at = (s: string) => bin.startsWith(s);
  if (at("\x89PNG\r\n\x1a\n")) return "png";
  if (at("\xff\xd8\xff")) return "jpg";
  if (at("RIFF") && bin.slice(8, 12) === "WEBP") return "webp";
  if (at("GIF87a") || at("GIF89a")) return "gif";
  return null;
}

/** What one table holds: its log, the others at it, and whether this window joined. */
type Slot = { log: TableEntry[]; joined: boolean; others: Map<string, TableMember>; roles: Map<string, Role> };

const keyOf = (root: string): string =>
  root
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p !== "" && p !== ".")
    .join("/")
    .toLowerCase();

export class Table {
  private isUp = false;
  private asRole: Role = "owner";
  /** The folder's table is up: the folder is a server's. Saying so makes the
   *  window try to join, as it does when a folder is shown. */
  get up(): boolean {
    return this.linked() ?? this.isUp;
  }
  /** A synced folder (ADR 0107 item 9): the table is the server's while the
   *  sync's link is up (`true`), none while it is down (`false`); `null`
   *  for a folder that does not sync, where `up` says. */
  linked: () => boolean | null = () => null;
  set up(value: boolean) {
    this.isUp = value;
    dispatchEvent(new Event("verso:table-retry"));
  }
  /** The window's role in the folder; changed while up, the window joins again (the server tells it). */
  get role(): Role {
    return this.asRole;
  }
  set role(value: Role) {
    this.asRole = value;
    if (this.isUp) dispatchEvent(new Event("verso:table-retry"));
  }
  /** What the next message, image or roll of the window is refused with (the pace, say). */
  refuseNext: string | null = null;
  /** The window's name and account. */
  name = "Ana";
  readonly account = "acc-ana";
  private seq = 0;
  private readonly slots = new Map<string, Slot>();
  private color = "#b5651d";
  private styles: DiceStyles | null = null;
  /** The roots of the folder's tables (the campaign's); none: the folder alone. */
  roots: () => string[] = () => [];
  /** Whether the game master let this window send images at the table at `root` (the campaign's, the right Images). */
  mayImage: (root: string) => boolean = () => false;
  /** Whether it let it send a file that is not an image (the right Files, ADR 0113 K.6). */
  mayFile: (root: string) => boolean = () => false;

  /** The table a call without one goes to: the shortest-rooted. */
  defaultRoot(): string {
    return [...this.roots()].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "";
  }

  /** The table that holds the note at `path`, the deepest, else the default. */
  tableOfPath(path: string): string {
    const under = (r: string): boolean => r === "" || path === r || path.startsWith(`${r}/`);
    return [...this.roots()].filter(under).sort((a, b) => b.length - a.length)[0] ?? this.defaultRoot();
  }

  /** The table a call names, as the server keeps its root; refused when it is none. */
  private named(asked: unknown): string {
    if (asked === undefined || asked === null) return this.defaultRoot();
    const t = String(asked);
    if (t.startsWith("/") || t.includes("\\") || t.split("/").some((p) => p === ".." || p === ".")) refuse("a table's folder within the folder");
    const roots = this.roots();
    if (roots.length === 0) {
      if (t === "") return "";
      refuse("no such table");
    }
    const found = roots.find((r) => keyOf(r) === keyOf(t));
    if (found === undefined) refuse("no such table");
    return found;
  }

  /** The table a command names, when the window is at it; refused otherwise (as `need`). */
  at(table: unknown): string {
    if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
    const root = this.named(table);
    if (!this.slot(root).joined) refuse("join the table first");
    return root;
  }

  private slot(root: string): Slot {
    let s = this.slots.get(root);
    if (!s) this.slots.set(root, (s = { log: [], joined: false, others: new Map(), roles: new Map() }));
    return s;
  }

  constructor(private readonly core: Core) {
    const h = core.handlers;
    const need = (table: unknown): string => {
      if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
      const root = this.named(table);
      if (!this.slot(root).joined) refuse("join the table first");
      return root;
    };
    const paced = () => {
      if (this.refuseNext) {
        const message = this.refuseNext;
        this.refuseNext = null;
        refuse(message);
      }
    };
    h["table_join"] = (a) => {
      if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
      if (a["color"] !== null && a["color"] !== undefined && !colour(a["color"])) refuse("a colour as #rrggbb");
      this.styles = checkStyles(a["styles"]);
      const root = this.named(a["table"]);
      if (typeof a["color"] === "string") this.color = a["color"].toLowerCase();
      this.slot(root).joined = true;
      void this.roster(root);
      const rows = this.visible(root);
      const pinned = rows.filter((r) => r.pinned);
      const unpinned = rows.filter((r) => !r.pinned);
      const latest = unpinned.slice(-JOIN_ENTRIES);
      const keep = new Set([...pinned, ...latest].map((r) => r.id));
      const entries = rows.filter((r) => keep.has(r.id));
      return { table: root, you: this.account, role: this.role, entries, more: unpinned.length > latest.length, roster: this.members(root), images: this.role !== "reader" || this.mayImage(root), files: this.role !== "reader" || this.mayFile(root) };
    };
    h["table_leave"] = (a) => {
      // A table named leaves that one; none named, every table.
      if (a["table"] === undefined || a["table"] === null) for (const s of this.slots.values()) s.joined = false;
      else this.slot(this.named(a["table"])).joined = false;
      return null;
    };
    h["table_look"] = (a) => {
      const root = need(a["table"]);
      if (typeof a["color"] === "string") {
        if (!colour(a["color"])) refuse("a colour as #rrggbb");
        this.color = a["color"].toLowerCase();
      }
      this.styles = checkStyles(a["styles"]);
      void this.roster(root);
      return null;
    };
    h["table_history"] = (a) => {
      if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
      const root = this.named(a["table"]);
      const before = a["before"] === null || a["before"] === undefined ? Infinity : Number(a["before"]);
      if (Number.isNaN(before)) refuse("not an entry's number");
      const limit = Math.min(PAGE_MOST, Math.max(1, Number(a["limit"] ?? 50)));
      const older = this.visible(root).filter((r) => Number(r.id) < before);
      const page = older.slice(-limit);
      return { entries: page, more: older.length > page.length };
    };
    h["table_say"] = (a) => {
      const root = need(a["table"]);
      paced();
      const text = String(a["text"] ?? "");
      if ([...text].length > MESSAGE_CHARS) refuse(`a message is at most ${MESSAGE_CHARS} characters`);
      if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) refuse("a message is plain text");
      if (text.trim() === "") refuse("a message has some text");
      return this.add(root, { kind: "say", by: this.name, by_id: this.account, text: text.trim() });
    };
    h["table_send_image"] = (a) => {
      const root = need(a["table"]);
      if (this.role === "reader" && !this.mayImage(root) && !this.mayFile(root)) refuse("you may only read this folder");
      paced();
      const kind = fileExt(String(a["base64"] ?? ""));
      if (!kind) refuse("an image, a PDF or an audio file (not SVG, a page or a script)");
      // The right is by what the bytes are: an image is Images, the rest Files (K.6).
      const image = ["png", "jpg", "webp", "gif"].includes(kind);
      if (this.role === "reader" && !(image ? this.mayImage(root) : this.mayFile(root))) refuse("you may only read this folder");
      // A file is a file of the folder, written as any file a window creates.
      const path = `attachments/mesa-${this.seq + 1}.${kind}`;
      core.handlers["create_file"]?.({ path, base64: String(a["base64"]) });
      return this.add(root, { kind: ["png", "jpg", "webp", "gif"].includes(kind) ? "image" : "file", by: this.name, by_id: this.account, image: path });
    };
    h["table_roll"] = (a) => {
      const root = need(a["table"]);
      paced();
      const notation = readNotation(String(a["notation"] ?? ""));
      if (!notation) refuse("not a roll Verso reads");
      const source = a["source"] === null || a["source"] === undefined ? null : String(a["source"]);
      const roll: DiceRoll = { ...rollHere(notation, source), by: this.name, styles: checkStyles(a["styles"]), ...(typeof a["occurrence"] === "number" && a["occurrence"] >= 0 && a["occurrence"] < 1000 ? { occurrence: a["occurrence"] } : {}) };
      const path = typeof a["path"] === "string" ? a["path"] : null;
      return this.add(root, { kind: "roll", by: this.name, by_id: this.account, roll, path, secret: a["secret"] === true });
    };
    h["table_pin"] = (a) => {
      const root = need(a["table"]);
      const row = this.find(root, String(a["id"]));
      row.pinned = a["pinned"] === true;
      void emit("table-pinned", { table: root, id: row.id, pinned: row.pinned });
      return null;
    };
    h["table_delete"] = (a) => {
      const root = need(a["table"]);
      const row = this.find(root, String(a["id"]));
      if (row.kind !== "say" && row.kind !== "image" && this.role !== "owner") refuse("only an owner deletes a roll");
      if (row.by_id !== this.account && this.role !== "owner") refuse("only its author or an owner deletes an entry");
      const slot = this.slot(root);
      slot.log = slot.log.filter((r) => r.id !== row.id);
      void emit("table-removed", { table: root, id: row.id });
      return null;
    };
    h["table_clear"] = (a) => {
      const root = need(a["table"]);
      if (this.role !== "owner") refuse("only an owner clears the table");
      const keepPinned = a["keepPinned"] !== false;
      const slot = this.slot(root);
      slot.log = slot.log.filter((r) => keepPinned && r.pinned);
      void emit("table-cleared", { table: root, keep_pinned: keepPinned });
      return null;
    };
    // A roll or a draw in a note's room is appended to the table too,
    // rolled once (item 2): the Rooms' answer, kept here.
    const room = h["collab_roll"]!;
    h["collab_roll"] = (a) => {
      const roll = room(a) as DiceRoll;
      if (this.up) {
        const styles = checkStyles(a["styles"]);
        const withStyles = styles ? { ...roll, styles } : roll;
        this.add(this.tableOfPath(String(a["path"])), { kind: "roll", by: this.name, by_id: this.account, roll: withStyles, path: String(a["path"]), secret: a["secret"] === true });
        return withStyles;
      }
      return roll;
    };
    const oracle = h["collab_oracle"]!;
    h["collab_oracle"] = (a) => {
      const draw = oracle(a) as ReturnType<typeof oracleDrawHere>;
      if (this.up) this.add(this.tableOfPath(String(a["path"])), { kind: "oracle", by: this.name, by_id: this.account, draw, path: String(a["path"]) });
      return draw;
    };
  }

  /** What the window with `role` sees of the log. */
  private visible(root: string): TableEntry[] {
    return this.slot(root).log.map((r) => this.seen(r));
  }

  private seen(r: TableEntry): TableEntry {
    const masked = r.secret && r.by_id !== this.account && this.role !== "owner";
    return masked ? { ...r, kind: "secret", path: null, roll: null, draw: null } : { ...r };
  }

  private find(root: string, id: string): TableEntry {
    const row = this.slot(root).log.find((r) => r.id === id);
    if (!row) refuse("no such entry", "not_found");
    return row;
  }

  private members(root: string): TableMember[] {
    const me: TableMember = { name: this.name, by_id: this.account, color: this.color, styles: this.styles };
    return [me, ...this.slot(root).others.values()];
  }

  private roster(root: string): Promise<void> {
    return emit("table-roster", { table: root, members: this.members(root) });
  }

  private add(root: string, e: Partial<TableEntry> & { kind: string; by: string; by_id: string }): TableEntry {
    const row: TableEntry = {
      table: root,
      id: String(++this.seq),
      kind: e.kind,
      by: e.by,
      by_id: e.by_id,
      at: new Date().toISOString(),
      path: e.path ?? null,
      pinned: false,
      secret: e.secret ?? false,
      roll: e.roll ?? null,
      draw: e.draw ?? null,
      text: e.text ?? null,
      image: e.image ?? null,
    };
    const slot = this.slot(root);
    slot.log.push(row);
    const seen = this.seen(row);
    if (slot.joined) void emit("table-entry", seen);
    return seen;
  }

  /* ---------- the others, played by a test ---------- */

  /** `name` (an account) sits at the table (`table`: the folder's default when none). */
  join(name: string, color = "#3b82f6", role: Role = "editor", styles: DiceStyles | null = null, table = this.defaultRoot()): void {
    const slot = this.slot(table);
    slot.roles.set(name, role);
    slot.others.set(name, { name, by_id: `acc-${name.toLowerCase()}`, color, styles });
    void this.roster(table);
  }

  leave(name: string, table = this.defaultRoot()): void {
    this.slot(table).others.delete(name);
    void this.roster(table);
  }

  /** `name` writes `text`. */
  say(name: string, text: string, table = this.defaultRoot()): TableEntry {
    return this.add(table, { kind: "say", by: name, by_id: `acc-${name.toLowerCase()}`, text });
  }

  /** `name` rolls `notation` (a note's `path` it was rolled from), in the
   *  roller's `styles`; `secret`: to the owner. */
  roll(name: string, notation: string, opts: { path?: string; styles?: DiceStyles | null; secret?: boolean; source?: string | null; table?: string } = {}): TableEntry {
    const read = readNotation(notation);
    if (!read) throw new Error(`not a roll: ${notation}`);
    const roll: DiceRoll = { ...rollHere(read, opts.source ?? null), by: name, styles: opts.styles ?? null };
    return this.add(opts.table ?? this.defaultRoot(), { kind: "roll", by: name, by_id: `acc-${name.toLowerCase()}`, roll, path: opts.path ?? null, secret: opts.secret ?? false });
  }

  /** `name` asks the oracle. */
  oracle(name: string, ask: OracleAsk, path: string | null = null, table = this.defaultRoot()): TableEntry {
    const draw = oracleDrawHere(ask, name, new Date().toISOString());
    return this.add(table, { kind: "oracle", by: name, by_id: `acc-${name.toLowerCase()}`, draw, path });
  }

  /** `name` sends an image already in the folder at `image`. */
  image(name: string, image: string, table = this.defaultRoot()): TableEntry {
    return this.add(table, { kind: "image", by: name, by_id: `acc-${name.toLowerCase()}`, image });
  }

  /** What the table holds, as the window would be told. */
  entries(table = this.defaultRoot()): TableEntry[] {
    return this.visible(table);
  }
}
