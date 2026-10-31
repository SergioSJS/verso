// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The roll blocks of a rendered note (Reading, an embed, a board's text
// card) drawn as cards, in place of their code (ADR 0107, "As built"
// 2026-10-22). A block that does not read stays the plain code it is.

import { rollCardOf, type RollHost } from "./card";
import { isRollCode } from "./format";

/** `from`: the note the blocks stand in (their links are read from it). */
export function wireRollBlocks(root: ParentNode, from: string, host: RollHost): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    if (!isRollCode(code)) continue;
    const pre = code.parentElement;
    if (!pre || pre.dataset["rollRendered"]) continue;
    const card = rollCardOf(code.textContent ?? "", from, host);
    if (!card) continue;
    card.dataset["rollRendered"] = "true";
    pre.replaceWith(card);
  }
}
