// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What a data file's card on a board asks of the window (ADR 0057 point 10,
// ADR 0106): the file's text, coloured as the source editor colours it, and
// its diagram, loaded the first time one is shown. Nothing here writes the
// file: a card only reads.

import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";
import type { BoardHost, DataDiagramHandle } from "../board/types";
import { hasCapability } from "../capabilities";
import { h, ui } from "../dom";
import { liveText } from "../datagraph/link";
import { formatOfPath, MAX_BYTES, typeKey } from "../datagraph/model";
import { setLastView } from "../datagraph/store";
import { opening } from "../opening";
import { name } from "../paths";
import { openNote } from "../layout/spaces";

/** A file's text for a card: the open tab's, typing included, else the
 *  disk's — brought down from iCloud first, the board being open on it
 *  (the maintainer, 2026-11-11). */
export async function fileText(path: string): Promise<string | null> {
  const live = liveText(path);
  if (live !== null) return live;
  const r = await opening.readText(path);
  return r.status === "ok" ? r.data.text : null;
}

/** `text` drawn into `el` as code, coloured by the language its file name says. */
export async function renderCode(el: HTMLElement, text: string, path: string): Promise<void> {
  const plain = (): void => {
    el.replaceChildren(text);
  };
  plain();
  const desc = LanguageDescription.matchFilename(languages, path);
  if (!desc) return;
  try {
    const support = await desc.load();
    // The card moved on to other text while the language loaded.
    if (el.textContent !== text) return;
    const tree = support.language.parser.parse(text);
    const frag = document.createDocumentFragment();
    highlightCode(
      text,
      tree,
      classHighlighter,
      (piece: string, classes: string) => frag.append(classes ? h("span", classes, piece) : piece),
      () => frag.append("\n"),
    );
    el.replaceChildren(frag);
  } catch {
    // No colours: the plain text stays.
  }
}

/** The diagram's code, fetched once (the tab's own `loadLibrary` is private to it; the chunk is the same). */
let library: Promise<typeof import("../datagraph/datagraph")> | null = null;
function loadLibrary(): Promise<typeof import("../datagraph/datagraph")> {
  library ??= import("../datagraph/datagraph").catch((e: unknown) => {
    library = null;
    throw e;
  });
  return library;
}

/** The data side of a board's host. `listed` is the board host's way from the
 *  name a node writes to the name the folder lists. */
export function dataHost(listed: (path: string) => string): NonNullable<BoardHost["data"]> {
  return {
    available: (path) => hasCapability("dataDiagram") && formatOfPath(listed(path)) !== null,
    limitMb: MAX_BYTES / 1048576,
    diagram: async (el, path): Promise<DataDiagramHandle | null> => {
      const file = listed(path);
      const format = formatOfPath(file);
      if (!format) return null;
      let lib: typeof import("../datagraph/datagraph");
      try {
        lib = await loadLibrary();
      } catch {
        return null;
      }
      const diagram = new lib.DataDiagram({
        name: name(file),
        canText: false,
        select: () => {},
        toText: () => void openNote(file, false),
        changed: () => {},
        say: (m) => void (ui.status.textContent = m),
        copy: (t) => void navigator.clipboard?.writeText(t).catch(() => undefined),
      });
      el.replaceChildren(diagram.el);
      return {
        set: (t) => {
          diagram.setText(t, format);
          return diagram.limit;
        },
        focus: () => diagram.focusBox(),
        destroy: () => {
          diagram.destroy();
          el.replaceChildren();
        },
      };
    },
  };
}

/** The tab a card opens a data file in is the one it shows: the last view for the type of file. */
export function openData(file: string, view: "text" | "diagram" | undefined): void {
  const type = typeKey(file);
  if (view && type) setLastView(type, view);
}
