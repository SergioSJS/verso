// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The server's room for the harness (ADR 0082 item 16): a synced folder's
// live note, with the server played in the page. A test says the sync's
// link is up (`connect`), types as another person (`type`), shows them in
// the note (`present`); the window's room commands are answered here, and
// a room's save lands on the folder in memory, as sync brings it down.
// While the link is down the room answers `unavailable`, as the host does.

import { emit } from "@tauri-apps/api/event";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import type { Capabilities, ContractError, NoteText } from "../bindings";
import { type Core, fromBase64, toBase64 } from "./core";

type Room = { doc: Y.Doc; epoch: string; revision: string };

function unavailable(): never {
  const e: ContractError = { kind: "unavailable", message: "the folder's sync is not connected" };
  throw e;
}

export class Rooms {
  /** The sync's link is up: the folder's notes may be live. */
  up = false;
  private readonly rooms = new Map<string, Room>();
  private epochs = 0;
  /** The others' documents and presences, by name. */
  private readonly people = new Map<string, { doc: Y.Doc; awareness: Awareness }>();

  constructor(private readonly core: Core) {
    const h = core.handlers;
    const own = h["capabilities"]!;
    h["capabilities"] = (a) => {
      const c = own(a) as Capabilities;
      return this.up ? { ...c, can: [...c.can, "collab"], latency_ms: 12 } : c;
    };
    h["collab_join"] = (a) => {
      if (!this.up) unavailable();
      const path = String(a["path"]);
      const room = this.room(path);
      return { update: toBase64(Y.encodeStateAsUpdate(room.doc)), revision: room.revision, read_only: false, crlf: false, user: "Ana", epoch: room.epoch };
    };
    h["collab_update"] = (a) => {
      if (!this.up) unavailable();
      const room = this.rooms.get(String(a["path"]));
      if (!room) unavailable();
      Y.applyUpdate(room.doc, fromBase64(String(a["update"])), "window");
      return null;
    };
    h["collab_awareness"] = () => {
      if (!this.up) unavailable();
      return null;
    };
    h["collab_leave"] = () => null;
    h["collab_save"] = (a) => {
      if (!this.up) unavailable();
      return this.save(String(a["path"]));
    };
    h["collab_resolve"] = (a) => {
      if (!this.up) unavailable();
      return this.save(String(a["path"]));
    };
  }

  private room(path: string): Room {
    let room = this.rooms.get(path);
    if (room) return room;
    const doc = new Y.Doc();
    doc.getText("verso").insert(0, this.core.read(path) ?? "");
    const note = this.core.handlers["read_note"]!({ path }) as NoteText;
    room = { doc, epoch: `e${++this.epochs}`, revision: note.revision };
    this.rooms.set(path, room);
    return room;
  }

  /** The room's text written, as sync brings the server's save down. */
  save(path: string): string {
    const room = this.rooms.get(path);
    if (!room) unavailable();
    this.core.writeOutside(path, room.doc.getText("verso").toString());
    room.revision = `r${Date.now()}`;
    void emit("collab-saved", { path, revision: room.revision });
    return room.revision;
  }

  /** The room's text now. */
  text(path: string): string {
    return this.rooms.get(path)?.doc.getText("verso").toString() ?? "";
  }

  /** Made again from the disk, as after the grace: another epoch. */
  forget(path: string): void {
    this.rooms.delete(path);
  }

  private person(name: string, path: string): { doc: Y.Doc; awareness: Awareness } {
    let p = this.people.get(name);
    if (!p) {
      const doc = new Y.Doc();
      const awareness = new Awareness(doc);
      awareness.setLocalStateField("user", { name, color: "#1565c0", colorLight: "#1565c033" });
      p = { doc, awareness };
      this.people.set(name, p);
    }
    Y.applyUpdate(p.doc, Y.encodeStateAsUpdate(this.room(path).doc));
    return p;
  }

  /** `name` is in the note: their presence told to the window. */
  present(path: string, name: string): void {
    const p = this.person(name, path);
    void emit("collab-awareness", { path, update: toBase64(encodeAwarenessUpdate(p.awareness, [p.doc.clientID])) });
  }

  /** `name` leaves the note. */
  absent(path: string, name: string): void {
    const p = this.people.get(name);
    if (!p) return;
    p.awareness.setLocalState(null);
    void emit("collab-awareness", { path, update: toBase64(encodeAwarenessUpdate(p.awareness, [p.doc.clientID])) });
  }

  /** `name` types `text` at the end of the note: into the room, and told
   *  to the window as the server relays it. */
  type(path: string, name: string, text: string): void {
    const p = this.person(name, path);
    const before = Y.encodeStateVector(p.doc);
    const t = p.doc.getText("verso");
    t.insert(t.length, text);
    const update = Y.encodeStateAsUpdate(p.doc, before);
    Y.applyUpdate(this.room(path).doc, update, name);
    void emit("collab-update", { path, update: toBase64(update) });
  }
}
