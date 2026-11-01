// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio, the sharer's window (ADR 0116 section B, item 19): start the
// host's capture and encoder under the share number the server gave. The
// host frames each Opus packet and sends it to the server on this window's
// own connection (a frame never crosses into the web view), so the window
// only orders it: it starts the share on the server first
// (`table_share_start`), hands the host the number, and stops both when
// asked. No button draws this yet (the share UI is a later task).

import { type AudioCaptureStarted, type ContractError, commands } from "../../bindings";

/** A capture in progress in this window. */
export interface Capture {
  started: AudioCaptureStarted;
  /** Stop the host's capture (the server's share is stopped with `table_share_stop`). */
  stop: () => Promise<void>;
}

/**
 * Ask the host to capture `id` and encode it at `bitrateKbps`, sending its frames under `share`, the number of the
 * server's answer to `table_share_start`. Throws the host's `ContractError` (refused where this window cannot share
 * audio or has no server connection, for an unknown source or a number the server does not give).
 */
export async function startCapture(id: string, bitrateKbps: number, share: number): Promise<Capture> {
  const r = await commands.audioShareStart(id, bitrateKbps, share);
  if (r.status === "error") throw r.error as ContractError;
  return {
    started: r.data,
    stop: async () => {
      await commands.audioShareStop();
    },
  };
}
