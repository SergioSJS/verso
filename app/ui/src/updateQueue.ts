// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A room's updates as a window sends them: one at a time (ADR 0083 item
// 14). The server takes a window's updates in the order they reach it and
// refuses one that depends on an earlier one not there yet, so a window
// sends one update and waits for its answer; what is typed meanwhile is
// merged into one update and sent when the answer comes. The browser's
// one WebSocket and the desktop's connection keep the order of the calls
// already (`web/bridge.ts`, `remote.rs`); this keeps it whatever carries
// them, at one update in flight per room and round trip.

import * as Y from "yjs";

/** What the server answered an update: taken, the link down (the rejoin
 *  sends the whole state), or refused. */
export type Sent = "ok" | "unavailable" | "refused";

export class UpdateQueue {
  private waiting: Uint8Array[] = [];
  private busy = false;

  constructor(
    /** One update to the room: its answer. */
    private readonly send: (update: Uint8Array) => Promise<Sent>,
    /** The room refused one: what waited goes nowhere. */
    private readonly refused: () => void,
    /** Whether the session still sends. */
    private readonly alive: () => boolean = () => true,
    /** Everything sent has been answered: nothing waits, nothing is in flight. */
    private readonly idle: () => void = () => {},
  ) {}

  /** An update to send after those before it. */
  push(update: Uint8Array): void {
    this.waiting.push(update);
    if (!this.busy) void this.drain();
  }

  private async drain(): Promise<void> {
    this.busy = true;
    try {
      while (this.waiting.length > 0 && this.alive()) {
        const batch = this.waiting.length === 1 ? this.waiting[0]! : Y.mergeUpdates(this.waiting);
        this.waiting = [];
        const r = await this.send(batch).catch((): Sent => "unavailable");
        if (r === "refused") {
          this.waiting = [];
          this.refused();
          return;
        }
      }
    } finally {
      this.busy = false;
    }
    if (this.waiting.length === 0 && this.alive()) this.idle();
  }
}
