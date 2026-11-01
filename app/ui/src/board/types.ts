// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { MapInfo } from "../bindings";
import { type El } from "./model";
import type { Layouts } from "./roomModel";
import { type BoardStrings } from "./strings";
import type { BoardPreview } from "./hooks";

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
  /** The room's elements came in (and its background, when it changed):
   *  the ids the board took in — not the ones it kept, its own or busy. */
  apply: (remote: El[], background?: string | null) => string[];
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
  /** The texts this window laid out: the only ones it measures again. */
  readonly layouts: Layouts;
  pointer: (x: number, y: number, tool: "pointer" | "laser", button: "up" | "down") => void;
  selected: (ids: readonly string[]) => void;
  /** The others on the board now. */
  people: () => Map<string, BoardPerson>;
  /** Everything the room holds, into the board again. */
  resync: () => void;
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
  /** Open a file in a tab; `view` is the way a data file's card shows it
   *  (text or diagram), which the tab then opens in. */
  openFile: (path: string, aside: boolean, view?: "text" | "diagram") => void;
  /** Draw a note into `el` as the reading view draws it (sanitized, its
   *  images and embeds resolved, its links live). */
  renderNote: (el: HTMLElement, path: string) => Promise<void>;
  /** Draw a text card's Markdown the same way, from the board's folder. */
  renderText: (el: HTMLElement, text: string) => Promise<void>;
  /** A text file's whole text, as the window holds it (an open tab's first,
   *  typing not yet saved included); null when it cannot be read. */
  fileText: (path: string) => Promise<string | null>;
  /** Draw `text` into `el` as source code, coloured by what `path`'s name
   *  says it is (the source editor's own language data, loaded when needed). */
  renderCode: (el: HTMLElement, text: string, path: string) => Promise<void>;
  /** The data diagram of a data file (ADR 0106), when the window has it:
   *  `available` is false for a file it cannot read and when its switch
   *  (ADR 0103) is off. Absent where the window has no diagram. */
  data?: DataHost;
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
  /** The player of the sound file at `path` inside `el` (ADR 0116,
   *  amendment of 2026-11-01); the function returned takes it down. */
  renderAudio?: (el: HTMLElement, path: string) => () => void;
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
  /** The window's hover preview: a card's note where the pointer rests
   *  on its name, or under a finger held still (ADR 0085 item 2). */
  preview?: BoardPreview;
  /** The tiles of a map's picture (ADR 0090 item 4): how they stand —
   *  asked again while the core cuts them — and one tile, a PNG as base64
   *  (null: not there). Where the host cuts none, a large picture is drawn
   *  whole, as any is. */
  maps?: {
    open: (path: string) => Promise<MapInfo>;
    tile: (path: string, level: number, x: number, y: number) => Promise<string | null>;
  };
  /** Secret cards (ADR 0090 item 5): whether a UniVerso serves the folder
   *  (a lock says "hidden from readers" there, "visible to anyone with the
   *  file" in a folder of this computer), and the board as one who may only
   *  read it is served it (the core's projection) for the writer's "view as
   *  a reader". */
  secret?: {
    served: () => boolean;
    project: (json: string) => Promise<string>;
  };
  /** A web page shown live in a link card (ADR 0057 point 10, decided
   *  2026-10-21; ADR 0056): the window's approvals and its frameability
   *  check. Absent where the window cannot show a page; a page card is
   *  then a link card. */
  web?: BoardWeb;
  /** A note's sticker drawn at `size`, for its pin; null for none. */
  sticker?: (path: string, size: number) => HTMLElement | null;
};

/** A diagram drawn in a card. */
export type DataDiagramHandle = {
  /** The text again (the file changed); why no diagram can be drawn of it,
   *  if it cannot (the card then shows the text). */
  set: (text: string) => "tooBig" | "tooMany" | null;
  /** The keyboard goes into the diagram. */
  focus: () => void;
  destroy: () => void;
};

/** What a data card needs of the window (ADR 0106, ADR 0103). */
export type DataHost = {
  available: (path: string) => boolean;
  /** The size past which no diagram is drawn, in MB (for the reason said). */
  limitMb: number;
  diagram: (el: HTMLElement, path: string) => Promise<DataDiagramHandle | null>;
};

/** What a page card needs of the window (ADR 0056). */
export type BoardWeb = {
  /** Why the page may not load yet: its origin is not approved (`origin`),
   *  remote content is off (`remote`) or it is no web address (`invalid`);
   *  null when it may load. */
  gate: (url: string) => { why: "origin" | "remote"; origin: string } | { why: "invalid" } | null;
  /** The origin approved for good, the same list as the notes'. */
  approve: (origin: string) => Promise<boolean>;
  /** The warning to show before approving, if the site forbids framing
   *  (the host's one check, made on the click); null for none. */
  warn: (url: string) => Promise<string | null>;
  /** Whether the site allows being framed, once per origin. */
  frameable: (url: string) => Promise<boolean>;
  /** The sandboxed frame for `url`, titled `title`. */
  frame: (url: string, title: string) => HTMLIFrameElement;
  /** The words of the approval, those of the notes' gate. */
  words: { local: string; approve: string; approveAnyway: string };
  /** Whether a name is on the local network, for the stronger wording. */
  isLocal: (hostname: string) => boolean;
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
  /** What a double click on an empty spot creates: a Markdown text card, or Excalidraw's drawn text. */
  doubleClick: "card" | "drawn";
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
  /** Put a text card (Markdown) on the board, at a point of the screen. */
  addText: (text: string, clientX?: number, clientY?: number) => void;
  /** Save now what the board holds and has not saved: before its tab
   *  closes, the window quits or the folder changes. */
  flush: () => Promise<void>;
  destroy: () => void;
};
