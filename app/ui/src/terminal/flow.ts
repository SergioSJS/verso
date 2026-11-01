// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Flow control (ADR 0115 item 8): the shell's output is written to the
// terminal in the chunks the host sends, each with the terminal's write
// callback; when what is written and not yet drawn passes a high mark the
// host is told the window is behind, and its reader waits; below a low mark
// it is told again. An agent printing a megabyte of logs stalls the shell
// for a moment, not the window. No imports: the node tests read it.

export const HIGH = 512 * 1024;
export const LOW = 64 * 1024;

export class Flow {
  private pending = 0;
  private behind = false;
  constructor(
    private readonly write: (text: string, done: () => void) => void,
    private readonly signal: (behind: boolean) => void,
    private readonly high = HIGH,
    private readonly low = LOW,
  ) {}
  /** A chunk from the host. */
  push(text: string): void {
    if (text.length === 0) return;
    this.pending += text.length;
    this.write(text, () => {
      this.pending -= text.length;
      if (this.behind && this.pending <= this.low) {
        this.behind = false;
        this.signal(false);
      }
    });
    if (!this.behind && this.pending > this.high) {
      this.behind = true;
      this.signal(true);
    }
  }
  /** What is written and not yet drawn, in characters. */
  get waiting(): number {
    return this.pending;
  }
  get isBehind(): boolean {
    return this.behind;
  }
}
