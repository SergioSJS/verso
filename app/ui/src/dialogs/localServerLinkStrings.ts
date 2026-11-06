// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of ADR 0117 in *Transformar em servidor*: the two boxes, the
// internet link and its state, "Usar meu endereço", the invitations and
// the window's seat at the table — in both languages (ADR 0035), the
// English typed as the Portuguese's shape. The host's refusals are in
// English (the core's words); `linkWhy` says the ones a person meets on
// this path in the interface's language, and the rest go through
// `errorSentence` as everywhere.

const pt = {
  boxesTitle: "Onde servir",
  network: "Na minha rede",
  networkDesc: "Os celulares e as pessoas na mesma rede (Wi-Fi ou cabo) que este computador.",
  networkLocked: "Pare de servir para mudar onde serve.",
  networkNow: (on: boolean): string => (on ? "Vai servir na sua rede." : "Não vai servir na sua rede."),
  linkBox: "Por um link na internet (Cloudflare, modo de teste)",
  linkDesc: "Um endereço https que abre de qualquer lugar, pelo serviço de teste da Cloudflare: o jeito de jogar com quem não está na sua casa. O computador precisa ficar ligado e acordado enquanto a mesa acontece.",
  linkTesting: "Modo de teste da Cloudflare: sem garantia de funcionamento, até 200 pedidos ao mesmo tempo. Só entra quem você convidar, e ninguém vê uma pasta que você não compartilhou. Desligue quando a sessão acabar.",
  linkLater: "O link liga junto com o servidor.",
  tickOne: "Marque “Na minha rede”, “Por um link na internet”, ou os dois.",
  servingLinkOnly: "Servindo só pelo link na internet.",
  pairNeedsNetwork: "Parear um celular é pela sua rede: marque “Na minha rede” (pare de servir para mudar).",
  starting: "Ligando o link…",
  downloading: (done: number, total: number | null): string =>
    `Baixando o cloudflared, da Cloudflare: ${total === null ? `${done} MB` : `${done} de ${total} MB`}. Só na primeira vez; depois o Verso confere a soma dele e liga o link.`,
  cancel: "Cancelar",
  cancelled: "Cancelado: o link não foi ligado.",
  on: "Link no ar.",
  onOwn: "Seu endereço está no ar.",
  freshLink: "Um link novo pode levar até um minuto para abrir.",
  off: "Link desligado.",
  ended: {
    stopped: "Link desligado.",
    ceiling: "O link fechou sozinho depois de 12 horas. Ligue de novo para um link novo.",
    exited: "O link caiu: o cloudflared parou sozinho. Ligue de novo quando quiser.",
    failed: "O link não ligou.",
    quit: "Link desligado.",
  } as Record<string, string>,
  offline: "Mesa offline: o link caiu e nada religa sozinho. Desmarque e marque a caixa para ligar de novo — um link rápido sai diferente.",
  http2: "Esta rede bloqueia UDP (QUIC): o link passou a usar HTTP/2. Funciona igual; pode ser um pouco mais lento.",
  address: "Endereço da mesa",
  copy: "Copiar link",
  copied: "Link copiado.",
  notCopied: "Não foi possível copiar. Selecione o endereço e copie à mão.",
  showQr: "Mostrar o QR do link",
  qrLabel: (url: string) => `QR do endereço ${url}`,
  left: (h: number, m: number, at: string) => `Fecha sozinho em ${h} h ${String(m).padStart(2, "0")} min (às ${at}).`,
  extend: "Prorrogar por 12 horas",
  extended: (at: string) => `Prorrogado: o mesmo link, agora até ${at}.`,
  noCeiling: "Seu endereço não fecha sozinho; com “Manter ligado ao abrir o app”, volta ao abrir.",
  newEachRun: "Um link rápido muda a cada vez que liga: mande o novo às pessoas. Os convites feitos antes apontam para o link antigo.",
  credits: "O cloudflared é da Cloudflare, licença Apache-2.0: veja Ajustes › Créditos.",
  // The host's refusals on this path, said in words.
  /** A folder another account shared with this person (ADR 0081 item 4): its owner serves it. */
  received: (name: string, host: string) =>
    `${name ? `“${name}”` : "Esta pasta"} foi compartilhada com você no servidor ${host}: só quem é dona dela pode servi-la. Abra ${host} no celular ou no navegador, ou desmarque essa pasta na lista.`,
  why: {
    checksum: "O cloudflared baixado não confere com a soma que o Verso fixa: foi recusado e apagado. Tente de novo mais tarde; se repetir, a cópia no GitHub pode ter mudado.",
    download: "Não foi possível baixar o cloudflared do GitHub: sem conexão, ou o GitHub não respondeu. Confira a internet e tente de novo.",
    system: "Não há cloudflared publicado para este sistema.",
    blocked: "O cloudflared não alcançou a Cloudflare nem por QUIC (UDP) nem por HTTP/2: esta rede parece bloquear. Tente outra rede.",
    noLink: "A Cloudflare não deu um link a tempo: o serviço de teste pode estar fora. Tente de novo em instantes.",
    ended: "O cloudflared parou antes de o link ficar no ar.",
    stopped: "O link foi desligado antes de ficar no ar.",
    noFolder: "Marque ao menos uma pasta para servir.",
    needOwn: "Configure seu endereço primeiro, ou use um link rápido.",
    taken: "Esse endereço já tem outro registro de DNS na Cloudflare: escolha outro, ou apague aquele registro no painel da Cloudflare.",
    tunnelTaken: "Já existe um túnel com esse nome nesta conta da Cloudflare (de uma configuração anterior?): apague-o no painel (Zero Trust › Redes › Túneis) ou use outro endereço.",
    signIn: "Entre na Cloudflare primeiro (passo 2).",
    hostname: "Escreva um endereço como mesa.seudominio.com.br: letras minúsculas, números e hífens, com ao menos um ponto.",
    needOn: "Ligue o servidor primeiro.",
    // S7c: an app of another person ended meanwhile (it signed out).
    appGone: "Esse app já não está conectado aqui.",
    personGone: "Essa pessoa já não tem conta aqui.",
    servingLocks: "Desligue o servidor para mudar quais pastas ele serve.",
  },
  // *Usar meu endereço* (D10).
  ownTitle: "Usar meu endereço",
  ownLead: "Um endereço fixo seu, como mesa.seudominio.com.br, no lugar do link que muda. Precisa de um domínio seu na Cloudflare (o plano grátis serve); o Verso faz o resto pelo cloudflared.",
  ownStep1: "1. Tenha um domínio e adicione-o à Cloudflare — uma vez, à mão.",
  ownHowTo: "Como adicionar um domínio à Cloudflare",
  ownStep2: "2. Entre na Cloudflare: o navegador abre, você entra e escolhe o domínio.",
  ownLogin: "Entrar na Cloudflare",
  ownWaiting: "O navegador abriu na página da Cloudflare. Entre e escolha o domínio; o Verso espera até 10 minutos.",
  ownLoggedIn: "Entrou na Cloudflare.",
  ownAlready: "Já tinha entrado na Cloudflare neste computador.",
  ownSignedIn: "Cloudflare: já entrou neste computador.",
  ownLoginFailed: (why: string) => `A entrada na Cloudflare não terminou: ${why}`,
  ownOpenByHand: "Se o navegador não abriu, abra esta página",
  ownStep3: "3. Escreva o endereço, dentro do seu domínio, e configure.",
  ownHost: "Endereço (por exemplo, mesa.seudominio.com.br)",
  ownSetUp: "Configurar",
  ownSettingUp: "Criando o túnel e o registro de DNS na Cloudflare…",
  ownDone: (h: string) => `Pronto: https://${h} aponta para este computador. Pode levar alguns minutos até abrir em todo lugar.`,
  ownIs: (h: string) => `Seu endereço: https://${h}`,
  ownUse: "Usar meu endereço no link (em vez de um link rápido)",
  ownUseNow: (own: boolean): string => (own ? "O link vai usar seu endereço." : "O link vai ser um link rápido."),
  ownModeLocked: "Desligue o link para trocar.",
  ownRemove: "Remover meu endereço",
  ownRemoveAsk: "O túnel e as credenciais dele são apagados da Cloudflare; o registro de DNS pode ficar lá — apague no painel da Cloudflare se quiser. Remover?",
  ownRemoved: "Endereço removido.",
  ownRemoveFailed: (why: string) => `Não foi possível apagar na Cloudflare (${why}). Você pode esquecer só neste computador e apagar o túnel no painel da Cloudflare (Zero Trust › Redes › Túneis).`,
  ownForgetHere: "Esquecer só neste computador",
  ownForgotten: "Esquecido neste computador. O túnel continua na Cloudflare até você apagá-lo lá.",
  // Invitations (D3 item 2, D4 Q5 and Q8).
  invTitle: "Convites",
  invLead: "Convide pela página da pasta, como num UniVerso: numa mesa, Convidar jogadores; numa pasta sem mesa, Compartilhar, que gera um link de convite para um e-mail que ainda não tem conta. Um convite é um link de uso único, válido por 7 dias: quem recebe cria uma conta neste computador com um e-mail qualquer dela (nada é enviado). Aqui ficam todos os convites deste servidor; um que ainda espera pode ser encerrado.",
  invNone: "Nenhum convite ainda.",
  invWhat: (folder: string | null, role: string | null) => `${folder ?? "Sem pasta"}${role ? ` · ${role === "editor" ? "edita" : "lê"}` : ""}`,
  invState: (state: string, by: string | null) =>
    state === "used" ? `aceito${by ? ` por ${by}` : ""}` : state === "ended" ? "encerrado" : state === "expired" ? "expirado" : "esperando",
  invWhen: (created: string, expires: string) => `criado ${created} · vale até ${expires}`,
  invEnd: "Encerrar",
  invEndNamed: (what: string) => `Encerrar o convite ${what}`,
  invEnded: "Convite encerrado: o link não abre mais nada.",
  // The window at its own table (D4 Q3).
  seatTitle: "Esta janela na mesa",
  seatLead: "Para mestrar desta janela: ela vira cliente deste servidor, como dona, com a mesa, a campanha e os convites, como num UniVerso. Sair da mesa volta à pasta deste computador.",
  seatHere: (name: string) => `Pasta desta janela: ${name}`,
  sit: "Sentar à mesa",
  leave: "Sair da mesa",
  sat: (name: string) => `Na mesa de ${name}.`,
  leftTable: "De volta à pasta deste computador.",
  seatNeeds: "Marque a pasta desta janela e ligue o servidor para sentar à mesa dela.",
  seatGone: "O servidor parou: a janela voltou à pasta deste computador.",
  // The status bar's mark.
  markLink: "Servindo · link na internet",
  markLinkStarting: "Servindo · ligando o link…",
  markOnlyStarting: "Ligando o link…",
  markStopping: "Parando o servidor…",
  markSeated: "Na mesa",
  linkFell: "O link pela internet caiu",
};

