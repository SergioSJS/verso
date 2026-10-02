// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What the window sends a card entered on the board when Edit › Undo or
 *  Redo comes while no editor has the keyboard; cancelled when the card
 *  takes it. Its own module: the window has it without loading the board. */
export const CARD_COMMAND = "verso-card-command";
