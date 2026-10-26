// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle opened from the palette or the `/` menu: it writes at the
 *  caret of the note in focus. Kept apart from the dialog so the dialog does
 *  not import the layout (and, through it, every leaf). */

import { layout } from "../layout/spaces";
import { showOracleDialog } from "./dialog";
import { isOracleHost } from "./host";

export function askOracleInActiveNote(): void {
  const leaf = layout().activeLeaf;
  showOracleDialog("", { host: isOracleHost(leaf) ? leaf : null });
}
