// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A folder of this computer kept in step with a folder of a server
// (ADR 0079): the settings' "Sync" section turns it on — a server signed
// in to, a new folder there or one the account reaches, the space shown
// first — and shows it once on: its state, pause and resume, the
// deletions it waits on, the conflicts with their difference, the files
// left out and why, what crossed. The status bar says the state, and a
// click on it opens the section. Nothing is silent (item 13).

import { onPhone } from "../screen/phoneWords";
import { listen } from "@tauri-apps/api/event";
import { commands, type ServerAccount, type SyncStatus, type SyncVersions } from "../bindings";
import { h, ui } from "../dom";
import { syncHeard } from "../notify/sources";
import { errorSentence, fail } from "../errors";
import { addressOf, attempt, reachStrings } from "../reach";
import { host as appHost } from "../can";
import { backgroundRow } from "./syncBackground";
import { currentFolder, folderName } from "../folder";
import { liveTogether } from "../settings";
import { seatedFrom } from "../seatState";
import { drawSyncOn } from "./syncView";
import { type Cloud, chooser, cloudProblem, deviceNameRow, drawCloudForm } from "./syncCloud";

const pt = {
  section: "Sincronizar",
  title: "Sincronizar com um servidor ou uma nuvem",
  desc: "Esta pasta continua neste computador — abre sem rede, o Obsidian lê, o backup copia — e um UniVerso guarda os mesmos arquivos para os seus outros aparelhos, o navegador e quem divide a pasta com você — ou uma nuvem que você já tem (WebDAV, S3) para os seus outros computadores.",
  noServer: "Conecte a um servidor em Servidores primeiro.",
  toServers: "Ir para Servidores",
  server: "Servidor",
  where: "Pasta no servidor",
  whereDesc: "Uma pasta nova, com o nome desta, ou uma que você já tem lá.",
  newFolder: (name: string) => `Uma pasta nova: ${name}`,
  newName: "Nome da pasta nova",
  role: (r: string): string => (r === "owner" ? "dona" : r === "editor" ? "edita" : "só lê"),
  // The form while off, read in three seconds: where the folder is now,
  // what syncing gives, where it goes, what the first pass does.
  onlyHere: (name: string) => `${name} está só neste computador.`,
  // The phone's own folder lives in the app's storage (ADR 0118
  // Consequences): no other app sees it and it goes with the app.
  descPhone: "Esta pasta fica neste celular — dentro do app, ou no armazenamento que outros apps veem —; um UniVerso ou uma nuvem que você já tem (WebDAV, S3) guarda os mesmos arquivos para os seus outros aparelhos e o navegador.",
  onlyHerePhone: (name: string) => `${name} está só neste celular, guardada dentro do app: se o Verso for desinstalado, ela é apagada junto.`,
  onlyHerePhoneShared: (name: string) => `${name} está só neste celular, no armazenamento que outros apps veem: fica mesmo se o Verso for desinstalado.`,
  ledePhone: "Com um UniVerso ou uma nuvem, uma cópia fica a salvo e os mesmos arquivos aparecem nos seus outros aparelhos e no navegador. Enquanto o app está aberto (ou fechado, com a sincronização em segundo plano abaixo), as mudanças cruzam; ao abrir de novo, ele continua de onde parou.",
  lede: "Com um UniVerso, os mesmos arquivos ficam nos seus outros aparelhos, no navegador e com quem divide a pasta com você. Ela continua aqui também: abre sem rede, o Obsidian lê, o backup copia.",
  account: (host: string, name: string) => `${host} · ${name}`,
  space: (files: number, size: string) => `Esta pasta tem ${files} arquivos, ${size}.`,
  firstSafe: "Na primeira vez, nada é apagado.",
  firstHow: "O que só um lado tem vai para o outro; um arquivo diferente nos dois fica duas vezes — a versão do servidor com o nome, a deste computador ao lado.",
  start: "Sincronizar esta pasta",
  state: "Estado",
  states: {
    off: "Desligada",
    starting: "Conectando…",
    synced: "Sincronizada",
    syncing: "Sincronizando…",
    offline: "Sem conexão: as mudanças cruzam quando a rede voltar",
    paused: "Pausada",
    error: "Erro",
  } as Record<string, string>,
  moving: (up: number, down: number) => [up ? `enviando ${up}` : "", down ? `recebendo ${down}` : ""].filter(Boolean).join(", "),
  conflictsShort: (n: number) => (n === 1 ? "1 conflito" : `${n} conflitos`),
  // Offline in a browser (ADR 0092 item 7): what waits to go up.
  waitingShort: (n: number) => (n === 1 ? "1 mudança esperando" : `${n} mudanças esperando`),
  toDelete: (n: number) => `${n} a apagar`,
  last: (when: string) => `Última vez: ${when}`,
  readerNote: "Você só lê esta pasta no servidor: as mudanças de lá chegam; as feitas aqui ficam aqui, listadas abaixo.",
  pause: "Pausar",
  resume: "Retomar",
  now: "Sincronizar agora",
  stop: "Desligar",
  stopAsk: "Desligar a sincronização desta pasta? Os arquivos ficam como estão, aqui e no servidor.",
  stopYes: "Desligar",
  no: "Cancelar",
  deletions: (n: number) => `A sincronização apagaria ${n} arquivos e parou para perguntar: uma pasta movida, um disco que não montou ou uma nuvem que tirou os arquivos do computador parecem exclusões.`,
  deleteYes: (n: number) => `Apagar ${n} arquivos`,
  deleteAsk: (n: number) => `Apagar ${n} arquivos dos dois lados? Neste computador eles vão para a lixeira da pasta.`,
  conflicts: "Conflitos",
  conflictsDesc: "Os dois lados mudaram o mesmo arquivo. A versão do servidor ficou com o nome; a deste computador, ao lado, numa cópia. Junte à mão e apague a cópia.",
  compare: "Diferença (servidor → cópia)",
  openBoth: "Abrir os dois",
  deleteCopy: "Apagar a cópia",
  deleteCopyAsk: (p: string) => `Apagar ${p}? Ela vai para a lixeira da pasta, e some dos outros aparelhos.`,
  notText: "Não é texto: abra os dois para comparar.",
  refused: "Não sincronizados",
  reasons: {
    reader: "você só lê a pasta no servidor",
    unshared: "este arquivo não é mais compartilhado com você; a sua cópia fica aqui",
    quota: "a pasta chegou à cota do servidor",
    placeholder: "não está neste computador (armazenamento sob demanda)",
    too_large: "maior que 1 GiB",
    name_taken: "outro arquivo aqui tem esse nome, só com maiúsculas ou acentos diferentes",
    case_twin_there: "dois nomes que só diferem em maiúsculas e minúsculas no servidor; este computador guarda um",
    name_invalid: "nome que nem todo sistema aceita (ponto ou espaço no fim, um de < > : \" | ? * \\, ou um nome como CON)",
    changed: "mudou durante a sincronização",
    failed: "erro",
  } as Record<string, string>,
  problems: {
    not_signed_in: "este computador não está conectado ao servidor: conecte em Ajustes › Servidores",
    signed_out: "o servidor encerrou a sessão deste computador: conecte de novo em Ajustes › Servidores",
    table_closed: "a mesa está fechada pelo mestre: a sincronização volta sozinha quando ela abrir",
    table_moved: "a mesa mudou de servidor: peça ao mestre um convite novo",
    version: "o servidor está numa versão diferente deste app: atualize o que estiver atrás",
    folder_gone: "a pasta do servidor sumiu, ou esta conta não tem mais acesso a ela",
    held: "a pasta deste computador não pôde ser aberta para seguir sincronizando enquanto você está à mesa: tente de novo",
    failed: "algo deu errado; o log do app diz o quê",
  } as Record<string, string>,
  /** The `version` problem with what each side runs. */
  versions: (v: SyncVersions): string =>
    v.server_version === v.app_version
      ? `o servidor tem outro build do Verso ${v.server_version} (servidor ${v.server_build}, este app ${v.app_build}): atualize os dois para o mesmo`
      : `o servidor roda o Verso ${v.server_version}, este app ${v.app_version}: atualize o que estiver atrás`,
  log: "O que cruzou",
  logEmpty: "Nada ainda.",
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
  bar: "Sincronização",
  // A share revoked by its owner (ADR 0081 item 8): sync turned off.
  revokedShort: (when: string) => `Desligada: quem compartilhou revogou o acesso em ${when}`,
  revokedTitle: "Compartilhamento revogado",
  revokedWhy: (folder: string, server: string, when: string) =>
    `Quem compartilhou ${folder}, em ${server}, revogou o seu acesso em ${when}. A sincronização desta pasta foi desligada; os arquivos continuam neste computador, como estavam.`,
};
const en: typeof pt = {
  section: "Sync",
  title: "Sync with a server or a cloud",
  desc: "This folder stays on this computer — it opens offline, Obsidian reads it, the backup copies it — and a UniVerso keeps the same files for your other devices, the browser and whoever shares the folder with you — or a cloud you already have (WebDAV, S3) for your other computers.",
  noServer: "Connect to a server in Servers first.",
  toServers: "Go to Servers",
  server: "Server",
  where: "Folder on the server",
  whereDesc: "A new folder, named after this one, or one you already have there.",
  newFolder: (name: string) => `A new folder: ${name}`,
  newName: "The new folder's name",
  role: (r: string) => (r === "owner" ? "owner" : r === "editor" ? "edits" : "reads only"),
  onlyHere: (name: string) => `${name} is only on this computer.`,
  descPhone: "This folder is on this phone — inside the app, or in the storage other apps see —; a UniVerso or a cloud you already have (WebDAV, S3) keeps the same files for your other devices and the browser.",
  onlyHerePhone: (name: string) => `${name} is only on this phone, kept inside the app: if Verso is uninstalled, it is deleted with it.`,
  onlyHerePhoneShared: (name: string) => `${name} is only on this phone, in the storage other apps see: it stays even if Verso is uninstalled.`,
  ledePhone: "With a UniVerso or a cloud, a copy stays safe and the same files show on your other devices and in the browser. While the app is open (or closed, with background sync below), changes cross; when it opens again, it carries on where it stopped.",
  lede: "With a UniVerso, the same files are on your other devices, in the browser and with whoever shares the folder with you. It stays here too: it opens offline, Obsidian reads it, the backup copies it.",
  account: (host: string, name: string) => `${host} · ${name}`,
  space: (files: number, size: string) => `This folder has ${files} files, ${size}.`,
  firstSafe: "The first time, nothing is deleted.",
  firstHow: "What one side alone has goes to the other; a file that differs on both is kept twice — the server's version under the name, this computer's beside it.",
  start: "Sync this folder",
  state: "State",
  states: {
    off: "Off",
    starting: "Connecting…",
    synced: "Synced",
    syncing: "Syncing…",
    offline: "Offline: changes cross when the network is back",
    paused: "Paused",
    error: "Error",
  },
  moving: (up: number, down: number) => [up ? `sending ${up}` : "", down ? `receiving ${down}` : ""].filter(Boolean).join(", "),
  conflictsShort: (n: number) => (n === 1 ? "1 conflict" : `${n} conflicts`),
  waitingShort: (n: number) => (n === 1 ? "1 change waiting" : `${n} changes waiting`),
  toDelete: (n: number) => `${n} to delete`,
  last: (when: string) => `Last time: ${when}`,
  readerNote: "You only read this folder on the server: its changes arrive; those made here stay here, listed below.",
  pause: "Pause",
  resume: "Resume",
  now: "Sync now",
  stop: "Turn off",
  stopAsk: "Turn this folder's sync off? The files stay as they are, here and on the server.",
  stopYes: "Turn off",
  no: "Cancel",
  deletions: (n: number) => `Sync would delete ${n} files and stopped to ask: a folder moved, a drive not mounted or a cloud that took the files off the computer all look like deletions.`,
  deleteYes: (n: number) => `Delete ${n} files`,
  deleteAsk: (n: number) => `Delete ${n} files on both sides? On this computer they go to the folder's bin.`,
  conflicts: "Conflicts",
  conflictsDesc: "Both sides changed the same file. The server's version kept the name; this computer's is beside it, in a copy. Merge by hand and delete the copy.",
  compare: "Difference (server → copy)",
  openBoth: "Open both",
  deleteCopy: "Delete the copy",
  deleteCopyAsk: (p: string) => `Delete ${p}? It goes to the folder's bin, and leaves the other devices.`,
  notText: "Not text: open both to compare.",
  refused: "Not synced",
  reasons: {
    reader: "you only read the folder on the server",
    unshared: "this file is no longer shared with you; your copy stays here",
    quota: "the folder reached the server's quota",
    placeholder: "not on this computer (on-demand storage)",
    too_large: "larger than 1 GiB",
    name_taken: "another file here has this name, differing only in case or accents",
    case_twin_there: "two names that differ only in case on the server; this computer keeps one",
    name_invalid: "a name not every system can keep (a trailing dot or space, one of < > : \" | ? * \\, or a name such as CON)",
    changed: "changed while syncing",
    failed: "error",
  },
  problems: {
    not_signed_in: "this computer is not signed in to the server: connect in Settings › Servers",
    signed_out: "the server ended this computer's session: connect again in Settings › Servers",
    table_closed: "the table is closed by the game master: sync resumes by itself when it opens",
    table_moved: "the table moved to another server: ask the game master for a new invitation",
    version: "the server runs another version than this app: update the one that is behind",
    folder_gone: "the server's folder is gone, or this account no longer reaches it",
    held: "this computer's folder could not be opened to go on syncing while you sit at the table: try again",
    failed: "something went wrong; the app's log says what",
  },
  versions: (v: SyncVersions): string =>
    v.server_version === v.app_version
      ? `the server runs another build of Verso ${v.server_version} (server ${v.server_build}, this app ${v.app_build}): update both to the same`
      : `the server runs Verso ${v.server_version}, this app ${v.app_version}: update the one that is behind`,
  log: "What crossed",
  logEmpty: "Nothing yet.",
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
  bar: "Sync",
  revokedShort: (when: string) => `Off: the share's owner revoked it on ${when}`,
  revokedTitle: "Share revoked",
  revokedWhy: (folder: string, server: string, when: string) =>
    `Whoever shared ${folder}, on ${server}, revoked your access on ${when}. This folder's sync was turned off; the files stay on this computer as they were.`,
};

