// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A table's column widths, dragged in Reading or in Edit mode, kept by
 *  Verso and never in the file (ADR 0064, revised on 2026-10-07): the
 *  Markdown stays a table Obsidian reads as it always did. A table is
 *  named by its folder, its note and its place among the note's tables,
 *  with its number of columns: a table that gained or lost a column
 *  starts again at its natural widths. */

/** One column's width in pixels, or null where it was never dragged. */
export type Widths = (number | null)[];

/** Where a table's widths are read and kept. */
export type WidthStore = { get(): Widths | undefined; set(widths: Widths): void };

const KEY = "verso.tableWidths";
/** Narrowest a dragged column gets. */
const MIN = 40;

type Saved = Record<string, Record<string, Widths>>;

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}

function save(all: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // No storage: the widths last as long as the view.
  }
}

const noteKey = (folder: string, note: string) => `${folder}\u0000${note}`;

/** The store of the `ordinal`-th table of `note`, with `cols` columns. */
export function tableWidths(folder: string, note: string, ordinal: number, cols: number): WidthStore {
  const table = `${ordinal}:${cols}`;
  return {
    get: () => {
      const w = load()[noteKey(folder, note)]?.[table];
      return Array.isArray(w) && w.length === cols ? w : undefined;
    },
    set: (widths) => {
      const all = load();
      const k = noteKey(folder, note);
      all[k] = { ...(all[k] ?? {}), [table]: widths };
      save(all);
    },
  };
}

/** A note moved or renamed, or a folder with the notes in it: their
 *  tables keep their widths. */
export function tableWidthsMoved(folder: string, from: string, to: string): void {
  const all = load();
  const prefix = noteKey(folder, "");
  let changed = false;
  for (const k of Object.keys(all)) {
    if (!k.startsWith(prefix)) continue;
    const note = k.slice(prefix.length);
    const moved = note === from ? to : note.startsWith(`${from}/`) ? to + note.slice(from.length) : null;
    if (moved === null) continue;
    all[noteKey(folder, moved)] = all[k] ?? {};
    delete all[k];
    changed = true;
  }
  if (changed) save(all);
}

/** A grip at the right edge of each header cell: drag it to set the
 *  column's width, kept in `store` when the drag ends; the widths kept
 *  are put on the cells now. */
export function wireColumnGrips(headers: HTMLElement[], store: WidthStore, grip: () => HTMLElement): void {
  const kept = store.get();
  headers.forEach((th, c) => {
    const w = kept?.[c];
    if (typeof w === "number") {
      th.style.width = `${w}px`;
      th.style.minWidth = `${w}px`;
    }
    if (th.querySelector(":scope > .table-col-grip")) return;
    const g = grip();
    g.classList.add("table-col-grip");
    th.style.position = "relative";
    th.append(g);
    g.addEventListener("mousedown", (e) => e.preventDefault());
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startWidth = th.offsetWidth;
      const onMove = (ev: PointerEvent) => {
        const next = Math.max(MIN, startWidth + (ev.clientX - startX));
        th.style.width = `${next}px`;
        th.style.minWidth = `${next}px`;
      };
      const onUp = () => {
        g.removeEventListener("pointermove", onMove);
        g.removeEventListener("pointerup", onUp);
        g.removeEventListener("pointercancel", onUp);
        const widths: Widths = store.get() ?? headers.map(() => null);
        widths[c] = Math.round(th.offsetWidth);
        store.set(widths);
      };
      g.addEventListener("pointermove", onMove);
      g.addEventListener("pointerup", onUp);
      g.addEventListener("pointercancel", onUp);
    });
  });
}
