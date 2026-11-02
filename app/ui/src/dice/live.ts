// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A `dice:` code in Live Preview (ADR 0088 item 2): on a line the caret is
// not on, the code is the die; on the caret's line, its source. The
// document never changes (ADR 0012).

import { hasCapability } from "../capabilities";
import { WidgetType } from "@codemirror/view";
import { type DiceHost, diceBox } from "./card";
import { type DiceCode, readCode } from "./notation";

class DiceWidget extends WidgetType {
  constructor(
    readonly code: DiceCode,
    readonly text: string,
    readonly host: DiceHost,
    readonly occ: number,
  ) {
    super();
  }
  override eq(other: DiceWidget): boolean {
    return other.text === this.text && other.occ === this.occ;
  }
  override toDOM(): HTMLElement {
    return diceBox(this.code, this.host, { occ: this.occ });
  }
  /** The die's own buttons take their clicks and keys. */
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The die an inline code's text (its backticks with it) names — its table,
 *  or its notation — when it is a `dice:` code drawn as a die; else null.
 *  The reading view counts identical dice by the same key. */
export function diceKey(code: string): string | null {
  const read = readCode(code);
  if (!read || !hasCapability(read.kind === "table" ? "randomTables" : "diceRolling")) return null;
  return read.kind === "table" ? read.source : read.notation;
}

/** The widget of an inline code's text (its backticks with it), or null
 *  when it is no `dice:` code Verso rolls. */
export function diceWidget(host: DiceHost): (code: string, occ?: number) => WidgetType | null {
  return (code, occ = 0) => {
    const read = readCode(code);
    if (!read || !hasCapability(read.kind === "table" ? "randomTables" : "diceRolling")) return null;
    return new DiceWidget(read, code, host, occ);
  };
}