const en: typeof pt = {
  boxesTitle: "Where to serve",
  network: "On my network",
  networkDesc: "Phones and people on the same network (Wi-Fi or cable) as this computer.",
  networkLocked: "Stop serving to change where it serves.",
  networkNow: (on) => (on ? "It will serve on your network." : "It will not serve on your network."),
  linkBox: "By an internet link (Cloudflare, testing mode)",
  linkDesc: "An https address that opens from anywhere, through Cloudflare's testing service: the way to play with people who are not at your home. The computer has to stay on and awake while the table runs.",
  linkTesting: "Cloudflare's testing mode: no guarantee it works, up to 200 requests at once. Only people you invite get in, and nobody sees a folder you did not share. Turn it off when the session ends.",
  linkLater: "The link turns on with the server.",
  tickOne: "Tick “On my network”, “By an internet link”, or both.",
  servingLinkOnly: "Serving by the internet link only.",
  pairNeedsNetwork: "A phone pairs over your network: tick “On my network” (stop serving to change it).",
  starting: "Turning the link on…",
  downloading: (done, total) =>
    `Downloading cloudflared, Cloudflare's program: ${total === null ? `${done} MB` : `${done} of ${total} MB`}. Only the first time; then Verso checks its sum and turns the link on.`,
  cancel: "Cancel",
  cancelled: "Cancelled: the link was not turned on.",
  on: "The link is up.",
  onOwn: "Your address is up.",
  freshLink: "A new link can take up to a minute to open.",
  off: "The link is off.",
  ended: {
    stopped: "The link is off.",
    ceiling: "The link closed by itself after 12 hours. Turn it on again for a new link.",
    exited: "The link dropped: cloudflared stopped by itself. Turn it on again when you want.",
    failed: "The link did not turn on.",
    quit: "The link is off.",
  },
  offline: "Table offline: the link dropped and nothing turns it back on by itself. Untick and tick the box to turn it on again — a quick link comes out different.",
  http2: "This network blocks UDP (QUIC): the link now uses HTTP/2. It works the same; it may be a little slower.",
  address: "The table's address",
  copy: "Copy link",
  copied: "Link copied.",
  notCopied: "Could not copy. Select the address and copy it by hand.",
  showQr: "Show the link's QR",
  qrLabel: (url) => `QR of the address ${url}`,
  left: (h, m, at) => `Closes by itself in ${h} h ${String(m).padStart(2, "0")} min (at ${at}).`,
  extend: "Extend by 12 hours",
  extended: (at) => `Extended: the same link, now until ${at}.`,
  noCeiling: "Your address does not close by itself; with “Keep on when the app starts”, it comes back at start.",
  newEachRun: "A quick link changes each time it turns on: send the new one to people. Invitations made before point to the old link.",
  credits: "cloudflared is Cloudflare's, Apache-2.0: see Settings › Credits.",
  received: (name: string, host: string) =>
    `${name ? `“${name}”` : "This folder"} was shared with you on the server ${host}: only its owner can serve it. Open ${host} on the phone or in a browser, or untick that folder in the list.`,
  why: {
    checksum: "The downloaded cloudflared does not match the sum Verso pins: it was refused and deleted. Try again later; if it repeats, the copy on GitHub may have changed.",
    download: "Could not download cloudflared from GitHub: no connection, or GitHub did not answer. Check the internet and try again.",
    system: "No cloudflared is published for this system.",
    blocked: "cloudflared reached Cloudflare neither over QUIC (UDP) nor over HTTP/2: this network seems to block it. Try another network.",
    noLink: "Cloudflare gave no link in time: the testing service may be down. Try again in a moment.",
    ended: "cloudflared stopped before the link was up.",
    stopped: "The link was turned off before it was up.",
    noFolder: "Tick at least one folder to serve.",
    needOwn: "Set up your address first, or use a quick link.",
    taken: "That address already has another DNS record at Cloudflare: choose another, or remove that record in Cloudflare's dashboard.",
    tunnelTaken: "A tunnel of that name already exists on this Cloudflare account (from an earlier setup?): delete it in the dashboard (Zero Trust › Networks › Tunnels) or use another address.",
    signIn: "Sign in to Cloudflare first (step 2).",
    hostname: "Type an address like table.yourdomain.com: lower-case letters, digits and hyphens, with at least one dot.",
    needOn: "Turn the server on first.",
    appGone: "That app is no longer signed in here.",
    personGone: "That person no longer has an account here.",
    servingLocks: "Turn serving off to change which folders are served.",
  },
  ownTitle: "Use my own address",
  ownLead: "A fixed address of your own, like table.yourdomain.com, instead of the link that changes. It needs a domain of yours on Cloudflare (the free plan will do); Verso does the rest through cloudflared.",
  ownStep1: "1. Own a domain and add it to Cloudflare — once, by hand.",
  ownHowTo: "How to add a domain to Cloudflare",
  ownStep2: "2. Sign in to Cloudflare: the browser opens, you sign in and pick the domain.",
  ownLogin: "Sign in to Cloudflare",
  ownWaiting: "The browser opened on Cloudflare's page. Sign in and pick the domain; Verso waits up to 10 minutes.",
  ownLoggedIn: "Signed in to Cloudflare.",
  ownAlready: "You had signed in to Cloudflare on this computer already.",
  ownSignedIn: "Cloudflare: signed in on this computer.",
  ownLoginFailed: (why) => `Signing in to Cloudflare did not finish: ${why}`,
  ownOpenByHand: "If the browser did not open, open this page",
  ownStep3: "3. Type the address, inside your domain, and set it up.",
  ownHost: "Address (for example, table.yourdomain.com)",
  ownSetUp: "Set up",
  ownSettingUp: "Making the tunnel and the DNS record at Cloudflare…",
  ownDone: (h) => `Done: https://${h} points to this computer. It may take a few minutes to open everywhere.`,
  ownIs: (h) => `Your address: https://${h}`,
  ownUse: "Use my address for the link (instead of a quick link)",
  ownUseNow: (own) => (own ? "The link will use your address." : "The link will be a quick link."),
  ownModeLocked: "Turn the link off to switch.",
  ownRemove: "Remove my address",
  ownRemoveAsk: "The tunnel and its credentials are deleted from Cloudflare; the DNS record may stay there — remove it in Cloudflare's dashboard if you want. Remove?",
  ownRemoved: "Address removed.",
  ownRemoveFailed: (why) => `Could not delete it at Cloudflare (${why}). You can forget it on this computer only, and delete the tunnel in Cloudflare's dashboard (Zero Trust › Networks › Tunnels).`,
  ownForgetHere: "Forget on this computer only",
  ownForgotten: "Forgotten on this computer. The tunnel stays at Cloudflare until you delete it there.",
  invTitle: "Invitations",
  invLead: "Invite from the folder's page, as on a UniVerso: at a table, Invite players; in a folder with no table, Share, which makes an invitation link for an e-mail that has no account yet. An invitation is a single-use link, good for 7 days: whoever gets it makes an account on this computer with any e-mail of theirs (nothing is sent). Every invitation of this server is listed here; one still waiting can be ended.",
  invNone: "No invitation yet.",
  invWhat: (folder, role) => `${folder ?? "No folder"}${role ? ` · ${role === "editor" ? "edits" : "reads"}` : ""}`,
  invState: (state, by) => (state === "used" ? `accepted${by ? ` by ${by}` : ""}` : state === "ended" ? "ended" : state === "expired" ? "expired" : "waiting"),
  invWhen: (created, expires) => `made ${created} · good until ${expires}`,
  invEnd: "End",
  invEndNamed: (what) => `End the invitation ${what}`,
  invEnded: "Invitation ended: its link opens nothing any more.",
  seatTitle: "This window at the table",
  seatLead: "To run the game from this window: it becomes a client of this server, as its owner, with the table, the campaign and the invitations, as on a UniVerso. Leaving the table goes back to this computer's folder.",
  seatHere: (name) => `This window's folder: ${name}`,
  sit: "Sit at the table",
  leave: "Leave the table",
  sat: (name) => `At ${name}'s table.`,
  leftTable: "Back to this computer's folder.",
  seatNeeds: "Tick this window's folder and turn the server on to sit at its table.",
  seatGone: "The server stopped: the window went back to this computer's folder.",
  markLink: "Serving · internet link",
  markLinkStarting: "Serving · turning the link on…",
  markOnlyStarting: "Turning the link on…",
  markStopping: "Stopping the server…",
  markSeated: "At the table",
  linkFell: "The internet link dropped",
};

