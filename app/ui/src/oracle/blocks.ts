// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Interactive Oracle Callouts in the reading view (ADR 0102). */

import { hasCapability } from "../capabilities";
import { h, ui } from "../dom";
import { icon } from "../icons";
import { refusalText, showOracleDialog } from "./dialog";
import type { OracleHost } from "./host";
import { os } from "./strings";
import { readingTarget } from "./write";

/** What is inside another note or a drawn file: not this note's callout. */
const FOREIGN = ".embed-note, .embed, .embed-base, .embed-pdf";

/** The button on every oracle callout of this note under `root`. Without the
 *  note (a board's card, a folder's view) there is nothing to write into and
 *  no button; the same when the oracle is off in this workspace (ADR 0103) or
 *  the note cannot be written. */
export function markOracles(root: ParentNode, host?: OracleHost | null): void {
  if (!host || host.readOnly || !hasCapability("oracles")) return;
  // The ones on screen that this note's text holds, in order: the same
  // count `oracleBlocks` makes of the source, or nothing is written.
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('.callout[data-callout="oracle"]')).filter((b) => !b.closest(FOREIGN));
  boxes.forEach((box, index) => {
    if (box.classList.contains("oracle-callout-wired")) return;
    box.classList.add("oracle-callout-wired");

    const actionBtn = h("button", "oracle-callout-btn");
    actionBtn.type = "button";
    actionBtn.append(icon("sparkles"), h("span", "", os.askCallout));
    actionBtn.title = os.askCalloutTitle;

    actionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const found = readingTarget(host, index, boxes.length);
      if ("why" in found) {
        ui.status.textContent = refusalText(found.why);
        return;
      }
      showOracleDialog(found.question, { host, target: found.target });
    });

    const titleEl = box.querySelector<HTMLElement>(":scope > .callout-title");
    if (titleEl) {
      titleEl.classList.add("oracle-callout-head");
      titleEl.append(actionBtn);
    } else {
      const head = h("div", "callout-title oracle-callout-head");
      head.append(h("span", "oracle-callout-label", os.calloutTitle("")), actionBtn);
      box.prepend(head);
    }
  });
}
