// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The desktop app connected to a server (ADR 0073 item 2; the maintainer's
// answer K of 2026-10-09): the settings' "Servers" section signs in
// through the browser — the server's page approves this device, nobody
// pastes a token (ADR 0074 item 8) — lists the servers signed in to, opens
// one of their folders in this window, and signs out. It also names this
// computer (ADR 0079 item 8, decided 2026-10-11).

import { listen } from "@tauri-apps/api/event";
import { commands, type ContractError, type ServerAccount, type ServerBack, type ServerFolder, type ServerGone } from "../bindings";
import { h, ui } from "../dom";
import { errorSentence, fail } from "../errors";
import { addressOf, attempt, busy, clearFailure, reachParts, reachSentence, reachStrings, sayFailure } from "../reach";
import { can } from "../can";
import { currentFolder, folderName, LAST_FOLDER } from "../folder";
import { currentSync, openSettingsSection, preselectSync, syncStarted } from "./sync";
import { openFolderBy } from "../open";
import { sh } from "../shareStrings";
import { foundList } from "./serversFound";
import { copyWhenKnown, startSignIn } from "../serverSignIn";
import { cp as cp2 } from "../campaignStrings";
import { revokedSentence, serverBackHeard, serverGoneHeard } from "../notify/sources";

/** A sentence whose names stand out: a name is `[name]`. */
type Said = (string | [string])[];

