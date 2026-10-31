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
import type { Capabilities, ContractError, DiceRoll, NoteText, OracleAsk, OracleDraw } from "../bindings";
import { readNotation, rollHere } from "../dice/notation";
import { type Core, fromBase64, toBase64 } from "./core";
import { oracleDrawHere } from "./oracleDraw";

type Room = { doc: Y.Doc; epoch: string; revision: string; board: boolean; canvas: string | null; rolls: DiceRoll[] };

function unavailable(): never {
  const e: ContractError = { kind: "unavailable", message: "the folder's sync is not connected" };
  throw e;
}

export class Rooms {
  /** The sync's link is up: the folder's notes may be live. */
  up = false;
  /** A test: the side answers as a server's (a window on a server's folder), not as this computer's synced folder. */
  asServer = false;
  /** A test: the room's join answers after this many ms (a server across a network). */
  joinDelay = 0;
  private readonly rooms = new Map<string, Room>();
  private epochs = 0;
  /** The others' documents and presences, by name. */
  private readonly people = new Map<string, { doc: Y.Doc; awareness: Awareness }>();
  /** Who is in each note, by path. */
  private readonly inside = new Map<string, Set<string>>();

  constructor(private readonly core: Core) {
    const h = core.handlers;
    const own = h["capabilities"]!;
    h["capabilities"] = (a) => {
      const c = own(a) as Capabilities;
      return this.up ? { ...c, host: this.asServer ? "server" : c.host, can: [...c.can, "collab"], latency_ms: 12 } : c;
    };
    h["collab_join"] = (a) => {
      if (!this.up) unavailable();
      const path = String(a["path"]);
      const answer = (): unknown => {
        const room = this.room(path);
        return { kind: room.board ? "board" : "text", update: toBase64(Y.encodeStateAsUpdate(room.doc)), revision: room.revision, read_only: false, crlf: false, user: "Ana", epoch: room.epoch, rolls: [...room.rolls] };
      };
      return this.joinDelay > 0 ? new Promise((resolve) => setTimeout(() => resolve(answer()), this.joinDelay)) : answer();
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
    // A board's file as the window made it of the room's state (ADR 0082
    // item 12): what the room's save writes.
    h["collab_canvas"] = (a) => {
      if (!this.up) unavailable();
      const room = this.rooms.get(String(a["path"]));
      if (!room?.board) unavailable();
      room.canvas = String(a["json"]);
      return null;
    };
    // Dice in the room (ADR 0088 item 4): the server's roll, named after
    // the window's account, kept for whoever joins.
    h["collab_roll"] = (a) => {
      if (!this.up) unavailable();
      const room = this.rooms.get(String(a["path"]));
      const notation = readNotation(String(a["notation"]));
      if (!room || !notation) {
        const e: ContractError = { kind: "refused", message: room ? "not a roll Verso reads" : "join the note first" };
        throw e;
      }
      const source = a["source"] === null || a["source"] === undefined ? null : String(a["source"]);
      const occurrence = typeof a["occurrence"] === "number" && a["occurrence"] >= 0 && a["occurrence"] < 1000 ? a["occurrence"] : null;
      return this.keep(room, { ...rollHere(notation, source), by: "Ana", ...(occurrence === null ? {} : { occurrence }) });
    };
    // The oracle in the room (ADR 0102 item 5): drawn by the server, named
    // after the window's account, heard by the others; nothing kept.
    h["collab_oracle"] = (a) => {
      if (!this.up) unavailable();
      if (!this.rooms.get(String(a["path"]))) {
        const e: ContractError = { kind: "refused", message: "join the note first" };
        throw e;
      }
      return oracleDrawHere(a["ask"] as OracleAsk, "Ana", new Date().toISOString());
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
    // Someone else is in the note: those `present` named and not `absent`.
    h["collab_present"] = (a) => {
      if (!this.up) unavailable();
      return (this.inside.get(String(a["path"]))?.size ?? 0) > 0;
    };
  }

  private room(path: string): Room {
    let room = this.rooms.get(path);
    if (room) return room;
    const doc = new Y.Doc();
    const board = /\.canvas$/i.test(path);
    // A board's room holds the file it was made from; the window draws it
    // in (boardRoom.ts).
    if (board) doc.getMap("meta").set("base", this.core.read(path) ?? "");
    else doc.getText("verso").insert(0, this.core.read(path) ?? "");
    const read = this.core.handlers[board ? "read_text" : "read_note"]!({ path }) as NoteText;
    room = { doc, epoch: `e${++this.epochs}`, revision: read.revision, board, canvas: null, rolls: [] };
    this.rooms.set(path, room);
    return room;
  }

  /** The room's text written, as sync brings the server's save down. */
  save(path: string): string {
    const room = this.rooms.get(path);
    if (!room) unavailable();
    if (room.board) {
      // The core lays the board's canvas over the file, as the server's
      // room writes it.
      if (room.canvas !== null) {
        const laid = this.core.handlers["board_preview"]!({ path, json: room.canvas }) as string;
        this.core.writeOutside(path, laid);
      }
    } else this.core.writeOutside(path, room.doc.getText("verso").toString());
    // The revision the room wrote is the file's own, as the server's is once
    // sync has brought the file down: a board holding it can read the text
    // at that revision and judge later outside news against it.
    const written = this.core.handlers[room.board ? "read_text" : "read_note"]!({ path }) as NoteText;
    room.revision = written.revision;
    void emit("collab-saved", { path, revision: room.revision });
    return room.revision;
  }

  /** The live room of `path`, when the note has one: a restore goes
   *  through it (ADR 0091 item 5) — its text replaced whole, as the
   *  server's room takes it, and told to the window as the server relays
   *  it. */
  live(path: string): { replace: (text: string) => void } | null {
    const room = this.rooms.get(path);
    if (!room || room.board) return null;
    return {
      replace: (text: string) => {
        const before = Y.encodeStateVector(room.doc);
        const t = room.doc.getText("verso");
        room.doc.transact(() => {
          t.delete(0, t.length);
          t.insert(0, text);
        }, "server");
        void emit("collab-update", { path, update: toBase64(Y.encodeStateAsUpdate(room.doc, before)) });
      },
    };
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
    // Back after `absent`, which cleared their presence.
    if (p.awareness.getLocalState() === null) p.awareness.setLocalState({ user: { name, color: "#1565c0", colorLight: "#1565c033" } });
    const names = this.inside.get(path) ?? new Set<string>();
    names.add(name);
    this.inside.set(path, names);
    void emit("collab-awareness", { path, update: toBase64(encodeAwarenessUpdate(p.awareness, [p.doc.clientID])) });
  }

  /** `name` leaves the note. */
  absent(path: string, name: string): void {
    this.inside.get(path)?.delete(name);
    const p = this.people.get(name);
    if (!p) return;
    p.awareness.setLocalState(null);
    void emit("collab-awareness", { path, update: toBase64(encodeAwarenessUpdate(p.awareness, [p.doc.clientID])) });
  }

  /** A roll kept by the room, its last twenty. */
  private keep(room: Room, roll: DiceRoll): DiceRoll {
    room.rolls.push(roll);
    if (room.rolls.length > 20) room.rolls.shift();
    return roll;
  }

  /** `name` rolls `notation` in the note (a table's `source` with it):
   *  the server's roll, told to the window as the server relays it. */
  roll(path: string, name: string, notation: string, source: string | null = null, faces: number[] | null = null, occurrence: number | null = null): DiceRoll {
    const read = readNotation(notation);
    if (!read) throw new Error(`not a roll: ${notation}`);
    let i = 0;
    // A test may say what the dice show: face f is the 32-bit draw f - 1.
    const draws = faces ? () => ((faces[i++] ?? 1) - 1) / 2 ** 32 : undefined;
    const roll = this.keep(this.room(path), { ...rollHere(read, source, draws), by: name, ...(occurrence === null ? {} : { occurrence }) });
    void emit("collab-roll", { path, roll });
    return roll;
  }

  /** `name` asks the oracle in the note: the server's draw, told to the
   *  window as the server relays it. */
  oracle(path: string, name: string, ask: OracleAsk): OracleDraw {
    const draw = oracleDrawHere(ask, name, new Date().toISOString());
    void emit("collab-oracle", { path, draw });
    return draw;
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
