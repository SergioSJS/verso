// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { commands } from "./bindings";

/* ---------- Images for embeds, asked of the core once each ---------- */
/** By note and target: one name can reach different files from different
 *  folders (spec Q12). */
export const images = new Map<string, string | null>();
export function imageUrl(source: string, target: string, onKnown: () => void): string | null | undefined {
  const key = `${source}\u0000${target}`;
  if (images.has(key)) return images.get(key) ?? null;
  images.set(key, null);
  void commands.resolveAttachment(source, target).then((r) => {
    images.set(key, r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null);
    onKnown();
  });
  return undefined;
}
/** A picture a property names (ADR 0086 item 1), asked of the core from
 *  `source`, as an embed's: the address to show it from, or null when the
 *  target names no file (or the core could not say). */
export async function pictureAddress(source: string, target: string): Promise<string | null> {
  try {
    const r = await commands.resolveAttachment(source, decodedAddress(target));
    return r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null;
  } catch {
    return null;
  }
}
/** What the reading view drew a picture from the last time, by note and
 *  target. The same note drawn again (a save, a change by someone else)
 *  puts its pictures back at once from here and only then asks the core
 *  again: waiting for the answer left a blank frame and a collapsed
 *  height for every picture, at every redraw. */
const drawnFrom = new Map<string, string | null>();
const drawnKey = (kind: string, source: string, target: string): string => `${kind}\u0000${source}\u0000${target}`;
/** Where `target` named from `source` led when last drawn (`kind`: an
 *  `embed` leads to a path of the folder, a `picture` to an address):
 *  `undefined` when it never was. */
export function drawnBefore(kind: "embed" | "picture", source: string, target: string): string | null | undefined {
  return drawnFrom.get(drawnKey(kind, source, target));
}
export function drawnNow(kind: "embed" | "picture", source: string, target: string, address: string | null): void {
  drawnFrom.set(drawnKey(kind, source, target), address);
}
/** The folder's files changed (or another folder opened): what was drawn
 *  from where is not trusted any more. */
export function forgetDrawn(): void {
  drawnFrom.clear();
}
/** A note's own pictures, `![alt](assets/x.png)`: the sanitizer holds
 *  their address in `data-src`, relative to the note, and it stays there
 *  as written (a picture resized writes its size beside it); each is asked
 *  of the core and shown from the folder. One that names nothing stays
 *  empty. A picture drawn before is shown at once, before the core
 *  answers; the answer then confirms it or changes it. */
export async function noteImages(root: ParentNode, source: string): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll<HTMLImageElement>("img[data-src]"), async (img) => {
      // The renderer percent-encodes the address (`gr%C3%A1fico.png`,
      // `Pasted%20image.png`); the folder names the file as the note does.
      const target = decodedAddress(img.dataset["src"] ?? "");
      const before = drawnBefore("picture", source, target);
      if (before) img.src = before;
      const r = await commands.resolveAttachment(source, target);
      const now = r.status === "ok" && r.data ? convertFileSrc(r.data, "verso") : null;
      if (r.status === "ok") drawnNow("picture", source, target, now);
      if (now) {
        if (now !== before) img.src = now;
      } else if (before && r.status === "ok") img.removeAttribute("src");
    }),
  );
}
/** A picture's address as the folder names the file: percent escapes
 *  undone, or the address as it is when they do not decode. */
export function decodedAddress(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
/** The same for HTML as text (Live Preview's embeds), resolved in a
 *  template, where nothing loads. */
export async function withNoteImages(html: string, source: string): Promise<string> {
  const t = document.createElement("template");
  t.innerHTML = html;
  await noteImages(t.content, source);
  return t.innerHTML;
}
