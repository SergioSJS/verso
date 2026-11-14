// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The people invited to this computer's server (ADR 0117 D9, the row of
// "forgot the password") in *Transformar em servidor*: listed by name,
// e-mail, what they reach and when last seen; *Nova senha* shows a link
// once with Copy (serving off, said in words); *Encerrar sessões* said;
// *Remover* asks first, *Cancelar* keeps the person, *Remover* takes them
// and the focus lands on the list's heading. The harness answers in
// memory; the Rust tests (verso-server's local/tests_players.rs,
// tests_local_accounts.rs) drive the real server.

import { expect, test } from "./fixtures.mjs";

async function section(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).click();
}

test("the owner gives a new password, ends sessions and removes a person, each said @layout", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => window.__harness.core.localServer.addPlayer("Bia", "bia@casa.example", [{ name: "Vault", role: "editor" }]));
  await section(app);
  const body = page.locator(".settings-body");
  const people = body.getByRole("list", { name: "Pessoas convidadas" });
  await expect(people).toContainText("Bia");
  await expect(people).toContainText("bia@casa.example · visto por último em");
  await expect(people).toContainText("Alcança: Vault (edita)");
  await expect(body.getByText("Nada é mandado por e-mail", { exact: false })).toBeVisible();
  // Serving off: no address for a link, said in words.
  await people.getByRole("button", { name: "Nova senha para Bia" }).click();
  await expect(body.locator(".ls-said")).toHaveText("Ligue o servidor primeiro.");
  // Serving on: the link once, with Copy.
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await people.getByRole("button", { name: "Nova senha para Bia" }).click();
  const made = body.locator(".ls-reset-made");
  await expect(made).toContainText("Link de senha nova para Bia");
  await expect(made).toContainText("/reset/");
  await expect(made.getByRole("button", { name: "Copiar o link" })).toBeFocused();
  // End sessions: said.
  await people.getByRole("button", { name: "Encerrar as sessões de Bia" }).click();
  await expect(body.locator(".ls-said")).toContainText("As sessões de Bia foram encerradas");
  await expect(people).toContainText("bia@casa.example · sem sessão aberta");
  // Remove asks first; Cancel keeps her.
  await people.getByRole("button", { name: "Remover a conta de Bia" }).click();
  const ask = people.getByRole("alertdialog");
  await expect(ask).toContainText("Remover a conta de Bia?");
  await expect(ask.getByRole("button", { name: "Cancelar" })).toBeFocused();
  // At a phone's width too, nothing scrolls sideways, the question open.
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ask.getByRole("button", { name: "Cancelar" }).click();
  await expect(people.getByRole("button", { name: "Remover a conta de Bia" })).toBeFocused();
  expect((await app.calls("local_server_account_remove")).length).toBe(0);
  // Remove, yes: gone, said, the focus on the list's heading.
  await people.getByRole("button", { name: "Remover a conta de Bia" }).click();
  await people.getByRole("alertdialog").getByRole("button", { name: "Remover a conta de Bia" }).click();
  await expect(body.locator(".ls-said")).toHaveText("A conta de Bia foi removida.");
  await expect(people).toContainText("Ninguém aceitou um convite ainda.");
  await expect(body.getByRole("heading", { name: "Pessoas convidadas" })).toBeFocused();
  expect((await app.calls("local_server_account_remove")).length).toBe(1);
});

test("acting on a person the server no longer has is said, not silent", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => window.__harness.core.localServer.addPlayer("Bia"));
  await section(app);
  const body = page.locator(".settings-body");
  await page.evaluate(() => {
    window.__harness.core.handlers["local_server_account_end_sessions"] = () => {
      throw { kind: "refused", message: "that person has no account here" };
    };
  });
  await body.getByRole("button", { name: "Encerrar as sessões de Bia" }).click();
  await expect(body.locator(".ls-said")).toHaveText("Essa pessoa já não tem conta aqui.");
});
