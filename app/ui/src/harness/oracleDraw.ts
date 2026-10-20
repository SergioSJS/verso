// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's oracle draw, played in the page (ADR 0102 item 5): the
// room's `collab_oracle` of `crates/verso-server/src/collab_oracle.rs`, with
// the same checks and the same reading of a d100 against an odds row.

import type { ContractError, OracleAsk, OracleDraw } from "../bindings";
import { cryptoRandomSource, rollDie } from "../dice/rolai/rng";
import type { RandomSource } from "../dice/rolai/types";

function refused(message: string): never {
  const e: ContractError = { kind: "refused", message };
  throw e;
}

const words = (l: string[]): boolean => l.length >= 1 && l.length <= 200 && l.every((w) => w.trim() !== "" && [...w].length <= 60);

/** `ask` drawn for `by` at `at`; refused as the server refuses. */
export function oracleDrawHere(ask: OracleAsk, by: string, at: string, rand: RandomSource = cryptoRandomSource): OracleDraw {
  const stamp = (kind: string, roll: number, answer: number | null, w: string[]): OracleDraw => ({ kind, roll, answer, words: w, by, at });
  if (ask.kind === "question") {
    if (ask.odds.length !== 6 || ask.odds.reduce((a, n) => a + n, 0) !== 100) refused("odds are six numbers adding to 100");
    const roll = rollDie(100, rand);
    let up = 0;
    let answer = 5;
    for (let i = 0; i < 6; i++) {
      up += ask.odds[i]!;
      if (roll <= up) {
        answer = i;
        break;
      }
    }
    return stamp("question", roll, answer, []);
  }
  if (ask.kind === "spark") {
    const lists = [ask.lists.action, ask.lists.theme, ask.lists.descriptor, ask.lists.focus];
    if (!lists.every(words)) refused("a list of 1 to 200 words of 60 characters");
    return stamp("spark", 0, null, lists.map((l) => l[rollDie(l.length, rand) - 1]!));
  }
  if (ask.kind !== "table") refused("not an oracle draw");
  const e = ask.entries;
  if (e.length < 1 || e.length > 500 || !e.every((x) => x.trim() !== "" && [...x].length <= 300)) refused("a table of 1 to 500 entries");
  const at1 = rollDie(e.length, rand);
  return stamp("table", at1, null, [e[at1 - 1]!]);
}