const pt = {
  section: "Servidores",
  connect: "Conectar a um servidor",
  connectDesc: "Um UniVerso — um servidor Verso — onde você tem conta. O navegador abre a página dele para você entrar, colar o código que este app copia e permitir este computador; ninguém cola senha aqui.",
  addressLabel: "Endereço do servidor",
  addressPlaceholder: "https://notas.exemplo",
  connectButton: "Conectar",
  // The code is copied before the page opens (decided 2026-10-14, ADR
  // 0083 As built); shown as well, to type when the copy was refused.
  copied: "Código copiado — cole na página que abriu: ",
  notCopied: "Digite este código na página que abriu: ",
  waiting: ". Esperando…",
  signedIn: (who: string) => `Conectado como ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  as: (name: string, email: string) => `Você entra como ${name} · ${email}`,
  foldersOf: (host: string) => `Pastas em ${host}`,
  loading: "Carregando as pastas…",
  noFolders: "Nenhuma pasta para você neste servidor ainda. Peça um convite a quem o administra.",
  noFoldersMay: "Nenhuma pasta neste servidor ainda.",
  // The one action of a folder open on this computer (the maintainer,
  // 2026-10-16: "Eu não posso simplesmente sincronizar?"): the server's
  // folder is made for it, here, and nothing is asked first.
  syncThis: (local: string) => `Sincronizar ‘${local}’`,
  syncThisNamed: (local: string, host: string) => `Sincronizar ${local} com ${host}, numa pasta nova do servidor`,
  syncThisNote: "Cria uma pasta nova neste servidor, com o nome desta, e a mantém igual. Se já houver uma com esse nome, a nova leva “(2)”. Nada é apagado.",
  syncedElsewhere: (folder: string, other: string) => `“${folder}” já sincroniza com ${other}. Uma pasta sincroniza com um servidor por vez: para sincronizar com este, desligue lá primeiro.`,
  openSync: "Abrir Sincronizar",
  syncing: (host: string) => `Sincronizando com ${host}…`,
  syncOn: (local: string, host: string) => `${local} agora está sincronizada com ${host}.`,
  emptyFolder: "Criar pasta vazia…",
  emptyName: "Nome da pasta nova",
  emptyCreate: "Criar",
  emptyCancel: "Cancelar",
  emptyMade: (name: string) => `Pasta ${name} criada.`,
  noneYet: "Nenhum servidor ainda. Com um UniVerso, suas pastas ficam no navegador, no celular e em outros computadores.",
  role: (r: string): string => (r === "owner" ? "dona" : r === "editor" ? "edita" : "só lê"),
  openHere: "Abrir aqui",
  openHereNamed: (name: string) => `Abrir ${name} nesta janela, online`,
  // The two actions of a folder's row, said once above the rows (the
  // names in `[ ]` stand out); each row's button is short, its accessible
  // name whole.
  pair: (local: string): Said => [["Abrir aqui"], " troca a pasta desta janela pela do servidor, online. ", ["Sincronizar"], " mantém ", [local], ", a pasta deste computador aberta agora, igual à do servidor."],
  sync: "Sincronizar",
  syncNamed: (local: string, there: string) => `Sincronizar ${local} com ${there}`,
  syncedWithThis: (local: string) => `sincronizada com ${local}`,
  openFolder: "Abrir uma pasta",
  signOut: "Sair",
  gone: "A conexão com o servidor caiu; tentando de novo…",
  back: "Conectado ao servidor de novo.",
  goneSession: "O servidor encerrou a sessão deste computador: conecte de novo.",
  deviceLabel: "Nome deste aparelho",
  deviceDesc: "Aparece no nome das cópias de conflito e na lista de sessões de cada servidor. Vazio, vale o nome do sistema.",
  deviceSave: "Salvar nome",
  deviceSaved: "Salvo.",
  deviceToldAll: "Salvo; os servidores já mostram o nome novo.",
  deviceUnreached: (hosts: string[]) => `Salvo. ${hosts.join(", ")} não ${hosts.length === 1 ? "respondeu" : "responderam"} agora: lá, o nome antigo fica até você conectar de novo.`,
};
const en: typeof pt = {
  section: "Servers",
  connect: "Connect to a server",
  connectDesc: "A UniVerso — a Verso server — where you have an account. The browser opens its page for you to sign in, paste the code this app copies and allow this computer; no password is pasted here.",
  addressLabel: "Server address",
  addressPlaceholder: "https://notes.example",
  connectButton: "Connect",
  copied: "Code copied — paste it on the page that opened: ",
  notCopied: "Type this code on the page that opened: ",
  waiting: ". Waiting…",
  signedIn: (who: string) => `Connected as ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  as: (name: string, email: string) => `You sign in as ${name} · ${email}`,
  foldersOf: (host: string) => `Folders on ${host}`,
  loading: "Loading the folders…",
  noFolders: "No folder for you on this server yet. Ask whoever runs it for an invitation.",
  noFoldersMay: "No folder on this server yet.",
  syncThis: (local: string) => `Sync ‘${local}’`,
  syncThisNamed: (local: string, host: string) => `Sync ${local} with ${host}, in a new folder of the server`,
  syncThisNote: "Makes a new folder on this server, named like this one, and keeps it the same. If one has that name already, the new one gets “(2)”. Nothing is deleted.",
  syncedElsewhere: (folder, other) => `“${folder}” already syncs with ${other}. A folder syncs with one server at a time: to sync it with this one, turn that off first.`,
  openSync: "Open Sync",
  syncing: (host: string) => `Syncing with ${host}…`,
  syncOn: (local: string, host: string) => `${local} is now synced with ${host}.`,
  emptyFolder: "Make an empty folder…",
  emptyName: "New folder's name",
  emptyCreate: "Make",
  emptyCancel: "Cancel",
  emptyMade: (name: string) => `Folder ${name} made.`,
  noneYet: "No server yet. With a UniVerso, your folders are in the browser, on the phone and on other computers.",
  role: (r: string): string => (r === "owner" ? "owner" : r === "editor" ? "edits" : "reads only"),
  openHere: "Open here",
  openHereNamed: (name: string) => `Open ${name} in this window, online`,
  pair: (local: string): Said => [["Open here"], " swaps this window's folder for the server's, online. ", ["Sync"], " keeps ", [local], ", this computer's folder open now, the same as the server's."],
  sync: "Sync",
  syncNamed: (local: string, there: string) => `Sync ${local} with ${there}`,
  syncedWithThis: (local: string) => `synced with ${local}`,
  openFolder: "Open a folder",
  signOut: "Sign out",
  gone: "The connection to the server dropped; trying again…",
  back: "Connected to the server again.",
  goneSession: "The server ended this computer's session: connect again.",
  deviceLabel: "This device's name",
  deviceDesc: "It names the conflict copies and shows in each server's list of sessions. Empty, the system's name is used.",
  deviceSave: "Save name",
  deviceSaved: "Saved.",
  deviceToldAll: "Saved; the servers show the new name already.",
  deviceUnreached: (hosts: string[]) => `Saved. ${hosts.join(", ")} did not answer now: there, the old name stays until you connect again.`,
};

export function serverStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** The address a window's last folder is remembered under when it is a
 *  server's: reopened at the next start (main.ts). */
