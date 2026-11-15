// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's "this app is a server" (ADR 0096): the commands of the
// desktop's Settings section and pairing dialog, answered in memory so the
// window behaves as in the app — folders to tick, a server that turns on
// and off, a QR and a code, a phone that asks and is allowed or refused, a
// list of phones with Revoke, a log. Nothing listens: the Rust tests
// (`crates/verso-server/src/local`) drive the real server. A test moves
// the story on with `askAsPhone()`, which stands for a phone presenting
// the token.
//
// ADR 0117 (one feature): the box *On my network* is a setting; the box
// *By an internet link* answers with a quick link at once (no cloudflared
// runs here — `app/src-tauri/src/tunnel/tests.rs` drives a fake one); an
// own address is set up after a login; invitations are made, listed and
// ended. A test makes the link fail with `failLink(words)`, and makes it
// end by itself with `__harness.emit("local-server-link", …)`; with
// `slowLink(done, total)` the next turn-on stays downloading cloudflared
// (bytes so far and in all) until the link is turned off. With
// `holdStatus()` the status is read when asked but answered only at
// `releaseStatus(order)`, in the order asked or the reverse: the host's
// answers do not come back in the order they were asked.
//
// S7c: another person's desktop app signs in (`signInDevice`, a test's)
// and is listed and ended; the read links' switch, off at first; and the
// window seated at its own table makes read links as the server answers
// them through the seat's door (`atTable`).
//
// ADR 0117 D9: the people invited (`addPlayer`, a test's; an invitation
// accepted adds one too), with a new password's link, their sessions
// ended and their account removed.

import { emit } from "@tauri-apps/api/event";
import type { ContractError, FolderAccess, FolderInfo, LocalAudit, LocalDevice, LocalFolder, LocalInvitation, LocalLink, LocalOwnLogin, LocalPairState, LocalPairing, LocalPhone, LocalPlayer, LocalReset, LocalServerStatus, ReadLinkInfo, TableHost } from "../bindings";

type Args = Record<string, unknown>;

/** A small square with a finder pattern in the corner: enough for the
 *  window to draw; the Rust tests check the real encoding. */
function square(): string[] {
  const n = 29 + 8;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x >= 4 && y >= 4 && x < n - 4 && y < n - 4 && ((x * 7 + y * 3) % 5 < 2 || (x < 11 && y < 11)) ? "1" : "0")).join(""));
}

function refuse(message: string): never {
  const error: ContractError = { kind: "refused", message };
  throw error;
}

