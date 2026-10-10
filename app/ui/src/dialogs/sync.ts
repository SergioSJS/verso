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

import { listen } from "@tauri-apps/api/event";
import { commands, type ServerAccount, type ServerFolder, type SyncLogEntry, type SyncStatus } from "../bindings";
import { ask } from "../dialog";
import { diffNode } from "../diff";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { currentFolder, folderName } from "../folder";
import { openNote } from "../layout/spaces";

const pt = {
  section: "Sincronizar",
  title: "Sincronizar com um servidor",
  desc: "Esta pasta continua neste computador — abre sem rede, o Obsidian lê, o backup copia — e um Universo guarda os mesmos arquivos para os seus outros aparelhos, o navegador e quem divide a pasta com você.",
  noServer: "Conecte a um servidor em Servidores primeiro.",
  toServers: "Ir para Servidores",
  server: "Servidor",
  where: "Pasta no servidor",
  whereDesc: "Uma pasta nova, com o nome desta, ou uma que você já tem lá.",
  newFolder: (name: string) => `Uma pasta nova: ${name}`,
  newName: "Nome da pasta nova",
  role: (r: string): string => (r === "owner" ? "dona" : r === "editor" ? "edita" : "só lê"),
  space: (files: number, size: string) => `Esta pasta tem ${files} arquivos, ${size}. Na primeira vez, nada é apagado: o que só um lado tem vai para o outro, e um arquivo diferente nos dois fica duas vezes — a versão do servidor com o nome, a deste computador ao lado.`,
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
    quota: "a pasta chegou à cota do servidor",
    placeholder: "não está neste computador (armazenamento sob demanda)",
    too_large: "maior que 1 GiB",
    changed: "mudou durante a sincronização",
    failed: "erro",
  } as Record<string, string>,
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
  } as Record<string, string>,
  bar: "Sincronização",
};
const en: typeof pt = {
  section: "Sync",
  title: "Sync with a server",
  desc: "This folder stays on this computer — it opens offline, Obsidian reads it, the backup copies it — and a Universo keeps the same files for your other devices, the browser and whoever shares the folder with you.",
  noServer: "Connect to a server in Servers first.",
  toServers: "Go to Servers",
  server: "Server",
  where: "Folder on the server",
  whereDesc: "A new folder, named after this one, or one you already have there.",
  newFolder: (name: string) => `A new folder: ${name}`,
  newName: "The new folder's name",
  role: (r: string) => (r === "owner" ? "owner" : r === "editor" ? "edits" : "reads only"),
  space: (files: number, size: string) => `This folder has ${files} files, ${size}. The first time, nothing is deleted: what one side alone has goes to the other, and a file that differs on both is kept twice — the server's version under the name, this computer's beside it.`,
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
    quota: "the folder reached the server's quota",
    placeholder: "not on this computer (on-demand storage)",
    too_large: "larger than 1 GiB",
    changed: "changed while syncing",
    failed: "error",
  },
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
  },
  bar: "Sync",
};

export function syncStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

let status: SyncStatus | null = null;
const painters = new Set<() => void>();
let openSection: (section: string) => void = () => {};

