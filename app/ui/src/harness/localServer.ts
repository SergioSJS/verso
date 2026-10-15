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
  /** Folders the harness knows, one of them syncing with a server. */
  private folders: LocalFolder[] = [
    { key: "harness", name: "Vault", ticked: false, syncs_with: null },
    { key: "synced", name: "Compartilhada", ticked: false, syncs_with: "notas.exemplo" },
  ];
  private fingerprint = "AB:CD:EF:01:23:45:67:89";
  /** The identity's generation: replaced, the fingerprint changes. */
  private generation = 1;

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
      phones_connected: this.serving ? Math.min(this.paired.length, 2) : 0,
      pairing_open: this.open,
      fingerprint: this.serving ? this.fingerprint : null,
      certificate: this.cert.cert_file ? "files" : "own",
      tailscale: false,
      stopped_because: null,
      unreachable: false,
      keep_on: this.keepOn,
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
    local_server_folders: (): LocalFolder[] => this.folders.map((f) => ({ ...f, ticked: this.ticked.has(f.key) })),
    local_server_tick: (a): LocalFolder[] => {
      const key = String(a["key"]);
      const folder = this.folders.find((f) => f.key === key);
      if (this.serving) refuse("turn serving off to change which folders are served");
      if (!folder) refuse("this computer does not know that folder");
      if (a["ticked"] === true && folder.syncs_with) refuse(`this folder also syncs with ${folder.syncs_with}: open that address on the phone instead`);
      if (a["ticked"] === true) this.ticked.add(key);
      else this.ticked.delete(key);
      return this.folders.map((f) => ({ ...f, ticked: this.ticked.has(f.key) }));
    },
    local_server_settings: (a): LocalServerStatus => {
      this.keepOn = a["keepOn"] === true;
      this.cert = { cert_file: (a["certFile"] as string | null) || null, key_file: (a["keyFile"] as string | null) || null, host_name: (a["hostName"] as string | null) || null };
      return this.status();
    },
    local_server_start: (): LocalServerStatus => {
      if (this.ticked.size === 0) refuse("tick at least one folder to serve");
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
  };
}

/** The arguments the harness answers read, for the harness's own check
 *  that no handler reads an argument the core renamed. */
export const LOCAL_UNUSED: Record<string, string[]> = {};
