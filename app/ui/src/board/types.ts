// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type El } from "./model";
import { type BoardStrings } from "./strings";

/** One of the others on a board edited together, as Excalidraw draws a
 *  collaborator: pointer, selection, name and colour (ADR 0082 item 12). */
export type BoardPerson = {
  username: string;
  color: { background: string; stroke: string };
  pointer?: { x: number; y: number; tool: "pointer" | "laser" };
  button?: "up" | "down";
  selectedElementIds?: Record<string, true>;
  id: string;
};

/** What the board's pane gives a room. */
export type BoardPane = {
  /** The room's elements came in (and its background, when it changed). */
  apply: (remote: El[], background?: string | null) => void;
  /** The others on the board now. */
  people: (people: Map<string, BoardPerson>) => void;
};

/** A board edited by several people at once (ADR 0082 item 12): the way
 *  between the board and its room (boardRoom.ts). The board sends what it
 *  changed and takes in what the others did; it saves nothing itself —
 *  the room writes the file. */
export type BoardRoomLink = {
  /** The pane is up; `drawn`: what it drew, for a room no one drew yet. */
  attach: (pane: BoardPane, drawn: readonly El[]) => void;
  detach: (pane: BoardPane) => void;
  /** The scene changed; `user`: a person's edit is in it. */
  scene: (elements: readonly El[], background: string, user: boolean) => void;
  /** What waits to go out, now. */
  push: () => void;
  /** Whether this window's version of an element is still on its way. */
  mine: (e: El) => boolean;
  pointer: (x: number, y: number, tool: "pointer" | "laser", button: "up" | "down") => void;
  selected: (ids: readonly string[]) => void;
};

/** What the window gives the board: its contract calls and its dialogs. */
export type BoardHost = {
  strings: BoardStrings;
  /** `pt-BR` or `en`: the interface's language. */
  lang: string;
  dark: () => boolean;
  /** The canvas as the board holds it, to be saved (the core lays it over
   *  the file as read). */
  save: (json: string) => Promise<void> | void;
  /** The person only reads the folder (a reader on a server, ADR 0076
   *  item 11): the board is shown and never written. */
  readOnly?: () => boolean;
  /** The user changed the board: the tab has unsaved work from now on,
   *  before the save's delay runs out. */
  changed?: () => void;
  /** The change was undone before it was saved: the board holds what was
   *  last sent, and the tab has nothing unsaved of the board's. */
  settled?: () => void;
  openFile: (path: string, aside: boolean) => void;
  /** Draw a note into `el` as the reading view draws it (sanitized, its
   *  images and embeds resolved, its links live). */
  renderNote: (el: HTMLElement, path: string) => Promise<void>;
  /** Draw a text card's Markdown the same way, from the board's folder. */
  renderText: (el: HTMLElement, text: string) => Promise<void>;
  /** A note's text, for the board's search. */
  noteText: (path: string) => Promise<string>;
  fileSrc: (path: string) => string;
  /** A copy of a picture at the size a card shows it (null: none made). */
  pictureCopy: (src: string) => Promise<string | null>;
  exists: (path: string) => boolean;
  /** Choose a file of the folder; `query` fills the search first. */
  pickFile: (query?: string) => Promise<string | null>;
  /** Show the PDF at `path` inside `el` (ADR 0057 point 3); the function
   *  returned takes it down. */
  renderPdf: (el: HTMLElement, path: string) => () => void;
  prompt: (label: string, initial: string, multiline: boolean) => Promise<string | null>;
  /** Write the relation into the source note, after showing the diff;
   *  true when it was written. */
  promote: (from: string, to: string, key: string) => Promise<boolean>;
  openUrl: (url: string) => void;
  /** Run the window's command a key is bound to; true when one ran. */
  appKey: (e: KeyboardEvent) => boolean;
  status: (text: string) => void;
  /** Edit a note inside `el`, in the window's note editor; `onExit` is
   *  asked for by Escape. */
  editNote: (el: HTMLElement, path: string, onExit: () => void) => CardEditing;
  /** A card's editor was left with a history this board keeps. */
  edited: (path: string) => boolean;
  /** The board's settings (ADR 0057, 2026-09-30). */
  prefs: BoardPrefs;
  /** Where this board was last looked at, kept in this window's storage. */
  lastView: () => SavedView | null;
  rememberView: (v: SavedView) => void;
  /** The board's name, for an exported picture's. */
  name: () => string;
  /** Write a picture of the board into the folder, beside the board; the
   *  path written, or null (said). */
  saveImage: (name: string, base64: string) => Promise<string | null>;
  /** The board is in a room: edited together, written by the room. */
  room?: BoardRoomLink;
};

/** What the settings say of boards. */
export type BoardPrefs = {
  /** The stroke a new shape takes: clean lines or hand-drawn. */
  stroke: "clean" | "hand";
  /** The font of new text drawn on the board. */
  font: "hand" | "sans" | "mono";
  /** The grid, and snapping to it, when a board opens. */
  grid: boolean;
  /** A board opens with all of it in view, or where it was left. */
  open: "fit" | "last";
};

export type SavedView = { scrollX: number; scrollY: number; zoom: number };

/** A note being edited in its card. */
export type CardEditing = {
  /** Save now; true when nothing is left unsaved (false: a conflict waits). */
  flush: () => Promise<boolean>;
  /** The folder changed: meet the note on disk. */
  recheck: () => Promise<void>;
  /** The caret where the pointer is, and the keyboard in the editor. */
  focusAt: (x: number, y: number) => void;
  /** Undo or redo in the editor, the keyboard in it. */
  run: (command: "undo" | "redo") => void;
  destroy: () => void;
  /** True when changes in the card editor are unsaved. */
  isDirty?: () => boolean;
  /** True when a conflict banner is active on the card editor. */
  isConflicted?: () => boolean;
  /** The note path being edited. */
  targetPath?: () => string;
};

export type BoardHandle = {
  /** Show a canvas's text; false when it is not JSON. */
  load: (text: string) => boolean;
  /** The folder changed: every card asks for its note again. */
  refresh: () => void;
  /** Go to the board's search (⌘F). */
  find: () => void;
  focus: () => void;
  /** Put a file of the folder on the board, at a point of the screen (the
   *  middle of the view without one). */
  addPath: (path: string, clientX?: number, clientY?: number) => void;
  /** Save now what the board holds and has not saved: before its tab
   *  closes, the window quits or the folder changes. */
  flush: () => Promise<void>;
  destroy: () => void;
};
