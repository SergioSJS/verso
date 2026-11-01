// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The soundboard (ADR 0116 item 15, Q5 a): a play button beside every link
// or embed of a sound file in a note, for whoever controls the table's
// music — the game master, or the person alone in a folder of this
// computer. Pressing it plays the file for the table, and the heading
// above it is the scene next and previous walk. Nothing in the note
// changes (ADR 0012); the button is drawn, never written.

import { EditorView, WidgetType } from "@codemirror/view";
import { redraw } from "../../live";
import { resolveFileByName } from "../../resolve";
import { icon } from "../../icons";
import { ui } from "../../dom";
import { askUnheard } from "./ask";
import { onSound, playTrack, sound, soundOn } from "./run";
import { headingBefore, isAudio, sceneUnder, scenesOf, trackName } from "./scene";
import { asScene } from "./library";
import { st } from "./strings";

/** What a play button needs of its note. */
export type SoundHost = { path(): string; text(): string };

/** Whether the play buttons are drawn for this person now. */
export function soundButtons(): boolean {
  return soundOn() && sound().controls();
}

/** The play button of the file `path`, from the note of `host`, under the
 *  heading `heading` says (its text, or null above every heading). */
export function soundButton(path: string, host: SoundHost, heading: () => string | null): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost iconic table-sound-play";
  b.dataset["path"] = path;
  const label = st.playButton(trackName(path));
  b.setAttribute("aria-label", label);
  b.title = label;
  b.append(icon("play", ""));
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const resolve = (target: string) => resolveFileByName(target, host.path());
    const found = sceneUnder(scenesOf(host.text(), resolve), path, heading());
    // The list is known by its note and heading ("Trilha › Taverna").
    const scene = found ? asScene({ kind: "note", source: host.path(), scene: found.name, tracks: found.tracks }, "") : null;
    void playTrack(path, scene, askUnheard).then((err) => {
      if (err) ui.status.textContent = err;
    });
  });
  return b;
}

/** The reading views drawn, wired again when the person comes to control the
 *  music (the join answers after the note is drawn) or stops. */
const roots = new Map<HTMLElement, SoundHost>();

/** The reading view: a play button after each link or embed of a sound file.
 *  `keep`: the view's own root, wired again when the controls change. */
export function wireSound(root: HTMLElement, host: SoundHost, keep = true): void {
  if (keep) roots.set(root, host);
  if (!soundButtons()) {
    for (const b of root.querySelectorAll(".table-sound-play")) b.remove();
    return;
  }
  const marked = root.querySelectorAll<HTMLElement>("a.wikilink[data-target], span.embed[data-target], a[href]");
  for (const el of marked) {
    if (el.nextElementSibling?.classList.contains("table-sound-play")) continue;
    const raw = el.dataset["target"] ?? el.getAttribute("href") ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || !isAudio(raw)) continue;
    let target = raw.split("#")[0]!;
    try {
      target = decodeURI(target);
    } catch {
      // As written.
    }
    const path = resolveFileByName(target, host.path());
    if (!path) continue;
    el.after(soundButton(path, host, () => headingAbove(el, root)));
  }
}

/** The text of the heading above `el` in the reading view, or null. */
function headingAbove(el: Element, root: Element): string | null {
  let block: Element | null = el;
  while (block && block.parentElement && block.parentElement !== root) block = block.parentElement;
  for (let b: Element | null = block; b; b = b.previousElementSibling) {
    if (/^H[1-6]$/.test(b.tagName)) return (b.textContent ?? "").trim();
  }
  return null;
}

class SoundWidget extends WidgetType {
  constructor(
    readonly path: string,
    readonly host: SoundHost,
    readonly at: number,
  ) {
    super();
  }
  override eq(other: SoundWidget): boolean {
    return other.path === this.path && other.at === this.at;
  }
  override toDOM(): HTMLElement {
    return soundButton(this.path, this.host, () => headingBefore(this.host.text(), this.at));
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

/** Live Preview: the widget after a link to `target` at offset `at`, or none. */
export function soundWidget(host: SoundHost): (target: string, at: number) => WidgetType | null {
  return (target, at) => {
    if (!soundButtons() || !isAudio(target)) return null;
    const path = resolveFileByName(target, host.path());
    return path ? new SoundWidget(path, host, at) : null;
  };
}

let shown = false;
onSound(() => {
  const now = soundButtons();
  if (now === shown) return;
  shown = now;
  for (const [root, host] of [...roots]) {
    if (!root.isConnected) roots.delete(root);
    else wireSound(root, host);
  }
  for (const el of document.querySelectorAll<HTMLElement>(".cm-editor")) EditorView.findFromDOM(el)?.dispatch({ effects: redraw.of(null) });
});
