// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio (ADR 0116 section B) in the harness. The sharer's side is the
// desktop host's: it lists the sources a test sets (`sources`, one test
// application by default; an empty list is a host whose capture is not built
// yet), starts a capture that succeeds (or refuses, `captureFails`), and
// reports a level ten times a second (`level`, the test's peak). The
// server's part of a start is played as it does it: `table_share_start`
// answers the game master only, `exists` when a share is live and no
// `replace` came, and tells every window. The listener's side is played as the server does it
// (`audio_relay.rs`, `table_share.rs`): a test starts a share as the game
// master (`masterShares`), and the window at the table hears of it on its
// join and by `table-share-started`; it asks with `table_share_listen` and
// is sent the last two seconds, then each frame a test sends (`send`) —
// on the channel it gave `audio_share_hear`, as the desktop's host hands
// them. `behind` and `masterStops` are the server's other two events.

import { emit } from "@tauri-apps/api/event";
import type { AudioShare, AudioSource, ContractError } from "../bindings";
import type { Core } from "./core";
import type { Table } from "./table";

function refuse(message: string): never {
  const e: ContractError = { kind: "refused", message };
  throw e;
}

type Sink = { onmessage: (bytes: ArrayBuffer) => void };

/** The server's ring: two seconds of 20 ms frames. */
const RING = 100;

export class AudioShareHarness {
  /** The table's live share, if a test started one. */
  share: AudioShare | null = null;
  /** Whether the window asked for the frames (and was not told behind since). */
  listening = false;
  /** Every `table_share_listen` the window sent. */
  readonly asked: boolean[] = [];
  /** What the host lists as capturable. */
  sources: AudioSource[] = [{ id: "test:spotify", name: "Spotify", kind: "app" }];
  /** Every `audio_share_start` the host accepted, and every `table_share_start` the server answered. */
  readonly captures: { id: string; kbps: number; share: number }[] = [];
  readonly starts: { name: string; kind: string; bitrate_kbps: number; replace: boolean }[] = [];
  /** Set to make the next capture refuse with this message. */
  captureFails: string | null = null;
  /** The peak the running capture reports, 0 to 1 (0: a source that captures nothing). */
  level = 0.35;
  /** The listeners and the rate the server reports to the sharer. */
  listeners = 2;
  private meter: ReturnType<typeof setInterval> | null = null;
  private sink: Sink | null = null;
  private ring: Uint8Array[] = [];
  private next = 0x8000_0001;

  constructor(
    core: Core,
    private readonly table: Table | null,
  ) {
    const h = core.handlers;
    h["audio_sources_list"] = () => this.sources;
    h["audio_share_start"] = (a) => {
      if (this.captureFails) return refuse(this.captureFails);
      const source = this.sources.find((s) => s.id === a["id"]);
      if (!source) return refuse("no such source to share");
      this.captures.push({ id: String(a["id"]), kbps: Number(a["bitrateKbps"]), share: Number(a["share"]) });
      this.stopMeter();
      this.meter = setInterval(() => void emit("audio-share-level", this.level), 100);
      return { source, bitrate_kbps: Number(a["bitrateKbps"]), sample_rate: 48000, channels: 2, frame_ms: 20 };
    };
    // The Mac routes the window's own sounds to the host; the harness is no Mac.
    h["audio_share_own_begin"] = () => false;
    h["audio_share_own_end"] = () => null;
    h["audio_share_own_pcm"] = () => null;
    h["audio_share_stop"] = () => {
      this.stopMeter();
      return null;
    };
    h["audio_share_hear"] = (a) => {
      this.sink = (a["frames"] as Sink | undefined) ?? null;
      return null;
    };
    h["table_share_start"] = (a) => {
      const wish = a["share"] as { name: string; kind: AudioShare["kind"]; bitrate_kbps: number; replace?: boolean };
      if (!this.table) return refuse("the table is a server's; a folder of this computer alone has none");
      const root = this.table.at(a["table"]);
      if (this.table.role !== "owner") return refuse("only the game master shares audio at the table");
      this.starts.push({ name: wish.name, kind: wish.kind, bitrate_kbps: wish.bitrate_kbps, replace: wish.replace === true });
      if (this.share && !wish.replace) {
        const e: ContractError = { kind: "exists", message: "the table shares audio already: replace it?" };
        throw e;
      }
      if (this.share) this.masterStops("replaced");
      const share: AudioShare = { table: root, id: this.next++, name: wish.name, kind: wish.kind, by: "Você", by_id: "acc-self", started_ms: Date.now(), bitrate_kbps: wish.bitrate_kbps, listeners: null, rate_bps: null };
      this.share = share;
      this.ring = [];
      this.listening = false;
      void emit("table-share-started", share);
      // The sharer alone is told how many hear it, and at what rate.
      void emit("table-share-state", { ...share, listeners: this.listeners, rate_bps: wish.bitrate_kbps * 1000 });
      return share;
    };
    h["table_share_stop"] = (a) => {
      this.table?.at(a["table"]);
      this.stopMeter();
      if (this.share) this.masterStops("stopped");
      return null;
    };
    h["table_share_listen"] = (a) => {
      if (!this.table) return refuse("the table is a server's; a folder of this computer alone has none");
      this.table.at(a["table"]);
      const on = a["listen"] === true;
      this.asked.push(on);
      const was = this.listening;
      this.listening = on;
      // A late listener gets the ring first.
      if (on && !was && this.share) for (const f of this.ring) this.deliver(f);
      return null;
    };
    if (table) {
      const before = table.joinExtra;
      table.joinExtra = (root) => ({ ...before(root), broadcast: table.role === "owner", share: this.share && this.share.table === root ? this.share : null });
    }
  }

  /** The game master starts sharing `name` at the table (`table`: the folder's default). */
  masterShares(opts: { name?: string; table?: string; by?: string } = {}): AudioShare {
    const table = opts.table ?? this.table?.defaultRoot() ?? "";
    this.share = { table, id: this.next++, name: opts.name ?? "Spotify", kind: "app", by: opts.by ?? "Mestre", by_id: "acc-mestre", started_ms: Date.now(), bitrate_kbps: 96, listeners: null, rate_bps: null };
    this.ring = [];
    void emit("table-share-started", this.share);
    return this.share;
  }

  /** The sharer's frames reach the server: kept in the ring, sent to the window if it listens. */
  send(frames: Uint8Array[]): number {
    let sent = 0;
    for (const f of frames) {
      this.ring.push(f);
      if (this.ring.length > RING) this.ring.shift();
      if (this.listening && this.share) {
        this.deliver(f);
        sent++;
      }
    }
    return sent;
  }

  /** The window fell ten seconds behind: told, and sent nothing until it asks again. */
  behind(): void {
    if (!this.share) return;
    this.listening = false;
    void emit("table-share-behind", { table: this.share.table, id: this.share.id });
  }

  /** The share ends. */
  masterStops(reason: "stopped" | "sharer_left" | "table_empty" | "replaced" = "stopped"): void {
    if (!this.share) return;
    const { table, id } = this.share;
    this.share = null;
    this.ring = [];
    void emit("table-share-stopped", { table, id, reason });
  }

  private stopMeter(): void {
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
  }

  private deliver(f: Uint8Array): void {
    this.sink?.onmessage(f.slice().buffer);
  }
}

/** The harness's share: the server's part played on `table` (none: a server's window, which this harness does not play). */
export function installAudioShare(core: Core, table: Table | null = null): AudioShareHarness {
  return new AudioShareHarness(core, table);
}
