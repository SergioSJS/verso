// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A secret block as a writer sees it (ADR 0087 item 5): a callout of kind
// `secret` drawn with a lock and the words that say what it does — "Hidden
// from readers" on a UniVerso (a server's folder, or a folder of this
// computer that syncs with one), "Visible to anyone with the file" in a
// folder of this computer, where nothing is hidden. A reader never sees
// one: the server serves a reader the note without it.

import { h } from "../dom";
import { icon } from "../icons";
import { host } from "../can";
import { ss } from "./strings";

/** Whether this folder syncs with a server, as `verso:sync-state` says. */
let synced = false;
globalThis.addEventListener?.("verso:sync-state", (e) => {
  synced = Boolean((e as CustomEvent<{ on?: boolean }>).detail?.on);
});

/** Whether a UniVerso serves the window's folder: its readers are served
 *  its notes without their secret blocks. */
export function served(): boolean {
  return host() === "server" || synced;
}

/** Every secret callout under `root` marked: its default title in the
 *  window's language, a lock and what the block does. Marked once. */
export function markSecrets(root: ParentNode): void {
  for (const box of root.querySelectorAll<HTMLElement>('.callout[data-callout="secret"]')) {
    if (box.classList.contains("secret-block")) continue;
    box.classList.add("secret-block");
    const title = box.querySelector<HTMLElement>(":scope > .callout-title");
    // The core names a callout with no title by its kind: the window's word.
    const first = title?.firstChild;
    if (first instanceof Text && first.data.trim() === "Secret" && first === title?.lastChild) first.data = ss.label;
    const badge = h("span", "secret-badge");
    badge.append(icon("lock"), h("span", "", served() ? ss.hidden : ss.local));
    if (title) title.append(badge);
    else box.prepend(badge);
  }
  for (const box of root.querySelectorAll<HTMLElement>('.callout[data-callout="secret-placeholder"]')) {
    if (box.classList.contains("secret-placeholder")) continue;
    box.classList.add("secret-placeholder");
    box.setAttribute("role", "status");
    box.setAttribute("aria-label", ss.hiddenContent);
    const title = box.querySelector<HTMLElement>(":scope > .callout-title");
    const badge = h("span", "secret-placeholder-badge");
    badge.append(icon("lock"), h("span", "", ss.hiddenContent));
    if (title) {
      title.replaceChildren(badge);
    } else {
      box.replaceChildren(badge);
    }
  }
}
