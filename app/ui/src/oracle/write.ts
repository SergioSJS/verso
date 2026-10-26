// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Writing a roll into a note (ADR 0102 item 4), the way the reading
 *  view's task box does: nothing is written while the note cannot take it
 *  (read-only, a conflict waiting, a view drawn from other text) or the
 *  callout is no longer where and what it was; each refusal is said, and
 *  nothing is claimed that did not happen. */

import type { Composed } from "./compose";
import type { OracleHost, OracleTarget } from "./host";
import { locateOracleCallout, oracleBlockContaining, oracleBlocks, oracleQuestion, planOracleEdit, planOracleInsert } from "./locate";
import { trackedTarget } from "./track";

export type Refusal = "readOnly" | "conflict" | "readerView" | "stale" | "moved" | "unchanged";

export type WriteResult = { ok: true; edited: boolean } | { ok: false; why: Refusal };

const eolless = (s: string): string => s.replace(/\r\n?/g, "\n");

function refusal(host: OracleHost): Refusal | null {
  if (host.readOnly) return "readOnly";
  if (host.conflict.up) return "conflict";
  if (host.mode === "preview" && host.readerView.on) return "readerView";
  return null;
}

/** The callout in the reading view that is the `ordinal`-th of the `shown`
 *  on screen (those of this note only, not of an embedded one): found in the
 *  text the view was drawn from, which must still be the editor's. The number
 *  on screen and the number in the text must agree, or nothing is guessed. */
export function readingTarget(host: OracleHost, ordinal: number, shown: number): { target: OracleTarget; question: string } | { why: Refusal } {
  const why = refusal(host);
  if (why) return { why };
  const text = eolless(host.editor.state.doc.toString());
  if (text !== eolless(host.shownText)) return { why: "stale" };
  const blocks = oracleBlocks(text);
  const block = blocks[ordinal];
  if (blocks.length !== shown || !block) return { why: "moved" };
  return { target: { from: block.from, text: block.text }, question: oracleQuestion(block) };
}

/** Write `composed` into the callout `target` names, or, with none, as a
 *  new callout at the caret. */
export function writeOracle(host: OracleHost, target: OracleTarget | null, composed: Composed): WriteResult {
  const why = refusal(host);
  if (why) return { ok: false, why };
  const view = host.editor;
  const before = view.state.doc.toString();
  const reading = host.mode === "preview";
  let edited = target !== null;
  if (target) {
    const block = locateOracleCallout(before, trackedTarget(view.state, target));
    if (!block || !composed.gen) return { ok: false, why: "moved" };
    const plan = planOracleEdit(before, block, composed.gen);
    view.dispatch({ changes: plan.changes, ...(reading ? {} : { selection: { anchor: plan.cursor } }), scrollIntoView: false });
  } else if (composed.gen && oracleBlockContaining(before, view.state.selection.main.to)) {
    // The caret is in an oracle callout: the roll goes into it, by the same
    // rules as its button, never into a second callout beside it.
    const block = oracleBlockContaining(before, view.state.selection.main.to)!;
    const plan = planOracleEdit(before, block, composed.gen);
    view.dispatch({ changes: plan.changes, ...(reading ? {} : { selection: { anchor: plan.cursor } }), scrollIntoView: !reading });
    edited = true;
  } else {
    const plan = planOracleInsert(before, view.state.selection.main.to, composed.callout);
    view.dispatch({ changes: plan.change, ...(reading ? {} : { selection: { anchor: plan.cursor } }), scrollIntoView: !reading });
  }
  if (view.state.doc.toString() === before) return { ok: false, why: "unchanged" };
  // The reading view is drawn from the saved note: the ordinary save writes
  // it and draws it again.
  if (reading) void host.save();
  return { ok: true, edited };
}