export class LocalServerHarness {
  private serving = false;
  private keepOn = false;
  private paired: LocalPhone[] = [];
  private audit: LocalAudit[] = [];
  private open = false;
  private asked: { device: string; address: string; asked: string; link: boolean; app: boolean } | null = null;
  private nextId = 1;
  private cert: Pick<LocalServerStatus, "cert_file" | "key_file" | "host_name"> = { cert_file: null, key_file: null, host_name: null };
  private ticked = new Set<string>();
  /** The folders chosen inside a ticked folder (ADR 0096 item 2, amended 2026-10-16). */
  private parts = new Map<string, string[]>();
  /** The chosen folders the last start left out ("Antigo" is a folder the harness's disk has lost). */
  private dropped: string[] = [];
  /** Folders the harness knows, one of them syncing with a server. */
  private folders: LocalFolder[] = [
    { key: "harness", name: "Vault", place: "", ticked: false, parts: [], missing: [], attachments: null, received_from: null, tables: 0 },
    { key: "synced", name: "Compartilhada", place: "", ticked: false, parts: [], missing: [], attachments: null, received_from: "notas.exemplo", tables: 0 },
    // As the maintainer's list: many folders, two of the same name, told
    // apart only by the directory they are in (a name, never a path).
    ...[
      ["Caderno", "obsidian"],
      ["Caderno", "Dropbox"],
      ["mac-vault-import", "obsidian"],
      ["mac-vault-import", "Downloads"],
      ["Sandbox", "obsidian"],
      ["Receitas", "Dropbox"],
      ["Trabalho", "Documents"],
      ["Diario", "Documents"],
      ["Estudos", "Documents"],
      ["Projetos", "code"],
    ].map(([name, place], i) => ({ key: `many-${i}`, name: name!, place: place!, ticked: false, parts: [], missing: [], attachments: null, received_from: null, tables: 0 })),
  ];
  private maxConnected = 4;
  private appIdleDays = 90;
  /** How many tables the server holds in the window's folder: the
   *  harness's campaign says (`harness.ts`). */
  tablesOf: () => number = () => 0;
  /** The other server of the window's table (ADR 0117 R9): a test's
   *  (`?moveTo=universo` or `?moveTo=here`, `harness.ts`); none at first. */
  otherHost: () => TableHost | null = () => null;
  /** The move's two steps on the harness's one campaign (`harness.ts`). */
  moveTable: (root: string) => void = () => {};
  private fingerprint = "AB:CD:EF:01:23:45:67:89";
  /** The identity's generation: replaced, the fingerprint changes. */
  private generation = 1;
  /** The box *On my network* (ADR 0117 D1): kept, on by default. */
  private network = true;
  /** Serving on the network now (the link alone serves on no address). */
  private lan = false;
  private link: LocalLink = { state: "off", origin: null, until: null, own: false, ended: null, protocol: null, qr: [], download: null };
  private linkOwn = false;
  private own: { hostname: string } | null = null;
  private signedIn = false;
  /** The words the next `local_server_link_on` fails with (a test's). */
  private linkFailure: string | null = null;
  /** The owner's name for the players, as the host names it at first. */
  private ownerName = "Sérgio";
  private slow: { done: number; total: number | null } | null = null;
  /** The turn-on under way while it downloads: ended by a turn-off. */
  private downloading: ((link: LocalLink) => void) | null = null;
  /** Statuses read when asked, answered at `releaseStatus` (a test's). */
  private held: { at: LocalServerStatus; answer: (s: LocalServerStatus) => void }[] | null = null;
  private invites: LocalInvitation[] = [];
  /** The window sits at its own server's table (ADR 0117 D4 Q3). */
  private seated = false;
  private nextInvite = 1;
  /** Read links on for this server (ADR 0105 item 3): off at first. */
  private readLinks = false;
  /** The read links the window at the table made. */
  private links: ReadLinkInfo[] = [];
  /** Other people's desktop apps signed in (ADR 0117 D9, S11). */
  private devices: LocalDevice[] = [];

  /** The people invited who made an account (ADR 0117 D9). */
  private players: LocalPlayer[] = [];

  /** A person invited made an account and was last seen at the table (a test's). */
  addPlayer(name = "Bia", email = "bia@casa.example", reaches: LocalPlayer["reaches"] = [{ name: "Vault", role: "editor" }]): string {
    const at = Math.floor(Date.UTC(2026, 10, 4) / 1000);
    const id = `a${this.nextId++}`;
    this.players.push({ id, name, email, created: at, last_seen: at + 3600, reaches });
    this.players.sort((a, b) => a.email.localeCompare(b.email));
    return id;
  }

  /** Another person's desktop app signs in through the browser (a test's). */
  signInDevice(device = "Verso · Mac da Ana", account = "Ana", email = "ana@casa.example"): void {
    const at = Math.floor(Date.UTC(2026, 10, 4) / 1000);
    this.devices.unshift({ id: `d${this.nextId++}`, device, account, email, created: at, last_used: at + 600 });
  }

  /** The window sits at its own server's table. */
  isSeated(): boolean {
    return this.seated;
  }

  /** What the server says of the seated window: the owner, its game master. */
  access(): FolderAccess | null {
    return this.seated ? { seat: "master", role: "owner", cap: "write", table: false } : null;
  }

