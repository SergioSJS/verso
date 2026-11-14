// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of the Watabou import (ADR 0120), in pt-BR and English (ADR
// 0035). The generators' own text is never translated.

import { LANG } from "../strings";
import type { HouseWords } from "./houseNote";
import type { NoteWords } from "./notes";

export type WatabouWords = {
  command: string;
  title: string;
  intro: string;
  choose: string;
  dropHere: string;
  where: string;
  cancel: string;
  create: string;
  note: NoteWords;
  /** What the chosen files are. */
  dungeon: (title: string, keys: number, drawing: boolean) => string;
  region: (title: string, towns: number, dangers: number) => string;
  dwelling: (title: string, floors: number, rooms: number) => string;
  noDrawing: string;
  pictures: (n: number) => string;
  empty: string;
  unknown: (names: string) => string;
  two: (names: string) => string;
  other: (generator: string) => string;
  tooBig: (name: string) => string;
  /** What will be made, before it is. */
  makes: (folder: string, board: boolean, files: string[]) => string;
  exists: string;
  made: (folder: string) => string;
  untitledDungeon: string;
  untitledRegion: string;
  untitledHouse: string;
  /** A house's drawing and note (Dwellings). */
  house: HouseWords;
  /** "New generated map…" (ADR 0120 item 5). */
  newMap: string;
  newMapTitle: string;
  newMapIntro: string;
  generator: string;
  seed: string;
  reroll: string;
  mapName: string;
  newMapCreate: string;
  badSeed: string;
  newMapDone: (path: string) => string;
};

const pt: WatabouWords = {
  command: "Importar mapa do Watabou…",
  title: "Importar mapa do Watabou",
  intro: "Exporte o mapa em watabou.github.io: no One Page Dungeon, o JSON (para o desenho) e o Markdown (para a semente); no Perilous Shores, o Save em JSON; no Dwellings, Export › as JSON. Depois escolha ou solte os arquivos aqui.",
  choose: "Escolher arquivos…",
  dropHere: "ou solte os arquivos aqui",
  where: "Pasta",
  cancel: "Cancelar",
  create: "Importar",
  note: { towns: "Cidades", dangers: "Perigos", places: "Lugares", openGenerator: "Abrir no gerador" },
  dungeon: (title, keys, drawing) => `One Page Dungeon “${title}”: ${keys === 1 ? "1 sala numerada" : `${keys} salas numeradas`}${drawing ? ", com o desenho" : ""}.`,
  region: (title, towns, dangers) => `Perilous Shores “${title}”: ${towns === 1 ? "1 cidade" : `${towns} cidades`} e ${dangers === 1 ? "1 perigo" : `${dangers} perigos`}. A nota de cada uma nasce quando você clicar nela.`,
  dwelling: (title, floors, rooms) => `Dwellings “${title}”: ${floors === 1 ? "1 andar" : `${floors} andares`}, ${rooms === 1 ? "1 cômodo" : `${rooms} cômodos`}, com o desenho.`,
  noDrawing: "Sem o JSON não há desenho: só a nota. Solte o JSON junto para ter o mapa.",
  pictures: (n) => (n === 1 ? "1 imagem vai junto." : `${n} imagens vão junto.`),
  empty: "Nenhum mapa escolhido ainda.",
  unknown: (names) => `Não reconheço como export do Watabou: ${names}.`,
  two: (names) => `Um mapa por vez: ${names}.`,
  other: (g) => `Este é um mapa do gerador “${g}”, que ainda não é importado. Por enquanto: One Page Dungeon, Perilous Shores e Dwellings.`,
  tooBig: (name) => `${name} é grande demais para um export do Watabou.`,
  makes: (folder, board, files) => `Cria a pasta “${folder}” com a nota${board ? ", o board com o desenho" : ""}${files.length > 0 ? ` e ${files.join(", ")}` : ""}.`,
  exists: "Já existe algo com esse nome nessa pasta.",
  made: (folder) => `Mapa importado em “${folder}”.`,
  untitledDungeon: "Masmorra",
  untitledRegion: "Região",
  untitledHouse: "Casa",
  house: {
    floor: (level) => (level < 0 ? "Porão (B)" : level === 0 ? "Térreo (GF)" : `${level}º andar (${level}F)`),
    stairsRoom: "Escada",
    passage: "Passagem",
    describe: ({ title, floors, basement, rooms }) =>
      `${title}: casa de ${floors === 1 ? "1 andar" : `${floors} andares`}${basement ? " e porão" : ""}, ${rooms === 1 ? "1 cômodo" : `${rooms} cômodos`}.`,
    entrance: (side, room) => `A entrada fica no lado ${side}, no cômodo ${room}.`,
    side: { n: "norte", e: "leste", s: "sul", w: "oeste" },
    squares: (n) => (n === 1 ? "1 quadrado" : `${n} quadrados`),
    door: (kind, to) =>
      kind === "entrance" ? "entrada da casa" : kind === "door" ? (to ? `porta para ${to}` : "porta para fora") : kind === "opening" ? (to ? `aberto para ${to}` : "aberto para fora") : to ? `vão para ${to}` : "vão para fora",
    stairsUp: "escada que sobe",
    stairsDown: "escada que desce",
    spiral: "escada em caracol, por fora das paredes",
    windows: (n) => (n === 1 ? "1 janela" : `${n} janelas`),
  },
  newMap: "Novo mapa gerado…",
  newMapTitle: "Novo mapa gerado",
  newMapIntro: "Uma nota com o gerador do Watabou dentro dela e a semente guardada nas propriedades, para refazer o mesmo mapa. O gerador precisa de internet; o site é perguntado uma vez, como qualquer página na nota.",
  generator: "Gerador",
  seed: "Semente",
  reroll: "Sortear outra",
  mapName: "Nome (opcional)",
  newMapCreate: "Criar nota",
  badSeed: "A semente é um número inteiro de 1 a 2147483646.",
  newMapDone: (path) => `Criada ${path}.`,
};

