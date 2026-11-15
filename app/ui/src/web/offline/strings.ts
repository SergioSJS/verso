// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of the window kept offline (ADR 0092 item 9: pt-BR and
// English), in the language the server's pages are in (`web/strings.ts`).

import { bytes, lang } from "../strings";

const pt = {
  section: "Sem rede",
  title: "Disponível sem rede",
  desc: "Guarda esta pasta neste aparelho: o Verso abre sem conexão, você lê e escreve nas notas, e o que mudou cruza quando a rede voltar, pelas mesmas regras de sincronização do app de computador.",
  label: "Disponível sem rede neste aparelho",
  labelDesc: "Cada pasta decide por si, e só neste aparelho. Desligada, nada fica guardado aqui.",
  needsHttps: "Sem rede precisa de HTTPS. Este endereço usa HTTP simples, e o navegador só deixa uma página abrir sem rede quando ela veio por uma conexão segura.",
  noStorage: "Este navegador não guarda dados para uso sem rede. Tente outro, ou instale a página na tela de início.",
  turnOn: "Deixar disponível sem rede",
  turnOff: "Desligar e apagar a cópia daqui",
  looking: "Vendo quanto espaço isso ocupa…",
  space: (notes: number, files: number, attachments: number, count: number) =>
    `${files} notas e arquivos de texto, ${bytes(notes)}, ficam inteiros. Anexos (figuras, PDFs, áudio e vídeo): ${count} no servidor, ${bytes(attachments)}.`,
  window: (size: string) => `O código do Verso (cerca de ${size}) também fica guardado, uma vez só, para todas as pastas.`,
  quota: (use: string, quota: string) => `Este navegador deixa o Verso guardar até ${quota} (já usa ${use}).`,
  tooBig: (need: string, free: string) => `Não cabe: precisa de cerca de ${need} e o navegador oferece ${free}. Escolha guardar os anexos só depois de abertos, ou libere espaço.`,
  attachments: "Anexos",
  attachmentsDesc: "Figuras e PDFs ficam guardados depois que você os abre, ou todos de uma vez.",
  opened: "Só depois de abertos",
  all: "Todos (“Guardar todos os anexos”)",
  confirm: "Guardar neste aparelho",
  cancel: "Cancelar",
  persistGranted: "O navegador prometeu não apagar esta cópia por falta de espaço.",
  persistDenied: "O navegador não prometeu guardar esta cópia: se faltar espaço no aparelho, ele pode apagá-la. Isso é mais provável no iPhone e no iPad; instalar a página na tela de início (Compartilhar › Adicionar à Tela de Início) aumenta a chance. As mudanças que ainda não subiram é que correm risco, então deixe o aparelho conectar de vez em quando.",
  persistUnknown: "Este navegador não diz se vai manter a cópia.",
  encryption: "A cópia neste aparelho não é cifrada: o armazenamento do navegador é tão seguro quanto o aparelho desbloqueado. Sair da conta apaga a cópia. Se o servidor encerrar a sessão, só as mudanças que não subiram ficam neste navegador, até você entrar de novo ou sair.",
  kept: (files: number, size: string) => `${files} arquivos guardados, ${size}.`,
  waiting: (n: number) => (n === 0 ? "Nada esperando para subir." : n === 1 ? "1 mudança espera para subir." : `${n} mudanças esperam para subir.`),
  last: (when: string) => `Última vez que conferiu com o servidor: ${when}.`,
  never: "Ainda não conferiu com o servidor.",
  progress: (done: number, total: number) => `Preparando a janela para abrir sem rede: ${done} de ${total} arquivos.`,
  ready: "A janela abre sem rede neste aparelho.",
  notReady: "Ainda guardando a janela para abrir sem rede…",
  workerFailed: (why: string) => `Não deu para guardar a janela para abrir sem rede (${why}). A pasta continua guardada; tente de novo com a rede estável.`,
  turnOffAsk: (n: number) =>
    n === 0
      ? "Apagar a cópia desta pasta neste aparelho? O que está no servidor não muda."
      : `${n === 1 ? "1 mudança" : `${n} mudanças`} ainda não subiu${n === 1 ? "" : "ram"}. Apagar a cópia perde ${n === 1 ? "essa mudança" : "essas mudanças"}. Apagar mesmo?`,
  signOutAsk: (n: number) =>
    n === 0
      ? "Sair apaga neste aparelho as pastas guardadas para uso sem rede. O que está no servidor não muda. Sair?"
      : `${n === 1 ? "1 mudança" : `${n} mudanças`} ainda não subiu${n === 1 ? "" : "ram"}. Sair apaga a cópia deste aparelho e ${n === 1 ? "essa mudança se perde" : "essas mudanças se perdem"}. Sair mesmo?`,
  signOutYes: "Sair e apagar a cópia",
  turnOffYes: "Apagar a cópia",
  heldByServer: (n: number) =>
    n === 0
      ? "O servidor encerrou esta sessão: as pastas guardadas neste aparelho foram apagadas."
      : `O servidor encerrou esta sessão. ${n === 1 ? "1 mudança que ainda não tinha subido ficou guardada" : `${n} mudanças que ainda não tinham subido ficaram guardadas`} neste navegador: entre de novo com a mesma conta e ${n === 1 ? "ela é enviada" : "elas são enviadas"}. O resto das pastas guardadas foi apagado deste aparelho.`,
  heldSending: (n: number) =>
    n === 1
      ? "1 mudança guardada quando a sessão terminou está sendo enviada; o servidor confere se ainda cabe."
      : `${n} mudanças guardadas quando a sessão terminou estão sendo enviadas; o servidor confere cada uma.`,
  otherTitle: "Mudanças de outra conta",
  otherLead: (n: number) =>
    `Este navegador guarda ${n === 1 ? "1 mudança" : `${n} mudanças`} de outra conta, que não ${n === 1 ? "subiu" : "subiram"} quando a sessão dela terminou. Elas nunca são enviadas pela sua conta nem aparecem nas suas pastas. Você pode baixá-las como arquivos, para entregar a quem as fez, ou descartá-las.`,
  otherDownload: "Baixar como arquivos",
  otherDiscard: "Descartar",
  otherLater: "Agora não",
  otherDownloaded: "Baixado. Quando não precisar mais delas neste navegador, descarte.",
  otherDiscardAsk: (n: number) => `Descartar ${n === 1 ? "1 mudança" : `${n} mudanças`} de outra conta? Não dá para recuperar.`,
  otherDiscardYes: "Descartar mesmo",
  otherZip: "verso-mudancas-guardadas.zip",
  otherDeletedName: "apagados.txt",
  otherDeletedHead: "Arquivos que foram apagados neste navegador e não subiram:",
  // The status and the notices.
  nowOffline: "Sem rede: você edita as notas guardadas neste aparelho; o que mudar sobe quando a rede voltar.",
  backOnline: "A rede voltou.",
  backSent: (n: number) => (n === 1 ? "Voltou a rede: 1 mudança enviada." : `Voltou a rede: ${n} mudanças enviadas.`),
  backTitle: "De volta à rede",
  conflictsAfter: (n: number) => (n === 1 ? "1 nota mudou nos dois lados: a cópia está em Ajustes › Sem rede." : `${n} notas mudaram nos dois lados: as cópias estão em Ajustes › Sem rede.`),
  searchOffline: "Buscar — sem rede: nas notas deste aparelho",
  offlineMark: "sem rede: a partir das notas deste aparelho",
  notKept: "Esta pasta não está guardada neste aparelho: sem rede, só as pastas guardadas abrem.",
  notHere: "Isto precisa do servidor e não funciona sem rede.",
  full: "O armazenamento do navegador está cheio: esta mudança não foi guardada. Libere espaço no aparelho ou apague uma pasta guardada.",
  fullShort: "O armazenamento do navegador está cheio.",
  chooseOffline: "Guardadas neste aparelho",
  stillSyncing: "Conferindo com o servidor…",
  startOffline: "Sem rede: abrindo o que está guardado neste aparelho.",
  nothingKept: "Sem rede, e nenhuma pasta está guardada neste aparelho. Ligue “Disponível sem rede” numa pasta enquanto houver conexão.",
  turnedOn: (name: string) => `${name} ficou disponível sem rede.`,
  turnedOff: (name: string) => `A cópia de ${name} foi apagada deste aparelho.`,
  keepNow: "Guardar todos os anexos",
};

