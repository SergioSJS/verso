// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What maps on the board say (ADR 0090), in both of the interface's
// languages (ADR 0035): the map's commands, the pins, the tiles, the
// secret pins and the way back from the reader's view.

import { prettyKeys } from "../keyNames";

const pt = {
  useAsMap: "Usar como mapa",
  useAsMapTitle: "Trava a imagem, manda para o fundo e a trata como mapa: notas fixadas nela mantêm o tamanho em qualquer zoom",
  stopMap: "Deixar de usar como mapa",
  stopMapTitle: "Destrava a imagem e a deixa de ser um mapa; os alfinetes continuam cartões",
  toBack: "Enviar para trás",
  toBackTitle: "Põe o cartão atrás de todos os outros",
  toFront: "Trazer para a frente",
  toFrontTitle: "Põe o cartão na frente de todos os outros",
  pinNote: "Fixar uma nota aqui…",
  pinNoteTitle: "Escolhe uma nota e a fixa no mapa, no meio do que se vê",
  pinNeedsMap: "Nenhuma imagem do board é um mapa ainda: selecione uma imagem e use “Usar como mapa”.",
  pinned: (name: string) => `Nota “${name}” fixada no mapa.`,
  pinOpen: (name: string) => `Abrir ${name}`,
  pinRemoved: (name: string) => `Alfinete de “${name}” removido do mapa (${prettyKeys("Mod-z")} desfaz).`,
  pinsHeading: "Alfinetes do mapa",
  mapsHeading: "Mapas",
  noPins: "Nenhum alfinete. Arraste uma nota da árvore para o mapa, ou use “Fixar uma nota aqui…”.",
  mapMissing: "A imagem do mapa não está na pasta.",
  /** The tiles. */
  preparing: (percent: number) => `Preparando o mapa… ${percent}%`,
  preparingShort: "Preparando o mapa…",
  tilesFailed: (why: string) => `Não deu para cortar o mapa em ladrilhos: ${why}. Ele é mostrado inteiro.`,
  tooBig: "Imagem grande demais para mostrar inteira neste formato: salve o mapa como PNG para que o Verso o corte em ladrilhos.",
  mapOf: (name: string) => `Mapa: ${name}`,
  /** Secret pins (ADR 0090 item 5). */
  secret: "Oculto dos leitores",
  secretTitle: "Marca o cartão selecionado como secreto: quem só lê o board num UniVerso não o recebe",
  secretOn: "Secreto",
  hidden: "Oculto para leitores",
  local: "Visível para quem tiver o arquivo",
  viewReader: "Ver como leitor",
  viewReaderTitle: "Mostra o board como quem só pode lê-lo o recebe: sem os cartões secretos. Só leitura.",
  viewing: "Vendo como um leitor: os cartões secretos não aparecem, e nada aqui se edita.",
  back: "Ver o board inteiro",
  viewFailed: (why: string) => `Não deu para mostrar o board como um leitor o vê: ${why}. O board inteiro continua aqui.`,
  exportSecret: "Deixar de fora os alfinetes e cartões secretos",
  secretCard: "secreto",
};

const en: typeof pt = {
  useAsMap: "Use as map",
  useAsMapTitle: "Locks the picture, sends it to the back and treats it as a map: notes pinned on it keep their size at any zoom",
  stopMap: "Stop using as map",
  stopMapTitle: "Unlocks the picture and it is no longer a map; the pins stay as cards",
  toBack: "Send to back",
  toBackTitle: "Puts the card behind all the others",
  toFront: "Bring to front",
  toFrontTitle: "Puts the card in front of all the others",
  pinNote: "Pin a note here…",
  pinNoteTitle: "Choose a note and pin it on the map, in the middle of what is in view",
  pinNeedsMap: "No picture on the board is a map yet: select a picture and use “Use as map”.",
  pinned: (name) => `Note “${name}” pinned on the map.`,
  pinOpen: (name) => `Open ${name}`,
  pinRemoved: (name) => `Pin of “${name}” removed from the map (${prettyKeys("Mod-z")} undoes it).`,
  pinsHeading: "Pins on the map",
  mapsHeading: "Maps",
  noPins: "No pins. Drag a note from the tree onto the map, or use “Pin a note here…”.",
  mapMissing: "The map's picture is not in the folder.",
  preparing: (percent) => `Preparing the map… ${percent}%`,
  preparingShort: "Preparing the map…",
  tilesFailed: (why) => `Could not cut the map into tiles: ${why}. It is shown whole.`,
  tooBig: "Picture too large to show whole in this format: save the map as a PNG so Verso can cut it into tiles.",
  mapOf: (name) => `Map: ${name}`,
  secret: "Hidden from readers",
  secretTitle: "Marks the selected card as secret: those who may only read the board on a UniVerso do not receive it",
  secretOn: "Secret",
  hidden: "Hidden from readers",
  local: "Visible to anyone with the file",
  viewReader: "View as a reader",
  viewReaderTitle: "Shows the board as one who may only read it receives it: without the secret cards. Read-only.",
  viewing: "Viewing as a reader: the secret cards are left out, and nothing here can be edited.",
  back: "See the whole board",
  viewFailed: (why) => `Could not show the board as a reader sees it: ${why}. The whole board is still here.`,
  exportSecret: "Leave out the secret pins and cards",
  secretCard: "secret",
};

export type MapStrings = typeof pt;

/** The words for the interface's language (`pt…` or anything else). */
export function mapStrings(lang: string): MapStrings {
  return lang.toLowerCase().startsWith("pt") ? pt : en;
}
