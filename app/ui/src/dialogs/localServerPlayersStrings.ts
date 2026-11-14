// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of *Pessoas convidadas* / *People invited* (ADR 0117 D9, the
// row of "forgot the password": no mail on a laptop, the owner resets a
// player's password) in *Transformar em servidor* — in both languages
// (ADR 0035), the English typed as the Portuguese's shape.

const pt = {
  title: "Pessoas convidadas",
  lead: "Quem aceitou um convite seu e criou uma conta. Nada é mandado por e-mail: o e-mail é só o nome com que a pessoa entra. Se alguém esqueceu a senha, crie uma senha nova aqui e mande o link você mesmo.",
  none: "Ninguém aceitou um convite ainda.",
  role: { reader: "lê", editor: "edita", owner: "dono" } as Record<string, string>,
  reaches: (list: string): string => `Alcança: ${list}`,
  reachesNone: "Não alcança nenhuma pasta ainda",
  seen: (email: string, at: string | null): string => (at ? `${email} · visto por último em ${at}` : `${email} · sem sessão aberta`),
  reset: "Nova senha",
  resetNamed: (name: string): string => `Nova senha para ${name}`,
  end: "Encerrar sessões",
  endNamed: (name: string): string => `Encerrar as sessões de ${name}`,
  remove: "Remover",
  removeNamed: (name: string): string => `Remover a conta de ${name}`,
  removeAsk: (name: string): string => `Remover a conta de ${name}? A pessoa perde tudo o que alcançava aqui, e os apps e tokens dela param na hora. Dá para convidar de novo depois.`,
  yes: "Remover",
  cancel: "Cancelar",
  resetMade: (name: string): string => `Link de senha nova para ${name}. Ele vale uma vez, por 24 horas, e só aparece agora: copie e mande para a pessoa. As sessões dela foram encerradas; a senha antiga vale até ela criar a nova.`,
  link: "Link",
  copy: "Copiar o link",
  copied: "Link copiado.",
  notCopied: "Não foi possível copiar: selecione o link e copie à mão.",
  ended: (name: string): string => `As sessões de ${name} foram encerradas: navegador, apps e tokens. A pessoa entra de novo com a senha.`,
  removed: (name: string): string => `A conta de ${name} foi removida.`,
};

const en: typeof pt = {
  title: "People invited",
  lead: "Whoever accepted an invitation of yours and made an account. Nothing is sent by e-mail: the e-mail is only the name the person signs in with. If someone forgot their password, make a new password here and send the link yourself.",
  none: "No one has accepted an invitation yet.",
  role: { reader: "reads", editor: "edits", owner: "owner" },
  reaches: (list) => `Reaches: ${list}`,
  reachesNone: "Reaches no folder yet",
  seen: (email, at) => (at ? `${email} · last seen on ${at}` : `${email} · no session open`),
  reset: "New password",
  resetNamed: (name) => `New password for ${name}`,
  end: "End sessions",
  endNamed: (name) => `End ${name}'s sessions`,
  remove: "Remove",
  removeNamed: (name) => `Remove ${name}'s account`,
  removeAsk: (name) => `Remove ${name}'s account? They lose everything they reached here, and their apps and tokens stop at once. You can invite them again later.`,
  yes: "Remove",
  cancel: "Cancel",
  resetMade: (name) => `A new password link for ${name}. It works once, for 24 hours, and is shown only now: copy it and send it to them. Their sessions were ended; the old password works until they make the new one.`,
  link: "Link",
  copy: "Copy the link",
  copied: "Link copied.",
  notCopied: "Could not copy: select the link and copy it by hand.",
  ended: (name) => `${name}'s sessions were ended: browser, apps and tokens. They sign in again with their password.`,
  removed: (name) => `${name}'s account was removed.`,
};

export function playerStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

export type PlayerWords = typeof pt;
export const playerWords = { pt, en };
