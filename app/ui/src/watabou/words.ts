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
  /** The generator's picture: lined up, or how to bring it. */
  pictureLined: string;
  needSvg: string;
  /** The dungeon's picture came turned by `deg` degrees. */
  turned: (deg: number) => string;
  bringPicture: string;
  floorsLined: (n: number, floors: number) => string;
  bringFloors: string;
  settlement: (title: string) => string;
  noPicture: (generator: string) => string;
  untitledSettlement: string;
  pictures: (n: number) => string;
  empty: string;
  unknown: (names: string) => string;
  two: (names: string) => string;
  other: (generator: string) => string;
  tooBig: (name: string) => string;
  /** What will be made, before it is. */
  makes: (folder: string, board: "drawing" | "picture" | null, files: string[]) => string;
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
  intro: "Exporte o mapa em watabou.github.io: no One Page Dungeon, com View › Rotate-to-fit desligado, o JSON (as salas), o SVG e o PNG (o desenho do Watabou) e o Markdown (a semente); no Dwellings, Export › as JSON e, em cada andar, as SVG e as PNG; numa vila ou cidade, o JSON e o PNG; no Perilous Shores, o Save em JSON. Depois escolha ou solte os arquivos aqui.",
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
  pictureLined: "O desenho do próprio Watabou vira o mapa do board, alinhado às salas; os números viram alfinetes que abrem a nota. O traçado do Verso fica escondido por baixo (“Mostrar o traçado” no board).",
  needSvg: "Para o desenho do Watabou ficar alinhado às salas, solte também o SVG (Export as › SVG): só o SVG diz onde, em que escala e em que giro o mapa está na página. Sem ele, o board fica com o desenho do Verso.",
  turned: (deg) => `O desenho do Watabou veio girado ${fmtDeg(deg, ",")}°: ele é importado assim, mas não fica no esquadro do board. Para um mapa alinhado ao board, no One Page Dungeon desligue View › Rotate-to-fit (clique direito no mapa), exporte de novo Export as › SVG e Save as PNG, e importe outra vez.`,
  bringPicture: "Para o board mostrar o desenho do próprio Watabou, solte também o SVG e o PNG (Export as › SVG e Save as PNG). Sem eles, o board fica com o desenho do Verso.",
  floorsLined: (n, floors) => (n === floors ? "O desenho do Watabou de cada andar vira o mapa do andar; o traçado do Verso fica escondido por baixo (“Mostrar o traçado” no board)." : `O desenho do Watabou vem para ${n} de ${floors} andares; os outros ficam com o desenho do Verso. Exporte cada andar com Export › as SVG.`),
  bringFloors: "Para o board mostrar o desenho do próprio Watabou, exporte cada andar com Export › as SVG (e as PNG) e solte junto. Sem eles, o board fica com o desenho do Verso.",
  settlement: (title) => `“${title}”: o desenho do Watabou vira o mapa de um board, com a nota ao lado.`,
  noPicture: (g) => `O mapa do “${g}” é o próprio desenho: solte o PNG ou o SVG junto com o JSON (Export as › PNG).`,
  untitledSettlement: "Vila",
  pictures: (n) => (n === 1 ? "1 imagem vai junto." : `${n} imagens vão junto.`),
  empty: "Nenhum mapa escolhido ainda.",
  unknown: (names) => `Não reconheço como export do Watabou: ${names}.`,
  two: (names) => `Um mapa por vez: ${names}.`,
  other: (g) => `Este é um mapa do gerador “${g}”, que ainda não é importado. Por enquanto: One Page Dungeon, Perilous Shores, Dwellings, vilas e cidades.`,
  tooBig: (name) => `${name} é grande demais para um export do Watabou.`,
  makes: (folder, board, files) => `Cria a pasta “${folder}” com a nota${board === "picture" ? ", o board com o desenho do Watabou" : board ? ", o board com o desenho" : ""}${files.length > 0 ? ` e ${files.join(", ")}` : ""}.`,
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
  intro: "Export the map at watabou.github.io: from One Page Dungeon, with View › Rotate-to-fit off, the JSON (the rooms), the SVG and the PNG (Watabou's own drawing) and the Markdown (the seed); from Dwellings, Export › as JSON and, on each floor, as SVG and as PNG; from a village or a city, the JSON and the PNG; from Perilous Shores, Save as JSON. Then choose or drop the files here.",
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
  pictureLined: "Watabou's own drawing becomes the board's map, lined up with the rooms; the numbers become pins that open the note. Verso's tracing stays hidden underneath (“Show the tracing” on the board).",
  needSvg: "For Watabou's drawing to line up with the rooms, drop the SVG too (Export as › SVG): only the SVG says where on the page the map is, at what scale and how turned. Without it, the board keeps Verso's drawing.",
  turned: (deg) => `Watabou's drawing came turned by ${fmtDeg(deg, ".")}°: it is imported so, but not square to the board. For a map aligned to the board, in One Page Dungeon switch off View › Rotate-to-fit (right-click the map), export again with Export as › SVG and Save as PNG, and import again.`,
  bringPicture: "For the board to show Watabou's own drawing, drop the SVG and the PNG too (Export as › SVG and Save as PNG). Without them, the board keeps Verso's drawing.",
  floorsLined: (n, floors) => (n === floors ? "Watabou's drawing of each floor becomes that floor's map; Verso's tracing stays hidden underneath (“Show the tracing” on the board)." : `Watabou's drawing comes for ${n} of ${floors} floors; the others keep Verso's drawing. Export each floor with Export › as SVG.`),
  bringFloors: "For the board to show Watabou's own drawing, export each floor with Export › as SVG (and as PNG) and drop them too. Without them, the board keeps Verso's drawing.",
  settlement: (title) => `“${title}”: Watabou's drawing becomes a board's map, with the note beside it.`,
  noPicture: (g) => `The “${g}” map is its drawing: drop its PNG or SVG with the JSON (Export as › PNG).`,
  untitledSettlement: "Village",
  pictures: (n) => (n === 1 ? "1 picture comes along." : `${n} pictures come along.`),
  empty: "No map chosen yet.",
  unknown: (names) => `Not recognised as a Watabou export: ${names}.`,
  two: (names) => `One map at a time: ${names}.`,
  other: (g) => `This is a map of the “${g}” generator, which is not imported yet. For now: One Page Dungeon, Perilous Shores, Dwellings, villages and cities.`,
  tooBig: (name) => `${name} is too large for a Watabou export.`,
  makes: (folder, board, files) => `Creates the folder “${folder}” with the note${board === "picture" ? ", the board with Watabou's drawing" : board ? ", the board with the drawing" : ""}${files.length > 0 ? ` and ${files.join(", ")}` : ""}.`,
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

/** Degrees as a person reads them: whole, or to one place. */
function fmtDeg(deg: number, point: string): string {
  const r = Math.round(deg * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", point);
}

/** 1st, 2nd, 3rd, 4th… */
function ordinal(n: number): string {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

export const ww: WatabouWords = LANG.toLowerCase().startsWith("pt") ? pt : en;
/** Both, for the tests. */
export const wordsByLang = { pt, en };
