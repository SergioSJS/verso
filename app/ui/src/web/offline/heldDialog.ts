// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Another account signed in on a browser that keeps the changes of one
// whose session the server ended (ADR 0092 item 6, revised 2026-11-15;
// held.ts): they are never sent under this account, nor shown among its
// folders. The person may download them as files — a zip, a folder per
// folder, with the files written there and a list of the ones deleted — to
// hand to whoever made them, or discard them; "Not now" leaves them, and
// the question comes back at the next page.

import { el } from "../form";
import type { HeldFolder } from "./held";
import { offline } from "./manager";
import { o } from "./strings";
import { zip } from "./zip";

/** A name for a folder inside the zip: what every system keeps. */
function safe(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim() || "Verso";
}

/** The changes as the files of one zip. */
export function heldZip(folders: HeldFolder[]): Uint8Array {
  const s = o();
  const enc = new TextEncoder();
  const files: { name: string; bytes: Uint8Array }[] = [];
  const taken = new Set<string>();
  for (const h of folders) {
    let dir = safe(h.name);
    for (let n = 2; taken.has(dir); n++) dir = `${safe(h.name)} ${n}`;
    taken.add(dir);
    const deleted: string[] = [];
    for (const f of h.files) {
      if (f.bytes) files.push({ name: `${dir}/${f.path}`, bytes: f.bytes });
      else deleted.push(f.path);
    }
    if (deleted.length > 0) files.push({ name: `${dir}/${s.otherDeletedName}`, bytes: enc.encode(`${s.otherDeletedHead}\n${deleted.map((p) => `- ${p}`).join("\n")}\n`) });
  }
  return zip(files);
}

function save(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Yes or no, in a dialog of its own over the first. */
function sure(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "web-dialog", "aria-labelledby": "web-held-sure" });
    const close = (answer: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const cancel = el("button", { type: "button", class: "ghost web-ghost" }, no);
    const go = el("button", { type: "button", class: "ghost danger web-danger" }, yes);
    cancel.addEventListener("click", () => close(false));
    go.addEventListener("click", () => close(true));
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(false);
    });
    dialog.append(el("p", { id: "web-held-sure", class: "web-lead" }, text), el("div", { class: "web-actions" }, cancel, go));
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

/** Offer `folders` — another account's kept changes — to the person signed
 *  in as `account`. */
export function offerHeld(folders: HeldFolder[], account: string): void {
  const s = o();
  const count = folders.reduce((n, h) => n + h.files.length, 0);
  if (count === 0) return;
  const dialog = el("dialog", { class: "web-dialog web-held", "aria-labelledby": "web-held-title", "aria-describedby": "web-held-lead" });
  const said = el("p", { class: "web-lead", role: "status", "aria-live": "polite" });
  const later = el("button", { type: "button", class: "ghost web-ghost" }, s.otherLater);
  const discard = el("button", { type: "button", class: "ghost danger web-danger" }, s.otherDiscard);
  const download = el("button", { type: "button", class: "ghost web-ghost" }, s.otherDownload);
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  later.addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  download.addEventListener("click", () => {
    save(heldZip(folders), s.otherZip);
    said.textContent = s.otherDownloaded;
  });
  discard.addEventListener("click", () => {
    void sure(s.otherDiscardAsk(count), s.otherDiscardYes, s.cancel).then(async (yes) => {
      if (!yes) return;
      await offline.discardElsewhere(account);
      close();
    });
  });
  dialog.append(
    el("h2", { id: "web-held-title", class: "web-dialog-title" }, s.otherTitle),
    el("p", { id: "web-held-lead", class: "web-lead" }, s.otherLead(count)),
    said,
    el("div", { class: "web-actions", style: "flex-wrap: wrap" }, later, discard, download),
  );
  document.body.append(dialog);
  dialog.showModal();
  download.focus();
}
