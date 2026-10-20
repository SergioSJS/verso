// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle in a room (ADR 0102 item 5, decided 2026-10-20): in a note
 *  open in a room, the server draws — its generator, not this window's — and
 *  the others hear the draw as they hear dice; alone, offline, or when the
 *  room does not answer, the window draws as before (ADR 0088 item 7). The
 *  question's text never leaves the window. */

import { commands, type CollabOracle, type ContractError, type OracleAsk, type OracleDraw } from "../bindings";
import { liveRoom } from "../collab";
import { flash } from "../notify";
import { name } from "../paths";
import { ANSWERS, askOracle, generateSpark, getOddsTable, getSparkWords, oddsRowFor, questionDrawn, sparkDrawn, type Likelihood, type OracleResult, type SparkResult } from "./engine";
import { os } from "./strings";
import { rollOracleTable, tableDrawn, type OracleTable, type TableRollResult } from "./tables";

/** A draw: who made it. `shared`: the server's, heard by the room. `note`
 *  says why it is only this window's, when it was meant to be shared. */
export type Drawn<T> = { ok: true; value: T; shared: boolean; note: string | null } | { ok: false; why: string };

/** Ask the server of the note's room for `ask`; null when this window is not
 *  in a live room (draw here), else the answer or why it was refused. A
 *  room that does not answer is drawn here, and said. */
async function inRoom(path: string | undefined, ask: OracleAsk): Promise<{ draw: OracleDraw } | { here: string | null } | { why: string }> {
  if (!path || !liveRoom(path)) return { here: null };
  const r = await commands.collabOracle(path, ask).catch((e: unknown): { status: "error"; error: ContractError } => ({ status: "error", error: { kind: "unavailable", message: String(e) } as ContractError }));
  if (r.status === "ok") return { draw: r.data };
  if (r.error.kind === "unavailable") return { here: os.drawnHere };
  return { why: os.drawRefused(r.error.message) };
}

/** A yes/no question at `likelihood`. */
export async function drawQuestion(path: string | undefined, likelihood: Likelihood, question: string): Promise<Drawn<OracleResult>> {
  const served = await inRoom(path, { kind: "question", odds: oddsRowFor(likelihood, getOddsTable()) });
  if ("why" in served) return { ok: false, why: served.why };
  if ("draw" in served) {
    const value = questionDrawn(likelihood, question, served.draw.roll, served.draw.answer ?? -1);
    if (value) return { ok: true, value, shared: true, note: null };
    return { ok: false, why: os.drawRefused("?") };
  }
  return { ok: true, value: askOracle(likelihood, question), shared: false, note: served.here };
}

/** An idea spark, from the words now in use. */
export async function drawSpark(path: string | undefined, lang: "pt" | "en"): Promise<Drawn<SparkResult>> {
  const served = await inRoom(path, { kind: "spark", lists: getSparkWords(lang) });
  if ("why" in served) return { ok: false, why: served.why };
  if ("draw" in served) {
    const value = sparkDrawn(served.draw.words);
    if (value) return { ok: true, value, shared: true, note: null };
    return { ok: false, why: os.drawRefused("?") };
  }
  return { ok: true, value: generateSpark(lang), shared: false, note: served.here };
}

/** An entry of `table`. */
export async function drawTable(path: string | undefined, table: OracleTable): Promise<Drawn<TableRollResult | null>> {
  if (table.entries.length < 1) return { ok: true, value: null, shared: false, note: null };
  const served = await inRoom(path, { kind: "table", entries: [...table.entries] });
  if ("why" in served) return { ok: false, why: served.why };
  if ("draw" in served) {
    const value = tableDrawn(table, served.draw.roll, served.draw.words[0] ?? "");
    if (value) return { ok: true, value, shared: true, note: null };
    return { ok: false, why: os.drawRefused("?") };
  }
  return { ok: true, value: rollOracleTable(table), shared: false, note: served.here };
}

/** What a draw heard from the room says, in a sentence. */
export function heardSaid(d: OracleDraw): string {
  if (d.kind === "question") {
    const answer = ANSWERS[d.answer ?? -1];
    return answer ? os.heardQuestion(d.by, os.answer[answer], d.roll) : "";
  }
  if (d.kind === "spark") return d.words.length === 4 ? os.heardSpark(d.by, `${d.words[0]} ${d.words[1]} / ${d.words[2]} ${d.words[3]}`) : "";
  return d.words[0] ? os.heardTable(d.by, d.words[0], d.roll) : "";
}

/** Another member's draw, heard from the room: a toast titled with the note,
 *  as a roll of dice not on screen is. */
function heard(e: CollabOracle): void {
  const said = heardSaid(e.draw);
  if (said) flash("info", name(e.path), said);
}

addEventListener("verso:collab-oracle", (e) => heard((e as CustomEvent<CollabOracle>).detail));
