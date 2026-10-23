// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Bring the table's panel on screen: the right area open on its Mesa tab
// (what a "Mesa" notification's action does).

import { rightShown, toggleRight } from "../chrome";
import { panel } from "../main";
import { tableOn } from "./record";

export function showTable(): void {
  if (!tableOn()) return;
  if (!rightShown()) toggleRight();
  panel.current = "table";
  panel.refresh();
}
