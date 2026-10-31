// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Sync section while a folder syncs (ADR 0079 item 13), read top to
// bottom as a person asks: is everything fine? — one sentence; does
// anything need me? — conflicts grouped by note and files left out grouped
// by why, each with what to do; what happened? — the recent activity,
// folded, last. The maintainer, 2026-10-10: "não sei se é histórico, se é
// conflito atual, se preciso fazer algo".

import { commands, type SyncLogEntry, type SyncRefused, type SyncStatus } from "../bindings";
import { ask, promptText } from "../dialog";
import { diffNode } from "../diff";
import { h } from "../dom";
import { errorSentence, fail } from "../errors";
import { addressOf, reachStrings } from "../reach";
import { type DownWords, placeholderBlock, ranNote, rowNote } from "./syncPlaceholders";
import { liveHolder, openNote } from "../layout/spaces";
import { roomSide, syncedSessions } from "../collab";
import { writeLive } from "../roomWrites";
import { liveLine, liveWords } from "../coeditWords";
import { currentFolder } from "../folder";
import { liveTogether, setLiveTogether } from "../settings";
import { madeBy } from "../syncWho";
import { copyParts, looksBinary, originalOf, textByName } from "./conflictNames";
import { aboutCloud, cloudStrings, cloudWords, providerName } from "./syncCloud";

