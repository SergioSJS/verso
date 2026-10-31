// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Who sees a note of a table (ADR 0110 item 4, amended 2026-10-23): nobody,
// the whole table, or a set of its players. The logic that needs no page:
// toggling one player in the set, who has what access, and the words that
// name it for a screen reader. The menu (campaign.ts) and the note's access
// indicator (noteAccess.ts) are made of it; the node test tries it alone.

import type { CampaignAudience, CampaignGrant, CampaignPerson } from "./bindings";

export type Access = "edits" | "sees" | "none";
export type Who = { id: string; name: string };

export const HIDDEN: CampaignAudience = { kind: "hidden" };
export const TABLE: CampaignAudience = { kind: "table" };

/** The accounts an audience holds, among the table's players. */
export function audienceIds(a: CampaignAudience, all: readonly string[]): string[] {
  if (a.kind === "hidden") return [];
  if (a.kind === "table") return [...all];
  return all.filter((id) => a.accounts.includes(id));
}

/** Whether the player `id` sees a note released to `a`. */
export function sees(a: CampaignAudience, id: string, all: readonly string[]): boolean {
  return audienceIds(a, all).includes(id);
}

/** A set of players as an audience: an empty set is hidden. */
export function ofPlayers(ids: readonly string[]): CampaignAudience {
  return ids.length === 0 ? HIDDEN : { kind: "players", accounts: [...ids] };
}

/** The audience after the game master toggles the player `id`: from the
 *  whole table it becomes all the others; a set never turns into "table" by
 *  itself (only the explicit row does); an empty set is hidden. */
export function togglePlayer(a: CampaignAudience, id: string, all: readonly string[]): CampaignAudience {
  const now = audienceIds(a, all);
  return ofPlayers(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]);
}

export function sameAudience(a: CampaignAudience, b: CampaignAudience): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== "players" || b.kind !== "players") return true;
  return a.accounts.length === b.accounts.length && a.accounts.every((x) => b.accounts.includes(x));
}

/** What the player `id` can do with a note released to `a` and granted by `g`. */
export function accessOf(a: CampaignAudience, g: CampaignGrant, id: string, all: readonly string[]): Access {
  if (g.kind === "group" || (g.kind === "player" && g.account === id)) return "edits";
  return sees(a, id, all) ? "sees" : "none";
}

/** Every player of the table with what each can do: the game master's list. */
export function peopleOf(a: CampaignAudience, g: CampaignGrant, players: readonly Who[]): CampaignPerson[] {
  const all = players.map((p) => p.id);
  return players.map((p) => ({ id: p.id, name: p.name, access: accessOf(a, g, p.id, all), you: false }));
}

/** The players who see the note after a change and did not before. */
export function gained(before: CampaignAudience, after: CampaignAudience, all: readonly string[]): string[] {
  const was = audienceIds(before, all);
  return audienceIds(after, all).filter((id) => !was.includes(id));
}

export type Tally = { total: number; seeing: number; editing: number };

export function tally(people: readonly CampaignPerson[]): Tally {
  const seeing = people.filter((p) => p.access !== "none").length;
  return { total: people.length, seeing, editing: people.filter((p) => p.access === "edits").length };
}

/** The words the indicator needs, in the window's language (campaignStrings.ts). */
export type Words = {
  ownerName: (seeing: number, total: number) => string;
  playerTable: string;
  playerOnlyYou: string;
  playerNames: (list: string) => string;
  /** The word for the person asking, in a list of names. */
  you: string;
};

function listOf(names: readonly string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** The indicator's accessible name for the game master: "2 of 3 players". */
export function ownerLabel(t: Tally, w: Words): string {
  return w.ownerName(t.seeing, t.total);
}

/** The indicator's accessible name for a player: who else sees it, and the
 *  game master, who always does. Never a name of someone who cannot see it
 *  (the server sends none). `master` is the game master's name. */
export function playerLabel(a: CampaignAudience, people: readonly CampaignPerson[], master: string, w: Words, lang: string): string {
  if (a.kind === "table") return w.playerTable;
  if (a.kind === "players" && people.length === 1 && people[0]?.you) return w.playerOnlyYou;
  return w.playerNames(listOf([...yourFirst(people).map((p) => (p.you ? w.you : p.name)), master].filter((x) => x !== ""), lang));
}

/** The people, the one asking first: "You, Bruno and the game master". */
export function yourFirst(people: readonly CampaignPerson[]): CampaignPerson[] {
  return [...people].sort((x, y) => Number(y.you) - Number(x.you));
}

/** The count drawn beside the icon: "2/3" for the game master; for a
 *  player, how many people see the note, the game master with them. */
export function countText(viewer: "owner" | "player", t: Tally, a: CampaignAudience, people: readonly CampaignPerson[], tableWord: string): string {
  if (viewer === "owner") return `${t.seeing}/${t.total}`;
  return a.kind === "table" ? tableWord : String(people.length + 1);
}
