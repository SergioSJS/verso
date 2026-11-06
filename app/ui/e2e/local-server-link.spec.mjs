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
  // Said once, in the panel: not again under the switch.
  await expect(body.getByText("Link no ar.", { exact: true })).toHaveCount(1);
  // The section's lead and the folders' say the players and the link, not only the phone.
  await expect(body.getByText(/aos jogadores em qualquer lugar por um link na internet/)).toBeVisible();
  await expect(body.getByText("Só as pastas marcadas aqui são servidas; nenhuma vem marcada.", { exact: false })).toBeVisible();
  // Right under it: a new quick link takes a moment to open everywhere.
  await expect(body.locator(".ls-link-state + p")).toHaveText("Um link novo pode levar até um minuto para abrir.");
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

test("the first download of cloudflared says how far it got and can be cancelled; nothing starts after", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("checkbox", { name: "Na minha rede" }).uncheck();
  const link = body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" });
  await link.check();
  await page.evaluate(() => window.__harness.core.localServer.slowLink(12 * 1048576, 40 * 1048576));
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.locator(".ls-link-state")).toHaveText(/^Baixando o cloudflared, da Cloudflare: 12 de 40 MB\./);
  // Where the person waits, and in the status bar: not "serving" yet.
  await expect(page.locator("#local-mark")).toContainText("Ligando o link…");
  await expect(page.locator("#local-mark")).not.toContainText("Servindo");
  const cancel = body.getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(body.getByText("Cancelado: o link não foi ligado.").first()).toBeVisible();
  await expect(link).not.toBeChecked();
  await expect(cancel).toBeHidden();
  await expect(page.locator("#local-mark")).toHaveCount(0);
  await expect(body.getByRole("button", { name: "Ligar o servidor" })).toBeEnabled();
  const s = await page.evaluate(() => window.__harness.core.invoke("local_server_status", {}));
  expect([s.serving, s.link.state]).toEqual([false, "off"]);
});

// The re-test of 2026-11-04 (VM 104): after Cancel the box was ticked
// again and the panel said "O link liga junto com o servidor." beside
// "Cancelado". The host's answers do not come back in the order asked: one
// asked while it downloaded was drawn after the Cancel.
for (const order of ["asked", "reverse"]) {
  test(`Cancel during the download leaves the box unticked, whatever order the host's answers come back in (${order})`, async ({ app, page }) => {
    await app.open();
    await section(app);
    const body = page.locator(".settings-body");
    await body.getByRole("checkbox", { name: /^Vault/ }).check();
    await body.getByRole("checkbox", { name: "Na minha rede" }).uncheck();
    const link = body.getByRole("checkbox", { name: "Por um link na internet (Cloudflare, modo de teste)" });
    await link.check();
    await page.evaluate(() => window.__harness.core.localServer.slowLink(12 * 1048576, 40 * 1048576));
    await body.getByRole("button", { name: "Ligar o servidor" }).click();
    const live = body.locator(".ls-link-state");
    await expect(live).toHaveText(/^Baixando o cloudflared/);
    // The download says how far it got: the section asks the status, and
    // that answer, read while it downloads, comes back late.
    await page.evaluate(() => {
      window.__harness.core.localServer.holdStatus();
      void window.__harness.emit("local-server-link", { state: "starting", origin: null, until: null, own: false, ended: null, protocol: null, qr: [], download: { done: 13 * 1048576, total: 40 * 1048576 } });
    });
    await body.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(body.getByText("Cancelado: o link não foi ligado.").first()).toBeVisible();
    const held = await page.evaluate((order) => window.__harness.core.localServer.releaseStatus(order), order);
    expect(held).toBeGreaterThan(1);
    await expect(link).not.toBeChecked();
    await expect(body.getByText("O link liga junto com o servidor.")).toHaveCount(0);
    await expect(live).not.toHaveText(/Baixando/);
    await expect(body.getByRole("button", { name: "Cancelar", exact: true })).toBeHidden();
    // Nothing comes back by itself.
    await page.waitForTimeout(300);
    await expect(link).not.toBeChecked();
  });
}

// The re-test of 2026-11-04 (VM 104): the status bar's mark read
// "Servindo · ligando o link…" for up to 7 s after the panel said "Link no
// ar.". The mark asked the host apart from the panel, and drew whichever
// answer came back last.
test("the status bar's mark says the link is up the moment the panel does, whatever order the host's answers come back in", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false }).first()).toBeVisible();
  const mark = page.locator("#local-mark");
  const live = body.locator(".ls-link-state");
  // The link starting, as the host tells it.
  const tell = (link) =>
    page.evaluate((link) => {
      const full = { state: "off", origin: null, until: null, own: false, ended: null, protocol: null, qr: [], download: null, ...link };
      window.__harness.core.localServer.setLink(full);
      void window.__harness.emit("local-server-link", full);
    }, link);
  await tell({ state: "starting" });
  await expect(mark).toContainText("Servindo · ligando o link…");
  // Up: the answers read while it started come back after those read once
  // it was up.
  await page.evaluate(() => window.__harness.core.localServer.holdStatus());
  await tell({ state: "starting" });
  await tell({ state: "on", origin: "https://exemplo-de-mesa.trycloudflare.com", until: Math.floor(Date.now() / 1000) + 12 * 3600, protocol: "quic" });
  await page.evaluate(() => window.__harness.core.localServer.releaseStatus("reverse"));
  await expect(live).toHaveText("Link no ar.");
  await expect(mark).toContainText("Servindo · link na internet");
  // And it stays so.
  await page.waitForTimeout(300);
  await expect(mark).toContainText("Servindo · link na internet");
  await expect(live).toHaveText("Link no ar.");
});

