// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Turn into a server" as one feature (ADR 0117): the two boxes under the
// switch — On my network, and By an internet link (Cloudflare, testing
// mode) — the link's address with Copy and a QR, its twelve hours with
// Extend, its failures said in words, the table offline; "Use my own
// address"; invitations made, listed and ended; the window sitting at its
// own table and back. The harness answers in memory (no cloudflared runs);
// the Rust tests drive the real server and tunnel.

import { expect, test } from "./fixtures.mjs";

async function section(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).click();
}

async function stubClipboard(page) {
  await page.addInitScript(() => {
    window.__copied = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
  });
}

test("the link alone serves: its address with Copy and a QR, the hours left with Extend, and unticked it stops serving @layout", async ({ app, page }) => {
  await stubClipboard(page);
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  const net = body.getByRole("checkbox", { name: "Na minha rede" });
  const link = body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" });
  await expect(net).toBeChecked();
  await expect(link).not.toBeChecked();
  await expect(link).toHaveAccessibleDescription(/computador precisa ficar ligado/);
  await expect(body.getByText("Modo de teste da Cloudflare", { exact: false })).toBeVisible();
  // The network's box off, the link's on: the link turns on with the server.
  await net.uncheck();
  await expect(body.getByText("Não vai servir na sua rede.")).toBeVisible();
  await link.check();
  await expect(body.getByText("O link liga junto com o servidor.")).toBeVisible();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  // No question about the network: nothing listens on it.
  await expect(page.getByRole("dialog", { name: "Antes de ligar" })).toHaveCount(0);
  await expect(body.locator(".ls-link-state")).toHaveText("Link no ar.");
  await expect(body.getByText("https://exemplo-de-mesa.trycloudflare.com")).toBeVisible();
  await expect(body.getByText("Servindo só pelo link na internet.", { exact: false })).toBeVisible();
  await expect(body.getByText(/Fecha sozinho em 1[12] h \d\d min \(às \d\d:\d\d\)\./)).toBeVisible();
  await expect(body.getByText("Um link rápido muda a cada vez que liga", { exact: false })).toBeVisible();
  // Locked while serving: where it serves, and pairing (the network's).
  await expect(net).toBeDisabled();
  await expect(body.getByRole("button", { name: "Parear um celular" })).toBeDisabled();
  await expect(body.getByText("Parear um celular é pela sua rede", { exact: false })).toBeVisible();
  // Copy, and the QR as an image with the address as its name.
  await body.getByRole("button", { name: "Copiar link", exact: true }).click();
  await expect(body.getByText("Link copiado.")).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toBe("https://exemplo-de-mesa.trycloudflare.com");
  await body.getByText("Mostrar o QR do link").click();
  await expect(body.getByRole("img", { name: "QR do endereço https://exemplo-de-mesa.trycloudflare.com" })).toBeVisible();
  await body.getByRole("button", { name: "Prorrogar por 12 horas" }).click();
  await expect(body.getByText(/Prorrogado: o mesmo link, agora até \d\d:\d\d\./)).toBeVisible();
  // The status bar says the link, with Stop beside it.
  await expect(page.locator("#local-mark")).toContainText("Servindo · link na internet");
  // A phone's width: nothing runs off the side.
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Unticked: the link goes, and with the network's box off, serving too.
  await link.uncheck();
  await expect(body.getByText("Desligado.", { exact: false }).first()).toBeVisible();
  await expect(page.locator("#local-mark")).toHaveCount(0);
  await expect(net).toBeEnabled();
});

