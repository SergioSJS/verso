// The player's pages of a game master's computer that serves (ADR 0117 D3
// items 2 and 6; src/web/localTable.ts), in node over happy-dom: the
// sign-in's notes, with the pairing link only where the door pairs; the
// table offline over the window — said, tried again, closed, and the page
// loaded anew once the server answers.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import { Window } from "happy-dom";

const win = new Window({ url: "https://mesa.example.com/" });
for (const name of ["window", "document", "HTMLElement", "Node", "Element"]) {
  globalThis[name] = name === "window" ? win : win[name];
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
document.documentElement.lang = "pt-BR";

await esbuild.build({
  entryPoints: ["src/web/localTable.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localTable.test-bundle.mjs",
  logLevel: "error",
  external: ["@tauri-apps/*"],
});
const T = await import("./.bundles/localTable.test-bundle.mjs");

const settle = () => new Promise((r) => setTimeout(r, 0));
const json = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
// What Cloudflare answers for a link that ended: its own page.
const cloudflare = () => new Response("<html>Error 1033</html>", { status: 530, headers: { "content-type": "text/html" } });

test("the sign-in says how an invited player gets in; the pairing link only where the door pairs", () => {
  document.body.innerHTML = `<main class="web-page"><div class="web-card"></div></main>`;
  T.localSignInNotes(false);
  const card = document.querySelector(".web-card");
  assert.match(card.textContent, /Abra primeiro o link do convite/);
  assert.match(card.textContent, /nada é enviado/);
  assert.equal(card.querySelector("a[href='/pair']"), null);
  document.body.innerHTML = `<main class="web-page"><div class="web-card"></div></main>`;
  T.localSignInNotes(true);
  assert.equal(document.querySelector("a[href='/pair']").textContent, "Parear este celular com um código");
  // Through the link a passkey is offered: no word against it.
  assert.doesNotMatch(document.querySelector(".web-card").textContent, /passkeys só/);
});

test("on the network, where no passkey is offered, the sign-in says the password is the way (ADR 0117 D9)", () => {
  document.body.innerHTML = `<main class="web-page"><div class="web-card"></div></main>`;
  T.localSignInNotes(true, false);
  assert.match(document.querySelector(".web-card").textContent, /Nesta rede, entre com a senha: passkeys só pelo link da internet/);
});

test("a server answers with JSON; Cloudflare's page or no network is no answer", async () => {
  assert.equal(await T.answers(async () => json()), true);
  assert.equal(await T.answers(async () => cloudflare()), false);
  assert.equal(await T.answers(async () => { throw new TypeError("Failed to fetch"); }), false);
});

test("the table offline: said as a dialog, tried again, and the page loaded anew when it answers", async () => {
  document.body.innerHTML = `<button id="before">x</button>`;
  document.getElementById("before").focus();
  let up = false;
  let reloaded = 0;
  const box = T.showOffline(async () => (up ? json() : cloudflare()), () => reloaded++);
  assert.equal(box.getAttribute("role"), "alertdialog");
  assert.equal(document.getElementById(box.getAttribute("aria-labelledby")).textContent, "A mesa está offline");
  // Shown once, however many drops are heard.
  assert.equal(T.showOffline(), box);
  const [retry, close] = box.querySelectorAll("button");
  assert.equal(document.activeElement, retry);
  retry.click();
  await settle();
  await settle();
  assert.match(box.querySelector("[role=status]").textContent, /Ainda offline/);
  assert.equal(reloaded, 0);
  up = true;
  retry.click();
  await settle();
  await settle();
  assert.equal(reloaded, 1);
  assert.match(box.querySelector("[role=status]").textContent, /A mesa voltou/);
  // Close is the way back to what the browser kept; focus returns.
  close.click();
  assert.equal(document.querySelector(".web-offline"), null);
  assert.equal(document.activeElement.id, "before");
});

test("Escape closes it, and English is whole", () => {
  document.body.innerHTML = "";
  const box = T.showOffline(async () => cloudflare(), () => undefined);
  box.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(document.querySelector(".web-offline"), null);
  document.documentElement.lang = "en";
  const en = T.tableWords();
  assert.equal(en.offlineTitle, "The table is offline");
  for (const v of Object.values(en)) assert.ok(v.length > 0);
  document.documentElement.lang = "pt-BR";
});

test("a read link's visitor at a computer that serves watches for the table offline from the gate's answer, never /api/", async () => {
  const asked = [];
  const get = async (url) => {
    asked.push(String(url));
    return new Response("<html>cloudflare</html>", { status: 502, headers: { "content-type": "text/html" } });
  };
  // A UniVerso's link (the gate said `local: false`): nothing to watch, nothing asked.
  assert.equal(T.watchIfLocal(false, "tok", get), false, "a UniVerso's read link");
  assert.deepEqual(asked, []);
  // This app is a server: it watches, and whether the table answers is
  // asked of the link's own gate.
  assert.equal(T.watchIfLocal(true, "tok", get), true, "this app is a server");
  document.body.innerHTML = "";
  const box = T.showOffline(get, () => undefined, "/r/tok/state");
  box.querySelector(".web-primary").click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(asked.length > 0, "the table was asked");
  assert.ok(asked.every((u) => u === "/r/tok/state"), asked.join(", "));
  assert.ok(!asked.some((u) => u.includes("/api/")), asked.join(", "));
  box.querySelector(".web-secondary").click();
});

test("the table offline tells the window, so the music panel lets go of the table's track", () => {
  document.body.innerHTML = "";
  let told = 0;
  const count = () => told++;
  win.addEventListener(T.TABLE_OFFLINE, count);
  const box = T.showOffline(async () => cloudflare(), () => undefined);
  assert.equal(told, 1);
  box.querySelector(".web-secondary").click();
  win.removeEventListener(T.TABLE_OFFLINE, count);
});
