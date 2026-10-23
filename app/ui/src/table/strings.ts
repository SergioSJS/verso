// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table says (ADR 0107; ADR 0035), in pt-BR and English.

import { LANG } from "../strings";

type Words = {
  tab: string;
  title: string;
  empty: string;
  emptyOff: string;
  notShared: string;
  /** A synced folder whose link is down, or whose sync is paused (ADR 0107 item 9). */
  syncOffline: string;
  syncPaused: string;
  you: string;
  log: string;
  entryLabel: (who: string, said: string) => string;
  oracleQuestion: string;
  oracleSpark: string;
  oracleTable: (name: string) => string;
  openNote: (name: string) => string;
  noWhere: string;
  hideHere: string;
  hideHereDesc: string;
  hiddenLine: string;
  showAgain: string;
  hiddenStatus: string;
  shownStatus: string;
  addToNote: string;
  addAsk: (note: string, text: string) => string;
  add: string;
  cancel: string;
  added: (note: string) => string;
  notAdded: string;
  said: (who: string, text: string) => string;
  unread: (n: number) => string;
  dropped: string;
  total: string;
  toEnd: string;
  // The server's table (ADR 0107 phase 2).
  roster: string;
  rosterLabel: string;
  inputLabel: string;
  placeholder: string;
  placeholderLocal: string;
  placeholderImage: string;
  send: string;
  counter: (n: number, max: number) => string;
  rollButton: string;
  imageButton: string;
  secretToggle: string;
  secretDesc: string;
  secretRolled: (who: string) => string;
  secretMasked: string;
  pinnedHeading: string;
  pinnedLabel: string;
  pin: string;
  unpin: string;
  pinnedStatus: string;
  unpinnedStatus: string;
  remove: string;
  removedStatus: string;
  entryActions: (said: string) => string;
  clearTable: string;
  clearAsk: string;
  clearKeep: string;
  clearYes: string;
  clearedStatus: string;
  older: string;
  olderLoading: string;
  tableMenu: string;
  wrote: (who: string, text: string) => string;
  sentImage: (who: string) => string;
  imageAlt: (who: string) => string;
  imageOpen: string;
  imageClose: string;
  imageSending: string;
  imageSent: string;
  imageNotImage: string;
  imageTooBig: (mb: number) => string;
  imageEmpty: string;
  imageUnreadable: string;
  tooLong: (n: number, max: number) => string;
  badRoll: (typed: string) => string;
  slowDown: (s: number) => string;
  secretRollStatus: string;
  emptyServer: string;
  addImageAsk: string;
  offline: string;
  rollKey: string;
  notifyTitle: (folder: string) => string;
  openTable: string;
};