const pt = {
  allGood: "Tudo em dia.",
  waiting: (n: number) => (n === 1 ? "Uma coisa espera por você." : `${n} coisas esperam por você.`),
  moving: (up: number, down: number) => {
    const parts = [up ? `enviando ${up}` : "", down ? `recebendo ${down}` : ""].filter(Boolean).join(" e ");
    return parts ? `${parts[0]!.toUpperCase()}${parts.slice(1)}…` : "Sincronizando…";
  },
  connecting: "Conectando ao servidor…",
  offline: "Sem conexão. As mudanças esperam e cruzam quando a rede voltar.",
  serverBack: "As mudanças esperam e cruzam quando ele voltar.",
  paused: "Pausada. Nada cruza até você retomar.",
  stoppedBefore: (n: number) => `Parada antes de apagar ${n} arquivos.`,
  error: "A sincronização não está funcionando.",
  where: (folder: string, server: string) => `${folder} em ${server}`,
  role: (r: string): string => (r === "owner" ? "a pasta é sua" : r === "editor" ? "você edita" : "você só lê"),
  last: (ago: string) => `última vez ${ago}`,
  justNow: "agora há pouco",
  minutes: (n: number) => `há ${n} min`,
  hours: (n: number) => `há ${n} h`,
  syncNow: "Sincronizar agora",
  openServers: "Abrir Servidores",
  pause: "Pausar",
  resume: "Retomar",
  turnOff: "Desligar…",
  turnOffAsk: "Desligar a sincronização desta pasta? Os arquivos ficam como estão, aqui e no servidor.",
  turnOffYes: "Desligar",
  no: "Cancelar",
  attention: "Esperando por você",
  calm: "Nada esperando por você. O que mudar aqui ou no servidor cruza sozinho.",
  deletionsTitle: (n: number) => `${n} arquivos seriam apagados`,
  deletionsWhy:
    "A sincronização parou para perguntar: uma pasta movida, um disco que não montou ou uma nuvem que tirou os arquivos do computador parecem exclusões.",
  deleteThem: (n: number) => `Apagar os ${n}`,
  deleteAsk: (n: number) => `Apagar ${n} arquivos dos dois lados? Neste computador eles vão para a lixeira da pasta.`,
  keepPaused: "Manter pausada",
  conflictTitle: (note: string) => note,
  conflictWhy: (n: number) =>
    n === 1
      ? "Mudou em dois lugares ao mesmo tempo. A versão do servidor ficou com o nome; a outra está numa cópia."
      : `Mudou em vários lugares ao mesmo tempo. A versão do servidor ficou com o nome; as outras ${n} estão em cópias.`,
  copyFrom: (device: string, date: string) => `Cópia de ${device}, ${date}`,
  compare: "Comparar",
  hideCompare: "Fechar comparação",
  compareSaid: "Linhas com − estão só na versão com o nome; com +, só na cópia.",
  openBoth: "Abrir as duas",
  keepCopy: "Ficar com esta",
  keepCopyAsk: (note: string) => `Pôr o texto desta cópia em ${note} e descartar a cópia? A versão de agora vai para a lixeira da pasta.`,
  discard: "Descartar cópia",
  discardAsk: (copy: string) => `Descartar ${copy}? Ela vai para a lixeira da pasta e some dos outros aparelhos.`,
  notText: "Não é texto: abra as duas para comparar.",
  rename: "Renomear",
  renameAsk: (name: string) => `Novo nome para ${name}:`,
  orphanWhy: (n: number, note: boolean) => {
    const what = note ? "A nota" : "O arquivo";
    const gone = note ? "renomeada ou apagada" : "renomeado ou apagado";
    return n === 1 ? `${what} desta cópia não existe mais (${gone}). Abra a cópia, ou descarte-a.` : `${what} destas cópias não existe mais (${gone}). Abra as cópias, ou descarte-as.`;
  },
  open: "Abrir",
  reasonTitle: {
    name_invalid: (n: number) => (n === 1 ? "Um arquivo com um nome que nem todo sistema aceita" : `${n} arquivos com nomes que nem todo sistema aceita`),
    name_taken: (n: number) => (n === 1 ? "Um arquivo com o nome de outro, só mudando maiúscula ou acento" : `${n} arquivos com o nome de outros, só mudando maiúscula ou acento`),
    case_twin_there: (n: number) => (n === 1 ? "Dois nomes que só diferem em maiúsculas e minúsculas no servidor; este computador guarda um" : `${n} arquivos do servidor com nomes que só diferem de outros em maiúsculas e minúsculas; este computador guarda um de cada`),
    unshared: (n: number) => (n === 1 ? "Um arquivo que não é mais compartilhado com você; a sua cópia fica aqui" : `${n} arquivos que não são mais compartilhados com você; as suas cópias ficam aqui`),
    reader: (n: number) => (n === 1 ? "Um arquivo mudado aqui, numa pasta que você só lê" : `${n} arquivos mudados aqui, numa pasta que você só lê`),
    quota: (n: number) => (n === 1 ? "Um arquivo que não cabe na cota da pasta" : `${n} arquivos que não cabem na cota da pasta`),
    placeholder: (n: number) => (n === 1 ? "Um arquivo que ainda não está neste computador" : `${n} arquivos que ainda não estão neste computador`),
    too_large: (n: number) => (n === 1 ? "Um arquivo maior que 1 GiB" : `${n} arquivos maiores que 1 GiB`),
    changed: (n: number) => (n === 1 ? "Um arquivo que mudou durante a sincronização" : `${n} arquivos que mudaram durante a sincronização`),
    failed: (n: number) => (n === 1 ? "Um arquivo com erro" : `${n} arquivos com erro`),
  } as Record<string, (n: number) => string>,
  reasonDo: {
    name_invalid: "Renomeie: tire o ponto ou o espaço do fim, os sinais < > : \" | ? * \\ e nomes como CON. Depois eles sincronizam sozinhos.",
    name_taken: "Renomeie um dos dois: o Windows e o macOS não guardam dois nomes assim na mesma pasta.",
    case_twin_there: "Num Mac ou no Windows os dois seriam um arquivo só. Renomeie um deles no servidor (no navegador ou em outro aparelho) e os dois chegam aqui.",
    unshared: "A sua cópia fica só neste computador e não vai ao servidor. Peça a quem tem a pasta para compartilhar de novo, se for o caso.",
    reader: "Eles ficam só neste computador. Peça para editar a quem tem a pasta, se for o caso.",
    quota: "Libere espaço na pasta, ou peça ao admin do servidor para aumentar a cota.",
    placeholder: "Baixe-os para que sincronizem: o botão abaixo traz os que o Verso consegue baixar.",
    too_large: "Arquivos assim não sincronizam.",
    changed: "Vão de novo na próxima passada.",
    failed: "O log do app (Ajuda › Relatar problema) diz o motivo de cada um.",
  } as Record<string, string>,
  cloudOnly: (n: number) => (n === 1 ? "1 arquivo está só na nuvem; o servidor tem a cópia." : `${n} arquivos estão só na nuvem; o servidor tem a cópia.`),
  down: {
    button: (n, size) => `Baixar ${n} ${n === 1 ? "arquivo" : "arquivos"}${size ? ` (${size})` : ""}`,
    progress: (done, n) => `Baixando ${done} de ${n}…`,
    stop: "Parar",
    stopping: "Parando depois deste arquivo…",
    done: (n) => (n === 1 ? "Um arquivo baixado. Ele sincroniza agora." : `${n} arquivos baixados. Eles sincronizam agora.`),
    partial: (ok, bad) => `${ok} ${ok === 1 ? "arquivo baixado" : "arquivos baixados"}; ${bad} não ${bad === 1 ? "pôde" : "puderam"} ser baixado${bad === 1 ? "" : "s"}. O motivo de cada um está na lista.`,
    failedAll: (bad) => `Nenhum arquivo foi baixado: ${bad === 1 ? "o arquivo falhou" : `os ${bad} arquivos falharam`}. O motivo está na lista.`,
    stopped: (done, n) => `Parado: ${done} de ${n} baixados. Os outros continuam na lista.`,
    noRoom: (need, free) => `Não há espaço no disco: baixar isso pede ${need} (com uma folga) e há ${free} livres. Libere espaço e tente de novo.`,
    unknownSpace: "Não deu para saber o espaço livre no disco; nada foi baixado.",
    skipped: "Não havia o que baixar: o arquivo já não está só na nuvem. A próxima sincronização o confere.",
    oldForm: "Na forma antiga do iCloud (.nome.icloud): o Verso não consegue baixar este. Baixe-o pelo Finder.",
    unavailable: "O iCloud ou o OneDrive não entregou o conteúdo (sem conexão?). Tente de novo.",
  } as DownWords,
  history: "Atividade recente",
  historyEmpty: "Nada cruzou ainda.",
  what: {
    sent: "enviado",
    received: "recebido",
    deleted_there: "apagado no servidor",
    deleted_here: "apagado aqui",
    renamed_there: "renomeado no servidor",
    renamed_here: "renomeado aqui",
    conflict: "conflito",
    merged: "juntado",
  } as Record<string, string>,
};
const en: typeof pt = {
  allGood: "All up to date.",
  waiting: (n) => (n === 1 ? "One thing waits for you." : `${n} things wait for you.`),
  moving: (up, down) => {
    const parts = [up ? `sending ${up}` : "", down ? `receiving ${down}` : ""].filter(Boolean).join(" and ");
    return parts ? `${parts[0]!.toUpperCase()}${parts.slice(1)}…` : "Syncing…";
  },
  connecting: "Connecting to the server…",
  offline: "Offline. Changes wait, and cross when the network is back.",
  serverBack: "Changes wait, and cross when it is back.",
  paused: "Paused. Nothing crosses until you resume.",
  stoppedBefore: (n) => `Stopped before deleting ${n} files.`,
  error: "Sync is not working.",
  where: (folder, server) => `${folder} on ${server}`,
  role: (r) => (r === "owner" ? "the folder is yours" : r === "editor" ? "you edit" : "you only read"),
  last: (ago) => `last ${ago}`,
  justNow: "just now",
  minutes: (n) => `${n} min ago`,
  hours: (n) => `${n} h ago`,
  syncNow: "Sync now",
  openServers: "Open Servers",
  pause: "Pause",
  resume: "Resume",
  turnOff: "Turn off…",
  turnOffAsk: "Turn this folder's sync off? The files stay as they are, here and on the server.",
  turnOffYes: "Turn off",
  no: "Cancel",
  attention: "Waiting for you",
  calm: "Nothing waits for you. What changes here or on the server crosses on its own.",
  deletionsTitle: (n) => `${n} files would be deleted`,
  deletionsWhy:
    "Sync stopped to ask: a folder moved, a drive not mounted or a cloud that took the files off the computer all look like deletions.",
  deleteThem: (n) => `Delete the ${n}`,
  deleteAsk: (n) => `Delete ${n} files on both sides? On this computer they go to the folder's bin.`,
  keepPaused: "Keep paused",
  conflictTitle: (note) => note,
  conflictWhy: (n) =>
    n === 1
      ? "It changed in two places at once. The server's version kept the name; the other is in a copy."
      : `It changed in several places at once. The server's version kept the name; the other ${n} are in copies.`,
  copyFrom: (device, date) => `Copy from ${device}, ${date}`,
  compare: "Compare",
  hideCompare: "Close comparison",
  compareSaid: "Lines with − are only in the version under the name; with +, only in the copy.",
  openBoth: "Open both",
  keepCopy: "Keep this one",
  keepCopyAsk: (note) => `Put this copy's text in ${note} and discard the copy? The version there now goes to the folder's bin.`,
  discard: "Discard copy",
  discardAsk: (copy) => `Discard ${copy}? It goes to the folder's bin and leaves the other devices.`,
  notText: "Not text: open both to compare.",
  rename: "Rename",
  renameAsk: (name: string) => `New name for ${name}:`,
  orphanWhy: (n, note) => {
    const what = note ? "note" : "file";
    return n === 1 ? `The ${what} this copy is of no longer exists (renamed or deleted). Open the copy, or discard it.` : `The ${what} these copies are of no longer exists (renamed or deleted). Open the copies, or discard them.`;
  },
  open: "Open",
  reasonTitle: {
    name_invalid: (n) => (n === 1 ? "A file whose name not every system keeps" : `${n} files whose names not every system keeps`),
    name_taken: (n) => (n === 1 ? "A file named as another but for its case or accents" : `${n} files named as others but for their case or accents`),
    case_twin_there: (n) => (n === 1 ? "Two names that differ only in case on the server; this computer keeps one" : `${n} files on the server whose names differ from others only in case; this computer keeps one of each`),
    unshared: (n) => (n === 1 ? "A file that is no longer shared with you; your copy stays here" : `${n} files that are no longer shared with you; your copies stay here`),
    reader: (n) => (n === 1 ? "A file changed here, in a folder you only read" : `${n} files changed here, in a folder you only read`),
    quota: (n) => (n === 1 ? "A file that does not fit the folder's quota" : `${n} files that do not fit the folder's quota`),
    placeholder: (n) => (n === 1 ? "A file not on this computer yet" : `${n} files not on this computer yet`),
    too_large: (n) => (n === 1 ? "A file larger than 1 GiB" : `${n} files larger than 1 GiB`),
    changed: (n) => (n === 1 ? "A file that changed while syncing" : `${n} files that changed while syncing`),
    failed: (n) => (n === 1 ? "A file with an error" : `${n} files with an error`),
  },
  reasonDo: {
    name_invalid: "Rename them: no trailing dot or space, none of < > : \" | ? * \\, and no names such as CON. Then they sync on their own.",
    name_taken: "Rename one of the two: Windows and macOS do not keep two such names in one folder.",
    case_twin_there: "On a Mac or Windows the two would be one file. Rename one of them on the server (in the browser or on another device) and both come here.",
    unshared: "Your copy stays on this computer and does not go to the server. Ask whoever owns the folder to share it again, if you should.",
    reader: "They stay on this computer. Ask the folder's owner to let you edit, if you should.",
    quota: "Free some space in the folder, or ask the server's admin for a larger quota.",
    placeholder: "Download them so that they sync: the button below brings down the ones Verso can.",
    too_large: "Files like these do not sync.",
    changed: "They go again on the next pass.",
    failed: "The app's log (Help › Report a problem) says why for each one.",
  },
  cloudOnly: (n) => (n === 1 ? "1 file is only in the cloud; the server has it." : `${n} files are only in the cloud; the server has them.`),
  down: {
    button: (n, size) => `Download ${n} ${n === 1 ? "file" : "files"}${size ? ` (${size})` : ""}`,
    progress: (done, n) => `Downloading ${done} of ${n}…`,
    stop: "Stop",
    stopping: "Stopping after this file…",
    done: (n) => (n === 1 ? "One file downloaded. It syncs now." : `${n} files downloaded. They sync now.`),
    partial: (ok, bad) => `${ok} ${ok === 1 ? "file" : "files"} downloaded; ${bad} could not be. The reason for each is in the list.`,
    failedAll: (bad) => `No file was downloaded: ${bad === 1 ? "the file failed" : `all ${bad} files failed`}. The reason is in the list.`,
    stopped: (done, n) => `Stopped: ${done} of ${n} downloaded. The rest stay in the list.`,
    noRoom: (need, free) => `Not enough room on the disk: downloading this takes ${need} (with some margin) and ${free} are free. Free some space and try again.`,
    unknownSpace: "Could not tell how much space the disk has free; nothing was downloaded.",
    skipped: "There was nothing to download: the file is no longer only in the cloud. The next sync checks it.",
    oldForm: "In iCloud's older form (.name.icloud): Verso cannot download this one. Download it from Finder.",
    unavailable: "iCloud or OneDrive did not give the content (no connection?). Try again.",
  },
  history: "Recent activity",
  historyEmpty: "Nothing has crossed yet.",
  what: {
    sent: "sent",
    received: "received",
    deleted_there: "deleted on the server",
    deleted_here: "deleted here",
    renamed_there: "renamed on the server",
    renamed_here: "renamed here",
    conflict: "conflict",
    merged: "merged",
  },
};

