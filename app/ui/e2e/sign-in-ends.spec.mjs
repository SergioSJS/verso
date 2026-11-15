// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A sign-in through the browser that ends without this device signed in
// (review I1, 2026-11-15): the host says `server-sign-in-failed` — refused
// on the server's page, the code's ten minutes run out, a failure — and
// Settings › Servers says it in words where it said "Esperando…", with a
// try again. And a server that, on reconnecting, runs a version this app
// does not follow is said as that (review M1), not as a session ended.

import { expect, test } from "./fixtures.mjs";

async function servers(app, page) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Servidores" }).first().click();
  await expect(page.locator(".settings-body .srv-connect").first()).toBeVisible();
}

test("a sign-in refused on the server's page is said, with a try again", async ({ app, page }) => {
  await app.open();
  await servers(app, page);
  const said = page.locator(".settings-body .srv-said");
  await app.emit("server-sign-in-failed", { url: "https://notas.casa", why: "refused" });
  await expect(said).toContainText("A entrada foi recusada na página do servidor");
  await expect(said.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  await app.emit("server-sign-in-failed", { url: "https://notas.casa", why: "expired" });
  await expect(said).toContainText("O código expirou");
  await expect(said).not.toContainText("recusada");
});

test("a server of a version this app does not follow is said as that", async ({ app, page }) => {
  await app.open();
  await app.emit("server-gone", { url: "https://notas.casa", what: "version", reason: null, address: null });
  await expect(page.locator("#status")).toContainText("O servidor está numa versão diferente deste app");
  await expect(page.locator("#status")).not.toContainText("encerrou a sessão");
});