export function syncStrings(): typeof pt {
  const s = document.documentElement.lang.startsWith("pt") ? pt : en;
  // A phone's folder is not "on this computer", and Obsidian cannot read it.
  return appHost() === "mobile" ? onPhone({ ...s, desc: s.descPhone }) : s;
}

let status: SyncStatus | null = null;
const painters = new Set<() => void>();
let openSection: (section: string) => void = () => {};
/** A server's folder chosen in Servers to sync this folder with: the form
 *  opens on it. */
let preselected: { url: string; folder: string } | null = null;

/** The window's folder's sync, as last heard. */
export function currentSync(): SyncStatus | null {
  return status;
}

/** A status the person's own action brought (Servers › "Sincronizar"),
 *  taken as the event would have been. */
export function syncStarted(st: SyncStatus): void {
  took(st);
}

/** Open a section of the settings (the window's own opener). */
export function openSettingsSection(section: string): void {
  openSection(section);
}

/** The form to turn sync on starts with this server and folder chosen. */
export function preselectSync(url: string, folder: string): void {
  preselected = { url, folder };
}

export function size(bytes: number | null): string {
  let n = bytes ?? 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const pt = document.documentElement.lang.startsWith("pt");
  return `${n.toLocaleString(pt ? "pt-BR" : "en", { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function when(stamp: string): string {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "short", timeStyle: "short" });
}

/** What went wrong, in the window's language: the `version` problem names
 *  what each side runs. */
function problemText(st: SyncStatus): string | null {
  const s = syncStrings();
  if (st.problem === "version" && st.versions) return s.versions(st.versions);
  const cloud = cloudProblem(st.problem);
  if (cloud) return cloud;
  return (st.problem && s.problems[st.problem]) || st.message;
}

/** The state in a few words, as the status bar and the section say it. */
export function stateText(st: SyncStatus, short = false): string {
  const s = syncStrings();
  if (st.state === "off" && st.revoked) return s.revokedShort(when(st.revoked));
  let text = s.states[st.state] ?? st.state;
  if (st.state === "syncing" && (st.sending || st.receiving)) text = s.moving(st.sending, st.receiving);
  if (st.state === "paused" && st.deletions) text = `${s.states["paused"]} · ${s.toDelete(st.deletions)}`;
  if (st.state === "error") {
    // The status bar has room for a few words: the problem's short name;
    // the versions each side runs are said in the section and the notice.
    const said = short && st.problem && s.problems[st.problem] ? s.problems[st.problem] : problemText(st);
    if (said) text = `${s.states["error"]}: ${said}`;
  }
  // Offline because the server, not the network, did not answer.
  if (st.state === "offline" && st.problem === "unreachable") text = reachStrings().unreachableShort(addressOf(st.server));
  // Offline, the writes waiting to go up (a browser's folder, ADR 0092).
  if (st.state === "offline" && st.sending > 0) text += ` · ${s.waitingShort(st.sending)}`;
  if (st.conflicts.length) text += ` · ${s.conflictsShort(st.conflicts.length)}`;
  return text;
}

function bar(): HTMLButtonElement {
  let b = document.getElementById("sync-state") as HTMLButtonElement | null;
  if (b) return b;
  b = h("button", "ghost status-sync");
  b.id = "sync-state";
  b.type = "button";
  b.hidden = true;
  b.addEventListener("click", () => openSection("sync"));
  ui.status.after(b);
  return b;
}

/** The folder's sync, for the notes that may be live in the server's
 *  rooms (collab.ts, ADR 0082): on or off, its state, the role there and
 *  the person's setting. */
export function tellSyncState(): void {
  // Seated at the table served from this computer's folder, the window
  // shows that folder's sync (its key is not the window's folder's), but
  // its notes, table and access are the table's server's: for them the
  // window's folder does not sync.
  const seats = status !== null && status.key !== "" && status.key !== currentFolder;
  const st = seats ? null : status;
  const detail = { on: st?.on ?? false, state: st?.state ?? "off", role: st?.role ?? "", live: liveTogether() };
  dispatchEvent(new CustomEvent("verso:sync-state", { detail }));
}

function paint(): void {
  tellSyncState();
  const b = bar();
  const st = status;
  // Off because the share was revoked, the bar says so until the person
  // turns sync on again or off themselves.
  const revoked = Boolean(st && !st.on && st.revoked);
  b.hidden = !st || (!st.on && !revoked);
  if (st && (st.on || revoked)) {
    const text = stateText(st, true);
    b.textContent = text;
    b.title = `${syncStrings().bar}: ${stateText(st)}`;
    b.setAttribute("aria-label", b.title);
    b.dataset["state"] = st.state;
    b.classList.toggle("warn", revoked || st.state === "error" || st.state === "paused" || st.conflicts.length > 0);
  }
  for (const p of painters) p();
}

async function refresh(): Promise<void> {
  if (!currentFolder) return;
  const r = await commands.folderSync();
  if (r.status === "ok") took(r.data);
}

/** A status heard — by the event or by asking — becomes the window's.
 *  What changed of it on its own — the sync failing or back, a share
 *  revoked, a conflict copy — is a notification (ADR 0084 item 7), said
 *  once per change by whichever of the two brings it first: a question
 *  answered before the event would otherwise take the change in silence. */
function took(next: SyncStatus): void {
  const prev = status;
  status = next;
  paint();
  syncHeard(prev, next);
}

/** Hear the folder's sync from the start: the status bar shows it, and a
 *  click on it opens `open("sync")`. */
export function hearSync(open: (section: string) => void): void {
  openSection = open;
  void listen<SyncStatus>("sync-status", (e) => {
    if (e.payload.key !== currentFolder && e.payload.key !== seatedFrom()) return;
    took(e.payload);
  });
  addEventListener("verso:folder-shown", () => void refresh());
  // Sat or left: the folder whose sync the window shows may be another.
  addEventListener("verso:seat-state", () => void refresh());
  void refresh();
}

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

/** The section's body: the form while off, the sync while on. The form
 *  is drawn once while off, so a choice in it is not lost to a status;
 *  the sync's view follows every status. */
export function syncBody(item: Item): HTMLElement {
  const box = h("div", "sync");
  // What the status repaints, and the computer's name beside it, which it
  // does not (a name being typed keeps its focus). The name needs no
  // server (ADR 0104 item 4, C.13).
  const body = h("div", "sync-body");
  box.append(body, deviceNameRow(item));
  // A phone keeps syncing with Verso closed, if asked (ADR 0118 item 6.3).
  if (appHost() === "mobile") box.append(backgroundRow(item));
  let wasOn: boolean | null = null;
  let wasRevoked: string | null = null;
  const draw = () => {
    if (wasOn !== null && !box.isConnected) {
      painters.delete(draw);
      return;
    }
    const on = status?.on ?? false;
    const revoked = on ? null : (status?.revoked ?? null);
    if (on) drawOn(body, status as SyncStatus);
    else if (wasOn !== false || revoked !== wasRevoked) void drawOff(body, item);
    wasOn = on;
    wasRevoked = revoked;
  };
  painters.add(draw);
  draw();
  void refresh();
  return box;
}

/** Where the folder syncs, as the form last chose it: a UniVerso, or a
 *  cloud (ADR 0104 item 16). Kept so a redraw does not forget it. */
let choice = "universo";

async function drawOff(box: HTMLElement, item: Item): Promise<void> {
  const s = syncStrings();
  // Where the folder is now, in the sentence the section says once on
  // ("Tudo em dia."), and what syncing would give it.
  const top = h("header", "sync-top sync-off");
  const phone = appHost() === "mobile";
  // A phone's folder in the app goes with it; one of its shared storage stays.
  const inApp = phone && (await commands.folderInApp().then((r) => r.status !== "ok" || r.data));
  const sentence = h("p", "sync-sentence", !phone ? s.onlyHere(folderName) : inApp ? s.onlyHerePhone(folderName) : s.onlyHerePhoneShared(folderName));
  sentence.dataset["tone"] = "quiet";
  top.append(sentence, h("p", "sync-lede", phone ? s.ledePhone : s.lede));
  box.replaceChildren(top);
  // Turned off because the share was revoked: said first, in words.
  const st = status;
  if (st && !st.on && st.revoked) {
    const notice = h("article", "sync-item danger sync-revoked");
    notice.setAttribute("role", "status");
    notice.append(
      h("h3", "sync-item-title", s.revokedTitle),
      h("p", "sync-item-why", s.revokedWhy(st.folder_name || st.folder, hostOf(st.server), when(st.revoked))),
    );
    box.prepend(notice);
  }
  // A UniVerso or a cloud the person already has: one place per folder.
  const deps = {
    item,
    size,
    started: (st: SyncStatus) => {
      status = st;
      paint();
    },
  };
  box.append(chooser(choice, (value) => {
    choice = value;
    void drawOff(box, item);
  }, deps));
  if (choice === "webdav" || choice === "s3") {
    drawCloudForm(box, choice as Cloud, deps);
    return;
  }
  const accounts = await commands.serverAccounts();
  if (accounts.status !== "ok") return fail(accounts.error);
  if (accounts.data.length === 0) {
    const go = h("button", "btn", s.toServers);
    go.type = "button";
    go.addEventListener("click", () => openSection("servers"));
    box.append(item(s.noServer, "", go));
    return;
  }
  // One server: said, not a choice of one. Several: chosen.
  const list = accounts.data as ServerAccount[];
  const host = (a: ServerAccount) => a.url.replace(/^https?:\/\//, "");
  let server: HTMLSelectElement | null = null;
  let serverControl: HTMLElement;
  if (list.length === 1) {
    serverControl = h("span", "sync-fixed", s.account(host(list[0]!), list[0]!.name));
  } else {
    server = h("select");
    for (const a of list) {
      const o = h("option", "", s.account(host(a), a.name));
      o.value = a.url;
      server.append(o);
    }
    serverControl = server;
  }
  const serverUrl = () => server?.value ?? list[0]!.url;
  const where = h("select");
  const name = h("input");
  name.type = "text";
  name.autocomplete = "off";
  name.spellcheck = false;
  name.value = folderName;
  name.addEventListener("keydown", (e) => e.stopPropagation());
  const nameRow = item(s.newName, "", name);
  // A failure said here, beside the button the person pressed or the list
  // that did not come: which server, why it may be, and a try again.
  const failure = h("div", "sync-failure");
  failure.hidden = true;
  const fill = async () => {
    where.replaceChildren();
    const fresh = h("option", "", s.newFolder(name.value || folderName));
    fresh.value = "";
    where.append(fresh);
    const r = await attempt(failure, () => commands.serverFolders(serverUrl()), { other: errorSentence, retry: () => void fill() });
    if (r.status === "ok") {
      for (const f of r.data.folders) {
        const o = h("option", "", `${f.name} · ${s.role(f.role)}`);
        o.value = f.id;
        where.append(o);
      }
    }
    nameRow.hidden = where.value !== "";
  };
  server?.addEventListener("change", () => void fill());
  if (server && preselected && [...server.options].some((o) => o.value === preselected!.url)) server.value = preselected.url;
  where.addEventListener("change", () => (nameRow.hidden = where.value !== ""));
  name.addEventListener("input", () => {
    const first = where.options[0];
    if (first) first.textContent = s.newFolder(name.value || folderName);
  });
  // What the first pass does, right above the button that starts it.
  const space = h("p", "sync-space");
  void commands.folderSpace().then((r) => {
    if (r.status === "ok") space.textContent = s.space(r.data.files, size(r.data.total));
  });
  const first = h("p", "sync-first");
  first.append(h("strong", "", s.firstSafe), ` ${s.firstHow}`);
  const start = h("button", "btn primary", s.start);
  start.type = "button";
  start.addEventListener("click", () => {
    const folder = where.value || null;
    const run = () => commands.folderSyncStart(serverUrl(), folder, folder ? null : name.value.trim() || folderName);
    void attempt(failure, run, { button: start, other: errorSentence, retry: () => start.click() }).then((r) => {
      if (r.status !== "ok") return;
      status = r.data;
      paint();
    });
  });
  const go = h("div", "sync-go");
  go.append(space, first, failure, start);
  box.append(item(s.server, "", serverControl), item(s.where, s.whereDesc, where), nameRow, go);
  await fill();
  if (preselected && [...where.options].some((o) => o.value === preselected!.folder)) {
    where.value = preselected.folder;
    nameRow.hidden = true;
  }
  preselected = null;
}

function drawOn(box: HTMLElement, st: SyncStatus): void {
  drawSyncOn(
    box,
    st,
    refresh,
    problemText,
    () => openSection("servers"),
  );
}