export type Words = typeof pt;

/** The folder drawn now syncs with a cloud, not a UniVerso (ADR 0104):
 *  the words that name the server say the cloud instead. */
let cloudMode = false;

function words(): Words {
  const base = document.documentElement.lang.startsWith("pt") ? pt : en;
  return cloudMode ? cloudWords(base) : base;
}

function locale(): string {
  return document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en";
}

function ago(stamp: string): string {
  const s = words();
  const at = new Date(stamp).getTime();
  if (Number.isNaN(at)) return stamp;
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return s.justNow;
  if (minutes < 60) return s.minutes(minutes);
  if (minutes < 24 * 60) return s.hours(Math.round(minutes / 60));
  return new Date(stamp).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
}

function button(label: string, kind: "" | "primary" | "quiet" | "danger", run: () => void): HTMLButtonElement {
  const b = h("button", `btn ${kind}`.trim(), label);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}

/** Who made a copy and when, from its name (ADR 0079 item 8). */
function copyOrigin(copy: string): { device: string; date: string } {
  const parts = copyParts(copy);
  if (!parts) return { device: "?", date: "" };
  return { device: parts.device, date: parts.date.toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) };
}

/** The sentence that says the folder's state, and its tone. */
function headline(st: SyncStatus, waiting: number): { text: string; tone: "ok" | "busy" | "attention" | "quiet" } {
  const s = words();
  if (st.state === "paused" && st.deletions) return { text: s.stoppedBefore(st.deletions), tone: "attention" };
  if (st.state === "paused") return { text: s.paused, tone: "quiet" };
  // The server, not the network, did not answer: named, and why it may be.
  if (st.state === "offline" && st.problem === "unreachable" && st.cloud) return { text: `${cloudStrings().unreachable(st.cloud.label)} ${s.serverBack}`, tone: "attention" };
  if (st.state === "offline" && st.problem === "unreachable") return { text: `${reachStrings().unreachable(addressOf(st.server))} ${s.serverBack}`, tone: "attention" };
  if (st.state === "offline") return { text: s.offline, tone: "quiet" };
  if (st.state === "starting") return { text: s.connecting, tone: "busy" };
  if (st.state === "error") return { text: s.error, tone: "attention" };
  if (st.state === "syncing") return { text: s.moving(st.sending, st.receiving), tone: "busy" };
  if (waiting) return { text: s.waiting(waiting), tone: "attention" };
  return { text: s.allGood, tone: "ok" };
}

