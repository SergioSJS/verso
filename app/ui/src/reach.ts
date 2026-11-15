// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A failure said where the person acted (the maintainer, 2026-10-14,
// clicking "Sincronizar esta pasta" with the server down: nothing on the
// screen, two ERROR lines in the log per click). Every place the window
// talks to a server — Settings › Sync and Servers, the folder switcher —
// says a failure beside the button or the list it came from: what went
// wrong in the person's language, and a button to try again. A server
// that could not be reached (the contract's `unreachable`, whose message
// is the server's address) is said as such; anything else in the
// window's sentence for its kind. While a try runs, its button is
// disabled and busy.
//
// A module without the page — only `document` — so the unit tests reach
// it (test/reach.test.mjs).

import type { ContractError } from "./bindings";
import { REACH, errorParts, toConsole } from "./errorKinds";

const pt = {
  unreachable: (address: string) => `Não foi possível alcançar o servidor ${address} — ele está fora do ar ou sem rede.`,
  unreachableShort: (address: string) => `Servidor fora de alcance: ${address}`,
  tryAgain: "Tentar de novo",
  // A name that resolved to addresses where nothing answered (ADR 0097):
  // which, so a bad DNS reads as one.
  tried: (name: string, ip: string) => `${name} → ${ip}: sem resposta`,
  dnsHint: "Confira o DNS desta rede: o nome pode estar apontando para o endereço errado.",
  // A computer at home paired with this app (ADR 0117, "The Verso app
  // paired"): named for what it is, never by the name the app gives it.
  home: "o computador de casa",
  homeUnreachable: "O computador de casa não respondeu: ele está desligado, não está servindo, ou este aparelho não está na rede de casa. A cópia aqui continua funcionando, e sincroniza quando os dois se encontrarem.",
};
const en: typeof pt = {
  unreachable: (address: string) => `Couldn't reach the server ${address} — it is down or the network is off.`,
  unreachableShort: (address: string) => `Server unreachable: ${address}`,
  tryAgain: "Try again",
  tried: (name: string, ip: string) => `${name} → ${ip}: no answer`,
  dnsHint: "Check this network's DNS: the name may point to the wrong address.",
  home: "the computer at home",
  homeUnreachable: "The computer at home did not answer: it is off, not serving, or this device is not on the home network. The copy here keeps working, and syncs when the two meet again.",
};

/** The name this app gives a computer at home it is paired with
 *  (`verso-<pin>.home.arpa`, src-tauri src/paired/), with its port. */
const PAIRED_NAME = /^verso-[0-9a-f]{20}\.home\.arpa(:\d+)?$/i;

/** Whether `url` is a computer at home this app is paired with. */
export function isPairedUrl(url: string): boolean {
  return isPairedAddress(url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? url);
}

/** Whether `address` (`host[:port]`) is a computer at home this app is
 *  paired with. */
export function isPairedAddress(address: string): boolean {
  return PAIRED_NAME.test(address);
}

export function reachStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** An `unreachable` message: the address on its first line, then each IP
 *  that was tried, one a line (ADR 0097). */
export function reachParts(message: string): { address: string; tried: string[] } {
  const [address = "", ...tried] = message.split("\n").map((l) => l.trim()).filter(Boolean);
  return { address, tried };
}

/** The sentence for an `unreachable` message: the server out of reach and,
 *  when its name resolved to addresses, which ones did not answer. */
export function reachSentence(message: string): string {
  const s = reachStrings();
  const { address, tried } = reachParts(message);
  if (isPairedAddress(address)) return s.homeUnreachable;
  if (tried.length === 0) return s.unreachable(address);
  const name = address.replace(/:\d+$/, "");
  const said = `${s.unreachable(address)} ${tried.map((ip) => s.tried(name, ip)).join("; ")}.`;
  // One address that did not answer is a server down as often as a DNS
  // that is wrong; the hint is for when several were tried.
  return tried.length > 1 ? `${said} ${s.dnsHint}` : said;
}

/** The server's address when `e` says it could not be reached. */
export function unreachableAt(e: ContractError | unknown): string | null {
  const { kind, message } = errorParts(e);
  return kind === REACH ? reachParts(message).address : null;
}

/** A server's address from its URL: `host[:port]` — or, for a computer
 *  at home paired with this app, what it is ("the computer at home"). */
export function addressOf(url: string): string {
  const address = url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? url;
  return isPairedAddress(address) ? reachStrings().home : address;
}

type Said = (e: ContractError | unknown) => string;

/** Where a failure said in a panel is also kept: the console's line, and,
 *  once the window has started, the report and the app's log (errors.ts
 *  installs `told`). */
let keep: (e: ContractError | unknown) => void = toConsole;
export function keepFailuresWith(f: (e: ContractError | unknown) => void): void {
  keep = f;
}

/** The window's sentence for `e`: a server out of reach said as such;
 *  any other, by `other` (errors.ts's `errorSentence`, or its message). */
export function failureText(e: ContractError | unknown, other: Said = (x) => errorParts(x).message): string {
  const { kind, message } = errorParts(e);
  return kind === REACH ? reachSentence(message) : other(e);
}

/** Say `e` in `where`, an alert the screen reader reads at once, with a
 *  button that runs `retry`; kept as every failure is (`keep`). */
export function sayFailure(where: HTMLElement, e: ContractError | unknown, retry: (() => void) | null, other?: Said): void {
  const s = reachStrings();
  const box = document.createElement("div");
  box.className = "reach-failure";
  box.setAttribute("role", "alert");
  const text = document.createElement("p");
  text.textContent = failureText(e, other);
  box.append(text);
  if (retry) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn quiet reach-retry";
    again.textContent = s.tryAgain;
    again.addEventListener("click", () => retry());
    box.append(again);
  }
  where.hidden = false;
  where.replaceChildren(box);
  keep(e);
}

/** Nothing to say in `where` any more. */
export function clearFailure(where: HTMLElement): void {
  where.replaceChildren();
  where.hidden = true;
}

/** `button` while its try runs: disabled and busy, said to a screen
 *  reader; as before once it ends. */
export function busy(button: HTMLButtonElement, on: boolean): void {
  button.disabled = on;
  button.classList.toggle("is-busy", on);
  if (on) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
}

type Answer<T> = { status: "ok"; data: T } | { status: "error"; error: ContractError };

/** Run `call` for the person: `button` busy while it runs, a failure said
 *  in `where` with a button to try again (`retry`, or `call` once more
 *  with the same button), and the answer returned either way. */
export async function attempt<T>(
  where: HTMLElement,
  call: () => Promise<Answer<T>>,
  opts: { button?: HTMLButtonElement | null; retry?: () => void; other?: Said } = {},
): Promise<Answer<T>> {
  const { button = null, other } = opts;
  if (button) busy(button, true);
  let r: Answer<T>;
  try {
    r = await call();
  } finally {
    if (button) busy(button, false);
  }
  if (r.status === "ok") clearFailure(where);
  else sayFailure(where, r.error, opts.retry ?? (() => void attempt(where, call, opts)), other);
  return r;
}
