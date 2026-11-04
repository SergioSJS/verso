// The people invited to a computer that serves (ADR 0117 D9, the row of
// "forgot the password"; src/dialogs/localServerPlayers.ts): the words
// whole in both languages and saying what D9 decided — nothing is mailed,
// the owner hands the link over, once, for a day — and the block over a
// host answered here: each person listed with what they reach and when
// last seen; *Nova senha* shows its link once with Copy; *Remover* asks
// first and *Cancelar* changes nothing; a refusal is said in words.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://verso.test/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
document.documentElement.lang = "pt-BR";

const invoked = [];
/** What the host answers each command with; a function throws to refuse. */
const answers = {};
win.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    invoked.push([cmd, args]);
    const a = answers[cmd];
    return typeof a === "function" ? a(args) : (a ?? null);
  },
  transformCallback: () => 0,
  metadata: { currentWindow: { label: "main" } },
};
globalThis.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__;

// The window's own elements, which modules the block reaches look up as
// they load.
for (const id of [
  "open", "folder", "collapse", "ribbon", "search", "search-label", "search-clear",
  "status", "report-bug", "words", "notes-heading", "notes", "tree-root", "spaces",
  "panes", "top-progress", "top-progress-fill", "index-progress", "index-progress-bar", "index-progress-label",
]) {
  const e = document.createElement("div");
  e.id = id;
  document.body.append(e);
}

