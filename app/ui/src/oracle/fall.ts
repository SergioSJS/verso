// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle's dice fall in 3D like any roll (ADR 0102, ADR 0101): the
 *  number is drawn first (here, or by the room's server), then the die that
 *  shows it falls, and the answer is shown when it rests. */

import { play3d, will3d } from "../dice3d";
import { oracleRoll } from "./roll";

/** Let the die show `value` on `sides` fall, when the 3D switch is on; resolves
 *  when the dice have rested (at once when there is no fall). Never rejects. */
export async function fallOf(sides: number, value: number): Promise<void> {
  if (!Number.isInteger(sides) || !Number.isInteger(value) || value < 1 || value > sides) return;
  const roll = oracleRoll(sides, value);
  if (!will3d("", roll)) return;
  await play3d("", roll).catch(() => undefined);
}
