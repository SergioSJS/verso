// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Files dropped from outside land where the pointer is, never in the
// webview's navigation. The window's own listener, on the document: it
// acts for a drop nothing nearer took. A note's editor, the board and the
// table take a drop themselves (`preventDefault`) and the event still
// bubbles here; acting again would attach the image twice (two files in
// `assets/`, one of them an orphan; night device test, 2026-10-30).

export type DropHooks = {
  /** A `.verso-theme` file dropped anywhere on the window. */
  theme: (file: File) => void;
  /** Files dropped on the sidebar, on the folder at `folder`. */
  folder: (folder: string, files: FileList) => void;
  /** Files dropped on a leaf: whether it took them. `null`: no leaf. */
  leaf: (leaf: HTMLElement | null, files: FileList) => boolean | "none";
  /** Nothing in the drop is for any leaf: say how to attach. */
  hint: () => void;
};

export function windowDrop(e: DragEvent, hooks: DropHooks): void {
  // Before this listener's own `preventDefault`: whoever took the drop
  // first has said so by calling it.
  const taken = e.defaultPrevented;
  e.preventDefault();
  if (taken) return;
  const files = e.dataTransfer?.files ?? null;
  if (!files || files.length === 0) return;
  const theme = [...files].find((f) => f.name.toLowerCase().endsWith(".verso-theme"));
  if (theme) return hooks.theme(theme);
  const at = e.target as HTMLElement;
  const side = at.closest(".side");
  if (side) return hooks.folder(at.closest<HTMLElement>("[data-folder]")?.dataset["folder"] ?? "", files);
  if (hooks.leaf(at.closest<HTMLElement>(".leaf"), files) === "none") hooks.hint();
}
