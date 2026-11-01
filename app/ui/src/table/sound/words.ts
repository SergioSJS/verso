// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A refusal of the table's music in the person's language (ADR 0035): the
// server answers in English for its log; the window never shows that
// sentence, it says what it means.

import type { ContractError } from "../../bindings";
import { errorSentence } from "../../errors";
import { paceWait } from "../send";
import { tt } from "../strings";
import { st } from "./strings";

/** What the window says of a refusal or failure of a music command. */
export function soundError(e: ContractError): string {
  if (e.kind !== "refused") return errorSentence(e);
  const m = e.message;
  const wait = paceWait(m);
  if (wait !== null) return tt.slowDown(wait);
  if (m.includes("only the game master")) return st.onlyMaster;
  if (m.includes("changed meanwhile")) return st.changedMeanwhile;
  if (m.includes("nothing plays")) return st.nothingPlays;
  if (m.includes("a sound file inside the folder")) return st.notSound;
  if (m.includes("folder of this computer alone") || m.includes("join the table first") || m.includes("no such table")) return st.noTable;
  return st.refused;
}