const en: typeof pt = {
  section: "Offline",
  title: "Available offline",
  desc: "Keeps this folder on this device: Verso opens with no connection, you read and write the notes, and what changed crosses when the network returns, by the same sync rules as the desktop app.",
  label: "Available offline on this device",
  labelDesc: "Each folder decides for itself, and only on this device. Off, nothing is kept here.",
  needsHttps: "Offline needs HTTPS. This address uses plain HTTP, and the browser only lets a page open offline when it came over a secure connection.",
  noStorage: "This browser keeps no data for offline use. Try another, or install the page on the home screen.",
  turnOn: "Make available offline",
  turnOff: "Turn off and delete the copy here",
  looking: "Finding out how much space this takes…",
  space: (notes: number, files: number, attachments: number, count: number) =>
    `${files} notes and text files, ${bytes(notes)}, are kept whole. Attachments (pictures, PDFs, audio and video): ${count} on the server, ${bytes(attachments)}.`,
  window: (size: string) => `Verso's own code (about ${size}) is kept too, once for all folders.`,
  quota: (use: string, quota: string) => `This browser lets Verso keep up to ${quota} (using ${use} now).`,
  tooBig: (need: string, free: string) => `It does not fit: it needs about ${need} and the browser offers ${free}. Keep attachments only once opened, or free up space.`,
  attachments: "Attachments",
  attachmentsDesc: "Pictures and PDFs are kept once you open them, or all at once.",
  opened: "Only once opened",
  all: "All (“Keep every attachment”)",
  confirm: "Keep on this device",
  cancel: "Cancel",
  persistGranted: "The browser promised not to delete this copy when space runs short.",
  persistDenied: "The browser did not promise to keep this copy: if the device runs short of space it may delete it. That is likelier on iPhone and iPad; installing the page on the home screen (Share › Add to Home Screen) improves the odds. It is the changes not yet sent that are at risk, so let the device connect now and then.",
  persistUnknown: "This browser does not say whether it will keep the copy.",
  encryption: "The copy on this device is not encrypted: the browser's storage is as safe as the unlocked device. Signing out deletes the copy. If the server ends the session, only the changes that did not go up stay in this browser, until you sign in again or sign out.",
  kept: (files: number, size: string) => `${files} files kept, ${size}.`,
  waiting: (n: number) => (n === 0 ? "Nothing waiting to go up." : n === 1 ? "1 change is waiting to go up." : `${n} changes are waiting to go up.`),
  last: (when: string) => `Last checked with the server: ${when}.`,
  never: "Not checked with the server yet.",
  progress: (done: number, total: number) => `Getting the window ready to open offline: ${done} of ${total} files.`,
  ready: "The window opens offline on this device.",
  notReady: "Still keeping the window to open offline…",
  workerFailed: (why: string) => `Could not keep the window to open offline (${why}). The folder is still kept; try again on a steady connection.`,
  turnOffAsk: (n: number) =>
    n === 0
      ? "Delete this folder's copy on this device? What is on the server does not change."
      : `${n === 1 ? "1 change has" : `${n} changes have`} not gone up yet. Deleting the copy loses ${n === 1 ? "it" : "them"}. Delete anyway?`,
  signOutAsk: (n: number) =>
    n === 0
      ? "Signing out deletes the folders kept for offline use on this device. What is on the server does not change. Sign out?"
      : `${n === 1 ? "1 change has" : `${n} changes have`} not gone up yet. Signing out deletes this device's copy and ${n === 1 ? "that change is lost" : "those changes are lost"}. Sign out anyway?`,
  signOutYes: "Sign out and delete the copy",
  turnOffYes: "Delete the copy",
  heldByServer: (n: number) =>
    n === 0
      ? "The server ended this session: the folders kept on this device were deleted."
      : `The server ended this session. ${n === 1 ? "1 change that had not gone up is" : `${n} changes that had not gone up are`} kept in this browser: sign in again with the same account and ${n === 1 ? "it is" : "they are"} sent. The rest of the kept folders was deleted from this device.`,
  heldSending: (n: number) =>
    n === 1
      ? "1 change kept when the session ended is being sent; the server checks it still fits."
      : `${n} changes kept when the session ended are being sent; the server checks each one.`,
  otherTitle: "Another account's changes",
  otherLead: (n: number) =>
    `This browser keeps ${n === 1 ? "1 change" : `${n} changes`} of another account that did not go up when its session ended. They are never sent by your account, nor shown in your folders. You can download them as files, to hand to whoever made them, or discard them.`,
  otherDownload: "Download as files",
  otherDiscard: "Discard",
  otherLater: "Not now",
  otherDownloaded: "Downloaded. When this browser no longer needs them, discard them.",
  otherDiscardAsk: (n: number) => `Discard ${n === 1 ? "1 change" : `${n} changes`} of another account? They cannot be recovered.`,
  otherDiscardYes: "Discard them",
  otherZip: "verso-kept-changes.zip",
  otherDeletedName: "deleted.txt",
  otherDeletedHead: "Files deleted in this browser that did not go up:",
  nowOffline: "Offline: you are editing the notes kept on this device; what changes goes up when the network returns.",
  backOnline: "The network is back.",
  backSent: (n: number) => (n === 1 ? "Back online: 1 change sent." : `Back online: ${n} changes sent.`),
  backTitle: "Back online",
  conflictsAfter: (n: number) => (n === 1 ? "1 note changed on both sides: its copy is in Settings › Offline." : `${n} notes changed on both sides: the copies are in Settings › Offline.`),
  searchOffline: "Search — offline: in the notes on this device",
  offlineMark: "offline: from the notes on this device",
  notKept: "This folder is not kept on this device: offline, only kept folders open.",
  notHere: "This needs the server and does not work offline.",
  full: "The browser's storage is full: this change was not kept. Free up space on the device or delete a kept folder.",
  fullShort: "The browser's storage is full.",
  chooseOffline: "Kept on this device",
  stillSyncing: "Checking with the server…",
  startOffline: "Offline: opening what is kept on this device.",
  nothingKept: "Offline, and no folder is kept on this device. Turn on “Available offline” for a folder while connected.",
  turnedOn: (name: string) => `${name} is now available offline.`,
  turnedOff: (name: string) => `The copy of ${name} was deleted from this device.`,
  keepNow: "Keep every attachment",
};

export type OfflineStrings = typeof pt;

/** The words, in the language the server's pages are in. */
export function o(): OfflineStrings {
  return lang() === "pt" ? pt : en;
}