  /** A read link's command (ADR 0105) of the window at its own table, as
   *  the server answers it through the seat's door; `otherwise` for a
   *  window that is not seated. */
  atTable(cmd: string, a: Args, otherwise: () => unknown): unknown {
    if (!this.seated) return otherwise();
    if (cmd === "read_link_list") return { enabled: this.readLinks, links: this.links.map((l) => ({ ...l })) };
    if (cmd === "read_link_secrets") return 0;
    if (cmd === "read_link_revoke") {
      this.links = this.links.filter((l) => l.id !== String(a["id"]));
      return null;
    }
    if (!this.readLinks) refuse("read links are turned off on this computer's server: turn them on in Settings, where it serves");
    const id = `rl${this.nextId++}`;
    const link: ReadLinkInfo = { id, kind: String(a["kind"]), path: String(a["path"]), made_by: "Sérgio", made_at: Math.floor(Date.UTC(2026, 10, 4) / 1000), expires: null, has_password: Boolean(a["password"]), last_opened: null, open: 0 };
    this.links.push(link);
    const base = this.link.state === "on" && this.link.origin ? this.link.origin : "https://192.168.1.20:51234";
    this.log("read_link_created", id);
    return { url: `${base}/r/leitura-${id}`, link: { ...link } };
  }

  /** The next turn-on of the link fails, with the host's words. */
  failLink(words: string | null): void {
    this.linkFailure = words;
  }

  /** The next turn-on of the link stays downloading cloudflared, `done`
   *  bytes of `total`, until the link is turned off. */
  slowLink(done: number, total: number | null): void {
    this.slow = { done, total };
  }

  /** From now, each status is read when asked and answered only at
   *  `releaseStatus` (a test's). */
  holdStatus(): void {
    this.held = [];
  }

  /** The statuses held, answered in the order asked or the reverse, one
   *  after the other; says how many. Statuses are answered at once again. */
  async releaseStatus(order: "asked" | "reverse" = "asked"): Promise<number> {
    const held = this.held ?? [];
    this.held = null;
    if (order === "reverse") held.reverse();
    for (const h of held) {
      h.answer(h.at);
      await new Promise((r) => setTimeout(r, 50));
    }
    return held.length;
  }

  /** The link's state as the host's event would set it (a test's). */
  setLink(link: Partial<LocalLink>): void {
    this.link = { ...this.link, ...link };
    if (this.link.state !== "on" && this.link.state !== "starting" && !this.lan) this.serving = false;
  }

  /** Serving stopped under a seated window: the host lets it go and says
   *  its session ended (S4). */
  private letGo(): void {
    if (!this.seated) return;
    this.seated = false;
    void emit("server-gone", { url: "https://this-computer.invalid", what: "seat", address: null, reason: null });
  }

  private linkOff(ended: LocalLink["ended"]): LocalLink {
    this.link = { state: "off", origin: null, until: null, own: false, ended, protocol: null, qr: [], download: null };
    // A download under way hears the stop: its turn-on ends refused, as
    // the host's does.
    const ending = this.downloading;
    this.downloading = null;
    if (ending) ending({ ...this.link });
    // As the server: with the network's box unticked nothing is left to serve.
    if (!this.lan) {
      this.serving = false;
      this.letGo();
    }
    return { ...this.link };
  }

  private rows(): LocalFolder[] {
    return this.folders.map((f) => {
      const parts = this.parts.get(f.key) ?? [];
      const gone = this.serving || this.dropped.length > 0 ? parts.filter((p) => this.dropped.includes(`${f.name}/${p}`)) : [];
      // The vault's setting names "Anexos": it goes along unless it is, or holds, a chosen folder.
      const attach = f.key === "harness" && parts.length > 0 && !parts.some((p) => p === "Anexos" || p.startsWith("Anexos/")) ? "Anexos" : null;
      // The server's tables of the window's folder while it serves (the
      // harness's campaign is the server's database).
      const tables = this.serving && f.key === "harness" && this.ticked.has(f.key) ? this.tablesOf() : 0;
      return { ...f, ticked: this.ticked.has(f.key), parts, missing: gone, attachments: attach, tables };
    });
  }

