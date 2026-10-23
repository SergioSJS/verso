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
// `leave`). While it is down the commands answer as the desktop's do.

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
  private log: TableEntry[] = [];
  private joined = false;
  private color = "#b5651d";
  private styles: DiceStyles | null = null;
  /** The others at the table, by account. */
  private readonly others = new Map<string, TableMember>();
  /** The role each other has, for what they may do and see. */
  private readonly roles = new Map<string, Role>();

  constructor(private readonly core: Core) {
    const h = core.handlers;
    const need = () => {
      if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
      if (!this.joined) refuse("join the table first");
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
      if (typeof a["color"] === "string") this.color = a["color"].toLowerCase();
      this.joined = true;
      void this.roster();
      const rows = this.visible();
      const pinned = rows.filter((r) => r.pinned);
      const unpinned = rows.filter((r) => !r.pinned);
      const latest = unpinned.slice(-JOIN_ENTRIES);
      const keep = new Set([...pinned, ...latest].map((r) => r.id));
      const entries = rows.filter((r) => keep.has(r.id));
      return { you: this.account, role: this.role, entries, more: unpinned.length > latest.length, roster: this.members() };
    };
    h["table_leave"] = () => {
      this.joined = false;
      return null;
    };
    h["table_look"] = (a) => {
      need();
      if (typeof a["color"] === "string") {
        if (!colour(a["color"])) refuse("a colour as #rrggbb");
        this.color = a["color"].toLowerCase();
      }
      this.styles = checkStyles(a["styles"]);
      void this.roster();
      return null;
    };
    h["table_history"] = (a) => {
      if (!this.up) refuse("the table is a server's; a folder of this computer alone has none");
      const before = a["before"] === null || a["before"] === undefined ? Infinity : Number(a["before"]);
      if (Number.isNaN(before)) refuse("not an entry's number");
      const limit = Math.min(PAGE_MOST, Math.max(1, Number(a["limit"] ?? 50)));
      const older = this.visible().filter((r) => Number(r.id) < before);
      const page = older.slice(-limit);
      return { entries: page, more: older.length > page.length };
    };
    h["table_say"] = (a) => {
      need();
      paced();
      const text = String(a["text"] ?? "");
      if ([...text].length > MESSAGE_CHARS) refuse(`a message is at most ${MESSAGE_CHARS} characters`);
      if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) refuse("a message is plain text");
      if (text.trim() === "") refuse("a message has some text");
      return this.add({ kind: "say", by: this.name, by_id: this.account, text: text.trim() });
    };
    h["table_send_image"] = (a) => {
      need();
      if (this.role === "reader") refuse("you may only read this folder");
      paced();
      const kind = imageKind(String(a["base64"] ?? ""));
      if (!kind) refuse("a PNG, JPEG, WebP or GIF image");
      // An image is a file of the folder, written as any file a window creates.
      const path = `attachments/mesa-${this.seq + 1}.${kind}`;
      core.handlers["create_file"]?.({ path, base64: String(a["base64"]) });
      return this.add({ kind: "image", by: this.name, by_id: this.account, image: path });
    };
    h["table_roll"] = (a) => {
      need();
      paced();
      const notation = readNotation(String(a["notation"] ?? ""));
      if (!notation) refuse("not a roll Verso reads");
      const source = a["source"] === null || a["source"] === undefined ? null : String(a["source"]);
      const roll: DiceRoll = { ...rollHere(notation, source), by: this.name, styles: checkStyles(a["styles"]), ...(typeof a["occurrence"] === "number" && a["occurrence"] >= 0 && a["occurrence"] < 1000 ? { occurrence: a["occurrence"] } : {}) };
      const path = typeof a["path"] === "string" ? a["path"] : null;
      return this.add({ kind: "roll", by: this.name, by_id: this.account, roll, path, secret: a["secret"] === true });
    };
    h["table_pin"] = (a) => {
      need();
      const row = this.find(String(a["id"]));
      row.pinned = a["pinned"] === true;
      void emit("table-pinned", { id: row.id, pinned: row.pinned });
      return null;
    };
    h["table_delete"] = (a) => {
      need();
      const row = this.find(String(a["id"]));
      if (row.kind !== "say" && row.kind !== "image" && this.role !== "owner") refuse("only an owner deletes a roll");
      if (row.by_id !== this.account && this.role !== "owner") refuse("only its author or an owner deletes an entry");
      this.log = this.log.filter((r) => r.id !== row.id);
      void emit("table-removed", { id: row.id });
      return null;
    };
    h["table_clear"] = (a) => {
      need();
      if (this.role !== "owner") refuse("only an owner clears the table");
      const keepPinned = a["keepPinned"] !== false;
      this.log = this.log.filter((r) => keepPinned && r.pinned);
      void emit("table-cleared", { keep_pinned: keepPinned });
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
        this.add({ kind: "roll", by: this.name, by_id: this.account, roll: withStyles, path: String(a["path"]), secret: a["secret"] === true });
        return withStyles;
      }
      return roll;
    };
    const oracle = h["collab_oracle"]!;
    h["collab_oracle"] = (a) => {
      const draw = oracle(a) as ReturnType<typeof oracleDrawHere>;
      if (this.up) this.add({ kind: "oracle", by: this.name, by_id: this.account, draw, path: String(a["path"]) });
      return draw;
    };
  }

  /** What the window with `role` sees of the log. */
  private visible(): TableEntry[] {
    return this.log.map((r) => this.seen(r));
  }

  private seen(r: TableEntry): TableEntry {
    const masked = r.secret && r.by_id !== this.account && this.role !== "owner";
    return masked ? { ...r, kind: "secret", path: null, roll: null, draw: null } : { ...r };
  }

  private find(id: string): TableEntry {
    const row = this.log.find((r) => r.id === id);
    if (!row) refuse("no such entry", "not_found");
    return row;
  }

  private members(): TableMember[] {
    const me: TableMember = { name: this.name, by_id: this.account, color: this.color, styles: this.styles };
    return [me, ...this.others.values()];
  }

  private roster(): Promise<void> {
    return emit("table-roster", this.members());
  }

  private add(e: Partial<TableEntry> & { kind: string; by: string; by_id: string }): TableEntry {
    const row: TableEntry = {
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
    this.log.push(row);
    const seen = this.seen(row);
    if (this.joined) void emit("table-entry", seen);
    return seen;
  }

  /* ---------- the others, played by a test ---------- */

  /** `name` (an account) sits at the table. */
  join(name: string, color = "#3b82f6", role: Role = "editor", styles: DiceStyles | null = null): void {
    this.roles.set(name, role);
    this.others.set(name, { name, by_id: `acc-${name.toLowerCase()}`, color, styles });
    void this.roster();
  }

  leave(name: string): void {
    this.others.delete(name);
    void this.roster();
  }

  /** `name` writes `text`. */
  say(name: string, text: string): TableEntry {
    return this.add({ kind: "say", by: name, by_id: `acc-${name.toLowerCase()}`, text });
  }

  /** `name` rolls `notation` (a note's `path` it was rolled from), in the
   *  roller's `styles`; `secret`: to the owner. */
  roll(name: string, notation: string, opts: { path?: string; styles?: DiceStyles | null; secret?: boolean; source?: string | null } = {}): TableEntry {
    const read = readNotation(notation);
    if (!read) throw new Error(`not a roll: ${notation}`);
    const roll: DiceRoll = { ...rollHere(read, opts.source ?? null), by: name, styles: opts.styles ?? null };
    return this.add({ kind: "roll", by: name, by_id: `acc-${name.toLowerCase()}`, roll, path: opts.path ?? null, secret: opts.secret ?? false });
  }

  /** `name` asks the oracle. */
  oracle(name: string, ask: OracleAsk, path: string | null = null): TableEntry {
    const draw = oracleDrawHere(ask, name, new Date().toISOString());
    return this.add({ kind: "oracle", by: name, by_id: `acc-${name.toLowerCase()}`, draw, path });
  }

  /** `name` sends an image already in the folder at `image`. */
  image(name: string, image: string): TableEntry {
    return this.add({ kind: "image", by: name, by_id: `acc-${name.toLowerCase()}`, image });
  }

  /** What the table holds, as the window would be told. */
  entries(): TableEntry[] {
    return this.visible();
  }
}
