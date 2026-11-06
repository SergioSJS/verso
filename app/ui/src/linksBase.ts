// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { LocalServerStatus } from "./bindings";

/** This computer's address an invitation opens at, as its server picks it
 *  (`Policy::links_base`): the internet link's origin while it is on, else
 *  the network's address; none with neither. */
export function linksBase(s: Pick<LocalServerStatus, "serving" | "network" | "addresses" | "port" | "link">): string | null {
  if (s.link.state === "on" && s.link.origin) return s.link.origin;
  const a = s.addresses[0];
  if (!s.serving || !s.network || !a || s.port === null) return null;
  return `https://${a.includes(":") ? `[${a}]` : a}:${s.port}`;
}
