// What the accounts of a computer that serves have (ADR 0117 D9, S11–S13;
// src/dialogs/localServerAccountsStrings.ts, src/web/passkeys.ts): the
// section's words whole in both languages and saying what D9 decided —
// phones never sync, another Verso through the internet link, the password
// on the network and a passkey through the link, a quick link's passkey
// going with it; and a page told by `/api/state` that this door offers no
// passkey offers none, whatever the browser can do.

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

for (const [entry, out] of [
  ["src/dialogs/localServerAccountsStrings.ts", "localServerAccounts.test-bundle.mjs"],
  ["src/web/passkeys.ts", "passkeysOffered.test-bundle.mjs"],
]) {
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: `test/.bundles/${out}`, logLevel: "error", external: ["@tauri-apps/*"] });
}
const A = await import("./.bundles/localServerAccounts.test-bundle.mjs");
const P = await import("./.bundles/passkeysOffered.test-bundle.mjs");

test("both languages have every word, none empty", () => {
  const { pt, en } = A.accountWords;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
  for (const lang of [pt, en]) {
    for (const [k, v] of Object.entries(lang)) {
      const said = typeof v === "function" ? v("Verso · Mac da Ana", "Ana", "1/11/2026") : v;
      assert.ok(typeof said === "string" && said.trim().length > 0, k);
    }
  }
});

test("the words say what ADR 0117 D9 decided", () => {
  const { pt, en } = A.accountWords;
  // Other people's phone apps sync through the link like a computer's (ADR 0117 D19, 2026-11-15).
  assert.match(pt.appsLead, /O app Verso do celular delas conecta e sincroniza/);
  assert.match(en.appsLead, /The Verso app on their phone connects and syncs/);
  assert.match(pt.appsTrust, /link na internet/);
  assert.match(pt.appsTrust, /não confia no certificado próprio/);
  assert.match(en.appsTrust, /does not trust this computer's own certificate/);
  assert.match(pt.passkeysWords, /use a senha: passkeys só pelo link da internet/);
  assert.match(pt.passkeysWords, /link rápido some com esse link/);
  assert.match(en.passkeysWords, /use the password: passkeys only through the internet link/);
  assert.match(pt.linksDesc, /Desligar fecha todos os links na hora/);
  assert.equal(A.accountStrings(), pt);
});

test("a door that offers no passkey offers none, even in a browser that could", () => {
  Object.defineProperty(win, "isSecureContext", { value: true, configurable: true });
  win.PublicKeyCredential = function PublicKeyCredential() {};
  assert.equal(P.passkeysHere(), true);
  P.setPasskeysOffered(false);
  assert.equal(P.passkeysOffered(), false);
  assert.equal(P.passkeysHere(), false);
  P.setPasskeysOffered(true);
  assert.equal(P.passkeysHere(), true);
  // And never where the browser cannot.
  Object.defineProperty(win, "isSecureContext", { value: false, configurable: true });
  assert.equal(P.passkeysHere(), false);
});
