// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What moving a table to its other server says (ADR 0117 D8, R9), in both
// languages (ADR 0035): to the game master in the table's window, and to a
// player who opens the table where it was.

import { LANG } from "./strings";

const pt = {
  // The game master, in the table's window.
  moveTitle: "Mudar de servidor",
  moveHint: (to: string) => `Esta pasta também está em outro servidor (${to}). Uma mesa mora num servidor só: ela pode morar lá em vez daqui.`,
  moveButton: (to: string) => `Mudar esta mesa para: ${to}`,
  moveConfirm: (to: string) =>
    `Mudar a mesa para: ${to}? Lá ela começa com todas as notas ocultas e sem jogadores: convide-os de novo. Aqui ela fecha para os jogadores, que leem que a mesa mudou; o chat, as rolagens e os direitos ficam aqui até você desfazer esta mesa.`,
  moving: "Mudando a mesa…",
  movedThere: (to: string) => `A mesa mudou para: ${to}. Convide os jogadores de novo.`,
  movedGoFailed: (to: string) => `A mesa mudou para: ${to}, mas a janela não chegou lá: abra a pasta por lá e convide os jogadores de novo.`,
  movedTitle: "Esta mesa mudou de servidor",
  movedBody: (to: string) =>
    `Ela agora é hospedada em: ${to}. Aqui ela está fechada para os jogadores, que leem que a mesa mudou e pedem um convite novo. O chat, as rolagens e os direitos dela ficam aqui até você desfazer esta mesa.`,
  movedUndoWarn:
    "Desfazer esta mesa a torna uma pasta comum aqui e tira dela os jogadores que a mesa tinha: eles perdem o acesso a esta pasta neste servidor (já foram avisados de que a mesa mudou). Quem tem um lugar nesta pasta fora da mesa continua como está.",
  movedUndoConfirm:
    "Desfazer esta mesa? Ela volta a ser uma pasta comum aqui, e os jogadores que ela tinha perdem o acesso a esta pasta neste servidor; os arquivos nunca mudam.",
  movedGo: (to: string) => `Abrir a mesa nova (${to})`,
  thisComputer: "este computador",
  universo: (name: string) => `UniVerso ${name}`,
  elsewhere: "outro servidor",
  // A player, where the table was.
  playerTitle: "A mesa mudou de servidor",
  playerBody: "O mestre levou esta mesa para outro servidor. Peça a ele um convite novo.",
  playerStatus: "A mesa mudou de servidor: peça ao mestre um convite novo.",
};

const en: typeof pt = {
  moveTitle: "Move to another server",
  moveHint: (to) => `This folder is also on another server (${to}). A table lives on one server: it can live there instead of here.`,
  moveButton: (to) => `Move this table to ${to}`,
  moveConfirm: (to) =>
    `Move the table to ${to}? There it starts with every note hidden and no players: invite them again. Here it closes to its players, who read that the table moved; its chat, rolls and rights stay here until you undo this table.`,
  moving: "Moving the table…",
  movedThere: (to) => `The table moved to ${to}. Invite the players again.`,
  movedGoFailed: (to) => `The table moved to ${to}, but the window did not get there: open the folder there and invite the players again.`,
  movedTitle: "This table moved to another server",
  movedBody: (to) =>
    `It now lives on ${to}. Here it is closed to its players, who read that the table moved and ask for a new invitation. Its chat, rolls and rights stay here until you undo this table.`,
  movedUndoWarn:
    "Undoing this table makes it an ordinary folder here and takes out the players it had: they lose access to this folder on this server (they were already told the table moved). Whoever has a place in this folder outside the table keeps it.",
  movedUndoConfirm:
    "Undo this table? It becomes an ordinary folder here, and the players it had lose access to this folder on this server; the files never change.",
  movedGo: (to) => `Open the new table (${to})`,
  thisComputer: "this computer",
  universo: (name) => `the UniVerso ${name}`,
  elsewhere: "another server",
  playerTitle: "The table moved to another server",
  playerBody: "The game master took this table to another server. Ask them for a new invitation.",
  playerStatus: "The table moved to another server: ask the game master for a new invitation.",
};

export const tm = LANG.toLowerCase().startsWith("pt") ? pt : en;