export type Refresh = () => Promise<void>;
export type ProblemText = (st: SyncStatus) => string | null;

/** The problems only signing in again mends, in Settings › Servers. */
const SIGNED_OUT = new Set(["signed_out", "not_signed_in"]);

/** A sentence shown on its own starts with a capital. */
function capitalized(text: string): string {
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

/** Draw the section for a folder that syncs. `openServers` opens the
 *  Servers section, where a computer signs in again. */
export function drawSyncOn(box: HTMLElement, st: SyncStatus, refresh: Refresh, problemText: ProblemText, openServers: () => void, own?: { turnOff: boolean }): void {
  cloudMode = Boolean(st.cloud);
  const s = words();
  // Conflicts by the note they are of; files left out by why.
  const byNote = new Map<string, string[]>();
  for (const copy of st.conflicts) {
    const note = originalOf(copy);
    byNote.set(note, [...(byNote.get(note) ?? []), copy]);
  }
  const byReason = new Map<string, SyncRefused[]>();
  for (const f of st.refused) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f]);
  const waiting = byNote.size + byReason.size + (st.deletions ? 1 : 0);

  // 1. The state, at a glance.
  const top = h("header", "sync-top");
  const said = headline(st, waiting);
  const sentence = h("p", "sync-sentence", said.text);
  sentence.dataset["tone"] = said.tone;
  sentence.setAttribute("role", "status");
  const meta = (
    st.cloud
      ? [`${providerName(st.cloud.provider)} · ${st.cloud.label}`, st.last ? s.last(ago(st.last)) : ""]
      : [s.where(st.folder_name || st.folder, st.server.replace(/^https?:\/\//, "")), st.role ? s.role(st.role) : "", st.last ? s.last(ago(st.last)) : ""]
  )
    .filter(Boolean)
    .join(" · ");
  const metaLine = h("p", "sync-meta", meta);
  const problem = st.state === "error" ? problemText(st) : null;
  const actions = h("div", "sync-buttons");
  // The row never contradicts the state. Paused by the person: Resume is
  // what to do — a pass now would find it paused. Paused before many
  // deletions: the red box's two buttons decide; the row only compares
  // again (a drive mounted meanwhile ends the pause) and turns off.
  // Offline: Sync now is a try, not the thing to do.
  // Signed out of the server: a pass now cannot work; signing in again,
  // in Servers, is the thing to do, and Sync now only a try after it.
  const userPaused = st.state === "paused" && !st.deletions;
  const deletionsPaused = st.state === "paused" && Boolean(st.deletions);
  const signedOut = st.state === "error" && Boolean(st.problem && SIGNED_OUT.has(st.problem));
  const syncNow = () => button(s.syncNow, st.state === "offline" || deletionsPaused || signedOut ? "" : "primary", () => void commands.folderSyncNow().then(() => refresh()));
  if (signedOut) actions.append(button(s.openServers, "primary", openServers), syncNow());
  else if (userPaused) actions.append(button(s.resume, "primary", () => void commands.folderSyncPause(false).then(() => refresh())));
  else if (deletionsPaused) actions.append(syncNow());
  else actions.append(syncNow(), button(s.pause, "", () => void commands.folderSyncPause(true).then(() => refresh())));
  // A folder kept in a browser (ADR 0092) turns off in its own section,
  // which says what turning off deletes here.
  if (own?.turnOff !== false) {
    actions.append(
      button(s.turnOff, "quiet", () => {
        void ask(s.turnOffAsk, { yes: s.turnOffYes, no: s.no }).then((yes) => {
          if (!yes) return;
          void commands.folderSyncStop().then((r) => (r.status === "ok" ? refresh() : fail(r.error)));
        });
      }),
    );
  }
  top.append(sentence, metaLine);
  if (problem) top.append(h("p", "sync-problem", capitalized(problem)));
  // A cloud has no rooms: the notes never join simultaneous editing.
  top.append(actions);
  if (!st.cloud) top.append(togetherRow(refresh));

  // 2. What needs the person, or the calm that nothing does.
  const needs = h("section", "sync-needs");
  needs.setAttribute("aria-labelledby", "sync-needs-title");
  const needsTitle = h("h3", "sync-h", s.attention);
  needsTitle.id = "sync-needs-title";
  needs.append(needsTitle);
  if (waiting === 0) needs.append(h("p", "sync-calm", s.calm));
  if (st.deletions) {
    const n = st.deletions;
    const item = h("article", "sync-item danger");
    item.setAttribute("role", "alert");
    item.append(
      h("h4", "sync-item-title", s.deletionsTitle(n)),
      h("p", "sync-item-why", s.deletionsWhy),
      row(
        button(s.deleteThem(n), "danger", () => {
          void ask(s.deleteAsk(n), { yes: s.deleteThem(n), no: s.no }).then((ok) => {
            if (ok) void commands.folderSyncConfirm().then(() => refresh());
          });
        }),
        button(s.keepPaused, "quiet", () => void commands.folderSyncPause(true).then(() => refresh())),
      ),
    );
    needs.append(item);
  }
  for (const [note, copies] of byNote) needs.append(conflictItem(note, copies, refresh));
  for (const [reason, files] of byReason) {
    const item = h("article", "sync-item");
    const title = (s.reasonTitle[reason] ?? s.reasonTitle["failed"]!)(files.length);
    const list = h("ul", "sync-files");
    for (const f of files) {
      const li = h("li", "sync-file-row");
      const nameSpan = h("span", "sync-file-path", f.path);
      li.append(nameSpan);
      if (reason === "name_invalid") {
        const btn = button(s.rename, "quiet", () => {
          const parts = f.path.split("/");
          const oldName = parts.pop() ?? f.path;
          const parent = parts.join("/");
          void promptText(s.renameAsk(oldName), oldName, false, { yes: s.rename, no: s.no }).then((newName) => {
            const clean = newName?.trim();
            if (!clean || clean === oldName) return;
            const target = parent ? `${parent}/${clean}` : clean;
            void commands.renameEntry(f.path, target).then((r) => {
              if (r.status === "ok") void refresh();
              else fail(r.error);
            });
          });
        });
        li.append(btn);
      }
      if (reason === "placeholder") {
        const note = rowNote(st.key, f.path, s.down);
        if (note) nameSpan.append(h("span", "sync-file-why", note));
      }
      if (reason === "failed" && f.message) li.title = f.message;
      list.append(li);
    }
    item.append(h("h4", "sync-item-title", title), h("p", "sync-item-why", s.reasonDo[reason] ?? s.reasonDo["failed"]!), list);
    // Placeholders sync never sent come down on a click (ADR 0043).
    if (reason === "placeholder") item.append(placeholderBlock(st.key, files, s.down, refresh));
    needs.append(item);
  }
  // Every file came down: the run's outcome is still said once.
  const ran = byReason.has("placeholder") ? null : ranNote(st.key, s.down);
  if (ran) needs.append(ran);
  // Evicted files the server has: nothing is asked, said quietly (ADR 0043).
  if (st.cloud_only.length > 0) {
    const quiet = h("p", "sync-quiet", s.cloudOnly(st.cloud_only.length));
    quiet.setAttribute("role", "note");
    needs.append(quiet);
  }

  // 3. What happened, folded and last: history, not a task.
  const history = h("details", "sync-history");
  history.open = historyOpen;
  history.addEventListener("toggle", () => (historyOpen = history.open));
  history.append(h("summary", "", `${s.history}${st.log.length ? ` · ${st.log.length}` : ""}`));
  if (st.log.length === 0) history.append(h("p", "sync-calm", s.historyEmpty));
  else {
    const ol = h("ol", "sync-ledger");
    for (const e of st.log.slice(0, 50)) ol.append(ledgerLine(e));
    history.append(ol);
  }

  const about = aboutCloud(st);
  box.replaceChildren(...[top, needs, about, history].filter((n): n is HTMLElement => n !== null));
}

/** The person's setting for this folder (ADR 0082 item 15): its notes
 *  join the server's rooms while online, or stay this computer's alone. */
function togetherRow(refresh: Refresh): HTMLElement {
  const w = liveWords(document.documentElement.lang);
  const row = h("label", "sync-together");
  const box = h("input");
  box.type = "checkbox";
  box.checked = liveTogether();
  box.addEventListener("change", () => {
    setLiveTogether(box.checked);
    // Only the folder's key and the new value reach the log.
    void commands.logWrite("INFO", `live editing turned ${box.checked ? "on" : "off"} for folder ${currentFolder}`).catch(() => undefined);
    void refresh().then(() => dispatchEvent(new Event("verso:live-together")));
  });
  const words = h("span", "sync-together-words");
  words.append(h("strong", "", w.setting), h("span", "sync-together-desc", w.settingDesc));
  row.append(box, words);
  // The notes open in this window, each with its state, as their tabs say it.
  const open = syncedSessions();
  if (open.length === 0) return row;
  const wrap = h("div", "sync-together-box");
  const list = h("ul", "sync-together-now");
  const lang = document.documentElement.lang;
  for (const c of open) {
    const state = c.live ? { kind: "live" as const, others: c.others(), reader: c.reader } : { kind: "local" as const, why: c.why ?? "offline" };
    list.append(h("li", "", `${c.path.replace(/\.md$/, "")}: ${liveLine(state, lang)}`));
  }
  wrap.append(row, list);
  return wrap;
}

let historyOpen = false;
/** The notes whose comparison the person has open: a status redraws the
 *  section, and must not close what is being read. */
const comparing = new Set<string>();

function row(...children: HTMLElement[]): HTMLElement {
  const r = h("div", "sync-row");
  r.append(...children);
  return r;
}

/** The notes whose original is known to be gone (renamed or deleted
 *  meanwhile): a status redraws the section, and must not show the
 *  comparison again for a moment before the read says so. */
const orphans = new Set<string>();

function conflictItem(note: string, copies: string[], refresh: Refresh): HTMLElement {
  const s = words();
  const item = h("article", "sync-item");
  const why = h("p", "sync-item-why", s.conflictWhy(copies.length));
  item.append(h("h4", "sync-item-title", s.conflictTitle(note)), why);
  /** What each copy does once its original is found gone. */
  const onOrphan: (() => void)[] = [];
  let orphaned = false;
  // The copy's original is gone — renamed or deleted after the copy was
  // made: there is nothing to compare with, nor to keep the copy over.
  // Said as that, never as content that is not text (a failed read is
  // not binary content).
  const orphan = () => {
    orphans.add(note);
    if (orphaned) return;
    orphaned = true;
    why.textContent = s.orphanWhy(copies.length, note.endsWith(".md"));
    item.classList.add("orphan");
    for (const f of onOrphan) f();
  };
  for (const copy of copies) {
    const { device, date } = copyOrigin(copy);
    const one = h("div", "sync-copy");
    const label = h("p", "sync-copy-label", s.copyFrom(device, date));
    label.title = copy;
    // Not text (an image, a PDF, bytes that are not UTF-8): no line
    // comparison, which would show garbage — the two are opened instead.
    const byName = textByName(copy);
    const notText = h("p", "sync-item-why sync-not-text", s.notText);
    notText.hidden = byName !== false;
    const diff = h("div", "sync-diff");
    const open = comparing.has(copy);
    diff.hidden = !open;
    const compare = button(open ? s.hideCompare : s.compare, "", () => {
      if (comparing.has(copy)) {
        comparing.delete(copy);
        diff.hidden = true;
        compare.textContent = s.compare;
        compare.setAttribute("aria-expanded", "false");
        return;
      }
      comparing.add(copy);
      diff.hidden = false;
      compare.textContent = s.hideCompare;
      compare.setAttribute("aria-expanded", "true");
      void showDiff(diff, note, copy, orphan);
    });
    compare.setAttribute("aria-expanded", String(open));
    const openBoth = button(s.openBoth, "quiet", () => {
      if (orphaned) return openNote(copy, false);
      openNote(note, false);
      openNote(copy, true);
    });
    const actions = row(compare, openBoth);
    const binary = () => {
      compare.remove();
      diff.hidden = true;
      if (!orphaned) notText.hidden = false;
      comparing.delete(copy);
    };
    if (byName === false) binary();
    else if (byName === null) {
      // Neither a text kind nor a binary one by its name: its bytes say.
      // A read that fails says nothing of the bytes.
      void commands.readFileText(copy).then((r) => {
        if (r.status === "ok" && looksBinary(r.data)) binary();
      });
    }
    if (open && byName !== false && !orphans.has(note)) void showDiff(diff, note, copy, orphan);
    let keep: HTMLButtonElement | null = null;
    if (note.endsWith(".md")) {
      keep = button(s.keepCopy, "quiet", () => {
        void ask(s.keepCopyAsk(note), { yes: s.keepCopy, no: s.no }).then((yes) => {
          if (yes) void keepCopy(note, copy).then(() => refresh());
        });
      });
      actions.append(keep);
    }
    actions.append(
      button(s.discard, "quiet", () => {
        void ask(s.discardAsk(copy), { yes: s.discard, no: s.no }).then((yes) => {
          if (!yes) return;
          void commands.deleteEntry(copy).then((r) => {
            if (r.status !== "ok") return fail(r.error);
            comparing.delete(copy);
            void commands.folderSyncNow().then(() => refresh());
          });
        });
      }),
    );
    onOrphan.push(() => {
      compare.remove();
      keep?.remove();
      diff.hidden = true;
      notText.hidden = true;
      comparing.delete(copy);
      openBoth.textContent = s.open;
    });
    one.append(label, notText, actions, diff);
    item.append(one);
  }
  // Known gone from an earlier draw: said at once. Asked of the disk
  // either way, for a note that is back.
  if (orphans.has(note)) orphan();
  void commands.readFileText(note).then((r) => {
    if (r.status !== "ok" && r.error.kind === "not_found") orphan();
    else orphans.delete(note);
  });
  return item;
}

async function showDiff(box: HTMLElement, note: string, copy: string, orphan: () => void): Promise<void> {
  const s = words();
  const [a, b] = await Promise.all([commands.readFileText(note), commands.readFileText(copy)]);
  if (a.status !== "ok" && a.error.kind === "not_found") return orphan();
  if (a.status !== "ok") return void box.replaceChildren(h("p", "sync-item-why", errorSentence(a.error)));
  if (b.status !== "ok") return void box.replaceChildren(h("p", "sync-item-why", errorSentence(b.error)));
  if (!looksBinary(a.data) && !looksBinary(b.data)) box.replaceChildren(h("p", "sync-item-why", s.compareSaid), diffNode(a.data, b.data, true));
  else box.replaceChildren(h("p", "sync-item-why", s.notText));
}

/** Keep the copy's text: written over the note (its revision checked,
 *  invariant 11), then the copy goes to the bin; sync carries both. */
async function keepCopy(note: string, copy: string): Promise<void> {
  const [now, mine] = await Promise.all([commands.readNote(note), commands.readFileText(copy)]);
  if (now.status !== "ok") return fail(now.error);
  if (mine.status !== "ok") return fail(mine.error);
  // A note live in its room takes the copy's text there, as one edit (ADR
  // 0082): written under the room, it would be a change from outside.
  const through = await writeLive(note, liveHolder(note), () => mine.data, roomSide);
  if (through === "disk") {
    const written = await commands.writeNote(note, mine.data, now.data.revision);
    if (written.status !== "ok") return fail(written.error);
  }
  const gone = await commands.deleteEntry(copy);
  if (gone.status !== "ok") return fail(gone.error);
  comparing.delete(copy);
  await commands.folderSyncNow();
}

function ledgerLine(e: SyncLogEntry): HTMLElement {
  const s = words();
  const li = h("li", "");
  li.dataset["what"] = e.what;
  const time = h("time", "", new Date(e.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }));
  time.dateTime = e.at;
  time.title = new Date(e.at).toLocaleString(locale());
  li.append(time, h("span", "sync-verb", s.what[e.what] ?? e.what), h("span", "sync-path", e.path + (e.other ? ` ← ${e.other}` : "")));
  // Who made it, for what came from the server (sync 2).
  const who = madeBy(e.by, e.device, document.documentElement.lang.startsWith("pt"));
  if (who) li.append(h("span", "sync-who", who));
  return li;
}
