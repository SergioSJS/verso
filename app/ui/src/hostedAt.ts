// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a table is hosted, said in its dialog before *Gerar link* (the
// maintainer, 2026-11-05: a table made in a window on a UniVerso gave a
// 192.168.3.150 link and he did not know why). ADR 0117 D4.1: the host is
// the window where the table is made — this computer's own server when the
// window sits at it, else the server the window is on. The address is the
// one the invitation will carry: this computer's internet link while it is
// on, else its address on the network (`Policy::links_base`).

import { commands } from "./bindings";
import { linksBase } from "./linksBase";
import { cp } from "./campaignStrings";
import { isSeated } from "./seatState";

/** The line, or null when the window is on no server (a folder of this
 *  computer alone has no table to host). */
export async function hostedAt(): Promise<string | null> {
  if (isSeated()) {
    const r = await commands.localServerStatus();
    const at = r.status === "ok" ? linksBase(r.data) : null;
    return at ? cp.hostedHere(at) : cp.hostedHereNowhere;
  }
  const w = await commands.windowServer();
  if (w.status !== "ok" || !w.data) return null;
  try {
    return cp.hostedOn(new URL(w.data.url).host);
  } catch {
    return cp.hostedOn(w.data.url);
  }
}