test("neither box ticked does not start; a link that fails says why in words, and one that drops says the table is offline", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("checkbox", { name: "Na minha rede" }).uncheck();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.getByText("Marque “Na minha rede”, “Por um link na internet”, ou os dois.")).toBeVisible();
  // On the network, then the link: its download fails.
  await body.getByRole("checkbox", { name: "Na minha rede" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false }).first()).toBeVisible();
  await page.evaluate(() => window.__harness.core.localServer.failLink("the download of cloudflared: error sending request for url"));
  const link = body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" });
  // Refused at once: the box does not stay ticked, so it is clicked, not "checked".
  await link.click();
  await expect(body.getByText("Não foi possível baixar o cloudflared do GitHub", { exact: false }).first()).toBeVisible();
  await expect(link).not.toBeChecked();
  // A refused checksum, in words too.
  await page.evaluate(() => window.__harness.core.localServer.failLink("cloudflared-darwin-arm64.tgz is not the one Verso pins (expected sha256:aa, got sha256:bb): refused, nothing was kept"));
  await link.click();
  await expect(body.getByText("O cloudflared baixado não confere com a soma que o Verso fixa", { exact: false }).first()).toBeVisible();
  // Up, then cloudflared ends by itself: offline, said, nothing restarts it.
  await link.check();
  await expect(body.locator(".ls-link-state")).toHaveText("Link no ar.");
  await page.evaluate(() => {
    const offline = { state: "offline", origin: null, until: null, own: false, ended: "exited", protocol: null, qr: [] };
    window.__harness.core.localServer.setLink(offline);
    void window.__harness.emit("local-server-link", offline);
  });
  await expect(body.locator(".ls-link-state")).toHaveText(/^Mesa offline: o link caiu/);
  // The network goes on serving.
  await expect(page.locator("#local-mark")).toBeVisible();
});

test("an invitation is made once with its link, listed, and ended; on the network it says so", async ({ app, page }) => {
  await stubClipboard(page);
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await expect(body.getByText("Ligue o servidor para convidar.")).toBeVisible();
  await expect(body.getByRole("button", { name: "Criar convite" })).toBeDisabled();
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  // On the network only: the invitation is the network's address.
  await body.getByRole("combobox", { name: "Pode" }).selectOption("editor");
  await body.getByRole("button", { name: "Criar convite" }).click();
  await expect(body.getByText("https://192.168.1.20:51234/invite/convite-i1")).toBeVisible();
  await expect(body.getByText("Este convite é pelo endereço da sua rede", { exact: false })).toBeVisible();
  await body.getByRole("button", { name: "Copiar convite" }).click();
  await expect(body.getByText("Convite copiado.")).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toBe("https://192.168.1.20:51234/invite/convite-i1");
  // With the link on, the next one is the link's.
  await body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" }).check();
  await expect(body.locator(".ls-link-state")).toHaveText("Link no ar.");
  await body.getByRole("combobox", { name: "Pasta" }).selectOption({ label: "Nenhuma (só a conta)" });
  await expect(body.getByRole("combobox", { name: "Pode" })).toBeDisabled();
  await body.getByRole("button", { name: "Criar convite" }).click();
  await expect(body.getByText("https://exemplo-de-mesa.trycloudflare.com/invite/convite-i2")).toBeVisible();
  await expect(body.getByText("Este convite é pelo endereço da sua rede", { exact: false })).toHaveCount(0);
  // The list, freshest first, never with a link; End the first one.
  const list = body.getByRole("list", { name: "Convites" });
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator("li").nth(1)).toContainText("Vault · edita · esperando");
  await expect(list).not.toContainText("/invite/");
  await list.getByRole("button", { name: "Encerrar o convite Vault · edita" }).click();
  await expect(body.getByText("Convite encerrado: o link não abre mais nada.")).toBeVisible();
  await expect(list.locator("li").nth(1)).toContainText("Vault · edita · encerrado");
  await expect(list.getByRole("button", { name: "Encerrar o convite Vault · edita" })).toHaveCount(0);
});

