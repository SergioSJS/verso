// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle callout the dialog was opened on, followed through the edits
 *  made while the dialog is open (a collaborator typing above it, a change
 *  from disk, a merge): its place moves with the text. What is written
 *  still checks the callout says what it said (`locateOracleCallout`). */

import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { OracleTarget } from "./host";

export interface Tracked extends OracleTarget {
  to: number;
}

export const trackOracle = StateEffect.define<Tracked | null>();

export const oracleTracker = StateField.define<Tracked | null>({
  create: () => null,
  update(value, tr) {
    let v = value;
    if (v && tr.docChanged) v = { ...v, from: tr.changes.mapPos(v.from, 1), to: tr.changes.mapPos(v.to, -1) };
    for (const e of tr.effects) if (e.is(trackOracle)) v = e.value;
    return v;
  },
});

/** The target with its place moved through the edits since it was picked. */
export function trackedTarget(state: EditorState, target: OracleTarget): OracleTarget {
  const now = state.field(oracleTracker, false);
  return now && now.text === target.text ? { from: now.from, text: now.text } : target;
}
