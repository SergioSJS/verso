// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table's music says (ADR 0116 items 24 to 26), in pt-BR and
// English.

import { LANG } from "../../strings";

type Words = {
  strip: string;
  nothing: string;
  playFile: string;
  playFileDesc: string;
  pickTitle: string;
  pickNone: string;
  play: (name: string) => string;
  pause: string;
  resume: string;
  stop: string;
  previous: string;
  next: string;
  loopOff: string;
  loopTrack: string;
  loopScene: string;
  position: string;
  positionText: (at: string, of: string) => string;
  masterVolume: string;
  ownVolume: string;
  volumeText: (n: number) => string;
  mute: string;
  unmute: string;
  follow: string;
  followDesc: string;
  hidden: string;
  playing: (name: string) => string;
  paused: (name: string) => string;
  stopped: string;
  by: (name: string) => string;
  hear: string;
  hearDesc: string;
  notHearing: (names: string) => string;
  cannot: (names: string) => string;
  cannotHere: string;
  large: string;
  missing: string;
  status: (name: string) => string;
  statusDesc: string;
  askUnheard: (n: number, names: string) => string;
  release: string;
  without: string;
  cancel: string;
  released: (name: string) => string;
  playButton: (name: string) => string;
  onlyMaster: string;
  alone: string;
};

const pt: Words = {
  strip: "Música da mesa",
  nothing: "Nada tocando",
  playFile: "Tocar um arquivo…",
  playFileDesc: "Escolhe um arquivo de som desta pasta para todos da mesa ouvirem.",
  pickTitle: "Arquivos de som da pasta",
  pickNone: "Esta pasta não tem arquivos de som (MP3, M4A, OGG, WAV, FLAC).",
  play: (name) => `Tocar “${name}”`,
  pause: "Pausar",
  resume: "Continuar",
  stop: "Parar",
  previous: "Faixa anterior da cena",
  next: "Próxima faixa da cena",
  loopOff: "Repetir: desligado",
  loopTrack: "Repetir: esta faixa",
  loopScene: "Repetir: a cena",
  position: "Posição",
  positionText: (at, of) => (of ? `${at} de ${of}` : at),
  masterVolume: "Volume da mesa",
  ownVolume: "Seu volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Silenciar",
  unmute: "Voltar o som",
  follow: "Seguir a mesa",
  followDesc: "Desligado, só esta janela fica em silêncio; ninguém mais é silenciado.",
  hidden: "uma faixa que você não vê",
  playing: (name) => `Tocando: ${name}`,
  paused: (name) => `Pausado: ${name}`,
  stopped: "Música parada",
  by: (name) => `por ${name}`,
  hear: "Ouvir a mesa",
  hearDesc: "O navegador só toca som depois de um toque: clique para ouvir o que toca na mesa.",
  notHearing: (names) => `Não ouvem (não veem o arquivo): ${names}`,
  cannot: (names) => `Não conseguem tocar este formato: ${names}. MP3 ou AAC tocam em todo lugar.`,
  cannotHere: "Esta janela não toca este formato. MP3 ou AAC tocam em todo lugar.",
  large: "Arquivo grande: cada pessoa da mesa baixa ele inteiro. MP3 ou AAC pesam bem menos.",
  missing: "O arquivo não abriu nesta janela.",
  status: (name) => `Música: ${name}`,
  statusDesc: "Abre o painel Mesa, onde está a música.",
  askUnheard: (n, names) => `${n === 1 ? "1 jogador não vê" : `${n} jogadores não veem`} este arquivo (${names}). Liberar para a mesa e tocar?`,
  release: "Liberar e tocar",
  without: "Tocar sem eles",
  cancel: "Cancelar",
  released: (name) => `“${name}” liberado para a mesa.`,
  playButton: (name) => `Tocar “${name}” na mesa`,
  onlyMaster: "Só o mestre controla a música da mesa.",
  alone: "Só nesta janela: a pasta não tem mesa.",
};

const en: Words = {
  strip: "Table music",
  nothing: "Nothing is playing",
  playFile: "Play a file…",
  playFileDesc: "Chooses a sound file of this folder for everyone at the table to hear.",
  pickTitle: "Sound files of the folder",
  pickNone: "This folder has no sound files (MP3, M4A, OGG, WAV, FLAC).",
  play: (name) => `Play “${name}”`,
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
  previous: "Previous track of the scene",
  next: "Next track of the scene",
  loopOff: "Loop: off",
  loopTrack: "Loop: this track",
  loopScene: "Loop: the scene",
  position: "Position",
  positionText: (at, of) => (of ? `${at} of ${of}` : at),
  masterVolume: "Table volume",
  ownVolume: "Your volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Mute",
  unmute: "Unmute",
  follow: "Follow the table",
  followDesc: "Off, only this window goes silent; nobody else is muted.",
  hidden: "a track you do not see",
  playing: (name) => `Playing: ${name}`,
  paused: (name) => `Paused: ${name}`,
  stopped: "Music stopped",
  by: (name) => `by ${name}`,
  hear: "Hear the table",
  hearDesc: "The browser plays sound only after a touch: click to hear what plays at the table.",
  notHearing: (names) => `Not hearing (they do not see the file): ${names}`,
  cannot: (names) => `Cannot play this format: ${names}. MP3 or AAC play everywhere.`,
  cannotHere: "This window cannot play this format. MP3 or AAC play everywhere.",
  large: "Large file: everyone at the table downloads all of it. MP3 or AAC weigh far less.",
  missing: "The file did not open in this window.",
  status: (name) => `Music: ${name}`,
  statusDesc: "Opens the Table panel, where the music is.",
  askUnheard: (n, names) => `${n === 1 ? "1 player does not see" : `${n} players do not see`} this file (${names}). Release it to the table and play?`,
  release: "Release and play",
  without: "Play without them",
  cancel: "Cancel",
  released: (name) => `“${name}” released to the table.`,
  playButton: (name) => `Play “${name}” at the table`,
  onlyMaster: "Only the game master controls the table's music.",
  alone: "In this window only: the folder has no table.",
};

export const st: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
