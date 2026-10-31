// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { DiceRoll } from "../bindings";

/** A single die of `sides` showing `value`, as a roll the 3D stage can throw. */
export function oracleRoll(sides: number, value: number): DiceRoll {
  return {
    notation: `1d${sides}`,
    source: null,
    terms: [{ sign: 1, sides, fudge: false, kept: [value], dropped: [] }],
    modifier: 0,
    total: value,
    by: "",
    at: new Date().toISOString(),
  };
}