export function serverKey(url: string, folder: string): string {
  return `server:${url}#${folder}`;
}

/** Open the server's folder `folder` in this window; a failure said by
 *  `said` when given, in the status bar otherwise. */
export async function openServerFolder(url: string, folder: string, quiet = false, said: ((e: ContractError) => void) | null = null): Promise<boolean> {
  const opened = await openFolderBy(() => commands.serverOpen(url, folder), quiet, said);
  if (opened) {
    try {
      localStorage.setItem(LAST_FOLDER, serverKey(url, folder));
    } catch {
      // No storage: nothing remembered.
    }
  }
  return opened;
}

/** The folder a remembered key names, if it is a server's. */
export function parseServerKey(key: string): { url: string; folder: string } | null {
  if (!key.startsWith("server:")) return null;
  const rest = key.slice("server:".length);
  const at = rest.lastIndexOf("#");
  return at > 0 ? { url: rest.slice(0, at), folder: rest.slice(at + 1) } : null;
}

let heard = false;
/** The servers whose folder this window was refused (a share revoked or
 *  deleted): the connection's end that follows is not a drop to retry. */
const refusedAt = new Set<string>();

/** What the host says of a connection that ended — the web bridge says
 *  the same of its own (ADR 0084 item 10): in the status line, and as a
 *  notification. A share of the folder revoked is said as a revocation,
 *  never as "the connection dropped" (ADR 0084 item 7). */
export function hearServers(): void {
  if (heard) return;
  heard = true;
  addEventListener("verso:folder-shown", () => refusedAt.clear());
  void listen<ServerGone>("server-gone", (e) => {
    const s = serverStrings();
    const p = e.payload;
    // The person stopped their own server under the window at its table:
    // the seat says that, alone (localServerSeat.ts); no server ended a
    // session, nothing to connect again.
    if (p.what === "seat") return;
    // The game master closed the table: said as that, in the folder's place
    // (tableClosed.ts); the host tries again by itself.
    if (p.what === "closed") {
      ui.status.textContent = cp2.closedStatus;
      return;
    }
    if (p.what === "folder") {
      refusedAt.add(p.url);
      serverState()?.remove();
      const said = revokedSentence(p);
      ui.status.textContent = said;
      serverGoneHeard(p, said);
      return;
    }
    if (refusedAt.has(p.url)) return;
    // A try that found the server out of reach: said beside the status,
    // with a try now (the host tries again on its own, 5 s doubling to 5
    // min, reach.rs).
    if (p.what === "unreachable") {
      const message = p.address ?? addressOf(p.url);
      outOfReach(reachParts(message).address);
      serverGoneHeard(p, reachSentence(message));
      return;
    }
    serverState()?.remove();
    const said = p.what === "session" ? s.goneSession : s.gone;
    ui.status.textContent = said;
    serverGoneHeard(p, said);
  });
  void listen<ServerBack>("server-back", (e) => {
    serverState()?.remove();
    const said = serverStrings().back;
    ui.status.textContent = said;
    serverBackHeard(e.payload.url, said);
    // The notes being edited together join their rooms again (collab.ts).
    dispatchEvent(new Event("verso:reconnected"));
  });
}

function serverState(): HTMLElement | null {
  return document.getElementById("server-state");
}

/** The window's server out of reach, beside the status bar's text: which
 *  one, and "Tentar de novo", busy until the host says how that try went. */
function outOfReach(address: string): void {
  let box = serverState();
  if (!box) {
    box = h("span", "status-server");
    box.id = "server-state";
    const text = h("span", "status-server-text");
    text.setAttribute("role", "status");
    const again = h("button", "ghost status-server-retry", reachStrings().tryAgain);
    again.type = "button";
    again.addEventListener("click", () => {
      busy(again, true);
      void commands.serverRetry().then((r) => {
        if (r.status !== "ok") {
          busy(again, false);
          fail(r.error);
        }
      });
    });
    box.append(text, again);
    ui.status.after(box);
  }
  ui.status.textContent = "";
  const text = box.querySelector<HTMLElement>(".status-server-text");
  if (text) text.textContent = reachStrings().unreachableShort(address);
  const again = box.querySelector<HTMLButtonElement>("button");
  if (again) busy(again, false);
}

/** The section's body: connect, and each server signed in to — its
 *  account, its folders with the role in each and what can be done with
 *  them here: open one in this window, or sync this computer's folder with
 *  it (ADR 0079 item 1). */
