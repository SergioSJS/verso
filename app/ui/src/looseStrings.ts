// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of a file opened without a folder (ADR 0114 item 27), in
// pt-BR and EN (ADR 0035), as the share strings are kept beside theirs.

import { LANG } from "./strings";

const pt = {
  in: (place: string) => `em ${place}`,
  bar: "Arquivo avulso",
  openWhole: "Abrir a pasta inteira",
  openWholeDesc: (folder: string) => `Abrir a pasta inteira “${folder}” no Verso`,
  openWholeAsk: (folder: string) => `Abrir a pasta “${folder}” no Verso? Ela passa a ser indexada e aparece na árvore, com busca e links entre as notas; um índice é guardado fora dela.`,
  openWholeYes: "Abrir a pasta",
  knownOpen: (folder: string) => `Abrir “${folder}”`,
  knownOpenDesc: (folder: string) => `Abrir “${folder}”, a pasta que você já abriu no Verso e que guarda este arquivo`,
  readOnlyPermissions: "Só leitura: o sistema não deixa gravar este arquivo (permissões, arquivo bloqueado ou volume só de leitura). Use “Salvar uma cópia…”.",
  readOnlyTooLarge: "Só leitura: o arquivo passa de 8 MiB e é mostrado no modo Fonte. Use “Salvar uma cópia…” para editar uma cópia.",
  saveAgain: "Gravar aqui de novo",
  saveCopy: "Salvar uma cópia…",
  savedAgain: "Arquivo gravado de novo no mesmo lugar.",
  copySaved: "Cópia salva.",
  copyCancelled: "Nada salvo.",
  noSibling: "Não há nota com esse nome ao lado deste arquivo. Abra a pasta inteira para seguir links.",
  handedOther: (name: string) => `“${name}” não é uma pasta nem um arquivo que o Verso abre (.md, .json, .yaml, .toml, .xml, .csv): nada foi aberto.`,
  handedMissing: (name: string) => `“${name}” não existe mais: nada foi aberto.`,
  handedPlaceholder: (name: string) => `“${name}” está só na nuvem, numa forma que o Verso não consegue baixar: nada foi aberto.`,
  handedUnreadable: (name: string) => `“${name}” não pôde ser lido: nada foi aberto.`,
  moveToWindow: "Mover para nova janela",
  defaultTitle: "Abrir arquivos .md com o Verso por padrão",
  defaultMac: "O Verso aparece em “Abrir com” de qualquer arquivo .md (e .json, .yaml, .toml, .xml, .csv, que abrem no diagrama). Para ser o padrão: no Finder, selecione um arquivo desse tipo, Obter Informações › Abrir com › Verso › Alterar tudo.",
  defaultWindows: "O Verso aparece em “Abrir com” de qualquer arquivo .md (e .json, .yaml, .toml, .xml, .csv, que abrem no diagrama). Para ser o padrão: Ajustes › Aplicativos › Aplicativos padrão, escolha o Verso para cada extensão.",
  defaultLinux: "O Verso aparece em “Abrir com” de qualquer arquivo .md (e .json, .yaml, .toml, .xml, .csv, que abrem no diagrama). Para ser o padrão: no gerenciador de arquivos, Abrir com › Verso, marcando como padrão; ou no terminal: xdg-mime default verso-app.desktop text/markdown (application/json para JSON, e assim por diante).",
  defaultButton: "Abrir Aplicativos padrão",
  recentFiles: "Arquivos",
  goneFile: "Este arquivo foi apagado ou movido fora do Verso. O seu texto continua aqui.",
  gonePendingFile: "Nada gravado: o arquivo não está mais lá — escolha acima entre gravar de novo, salvar uma cópia e fechar sem salvar.",
  asText: (why: string) => `${why} Aberto como texto.`,
};

const en: typeof pt = {
  in: (place: string) => `in ${place}`,
  bar: "Single file",
  openWhole: "Open the whole folder",
  openWholeDesc: (folder: string) => `Open the whole folder “${folder}” in Verso`,
  openWholeAsk: (folder: string) => `Open the folder “${folder}” in Verso? It will be indexed and shown as a tree, with search and links between notes; an index is kept outside it.`,
  openWholeYes: "Open the folder",
  knownOpen: (folder: string) => `Open “${folder}”`,
  knownOpenDesc: (folder: string) => `Open “${folder}”, the folder you have opened in Verso before that holds this file`,
  readOnlyPermissions: "Read only: the system does not let this file be written (permissions, a locked file or a read-only volume). Use “Save a copy…”.",
  readOnlyTooLarge: "Read only: the file is over 8 MiB and is shown in Source. Use “Save a copy…” to edit a copy.",
  saveAgain: "Save here again",
  saveCopy: "Save a copy…",
  savedAgain: "File saved again in the same place.",
  copySaved: "Copy saved.",
  copyCancelled: "Nothing saved.",
  noSibling: "There is no note of that name beside this file. Open the whole folder to follow links.",
  handedOther: (name: string) => `“${name}” is neither a folder nor a file Verso opens (.md, .json, .yaml, .toml, .xml, .csv): nothing was opened.`,
  handedMissing: (name: string) => `“${name}” is not there any more: nothing was opened.`,
  handedPlaceholder: (name: string) => `“${name}” is only in the cloud, in a form Verso cannot download: nothing was opened.`,
  handedUnreadable: (name: string) => `“${name}” could not be read: nothing was opened.`,
  moveToWindow: "Move to new window",
  defaultTitle: "Open .md files with Verso by default",
  defaultMac: "Verso is offered under “Open with” for any .md file (and .json, .yaml, .toml, .xml, .csv, which open in the diagram). To make it the default: in Finder, select a file of that kind, Get Info › Open with › Verso › Change All.",
  defaultWindows: "Verso is offered under “Open with” for any .md file (and .json, .yaml, .toml, .xml, .csv, which open in the diagram). To make it the default: Settings › Apps › Default apps, choose Verso for each extension.",
  defaultLinux: "Verso is offered under “Open with” for any .md file (and .json, .yaml, .toml, .xml, .csv, which open in the diagram). To make it the default: in the file manager, Open With › Verso, set as default; or in a terminal: xdg-mime default verso-app.desktop text/markdown (application/json for JSON, and so on).",
  defaultButton: "Open Default apps",
  recentFiles: "Files",
  goneFile: "This file was deleted or moved outside Verso. Your text is still here.",
  gonePendingFile: "Nothing written: the file is no longer there — choose above between saving it here again, saving a copy and closing without saving.",
  asText: (why: string) => `${why} Opened as text.`,
};

export const ls = LANG.toLowerCase().startsWith("pt") ? pt : en;

/** The Settings line's words for this system (ADR 0114 item 5, Q12). */
export function defaultAppDesc(platform: { mac: boolean; windows: boolean }): string {
  if (platform.mac) return ls.defaultMac;
  if (platform.windows) return ls.defaultWindows;
  return ls.defaultLinux;
}

/** What the window says when the system handed something it does not
 *  open (ADR 0114 item 6): by the kind the host classified. */
export function handedRefusedText(kind: string, name: string): string {
  switch (kind) {
    case "missing":
      return ls.handedMissing(name);
    case "placeholder":
      return ls.handedPlaceholder(name);
    case "unreadable":
      return ls.handedUnreadable(name);
    default:
      return ls.handedOther(name);
  }
}
