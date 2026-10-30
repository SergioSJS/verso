// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { h } from "../dom";
import { icon } from "../icons";
import { Pane } from "../layout/pane";
import { crumbsFor, crumbsNav, persistSoon } from "../layout/spaces";
import { Kind } from "../paths";
import { t } from "../strings";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";
import { TextLeaf } from "./textfile";

/** The two modes of an HTML file, as a note has its own: the page and its
 *  source. A tab holds one of them; choosing the other puts it in its
 *  place, after the source's last keystrokes are saved. */
export function htmlModes(leaf: Leaf, on: "page" | "source"): HTMLElement {
  const modes = h("div", "modes");
  modes.setAttribute("role", "group");
  const mode = (face: "page" | "source", ic: string, label: string): HTMLButtonElement => {
    const b = h("button");
    b.type = "button";
    b.append(icon(ic), h("span", "", label));
    b.setAttribute("aria-label", label);
    b.title = label;
    b.setAttribute("aria-pressed", String(face === on));
    b.addEventListener("click", () => {
      if (face !== on) void leaf.pane.swap(leaf, face === "page" ? new FrameLeaf(leaf.pane) : new TextLeaf(leaf.pane));
    });
    return b;
  };
  modes.append(mode("page", "reading", t.htmlPage), mode("source", "source", t.source));
  return modes;
}

/* An HTML page, shown by the webview itself, scripts off; its source is
 * the other mode of the same tab. */
export class FrameLeaf extends Leaf {
  readonly kind: Kind = "frame";
  readonly frame = h("iframe", "frame-view");
  readonly crumbs = crumbsNav();
  constructor(pane: Pane) {
    super(pane);
    this.frame.setAttribute("sandbox", "");
    this.frame.setAttribute("referrerpolicy", "no-referrer");
    const head = h("header", "leaf-head");
    head.append(this.crumbs, htmlModes(this, "page"));
    this.el.append(head, this.frame);
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(path.split("/").pop() ?? path);
    this.crumbs.replaceChildren(...crumbsFor(path));
    this.frame.src = convertFileSrc(path, "verso");
    this.frame.title = this.tabName.textContent ?? "";
    markCurrent();
    persistSoon();
  }
}
