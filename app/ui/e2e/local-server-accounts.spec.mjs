// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the accounts of this computer's server have (ADR 0117 D9, S11–S13)
// in *Transformar em servidor*: other people's desktop apps signed in,
// listed and ended; the read links' switch, off at first, with its failure
// said; and the window sitting at its own table making a read link with
// the address this server's links open at. The harness answers in memory;
// the Rust tests (tests_local_accounts.rs, verso-server's local tests)
// drive the real server.

import { expect, test } from "./fixtures.mjs";

async function section(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).click();
}

test("the desktop apps of other people are listed and ended, said in words; phones never sync @layout", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const apps = body.getByRole("list", { name: "Apps Verso de outras pessoas" });
  await expect(apps).toContainText("Nenhum app de outra pessoa conectado.");
  await expect(body.getByText("Celulares nunca sincronizam", { exact: false })).toBeVisible();
  await expect(body.getByText("não confia no certificado próprio deste computador", { exact: false })).toBeVisible();
  await expect(body.getByText("Pela sua rede, use a senha: passkeys só pelo link da internet.", { exact: false })).toBeVisible();
  // Ana's Verso signs in through the browser; the section is drawn again.
  await page.evaluate(() => window.__harness.core.localServer.signInDevice());
  await app.key("Escape");
  await section(app);
  await expect(apps.getByText("Verso · Mac da Ana — Ana")).toBeVisible();
  await expect(apps).toContainText("ana@casa.example");
  // Ended: said, gone from the list, the focus on the list's heading.
  await apps.getByRole("button", { name: "Encerrar Verso · Mac da Ana, de Ana" }).click();
  await expect(body.getByText("Verso · Mac da Ana foi encerrado: não sincroniza mais até entrar de novo.")).toBeVisible();
  await expect(apps).toContainText("Nenhum app de outra pessoa conectado.");
  await expect(body.getByRole("heading", { name: "Apps Verso de outras pessoas" })).toBeFocused();
  expect((await app.calls("local_server_end_device")).length).toBe(1);
  // At a phone's width too, nothing scrolls sideways.
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("ending an app the server no longer has is said, not silent", async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => window.__harness.core.localServer.signInDevice());
  await section(app);
  const body = page.locator(".settings-body");
  // Ended elsewhere meanwhile (it signed out): the server says so.
  await page.evaluate(() => {
    window.__harness.core.handlers["local_server_end_device"] = () => {
      throw { kind: "refused", message: "that app is not signed in here" };
    };
  });
  await body.getByRole("button", { name: "Encerrar Verso · Mac da Ana, de Ana" }).click();
  await expect(body.locator(".ls-said")).toHaveText("Esse app já não está conectado aqui.");
});

test("read links are off at first; the switch turns them on and off, and a failure puts it back and says why", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const links = body.getByRole("checkbox", { name: "Ligar os links de leitura" });
  await expect(links).not.toBeChecked();
  await expect(links).toHaveAccessibleDescription(/Desligar fecha todos os links na hora/);
  await links.check();
  await expect(body.getByText("Links de leitura ligados.")).toBeVisible();
  await links.uncheck();
  await expect(body.getByText("Links de leitura desligados: todos os links fecharam.")).toBeVisible();
  expect(await app.calls("local_server_read_links")).toEqual([{ on: true }, { on: false }]);
  await page.evaluate(() => {
    window.__harness.core.handlers["local_server_read_links"] = () => {
      throw { kind: "failed", message: "database is locked" };
    };
  });
  // Clicked, it is put back once the host refuses: not `check()`, which
  // asks the state to stay changed.
  await links.click();
  await expect(links).not.toBeChecked();
  await expect(body.locator(".ls-said")).not.toHaveText("Links de leitura desligados: todos os links fecharam.");
  await expect(body.locator(".ls-said")).not.toBeEmpty();
});

test("the window at its own table makes a read link: off, it says where to turn them on; on, the link carries this server's address", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Sentar à mesa" }).click();
  await expect(body.getByText("Na mesa de Vault.").first()).toBeVisible();
  await app.key("Escape");
  const files = await app.files();
  const note = files.find((f) => f.endsWith(".md") && !f.includes("/") && !f.startsWith("."));
  const row = page.locator(`#notes li[data-path="${note}"] > button`);
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  let dialog = page.getByRole("dialog", { name: /Link de leitura de/ });
  await expect(dialog).toContainText("Ligue em Ajustes › Transformar em servidor › Links de leitura.");
  await expect(dialog.getByRole("button", { name: "Criar link" })).toBeHidden();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  // On, in the section.
  await section(app);
  await page.locator(".settings-body").getByRole("checkbox", { name: "Ligar os links de leitura" }).check();
  await expect(page.locator(".settings-body").getByText("Links de leitura ligados.")).toBeVisible();
  await app.key("Escape");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copiar link de leitura…" }).click();
  dialog = page.getByRole("dialog", { name: /Link de leitura de/ });
  await dialog.getByRole("button", { name: "Criar link" }).click();
  await expect(dialog.getByRole("textbox", { name: "Endereço do link" })).toHaveValue(/^https:\/\/192\.168\.1\.20:51234\/r\//);
  expect((await app.calls("read_link_create")).at(-1)).toMatchObject({ kind: "note", path: note });
  await expect(dialog.getByRole("list", { name: "Links ativos" })).toContainText("Criado por Sérgio");
});
