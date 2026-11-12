// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of the Watabou import (ADR 0120), in pt-BR and English (ADR
// 0035). The generators' own text is never translated.

import { LANG } from "../strings";
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
  intro: "Exporte o mapa em watabou.github.io: no One Page Dungeon, o JSON (para o desenho) e o Markdown (para a semente); no Perilous Shores, o Save em JSON. Depois escolha ou solte os arquivos aqui.",
  choose: "Escolher arquivos…",
  dropHere: "ou solte os arquivos aqui",
  where: "Pasta",
  cancel: "Cancelar",
  create: "Importar",
  note: { towns: "Cidades", dangers: "Perigos", places: "Lugares", openGenerator: "Abrir no gerador" },
  dungeon: (title, keys, drawing) => `One Page Dungeon “${title}”: ${keys === 1 ? "1 sala numerada" : `${keys} salas numeradas`}${drawing ? ", com o desenho" : ""}.`,
  region: (title, towns, dangers) => `Perilous Shores “${title}”: ${towns === 1 ? "1 cidade" : `${towns} cidades`} e ${dangers === 1 ? "1 perigo" : `${dangers} perigos`}. A nota de cada uma nasce quando você clicar nela.`,
  noDrawing: "Sem o JSON não há desenho: só a nota. Solte o JSON junto para ter o mapa.",
  pictures: (n) => (n === 1 ? "1 imagem vai junto." : `${n} imagens vão junto.`),
  empty: "Nenhum mapa escolhido ainda.",
  unknown: (names) => `Não reconheço como export do Watabou: ${names}.`,
  two: (names) => `Um mapa por vez: ${names}.`,
  other: (g) => `Este é um mapa do gerador “${g}”, que ainda não é importado. Por enquanto: One Page Dungeon e Perilous Shores.`,
  tooBig: (name) => `${name} é grande demais para um export do Watabou.`,
  makes: (folder, board, files) => `Cria a pasta “${folder}” com a nota${board ? ", o board com o desenho" : ""}${files.length > 0 ? ` e ${files.join(", ")}` : ""}.`,
  exists: "Já existe algo com esse nome nessa pasta.",
  made: (folder) => `Mapa importado em “${folder}”.`,
  untitledDungeon: "Masmorra",
  untitledRegion: "Região",
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
  intro: "Export the map at watabou.github.io: from One Page Dungeon, the JSON (for the drawing) and the Markdown (for the seed); from Perilous Shores, Save as JSON. Then choose or drop the files here.",
  choose: "Choose files…",
  dropHere: "or drop the files here",
  where: "Folder",
  cancel: "Cancel",
  create: "Import",
  note: { towns: "Towns", dangers: "Dangers", places: "Places", openGenerator: "Open in the generator" },
  dungeon: (title, keys, drawing) => `One Page Dungeon “${title}”: ${keys === 1 ? "1 numbered room" : `${keys} numbered rooms`}${drawing ? ", with the drawing" : ""}.`,
  region: (title, towns, dangers) => `Perilous Shores “${title}”: ${towns === 1 ? "1 town" : `${towns} towns`} and ${dangers === 1 ? "1 danger" : `${dangers} dangers`}. Each one's note is made when you click it.`,
  noDrawing: "Without the JSON there is no drawing, only the note. Drop the JSON too to get the map.",
  pictures: (n) => (n === 1 ? "1 picture comes along." : `${n} pictures come along.`),
  empty: "No map chosen yet.",
  unknown: (names) => `Not recognised as a Watabou export: ${names}.`,
  two: (names) => `One map at a time: ${names}.`,
  other: (g) => `This is a map of the “${g}” generator, which is not imported yet. For now: One Page Dungeon and Perilous Shores.`,
  tooBig: (name) => `${name} is too large for a Watabou export.`,
  makes: (folder, board, files) => `Creates the folder “${folder}” with the note${board ? ", the board with the drawing" : ""}${files.length > 0 ? ` and ${files.join(", ")}` : ""}.`,
  exists: "Something with that name is already in that folder.",
  made: (folder) => `Map imported into “${folder}”.`,
  untitledDungeon: "Dungeon",
  untitledRegion: "Region",
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

export const ww: WatabouWords = LANG.toLowerCase().startsWith("pt") ? pt : en;
/** Both, for the tests. */
export const wordsByLang = { pt, en };
