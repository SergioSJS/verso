// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Several people in one note (ADR 0073 item 7): where the side the window
// talks to can do it (`capabilities`: `collab`, a server), a note opened
// for editing joins the server's room — a Yjs document bound to the
// editor by y-codemirror.next. The window's edits go to the room, the
// others' come from it, and the server writes the file; the window still
// says when its text is saved and shows a conflict when the disk changed
// while edits waited.

import { listen } from "@tauri-apps/api/event";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { yCollab, ySyncAnnotation, yUndoManagerKeymap } from "y-codemirror.next";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { commands, type Capabilities, type CollabState, type CollabUpdate } from "./bindings";

let capabilities: Promise<Capabilities | null> | null = null;

/** What the side the window talks to can do, asked once. */
export function sideCan(): Promise<Capabilities | null> {
  capabilities ??= commands.capabilities().then((r) => (r.status === "ok" ? r.data : null));
  return capabilities;
}

/** Ask again (the person's role in the folder changed). */
export function forgetCapabilities(): void {
  capabilities = null;
}

export async function canCollab(): Promise<boolean> {
  return (await sideCan())?.can.includes("collab") ?? false;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** What the note's tab hears of its room. */
export type CollabHandlers = {
  saved: (revision: string) => void;
  conflict: () => void;
  /** The room is gone: the tab reads the note again — `lost` when text
   *  typed while the connection was down could not go along. */
  closed: (why?: "lost") => void;
  /** Someone else's edit arrived: the reading view may be stale. */
  remote: () => void;
};

const REMOTE = "remote";
/** A colour for each person, from their name. */
const COLORS = ["#b5651d", "#2e7d32", "#1565c0", "#6a1b9a", "#ad1457", "#00838f", "#9e9d24", "#5d4037"];

export class CollabSession {
  readonly doc = new Y.Doc();
  readonly text: Y.Text;
  readonly awareness: Awareness;
  readonly crlf: boolean;
  revision: string;
  epoch: string;
  private closedLocally = false;

  constructor(
    readonly path: string,
    joined: { update: string; revision: string; crlf: boolean; user: string; epoch: string },
    readonly handlers: CollabHandlers,
  ) {
    this.text = this.doc.getText("verso");
    Y.applyUpdate(this.doc, fromB64(joined.update), REMOTE);
    this.revision = joined.revision;
    this.crlf = joined.crlf;
    this.epoch = joined.epoch;
    this.awareness = new Awareness(this.doc);
    let hash = 0;
    for (const c of joined.user) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    const color = COLORS[hash % COLORS.length] ?? "#b5651d";
    this.awareness.setLocalStateField("user", { name: joined.user, color, colorLight: `${color}33` });
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE || this.closedLocally) return;
      void commands.collabUpdate(this.path, toB64(update));
    });
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === REMOTE || this.closedLocally) return;
      const changed = [...added, ...updated, ...removed];
      void commands.collabAwareness(this.path, toB64(encodeAwarenessUpdate(this.awareness, changed)));
    });
    sessions.set(this.path, this);
  }

  /** The editor's binding: the text kept in step with the room, the
   *  others' cursors and names, and ⌘Z undoing this window's edits only. */
  extension(): Extension {
    const undoManager = new Y.UndoManager(this.text);
    return [yCollab(this.text, this.awareness, { undoManager }), Prec.highest(keymap.of(yUndoManagerKeymap))];
  }

  /** The text as it starts in the editor (`\n` line ends). */
  initial(): string {
    return this.text.toString();
  }

  applyRemote(update: string): void {
    Y.applyUpdate(this.doc, fromB64(update), REMOTE);
    this.handlers.remote();
  }

  applyAwareness(update: string): void {
    applyAwarenessUpdate(this.awareness, fromB64(update), REMOTE);
  }

  /** The connection came back: into the room again. The same room (it
   *  outlives a dropped connection two minutes): its state comes in and
   *  this window's whole state goes out — Yjs keeps each edit once, so
   *  what was typed meanwhile joins without doubling. Another room, made
   *  again from the disk: the tab reads the note anew, and says so if
   *  something typed meanwhile could not go along. */
  async rejoin(): Promise<void> {
    if (this.closedLocally) return;
    const r = await commands.collabJoin(this.path);
    if (r.status !== "ok" || r.data.read_only) return this.handlers.closed();
    if (r.data.epoch === this.epoch) {
      Y.applyUpdate(this.doc, fromB64(r.data.update), REMOTE);
      void commands.collabUpdate(this.path, toB64(Y.encodeStateAsUpdate(this.doc)));
      this.revision = r.data.revision;
      return;
    }
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, fromB64(r.data.update));
    const same = fresh.getText("verso").toString() === this.text.toString();
    fresh.destroy();
    this.leave();
    this.handlers.closed(same ? undefined : "lost");
  }

  /** The tab goes, or reads another note: out of the room. */
  leave(): void {
    if (this.closedLocally) return;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.closedLocally = true;
    sessions.delete(this.path);
    this.awareness.destroy();
    this.doc.destroy();
    void commands.collabLeave(this.path);
  }
}

const sessions = new Map<string, CollabSession>();
let listening = false;

function hear(): void {
  if (listening) return;
  listening = true;
  addEventListener("verso:reconnected", () => {
    for (const s of [...sessions.values()]) void s.rejoin();
  });
  void listen<CollabUpdate>("collab-update", (e) => sessions.get(e.payload.path)?.applyRemote(e.payload.update));
  void listen<CollabUpdate>("collab-awareness", (e) => sessions.get(e.payload.path)?.applyAwareness(e.payload.update));
  void listen<CollabState>("collab-saved", (e) => {
    const s = sessions.get(e.payload.path);
    if (s && e.payload.revision) {
      s.revision = e.payload.revision;
      s.handlers.saved(e.payload.revision);
    }
  });
  void listen<CollabState>("collab-conflict", (e) => sessions.get(e.payload.path)?.handlers.conflict());
  void listen<CollabState>("collab-closed", (e) => {
    const s = sessions.get(e.payload.path);
    if (!s) return;
    s.leave();
    s.handlers.closed();
  });
}

/** Join the room of `path`; null where the side cannot, or the file is
 *  shown read-only (its line ends mixed). */
export async function joinCollab(path: string, handlers: CollabHandlers): Promise<CollabSession | null> {
  if (!(await canCollab())) return null;
  hear();
  sessions.get(path)?.leave();
  const r = await commands.collabJoin(path);
  if (r.status !== "ok" || r.data.read_only) return null;
  return new CollabSession(path, r.data, handlers);
}

/** What the tab says when text typed while the connection was down could
 *  not go into the room, in the window's language. */
export function lostLine(): string {
  return document.documentElement.lang.startsWith("pt")
    ? "A conexão caiu e a nota foi relida do servidor: o que foi digitado enquanto isso não pôde ser mantido."
    : "The connection dropped and the note was read again from the server: what was typed meanwhile could not be kept.";
}

/** Whether an editor transaction came from the room, not from this window. */
export { ySyncAnnotation };
