// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What Share audio says (ADR 0116 section B, items 16, 21 and 26), in pt-BR
// and English: the button, the picker, the first-share notice, the sharer's
// card, the listener's line.

import type { AudioSourceKind } from "../../bindings";
import { LANG } from "../../strings";

type Words = {
  share: string;
  shareDesc: string;
  pickTitle: string;
  pickHelp: string;
  sources: string;
  kind: Record<AudioSourceKind, string>;
  noSources: string;
  quality: string;
  qualityHint: string;
  kbps: (n: number) => string;
  start: string;
  starting: string;
  notice: string;
  noticeOk: string;
  replaceAsk: (by: string | null, name: string | null) => string;
  replace: string;
  failed: (why: string) => string;
  sharing: (name: string) => string;
  meter: string;
  checking: string;
  arriving: string;
  silence: string;
  listeners: (n: number) => string;
  stopSharing: string;
  ended: string;
  started: (name: string) => string;
  by: (by: string, name: string) => string;
  statusSharing: (name: string) => string;
  statusStop: string;
};

const pt: Words = {
  share: "Compartilhar áudio…",
  shareDesc: "Compartilha o som de um aplicativo deste computador com todos da mesa.",
  pickTitle: "Compartilhar áudio",
  pickHelp: "Escolha o que compartilhar. Todos da mesa ouvem; você continua ouvindo a fonte direto.",
  sources: "Fontes de som",
  kind: { app: "Aplicativo", page: "Página no Verso", system: "Tudo que este computador toca" },
  noSources: "A captura de som chega numa próxima atualização, um sistema de cada vez. Por enquanto, este computador ainda não tem nada para compartilhar.",
  quality: "Qualidade",
  qualityHint: "Mais alta soa melhor e usa mais da conexão. 96 é um bom começo.",
  kbps: (n) => `${n} kbit/s`,
  start: "Começar a compartilhar",
  starting: "Começando…",
  notice: "O som do que você compartilha vai para todos desta mesa. O que você pode tocar para os outros é responsabilidade sua; o Verso não grava nada.",
  noticeOk: "Entendi, compartilhar",
  replaceAsk: (by, name) => (by && name ? `${by} já está compartilhando ${name}. Encerrar e compartilhar este no lugar?` : "A mesa já tem um áudio compartilhado. Encerrar e compartilhar este no lugar?"),
  replace: "Substituir",
  failed: (why) => `O compartilhamento não começou: ${why}`,
  sharing: (name) => `Compartilhando ${name}`,
  meter: "Nível do som",
  checking: "Verificando o som…",
  arriving: "Som chegando",
  silence: "Silêncio: nada está sendo captado. Veja se a fonte está tocando.",
  listeners: (n) => (n === 1 ? "1 ouvinte" : `${n} ouvintes`),
  stopSharing: "Parar de compartilhar",
  ended: "Compartilhamento encerrado",
  started: (name) => `Compartilhando ${name}`,
  by: (by, name) => `${by} está compartilhando ${name}`,
  statusSharing: (name) => `Compartilhando: ${name}`,
  statusStop: "Parar de compartilhar o áudio",
};

const en: Words = {
  share: "Share audio…",
  shareDesc: "Shares the sound of an app on this computer with everyone at the table.",
  pickTitle: "Share audio",
  pickHelp: "Choose what to share. Everyone at the table hears it; you keep hearing the source directly.",
  sources: "Sound sources",
  kind: { app: "Application", page: "Page in Verso", system: "Everything this computer plays" },
  noSources: "Capturing sound comes with a coming update, one system at a time. For now this computer has nothing to share yet.",
  quality: "Quality",
  qualityHint: "Higher sounds better and uses more of the connection. 96 is a good start.",
  kbps: (n) => `${n} kbit/s`,
  start: "Start sharing",
  starting: "Starting…",
  notice: "The sound of what you share goes to everyone at this table. What you may play to others is your responsibility; Verso records nothing.",
  noticeOk: "Understood, share",
  replaceAsk: (by, name) => (by && name ? `${by} is already sharing ${name}. End it and share this instead?` : "The table already has a shared audio. End it and share this instead?"),
  replace: "Replace",
  failed: (why) => `Sharing did not start: ${why}`,
  sharing: (name) => `Sharing ${name}`,
  meter: "Sound level",
  checking: "Checking the sound…",
  arriving: "Sound arriving",
  silence: "Silence: nothing is being captured. Check that the source is playing.",
  listeners: (n) => (n === 1 ? "1 listening" : `${n} listening`),
  stopSharing: "Stop sharing",
  ended: "Sharing ended",
  started: (name) => `Sharing ${name}`,
  by: (by, name) => `${by} is sharing ${name}`,
  statusSharing: (name) => `Sharing: ${name}`,
  statusStop: "Stop sharing audio",
};

export const ss: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
