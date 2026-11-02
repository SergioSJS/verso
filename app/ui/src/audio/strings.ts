// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What an audio embed's player says (ADR 0116, amendment of 2026-11-01), in
// pt-BR and English.

import { LANG } from "../strings";

type Words = {
  group: (name: string) => string;
  play: (name: string) => string;
  pause: (name: string) => string;
  position: string;
  positionText: (at: string, of: string | null) => string;
  volume: string;
  volumeText: (n: number) => string;
  mute: string;
  unmute: string;
  loopOn: string;
  loopOff: string;
  open: (file: string) => string;
  forTable: string;
  forTableDesc: string;
  inMusic: string;
  inMusicDesc: string;
  ducked: string;
  pausedForTable: string;
  cannotHere: string;
  failed: string;
};

const pt: Words = {
  group: (name) => `Áudio: ${name}`,
  play: (name) => `Tocar “${name}”`,
  pause: (name) => `Pausar “${name}”`,
  position: "Posição",
  positionText: (at, of) => (of ? `${at} de ${of}` : at),
  volume: "Volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Silenciar",
  unmute: "Tirar do silêncio",
  loopOn: "Repetir: ligado",
  loopOff: "Repetir: desligado",
  open: (file) => `Abrir ${file}`,
  forTable: "Tocar para a mesa",
  forTableDesc: "Toca este arquivo para todos na mesa, pela aba Música.",
  inMusic: "Tocar na aba Música",
  inMusicDesc: "Toca este arquivo na aba Música desta janela, com fila e repetição.",
  ducked: "A música da mesa fica mais baixa enquanto isto toca.",
  pausedForTable: "Pausado: a música da mesa começou.",
  cannotHere: "Esta janela não toca este formato. MP3 ou AAC tocam em toda parte.",
  failed: "O arquivo não abriu nesta janela.",
};

const en: Words = {
  group: (name) => `Audio: ${name}`,
  play: (name) => `Play “${name}”`,
  pause: (name) => `Pause “${name}”`,
  position: "Position",
  positionText: (at, of) => (of ? `${at} of ${of}` : at),
  volume: "Volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Mute",
  unmute: "Unmute",
  loopOn: "Loop: on",
  loopOff: "Loop: off",
  open: (file) => `Open ${file}`,
  forTable: "Play for the table",
  forTableDesc: "Plays this file for everyone at the table, through the Music tab.",
  inMusic: "Play in the Music tab",
  inMusicDesc: "Plays this file in this window's Music tab, with a queue and loop.",
  ducked: "The table's music is lower while this plays.",
  pausedForTable: "Paused: the table's music started.",
  cannotHere: "This window cannot play this format. MP3 or AAC play everywhere.",
  failed: "The file did not open in this window.",
};

export const aw: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