export function serversBody(_item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement): HTMLElement {
  const s = serverStrings();
  const box = h("div", "servers");
  const list = h("div", "srv-list");
  const draw = async () => {
    const r = await commands.serverAccounts();
    if (r.status !== "ok") return fail(r.error);
    list.replaceChildren(...r.data.map((a) => serverBlock(a, draw)));
    if (r.data.length === 0) list.append(h("p", "srv-empty", s.noneYet));
    if (refocus) {
      const at = [...list.querySelectorAll<HTMLElement>("section.srv")].find((b) => b.dataset["url"] === refocus);
      const title = at?.querySelector<HTMLElement>(".srv-host");
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
      refocus = null;
    }
  };

  // Connect: an address, a button, and what to do in the browser.
  const form = h("form", "srv-connect");
  const label = h("label", "srv-label", s.addressLabel);
  const url = h("input");
  url.type = "url";
  url.id = "srv-address";
  url.required = true;
  url.placeholder = s.addressPlaceholder;
  url.setAttribute("autocomplete", "url");
  url.addEventListener("keydown", (e) => e.stopPropagation());
  label.htmlFor = url.id;
  const go = h("button", "btn primary", s.connectButton);
  go.type = "submit";
  const said = h("p", "srv-said");
  said.setAttribute("role", "status");
  const help = h("p", "srv-help", s.connectDesc);
  const field = h("div", "srv-field");
  // A failure said here, under the address (reach.ts).
  const failure = h("div", "srv-failure");
  failure.hidden = true;
  field.append(url, go);
  form.append(label, field, help, failure, said);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(go, true);
    said.textContent = "";
    // The clipboard is asked inside the click, the page opened after the
    // copy (serverSignIn.ts).
    void startSignIn(url.value, { signIn: commands.serverSignIn, open: commands.serverSignInPage, copy: copyWhenKnown }).then((r) => {
      busy(go, false);
      if (r.status !== "ok") return sayFailure(failure, r.error, () => form.requestSubmit(), errorSentence);
      clearFailure(failure);
      said.replaceChildren(r.copied ? s.copied : s.notCopied, h("strong", "srv-code", r.code), s.waiting);
    });
  });
  void listen<ServerAccount>("server-signed-in", (e) => {
    said.textContent = s.signedIn(s.account(e.payload));
    url.value = "";
    void draw();
  });

  // The servers announced on this network: a click fills the address the
  // row shows and goes on as typing it would (serversFound.ts, ADR 0097).
  const found = foundList(
    { start: commands.discoverServersStart, list: commands.discoverServersList, stop: commands.discoverServersStop },
    (f) => {
      url.value = f.url;
      form.requestSubmit();
    },
  );
  box.append(form, found, deviceForm(), list);
  void draw();
  return box;
}

/** This computer's name (ADR 0079 item 8, ADR 0074 item 8): the system's
 *  by default; the person's, when set, names the conflict copies and is
 *  told to the servers this computer is signed in to. */
