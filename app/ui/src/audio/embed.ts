// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where an audio embed's player is drawn (ADR 0116, amendment of
// 2026-11-01): the reading view (`![[taverna.mp3]]`, and `![](sons/a.mp3)`,
// a Markdown embed by spec Q20), Live Preview (the embed replaced by the
// player while the caret is not in it; Source mode shows the text), and a
// board's card. Rendering only: the parser and the note's text are
// untouched (invariant 7).

import { convertFileSrc } from "@tauri-apps/api/core";
import { EditorView, WidgetType } from "@codemirror/view";
import { decodedAddress } from "../images";
import { resolveFileByName } from "../resolve";
import type { SoundHost } from "../table/sound/links";
import { headingBefore } from "../table/sound/scene";
import { audioPlayer } from "./player";
import { audioTarget } from "./state";

export { audioTarget };

/** A Markdown picture of a sound file (`![](sons/a.mp3)`, held by the
 *  sanitizer in `data-src`) becomes the embed the renderer writes for
 *  `![[…]]`, so both are drawn as one: before any picture is asked for. */
export function audioImages(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-src]")) {
    const src = decodedAddress(img.dataset["src"] ?? "");
    if (!audioTarget(src)) continue;
    const span = document.createElement("span");
    span.className = "embed";
    span.dataset["target"] = src;
    span.textContent = img.getAttribute("alt") || src;
    img.replaceWith(span);
  }
}

/** The player of `rel` in place of the embed `span` of the reading view. */
export function placeAudio(span: HTMLElement, rel: string, host: SoundHost, heading: () => string | null, open: (path: string, aside: boolean) => void): void {
  // The soundboard's play button beside the embed (item 15) is the player's
  // own "Play for the table" now.
  const next = span.nextElementSibling;
  if (next?.classList.contains("table-sound-play")) next.remove();
  const player = audioPlayer({ path: rel, src: convertFileSrc(rel, "verso"), open: (aside) => open(rel, aside), host, heading });
  const p = span.parentElement;
  span.replaceWith(player);
  if (p && p.tagName === "P" && p.childNodes.length === 1) p.classList.add("audio-line");
}

/** A board's card of a sound file: the player in `el`. */
export function audioCard(el: HTMLElement, rel: string, board: () => string, open: (path: string, aside: boolean) => void): () => void {
  el.replaceChildren(audioPlayer({ path: rel, src: convertFileSrc(rel, "verso"), open: (aside) => open(rel, aside), host: { path: board, text: () => "" }, heading: () => null, onBoard: true }));
  return () => el.replaceChildren();
}

class AudioWidget extends WidgetType {
  constructor(
    readonly path: string,
    readonly host: SoundHost,
    readonly open: (path: string, aside: boolean) => void,
  ) {
    super();
  }
  override eq(other: AudioWidget): boolean {
    return other.path === this.path;
  }
  override toDOM(view: EditorView): HTMLElement {
    const el = audioPlayer({
      path: this.path,
      src: convertFileSrc(this.path, "verso"),
      open: (aside) => this.open(this.path, aside),
      host: this.host,
      heading: () => (el.isConnected ? headingBefore(this.host.text(), view.posAtDOM(el)) : null),
    });
    el.classList.add("cm-lp-audio");
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Live Preview: the player in place of an embed of a sound file of the
 *  folder (`target` as written), or none. */
export function audioWidget(host: SoundHost, open: (path: string, aside: boolean) => void): (target: string) => WidgetType | null {
  return (target) => {
    const written = decodedAddress(target.split("|")[0]!.split("#")[0]!.trim());
    if (!audioTarget(written)) return null;
    const path = resolveFileByName(written, host.path());
    return path ? new AudioWidget(path, host, open) : null;
  };
}
