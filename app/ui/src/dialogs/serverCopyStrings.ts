// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What picking a server's folder in the app says (the maintainer,
// 2026-11-15), in both languages (ADR 0035): the question of where its copy
// goes, its size, the download's progress, and the window on the server
// alone, the other way.

import { LANG } from "../strings";

const pt = {
  title: (name: string) => `Abrir “${name}”`,
  lede: "O Verso baixa a pasta inteira para este aparelho e a mantém igual à do servidor. Ela abre mesmo sem internet; o que mudar em qualquer lado sincroniza quando a rede voltar.",
  measuring: "Medindo a pasta no servidor…",
  size: (files: number, size: string) => `${files === 1 ? "1 arquivo" : `${files} arquivos`} · ${size}`,
  sizeEmpty: "A pasta está vazia no servidor.",
  where: "Onde guardar a cópia",
  inApp: "Dentro do app",
  inAppNote: "Só o Verso vê. Se o app for desinstalado, a cópia é apagada junto (o servidor fica com tudo).",
  phone: "Celular/Documents",
  phoneNote: "O Obsidian e os outros apps também veem. Precisa do acesso a todos os arquivos.",
  documents: "A cópia fica nos Documentos do Verso, que o app Arquivos mostra em No meu iPad (ou iPhone) › Verso.",
  choose: "Você escolhe a pasta onde a cópia fica; dentro dela é criada uma pasta com o nome desta.",
  download: "Baixar e abrir",
  chooseAndDownload: "Escolher onde e baixar…",
  remoteOnly: "Abrir só no servidor, sem cópia",
  remoteOnlyNote: "Só funciona com internet: nada fica neste aparelho.",
  cancel: "Cancelar",
  needsAccess: "Para guardar em Celular/Documents, o Verso precisa do acesso a todos os arquivos. Permita na página do Android e volte aqui.",
  allow: "Permitir acesso",
  accessGiven: "Acesso permitido. Toque em Baixar e abrir.",
  progress: (done: number, total: number) => `Baixando: ${done} de ${total} ${total === 1 ? "arquivo" : "arquivos"}…`,
  starting: "Conectando ao servidor para baixar…",
  done: (total: number) => `Pronto: ${total === 1 ? "1 arquivo está" : `${total} arquivos estão`} neste aparelho. A cópia abre mesmo sem internet.`,
  offline: "Sem conexão agora. O que já chegou fica aqui; o resto vem quando a rede voltar, com o Verso aberto nesta pasta.",
  stopped: (why: string) => `A cópia parou (${why}). Veja em Ajustes › Sincronizar.`,
  close: "Fechar",
  ok: "OK",
  progressLabel: "Download da cópia",
};
const en: typeof pt = {
  title: (name: string) => `Open “${name}”`,
  lede: "Verso downloads the whole folder to this device and keeps it the same as the server's. It opens offline too; what changes on either side syncs when the network is back.",
  measuring: "Measuring the folder on the server…",
  size: (files: number, size: string) => `${files === 1 ? "1 file" : `${files} files`} · ${size}`,
  sizeEmpty: "The folder is empty on the server.",
  where: "Where to keep the copy",
  inApp: "Inside the app",
  inAppNote: "Only Verso sees it. If the app is uninstalled, the copy is deleted with it (the server keeps everything).",
  phone: "Phone/Documents",
  phoneNote: "Obsidian and the other apps see it too. Needs the access to all files.",
  documents: "The copy is kept in Verso's Documents, which the Files app shows under On My iPad (or iPhone) › Verso.",
  choose: "You choose the folder the copy goes in; a folder with this one's name is made inside it.",
  download: "Download and open",
  chooseAndDownload: "Choose where and download…",
  remoteOnly: "Open on the server only, no copy",
  remoteOnlyNote: "Works only online: nothing stays on this device.",
  cancel: "Cancel",
  needsAccess: "To keep it in Phone/Documents, Verso needs the access to all files. Allow it on Android's page and come back here.",
  allow: "Allow access",
  accessGiven: "Access allowed. Tap Download and open.",
  progress: (done: number, total: number) => `Downloading: ${done} of ${total} ${total === 1 ? "file" : "files"}…`,
  starting: "Connecting to the server to download…",
  done: (total: number) => `Done: ${total === 1 ? "1 file is" : `${total} files are`} on this device. The copy opens offline too.`,
  offline: "No connection now. What arrived stays here; the rest comes when the network is back, with Verso open on this folder.",
  stopped: (why: string) => `The copy stopped (${why}). See Settings › Sync.`,
  close: "Close",
  ok: "OK",
  progressLabel: "The copy's download",
};

export const sc: typeof pt = LANG.toLowerCase().startsWith("pt") ? pt : en;
