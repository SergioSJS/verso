// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the table's music says (ADR 0116 items 24 to 26, and the Music tab
// of the amendment of 2026-10-31), in pt-BR and English.

import { LANG } from "../../strings";

type Words = {
  tab: string;
  strip: string;
  mini: string;
  nowPlaying: string;
  nothing: string;
  nothingMaster: string;
  emptyFolder: string;
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
  volume: string;
  volumeText: (n: number) => string;
  mute: string;
  unmute: string;
  follow: string;
  followDesc: string;
  hidden: string;
  hiddenWhy: string;
  playing: (name: string) => string;
  paused: (name: string) => string;
  stopped: string;
  from: (list: string) => string;
  hear: string;
  hearDesc: string;
  notHearing: (names: string) => string;
  cannot: (names: string) => string;
  cannotHere: string;
  missing: string;
  status: (name: string) => string;
  statusDesc: string;
  askUnheard: (n: number, names: string) => string;
  release: string;
  without: string;
  cancel: string;
  released: (name: string) => string;
  releaseFailed: (why: string) => string;
  playButton: (name: string) => string;
  onlyMaster: string;
  onlyMasterHint: string;
  alone: string;
  openMusic: string;
  filter: string;
  filterNone: (q: string) => string;
  queue: string;
  folders: string;
  playlists: string;
  folderRoot: string;
  tracks: (n: number) => string;
  playList: (name: string) => string;
  searchingLists: string;
  changedMeanwhile: string;
  nothingPlays: string;
  notSound: string;
  noTable: string;
  refused: string;
};

const pt: Words = {
  tab: "Música",
  strip: "Música da mesa",
  mini: "Música tocando",
  nowPlaying: "Tocando agora",
  nothing: "Nada tocando",
  nothingMaster: "Nada tocando. Escolha uma faixa abaixo, ou toque um link de som numa nota.",
  emptyFolder: "Esta pasta ainda não tem arquivos de som. Ponha MP3 ou M4A numa pasta (por exemplo “Música”) e eles aparecem aqui, uma lista por pasta; uma nota com links de som vira uma playlist.",
  playFile: "Tocar um arquivo…",
  playFileDesc: "Escolhe um arquivo de som desta pasta para todos da mesa ouvirem.",
  pickTitle: "Arquivos de som da pasta",
  pickNone: "Esta pasta não tem arquivos de som (MP3, M4A, OGG, WAV, FLAC).",
  play: (name) => `Tocar “${name}”`,
  pause: "Pausar",
  resume: "Continuar",
  stop: "Parar",
  previous: "Faixa anterior",
  next: "Próxima faixa",
  loopOff: "Repetir: desligado",
  loopTrack: "Repetir: esta faixa",
  loopScene: "Repetir: a lista",
  position: "Posição",
  positionText: (at, of) => (of ? `${at} de ${of}` : at),
  masterVolume: "Volume da mesa",
  ownVolume: "Seu volume",
  volume: "Volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Silenciar",
  unmute: "Voltar o som",
  follow: "Seguir a mesa",
  followDesc: "Desligado, só esta janela fica em silêncio; ninguém mais é silenciado.",
  hidden: "uma faixa que você não vê",
  hiddenWhy: "O mestre não liberou este arquivo para você: ele toca para quem o vê, e você não ouve nada.",
  playing: (name) => `Tocando: ${name}`,
  paused: (name) => `Pausado: ${name}`,
  stopped: "Música parada",
  from: (list) => `De: ${list}`,
  hear: "Ouvir a mesa",
  hearDesc: "O navegador só toca som depois de um toque: clique para ouvir o que toca na mesa.",
  notHearing: (names) => `Não ouvem (não veem o arquivo): ${names}`,
  cannot: (names) => `Não conseguem tocar este formato: ${names}. MP3 ou AAC tocam em todo lugar.`,
  cannotHere: "Esta janela não toca este formato. MP3 ou AAC tocam em todo lugar.",
  missing: "O arquivo não abriu nesta janela.",
  status: (name) => `Música: ${name}`,
  statusDesc: "Abre a aba Música.",
  askUnheard: (n, names) => `${n === 1 ? "1 jogador não vê" : `${n} jogadores não veem`} este arquivo (${names}). Liberar para a mesa e tocar?`,
  release: "Liberar e tocar",
  without: "Tocar sem eles",
  cancel: "Cancelar",
  released: (name) => `“${name}” liberado para a mesa.`,
  releaseFailed: (why) => `O arquivo não foi liberado: ${why}`,
  playButton: (name) => `Tocar “${name}” na mesa`,
  onlyMaster: "Só o mestre controla a música da mesa.",
  onlyMasterHint: "Só o mestre toca e troca as faixas; você controla o seu volume.",
  alone: "Só nesta janela: a pasta não tem mesa.",
  openMusic: "Abrir a aba Música",
  filter: "Filtrar músicas",
  filterNone: (q) => `Nenhuma faixa com “${q}”.`,
  queue: "Na fila",
  folders: "Pastas",
  playlists: "Playlists",
  folderRoot: "Pasta principal",
  tracks: (n) => (n === 1 ? "1 faixa" : `${n} faixas`),
  playList: (name) => `Tocar a lista “${name}”`,
  searchingLists: "Procurando notas com links de som…",
  changedMeanwhile: "A música mudou nesse meio-tempo; tente de novo.",
  nothingPlays: "Nada está tocando na mesa.",
  notSound: "Isso não é um arquivo de som desta pasta.",
  noTable: "Esta pasta não tem mesa: a música toca só nesta janela.",
  refused: "O servidor recusou o pedido.",
};

