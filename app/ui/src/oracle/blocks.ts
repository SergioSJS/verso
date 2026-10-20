// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Interactive Oracle Callouts (ADR 0102). */

import { h } from "../dom";
import { icon } from "../icons";
import { layout } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";
import { showOracleDialog } from "./dialog";
import { isPt } from "./strings";

/** Every oracle callout under `root` decorated with icon and interactive action button. */
export function markOracles(root: ParentNode): void {
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('.callout[data-callout="oracle"]'));
  boxes.forEach((box, index) => {
    if (box.classList.contains("oracle-callout-wired")) return;
    box.classList.add("oracle-callout-wired");

    const titleEl = box.querySelector<HTMLElement>(":scope > .callout-title");
    let question = "";

    if (titleEl) {
      const rawTitle = titleEl.textContent?.trim() ?? "";
      // Strip generic kind title if it's just "Oracle" or "Oráculo"
      const cleanTitle = rawTitle.replace(/^(?:oracle|oráculo|oraculo)\s*[:—–-]?\s*/i, "").trim();
      if (cleanTitle) {
        question = cleanTitle;
      }
    }

    if (!question) {
      const firstP = box.querySelector<HTMLElement>(":scope > p, :scope > div > p");
      if (firstP) {
        const text = firstP.textContent?.trim() ?? "";
        if (text && !text.startsWith("**Resposta") && !text.startsWith("**Resultado") && !text.startsWith("**Answer")) {
          question = text.split("\n")[0]?.trim() ?? "";
        }
      }
    }

    // Add interactive action button to the callout header
    const actionBtn = h("button", "oracle-callout-btn");
    actionBtn.type = "button";
    actionBtn.append(icon("sparkles"), h("span", "", isPt ? "Consultar Oráculo" : "Ask Oracle"));
    actionBtn.title = isPt ? "Abrir oráculo para rolar resposta ou gerar ideias" : "Open oracle dialog to roll answer or generate idea sparks";

    actionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const active = layout().activeLeaf;
      const leaf = active instanceof NoteLeaf ? active : null;
      showOracleDialog(question, {
        leaf: leaf ?? undefined,
        calloutBox: box,
        oracleIndex: index,
        originalQuestion: question,
      });
    });

    if (titleEl) {
      titleEl.classList.add("oracle-callout-head");
      titleEl.append(actionBtn);
    } else {
      const head = h("div", "callout-title oracle-callout-head");
      head.append(h("span", "oracle-callout-label", isPt ? "Oráculo" : "Oracle"), actionBtn);
      box.prepend(head);
    }
  });
}
