// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The layout editor (ADR 0099 item 8) is being rebuilt — the block tree on
// one side and the card on the other, options in place, moves by drag or by
// keys, undo — over the model of model.ts and the store of store.ts. Until
// it lands, opening it says so, and how to change a layout meanwhile.

import { tell } from "../dialog";
import type { StoredLayout } from "./store";
import { S } from "./strings";

/** Open the editor on a layout (or on a new one). */
export function openLayoutBuilder(_layout?: StoredLayout, _onDone?: () => void): void {
  void tell(S.page.editorComing, S.page.ok);
}