const pt: Words = {
  tab: "Mesa",
  title: "Mesa",
  empty: "Ninguém rolou nada ainda. Role um dado numa nota, num cartão do quadro ou pelo comando \"Rolar dados…\" e ele aparece aqui.",
  emptyOff: "Nada para mostrar: você ocultou o que havia. Role de novo ou desfaça.",
  notShared: "Só as suas rolagens e as que você ouve nas notas compartilhadas desta sessão. Não é compartilhado nem guardado.",
  syncOffline: "Mesa indisponível sem conexão. As rolagens feitas agora ficam só aqui, sem compartilhar; a mesa volta quando a conexão voltar.",
  syncPaused: "Mesa indisponível com a sincronização pausada. As rolagens feitas agora ficam só aqui, sem compartilhar.",
  you: "Você",
  log: "Rolagens da mesa",
  entryLabel: (who, said) => `${who}: ${said}`,
  oracleQuestion: "Pergunta ao oráculo",
  oracleSpark: "Faísca de ideias",
  oracleTable: (name) => (name ? `Tabela do oráculo: ${name}` : "Tabela do oráculo"),
  openNote: (name) => `Abrir ${name}`,
  noWhere: "Rolador",
  hideHere: "Ocultar daqui pra trás",
  hideHereDesc: "Esconde, só nesta janela, tudo que está na mesa agora. Dá para desfazer.",
  hiddenLine: "Você ocultou o que havia antes.",
  showAgain: "Mostrar de volta",
  hiddenStatus: "Mesa: o histórico foi ocultado nesta janela.",
  shownStatus: "Mesa: o histórico voltou.",
  addToNote: "Adicionar à nota…",
  addAsk: (note, text) => `Isto será acrescentado ao fim de "${note}":\n\n${text}`,
  add: "Adicionar",
  cancel: "Cancelar",
  added: (note) => `Adicionado a ${note}.`,
  notAdded: "Nada foi gravado na nota.",
  said: (who, text) => `${who} rolou: ${text}`,
  unread: (n) => (n === 1 ? "1 novidade na mesa" : `${n} novidades na mesa`),
  dropped: "descartado",
  total: "total",
  toEnd: "Ir para o fim",
  roster: "Na mesa agora",
  rosterLabel: "Quem está na mesa",
  inputLabel: "Mensagem para a mesa",
  placeholder: "Escreva para a mesa…",
  placeholderLocal: "Role com /r 1d20+3, ou monte a rolagem nos dados abaixo…",
  placeholderImage: "Escreva para a mesa, ou cole uma imagem…",
  send: "Enviar",
  counter: (n, max) => `${n} de ${max}`,
  rollButton: "Rolar dados…",
  imageButton: "Enviar imagem",
  secretToggle: "Secreta",
  secretDesc: "Rolagem secreta: só você e os donos da pasta veem o resultado; os outros veem que você rolou.",
  secretRolled: (who) => `${who} rolou em segredo`,
  secretMasked: "rolou em segredo",
  pinnedHeading: "Fixadas",
  pinnedLabel: "Entradas fixadas da mesa",
  pin: "Fixar",
  unpin: "Desafixar",
  pinnedStatus: "Mesa: entrada fixada para todos.",
  unpinnedStatus: "Mesa: entrada desafixada.",
  remove: "Apagar",
  removedStatus: "Mesa: entrada apagada para todos.",
  entryActions: (said) => `Ações da entrada: ${said}`,
  clearTable: "Limpar a mesa",
  clearAsk: "Limpar a mesa para todos? Mensagens, imagens e rolagens somem para quem está na mesa e para quem entrar depois. Não dá para desfazer.",
  clearKeep: "Manter as entradas fixadas",
  clearYes: "Limpar",
  clearedStatus: "Mesa: limpa para todos.",
  older: "Ver anteriores",
  olderLoading: "Buscando…",
  tableMenu: "Mais opções da mesa",
  wrote: (who, text) => `${who} escreveu: ${text}`,
  sentImage: (who) => `${who} enviou uma imagem`,
  imageAlt: (who) => `Imagem enviada por ${who}`,
  imageOpen: "Abrir imagem",
  imageClose: "Fechar imagem",
  imageSending: "Enviando a imagem…",
  imageSent: "Imagem enviada à mesa.",
  imageNotImage: "Isso não é uma imagem que a mesa aceite (PNG, JPEG, WebP ou GIF); nada foi enviado.",
  imageTooBig: (mb) => `A imagem passa de ${mb} MB, o máximo da mesa; nada foi enviado.`,
  imageEmpty: "O arquivo está vazio; nada foi enviado.",
  imageUnreadable: "Não foi possível ler a imagem; nada foi enviado.",
  tooLong: (n, max) => `A mensagem tem ${n} caracteres; o máximo é ${max}.`,
  badRoll: (typed) => (typed ? `Não entendi “${typed}” como rolagem. Exemplo: /r 1d20+3` : "Diga o que rolar. Exemplo: /r 1d20+3"),
  slowDown: (s) => `Devagar: espere ${s} s para enviar de novo.`,
  secretRollStatus: "Rolagem secreta: só você e os donos da pasta veem o resultado.",
  emptyServer: "A mesa está vazia. Escreva algo, role dados com /r 1d20+3 ou envie uma imagem.",
  addImageAsk: "Será incorporada a imagem",
  offline: "A mesa não respondeu.",
  rollKey: "Rolar com /r",
  notifyTitle: (folder) => (folder ? `Mesa · ${folder}` : "Mesa"),
  openTable: "Abrir a mesa",
};

