// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { onPhone } from "./screen/phoneWords";

// What a person is told of a synced folder's live note (ADR 0082 item 14),
// in words — never a colour alone — in pt-BR and English: the state in the
// tab and the status bar, and the sentences a screen reader hears.

/** Why a synced folder's note is local now. */
export type Why = "offline" | "paused" | "off" | "setting";

/** What a live file is, as the sentences name it: a note, a board, any
 *  other file (ADR 0082 item 12). */
export type What = "note" | "board" | "file";

/** A note's state, as the tab and the status bar say it. */
export type LiveState = { kind: "live"; others: string[]; reader: boolean } | { kind: "local"; why: Why } | { kind: "catching" };

const pt = {
  and: "e",
  alone: "ao vivo, só você",
  with: (names: string) => `ao vivo, com ${names}`,
  reading: "só lendo",
  local: {
    offline: "local — sem conexão",
    paused: "local — sincronização pausada",
    off: "local — sincronização desligada",
    setting: "local — edição junto desligada",
  } as Record<Why, string>,
  catching: "pondo em dia…",
  joined: (name: string) => `${name} entrou na nota.`,
  left: (name: string) => `${name} saiu da nota.`,
  because: {
    offline: "a conexão caiu",
    paused: "a sincronização foi pausada",
    off: "a sincronização foi desligada",
    setting: "editar junto foi desligado para esta pasta",
  } as Record<Why, string>,
  wentLocal: (because: string) => `A nota agora é local: ${because}; seu texto está salvo neste computador.`,
  back: "A nota está ao vivo de novo.",
  anew: "De volta: a nota foi comparada com a do servidor; onde os dois mudaram, sua versão ficou numa cópia ao lado.",
  setting: "Editar notas junto enquanto online",
  settingDesc:
    "Uma nota aberta aqui entra na sala do servidor: quem estiver nela — no navegador ou em outro aparelho — edita junto, ao vivo. Desligado, as notas são editadas neste computador e cruzam ao salvar.",
  // The tab's notice when the setting is off (liveOff.ts).
  off: { text: "Edição ao vivo desligada nesta pasta", open: "Abrir a configuração de editar notas junto" },
  // A board, any other file (ADR 0082 item 12).
  other: {
    board: {
      joined: (name: string) => `${name} entrou no quadro.`,
      left: (name: string) => `${name} saiu do quadro.`,
      wentLocal: (because: string) => `O quadro agora é local: ${because}; ele está salvo neste computador.`,
      back: "O quadro está ao vivo de novo.",
      anew: "De volta: o quadro foi comparado com o do servidor; onde os dois mudaram, sua versão ficou numa cópia ao lado.",
    },
    file: {
      joined: (name: string) => `${name} entrou no arquivo.`,
      left: (name: string) => `${name} saiu do arquivo.`,
      wentLocal: (because: string) => `O arquivo agora é local: ${because}; seu texto está salvo neste computador.`,
      back: "O arquivo está ao vivo de novo.",
      anew: "De volta: o arquivo foi comparado com o do servidor; onde os dois mudaram, sua versão ficou numa cópia ao lado.",
    },
  },
};

const en: typeof pt = {
  and: "and",
  alone: "live, alone",
  with: (names) => `live, with ${names}`,
  reading: "reading only",
  local: {
    offline: "local — offline",
    paused: "local — sync paused",
    off: "local — sync off",
    setting: "local — editing together off",
  },
  catching: "catching up…",
  joined: (name) => `${name} joined the note.`,
  left: (name) => `${name} left the note.`,
  because: {
    offline: "the connection dropped",
    paused: "sync was paused",
    off: "sync was turned off",
    setting: "editing together was turned off for this folder",
  },
  wentLocal: (because) => `The note is now local: ${because}; your text is saved on this computer.`,
  back: "The note is live again.",
  anew: "Back online: the note was compared with the server's; where both changed, your version is kept in a copy beside it.",
  setting: "Edit notes together while online",
  settingDesc:
    "A note opened here joins the server's room: whoever is in it — in the browser or on another device — edits together, live. Off, notes are edited on this computer and cross on save.",
  off: { text: "Live editing is off for this folder", open: "Open the setting for editing notes together" },
  other: {
    board: {
      joined: (name) => `${name} joined the board.`,
      left: (name) => `${name} left the board.`,
      wentLocal: (because) => `The board is now local: ${because}; it is saved on this computer.`,
      back: "The board is live again.",
      anew: "Back online: the board was compared with the server's; where both changed, your version is kept in a copy beside it.",
    },
    file: {
      joined: (name) => `${name} joined the file.`,
      left: (name) => `${name} left the file.`,
      wentLocal: (because) => `The file is now local: ${because}; your text is saved on this computer.`,
      back: "The file is live again.",
      anew: "Back online: the file was compared with the server's; where both changed, your version is kept in a copy beside it.",
    },
  },
};

/** The words in the language `lang` names ("pt…" or anything else). */
export function liveWords(lang: string): typeof pt {
  return onPhone(lang.startsWith("pt") ? pt : en);
}

/** The notice of a folder whose live editing is off, and its control's label. */
export function liveOffWords(lang: string): { text: string; open: string } {
  return liveWords(lang).off;
}

/** Names as a sentence lists them: "Ana", "Ana e Bia", "Ana, Bia e Caio". */
export function names(list: readonly string[], lang: string): string {
  const w = liveWords(lang);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} ${w.and} ${list[list.length - 1]}`;
}

/** The state in a few words: "ao vivo, com Ana e Bia", "local — sem conexão". */
export function liveLine(state: LiveState, lang: string): string {
  const w = liveWords(lang);
  if (state.kind === "catching") return w.catching;
  if (state.kind === "local") return w.local[state.why];
  const line = state.others.length ? w.with(names(state.others, lang)) : w.alone;
  return state.reader ? `${line} (${w.reading})` : line;
}

/** The sentences for `what`: a note's, a board's, a file's. */
function said(what: What, lang: string): { joined: (n: string) => string; left: (n: string) => string; wentLocal: (b: string) => string; back: string; anew: string } {
  const w = liveWords(lang);
  return what === "note" ? w : w.other[what];
}

/** What a screen reader hears when the people in the note change. */
export function presenceSaid(before: readonly string[], now: readonly string[], lang: string, what: What = "note"): string[] {
  const w = said(what, lang);
  return [...now.filter((n) => !before.includes(n)).map(w.joined), ...before.filter((n) => !now.includes(n)).map(w.left)];
}

/** What a screen reader hears when the note goes local, and why. */
export function localSaid(why: Why, lang: string, what: What = "note"): string {
  return said(what, lang).wentLocal(liveWords(lang).because[why]);
}

/** What a screen reader hears when the file is live again, or was read
 *  anew after sync compared it. */
export function backSaid(lang: string, what: What = "note", anew = false): string {
  const w = said(what, lang);
  return anew ? w.anew : w.back;
}
