// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Parear com um computador de casa" (ADR 0117, "The Verso app paired";
// the maintainer, 2026-11-15): Settings › Servers on every app — first of
// all a phone's or a tablet's — pairs with the computer at home that
// serves, by the address and the eight letters its *Pair a phone* dialog
// shows. The host learns the computer's key by the code's proofs, never by
// trusting the network, and keeps it (src-tauri src/paired/); the computer
// is then one of the servers listed below the form, whose folders are
// picked as any server's: a copy here (serverCopy.ts) that opens offline
// and syncs whenever the two meet on the home network.
//
// The browser of a phone pairs too (the QR), with no copy: that stays the
// other way, said in the lesson "Verso no Celular e no Tablet".

import { commands, type ContractError, type ServerAccount } from "../bindings";
import { h } from "../dom";
import { errorParts } from "../errorKinds";
import { errorSentence } from "../errors";
import { busy, clearFailure, sayFailure } from "../reach";

const pt = {
  heading: "Parear com um computador de casa",
  desc: "Para guardar neste aparelho uma cópia das pastas que o seu computador serve: ela abre sem internet, em qualquer lugar, e sincroniza quando os dois estão na rede de casa com o computador servindo. No computador, abra Ajustes › Transformar em servidor › Parear um celular e digite aqui o endereço e o código que ele mostra.",
  address: "Endereço do computador",
  addressPlaceholder: "192.168.1.20:51234",
  code: "Código",
  codePlaceholder: "BCDF-GHJK",
  go: "Parear",
  waiting: "Agora confirme no computador: ele pergunta “Foi você?”. Esperando…",
  done: "Pareado. Escolha abaixo uma pasta do computador de casa para guardar a cópia dela aqui.",
  safe: "O código não passa pela rede: o app prova que o conhece e só aceita o computador que prova o mesmo — quem estiver no meio não se passa por ele.",
  title: (name: string) => (name && name !== "This computer" ? `Computador de casa · ${name}` : "Computador de casa"),
  who: "Pareado: este aparelho guarda cópias das pastas que você escolher e sincroniza quando está na rede de casa.",
  error: "Erro",
  // The host's refusals (src-tauri src/paired/pair.rs), by how each starts.
  refusals: [
    ["the computer is not pairing now", "o computador não está pareando agora: nele, abra Ajustes › Transformar em servidor › Parear um celular e digite o código que ele mostrar."],
    ["the code was not right", "o código não confere, já foi usado ou os dois minutos acabaram: digite o código que o computador mostra agora (depois de três erros, abra Parear um celular de novo)."],
    ["the code is eight letters", "o código tem oito letras, como o computador mostra, por exemplo BCDF-GHJK."],
    ["the address has its port", "digite o endereço como o computador mostra, com a porta depois dos dois-pontos, como 192.168.1.20:51234."],
    ["type the address", "digite o endereço como o computador mostra, com a porta depois dos dois-pontos, como 192.168.1.20:51234."],
    ["the computer is reached over https", "o computador é alcançado por https: digite o endereço como ele mostra."],
    ["no Verso computer answers", "nenhum computador Verso responde nesse endereço: confira no diálogo Parear um celular do computador."],
    ["the computer said no", "o computador disse não, ou os dois minutos acabaram: nada foi pareado."],
    ["the computer did not answer in time", "o computador não respondeu a tempo: nada foi pareado."],
    ["the answer did not come from the computer", "a resposta não veio do computador que mostra este código: outro aparelho desta rede pode estar no meio. Nada foi pareado; tente de novo numa rede em que você confia."],
    ["pair the Verso app on the home network", "pareie o app Verso na rede de casa, onde ele alcança o computador direto."],
  ] as [string, string][],
};
const en: typeof pt = {
  heading: "Pair with a computer at home",
  desc: "To keep on this device a copy of the folders your computer serves: it opens offline, anywhere, and syncs when the two are on the home network with the computer serving. On the computer, open Settings › Turn into a server › Pair a phone and type here the address and the code it shows.",
  address: "Computer's address",
  addressPlaceholder: "192.168.1.20:51234",
  code: "Code",
  codePlaceholder: "BCDF-GHJK",
  go: "Pair",
  waiting: "Now confirm on the computer: it asks “Was it you?”. Waiting…",
  done: "Paired. Pick below a folder of the computer at home to keep its copy here.",
  safe: "The code does not cross the network: the app proves it knows it and accepts only the computer that proves the same — no one in between can pass for it.",
  title: (name: string) => (name && name !== "This computer" ? `Computer at home · ${name}` : "Computer at home"),
  who: "Paired: this device keeps copies of the folders you pick and syncs when it is on the home network.",
  error: "Error",
  refusals: [
    ["the computer is not pairing now", "the computer is not pairing now: on it, open Settings › Turn into a server › Pair a phone, then type the code it shows."],
    ["the code was not right", "the code was not right, was used, or its two minutes ran out: type the code the computer shows now (after three wrong tries, open Pair a phone again)."],
    ["the code is eight letters", "the code is eight letters, as the computer shows it, like BCDF-GHJK."],
    ["the address has its port", "type the address as the computer shows it, with its port after a colon, like 192.168.1.20:51234."],
    ["type the address", "type the address as the computer shows it, with its port after a colon, like 192.168.1.20:51234."],
    ["the computer is reached over https", "the computer is reached over https: type the address as it shows it."],
    ["no Verso computer answers", "no Verso computer answers at that address: check it on the computer's Pair a phone dialog."],
    ["the computer said no", "the computer said no, or its two minutes ran out: nothing was paired."],
    ["the computer did not answer in time", "the computer did not answer in time: nothing was paired."],
    ["the answer did not come from the computer", "the answer did not come from the computer that shows this code: another device on this network may be in between. Nothing was paired; try again on a network you trust."],
    ["pair the Verso app on the home network", "pair the Verso app on the home network, where it reaches the computer itself."],
  ] as [string, string][],
};

