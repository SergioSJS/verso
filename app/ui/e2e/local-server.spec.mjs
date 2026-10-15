// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "This app is a server" (ADR 0096; walkthrough, section 11): Settings'
// section turns it on and off over folders the person ticked, with the
// system's prompts explained first; the pairing dialog shows a QR, an
// address and a code, a countdown and, when a phone asks, "Was it you?";
// paired phones are listed with Revoke; the status bar says it serves.
// The harness answers in memory — the Rust tests drive the real server.

import { expect, test } from "./fixtures.mjs";

async function section(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Este app é um servidor" }).click();
}

test("it is off, serves only the ticked folders, and says what the system will ask first", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await expect(body.getByText("Desligado.")).toBeVisible();
  // None comes ticked; the one that also syncs with a server cannot be.
  const vault = body.getByRole("checkbox", { name: "Vault" });
  await expect(vault).not.toBeChecked();
  await expect(body.getByRole("checkbox", { name: "Compartilhada" })).toBeDisabled();
  await expect(body.getByText("também sincroniza com notas.exemplo: abra esse endereço no celular")).toBeVisible();
  // Nothing ticked: it will not start, and says so where the button is.
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("tick at least one folder to serve")).toBeVisible();
  await vault.check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false }).first()).toBeVisible();
  // The folders are locked while it serves, and the mark is in the status bar.
  await expect(vault).toBeDisabled();
  await expect(page.locator("#local-mark")).toContainText("Servindo");
  // Settings is modal: the mark's Stop is reached with it closed.
  await app.key("Escape");
  await expect(page.locator(".quick.settings")).toBeHidden();
  await page.locator("#local-mark").getByRole("button", { name: "Parar de servir ao celular" }).click();
  await expect(page.locator("#local-mark")).toHaveCount(0);
  await section(app);
  await expect(page.locator(".settings-body").getByText("Desligado.").first()).toBeVisible();
});

test("a phone is paired only when the laptop says Allow, and can then be revoked", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: "Vault" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  // The QR, the address and the code as text, for a person who cannot scan.
  await expect(dialog.getByRole("img", { name: "QR de pareamento" })).toBeVisible();
  await expect(dialog.getByText("https://192.168.3.122:51234/pair")).toBeVisible();
  await expect(dialog.getByText("BCDF-GHJK")).toBeVisible();
  await expect(dialog.getByText("Para uma rede em que você confia", { exact: false })).toBeVisible();
  await expect(dialog.getByText(/Vale por mais \d+:\d\d/)).toBeVisible();
  // A phone presents the token: the question is asked here.
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("iPhone da Ana"));
  await expect(dialog.getByText("Foi você quem leu este QR?")).toBeVisible();
  await expect(dialog.getByText("iPhone da Ana")).toBeVisible();
  await expect(dialog.getByText("192.168.1.77")).toBeVisible();
  await dialog.getByRole("button", { name: "Permitir" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(body.getByText("iPhone da Ana · só lê")).toBeVisible();
  await expect(body.getByText("1 celular pareado").first()).toBeVisible();
  await body.getByRole("button", { name: "Revogar iPhone da Ana: a sessão dele termina agora" }).click();
  await expect(body.getByText("Revogado. O celular foi desconectado.")).toBeVisible();
  await expect(body.getByText("Nenhum ainda.")).toBeVisible();
  // What happened is kept and shown, without a secret in it.
  await body.getByText("O que aconteceu").click();
  await expect(body.locator(".ls-log-list")).toContainText("Celular permitido (só lê)");
  await expect(body.locator(".ls-log-list")).toContainText("Celular revogado");
});

test("refusing a phone, and forgetting all, ask and say what they did", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: "Vault" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  // The window is open once the code shows: only then can a phone ask.
  await expect(dialog.getByText("BCDF-GHJK")).toBeVisible();
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("Estranho"));
  await dialog.getByRole("button", { name: "Não fui eu: recusar" }).click();
  await expect(body.getByText("Nenhum ainda.")).toBeVisible();
  // Forget all: asked first.
  await body.getByRole("button", { name: "Parear um celular" }).click();
  await expect(page.getByRole("dialog", { name: "Parear um celular" }).getByText("BCDF-GHJK")).toBeVisible();
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("Celular A"));
  await page.getByRole("dialog", { name: "Parear um celular" }).getByRole("button", { name: "Permitir" }).click();
  await body.getByRole("button", { name: "Esquecer todos os celulares" }).click();
  await body.getByRole("alertdialog").getByRole("button", { name: "Sim" }).click();
  await expect(body.getByText("1 celular esquecido.")).toBeVisible();
});

test("closing the pairing dialog ends the window", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: "Vault" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  await expect(dialog.getByText("BCDF-GHJK")).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toHaveCount(0);
  // The host is told after the dialog goes: poll the content asserted.
  await expect
    .poll(async () => (await page.evaluate(() => window.__harness.core.invoke("local_server_pair_state", {}))).open)
    .toBe(false);
});

test("the pairing dialog names the address and interface, and picking another makes a new QR", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: "Vault" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  // The real network first, not ZeroTier's or the VPN's.
  const pick = dialog.getByRole("combobox", { name: "Endereço que o celular vai usar" });
  await expect(pick).toHaveValue("192.168.3.122");
  await expect(pick.locator("option")).toHaveText([
    "192.168.3.122 — en7 (rede local)",
    "10.147.11.197 — feth237 (rede virtual: ZeroTier?)",
    "10.217.1.73 — utun4 (rede virtual: VPN?)",
  ]);
  await expect(dialog.getByText("https://192.168.3.122:51234/pair")).toBeVisible();
  // Picking another address by keyboard asks for a new window and says so.
  await pick.selectOption("10.147.11.197");
  await expect(dialog.getByText("https://10.147.11.197:51234/pair")).toBeVisible();
  await expect(dialog.getByText("Novo QR para 10.147.11.197.")).toBeVisible();
  await expect(pick).toBeFocused();
  await expect(pick).toHaveValue("10.147.11.197");
});
