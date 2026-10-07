// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { h } from "../dom";
import { Pane } from "../layout/pane";
import { persistSoon } from "../layout/spaces";
import { fetchFirst } from "../opening";
import { Kind, name } from "../paths";
import { t } from "../strings";
import { markCurrent } from "../tree/tree";
import { Leaf } from "./leaf";

/* An image, as itself. */
export class ImageLeaf extends Leaf {
  readonly kind: Kind = "image";
  readonly img = h("img", "image-view");
  readonly box = h("div", "image-box");
  constructor(pane: Pane) {
    super(pane);
    const box = this.box;
    box.append(this.img);
    this.el.append(box);
    // Fitted or at its actual size, by a click or by Enter and Space: a
    // toggle, focusable, so that the arrows scroll a large image too.
    box.tabIndex = 0;
    box.setAttribute("role", "button");
    box.setAttribute("aria-pressed", "false");
    const flip = () => box.setAttribute("aria-pressed", String(box.classList.toggle("actual")));
    box.addEventListener("click", flip);
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      flip();
    });
  }
  override focusContent(): void {
    this.box.focus();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(name(path));
    // A drawing scales to any size, and one that names only its viewBox
    // has no size of its own: fitted, it fills the view in its proportions
    // instead of centring at a width of nothing.
    this.box.classList.toggle("vector", /\.svg$/i.test(path));
    // Brought back behind another tab: shown first, then read.
    await Promise.resolve();
    if (this.quiet(path)) return void (this.deferred = true);
    await fetchFirst(path);
    if (this.path !== path) return;
    this.img.src = convertFileSrc(path, "verso");
    this.img.dataset["path"] = path;
    this.img.alt = name(path);
    this.box.setAttribute("aria-label", `${t.actualSize}: ${name(path)}`);
    markCurrent();
    persistSoon();
  }
}
