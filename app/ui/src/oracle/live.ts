// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** The oracle button at the end of a callout's first line in Live Preview. */

import { WidgetType, type EditorView } from "@codemirror/view";
import { ui } from "../dom";
import { icon } from "../icons";
import { layout, spaces } from "../layout/spaces";
import { refusalText, showOracleDialog } from "./dialog";
import { isOracleHost, type OracleHost } from "./host";
import { isOracleHead, oracleBlockAt, oracleQuestion, quoteInfo } from "./locate";
import { os } from "./strings";
import { trackOracle } from "./track";

/** Whether a line of the document opens an oracle callout the oracle can
 *  write into: a head, and the first line of its quote. (The syntax tree
 *  already leaves out code fences.) */
export function oracleHeadAt(lineText: string, previousLine: string | null): boolean {
  if (!isOracleHead(lineText)) return false;
  return (previousLine === null ? 0 : quoteInfo(previousLine).depth) < quoteInfo(lineText).depth;
}

/** The note leaf whose editor is this view: the active one, or any other
 *  pane's (the button's mousedown does not move focus). None for an editor
 *  that is no note's own, such as a board card's. */
function hostOf(view: EditorView): OracleHost | null {
  const leaf = layout().activeLeaf;
  if (isOracleHost(leaf) && leaf.editor === view) return leaf;
  for (const s of spaces) for (const p of s.layout.panes()) for (const l of p.leaves) if (isOracleHost(l) && l.editor === view) return l;
  return null;
}

export class OracleCalloutButtonWidget extends WidgetType {
  // Nothing about the callout is kept here: where it is and what it says are
  // read from the document when the button is clicked.
  override eq(): boolean {
    return true;
  }
  override toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "oracle-callout-btn cm-lp-oracle-btn";
    btn.title = os.askCalloutTitle;
    btn.setAttribute("aria-label", os.askCallout);
    btn.append(icon("sparkles"));
    const label = document.createElement("span");
    label.textContent = os.askCallout;
    btn.append(label);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const host = hostOf(view);
      const pos = view.posAtDOM(btn);
      const block = oracleBlockAt(view.state.doc.toString(), pos);
      if (!block) {
        ui.status.textContent = refusalText("moved");
        return;
      }
      if (!host) {
        ui.status.textContent = os.noNoteHere;
        return;
      }
      // Follow the callout through whatever is typed while the dialog is open.
      view.dispatch({ effects: trackOracle.of({ from: block.from, to: block.to, text: block.text }) });
      showOracleDialog(oracleQuestion(block), { host, target: { from: block.from, text: block.text } });
    });
    return btn;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}
