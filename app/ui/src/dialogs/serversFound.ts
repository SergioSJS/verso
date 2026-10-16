// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Encontrados nesta rede" (ADR 0097; the maintainer, 2026-10-16: "É só
// instalar e o negócio já funciona"): while Settings › Servers is open the
// desktop app browses the home network for UniVerso servers and lists what
// answered. A click fills the address the row shows and goes on to sign-in
// as typing it would; nothing connects, and no credential goes anywhere,
// because of an announcement alone — it is unauthenticated, anyone on the
// network can make one, so the address is shown before it is used. The
// browse ends when the section closes. Typing an address stays possible.
//
// Without the page but `document`, so the unit tests reach it
// (test/serversFound.test.mjs).

import type { ContractError, FoundServer } from "../bindings";

/** An element with a class and text: `dom.ts` asks the page for its
 *  elements at load, which a module the tests reach must not. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

type Answer<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** What the host offers for browsing: the three commands. */
export interface Finder {
  start(): Promise<Answer<null>>;
  list(): Promise<Answer<FoundServer[]>>;
  stop(): Promise<unknown>;
}

const pt = {
  heading: "Encontrados nesta rede",
  searching: "Procurando um UniVerso nesta rede…",
  none: "Nenhum UniVerso respondeu ainda. Um servidor só aparece aqui se estiver ligado e na mesma rede; no Docker, precisa de rede em modo host. Você também pode digitar o endereço.",
  unavailable: "Não foi possível procurar nesta rede. Digite o endereço do servidor.",
  warning: "Qualquer aparelho da rede pode se anunciar. Confira o endereço antes de conectar.",
  connect: "Conectar",
  needsUrl: "Este servidor fala HTTPS e não anunciou o endereço do nome dele. No servidor, defina VERSO_PUBLIC_URL (e reinicie) para poder conectar daqui.",
  connectTo: (name: string, url: string) => `Conectar a ${name} em ${url}`,
  plain: "sem HTTPS",
  secure: "HTTPS",
  version: (v: string) => `versão ${v}`,
  count: (n: number) => (n === 1 ? "1 servidor encontrado." : `${n} servidores encontrados.`),
};
const en: typeof pt = {
  heading: "Found on this network",
  searching: "Looking for a UniVerso on this network…",
  none: "No UniVerso has answered yet. A server shows up here only when it is running on the same network; in Docker it needs host networking. You can also type the address.",
  unavailable: "Could not search this network. Type the server's address.",
  warning: "Any device on the network can announce itself. Check the address before you connect.",
  connect: "Connect",
  needsUrl: "This server speaks HTTPS and did not announce its name's address. On the server, set VERSO_PUBLIC_URL (and restart) to connect from here.",
  connectTo: (name: string, url: string) => `Connect to ${name} at ${url}`,
  plain: "no HTTPS",
  secure: "HTTPS",
  version: (v: string) => `version ${v}`,
  count: (n: number) => (n === 1 ? "1 server found." : `${n} servers found.`),
};

export function foundStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** The browse that is current: a list closing after another opened must
 *  not stop the new one's browse. */
let current = 0;

/** One announcement as a row: its name, the address a click will use, and
 *  whether the connection is encrypted. */
export function foundRow(f: FoundServer, pick: (f: FoundServer) => void): HTMLElement {
  const s = foundStrings();
  const li = h("li", "srv-found-row");
  const text = h("div", "srv-found-text");
  const name = h("strong", "srv-found-name", f.name);
  const url = f.needs_public_url ? h("span", "srv-found-url", s.needsUrl) : h("code", "srv-found-url", f.url);
  const how = h("span", "srv-found-how", f.https ? s.secure : s.plain);
  how.dataset["https"] = f.https ? "1" : "0";
  text.append(name, url, how);
  if (f.version) text.append(h("span", "srv-found-version", s.version(f.version)));
  if (f.needs_public_url) {
    li.append(text);
    return li;
  }
  const go = h("button", "btn", s.connect);
  go.type = "button";
  go.setAttribute("aria-label", s.connectTo(f.name, f.url));
  go.addEventListener("click", () => pick(f));
  li.append(text, go);
  return li;
}

/** The list: browsing starts now and ends when the list is no longer on
 *  the screen (removed, or inside something hidden). `every` is the poll's
 *  period in ms. */
export function foundList(finder: Finder, pick: (f: FoundServer) => void, every = 2000): HTMLElement {
  const s = foundStrings();
  const box = h("section", "srv-found");
  const title = h("h3", "srv-found-title", s.heading);
  title.id = "srv-found-title";
  box.setAttribute("aria-labelledby", title.id);
  const live = h("p", "srv-help srv-found-state", s.searching);
  live.setAttribute("role", "status");
  const rows = h("ul", "srv-found-rows");
  rows.setAttribute("aria-label", s.heading);
  box.append(title, live, rows, h("p", "srv-help srv-found-warning", s.warning));

  const me = ++current;
  let timer = 0;
  let seen = false;
  let waits = 0;
  let said = "";
  let unavailable = false;
  const onScreen = () => box.isConnected && box.closest("[hidden]") === null;
  const end = () => {
    window.clearInterval(timer);
    if (me === current) void finder.stop();
  };
  const tick = async () => {
    if (onScreen()) seen = true;
    else if (seen || ++waits > 20) return end();
    const r = await finder.list();
    if (unavailable || r.status !== "ok" || !box.isConnected) return;
    const sentence = r.data.length === 0 ? s.none : s.count(r.data.length);
    // Said again only when it changed: a screen reader is not interrupted
    // by the same sentence every two seconds.
    if (sentence !== said) {
      live.textContent = sentence;
      said = sentence;
    }
    rows.replaceChildren(...r.data.map((f) => foundRow(f, pick)));
  };
  void finder.start().then((r) => {
    if (r.status === "ok") return;
    unavailable = true;
    window.clearInterval(timer);
    live.textContent = s.unavailable;
  });
  timer = window.setInterval(() => void tick(), every);
  window.setTimeout(() => void tick(), Math.min(300, every));
  return box;
}
