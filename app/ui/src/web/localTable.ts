// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The browser's pages of a game master's computer that serves (ADR 0117
// D3 items 2 and 6): a player signs in there, beside the pairing of the
// owner's phones — on the network both, through the internet link the
// sign-in alone (`/api/state`'s `pairing`); and when the table goes away
// under an open window (the computer stopped, slept, or the link ended)
// the page says the table is offline, in the player's language, and
// offers to try again. Nothing else changes for players: it is the
// UniVerso's window.

import { listen } from "@tauri-apps/api/event";
import { el } from "./form";

const pt = {
  invited: "Recebeu um convite para uma mesa? Abra primeiro o link do convite: lá você cria sua conta, com um e-mail qualquer seu (nada é enviado). Depois, entre aqui com o e-mail e a senha.",
  ownPhone: "É o celular de quem serve as notas?",
  pairInstead: "Parear este celular com um código",
  passwordHere: "Nesta rede, entre com a senha: passkeys só pelo link da internet de quem mestra.",
  offlineTitle: "A mesa está offline",
  offlineBody: "O computador de quem mestra não responde: pode ter desligado, dormido, ou o link da mesa acabou — um link rápido muda a cada vez que é ligado. Se recebeu um link novo, abra-o.",
  retry: "Tentar de novo",
  close: "Fechar",
  trying: "Tentando…",
  still: "Ainda offline. O Verso tenta de novo sozinho a cada 30 segundos.",
  back: "A mesa voltou. Abrindo…",
};
const en: typeof pt = {
  invited: "Got an invitation to a table? Open the invitation's link first: there you make your account, with any e-mail of yours (nothing is sent). Then sign in here with the e-mail and the password.",
  ownPhone: "Is this the phone of the person serving the notes?",
  pairInstead: "Pair this phone with a code",
  passwordHere: "On this network, sign in with the password: passkeys only through the game master's internet link.",
  offlineTitle: "The table is offline",
  offlineBody: "The game master's computer does not answer: it may have been turned off, gone to sleep, or the table's link ended — a quick link changes each time it is turned on. If you got a new link, open it.",
  retry: "Try again",
  close: "Close",
  trying: "Trying…",
  still: "Still offline. Verso tries again by itself every 30 seconds.",
  back: "The table is back. Opening…",
};

/** The words in the browser's language (no account yet to say one). */
export function tableWords(): typeof pt {
  const lang = document.documentElement.lang || navigator.language || "en";
  return lang.toLowerCase().startsWith("pt") ? pt : en;
}

/** Under the sign-in form of a computer that serves: how an invited
 *  player gets an account; where this door offers no passkey (the
 *  network's), that the password is the way; and — only where this door
 *  pairs — the owner's phone's way in. */
export function localSignInNotes(pairing: boolean, passkeys = true): void {
  const s = tableWords();
  const card = document.querySelector(".web-card");
  if (!card) return;
  card.append(el("p", { class: "web-note" }, s.invited));
  if (!passkeys) card.append(el("p", { class: "web-note" }, s.passwordHere));
  if (pairing) card.append(el("p", { class: "web-note" }, `${s.ownPhone} `, el("a", { href: "/pair" }, s.pairInstead)));
}

/** Whether this computer's server answers now. */
export async function answers(get: typeof fetch = fetch): Promise<boolean> {
  try {
    const r = await get("/api/state", { cache: "no-store", credentials: "same-origin" });
    // Cloudflare answers for a link that ended, with its own page.
    return r.ok && (r.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

const RETRY_MS = 30_000;

let shown: HTMLElement | null = null;

/** The offline page over the window: Try again (and every 30 s by
 *  itself), and Close for a person who goes on with what the browser
 *  kept. When the server answers again, the page loads anew. */
export function showOffline(get: typeof fetch = fetch, reload: () => void = () => location.reload()): HTMLElement {
  if (shown) return shown;
  const s = tableWords();
  const before = document.activeElement as HTMLElement | null;
  const live = el("p", { class: "web-lead", role: "status", "aria-live": "polite" });
  const retry = el("button", { type: "button", class: "web-primary" }, s.retry);
  const close = el("button", { type: "button", class: "web-secondary" }, s.close);
  const box = el(
    "div",
    { class: "web-offline", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "web-offline-title", "aria-describedby": "web-offline-body" },
    el(
      "div",
      { class: "web-card" },
      el("h1", { class: "web-title", id: "web-offline-title" }, s.offlineTitle),
      el("p", { class: "web-lead", id: "web-offline-body" }, s.offlineBody),
      live,
      el("div", { class: "web-offline-acts" }, retry, close),
    ),
  );
  let timer = 0;
  const end = () => {
    window.clearInterval(timer);
    box.remove();
    shown = null;
    before?.focus?.();
  };
  const tryNow = async () => {
    retry.disabled = true;
    live.textContent = s.trying;
    const up = await answers(get);
    retry.disabled = false;
    if (up) {
      live.textContent = s.back;
      window.clearInterval(timer);
      reload();
      return;
    }
    live.textContent = s.still;
  };
  retry.addEventListener("click", () => void tryNow());
  close.addEventListener("click", end);
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") end();
  });
  timer = window.setInterval(() => void tryNow(), RETRY_MS);
  document.body.append(box);
  shown = box;
  retry.focus();
  return box;
}

let watching = false;

/** In "this app is a server", once the window runs: a dropped connection
 *  whose server does not answer is the table offline. */
export function watchTableOffline(): void {
  if (watching) return;
  watching = true;
  void listen<{ what: string }>("server-gone", (e) => {
    if (e.payload.what !== "connection") return;
    void answers().then((up) => {
      if (!up) showOffline();
    });
  });
}
