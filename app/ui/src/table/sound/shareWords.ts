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
  needsMac: string;
  needsWindows: string;
  needsPulse: string;
  noPages: string;
  pagesName: string;
  /** A phone's one source and its refusals (ADR 0118 item 5). */
  phoneName: string;
  phoneRefused: string;
  phoneMic: string;
  pagesHint: string;
  pagesHintMac: string;
  pagesHintLinux: string;
  macDenied: string;
  quality: string;
  qualityHint: string;
  kbps: (n: number) => string;
  start: string;
  starting: string;
  notice: string;
  noticeMac: string;
  noticeLinux: string;
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
  deaf: string;
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
  needsMac: "Compartilhar áudio no Mac precisa do macOS 14.4 ou mais novo. Atualize o macOS para compartilhar o som das páginas.",
  pagesHintLinux: "Só o som das páginas abertas como página no Verso (YouTube, Spotify Web, uma trilha de ambiente) vai para a mesa, todas juntas. Os sons do próprio Verso (dados, avisos, a música da mesa, os players de áudio das notas) e de outros programas nunca vão. Um vídeo ou uma página mostrada dentro de uma nota não conta: abra-a como página.",
  macDenied: "O macOS não deixou o Verso gravar o som do sistema. Abra Ajustes do Sistema > Privacidade e Segurança > Gravação de Áudio do Sistema (em algumas versões, “Tela e Áudio do Sistema”), ligue o Verso e comece de novo.",
  needsWindows: "Compartilhar áudio no Windows precisa do Windows 11 ou mais novo (o Windows 10 não consegue separar o som das páginas do resto do computador).",
  needsPulse: "Compartilhar áudio no Linux precisa das ferramentas de som do PulseAudio (pactl e parec; no Debian e no Ubuntu, o pacote pulseaudio-utils, que o PipeWire também usa). Instale-as e escolha compartilhar de novo.",
  noPages: "Abra uma página no Verso (como página, não dentro de uma nota) e deixe-a tocar; depois escolha compartilhar de novo.",
  pagesName: "Páginas abertas no Verso",
  phoneName: "Som dos apps do celular",
  phoneRefused: "O Android não deixou: para compartilhar o som do celular, permita no aviso de captura de tela do Android.",
  phoneMic: "O Android pede a permissão do microfone para captar o som dos outros apps: permita e escolha compartilhar de novo.",
  pagesHint: "Só o som das páginas abertas como página no Verso (YouTube, Spotify Web, uma trilha de ambiente) vai para a mesa, todas juntas. Os sons do próprio Verso (dados, avisos, a música da mesa) e de outros programas nunca vão. Uma página mostrada dentro de uma nota não conta: abra-a como página.",
  pagesHintMac: "Só o som das páginas abertas no Verso (YouTube, Spotify Web, uma trilha de ambiente) vai para a mesa, todas juntas. Os sons do próprio Verso (dados, avisos, a música da mesa, os players de áudio das notas) e de outros programas nunca vão. No Mac, um vídeo ou uma página mostrada dentro de uma nota não dá para separar: o som dela vai junto.",
  quality: "Qualidade",
  qualityHint: "Mais alta soa melhor e usa mais da conexão. 96 é um bom começo.",
  kbps: (n) => `${n} kbit/s`,
  start: "Começar a compartilhar",
  starting: "Começando…",
  notice: "O som do que você compartilha vai para todos desta mesa. O que você pode tocar para os outros é responsabilidade sua; o Verso não grava nada.",
  noticeMac: "Atenção no Mac: enquanto você compartilha, o som do próprio Verso (dados, avisos, música da mesa, players de áudio das notas) sai por um caminho próprio, com um atraso de alguns centésimos de segundo. Vídeos e páginas mostrados dentro de uma nota não dá para separar, então o som deles também vai para a mesa.",
  noticeLinux: "Atenção no Linux: enquanto você compartilha, o som do próprio Verso (dados, avisos, música da mesa, players de áudio das notas) sai por um caminho próprio, com um atraso de alguns centésimos de segundo. Vídeos e páginas mostrados dentro de uma nota não vão para a mesa; para compartilhar o som de uma página, abra-a como página.",
  noticeOk: "Entendi, compartilhar",
  replaceAsk: (by, name) => (by && name ? `${by} já está compartilhando ${name}. Encerrar e compartilhar este no lugar?` : "A mesa já tem um áudio compartilhado. Encerrar e compartilhar este no lugar?"),
  replace: "Substituir",
  failed: (why) => `O compartilhamento não começou: ${why}`,
  sharing: (name) => `Compartilhando ${name}`,
  meter: "Nível do som",
  checking: "Verificando o som…",
  arriving: "Som chegando",
  silence: "Silêncio: nada está sendo captado. Veja se a fonte está tocando e, no Mac, se o Verso pode gravar o som do sistema (Ajustes do Sistema > Privacidade e Segurança).",
  listeners: (n) => (n === 1 ? "1 ouvinte" : `${n} ouvintes`),
  stopSharing: "Parar de compartilhar",
  ended: "Compartilhamento encerrado",
  deaf: "Este navegador não consegue tocar o compartilhamento de áudio da mesa (sem AudioWorklet nem ScriptProcessor; sobre HTTP simples, só o segundo funciona). Abra o servidor por HTTPS ou use o app.",
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
  needsMac: "Sharing audio on a Mac needs macOS 14.4 or newer. Update macOS to share the sound of the pages.",
  pagesHintLinux: "Only the sound of pages opened as a page in Verso (YouTube, Spotify Web, an ambience loop) goes to the table, all together. Verso's own sounds (dice, alerts, the table's music, the audio players in notes) and other programs never do. A video or a page shown inside a note does not count: open it as a page.",
  macDenied: "macOS did not let Verso record system audio. Open System Settings > Privacy & Security > System Audio Recording (in some versions “Screen & System Audio Recording”), turn Verso on, and start again.",
  needsWindows: "Sharing audio on Windows needs Windows 11 or newer (Windows 10 cannot separate the sound of the pages from the rest of the computer).",
  needsPulse: "Sharing audio on Linux needs the PulseAudio sound tools (pactl and parec; on Debian and Ubuntu the package pulseaudio-utils, which PipeWire uses too). Install them and choose to share again.",
  noPages: "Open a page in Verso (as a page, not inside a note) and let it play; then choose to share again.",
  pagesName: "Pages open in Verso",
  phoneName: "Sound of the phone's apps",
  phoneRefused: "Android did not allow it: to share the phone's sound, allow it in Android's screen-capture prompt.",
  phoneMic: "Android asks for the microphone's permission to capture the other apps' sound: allow it and choose to share again.",
  pagesHint: "Only the sound of pages opened as a page in Verso (YouTube, Spotify Web, an ambience loop) goes to the table, all together. Verso's own sounds (dice, alerts, the table's music) and other programs never do. A page shown inside a note does not count: open it as a page.",
  pagesHintMac: "Only the sound of pages open in Verso (YouTube, Spotify Web, an ambience loop) goes to the table, all together. Verso's own sounds (dice, alerts, the table's music, the audio players in notes) and other programs never do. On a Mac, a video or a page shown inside a note cannot be told apart: its sound goes too.",
  quality: "Quality",
  qualityHint: "Higher sounds better and uses more of the connection. 96 is a good start.",
  kbps: (n) => `${n} kbit/s`,
  start: "Start sharing",
  starting: "Starting…",
  notice: "The sound of what you share goes to everyone at this table. What you may play to others is your responsibility; Verso records nothing.",
  noticeMac: "Note for the Mac: while you share, Verso's own sounds (dice, alerts, the table's music, the audio players in notes) leave by a path of their own, a few hundredths of a second later. Videos and pages shown inside a note cannot be told apart, so their sound goes to the table too.",
  noticeLinux: "Note for Linux: while you share, Verso's own sounds (dice, alerts, the table's music, the audio players in notes) leave by a path of their own, a few hundredths of a second later. Videos and pages shown inside a note do not go to the table; to share the sound of a page, open it as a page.",
  noticeOk: "Understood, share",
  replaceAsk: (by, name) => (by && name ? `${by} is already sharing ${name}. End it and share this instead?` : "The table already has a shared audio. End it and share this instead?"),
  replace: "Replace",
  failed: (why) => `Sharing did not start: ${why}`,
  sharing: (name) => `Sharing ${name}`,
  meter: "Sound level",
  checking: "Checking the sound…",
  arriving: "Sound arriving",
  silence: "Silence: nothing is being captured. Check that the source is playing and, on a Mac, that Verso may record system audio (System Settings > Privacy & Security).",
  listeners: (n) => (n === 1 ? "1 listening" : `${n} listening`),
  stopSharing: "Stop sharing",
  ended: "Sharing ended",
  deaf: "This browser cannot play the table's shared audio (no AudioWorklet and no ScriptProcessor; over plain HTTP only the second works). Open the server over HTTPS or use the app.",
  started: (name) => `Sharing ${name}`,
  by: (by, name) => `${by} is sharing ${name}`,
  statusSharing: (name) => `Sharing: ${name}`,
  statusStop: "Stop sharing audio",
};