export function linkStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

export type LinkWords = typeof pt;

/** The host's refusal on the link's path, in the person's words; null when
 *  it is none of these (then `errorSentence` says it). */
/** The status bar's mark, as what is on says it (ADR 0117 D3 item 6):
 *  the link while it starts or is on; serving with neither the network
 *  ticked nor the link up — the link stopped, its download cancelled —
 *  is serving stopping with it (the re-test of 2026-11-04 read "serving
 *  to the phone" there); otherwise `phones`, the network's own words. */
export function markSaid(s: { serving: boolean; network: boolean; link: { state: string } }, phones: string): string {
  const lw = linkStrings();
  if (s.link.state === "starting") return s.serving ? lw.markLinkStarting : lw.markOnlyStarting;
  if (s.link.state === "on") return lw.markLink;
  if (!s.network) return lw.markStopping;
  return phones;
}

export function linkWhy(message: string, w: LinkWords): string | null {
  const m = message;
  // "<name> was shared with you on <host>: …" (start) or "this folder was shared with you on <host>: …" (tick).
  const received = /(?:^|: )(?:this folder|(.+?)) was shared with you on (.+?): /.exec(m);
  if (received) return w.received(received[1] ?? "", received[2] ?? "");
  if (m.includes("turn serving off to change which folders")) return w.why.servingLocks;
  if (m.includes("is not the one Verso pins")) return w.why.checksum;
  if (m.includes("the download of cloudflared") || m.includes("downloaded from its GitHub releases")) return w.why.download;
  if (m.includes("no cloudflared is published")) return w.why.system;
  if (m.includes("reached no Cloudflare server")) return w.why.blocked;
  if (m.includes("gave no quick link in time")) return w.why.noLink;
  if (m.includes("ended before the link was up")) return w.why.ended;
  if (m.includes("the link was stopped")) return w.why.stopped;
  if (m.includes("tick at least one folder")) return w.why.noFolder;
  if (m.includes("set up your own address first")) return w.why.needOwn;
  if (m.includes("already has another DNS record")) return w.why.taken;
  if (m.includes("tunnel of that name already exists")) return w.why.tunnelTaken;
  if (m.includes("sign in to Cloudflare first")) return w.why.signIn;
  if (m.includes("like mesa.example.com")) return w.why.hostname;
  if (m.includes("turn serving on first")) return w.why.needOn;
  if (m.includes("that app is not signed in here")) return w.why.appGone;
  if (m.includes("that person has no account here")) return w.why.personGone;
  return null;
}

/** Bytes as whole megabytes (MiB), for the download's progress. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1_048_576);
}

/** What is left of a quick link's twelve hours at `nowMs`: whole hours and
 *  minutes, never below zero. */
export function timeLeft(until: number, nowMs: number): { h: number; m: number } {
  const minutes = Math.max(0, Math.floor((until * 1000 - nowMs) / 60_000));
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

/** `HH:MM` of a moment, in the person's language. */
export function clockAt(seconds: number, lang: string): string {
  return new Date(seconds * 1000).toLocaleTimeString(lang.startsWith("pt") ? "pt-BR" : "en", { hour: "2-digit", minute: "2-digit" });
}
