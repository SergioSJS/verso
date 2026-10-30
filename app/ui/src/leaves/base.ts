// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type Extension } from "@codemirror/state";
import { EditorView } from "codemirror";
import { baseHost, liveBases } from "../bases";
import { BaseView } from "../bases/view";
import { h } from "../dom";
import { minimalEdit } from "../edit";
import { icon } from "../icons";
import { Pane } from "../layout/pane";
import { dirOf, Kind } from "../paths";
import { baseStrings } from "../strings";
import { TextLeaf } from "./textfile";

/* A base (ADR 0053): its views drawn from the core's evaluation, over the
 * YAML this tab edits as text in its other mode. The menus of the view
 * change the text in the editor, and the ordinary save writes it, over
 * the revision it read (invariant 11). */
export class BaseLeaf extends TextLeaf {
  override readonly kind: Kind = "base";
  readonly viewHost = h("div", "base-host");
  readonly baseModes = h("div", "modes");
  private view: BaseView | null = null;
  private showing: "view" | "source" = "view";
  private redrawTimer: number | undefined;
  constructor(pane: Pane) {
    super(pane);
    this.baseModes.setAttribute("role", "group");
    const mode = (face: "view" | "source", ic: string, label: string): HTMLButtonElement => {
      const b = h("button");
      b.type = "button";
      b.dataset["face"] = face;
      b.append(icon(ic), h("span", "", label));
      b.setAttribute("aria-label", label);
      b.title = label;
      b.addEventListener("click", () => this.setFace(face));
      return b;
    };
    this.baseModes.append(mode("view", "base", baseStrings.viewMode), mode("source", "source", baseStrings.sourceMode));
    this.el.querySelector(".leaf-head")?.append(this.baseModes);
    this.host.before(this.viewHost);
    this.paintFace();
  }
  protected override extras(): Extension {
    return EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      window.clearTimeout(this.redrawTimer);
      this.redrawTimer = window.setTimeout(() => void this.view?.refresh(), 250);
    });
  }
  override async load(path: string, force = false): Promise<void> {
    await super.load(path, force);
    if (this.path !== path) return;
    this.view?.destroy();
    if (this.view) liveBases.delete(this.view);
    this.view = new BaseView(baseHost(), {
      path,
      thisPath: path,
      folder: dirOf(path),
      text: () => this.editor.state.doc.toString(),
      edit: (next) => {
        const now = this.editor.state.doc.toString();
        const change = minimalEdit(now, next);
        if (change) this.editor.dispatch({ changes: change });
      },
      viewName: null,
      key: path,
    });
    liveBases.add(this.view);
    this.viewHost.replaceChildren(this.view.el);
    await this.view.refresh();
  }
  private setFace(face: "view" | "source"): void {
    this.showing = face;
    this.paintFace();
    if (face === "view") void this.view?.refresh();
    else this.editor.focus();
  }
  private paintFace(): void {
    for (const b of this.baseModes.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset["face"] === this.showing));
    this.viewHost.hidden = this.showing !== "view";
    this.host.hidden = this.showing !== "source";
  }
  override focusContent(): void {
    if (this.showing === "source") this.editor.focus();
    else this.viewHost.querySelector<HTMLElement>("button, a, input")?.focus();
  }
  override destroy(): void {
    window.clearTimeout(this.redrawTimer);
    if (this.view) {
      liveBases.delete(this.view);
      this.view.destroy();
    }
    super.destroy();
  }
}