test("your name for the players: the system's user at first, changed and kept, never empty", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const name = body.getByRole("textbox", { name: "Seu nome para os jogadores" });
  await expect(name).toHaveValue("Sérgio");
  await expect(name).toHaveAccessibleDescription(/Como os jogadores veem você no chat/);
  await name.fill("  Mestre Sérgio ");
  await name.press("Enter");
  await expect(body.getByText("Os jogadores veem você como Mestre Sérgio.").first()).toBeVisible();
  expect(await app.calls("local_server_owner_name")).toEqual([{ name: "Mestre Sérgio" }]);
  await expect(name).toHaveValue("Mestre Sérgio");
  await name.fill("   ");
  await body.getByRole("button", { name: "Salvar nome" }).click();
  await expect(body.getByText("Escreva um nome para os jogadores.").first()).toBeVisible();
  await expect(name).toHaveValue("Mestre Sérgio");
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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

test("invitations are made from the folder's page; Settings lists them, never with a link, and ends one waiting", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  // No form here: the folder's page invites, as on a UniVerso.
  await expect(body.getByRole("button", { name: "Criar convite" })).toHaveCount(0);
  await expect(body.getByText("Convide pela página da pasta, como num UniVerso", { exact: false })).toBeVisible();
  await expect(body.getByRole("list", { name: "Convites" })).toContainText("Nenhum convite ainda.");
  // Two made at the folder's page (a table's and a share's), as the server lists them.
  await page.evaluate(() => {
    const ls = window.__harness.core.localServer;
    ls.addInvitation("Vault", "editor");
    ls.addInvitation("Vault/Mapas", "reader");
  });
  await app.key("Escape");
  await section(app);
  const list = page.locator(".settings-body").getByRole("list", { name: "Convites" });
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
  // An own address is no new name: no wait to say.
  await expect(body.getByText("Um link novo pode levar até um minuto para abrir.")).toBeHidden();
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

test("a served folder's window sits at its table by itself: making a table, opening one, no seat button", async ({ app, page }) => {
  // ADR 0117 D4 Q3, revised 2026-11-05 (the maintainer: "PQ EU PRECISO
  // CLICAR NUM BOTÃO SENTAR À MESA se eu estou com o app aberto?!").
  await app.open();
  // Not served: the folder's menu has no table row (a folder of this
  // computer alone has none).
  await page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await expect(page.getByRole("menuitem", { name: "Tornar a pasta toda uma mesa" })).toHaveCount(0);
  await app.key("Escape");
  await section(app);
  const body = page.locator(".settings-body");
  await expect(body.getByRole("button", { name: "Sentar à mesa" })).toHaveCount(0);
  await expect(body.getByText("Esta janela na mesa")).toHaveCount(0);
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(page.locator("#local-mark")).toBeVisible();
  await app.key("Escape");
  // Served: the owner's row is there, and it sits first, then makes the table.
  await page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await page.getByRole("menuitem", { name: "Tornar a pasta toda uma mesa" }).click();
  const made = page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(made).toBeVisible();
  await expect.poll(() => app.calls("local_server_sit_at_table")).toHaveLength(1);
  // Where it is hosted, before its link is made (the maintainer, 2026-11-05).
  await expect(made.getByText("Hospedada em: este computador (https://192.168.1.20:51234)")).toBeVisible();
  await expect.poll(() => app.calls("campaign_make")).toEqual([{ root: "" }]);
  // The next start opens this computer's folder, never the seat.
  expect(await page.evaluate(() => localStorage.getItem("verso.lastFolder"))).toBe("harness");
  await app.key("Escape");
  // No way "out of the table" to press: the mark has only its Stop.
  await expect(page.locator("#local-mark").getByRole("button", { name: "Sair da mesa" })).toHaveCount(0);
  // Serving stopped under it: back to this computer's folder, said.
  await page.locator("#local-mark").getByRole("button", { name: "Parar de servir ao celular" }).click();
  await expect(page.locator("#status")).toContainText("O servidor parou: a janela voltou à pasta deste computador.");
  await expect(page.getByText("Sessão encerrada", { exact: false })).toHaveCount(0);
  // Served again, the folder has its table: the window sits by itself.
  await section(app);
  await page.locator(".settings-body").getByRole("button", { name: "Ligar o servidor" }).click();
  const before = page.getByRole("dialog", { name: "Antes de ligar" });
  if (await before.isVisible()) await before.getByRole("button", { name: "Entendi, ligar" }).click();
  await expect.poll(() => app.calls("local_server_sit_at_table")).toHaveLength(2);
  await expect(page.locator("#status")).toContainText("Na mesa de Vault.");
  await app.key("Escape");
  await page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await expect(page.getByRole("menuitem", { name: /^Mesa/ }).first()).toBeVisible();
  await app.key("Escape");
  await section(app);
  await expect(page.locator(".settings-nav-item", { hasText: /^(Sem rede|Offline)$/ })).toHaveCount(0);
});