function deviceForm(): HTMLElement {
  const s = serverStrings();
  const form = h("form", "srv-connect srv-device");
  const label = h("label", "srv-label", s.deviceLabel);
  const name = h("input");
  name.type = "text";
  name.id = "srv-device";
  name.maxLength = 60;
  name.setAttribute("autocomplete", "off");
  name.addEventListener("keydown", (e) => e.stopPropagation());
  label.htmlFor = name.id;
  const save = h("button", "btn", s.deviceSave);
  save.type = "submit";
  const said = h("p", "srv-said");
  said.setAttribute("role", "status");
  const help = h("p", "srv-help", s.deviceDesc);
  const field = h("div", "srv-field");
  field.append(name, save);
  form.append(label, field, help, said);
  void commands.deviceName().then((r) => {
    if (r.status !== "ok") return fail(r.error);
    name.placeholder = r.data.system;
    name.value = r.data.custom ? r.data.name : "";
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    save.disabled = true;
    void Promise.all([commands.setDeviceName(name.value), commands.serverAccounts()]).then(([r, accounts]) => {
      save.disabled = false;
      if (r.status !== "ok") return fail(r.error);
      name.value = r.data.device.custom ? r.data.device.name : "";
      const hosts = r.data.unreached.map((u) => u.replace(/^https?:\/\//, ""));
      const signedIn = accounts.status === "ok" && accounts.data.length > 0;
      said.textContent = hosts.length ? s.deviceUnreached(hosts) : signedIn ? s.deviceToldAll : s.deviceSaved;
    });
  });
  return form;
}

/** One server signed in to: who, its folders, sign out. */
function serverBlock(a: ServerAccount, redraw: () => Promise<void>): HTMLElement {
  const s = serverStrings();
  const block = h("section", "srv");
  const host = a.url.replace(/^https?:\/\//, "");
  const title = h("h3", "srv-host", host);
  title.id = `srv-${host.replace(/[^a-z0-9]/gi, "-")}`;
  block.setAttribute("aria-labelledby", title.id);
  const who = h("p", "srv-who", s.as(a.name, a.email));
  const out = h("button", "btn quiet", s.signOut);
  out.type = "button";
  out.addEventListener("click", () => void commands.serverSignOut(a.url).then(redraw));
  const head = h("header", "srv-head");
  const names = h("div", "");
  names.append(title, who);
  head.append(names, out);
  const folders = h("ul", "srv-folders");
  folders.setAttribute("aria-label", s.foldersOf(host));
  // What the two buttons of a row do, said once for all of them.
  const pair = pairable() ? h("p", "srv-pair") : null;
  if (pair) {
    pair.id = `${title.id}-pair`;
    pair.append(...s.pair(folderName).map((part) => (typeof part === "string" ? part : h("strong", "", part[0]))));
    folders.setAttribute("aria-describedby", pair.id);
  }
  const loading = h("li", "srv-empty", s.loading);
  // The list that did not come, said in its place, with a try again.
  const failure = h("div", "srv-failure");
  failure.hidden = true;
  folders.append(loading);
  // What the account may do beyond opening: sync the open folder into a new
  // folder of the server in one click, or make an empty one.
  const acts = h("div", "srv-actions");
  // A failure of these actions, said under them (reach.ts).
  const actFailure = h("div", "srv-failure");
  actFailure.hidden = true;
  const said = h("p", "srv-said");
  said.setAttribute("role", "status");
  const drawActions = (mayCreate: boolean): void => {
    acts.replaceChildren();
    if (!mayCreate) return;
    if (pairable()) {
      const send = h("button", "btn primary srv-send", s.syncThis(folderName));
      send.type = "button";
      send.setAttribute("aria-label", s.syncThisNamed(folderName, host));
      send.setAttribute("aria-describedby", `${title.id}-send-note`);
      const note = h("p", "srv-help", s.syncThisNote);
      note.id = `${title.id}-send-note`;
      const run = (): void => {
        said.textContent = s.syncing(host);
        void attempt(actFailure, () => commands.folderSyncStart(a.url, null, folderName), { button: send, other: errorSentence, retry: run }).then((r) => {
          said.textContent = "";
          if (r.status !== "ok") return;
          syncStarted(r.data);
          refocus = a.url;
          void redraw();
        });
      };
      send.addEventListener("click", run);
      acts.append(send, note);
    } else {
      // The open folder syncs with another server: say so where this one's
      // button would be, with the way there (the maintainer, 2026-10-16,
      // found the button missing and had to guess why).
      const sync = currentSync();
      if (currentFolder && sync?.on && sync.server && sync.server !== a.url) {
        const note = h("p", "srv-help", s.syncedElsewhere(folderName, addressOf(sync.server)));
        const go = h("button", "btn quiet", s.openSync);
        go.type = "button";
        go.addEventListener("click", () => openSettingsSection("sync"));
        acts.append(note, go);
      }
    }
    const empty = h("button", "btn quiet", s.emptyFolder);
    empty.type = "button";
    empty.addEventListener("click", () => {
      const form = h("form", "srv-empty-form");
      const label = h("label", "srv-label", s.emptyName);
      const name = h("input");
      name.type = "text";
      name.id = `${title.id}-empty-name`;
      name.autocomplete = "off";
      name.spellcheck = false;
      name.maxLength = 200;
      name.required = true;
      name.addEventListener("keydown", (e) => e.stopPropagation());
      label.htmlFor = name.id;
      const make = h("button", "btn", s.emptyCreate);
      make.type = "submit";
      const cancel = h("button", "btn quiet", s.emptyCancel);
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        form.remove();
        empty.hidden = false;
        empty.focus();
      });
      const field = h("div", "srv-field");
      field.append(name, make, cancel);
      form.append(label, field);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const wanted = name.value.trim();
        if (!wanted) return;
        void attempt(actFailure, () => commands.serverCreateFolder(a.url, wanted), { button: make, other: errorSentence, retry: () => form.requestSubmit() }).then((r) => {
          if (r.status !== "ok") return;
          said.textContent = s.emptyMade(r.data.name);
          load(r.data.id);
        });
      });
      empty.hidden = true;
      acts.append(form);
      name.focus();
    });
    acts.append(empty);
  };
  // `focusId`: the folder just made, whose row takes the focus.
  const load = (focusId: string | null = null): void =>
    void attempt(failure, () => commands.serverFolders(a.url), { other: errorSentence, retry: () => load(focusId) }).then((r) => {
      if (r.status !== "ok") {
        loading.replaceChildren(failure);
        return;
      }
      drawActions(r.data.may_create === true);
      if (r.data.folders.length === 0) {
        loading.textContent = r.data.may_create ? s.noFoldersMay : s.noFolders;
        folders.replaceChildren(loading);
        return;
      }
      // Mine, then shared with me (ADR 0081 item 5): a folder someone else
      // owns, or a folder inside one — synced, a share is a folder of this
      // computer of its own (item 6).
      const all = r.data.folders;
      const mine = all.filter((f) => !f.owner);
      const theirs = all.filter((f) => f.owner);
      const head = (text: string) => {
        const li = h("li", "srv-group", text);
        li.setAttribute("role", "presentation");
        return li;
      };
      folders.replaceChildren(
        ...(mine.length && theirs.length ? [head(sh.mine)] : []),
        ...mine.map((f) => folderRow(a, f)),
        ...(theirs.length ? [head(sh.sharedWithMe)] : []),
        ...theirs.map((f) => folderRow(a, f)),
      );
      if (focusId) folders.querySelector<HTMLElement>(`[data-folder="${CSS.escape(focusId)}"] button`)?.focus();
    });
  load();
  block.dataset["url"] = a.url;
  block.append(head, ...(pair ? [pair] : []), folders, acts, actFailure, said);
  return block;
}