  private log(action: string, subject: string | null = null, address: string | null = null): void {
    this.audit.unshift({ at: Math.floor(Date.UTC(2026, 9, 15) / 1000) + this.audit.length, action, subject, address });
  }

  private status(): LocalServerStatus {
    return {
      supported: true,
      serving: this.serving,
      port: this.lan ? 51234 : null,
      addresses: this.lan ? ["192.168.1.20"] : [],
      phones_paired: this.paired.length,
      phones_connected: this.serving ? Math.min(this.paired.length, this.maxConnected) : 0,
      max_connected: this.maxConnected,
      app_idle_days: this.appIdleDays,
      pairing_open: this.open,
      fingerprint: this.lan ? this.fingerprint : null,
      certificate: this.cert.cert_file ? "files" : "own",
      tailscale: false,
      stopped_because: null,
      unreachable: false,
      keep_on: this.keepOn,
      dropped: this.dropped,
      network: this.network,
      link: { ...this.link },
      link_own: this.linkOwn,
      own_address: this.own ? { ...this.own } : null,
      cloudflare_signed_in: this.signedIn,
      read_links: this.readLinks,
      owner_name: this.ownerName,
      listened_again: false,
      ...this.cert,
    };
  }

  /** A phone presents the token: the dialog is asked "Was it you?" — on
   *  the network, or through the internet link (`link`, ADR 0117 D5), from
   *  the address the tunnel forwarded. */
  askAsPhone(device = "iPhone de teste", link = false, app = false): void {
    if (!this.open) throw new Error("no pairing window is open");
    const address = link ? "203.0.113.9" : "192.168.1.77";
    this.asked = { device, address, asked: "2026-10-15T10:00:00Z", link, app };
    this.log(link ? "pair_asked_link" : "pair_asked", device, address);
  }