export function pairStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** A pairing's failure in the window's language: the host's refusals
 *  whole, anything else as every failure is said. */
export function pairSentence(e: ContractError | unknown): string {
  const s = pairStrings();
  const { kind, message } = errorParts(e);
  const known = kind === "refused" ? s.refusals.find(([start]) => message.startsWith(start)) : undefined;
  if (!known) return errorSentence(e);
  const words = known[1];
  return `${s.error}: ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** A paired computer's title in Settings › Servers: what it is, and its
 *  owner's name — never the name the app reaches it by. */
export function pairedTitle(a: ServerAccount): string {
  return pairStrings().title(a.name);
}

/** The form: the address and the code, then the person at the computer
 *  allows; `paired` hears the computer now signed in to. */
export function pairComputerForm(paired: (a: ServerAccount) => void): HTMLElement {
  const s = pairStrings();
  const form = h("form", "srv-connect srv-pair-home");
  form.setAttribute("aria-labelledby", "srv-pair-heading");
  const heading = h("h3", "srv-label", s.heading);
  heading.id = "srv-pair-heading";
  const field = (id: string, label: string, placeholder: string): [HTMLLabelElement, HTMLInputElement] => {
    const l = h("label", "srv-label", label);
    const input = h("input");
    input.type = "text";
    input.id = id;
    input.required = true;
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.addEventListener("keydown", (e) => e.stopPropagation());
    l.htmlFor = id;
    return [l, input];
  };
  const [addressLabel, address] = field("srv-pair-address", s.address, s.addressPlaceholder);
  address.inputMode = "url";
  const [codeLabel, code] = field("srv-pair-code", s.code, s.codePlaceholder);
  code.maxLength = 12;
  code.setAttribute("autocapitalize", "characters");
  code.setAttribute("autocomplete", "one-time-code");
  const go = h("button", "btn primary", s.go);
  go.type = "submit";
  const help = h("p", "srv-help", s.desc);
  help.id = "srv-pair-help";
  form.setAttribute("aria-describedby", help.id);
  const safe = h("p", "srv-help", s.safe);
  const failure = h("div", "srv-failure");
  failure.hidden = true;
  const said = h("p", "srv-said");
  said.setAttribute("role", "status");
  const row = h("div", "srv-field");
  row.append(go);
  form.append(heading, help, addressLabel, address, codeLabel, code, row, safe, failure, said);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(go, true);
    clearFailure(failure);
    said.textContent = s.waiting;
    void commands.serverPair(address.value, code.value).then((r) => {
      busy(go, false);
      if (r.status !== "ok") {
        said.textContent = "";
        sayFailure(failure, r.error, () => form.requestSubmit(), pairSentence);
        return;
      }
      said.textContent = s.done;
      address.value = "";
      code.value = "";
      paired(r.data);
    });
  });
  return form;
}
