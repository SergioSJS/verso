// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What secret blocks say (ADR 0087 items 1, 5 and 7), in both languages
// (ADR 0035): the kind's label, the mark on the block, the "view as a
// reader" toggle and what the block does not protect.

import { LANG } from "../strings";

const pt = {
  /** The kind `secret`, as the window names it (item 1). */
  label: "Segredo",
  /** On a block of a note a UniVerso serves (item 5). */
  hidden: "Oculto para leitores",
  /** On a block of a folder of this computer, where nothing is hidden. */
  local: "Visível para quem tiver o arquivo",
  view: "Ver como leitor",
  viewHint: "Mostra a nota como quem só pode lê-la a recebe: sem os blocos secretos. Só leitura.",
  viewing: "Vendo como um leitor: os blocos secretos não aparecem, e nada aqui se edita.",
  back: "Ver a nota inteira",
  failed: (why: string) => `Não deu para mostrar a nota como um leitor a vê: ${why}. A nota inteira continua aqui.`,
  /** The slash command that makes one, and what it does not protect (item 7). */
  slashTitle: "Segredo",
  slashDesc: "Oculto para quem só lê a nota num UniVerso. Não é criptografia: quem pode editar, ou tem o arquivo, vê.",
};

const en: typeof pt = {
  label: "Secret",
  hidden: "Hidden from readers",
  local: "Visible to anyone with the file",
  view: "View as a reader",
  viewHint: "Shows the note as one who may only read it receives it: without the secret blocks. Read-only.",
  viewing: "Viewing as a reader: the secret blocks are left out, and nothing here can be edited.",
  back: "See the whole note",
  failed: (why) => `Could not show the note as a reader sees it: ${why}. The whole note is still here.`,
  slashTitle: "Secret",
  slashDesc: "Hidden from those who may only read the note on a UniVerso. Not encryption: whoever may edit it, or holds the file, sees it.",
};

export const ss = LANG.toLowerCase().startsWith("pt") ? pt : en;