await esbuild.build({
  stdin: {
    contents: `export * from "./src/dialogs/localServerPlayers";
export * from "./src/dialogs/localServerPlayersStrings";`,
    resolveDir: ".",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localServerPlayers.test-bundle.mjs",
  logLevel: "error",
});
const P = await import("./.bundles/localServerPlayers.test-bundle.mjs");

const ANA = { id: "a1", name: "Ana", email: "ana@casa.example", created: 1793750400, last_seen: 1793754000, reaches: [{ name: "Campanha", role: "editor" }, { name: "Campanha/Mapas", role: "reader" }] };
const RUI = { id: "a2", name: "Rui", email: "rui@casa.example", created: 1793750400, last_seen: null, reaches: [] };
const STATUS = { serving: true };

const settle = () => new Promise((r) => setTimeout(r, 0));

async function drawn() {
  const said = [];
  const block = P.playersBlock((t) => said.push(t));
  document.body.replaceChildren(block.el);
  await block.draw(STATUS);
  return { block, said, el: block.el };
}

const byLabel = (el, label) => [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);

test("both languages have every word, none empty", () => {
  const { pt, en } = P.playerWords;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
  assert.deepEqual(Object.keys(en.role).sort(), Object.keys(pt.role).sort());
  for (const lang of [pt, en]) {
    for (const [k, v] of Object.entries(lang)) {
      if (k === "role") continue;
      const said = typeof v === "function" ? v("Ana", "1/11/2026") : v;
      assert.ok(typeof said === "string" && said.trim().length > 0, k);
    }
  }
});

test("the words say what ADR 0117 D9 decided", () => {
  const { pt, en } = P.playerWords;
  assert.match(pt.lead, /Nada é mandado por e-mail/);
  assert.match(en.lead, /Nothing is sent by e-mail/);
  assert.match(pt.resetMade("Ana"), /vale uma vez, por 24 horas/);
  assert.match(pt.resetMade("Ana"), /mande para a pessoa/);
  assert.match(en.resetMade("Ana"), /works once, for 24 hours/);
  assert.match(pt.removeAsk("Ana"), /Remover a conta de Ana\?/);
  assert.equal(P.playerStrings(), pt);
});

test("each person is listed with what they reach and when last seen, never anyone else", async () => {
  answers.local_server_accounts = [ANA, RUI];
  const { el } = await drawn();
  const list = el.querySelector("ul");
  assert.equal(list.getAttribute("aria-labelledby"), el.querySelector("h3").id);
  const rows = [...list.querySelectorAll("li")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Ana/);
  assert.match(rows[0].textContent, /ana@casa\.example · visto por último em/);
  // The day and the hour, as the app's other dates say them (the re-test
  // of 2026-11-04: the day alone).
  assert.match(rows[0].textContent, /visto por último em [^·]*\d{1,2}:\d{2}/);
  assert.match(rows[0].textContent, /Alcança: Campanha \(edita\), Campanha\/Mapas \(lê\)/);
  assert.match(rows[1].textContent, /rui@casa\.example · sem sessão aberta/);
  assert.match(rows[1].textContent, /Não alcança nenhuma pasta ainda/);
  for (const label of ["Nova senha para Ana", "Encerrar as sessões de Ana", "Remover a conta de Ana"]) assert.ok(byLabel(el, label), label);
  answers.local_server_accounts = [];
  const empty = await drawn();
  assert.match(empty.el.querySelector("ul").textContent, /Ninguém aceitou um convite ainda/);
});

test("a new password's link is shown once, with Copy focused, and said", async () => {
  answers.local_server_accounts = [ANA];
  answers.local_server_account_reset = { link: "https://mesa.example/reset/abc", expires: 1793840400 };
  const { el, said } = await drawn();
  const made = el.querySelector(".ls-reset-made");
  assert.equal(made.hidden, true);
  byLabel(el, "Nova senha para Ana").click();
  await settle();
  await settle();
  assert.deepEqual(invoked.at(-2), ["local_server_account_reset", { id: "a1" }]);
  assert.equal(made.hidden, false);
  assert.match(made.textContent, /https:\/\/mesa\.example\/reset\/abc/);
  assert.equal(document.activeElement?.textContent, "Copiar o link");
  assert.match(said.at(-1), /Link de senha nova para Ana/);
});

test("Remove asks first; Cancel changes nothing; Remove removes and says so", async () => {
  answers.local_server_accounts = [ANA];
  answers.local_server_account_remove = null;
  const { el, said } = await drawn();
  invoked.length = 0;
  byLabel(el, "Remover a conta de Ana").click();
  const ask = el.querySelector("[role=alertdialog]");
  assert.ok(ask, "no question asked");
  assert.match(ask.textContent, /Remover a conta de Ana\?/);
  assert.equal(document.activeElement?.textContent, "Cancelar");
  assert.equal(invoked.filter(([c]) => c === "local_server_account_remove").length, 0);
  // Cancel: the button is back, focused, nothing was removed.
  document.activeElement.click();
  assert.equal(el.querySelector("[role=alertdialog]"), null);
  assert.equal(document.activeElement?.getAttribute("aria-label"), "Remover a conta de Ana");
  assert.equal(invoked.filter(([c]) => c === "local_server_account_remove").length, 0);
  // Again, and yes this time.
  document.activeElement.click();
  answers.local_server_accounts = [];
  el.querySelector("[role=alertdialog] .danger").click();
  await settle();
  await settle();
  assert.deepEqual(invoked.find(([c]) => c === "local_server_account_remove"), ["local_server_account_remove", { id: "a1" }]);
  assert.equal(said.at(-1), "A conta de Ana foi removida.");
  assert.match(el.querySelector("ul").textContent, /Ninguém aceitou um convite ainda/);
});

test("ending sessions is said; a person already gone is said in words", async () => {
  answers.local_server_accounts = [ANA];
  answers.local_server_account_end_sessions = null;
  const { el, said } = await drawn();
  byLabel(el, "Encerrar as sessões de Ana").click();
  await settle();
  await settle();
  assert.match(said.at(-1), /As sessões de Ana foram encerradas/);
  answers.local_server_account_end_sessions = () => {
    throw { kind: "refused", message: "that person has no account here" };
  };
  byLabel(el, "Encerrar as sessões de Ana").click();
  await settle();
  await settle();
  assert.equal(said.at(-1), "Essa pessoa já não tem conta aqui.");
});

test("while serving is off, a link made before is no longer shown", async () => {
  answers.local_server_accounts = [ANA];
  answers.local_server_account_reset = { link: "https://mesa.example/reset/abc", expires: 1793840400 };
  const { el, block } = await drawn();
  byLabel(el, "Nova senha para Ana").click();
  await settle();
  await settle();
  const made = el.querySelector(".ls-reset-made");
  assert.equal(made.hidden, false);
  await block.draw({ serving: false });
  assert.equal(made.hidden, true);
});
