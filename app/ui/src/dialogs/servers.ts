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
import { LAST_FOLDER } from "../folder";
import { openFolderBy } from "../open";

const pt = {
  section: "Servidores",
  connect: "Conectar a um servidor",
  connectDesc: "O endereço de um servidor Verso (https://…). O navegador abre a página do servidor para você permitir este computador.",
  connectButton: "Conectar",
  waiting: (code: string) => `No navegador, confira o código ${code} e permita. Esperando…`,
  signedIn: (who: string) => `Conectado como ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  openFolder: "Abrir uma pasta",
  noFolders: "Nenhuma pasta deste servidor para você.",
  signOut: "Sair",
  gone: "A conexão com o servidor terminou; a pasta não está mais aberta nesta janela.",
  goneSession: "O servidor encerrou a sessão deste computador: conecte de novo.",
};
const en: typeof pt = {
  section: "Servers",
  connect: "Connect to a server",
  connectDesc: "A Verso server's address (https://…). The browser opens the server's page for you to allow this computer.",
  connectButton: "Connect",
  waiting: (code: string) => `In the browser, check the code ${code} and allow it. Waiting…`,
  signedIn: (who: string) => `Connected as ${who}.`,
  account: (a: ServerAccount) => `${a.name} <${a.email}>`,
  openFolder: "Open a folder",
  noFolders: "No folder of this server for you.",
  signOut: "Sign out",
  gone: "The connection to the server ended; its folder is no longer open in this window.",
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
}

/** The section's body: connect, and each server signed in to. */
export function serversBody(item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement): HTMLElement {
  const s = serverStrings();
  const box = h("div", "servers");
  const list = h("div", "servers-list");
  const said = h("p", "setting-desc");
  said.setAttribute("role", "status");
  const draw = async () => {
    const r = await commands.serverAccounts();
    list.replaceChildren();
    if (r.status !== "ok") return fail(r.error);
    for (const a of r.data) list.append(accountRow(a, item, draw));
  };
  const url = h("input");
  url.type = "url";
  url.placeholder = "https://notas.exemplo";
  url.addEventListener("keydown", (e) => e.stopPropagation());
  const go = h("button", "", s.connectButton);
  go.type = "button";
  go.addEventListener("click", () => {
    void commands.serverSignIn(url.value).then((r) => {
      if (r.status !== "ok") return fail(r.error);
      said.textContent = s.waiting(r.data.code);
    });
  });
  void listen<ServerAccount>("server-signed-in", (e) => {
    said.textContent = s.signedIn(s.account(e.payload));
    void draw();
  });
  const control = h("div", "servers-connect");
  control.append(url, go);
  box.append(item(s.connect, s.connectDesc, control), said, list);
  void draw();
  return box;
}

function accountRow(
  a: ServerAccount,
  item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement,
  redraw: () => Promise<void>,
): HTMLElement {
  const s = serverStrings();
  const actions = h("div", "servers-actions");
  const pick = h("select");
  pick.setAttribute("aria-label", s.openFolder);
  const first = h("option", "", s.openFolder);
  first.value = "";
  pick.append(first);
  void commands.serverFolders(a.url).then((r) => {
    if (r.status !== "ok") return;
    if (r.data.length === 0) first.textContent = s.noFolders;
    for (const f of r.data as ServerFolder[]) {
      const o = h("option", "", `${f.name} · ${f.role}`);
      o.value = f.id;
      pick.append(o);
    }
  });
  pick.addEventListener("change", () => {
    if (pick.value) void openServerFolder(a.url, pick.value);
  });
  const out = h("button", "", s.signOut);
  out.type = "button";
  out.addEventListener("click", () => void commands.serverSignOut(a.url).then(redraw));
  actions.append(pick, out);
  return item(s.account(a), a.url, actions);
}
