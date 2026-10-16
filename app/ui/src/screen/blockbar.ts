// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the keys' bar asks of a note's blocks (ADR 0076 item 7, decided
// 2026-10-16; ADR 0061). The bar is the window's, the blocks are the
// note's: a note offers its commands through this facet, and the bar calls
// the same ones the desktop's handle, `+` and block menu call — nothing is
// done twice. A menu opens at a point of the screen the bar chooses.

import { Facet } from "@codemirror/state";

export type BlockBar = {
  /** Blocks can be edited here: Edit mode, a note that takes writing. */
  active: () => boolean;
  /** A block below the one at the cursor, with the `/` menu open on it. */
  plus: () => void;
  /** The "Turn into" menu of the block at the cursor. */
  turn: (x: number, y: number) => void;
  /** The block's menu (duplicate, copy link, delete…). */
  menu: (x: number, y: number) => void;
  /** The block one place up (-1) or down (1); the cursor goes with it. */
  move: (dir: -1 | 1) => void;
  /** The block removed. */
  remove: () => void;
};

export const blockBar = Facet.define<BlockBar, BlockBar | null>({ combine: (values) => values[0] ?? null });