const en: Words = {
  tab: "Music",
  strip: "Table music",
  mini: "Music playing",
  nowPlaying: "Now playing",
  nothing: "Nothing is playing",
  nothingMaster: "Nothing is playing. Choose a track below, or play a sound link in a note.",
  emptyFolder: "This folder has no sound files yet. Put MP3 or M4A files in a folder (for example “Music”) and they show here, one list per folder; a note with sound links becomes a playlist.",
  playFile: "Play a file…",
  playFileDesc: "Chooses a sound file of this folder for everyone at the table to hear.",
  pickTitle: "Sound files of the folder",
  pickNone: "This folder has no sound files (MP3, M4A, OGG, WAV, FLAC).",
  play: (name) => `Play “${name}”`,
  pause: "Pause",
  resume: "Resume",
  stop: "Stop",
  previous: "Previous track",
  next: "Next track",
  loopOff: "Loop: off",
  loopTrack: "Loop: this track",
  loopScene: "Loop: the list",
  position: "Position",
  positionText: (at, of) => (of ? `${at} of ${of}` : at),
  masterVolume: "Table volume",
  ownVolume: "Your volume",
  volume: "Volume",
  volumeText: (n) => `Volume ${n}%`,
  mute: "Mute",
  unmute: "Unmute",
  follow: "Follow the table",
  followDesc: "Off, only this window goes silent; nobody else is muted.",
  hidden: "a track you do not see",
  hiddenWhy: "The game master has not released this file to you: it plays for those who see it, and you hear nothing.",
  playing: (name) => `Playing: ${name}`,
  paused: (name) => `Paused: ${name}`,
  stopped: "Music stopped",
  from: (list) => `From: ${list}`,
  hear: "Hear the table",
  hearDesc: "The browser plays sound only after a touch: click to hear what plays at the table.",
  notHearing: (names) => `Not hearing (they do not see the file): ${names}`,
  cannot: (names) => `Cannot play this format: ${names}. MP3 or AAC play everywhere.`,
  cannotHere: "This window cannot play this format. MP3 or AAC play everywhere.",
  missing: "The file did not open in this window.",
  status: (name) => `Music: ${name}`,
  statusDesc: "Opens the Music tab.",
  askUnheard: (n, names) => `${n === 1 ? "1 player does not see" : `${n} players do not see`} this file (${names}). Release it to the table and play?`,
  release: "Release and play",
  without: "Play without them",
  cancel: "Cancel",
  released: (name) => `“${name}” released to the table.`,
  releaseFailed: (why) => `The file was not released: ${why}`,
  playButton: (name) => `Play “${name}” at the table`,
  onlyMaster: "Only the game master controls the table's music.",
  onlyMasterHint: "Only the game master plays and changes the tracks; you control your own volume.",
  alone: "In this window only: the folder has no table.",
  openMusic: "Open the Music tab",
  filter: "Filter tracks",
  filterNone: (q) => `No track with “${q}”.`,
  queue: "Up next",
  folders: "Folders",
  playlists: "Playlists",
  folderRoot: "Main folder",
  tracks: (n) => (n === 1 ? "1 track" : `${n} tracks`),
  playList: (name) => `Play the list “${name}”`,
  searchingLists: "Looking for notes with sound links…",
  changedMeanwhile: "The music changed meanwhile; try again.",
  nothingPlays: "Nothing is playing at the table.",
  notSound: "That is not a sound file of this folder.",
  noTable: "This folder has no table: the music plays in this window only.",
  refused: "The server refused the request.",
};

export const st: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
