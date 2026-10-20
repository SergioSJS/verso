// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { WidgetType } from "@codemirror/view";
import { icon } from "../icons";
import { showOracleDialog } from "../oracle/dialog";
import { isPt } from "../oracle/strings";
import { layout } from "../layout/spaces";
import { NoteLeaf } from "../leaves/note";

export class OracleCalloutButtonWidget extends WidgetType {
  constructor(readonly question: string, readonly startPos?: number) {
    super();
  }
  override eq(other: OracleCalloutButtonWidget): boolean {
    return other.question === this.question && other.startPos === this.startPos;
  }
  override toDOM(): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "oracle-callout-btn cm-lp-oracle-btn";
    btn.title = isPt ? "Abrir oráculo para rolar resposta ou gerar ideias" : "Open oracle dialog to roll answer or spark ideas";
    btn.setAttribute("aria-label", isPt ? "Consultar Oráculo" : "Ask Oracle");
    btn.append(icon("sparkles"));
    const label = document.createElement("span");
    label.textContent = isPt ? "Consultar Oráculo" : "Ask Oracle";
    btn.append(label);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const active = layout().activeLeaf;
      const leaf = active instanceof NoteLeaf ? active : null;
      let pos: number | undefined = this.startPos;
      if (leaf?.editor && pos === undefined) {
        try {
          pos = leaf.editor.posAtDOM(btn);
        } catch {
          // ignore
        }
      }
      showOracleDialog(this.question, {
        leaf: leaf ?? undefined,
        docPos: pos,
        originalQuestion: this.question,
      });
    });
    return btn;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}
