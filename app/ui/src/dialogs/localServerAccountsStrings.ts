// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of what the accounts of this computer's server have (ADR 0117
// D9, S11–S13) in *Transformar em servidor*: other people's desktop apps
// signed in, with End; the read links' switch; how a passkey and another
// Verso reach this server — in both languages (ADR 0035), the English
// typed as the Portuguese's shape.

const pt = {
  appsTitle: "Apps Verso de outras pessoas",
  appsLead: "Quem você convidou pode conectar o próprio Verso a este servidor (Ajustes › Servidores) e sincronizar a pasta compartilhada com a pessoa. O app Verso do celular delas conecta e sincroniza do mesmo jeito; o navegador do celular abre a janela sem guardar cópia. Os seus próprios celulares pareiam em Celulares pareados.",
  appsTrust: "Use o endereço do link na internet para isso: pela sua rede, o Verso de outra pessoa não confia no certificado próprio deste computador e não conecta.",
  appsNone: "Nenhum app de outra pessoa conectado.",
  app: (device: string, account: string): string => `${device} — ${account}`,
  appWhen: (email: string, since: string, last: string): string => `${email} · conectado em ${since} · último uso em ${last}`,
  end: "Encerrar",
  endNamed: (device: string, account: string): string => `Encerrar ${device}, de ${account}`,
  ended: (device: string): string => `${device} foi encerrado: não sincroniza mais até entrar de novo.`,
  linksTitle: "Links de leitura",
  linksSwitch: "Ligar os links de leitura",
  linksDesc: "Quem tiver o endereço de um link lê a nota ou a pasta dele, sem conta e sem editar. Você cria os links na janela sentada à mesa, no menu de uma nota ou pasta. Desligar fecha todos os links na hora; ligar de novo reabre os que você não revogou.",
  linksOn: "Links de leitura ligados.",
  linksOff: "Links de leitura desligados: todos os links fecharam.",
  passkeysTitle: "Passkeys",
  passkeysWords: "Pela sua rede, use a senha: passkeys só pelo link da internet. Uma passkey criada num link rápido some com esse link; no seu endereço próprio ela fica.",
};

const en: typeof pt = {
  appsTitle: "Other people's Verso apps",
  appsLead: "Someone you invited can connect their own Verso to this server (Settings › Servers) and sync the folder shared with them. The Verso app on their phone connects and syncs the same way; a phone's browser opens the window and keeps no copy. Your own phones pair under Paired phones.",
  appsTrust: "Use the internet link's address for that: on your network, another person's Verso does not trust this computer's own certificate and does not connect.",
  appsNone: "No app of another person is connected.",
  app: (device, account) => `${device} — ${account}`,
  appWhen: (email, since, last) => `${email} · connected on ${since} · last used on ${last}`,
  end: "End",
  endNamed: (device, account) => `End ${device}, of ${account}`,
  ended: (device) => `${device} was ended: it syncs nothing until it signs in again.`,
  linksTitle: "Read links",
  linksSwitch: "Turn read links on",
  linksDesc: "Whoever has a link's address reads its note or folder, with no account and without editing. You make links in the window sitting at the table, in a note's or a folder's menu. Off closes every link at once; on again reopens the ones you did not revoke.",
  linksOn: "Read links on.",
  linksOff: "Read links off: every link closed.",
  passkeysTitle: "Passkeys",
  passkeysWords: "On your network, use the password: passkeys only through the internet link. A passkey made on a quick link goes away with that link; on your own address it stays.",
};

export function accountStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

export type AccountWords = typeof pt;
export const accountWords = { pt, en };
