// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** What the oracle needs of the note it writes into. A note leaf has all of
 *  it; naming only this keeps the oracle from importing the leaf (and the
 *  import cycle that came with it). */

import type { EditorView } from "@codemirror/view";

export interface OracleHost {
  editor: EditorView;
  /** The note's path: its room, when it is open in one (ADR 0102 item 5). */
  path?: string;
  readOnly: boolean;
  /** "preview" is the reading view. */
  mode: string;
  conflict: { up: boolean };
  readerView: { on: boolean };
  /** The text the reading view was drawn from. */
  shownText: string;
  /** The reading view's element (focus goes back to it after a write). */
  preview?: HTMLElement;
  save(): Promise<unknown>;
}

export function isOracleHost(x: unknown): x is OracleHost {
  const o = x as Partial<OracleHost> | null | undefined;
  return !!o && typeof o === "object" && !!o.editor && typeof o.save === "function" && typeof o.mode === "string" && !!o.conflict && !!o.readerView;
}

/** The note an oracle callout was clicked in. */
export interface OracleTarget {
  /** Where the callout started when it was picked. */
  from: number;
  /** What it said then. */
  text: string;
}
