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

import type { ContractError, LocalAudit, LocalFolder, LocalPairState, LocalPairing, LocalPhone, LocalServerStatus } from "../bindings";

type Args = Record<string, unknown>;

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
  private asked: { device: string; address: string; asked: string } | null = null;
  private nextId = 1;
  private cert: Pick<LocalServerStatus, "cert_file" | "key_file" | "host_name"> = { cert_file: null, key_file: null, host_name: null };
  private ticked = new Set<string>();
  /** The folders chosen inside a ticked folder (ADR 0096 item 2, amended 2026-10-16). */
  private parts = new Map<string, string[]>();
  /** The chosen folders the last start left out ("Antigo" is a folder the harness's disk has lost). */
  private dropped: string[] = [];
  /** Folders the harness knows, one of them syncing with a server. */
  private folders: LocalFolder[] = [
    { key: "harness", name: "Vault", place: "", ticked: false, parts: [], missing: [], attachments: null, syncs_with: null },
    { key: "synced", name: "Compartilhada", place: "", ticked: false, parts: [], missing: [], attachments: null, syncs_with: "notas.exemplo" },
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
    ].map(([name, place], i) => ({ key: `many-${i}`, name: name!, place: place!, ticked: false, parts: [], missing: [], attachments: null, syncs_with: null })),
  ];
  private maxConnected = 4;
  private fingerprint = "AB:CD:EF:01:23:45:67:89";
  /** The identity's generation: replaced, the fingerprint changes. */
  private generation = 1;

  private rows(): LocalFolder[] {
    return this.folders.map((f) => {
      const parts = this.parts.get(f.key) ?? [];
      const gone = this.serving || this.dropped.length > 0 ? parts.filter((p) => this.dropped.includes(`${f.name}/${p}`)) : [];
      // The vault's setting names "Anexos": it goes along unless it is, or holds, a chosen folder.
      const attach = f.key === "harness" && parts.length > 0 && !parts.some((p) => p === "Anexos" || p.startsWith("Anexos/")) ? "Anexos" : null;
      return { ...f, ticked: this.ticked.has(f.key), parts, missing: gone, attachments: attach };
    });
  }

  private log(action: string, subject: string | null = null, address: string | null = null): void {
    this.audit.unshift({ at: Math.floor(Date.UTC(2026, 9, 15) / 1000) + this.audit.length, action, subject, address });
  }

  private status(): LocalServerStatus {
    return {
      supported: true,
      serving: this.serving,
      port: this.serving ? 51234 : null,
      addresses: this.serving ? ["192.168.1.20"] : [],
      phones_paired: this.paired.length,
      phones_connected: this.serving ? Math.min(this.paired.length, this.maxConnected) : 0,
      max_connected: this.maxConnected,
      pairing_open: this.open,
      fingerprint: this.serving ? this.fingerprint : null,
      certificate: this.cert.cert_file ? "files" : "own",
      tailscale: false,
      stopped_because: null,
      unreachable: false,
      keep_on: this.keepOn,
      dropped: this.dropped,
      ...this.cert,
    };
  }

  /** A phone presents the token: the dialog is asked "Was it you?". */
  askAsPhone(device = "iPhone de teste"): void {
    if (!this.open) throw new Error("no pairing window is open");
    this.asked = { device, address: "192.168.1.77", asked: "2026-10-15T10:00:00Z" };
    this.log("pair_asked", device, "192.168.1.77");
  }

  readonly handlers: Record<string, (a: Args) => unknown> = {
    local_server_status: (): LocalServerStatus => this.status(),
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
      if (this.serving) refuse("turn serving off to change which folders are served");
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
      if (this.serving) refuse("turn serving off to change which folders are served");
      if (!this.ticked.has(key)) refuse("tick the folder first");
      this.parts.delete(key);
      this.dropped = [];
      return this.rows();
    },
    local_server_tick: (a): LocalFolder[] => {
      const key = String(a["key"]);
      const folder = this.folders.find((f) => f.key === key);
      if (this.serving) refuse("turn serving off to change which folders are served");
      if (!folder) refuse("this computer does not know that folder");
      if (a["ticked"] === true && folder.syncs_with) refuse(`this folder also syncs with ${folder.syncs_with}: open that address on the phone instead`);
      // As the host: unticking forgets what was chosen inside a folder;
      // ticking it again while it is ticked changes nothing.
      if (a["ticked"] === true) this.ticked.add(key);
      else {
        this.ticked.delete(key);
        this.parts.delete(key);
        this.dropped = [];
      }
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
    local_server_start: (): LocalServerStatus => {
      if (this.ticked.size === 0) refuse("tick at least one folder to serve");
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
      this.log("local_on", "1 address(es), port 51234");
      return this.status();
    },
    local_server_stop: (): LocalServerStatus => {
      if (this.serving) this.log("local_off");
      this.serving = false;
      this.open = false;
      this.asked = null;
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
      this.open = true;
      this.asked = null;
      this.log("pair_open");
      // A small square with the finder pattern in the corner is enough for
      // the window to draw; the Rust tests check the real encoding.
      const n = 29 + 8;
      const rows = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (x >= 4 && y >= 4 && x < n - 4 && y < n - 4 && ((x * 7 + y * 3) % 5 < 2 || (x < 11 && y < 11)) ? "1" : "0")).join(""));
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
      this.serving = false;
      this.paired = [];
      this.generation += 1;
      this.fingerprint = `AB:CD:EF:01:23:45:67:${String(80 + this.generation)}`;
      this.log("identity_replaced");
      return this.status();
    },
    local_server_audit: (): LocalAudit[] => this.audit.map((e) => ({ ...e })),
    // The window at its own table (ADR 0117 D4 Q3): refused as the app
    // refuses it while the folder is not served; the harness has no server
    // a window sits at — the Rust tests drive the real seat.
    local_server_sit_at_table: (): never => {
      if (!this.serving) refuse("turn serving on first, with this folder ticked");
      if (!this.ticked.has("harness")) refuse("this folder is not served: tick it to serve it");
      refuse("the harness has no server to sit at");
    },
  };
}

/** The arguments the harness answers read, for the harness's own check
 *  that no handler reads an argument the core renamed. */
export const LOCAL_UNUSED: Record<string, string[]> = {};
