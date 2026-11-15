// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words for a table made in a folder whose boards a share's windows are
// live on (ADR 0081 item 11, V.49): those windows join again as players.
// Pure, in both languages; `pt` says which.

/** What the window of a share says when the table was made: it joins the
 *  board again as a player. */
export function tableMadeText(pt: boolean): string {
  return pt ? "A mesa foi criada nesta pasta: você agora está no board como jogador." : "A table was made in this folder: you are now on the board as a player.";
}

/** What the owner is told when making the table: how many were live on
 *  boards through shares, and now rejoin as players. */
export function rejoinedText(pt: boolean, n: number): string {
  if (pt) return n === 1 ? "1 pessoa estava num board desta pasta por um compartilhamento e agora volta a ele como jogadora." : `${n} pessoas estavam em boards desta pasta por compartilhamentos e agora voltam a eles como jogadoras.`;
  return n === 1 ? "1 person was on a board of this folder through a share and now rejoins it as a player." : `${n} people were on boards of this folder through shares and now rejoin them as players.`;
}
