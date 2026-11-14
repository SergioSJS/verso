// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Serving a folder from its page (ADR 0117 D2, R4; decided 2026-11-13):
//  - a folder of this computer that this app does not serve offers *Serve
//    from this computer* on its page and in the tree's menu; with the
//    server off the click asks *Turn the server on and serve this folder?*
//    and does both in one step;
//  - a folder served, or the window sitting at its table, offers *Stop
//    serving*, which says first how many players lose access until it is
//    served again (the table, its chat and rolls are kept: the folder
//    rests on the server);
//  - the owner's table card copies the table's link: the internet link's
//    route (`/?folder=<id>`, D6) when the link is on, else the network's
//    address, said to work only on this network.
// What is served changes while serving (`verso_server::local::live`): no
// player at another table is cut. Apart from the seat's module, whose
// import reorders the bundle (seatState.ts says why): the seat hears the
// host's `local-server` event and sits or leaves by itself.

import { commands, type ContractError, type LocalServerStatus } from "./bindings";
import { can } from "./can";
import { campaign } from "./campaign";
import { ask } from "./dialog";
import type { MenuItem } from "./menu";
import { h, ui } from "./dom";
import { currentFolder, folderName } from "./folder";
import { icon } from "./icons";
import { tableRoute } from "./linksBase";
import { isSeated, seatedFrom, servedHere } from "./seatState";
import { shareIdAt } from "./shares";

const pt = {
  title: "Servidor",
  why: "Sirva esta pasta deste computador para fazer mesas, compartilhar e convidar jogadores.",
  serve: "Servir deste computador",
  turnOn: (name: string) => `O servidor deste computador está desligado. Ligar o servidor e servir “${name}”?`,
  turnOnYes: "Ligar e servir",
  cancel: "Cancelar",
  served: (name: string) => `“${name}” é servida deste computador.`,
  stop: "Parar de servir",
  stopAsk: (name: string, n: number) =>
    `${n === 0 ? `Parar de servir “${name}”?` : `Parar de servir “${name}”? ${n === 1 ? "1 jogador perde" : `${n} jogadores perdem`} acesso até você servir de novo.`} A mesa, o chat e as rolagens ficam guardados.`,
  stopYes: "Parar de servir",
  stopped: (name: string) => `“${name}” não é mais servida. Sirva de novo para os jogadores voltarem.`,
  received: "Esta pasta foi compartilhada com você: só quem é dona dela pode servi-la.",
  failed: (why: string) => `Não foi possível: ${why}`,
  copyLink: "Copiar link da mesa",
  copied: "Link da mesa copiado.",
  copiedLan: "Link copiado. Ele só abre nesta rede: ligue o link pela internet em Ajustes › Transformar em servidor para jogadores de fora.",
  noLink: "Ainda não há endereço: ligue a rede ou o link pela internet em Ajustes › Transformar em servidor.",
};
const en: typeof pt = {
  title: "Server",
  why: "Serve this folder from this computer to make tables, share and invite players.",
  serve: "Serve from this computer",
  turnOn: (name) => `This computer's server is off. Turn the server on and serve “${name}”?`,
  turnOnYes: "Turn on and serve",
  cancel: "Cancel",
  served: (name) => `“${name}” is served from this computer.`,
  stop: "Stop serving",
  stopAsk: (name, n) =>
    `${n === 0 ? `Stop serving “${name}”?` : `Stop serving “${name}”? ${n === 1 ? "1 player loses" : `${n} players lose`} access until you serve it again.`} The table, its chat and rolls are kept.`,
  stopYes: "Stop serving",
  stopped: (name) => `“${name}” is no longer served. Serve it again for the players to come back.`,
  received: "This folder was shared with you: only its owner can serve it.",
  failed: (why) => `Could not: ${why}`,
  copyLink: "Copy the table's link",
  copied: "The table's link was copied.",
  copiedLan: "Link copied. It opens only on this network: turn the internet link on in Settings › Turn into a server for players elsewhere.",
  noLink: "No address yet: turn the network or the internet link on in Settings › Turn into a server.",
};
export const serveWords = (): typeof pt => (document.documentElement.lang.startsWith("pt") ? pt : en);

function say(text: string): void {
  ui.status.textContent = text;
}

function why(e: ContractError): string {
  return e.message || String(e.kind);
}

/** This computer's folder behind the window: the one it sat from, or the
 *  one it shows. */
function localKey(): string {
  return seatedFrom() ?? currentFolder;
}

/** Serve the window's folder from this computer; with the server off, ask
 *  first and turn it on in the same step. True when it is served. */
