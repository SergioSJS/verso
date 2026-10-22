// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Files dragged in from the system's file manager, in the desktop app
// (T.11, decided 2026-10-22). The app's web view only hands a drop's bytes
// (a drop was capped at 32 MB); Tauri's own drag-and-drop events carry the
// files' paths instead, and the host takes them: the window is told only
// where the drop fell and the files' names (`files-over`, `files-dropped`;
// ADR 0026 rule 4: no path crosses), then asks `take_dropped`.
//
// On the tree a drop is an import, as "Import files…" is: the host copies
// each file itself, up to the limit in Settings › Files and links. Anywhere
// else — a note, a board, the window — the file is taken in as it always was,
// from its bytes (at most 32 MB each): the window gives the page the drop
// it would have got from the browser. In a browser the page's own drop
// events do all this and none of these events ever come.

import { listen } from "@tauri-apps/api/event";

import { type FilesDropped, type FilesOver, commands } from "./bindings";
import { ui } from "./dom";
import { fail } from "./errors";
import { importDropped } from "./importFiles";
import { imp } from "./importStrings";
import { clearDropHints } from "./layout/drag";
import { importFile } from "./theme/actions";

/** The tree's drop target under a point: a folder row, else the tree's root. */
function treeTarget(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>(".side [data-folder], #tree-root") ?? null;
}

function over(p: FilesOver): void {
  clearDropHints();
  if (p.over) treeTarget(document.elementFromPoint(p.x, p.y))?.classList.add("drop");
}

/** What a browser would call the file: a note takes an image by its type. */
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function fileOf(name: string, base64: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "" });
}

/** The dropped files as bytes (a note or a board takes them in), at most
 *  32 MB each; those left out are said. */
async function droppedBytes(): Promise<File[]> {
  const taken = await commands.takeDropped(32, true);
  if (taken.status !== "ok") {
    fail(taken.error);
    return [];
  }
  if (taken.data.skipped.length > 0) {
    ui.status.textContent = imp.summary({ made: 0, renamed: [], skipped: taken.data.skipped, failed: [], limitMb: 32 });
  }
  return taken.data.files.filter((f) => f.base64 !== null).map((f) => fileOf(f.name, f.base64 ?? ""));
}

async function dropped(p: FilesDropped): Promise<void> {
  clearDropHints();
  if (p.names.length === 0) return;
  const at = document.elementFromPoint(p.x, p.y);
  // A theme file dropped anywhere on the window (ADR 0100 item 6).
  if (p.names.some((n) => n.toLowerCase().endsWith(".verso-theme"))) {
    const theme = (await droppedBytes()).find((f) => f.name.toLowerCase().endsWith(".verso-theme"));
    if (theme) void importFile(theme);
    return;
  }
  if (at?.closest(".side")) {
    await importDropped(at.closest<HTMLElement>("[data-folder]")?.dataset["folder"] ?? "");
    return;
  }
  const files = await droppedBytes();
  if (files.length === 0) return;
  // The page gets the drop it would have had from the browser, at the
  // pointer: the note's editor, the board and the window take it as before.
  try {
    const data = new DataTransfer();
    for (const f of files) data.items.add(f);
    (at ?? document.body).dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, clientX: p.x, clientY: p.y }));
  } catch {
    ui.status.textContent = imp.summary({ made: 0, renamed: [], skipped: [], failed: files.map((f) => f.name), limitMb: 32 });
  }
}

/** Listen to the host's drag-and-drop events (the desktop app's). */
export function installDropHost(): void {
  void listen<FilesOver>("files-over", (e) => over(e.payload));
  void listen<FilesDropped>("files-dropped", (e) => void dropped(e.payload));
}
