// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The owner pairs his own browser or phone through the internet link (ADR
// 0117 D5, decided 2026-11-13; R3): what the pairing dialog adds for it.
// The window is the network's own — the same token, the same code, the
// same two minutes and three attempts — so the link is one more address
// for it: with the network on, the dialog offers the link's QR beside the
// network's; with the link alone, the link's is the only one. *Was it you?*
// says when the question came through the link, and an editor is chosen
// first (D5 (2)). Words in `localServerLinkStrings.ts`.

import type { LocalLink, LocalPairing, LocalServerStatus } from "../bindings";
import { linkStrings } from "./localServerLinkStrings";

/** An element with a class and its text (`dom.ts`'s `h`, whose module
 *  reaches for the window's elements as it loads). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The address a person types: the pairing link without its fragment —
 *  the token is never shown as text. */
export function typedAddress(url: string): string {
  return url.split("#")[0] ?? url;
}

/** Whether *Pair a phone* can open now: serving, on the network, or by the
 *  internet link once it has its address. */
export function pairOffered(s: Pick<LocalServerStatus, "serving" | "port"> & { link: Pick<LocalLink, "state" | "origin"> }): boolean {
  return s.serving && (s.port !== null || (s.link.state === "on" && s.link.origin !== null));
}

/** The two QRs a window can show: the network's (when it serves there) and
 *  the link's (while it has an address). */
export type Shown = { url: string; link: boolean };

/** The QR the dialog shows first: the network's when there is one, else
 *  the link's. */
export function firstShown(p: Pick<LocalPairing, "url" | "certificate" | "link">): Shown {
  return { url: p.url, link: p.certificate === "link" };
}

/** The other QR the person can switch to, if any. */
export function otherShown(p: Pick<LocalPairing, "url" | "certificate" | "link">, now: Shown): Shown | null {
  if (p.certificate === "link" || p.link === null) return null;
  return now.link ? { url: p.url, link: false } : { url: p.link.url, link: true };
}

/** Under the code: a line that says which way this QR goes, and the
 *  button that switches to the other one. `draw` redraws the QR and the
 *  address for what is chosen. */
export function linkSwitch(p: LocalPairing, now: Shown, draw: (next: Shown) => void): HTMLElement | null {
  const w = linkStrings();
  const other = otherShown(p, now);
  if (!now.link && !other) return null;
  const box = h("div", "ls-pair-link");
  box.append(h("p", "ls-help", now.link ? w.pairByLink : w.pairByNetwork));
  if (other) {
    const swap = h("button", "btn", other.link ? w.pairShowLink : w.pairShowNetwork);
    swap.type = "button";
    swap.addEventListener("click", () => draw(other));
    box.append(swap);
  }
  return box;
}

/** In *Was it you?*: the question came through the internet link — from
 *  anywhere — and only a device in the owner's own hands is to be let in. */
export function askedByLink(link: boolean): HTMLElement | null {
  if (!link) return null;
  const p = h("p", "ls-help", linkStrings().askedByLink);
  p.setAttribute("role", "note");
  return p;
}
