// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The desktop app connected to a server (ADR 0073 item 2; the maintainer's
// answer K of 2026-10-09): the settings' "Servers" section signs in
// through the browser — the server's page approves this device, nobody
// pastes a token (ADR 0074 item 8) — lists the servers signed in to, opens
// one of their folders in this window, and signs out.

import { listen } from "@tauri-apps/api/event";
import { commands, type ServerAccount, type ServerFolder } from "../bindings";
import { h, ui } from "../dom";
import { fail } from "../errors";
import { can } from "../can";
import { currentFolder, folderName, LAST_FOLDER } from "../folder";
import { currentSync, openSettingsSection, preselectSync } from "./sync";
import { openFolderBy } from "../open";

const pt = {
  section: "Servidores",
  connect: "Conectar a um servidor",
  connectDesc: "Um Universo — um servidor Verso — onde você tem conta. O navegador abre a página dele para você entrar e permitir este computador; ninguém cola senha aqui.",
  addressLabel: "Endereço do servidor",
  connectButton: "Conectar",
  waitingBefore: "No navegador, confira o código ",
  waitingAfter: " e permita. Esperando…",
  signedIn: (who: string) => `Conectado como ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  as: (name: string, email: string) => `Você entra como ${name} · ${email}`,
  foldersOf: (host: string) => `Pastas em ${host}`,
  loading: "Carregando as pastas…",
  unreachable: "O servidor não respondeu agora; as pastas aparecem quando ele voltar.",
  noFolders: "Nenhuma pasta para você neste servidor ainda. Peça um convite a quem o administra.",
  noneYet: "Nenhum servidor ainda. Com um Universo, suas pastas ficam no navegador, no celular e em outros computadores.",
  role: (r: string): string => (r === "owner" ? "dona" : r === "editor" ? "edita" : "só lê"),
  openHere: "Abrir aqui",
  openHereNamed: (name: string) => `Abrir ${name} nesta janela, online`,
  syncWithThis: (local: string) => `Sincronizar com ${local}`,
  syncedWithThis: (local: string) => `sincronizada com ${local}`,
  openFolder: "Abrir uma pasta",
  signOut: "Sair",
  gone: "A conexão com o servidor caiu; tentando de novo…",
  back: "Conectado ao servidor de novo.",
  goneSession: "O servidor encerrou a sessão deste computador: conecte de novo.",
};
const en: typeof pt = {
  section: "Servers",
  connect: "Connect to a server",
  connectDesc: "A Universo — a Verso server — where you have an account. The browser opens its page for you to sign in and allow this computer; no password is pasted here.",
  addressLabel: "Server address",
  connectButton: "Connect",
  waitingBefore: "In the browser, check the code ",
  waitingAfter: " and allow it. Waiting…",
  signedIn: (who: string) => `Connected as ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  as: (name: string, email: string) => `You sign in as ${name} · ${email}`,
  foldersOf: (host: string) => `Folders on ${host}`,
  loading: "Loading the folders…",
  unreachable: "The server did not answer now; its folders show when it is back.",
  noFolders: "No folder for you on this server yet. Ask whoever runs it for an invitation.",
  noneYet: "No server yet. With a Universo, your folders are in the browser, on the phone and on other computers.",
  role: (r: string): string => (r === "owner" ? "owner" : r === "editor" ? "edits" : "reads only"),
  openHere: "Open here",
  openHereNamed: (name: string) => `Open ${name} in this window, online`,
  syncWithThis: (local: string) => `Sync with ${local}`,
  syncedWithThis: (local: string) => `synced with ${local}`,
  openFolder: "Open a folder",
  signOut: "Sign out",
  gone: "The connection to the server dropped; trying again…",
  back: "Connected to the server again.",
  goneSession: "The server ended this computer's session: connect again.",
};

export function serverStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** The address a window's last folder is remembered under when it is a
 *  server's: reopened at the next start (main.ts). */
export function serverKey(url: string, folder: string): string {
  return `server:${url}#${folder}`;
}

/** Open the server's folder `folder` in this window. */
export async function openServerFolder(url: string, folder: string, quiet = false): Promise<boolean> {
  const opened = await openFolderBy(() => commands.serverOpen(url, folder), quiet);
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

/** What the host says of a connection that ended. */
export function hearServers(): void {
  if (heard) return;
  heard = true;
  void listen<{ url: string; what: string }>("server-gone", (e) => {
    const s = serverStrings();
    ui.status.textContent = e.payload.what === "session" ? s.goneSession : s.gone;
  });
  void listen<{ url: string }>("server-back", () => {
    ui.status.textContent = serverStrings().back;
    // The notes being edited together join their rooms again (collab.ts).
    dispatchEvent(new Event("verso:reconnected"));
  });
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
  };

  // Connect: an address, a button, and what to do in the browser.
  const form = h("form", "srv-connect");
  const label = h("label", "srv-label", s.addressLabel);
  const url = h("input");
  url.type = "url";
  url.id = "srv-address";
  url.required = true;
  url.placeholder = "https://notas.exemplo";
  url.setAttribute("autocomplete", "url");
  url.addEventListener("keydown", (e) => e.stopPropagation());
  label.htmlFor = url.id;
  const go = h("button", "btn primary", s.connectButton);
  go.type = "submit";
  const said = h("p", "srv-said");
  said.setAttribute("role", "status");
  const help = h("p", "srv-help", s.connectDesc);
  const field = h("div", "srv-field");
  field.append(url, go);
  form.append(label, field, help, said);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    go.disabled = true;
    void commands.serverSignIn(url.value).then((r) => {
      go.disabled = false;
      if (r.status !== "ok") return fail(r.error);
      said.replaceChildren(s.waitingBefore, h("strong", "srv-code", r.data.code), s.waitingAfter);
    });
  });
  void listen<ServerAccount>("server-signed-in", (e) => {
    said.textContent = s.signedIn(s.account(e.payload));
    url.value = "";
    void draw();
  });

  box.append(form, list);
  void draw();
  return box;
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
  const loading = h("li", "srv-empty", s.loading);
  folders.append(loading);
  void commands.serverFolders(a.url).then((r) => {
    if (r.status !== "ok") {
      loading.textContent = s.unreachable;
      return;
    }
    if (r.data.length === 0) {
      loading.textContent = s.noFolders;
      return;
    }
    folders.replaceChildren(...(r.data as ServerFolder[]).map((f) => folderRow(a, f)));
  });
  block.append(head, folders);
  return block;
}

function folderRow(a: ServerAccount, f: ServerFolder): HTMLElement {
  const s = serverStrings();
  const li = h("li", "srv-folder");
  const name = h("span", "srv-folder-name", f.name);
  const role = h("span", "srv-role", s.role(f.role));
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
  open.addEventListener("click", () => void openServerFolder(a.url, f.id));
  actions.append(open);
  // A folder of this computer open, not syncing: it may sync with this one.
  if (currentFolder && can("local_folders") && !sync?.on) {
    const pair = h("button", "btn quiet", s.syncWithThis(folderName));
    pair.type = "button";
    pair.addEventListener("click", () => {
      preselectSync(a.url, f.id);
      openSettingsSection("sync");
    });
    actions.append(pair);
  }
  li.append(text, actions);
  return li;
}