const en: Words = {
  tab: "Table",
  title: "Table",
  empty: "Nobody has rolled yet. Roll a die in a note, on a board card or with the \"Roll dice…\" command and it shows up here.",
  emptyOff: "Nothing to show: you hid what was here. Roll again or undo.",
  notShared: "Only your rolls and the ones you hear in shared notes this session. It is not shared and not kept.",
  syncOffline: "Table unavailable while offline. Rolls made now stay here, not shared; the table comes back when the connection does.",
  syncPaused: "Table unavailable while sync is paused. Rolls made now stay here, not shared.",
  you: "You",
  log: "Table rolls",
  entryLabel: (who, said) => `${who}: ${said}`,
  oracleQuestion: "Oracle question",
  oracleSpark: "Idea spark",
  oracleTable: (name) => (name ? `Oracle table: ${name}` : "Oracle table"),
  openNote: (name) => `Open ${name}`,
  noWhere: "Roller",
  hideHere: "Hide up to here",
  hideHereDesc: "Hides, in this window only, everything on the table now. It can be undone.",
  hiddenLine: "You hid what was here before.",
  showAgain: "Show it again",
  hiddenStatus: "Table: the history was hidden in this window.",
  shownStatus: "Table: the history is back.",
  addToNote: "Add to note…",
  addAsk: (note, text) => `This will be added to the end of "${note}":\n\n${text}`,
  add: "Add",
  cancel: "Cancel",
  added: (note) => `Added to ${note}.`,
  notAdded: "Nothing was written to the note.",
  said: (who, text) => `${who} rolled: ${text}`,
  unread: (n) => (n === 1 ? "1 new on the table" : `${n} new on the table`),
  dropped: "dropped",
  total: "total",
  toEnd: "Jump to the end",
  roster: "At the table now",
  rosterLabel: "Who is at the table",
  inputLabel: "Message to the table",
  placeholder: "Write to the table…",
  placeholderLocal: "Roll with /r 1d20+3, or put it together with the dice below…",
  placeholderImage: "Write to the table, or paste an image…",
  send: "Send",
  counter: (n, max) => `${n} of ${max}`,
  rollButton: "Roll dice…",
  imageButton: "Send image",
  secretToggle: "Secret",
  secretDesc: "Secret roll: only you and the folder's owners see the result; the others see that you rolled.",
  secretRolled: (who) => `${who} rolled in secret`,
  secretMasked: "rolled in secret",
  pinnedHeading: "Pinned",
  pinnedLabel: "Pinned entries of the table",
  pin: "Pin",
  unpin: "Unpin",
  pinnedStatus: "Table: entry pinned for everyone.",
  unpinnedStatus: "Table: entry unpinned.",
  remove: "Delete",
  removedStatus: "Table: entry deleted for everyone.",
  entryActions: (said) => `Entry actions: ${said}`,
  clearTable: "Clear the table",
  clearAsk: "Clear the table for everyone? Messages, images and rolls go for those at the table and for anyone who joins later. This cannot be undone.",
  clearKeep: "Keep the pinned entries",
  clearYes: "Clear",
  clearedStatus: "Table: cleared for everyone.",
  older: "See earlier",
  olderLoading: "Fetching…",
  tableMenu: "More table options",
  wrote: (who, text) => `${who} wrote: ${text}`,
  sentImage: (who) => `${who} sent an image`,
  imageAlt: (who) => `Image sent by ${who}`,
  imageOpen: "Open image",
  imageClose: "Close image",
  imageSending: "Sending the image…",
  imageSent: "Image sent to the table.",
  imageNotImage: "That is not an image the table takes (PNG, JPEG, WebP or GIF); nothing was sent.",
  imageTooBig: (mb) => `The image is over ${mb} MB, the table's most; nothing was sent.`,
  imageEmpty: "The file is empty; nothing was sent.",
  imageUnreadable: "The image could not be read; nothing was sent.",
  tooLong: (n, max) => `The message is ${n} characters; the most is ${max}.`,
  badRoll: (typed) => (typed ? `I could not read “${typed}” as a roll. Example: /r 1d20+3` : "Say what to roll. Example: /r 1d20+3"),
  slowDown: (s) => `Slow down: wait ${s} s to send again.`,
  secretRollStatus: "Secret roll: only you and the folder's owners see the result.",
  emptyServer: "The table is empty. Write something, roll dice with /r 1d20+3 or send an image.",
  addImageAsk: "The image will be embedded",
  offline: "The table did not answer.",
  rollKey: "Roll with /r",
  notifyTitle: (folder) => (folder ? `Table · ${folder}` : "Table"),
  openTable: "Open the table",
};

export const tt: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