/** The server whose block takes the focus when the list is drawn again
 *  (after "Sincronizar", the button that was pressed is gone). */
let refocus: string | null = null;

/** A folder of this computer open, not syncing: it may sync with one of
 *  a server's. */
function pairable(): boolean {
  return Boolean(currentFolder && can("local_folders") && !currentSync()?.on);
}

function folderRow(a: ServerAccount, f: ServerFolder): HTMLElement {
  const s = serverStrings();
  const li = h("li", "srv-folder");
  li.dataset["folder"] = f.id;
  const name = h("span", "srv-folder-name", f.name);
  const role = h("span", "srv-role", f.owner ? `${s.role(f.role)} · ${sh.ownerIs(f.owner)}${f.missing ? ` · ${sh.gone}` : ""}` : s.role(f.role));
  role.dataset["role"] = f.role;
  const text = h("div", "srv-folder-text");
  text.append(name, role);
  const sync = currentSync();
  const synced = sync?.on && sync.server === a.url && sync.folder === f.id;
  if (synced) text.append(h("span", "srv-note", s.syncedWithThis(folderName)));
  const actions = h("div", "srv-folder-actions");
  const open = h("button", "btn", s.openHere);
  open.type = "button";
  open.setAttribute("aria-label", s.openHereNamed(f.name));
  // A failure said under the row (reach.ts).
  const failure = h("div", "srv-failure");
  failure.hidden = true;
  const openIt = (): void => {
    busy(open, true);
    void openServerFolder(a.url, f.id, false, (e) => sayFailure(failure, e, openIt, errorSentence)).then((done) => {
      busy(open, false);
      if (done) clearFailure(failure);
    });
  };
  open.addEventListener("click", openIt);
  actions.append(open);
  if (pairable()) {
    const pair = h("button", "btn quiet", s.sync);
    pair.type = "button";
    pair.setAttribute("aria-label", s.syncNamed(folderName, f.name));
    pair.addEventListener("click", () => {
      preselectSync(a.url, f.id);
      openSettingsSection("sync");
    });
    actions.append(pair);
  }
  li.append(text, actions, failure);
  return li;
}