  readonly handlers: Record<string, (a: Args) => unknown> = {
    local_server_status: (): LocalServerStatus => {
      const held = this.held;
      if (!held) return this.status();
      const at = this.status();
      return new Promise<LocalServerStatus>((answer) => held.push({ at, answer })) as unknown as LocalServerStatus;
    },
    local_server_folders: (): LocalFolder[] => this.rows(),
    // The folders inside one, as the host's walk lists them: relative, `/`-joined, none hidden.
    local_server_subfolders: (a): string[] => {
      const key = String(a["key"]);
      if (!this.folders.some((f) => f.key === key)) refuse("this computer does not know that folder");
      return key === "harness"
        ? ["Anexos", "Diario", "Diario/2026", "Diario/2026/Outubro", "Antigo", "Projetos", "Projetos/Mesa", "Projetos/Verso", "Segredo"]
        : ["Arquivo", "Arquivo/2025", "Notas"];
    },
    local_server_parts: (a): LocalFolder[] => {
      const key = String(a["key"]);
      if (!this.ticked.has(key)) refuse("tick the folder first");
      const chosen = (a["parts"] as string[]).map((p) => p.replace(/\/+$/, ""));
      for (const p of chosen) if (p === "" || p.startsWith("/") || p.split("/").some((x) => x === "" || x === "." || x === ".." || x.startsWith("."))) refuse(`not a folder inside the served folder: ${p}`);
      const kept = [...new Set(chosen)].sort().filter((p, _, all) => !all.some((q) => q !== p && p.startsWith(`${q}/`)));
      this.dropped = [];
      // As the host: none chosen stops serving the folder and forgets the choice.
      if (kept.length === 0) {
        this.parts.delete(key);
        this.ticked.delete(key);
      } else this.parts.set(key, kept);
      return this.rows();
    },
    local_server_whole: (a): LocalFolder[] => {
      const key = String(a["key"]);
      if (!this.ticked.has(key)) refuse("tick the folder first");
      this.parts.delete(key);
      this.dropped = [];
      return this.rows();
    },
    local_server_tick: (a): LocalFolder[] => {
      const key = String(a["key"]);
      const folder = this.folders.find((f) => f.key === key);
      if (!folder) refuse("this computer does not know that folder");
      if (a["ticked"] === true && folder.received_from) refuse(`this folder was shared with you on ${folder.received_from}: only its owner serves it`);
      // As the host: unticking forgets what was chosen inside a folder;
      // ticking it again while it is ticked changes nothing.
      if (a["ticked"] === true) this.ticked.add(key);
      else {
        this.ticked.delete(key);
        this.parts.delete(key);
        this.dropped = [];
      }
      // While serving, what is served changes at once (ADR 0117 R4).
      if (this.serving) void emit("local-server", { kind: "changed" });
      return this.rows();
    },
    local_server_settings: (a): LocalServerStatus => {
      this.keepOn = a["keepOn"] === true;
      const most = Number(a["maxConnected"]);
      if (!Number.isInteger(most) || most < 1 || most > 16) refuse("phones connected at once: between 1 and 16");
      this.maxConnected = most;
      this.cert = { cert_file: (a["certFile"] as string | null) || null, key_file: (a["keyFile"] as string | null) || null, host_name: (a["hostName"] as string | null) || null };
      return this.status();
    },
    local_server_app_idle: (a): LocalServerStatus => {
      const days = Number(a["days"]);
      if (!(days === 0 || (Number.isInteger(days) && days >= 7 && days <= 365))) refuse("a paired app's limit: never, or between 7 and 365 days");
      this.appIdleDays = days;
      this.log("app_idle_set");
      return this.status();
    },
    local_server_start: (): LocalServerStatus => {
      if (this.serving && this.lan) return this.status();
      if (this.ticked.size === 0) refuse("tick at least one folder to serve");
      if (!this.network) refuse("tick On my network, or turn the internet link on, to serve");
      this.dropped = [];
      for (const key of this.ticked) {
        const chosen = this.parts.get(key) ?? [];
        if (chosen.length === 0) continue;
        const name = this.folders.find((f) => f.key === key)?.name ?? key;
        const left = chosen.filter((p) => p !== "Antigo");
        if (left.length === 0) refuse(`${name}: none of the folders chosen inside it is there any more: choose again, or serve all of it`);
        this.dropped.push(...chosen.filter((p) => p === "Antigo").map((p) => `${name}/${p}`));
      }
      this.serving = true;
      this.lan = true;
      this.log("local_on", "1 address(es), port 51234");
      // As the host does on every change of what it serves.
      void emit("local-server", { kind: "changed" });
      return this.status();
    },
    local_server_stop: (): LocalServerStatus => {
      if (this.serving) this.log("local_off");
      this.letGo();
      if (this.link.state === "on" || this.link.state === "starting") this.linkOff("stopped");
      this.serving = false;
      this.lan = false;
      this.open = false;
      this.asked = null;
      void emit("local-server", { kind: "changed" });
      return this.status();
    },
    local_server_pair_open: (a): LocalPairing => {
      const address = typeof a["address"] === "string" ? a["address"] : null;
      const choices = [
        { address: "192.168.3.122", interface: "en7", kind: "lan", hint: null, default_route: true },
        { address: "10.147.11.197", interface: "feth237", kind: "virtual", hint: "ZeroTier", default_route: false },
        { address: "10.217.1.73", interface: "utun4", kind: "virtual", hint: "VPN", default_route: false },
      ];
      if (address !== null && !choices.some((c) => c.address === address)) refuse(`${address} is not an address this computer serves now`);
      const chosen = address ?? "192.168.3.122";
      if (!this.serving) refuse("turn serving on first");
      if (this.paired.length >= 4) refuse("4 phones are paired already: revoke one before pairing another");
      // Through the internet link too, once it has its address (ADR 0117 D5).
      const origin = this.link.state === "on" ? this.link.origin : null;
      if (!this.lan && origin === null) refuse("pairing a phone needs On my network, or the internet link on");
      this.open = true;
      this.asked = null;
      this.log("pair_open");
      const rows = square();
      const link = origin ? { url: `${origin}/pair#t=harness`, qr: square() } : null;
      if (!this.lan && link) {
        const name = link.url.slice("https://".length).split("/")[0] ?? "";
        return { url: link.url, address: name, choices: [], chosen: name, code: "BCDF-GHJK", qr: link.qr, expires_in: 120, fingerprint: "", certificate: "link", link };
      }
      return {
        url: `https://${chosen}:51234/pair#t=harness&fp=abcd&c=0123456789abcdef`,
        address: `${chosen}:51234`,
        choices,
        chosen,
        code: "BCDF-GHJK",
        qr: rows,
        expires_in: 120,
        fingerprint: this.fingerprint,
        certificate: this.cert.cert_file ? "files" : "own",
        link,
      };
    },
    local_server_pair_close: (): null => {
      this.open = false;
      this.asked = null;
      return null;
    },
    local_server_pair_state: (): LocalPairState => ({ open: this.open, remaining: this.open ? 90 : 0, asked: this.asked }),
    local_server_answer: (a): null => {
      const asked = this.asked;
      if (!asked) refuse("no phone is waiting");
      this.asked = null;
      this.open = false;
      if (a["allow"] === true) {
        this.paired.push({ id: `p${this.nextId++}`, name: asked.device, role: a["editor"] === true ? "editor" : "reader", paired: 1_792_000_000, last_seen: 1_792_000_000, address: asked.address });
        this.log(`pair_allowed_${a["editor"] === true ? "editor" : "reader"}`, asked.device, asked.address);
      } else {
        this.log("pair_refused", asked.device, asked.address);
      }
      return null;
    },
    local_server_phones: (): LocalPhone[] => this.paired.map((p) => ({ ...p })),
    local_server_phone_role: (a): null => {
      const phone = this.paired.find((p) => p.id === String(a["id"]));
      if (!phone) refuse("that phone is not paired");
      phone.role = a["editor"] === true ? "editor" : "reader";
      this.log(`phone_role_${phone.role}`, phone.name);
      return null;
    },
    local_server_revoke: (a): null => {
      const at = this.paired.findIndex((p) => p.id === String(a["id"]));
      if (at < 0) refuse("that phone is not paired");
      this.log("phone_revoked", this.paired[at]?.name ?? null);
      this.paired.splice(at, 1);
      return null;
    },
    local_server_forget: (): number => {
      const n = this.paired.length;
      this.paired = [];
      this.log("phones_forgotten", String(n));
      return n;
    },
    local_server_replace_identity: (): LocalServerStatus => {
      if (this.link.state === "on") this.linkOff("stopped");
      this.serving = false;
      this.lan = false;
      this.paired = [];
      this.generation += 1;
      this.fingerprint = `AB:CD:EF:01:23:45:67:${String(80 + this.generation)}`;
      this.log("identity_replaced");
      return this.status();
    },
    local_server_audit: (): LocalAudit[] => this.audit.map((e) => ({ ...e })),
    // The window at its own table (ADR 0117 D4 Q3): refused as the app
    // refuses it while the folder is not served; sitting, the window gets
    // a folder of the server's (its own key) — the harness's notes all the
    // same. The Rust tests drive the real seat.
    local_server_sit_at_table: (): FolderInfo => {
      if (!this.serving) refuse("turn serving on first, with this folder ticked");
      if (!this.ticked.has("harness")) refuse("this folder is not served: tick it to serve it");
      this.seated = true;
      this.log("seat_opened", "Vault");
      return { name: "Vault", key: "seat:harness", index: { indexed: 0, unchanged: 0, removed: 0, placeholders: 0, problems: [], unwatched: null, unindexed: null }, late_outside_changes: null };
    },
    // ADR 0117 R9: the other server of the window's table, and the move
    // there; the Rust tests (`tests_table_move.rs`) drive the real hosts.
    local_server_table_host: (): TableHost | null => this.otherHost(),
    local_server_move_table: (a): TableHost => {
      const to = this.otherHost();
      if (!to) refuse("this table has no other server to move to");
      this.moveTable(String(a["root"] ?? ""));
      return to;
    },
    // ADR 0117: the two boxes, the link, the own address, invitations.
    local_server_network: (a): LocalServerStatus => {
      if (this.serving) refuse("turn serving off to change where it serves");
      this.network = a["on"] === true;
      return this.status();
    },
    local_server_link_on: (): LocalLink => {
      if (this.link.state === "on" || this.link.state === "starting") refuse("the internet link is already on");
      const words = this.linkFailure;
      if (words !== null) {
        this.linkFailure = null;
        this.link = { ...this.link, state: "off", ended: "failed" };
        refuse(words);
      }
      if (this.ticked.size === 0) refuse("tick at least one folder to serve");
      if (this.linkOwn && !this.own) refuse("set up your own address first, or use a quick link");
      const slow = this.slow;
      if (slow !== null) {
        // As the host: starting from the click, serving not yet started.
        this.slow = null;
        this.link = { ...this.link, state: "starting", ended: null, download: { done: slow.done, total: slow.total } };
        void emit("local-server-link", { ...this.link });
        return new Promise<LocalLink>((_, reject) => {
          this.downloading = () => reject({ kind: "refused", message: "the link was stopped" } satisfies ContractError);
        }) as unknown as LocalLink;
      }
      if (!this.serving) this.dropped = [];
      this.serving = true;
      const origin = this.linkOwn && this.own ? `https://${this.own.hostname}` : "https://exemplo-de-mesa.trycloudflare.com";
      const until = this.linkOwn ? null : Math.floor(Date.now() / 1000) + 12 * 3600;
      this.link = { state: "on", origin, until, own: this.linkOwn, ended: null, protocol: "quic", qr: square(), download: null };
      this.log("link_on");
      return { ...this.link };
    },
    local_server_link_off: (): LocalLink => {
      if (this.link.state === "on") this.log("link_off");
      return this.linkOff("stopped");
    },
    local_server_link_extend: (): LocalLink => {
      if (this.link.state !== "on") refuse("the internet link is off");
      if (this.link.until === null) refuse("an own address has no ceiling");
      this.link = { ...this.link, until: Math.floor(Date.now() / 1000) + 12 * 3600 };
      return { ...this.link };
    },
    local_server_link_mode: (a): LocalServerStatus => {
      const own = a["own"] === true;
      if (own && !this.own) refuse("set up your own address first");
      this.linkOwn = own;
      return this.status();
    },
    local_server_own_address_login: (): LocalOwnLogin => {
      const already = this.signedIn;
      this.signedIn = true;
      return { signed_in: true, already, url: null, why: null };
    },
    local_server_own_address_set_up: (a): LocalServerStatus => {
      if (this.own) refuse("remove the address set up before first");
      const host = String(a["hostname"]).trim().replace(/^https?:\/\//, "").split("/")[0]!.replace(/\.$/, "").toLowerCase();
      if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(host)) refuse("an address in lower case, of at least two parts, like mesa.example.com");
      if (!this.signedIn) refuse("sign in to Cloudflare first");
      if (host.startsWith("ocupado.")) refuse(`${host} already has another DNS record at Cloudflare: choose another address, or remove that record in Cloudflare's dashboard`);
      this.own = { hostname: host };
      this.linkOwn = true;
      return this.status();
    },
    local_server_own_address_remove: (a): LocalServerStatus => {
      if (this.link.own && this.link.state === "on") this.linkOff("stopped");
      // Forgotten on this computer alone, or deleted at Cloudflare too.
      this.log(a["hereOnly"] === true ? "own_address_forgotten" : "own_address_removed", this.own?.hostname ?? null);
      this.own = null;
      this.linkOwn = false;
      return this.status();
    },
    local_server_invitations: (): LocalInvitation[] => this.invites.map((i) => ({ ...i })),
    local_server_invitation_revoke: (a): null => {
      const inv = this.invites.find((i) => i.id === String(a["id"]));
      if (!inv || inv.state !== "pending") refuse("that invitation is used, ended or not there");
      inv.state = "ended";
      this.log("invitation_ended", inv.id);
      return null;
    },
    // S7c: the desktop apps of other people, and the read links' switch.
    local_server_devices: (): LocalDevice[] => this.devices.map((d) => ({ ...d })),
    local_server_end_device: (a): null => {
      const at = this.devices.findIndex((d) => d.id === String(a["id"]));
      if (at < 0) refuse("that app is not signed in here");
      this.log("device_ended", this.devices[at]?.device ?? null);
      this.devices.splice(at, 1);
      return null;
    },
    // ADR 0117 D9: the people invited.
    local_server_accounts: (): LocalPlayer[] => this.players.map((p) => ({ ...p, reaches: p.reaches.map((r) => ({ ...r })) })),
    local_server_account_reset: (a): LocalReset => {
      const p = this.player(String(a["id"]));
      if (!this.serving) refuse("turn serving on first");
      p.last_seen = null;
      this.log("reset_link", p.email);
      const base = this.link.state === "on" && this.link.origin ? this.link.origin : "https://192.168.1.20:51234";
      return { link: `${base}/reset/senha-${p.id}-${this.nextId++}`, expires: Math.floor(Date.UTC(2026, 10, 5) / 1000) };
    },
    local_server_account_end_sessions: (a): null => {
      const p = this.player(String(a["id"]));
      p.last_seen = null;
      this.devices = this.devices.filter((d) => d.email !== p.email);
      this.log("account_sessions_ended", p.email);
      return null;
    },
    local_server_account_remove: (a): null => {
      const p = this.player(String(a["id"]));
      this.players = this.players.filter((x) => x.id !== p.id);
      this.devices = this.devices.filter((d) => d.email !== p.email);
      this.log("account_deleted", p.email);
      return null;
    },
    local_server_owner_name: (a): LocalServerStatus => {
      const name = String(a["name"] ?? "").trim();
      if (!name) refuse("a name for the players");
      if ([...name].length > 200) refuse("a name of 200 characters at most");
      this.ownerName = name;
      return this.status();
    },
    local_server_read_links: (a): LocalServerStatus => {
      this.readLinks = a["on"] === true;
      this.log(this.readLinks ? "read_links_on" : "read_links_off");
      return this.status();
    },
  };

