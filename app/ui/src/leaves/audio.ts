// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/* A sound file, as its player (ADR 0116, amendment of 2026-11-01): what an
 * embed's name opens, and what the tree opens — never a text tab that
 * cannot read it. */

import { convertFileSrc } from "@tauri-apps/api/core";
import { h } from "../dom";
import { Pane } from "../layout/pane";
import { openNote, persistSoon } from "../layout/spaces";
import { Kind, name } from "../paths";
import { markCurrent } from "../tree/tree";
import { audioPlayer } from "../audio/player";
import { Leaf } from "./leaf";

export class AudioLeaf extends Leaf {
  readonly kind: Kind = "other";
  readonly box = h("div", "audio-leaf");
  constructor(pane: Pane) {
    super(pane);
    this.el.append(this.box);
  }
  override focusContent(): void {
    this.box.querySelector<HTMLElement>(".audio-embed-toggle")?.focus();
  }
  async load(path: string): Promise<void> {
    this.path = path;
    this.setTitle(name(path));
    // Brought back behind another tab: shown first, then read.
    await Promise.resolve();
    if (this.quiet(path)) return void (this.deferred = true);
    if (this.path !== path) return;
    this.box.replaceChildren(audioPlayer({ path, src: convertFileSrc(path, "verso"), open: (aside) => void openNote(path, aside), host: { path: () => path, text: () => "" }, heading: () => null }));
    markCurrent();
    persistSoon();
  }
}
