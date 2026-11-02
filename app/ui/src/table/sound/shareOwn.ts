// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window's own sounds while it shares audio on a Mac (ADR 0116, the 2026-11-02 note on decision A2): the host says
// whether this system needs it (`audio_share_own_begin`: a Mac), and then the window's final mix goes to the host as
// PCM (`dice3d/ownOutput.ts`) until the share ends. Anywhere else this does nothing.

import { invoke } from "@tauri-apps/api/core";
import { commands } from "../../bindings";
import { audioContext } from "../../dice3d/audio";
import { type OwnRoute, routeOwn } from "../../dice3d/ownOutput";
import { addWorklet } from "./workletModule";

/** The host's side of the route: the module is the share worklet; a block goes over the IPC as raw bytes. */
export const hostRoute: OwnRoute = {
  load: addWorklet,
  send: (block) => void invoke("audio_share_own_pcm", block).catch(() => undefined),
};

/**
 * Before the capture starts: ask the host, and when it wants the window's sounds, route them. Resolves true when
 * routed, false where nothing is needed. Throws a `ContractError`-shaped value when the host cannot play them, so no
 * share starts with the window's sounds in it.
 */
export async function beginOwn(route: OwnRoute = hostRoute): Promise<boolean> {
  const r = await commands.audioShareOwnBegin();
  if (r.status === "error") throw r.error;
  if (!r.data) return false;
  try {
    await routeOwn(route, [audioContext()]);
  } catch (e) {
    await commands.audioShareOwnEnd().catch(() => null);
    throw { kind: "unavailable", message: e instanceof Error ? e.message : String(e) };
  }
  return true;
}

/** The share is over: the window's sounds go back to its own output, and the host closes its. */
export async function endOwn(): Promise<void> {
  await routeOwn(null).catch(() => undefined);
  await commands.audioShareOwnEnd().catch(() => null);
}