const en: WatabouWords = {
  command: "Import Watabou map…",
  title: "Import Watabou map",
  intro: "Export the map at watabou.github.io: from One Page Dungeon, the JSON (for the drawing) and the Markdown (for the seed); from Perilous Shores, Save as JSON; from Dwellings, Export › as JSON. Then choose or drop the files here.",
  choose: "Choose files…",
  dropHere: "or drop the files here",
  where: "Folder",
  cancel: "Cancel",
  create: "Import",
  note: { towns: "Towns", dangers: "Dangers", places: "Places", openGenerator: "Open in the generator" },
  dungeon: (title, keys, drawing) => `One Page Dungeon “${title}”: ${keys === 1 ? "1 numbered room" : `${keys} numbered rooms`}${drawing ? ", with the drawing" : ""}.`,
  region: (title, towns, dangers) => `Perilous Shores “${title}”: ${towns === 1 ? "1 town" : `${towns} towns`} and ${dangers === 1 ? "1 danger" : `${dangers} dangers`}. Each one's note is made when you click it.`,
  dwelling: (title, floors, rooms) => `Dwellings “${title}”: ${floors === 1 ? "1 floor" : `${floors} floors`}, ${rooms === 1 ? "1 room" : `${rooms} rooms`}, with the drawing.`,
  noDrawing: "Without the JSON there is no drawing, only the note. Drop the JSON too to get the map.",
  pictures: (n) => (n === 1 ? "1 picture comes along." : `${n} pictures come along.`),
  empty: "No map chosen yet.",
  unknown: (names) => `Not recognised as a Watabou export: ${names}.`,
  two: (names) => `One map at a time: ${names}.`,
  other: (g) => `This is a map of the “${g}” generator, which is not imported yet. For now: One Page Dungeon, Perilous Shores and Dwellings.`,
  tooBig: (name) => `${name} is too large for a Watabou export.`,
  makes: (folder, board, files) => `Creates the folder “${folder}” with the note${board ? ", the board with the drawing" : ""}${files.length > 0 ? ` and ${files.join(", ")}` : ""}.`,
  exists: "Something with that name is already in that folder.",
  made: (folder) => `Map imported into “${folder}”.`,
  untitledDungeon: "Dungeon",
  untitledRegion: "Region",
  untitledHouse: "House",
  house: {
    floor: (level) => (level < 0 ? "Basement (B)" : level === 0 ? "Ground floor (GF)" : `${ordinal(level)} floor (${level}F)`),
    stairsRoom: "Stairs",
    passage: "Passage",
    describe: ({ title, floors, basement, rooms }) =>
      `${title}: a house of ${floors === 1 ? "1 floor" : `${floors} floors`}${basement ? " and a basement" : ""}, ${rooms === 1 ? "1 room" : `${rooms} rooms`}.`,
    entrance: (side, room) => `The entrance is on the ${side} side, into ${room}.`,
    side: { n: "north", e: "east", s: "south", w: "west" },
    squares: (n) => (n === 1 ? "1 square" : `${n} squares`),
    door: (kind, to) =>
      kind === "entrance" ? "the house's entrance" : kind === "door" ? (to ? `door to ${to}` : "door to the outside") : kind === "opening" ? (to ? `open to ${to}` : "open to the outside") : to ? `doorway to ${to}` : "doorway to the outside",
    stairsUp: "stairs going up",
    stairsDown: "stairs going down",
    spiral: "a spiral stair, outside the walls",
    windows: (n) => (n === 1 ? "1 window" : `${n} windows`),
  },
  newMap: "New generated map…",
  newMapTitle: "New generated map",
  newMapIntro: "A note with Watabou's generator inside it and the seed kept in its properties, to make the same map again. The generator needs the internet; the site is asked about once, like any page in a note.",
  generator: "Generator",
  seed: "Seed",
  reroll: "Draw another",
  mapName: "Name (optional)",
  newMapCreate: "Create note",
  badSeed: "The seed is a whole number from 1 to 2147483646.",
  newMapDone: (path) => `Created ${path}.`,
};

/** 1st, 2nd, 3rd, 4th… */
function ordinal(n: number): string {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

export const ww: WatabouWords = LANG.toLowerCase().startsWith("pt") ? pt : en;
/** Both, for the tests. */
export const wordsByLang = { pt, en };