function size(bytes: number | null): string {
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

function when(stamp: string): string {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString(document.documentElement.lang.startsWith("pt") ? "pt-BR" : "en", { dateStyle: "short", timeStyle: "short" });
}

/** The state in a few words, as the status bar and the section say it. */
export function stateText(st: SyncStatus): string {
  const s = syncStrings();
  let text = s.states[st.state] ?? st.state;
  if (st.state === "syncing" && (st.sending || st.receiving)) text = s.moving(st.sending, st.receiving);
  if (st.state === "paused" && st.deletions) text = `${s.states["paused"]}: ${st.deletions}`;
  if (st.state === "error" && st.message) text = `${s.states["error"]}: ${st.message}`;
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

function paint(): void {
  const b = bar();
  const st = status;
  b.hidden = !st || !st.on;
  if (st?.on) {
    const text = stateText(st);
    b.textContent = text;
    b.title = `${syncStrings().bar}: ${text}`;
    b.setAttribute("aria-label", b.title);
    b.dataset["state"] = st.state;
    b.classList.toggle("warn", st.state === "error" || st.state === "paused" || st.conflicts.length > 0);
  }
  for (const p of painters) p();
}

async function refresh(): Promise<void> {
  if (!currentFolder) return;
  const r = await commands.folderSync();
  if (r.status === "ok") {
    status = r.data;
    paint();
  }
}

/** Hear the folder's sync from the start: the status bar shows it, and a
 *  click on it opens `open("sync")`. */
export function hearSync(open: (section: string) => void): void {
  openSection = open;
  void listen<SyncStatus>("sync-status", (e) => {
    if (e.payload.key !== currentFolder) return;
    status = e.payload;
    paint();
  });
  addEventListener("verso:folder-shown", () => void refresh());
  void refresh();
}

type Item = (title: string, desc: string, control: HTMLElement | null) => HTMLElement;

/** The section's body: the form while off, the sync while on. The form
 *  is drawn once while off, so a choice in it is not lost to a status;
 *  the sync's view follows every status. */
export function syncBody(item: Item): HTMLElement {
  const box = h("div", "sync");
  let wasOn: boolean | null = null;
  const draw = () => {
    if (wasOn !== null && !box.isConnected) {
      painters.delete(draw);
      return;
    }
    const on = status?.on ?? false;
    if (on) drawOn(box, item, status as SyncStatus);
    else if (wasOn !== false) void drawOff(box, item);
    wasOn = on;
  };
  painters.add(draw);
  draw();
  void refresh();
  return box;
}

async function drawOff(box: HTMLElement, item: Item): Promise<void> {
  const s = syncStrings();
  box.replaceChildren(item(s.title, s.desc, null));
  const accounts = await commands.serverAccounts();
  if (accounts.status !== "ok") return fail(accounts.error);
  if (accounts.data.length === 0) {
    const go = h("button", "", s.toServers);
    go.type = "button";
    go.addEventListener("click", () => openSection("servers"));
    box.append(item(s.noServer, "", go));
    return;
  }
  const server = h("select");
  for (const a of accounts.data as ServerAccount[]) {
    const o = h("option", "", `${a.url} — ${a.name}`);
    o.value = a.url;
    server.append(o);
  }
  const where = h("select");
  const name = h("input");
  name.value = folderName;
  name.addEventListener("keydown", (e) => e.stopPropagation());
  const nameRow = item(s.newName, "", name);
  const fill = async () => {
    where.replaceChildren();
    const fresh = h("option", "", s.newFolder(name.value || folderName));
    fresh.value = "";
    where.append(fresh);
    const r = await commands.serverFolders(server.value);
    if (r.status === "ok") {
      for (const f of r.data as ServerFolder[]) {
        const o = h("option", "", `${f.name} · ${s.role(f.role)}`);
        o.value = f.id;
        where.append(o);
      }
    }
    nameRow.hidden = where.value !== "";
  };
  server.addEventListener("change", () => void fill());
  where.addEventListener("change", () => (nameRow.hidden = where.value !== ""));
  name.addEventListener("input", () => {
    const first = where.options[0];
    if (first) first.textContent = s.newFolder(name.value || folderName);
  });
  const space = h("p", "setting-desc sync-space");
  void commands.folderSpace().then((r) => {
    if (r.status === "ok") space.textContent = s.space(r.data.files, size(r.data.total));
  });
  const start = h("button", "mod-cta", s.start);
  start.type = "button";
  start.addEventListener("click", () => {
    start.disabled = true;
    const folder = where.value || null;
    void commands.folderSyncStart(server.value, folder, folder ? null : name.value.trim() || folderName).then((r) => {
      start.disabled = false;
      if (r.status !== "ok") return fail(r.error);
      status = r.data;
      paint();
    });
  });
  box.append(item(s.server, "", server), item(s.where, s.whereDesc, where), nameRow, space, start);
  await fill();
}

function drawOn(box: HTMLElement, item: Item, st: SyncStatus): void {
  const s = syncStrings();
  const said = h("p", "sync-state", stateText(st));
  said.setAttribute("role", "status");
  const where = `${st.server} · ${st.folder_name || st.folder}${st.role ? ` (${s.role(st.role)})` : ""}`;
  const head = item(s.title, where, said);
  const actions = h("div", "sync-actions");
  const button = (label: string, run: () => void) => {
    const b = h("button", "", label);
    b.type = "button";
    b.addEventListener("click", run);
    actions.append(b);
    return b;
  };
  const userPaused = st.state === "paused" && !st.deletions;
  button(userPaused ? s.resume : s.pause, () => void commands.folderSyncPause(!userPaused).then(() => refresh()));
  button(s.now, () => void commands.folderSyncNow().then(() => refresh()));
  button(s.stop, () => {
    void ask(s.stopAsk, { yes: s.stopYes, no: s.no }).then((yes) => {
      if (!yes) return;
      void commands.folderSyncStop().then((r) => {
        if (r.status !== "ok") return fail(r.error);
        status = r.data;
        paint();
      });
    });
  });
  const parts: HTMLElement[] = [head, actions];
  if (st.last) parts.push(h("p", "setting-desc", s.last(when(st.last))));
  if (st.role === "reader") parts.push(h("p", "setting-desc", s.readerNote));
  if (st.deletions) {
    const n = st.deletions;
    const warn = h("div", "sync-deletions");
    warn.setAttribute("role", "alert");
    const yes = h("button", "mod-warning", s.deleteYes(n));
    yes.type = "button";
    yes.addEventListener("click", () => {
      void ask(s.deleteAsk(n), { yes: s.deleteYes(n), no: s.no }).then((ok) => {
        if (ok) void commands.folderSyncConfirm().then(() => refresh());
      });
    });
    warn.append(h("p", "", s.deletions(n)), yes);
    parts.push(warn);
  }
  if (st.conflicts.length) {
    const list = h("div", "sync-conflicts");
    list.append(h("h3", "", `${s.conflicts} (${st.conflicts.length})`), h("p", "setting-desc", s.conflictsDesc));
    for (const copy of st.conflicts) list.append(conflictRow(copy));
    parts.push(list);
  }
  if (st.refused.length) {
    const list = h("div", "sync-refused");
    list.append(h("h3", "", `${s.refused} (${st.refused.length})`));
    const ul = h("ul");
    for (const f of st.refused) ul.append(h("li", "", `${f.path} — ${s.reasons[f.reason] ?? f.reason}${f.reason === "failed" ? `: ${f.message}` : ""}`));
    list.append(ul);
    parts.push(list);
  }
  const log = h("div", "sync-log");
  log.append(h("h3", "", s.log));
  if (st.log.length === 0) log.append(h("p", "setting-desc", s.logEmpty));
  else {
    const ul = h("ul");
    for (const e of st.log.slice(0, 50)) ul.append(logLine(e));
    log.append(ul);
  }
  parts.push(log);
  box.replaceChildren(...parts);
}

function logLine(e: SyncLogEntry): HTMLElement {
  const s = syncStrings();
  const li = h("li");
  const time = h("time", "", when(e.at));
  time.dateTime = e.at;
  li.append(time, ` ${s.what[e.what] ?? e.what}: ${e.path}${e.other ? ` (${e.other})` : ""}`);
  return li;
}

/** The file a conflict's copy is of: its name without the parenthesis. */
export function originalOf(copy: string): string {
  return copy.replace(/ \((conflict|conflito), [^)]*\)(?=\.[^./]*$|$)/, "");
}

function conflictRow(copy: string): HTMLElement {
  const s = syncStrings();
  const original = originalOf(copy);
  const d = h("details", "sync-conflict");
  d.append(h("summary", "", copy));
  const body = h("div", "sync-conflict-body");
  const actions = h("div", "sync-actions");
  const both = h("button", "", s.openBoth);
  both.type = "button";
  both.addEventListener("click", () => {
    openNote(original, false);
    openNote(copy, true);
  });
  const del = h("button", "", s.deleteCopy);
  del.type = "button";
  del.addEventListener("click", () => {
    void ask(s.deleteCopyAsk(copy), { yes: s.deleteCopy, no: s.no }).then((yes) => {
      if (!yes) return;
      void commands.deleteEntry(copy).then((r) => {
        if (r.status !== "ok") return fail(r.error);
        void commands.folderSyncNow().then(() => refresh());
      });
    });
  });
  actions.append(both, del);
  // The difference is read the first time the row opens.
  const diff = h("div", "sync-conflict-diff");
  let read = false;
  d.addEventListener("toggle", () => {
    if (!d.open || read) return;
    read = true;
    void Promise.all([commands.readFileText(original), commands.readFileText(copy)]).then(([a, b]) => {
      if (a.status === "ok" && b.status === "ok") diff.replaceChildren(h("p", "setting-desc", s.compare), diffNode(a.data, b.data, true));
      else diff.replaceChildren(h("p", "setting-desc", s.notText));
    });
  });
  body.append(diff);
  body.append(actions);
  d.append(body);
  return d;
}
