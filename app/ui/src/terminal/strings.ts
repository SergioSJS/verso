// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the embedded terminal says (ADR 0115 item 24; ADR 0035): pt-BR and
// English.

import type { AiCli } from "../bindings";
import { LANG } from "../strings";

type Words = {
  tab: (folder: string, n: number) => string;
  region: string;
  inFolder: (shell: string, folder: string) => string;
  inHome: (shell: string) => string;
  notHere: string;
  notice: string;
  gotIt: string;
  ended: (code: number | null) => string;
  failed: (why: string) => string;
  askBusy: string;
  askOpen: string;
  closeIt: string;
  cancel: string;
  askQuit: (names: string) => string;
  quitAnyway: string;
  newTerminal: string;
  here: string;
  aiTools: string;
  clear: string;
  looking: string;
  noneFound: string;
  start: (name: string) => string;
  install: (name: string) => string;
  cliNames: Record<AiCli, string>;
  leaveKeys: (keys: string) => string;
  section: string;
  sectionDesc: string;
  aiTitle: string;
  aiDesc: string;
  find: string;
  shellTitle: string;
  shellDesc: string;
  powershell: string;
  cmd: string;
  metaTitle: string;
  metaDesc: string;
  readerTitle: string;
  readerDesc: string;
  off: string;
};

const pt: Words = {
  tab: (folder, n) => `Terminal${n > 1 ? ` ${n}` : ""} — ${folder}`,
  region: "Terminal",
  inFolder: (shell, folder) => `${shell} em ${folder}`,
  inHome: (shell) => `${shell} na sua pasta pessoal`,
  notHere: "Esta pasta não está neste computador: o terminal abriu na sua pasta pessoal.",
  notice:
    "Programas rodados aqui mudam os arquivos da pasta diretamente. O Verso registra cada mudança no histórico de versões como feita fora do Verso, e ela pode ser desfeita.",
  gotIt: "Entendi",
  ended: (code) => (code === null ? "O terminal terminou." : `O terminal terminou (código ${code}).`),
  failed: (why) => `O terminal não abriu: ${why}`,
  askBusy: "Um programa ainda está rodando neste terminal. Fechar o terminal encerra o programa.",
  askOpen: "Fechar o terminal encerra tudo o que estiver rodando nele.",
  closeIt: "Fechar",
  cancel: "Cancelar",
  askQuit: (names) => `Há programas rodando em terminais:\n${names}\nFechar encerra todos eles.`,
  quitAnyway: "Encerrar e fechar",
  newTerminal: "Novo terminal",
  here: "Abrir terminal aqui",
  aiTools: "Ferramentas de IA",
  clear: "Limpar",
  looking: "Procurando as ferramentas de IA no seu shell…",
  noneFound: "Nenhuma ferramenta de IA foi encontrada no seu shell.",
  start: (name) => `Abrir ${name}`,
  install: (name) => `${name} não está instalado — página de instalação`,
  cliNames: { claude: "Claude Code", gemini: "Gemini CLI", codex: "Codex", antigravity: "Antigravity CLI" },
  leaveKeys: (keys) => `Para sair do terminal pelo teclado: ${keys}`,
  section: "Terminal",
  sectionDesc: "Um terminal deste computador numa aba, aberto na raiz da pasta. Ele roda o seu próprio shell, com o mesmo PATH do seu terminal.",
  aiTitle: "Ferramentas de IA",
  aiDesc: "Procura no seu shell o Claude Code (claude), o Gemini CLI (gemini), o Codex (codex) e o Antigravity CLI (agy), só quando você clica, e abre a que você escolher num terminal novo.",
  find: "Procurar",
  shellTitle: "Shell do terminal",
  shellDesc: "PowerShell usa o pwsh.exe quando ele está instalado e, se não, o powershell.exe do Windows.",
  powershell: "PowerShell",
  cmd: "Prompt de Comando",
  metaTitle: "Option como Meta",
  metaDesc: "Liga os atalhos no estilo Emacs com Option. Desligado, Option digita acentos e caracteres especiais, como no resto do Mac.",
  readerTitle: "Modo leitor de tela no terminal",
  readerDesc: "O leitor de tela anuncia o que o terminal escreve. Deixa o terminal um pouco mais lento.",
  off: "O terminal está desligado. Ligue em Aplicação › Recursos.",
};

const en: Words = {
  tab: (folder, n) => `Terminal${n > 1 ? ` ${n}` : ""} — ${folder}`,
  region: "Terminal",
  inFolder: (shell, folder) => `${shell} in ${folder}`,
  inHome: (shell) => `${shell} in your home folder`,
  notHere: "This folder is not on this computer: the terminal opened in your home folder.",
  notice:
    "Programs run here change the folder's files directly. Verso records each change in the version history as made outside Verso, and it can be undone.",
  gotIt: "Got it",
  ended: (code) => (code === null ? "The terminal ended." : `The terminal ended (exit code ${code}).`),
  failed: (why) => `The terminal did not open: ${why}`,
  askBusy: "A program is still running in this terminal. Closing the terminal ends the program.",
  askOpen: "Closing the terminal ends everything running in it.",
  closeIt: "Close",
  cancel: "Cancel",
  askQuit: (names) => `Programs are running in terminals:\n${names}\nClosing ends all of them.`,
  quitAnyway: "End and close",
  newTerminal: "New terminal",
  here: "Open terminal here",
  aiTools: "AI tools",
  clear: "Clear",
  looking: "Looking for AI tools in your shell…",
  noneFound: "No AI tool was found in your shell.",
  start: (name) => `Start ${name}`,
  install: (name) => `${name} is not installed — install page`,
  cliNames: { claude: "Claude Code", gemini: "Gemini CLI", codex: "Codex", antigravity: "Antigravity CLI" },
  leaveKeys: (keys) => `To leave the terminal by keyboard: ${keys}`,
  section: "Terminal",
  sectionDesc: "A terminal of this computer in a tab, opened at the folder's root. It runs your own shell, with the same PATH as your terminal.",
  aiTitle: "AI tools",
  aiDesc: "Looks in your shell for Claude Code (claude), Gemini CLI (gemini), Codex (codex) and Antigravity CLI (agy), only when you click, and starts the one you choose in a new terminal.",
  find: "Look",
  shellTitle: "Terminal shell",
  shellDesc: "PowerShell uses pwsh.exe when it is installed, and Windows's powershell.exe otherwise.",
  powershell: "PowerShell",
  cmd: "Command Prompt",
  metaTitle: "Option as Meta",
  metaDesc: "Turns on Emacs-style shortcuts with Option. Off, Option types accents and special characters, as everywhere else on the Mac.",
  readerTitle: "Screen reader mode in the terminal",
  readerDesc: "The screen reader announces what the terminal writes. It makes the terminal a little slower.",
  off: "The terminal is off. Turn it on in Application › Features.",
};

export const tw: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
