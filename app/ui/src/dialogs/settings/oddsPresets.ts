// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The odds a person can start from (ADR 0102): six faces per likelihood,
// each row adding up to 100.

import type { Likelihood } from "../../oracle/engine";

export type OddsRow = [number, number, number, number, number, number];
export type OddsData = Record<Likelihood, OddsRow>;

export const ODDS_PRESETS: { id: "mythic" | "ironsworn" | "balanced" | "narrative"; data: OddsData }[] = [
  {
    id: "mythic",
    data: {
      nearlyCertain: [18, 54, 18, 5, 4, 1],
      likely: [15, 45, 15, 10, 12, 3],
      even: [10, 30, 10, 10, 30, 10],
      unlikely: [3, 12, 10, 15, 45, 15],
      nearlyImpossible: [1, 4, 5, 18, 54, 18],
    },
  },
  {
    id: "ironsworn",
    data: {
      nearlyCertain: [10, 80, 0, 0, 8, 2],
      likely: [8, 67, 0, 0, 20, 5],
      even: [5, 45, 0, 0, 45, 5],
      unlikely: [2, 23, 0, 0, 67, 8],
      nearlyImpossible: [1, 9, 0, 0, 80, 10],
    },
  },
  {
    id: "balanced",
    data: {
      nearlyCertain: [15, 60, 10, 5, 8, 2],
      likely: [12, 48, 15, 8, 14, 3],
      even: [10, 35, 10, 10, 30, 5],
      unlikely: [3, 14, 8, 15, 48, 12],
      nearlyImpossible: [2, 8, 5, 10, 60, 15],
    },
  },
  {
    id: "narrative",
    data: {
      nearlyCertain: [10, 40, 35, 8, 5, 2],
      likely: [8, 32, 30, 15, 12, 3],
      even: [5, 25, 25, 20, 20, 5],
      unlikely: [3, 12, 15, 30, 32, 8],
      nearlyImpossible: [2, 5, 8, 35, 40, 10],
    },
  },
];
