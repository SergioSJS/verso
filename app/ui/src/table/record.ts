// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a result becomes a line of the table (ADR 0107, phase 1). The places
// that produce results (the dice in a note, a board card or a statblock, the
// palette's roller, the oracle, the room's events) call one of these; none
// of them repeats any of the dice or oracle logic. Nothing is recorded with
// the "Mesa" switch off, and nothing by this window when the active source
// is told its own rolls itself (phase 2's server source).

import type { DiceRoll } from "../bindings";
import { hasCapability } from "../capabilities";
import { diceLook } from "../dice3d";
import type { DiceStyles } from "../dice3d/look";
import { currentFolder } from "../folder";
import { entryOfDraw, entryOfRoll, type OracleKind, type TableEntry, type TableSource } from "./model";
import { makeStore } from "./store";

/** This run's logs, one per folder. */
export const local = makeStore(() => currentFolder);
let active: TableSource = local;

/** The source the panel reads. */
export function tableSource(): TableSource {
  return active;
}

/** Phase 2: the server's per-folder channel replaces the local source. */
export function setTableSource(source: TableSource): void {
  active = source;
  for (const fn of [...changed]) fn();
}
const changed = new Set<() => void>();
/** Told when the active source is replaced. */
export function onSourceChange(fn: () => void): () => void {
  changed.add(fn);
  return () => changed.delete(fn);
}

/** Whether the table exists in this window: its switch is on, and so are the dice. */
export function tableOn(): boolean {
  return hasCapability("table") && hasCapability("diceRolling");
}

/** Whether the panel is on screen now (set by the panel); an entry that
 *  arrives then is seen, not unread. */
let onScreen: () => boolean = () => false;
export function watchOnScreen(fn: () => boolean): void {
  onScreen = fn;
}
export function tableOnScreen(): boolean {
  return tableOn() && onScreen();
}

/** The name the server gave this window's account, learned when a room is
 *  joined; the rolls a room already holds that are this account's are mine. */
let me = "";

function take(e: TableEntry, fresh: boolean): void {
  if (!tableOn() || active !== local) return;
  if (local.add(e, fresh) && onScreen()) local.markSeen();
}

/** A roll this window made (in a note, a card, a statblock, the roller).
 *  `row`: a random table's row, when it was one. */
export function recordRoll(path: string, roll: DiceRoll, row: string | null = null, styles: DiceStyles = diceLook().styles): void {
  take(entryOfRoll(path, roll, { mine: true, row, styles }), false);
}

/** A roll of another person, heard from a note's room. */
export function recordHeard(path: string, roll: DiceRoll, row: string | null = null): void {
  take({ ...entryOfRoll(path, roll, { mine: roll.by !== "" && roll.by === me, row }), elsewhere: true }, true);
}

/** The rolls a room already held when this window joined it: history, not news. */
export function recordJoined(path: string, rolls: readonly DiceRoll[], user: string): void {
  if (user) me = user;
  for (const roll of rolls) take(entryOfRoll(path, roll, { mine: roll.by !== "" && roll.by === me }), false);
}

/** An oracle draw: this window's own (`by` empty or the room's name for it) or heard. */
export function recordDraw(path: string, d: { kind: OracleKind; by: string; mine: boolean; at?: string; roll: number | null; text: string; table?: string | null }): void {
  const parsed = d.at ? Date.parse(d.at) : NaN;
  const at = Number.isFinite(parsed) ? parsed : Date.now();
  take(entryOfDraw(path, { ...d, at }), !d.mine);
}

/** The account's name as the server gave it, or empty before a room was joined. */
export function meName(): string {
  return me;
}