export async function serveHere(): Promise<boolean> {
  const w = serveWords();
  const key = localKey();
  const name = folderName;
  const [s, f] = await Promise.all([commands.localServerStatus(), commands.localServerFolders()]);
  if (s.status !== "ok") return say(w.failed(why(s.error))), false;
  if (f.status !== "ok") return say(w.failed(why(f.error))), false;
  const row = f.data.find((x) => x.key === key);
  if (row?.received_from) return say(w.received), false;
  const serving = s.data.serving;
  if (!serving && !(await ask(w.turnOn(name), { yes: w.turnOnYes, no: w.cancel }))) return false;
  const t = await commands.localServerTick(key, true);
  if (t.status !== "ok") return say(w.failed(why(t.error))), false;
  if (!serving) {
    const on = await commands.localServerStart();
    if (on.status !== "ok") {
      // Nothing half done: the folder is unticked again.
      if (!row?.ticked) await commands.localServerTick(key, false);
      return say(w.failed(why(on.error))), false;
    }
  }
  say(w.served(name));
  dispatchEvent(new Event("verso:campaign-status"));
  return true;
}

/** Stop serving the window's folder, after saying who loses access. The
 *  server keeps serving the other folders; with none left, it stops. */
export async function stopServingHere(): Promise<boolean> {
  const w = serveWords();
  const key = localKey();
  const name = folderName;
  const players = isSeated() ? campaign().players.length : 0;
  if (!(await ask(w.stopAsk(name, players), { yes: w.stopYes, no: w.cancel }))) return false;
  const t = await commands.localServerTick(key, false);
  if (t.status !== "ok") return say(w.failed(why(t.error))), false;
  if (!t.data.some((x) => x.ticked)) await commands.localServerStop();
  say(w.stopped(name));
  dispatchEvent(new Event("verso:campaign-status"));
  return true;
}

/** Whether the window shows (or sits at) a folder this app serves. */
export function servedFromHere(): boolean {
  return isSeated() || servedHere();
}

function button(label: string, primary: boolean): HTMLButtonElement {
  const b = h("button", primary ? "btn primary" : "btn", label);
  b.type = "button";
  return b;
}

/** The strip on the page of a folder of this computer not served yet. */
export function serveCard(): HTMLElement {
  const w = serveWords();
  const box = h("section", "table-card table-card-serve");
  box.setAttribute("aria-label", w.title);
  const line = h("div", "table-strip");
  const b = button(w.serve, true);
  b.prepend(icon("globe"));
  b.addEventListener("click", () => void serveHere());
  const actions = h("span", "table-strip-actions");
  actions.append(b);
  line.append(h("span", "table-strip-title", w.title), h("span", "table-strip-meta", w.why), actions);
  box.append(line);
  return box;
}

/** *Stop serving*, beside the owner's actions of a served folder's root. */
export function stopServingButton(): HTMLButtonElement {
  const b = button(serveWords().stop, false);
  b.classList.add("table-strip-stop");
  b.addEventListener("click", () => void stopServingHere());
  return b;
}

/** The link of the table at `root`, by this computer's server: the
 *  folder's id for the whole folder, the share's for a table inside it. */
function tableLink(s: LocalServerStatus, folder: string, root: string): { link: string; lan: boolean } | null {
  const id = root === "" ? folder : shareIdAt(root);
  return id ? tableRoute(s, id) : null;
}

/** *Copy the table's link*, for the owner's card of a table this computer
 *  hosts. */
export function copyLinkButton(root: string): HTMLButtonElement {
  const w = serveWords();
  const b = button(w.copyLink, false);
  b.prepend(icon("link"));
  b.addEventListener("click", () => {
    void (async () => {
      const [s, win] = await Promise.all([commands.localServerStatus(), commands.windowServer()]);
      const at = s.status === "ok" && win.status === "ok" && win.data ? tableLink(s.data, win.data.folder, root) : null;
      if (!at) return say(w.noLink);
      await navigator.clipboard.writeText(at.link);
      say(at.lan ? w.copiedLan : w.copied);
    })();
  });
  return b;
}

/** The tree's rows (ADR 0117 D2 item 1: the card and the tree's menu
 *  both): *Serve from this computer* on a folder of this computer not
 *  served, and, on the root's menu, *Stop serving* on one served. A folder
 *  received from another account is told why at the click. */
export function serveMenuItems(root: boolean): MenuItem[] {
  const w = serveWords();
  if (servedFromHere()) return root ? [[w.stop, () => void stopServingHere(), "close"]] : [];
  if (!can("local_folders")) return [];
  return [[w.serve, () => void serveHere(), "globe"]];
}