/** Whether this window is a Mac's: the first-share notice and the pages' hint say what is true there. */
export function onMac(): boolean {
  try {
    return /Mac/i.test(navigator.platform || navigator.userAgent || "") && !/iP(hone|ad|od)/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

/** Whether this window is a Linux machine's (not Android): the notice and the pages' hint say what is true there. */
export function onLinux(): boolean {
  try {
    return /Linux|X11/i.test(navigator.platform || "") && !/Android/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

export const ss: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;

/** The host's own refusals about capture, which the window says in its language (`audio_share/source.rs`). */
export const HOST_NEEDS_MAC = "audio capture needs macOS 14.4 or later";
export const HOST_DENIED = "Verso is not allowed to record system audio";
export const HOST_NEEDS_WINDOWS = "audio capture needs Windows 11 or later";
export const HOST_NEEDS_PULSE = "audio capture needs the PulseAudio tools (pactl, parec)";
export const HOST_NO_PAGES = "no page is open in Verso to share";
/** A phone's refusals (src-tauri audio_share/android.rs). */
export const HOST_PHONE_REFUSED = "the screen capture was not allowed";
export const HOST_PHONE_MIC = "Verso is not allowed to record audio";
/** A phone's one source: its other apps' sound. */
export const PHONE_ID = "phone";
/** The id of Windows's one source, the pages open in Verso (`winpages.rs`). */
export const PAGES_ID = "pages";
/** The host names the source in English; the window says it in its language. */
export function sourceName(id: string, name: string): string {
  if (id === PAGES_ID) return name.replace(/^Pages open in Verso/, ss.pagesName);
  if (id === PHONE_ID) return ss.phoneName;
  return name;
}

/** A host refusal in the person's words, or null when it is not one of these. */
export function hostWhy(message: string): string | null {
  if (message === HOST_NEEDS_MAC) return ss.needsMac;
  if (message === HOST_DENIED) return ss.macDenied;
  if (message === HOST_NEEDS_WINDOWS) return ss.needsWindows;
  if (message === HOST_NEEDS_PULSE) return ss.needsPulse;
  if (message === HOST_NO_PAGES) return ss.noPages;
  if (message === HOST_PHONE_REFUSED) return ss.phoneRefused;
  if (message === HOST_PHONE_MIC) return ss.phoneMic;
  return null;
}