test("my own address: the three steps written out, the login, a taken name said, then the link on it with no ceiling, and removed", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByText("Usar meu endereço").click();
  const own = body.locator(".ls-own");
  await expect(own.getByText("1. Tenha um domínio e adicione-o à Cloudflare", { exact: false })).toBeVisible();
  await expect(own.getByRole("button", { name: "Como adicionar um domínio à Cloudflare" })).toBeVisible();
  // Step three before step two: said which step is missing.
  const host = own.getByRole("textbox", { name: "Endereço (por exemplo, mesa.seudominio.com.br)" });
  await host.fill("mesa.exemplo.com");
  await own.getByRole("button", { name: "Configurar" }).click();
  await expect(own.getByText("Entre na Cloudflare primeiro (passo 2).")).toBeVisible();
  await own.getByRole("button", { name: "Entrar na Cloudflare" }).click();
  await expect(own.getByText("Entrou na Cloudflare.")).toBeVisible();
  await own.getByRole("textbox", { name: "Endereço (por exemplo, mesa.seudominio.com.br)" }).fill("ocupado.exemplo.com");
  await own.getByRole("button", { name: "Configurar" }).click();
  await expect(own.getByText("Esse endereço já tem outro registro de DNS na Cloudflare", { exact: false })).toBeVisible();
  await own.getByRole("textbox", { name: "Endereço (por exemplo, mesa.seudominio.com.br)" }).fill("https://Mesa.Exemplo.com/");
  await own.getByRole("button", { name: "Configurar" }).click();
  await expect(own.getByText("Seu endereço: https://mesa.exemplo.com")).toBeVisible();
  await expect(own.getByRole("checkbox", { name: "Usar meu endereço no link (em vez de um link rápido)" })).toBeChecked();
  // The link on the own address: no ceiling, no Extend.
  await body.getByRole("checkbox", { name: "Na minha rede" }).uncheck();
  await body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.locator(".ls-link-state")).toHaveText("Seu endereço está no ar.");
  await expect(body.locator(".ls-link-url")).toContainText("https://mesa.exemplo.com");
  await expect(body.getByText("Seu endereço não fecha sozinho", { exact: false })).toBeVisible();
  await expect(body.getByRole("button", { name: "Prorrogar por 12 horas" })).toBeHidden();
  await expect(own.getByRole("checkbox", { name: "Usar meu endereço no link (em vez de um link rápido)" })).toBeDisabled();
  // Removed, after a question; the link stops with it.
  await own.getByRole("button", { name: "Remover meu endereço" }).click();
  await own.getByRole("alertdialog", { name: "Remover meu endereço" }).getByRole("button", { name: "Remover meu endereço" }).click();
  await expect(own.getByText("Endereço removido.")).toBeVisible();
  await expect(own.getByText("1. Tenha um domínio e adicione-o à Cloudflare", { exact: false })).toBeVisible();
});

test("the window sits at its own table and leaves; serving stopped under it brings this computer's folder back", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const sit = body.getByRole("button", { name: "Sentar à mesa" });
  await expect(sit).toBeDisabled();
  await expect(body.getByText("Marque a pasta desta janela (inteira) e ligue o servidor", { exact: false })).toBeVisible();
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(sit).toBeEnabled();
  await sit.click();
  await expect(body.getByText("Na mesa de Vault.").first()).toBeVisible();
  // The next start opens this computer's folder, never the seat.
  expect(await page.evaluate(() => localStorage.getItem("verso.lastFolder"))).toBe("harness");
  // The way back is on the status bar too, with Settings closed.
  await app.key("Escape");
  await page.locator("#local-mark").getByRole("button", { name: "Sair da mesa" }).click();
  await expect(page.locator("#local-mark").getByRole("button", { name: "Sair da mesa" })).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("De volta à pasta deste computador.");
  // Sitting again, then serving stopped: back by itself, and said.
  await section(app);
  await page.locator(".settings-body").getByRole("button", { name: "Sentar à mesa" }).click();
  await expect(page.locator(".settings-body").getByText("Na mesa de Vault.").first()).toBeVisible();
  await app.key("Escape");
  await page.locator("#local-mark").getByRole("button", { name: "Parar de servir ao celular" }).click();
  await expect(page.locator("#status")).toContainText("O servidor parou: a janela voltou à pasta deste computador.");
});