  /** An invitation made at the folder's page (a test's): a table's
   *  `campaign_invite` or a share's, as the server then lists it. */
  addInvitation(folder: string | null = null, role: "reader" | "editor" | null = null): string {
    const id = `i${this.nextInvite++}`;
    const created = Math.floor(Date.UTC(2026, 10, 4) / 1000);
    this.invites.unshift({ id, folder, role: folder ? role ?? "reader" : null, created, expires: created + 7 * 24 * 3600, state: "pending", used_by: null });
    this.log("invitation_created", id);
    return id;
  }

  /** An invitation was accepted by a player (a test's): their account. */
  acceptInvitation(id: string, name = "Bia"): void {
    const inv = this.invites.find((i) => i.id === id);
    if (!inv) return;
    Object.assign(inv, { state: "used", used_by: name });
    this.addPlayer(name, `${name.toLowerCase()}@casa.example`, inv.folder && inv.role ? [{ name: inv.folder, role: inv.role }] : []);
  }

  /** The person a command names, as the server refuses one it has not. */
  private player(id: string): LocalPlayer {
    const p = this.players.find((x) => x.id === id);
    if (!p) refuse("that person has no account here");
    return p;
  }
}

/** The arguments the harness answers read, for the harness's own check
 *  that no handler reads an argument the core renamed. */
export const LOCAL_UNUSED: Record<string, string[]> = {};
