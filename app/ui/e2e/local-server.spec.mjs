// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Turn into a server" (ADR 0096; walkthrough, section 11): Settings'
// section turns it on and off over folders the person ticked, with the
// system's prompts explained first; the pairing dialog shows a QR, an
// address and a code, a countdown and, when a phone asks, "Was it you?";
// paired phones are listed with Revoke; the status bar says it serves.
// The harness answers in memory — the Rust tests drive the real server.

import { expect, test } from "./fixtures.mjs";

async function section(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).click();
}

test("it is off, serves only the ticked folders, and says what the system will ask first", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await expect(body.getByText("Desligado.")).toBeVisible();
  // None comes ticked. A folder that syncs with a server is ticked like any
  // other (the host's tests); one shared with this person by another
  // account cannot be: its owner serves it.
  const vault = body.getByRole("checkbox", { name: /^Vault/ });
  await expect(vault).not.toBeChecked();
  // The others are in the shut group of recent folders.
  await body.locator("details.ls-recent summary").click();
  await expect(body.getByRole("checkbox", { name: "Compartilhada" })).toBeDisabled();
  await expect(body.getByText("compartilhada com você em notas.exemplo: só quem é dona dela pode servi-la")).toBeVisible();
  // Nothing ticked: it will not start, and says so where the button is.
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("Marque ao menos uma pasta para servir.")).toBeVisible();
  await vault.check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false }).first()).toBeVisible();
  // Said once, beside the switch: not again under it (the walk of 2026-11-06).
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false })).toHaveCount(1);
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
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
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
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
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
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
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
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
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

test("when a phone asks, the dialog's actions are one row: refuse and allow, no Close apart", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  // Before a phone asks: the code, the QR, the fingerprint and one Close.
  await expect(dialog.getByRole("img", { name: "QR de pareamento" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fechar" })).toBeVisible();
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("iPhone da Ana"));
  await expect(dialog.getByText("Foi você quem leu este QR?")).toBeVisible();
  const refuse = dialog.getByRole("button", { name: "Não fui eu: recusar" });
  const allow = dialog.getByRole("button", { name: "Permitir" });
  // The two answers close the dialog themselves; a third button under them
  // was the bug (2026-10-15).
  await expect(dialog.getByRole("button", { name: "Fechar" })).toBeHidden();
  const [r, a, box] = await Promise.all([refuse.boundingBox(), allow.boundingBox(), dialog.locator(".ls-dialog, .plan-box").first().boundingBox()]);
  expect(Math.abs(r.y - a.y)).toBeLessThanOrEqual(2);
  expect(r.x + r.width).toBeLessThanOrEqual(a.x);
  // Both inside the dialog, which does not scroll sideways.
  for (const b of [r, a]) {
    expect(b.x).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  const sideways = await dialog.locator(".plan-box").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(sideways).toBe(false);
});

test("a paired phone can be let edit, or only read, without pairing again", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  await expect(dialog.getByRole("img", { name: "QR de pareamento" })).toBeVisible();
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("Pixel do Caio"));
  await dialog.getByRole("button", { name: "Permitir" }).click();
  await expect(body.getByText("Pixel do Caio · só lê")).toBeVisible();
  const toggle = body.getByRole("checkbox", { name: "Pixel do Caio: pode editar as notas" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(body.getByText("Pixel do Caio agora pode editar as notas.")).toBeVisible();
  await expect(body.getByText("Pixel do Caio · edita")).toBeVisible();
  await expect(body.getByRole("checkbox", { name: "Pixel do Caio: pode editar as notas" })).toBeChecked();
  await body.getByRole("checkbox", { name: "Pixel do Caio: pode editar as notas" }).uncheck();
  await expect(body.getByText("Pixel do Caio · só lê")).toBeVisible();
  await body.getByText("O que aconteceu").click();
  await expect(body.locator(".ls-log-list")).toContainText("Celular passou a editar");
  await expect(body.locator(".ls-log-list")).toContainText("Celular passou a só ler");
});

test("the pairing dialog copies the link the QR encodes, for the address picked", async ({ app, page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.addInitScript(() => {
    // The clipboard stubbed: what is written is what the test reads, in
    // every engine.
    window.__copied = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
  });
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  await dialog.getByRole("button", { name: "Copiar link" }).click();
  await expect(dialog.getByText("Link copiado — vale 2 minutos, uma vez.")).toBeVisible();
  expect(await page.evaluate(() => window.__copied)).toBe("https://192.168.3.122:51234/pair#t=harness&fp=abcd&c=0123456789abcdef");
  // It follows the address picker.
  await dialog.getByRole("combobox", { name: "Endereço que o celular vai usar" }).selectOption("10.217.1.73");
  await expect(dialog.getByText("Novo QR para 10.217.1.73.")).toBeVisible();
  await dialog.getByRole("button", { name: "Copiar link" }).click();
  expect(await page.evaluate(() => window.__copied)).toBe("https://10.217.1.73:51234/pair#t=harness&fp=abcd&c=0123456789abcdef");
});

test("the devices connected at once is a number from 1 to 16, 4 by default, kept when changed", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const most = body.getByLabel("Aparelhos conectados ao mesmo tempo");
  await expect(most).toHaveValue("4");
  // The number can be read: not a check's 16 px box (2026-10-16).
  expect((await most.boundingBox()).width).toBeGreaterThanOrEqual(40);
  await body.getByRole("button", { name: "Um aparelho a mais" }).click();
  await expect(most).toHaveValue("5");
  await expect(body.getByText("Até 5 aparelhos conectados ao mesmo tempo.")).toBeVisible();
  await most.fill("2");
  await most.dispatchEvent("change");
  await expect(body.getByText("Até 2 aparelhos conectados ao mesmo tempo.")).toBeVisible();
  // Out of 1 to 16: said, and the number put back.
  await most.fill("20");
  await most.dispatchEvent("change");
  await expect(body.getByText("Use um número de 1 a 16.")).toBeVisible();
  await expect(most).toHaveValue("2");
  // Kept: the section drawn again shows it.
  await app.key("Escape");
  await section(app);
  await expect(body.getByLabel("Aparelhos conectados ao mesmo tempo")).toHaveValue("2");
});

test("many folders are listed as in the folder switcher: the command's order, no groups, twins told apart, a filter, a count, and it fits a phone @layout", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  // The folder open in this window comes first, on its own, with its name;
  // the others are in a group that is shut until opened, with its count.
  await expect(body.getByRole("heading", { name: "Aberto nesta janela" })).toBeVisible();
  const recent = body.locator("details.ls-recent");
  await expect(recent.locator("summary")).toHaveText("Recentes · 11 pastas");
  await expect(recent).not.toHaveAttribute("open", "");
  const list = body.getByRole("list", { name: "Pastas deste computador, as mais recentes primeiro" });
  await expect(list).toBeHidden();
  await recent.locator("summary").click();
  await expect(list).toBeVisible();
  // One flat row per folder, in the order the command returns them (the
  // harness answers freshest first); no groups, no repetition of the open one.
  await expect(list.locator("summary, details")).toHaveCount(0);
  const names = await list.locator(".ls-name").allTextContents();
  expect(names).toEqual(["Compartilhada", "Caderno", "Caderno", "mac-vault-import", "mac-vault-import", "Sandbox", "Receitas", "Trabalho", "Diario", "Estudos", "Projetos"]);
  await expect(body.getByRole("checkbox", { name: "Sandbox" })).toBeVisible();
  // Only the two pairs of the same name carry the directory, in an element of
  // its own and set off by a comma for a screen reader.
  await expect(list.locator(".ls-place")).toHaveText([", em obsidian", ", em Dropbox", ", em obsidian", ", em Downloads"]);
  await expect(list.getByText("em Documents")).toHaveCount(0);
  await expect(body.getByRole("checkbox", { name: "Compartilhada" })).toHaveAccessibleDescription(/notas\.exemplo/);
  const twin = list.getByRole("checkbox", { name: "Caderno" }).first();
  await expect(twin).toHaveAccessibleDescription(", em obsidian");
  // Ticking calls the command: the count says so.
  await body.getByRole("checkbox", { name: "Sandbox" }).check();
  await expect(body.locator(".ls-h", { hasText: "1 marcada de 12" })).toBeVisible();
  await expect(recent.locator("summary")).toHaveText("Recentes · 11 pastas · 1 marcada");
  await expect(body.getByRole("checkbox", { name: "Sandbox" })).toBeChecked();
  // The filter finds by name or by place.
  const filter = body.getByRole("searchbox", { name: "Filtrar pastas" });
  await filter.fill("receitas");
  await expect(body.getByRole("checkbox", { name: "Receitas" })).toBeVisible();
  await expect(body.getByRole("checkbox", { name: "Sandbox" })).toHaveCount(0);
  await expect(body.getByText("1 de 11 pastas")).toBeVisible();
  await filter.fill("zzzz");
  await expect(body.getByText("Nenhuma pasta combina com o filtro.")).toBeVisible();
  await filter.press("Escape");
  await expect(filter).toHaveValue("");
  // The folder shared with this person says why its box is off, on its row.
  await expect(body.getByRole("checkbox", { name: "Compartilhada" })).toHaveAccessibleDescription(/notas\.exemplo/);
  // A phone's width: nothing runs off the side.
  await page.setViewportSize({ width: 360, height: 700 });
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a ticked folder can be served in part: a tree of its folders, a folder serves what is inside it, none is all of it", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const vault = body.getByRole("checkbox", { name: /^Vault/ });
  // Only a ticked folder offers the choice.
  await expect(body.locator(".ls-here .ls-parts")).toHaveCount(0);
  await vault.check();
  // The open folder's tree is there at once, with no button to open it.
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", serve tudo");
  await expect(body.getByRole("button", { name: /^Escolher pastas/ })).toHaveCount(0);
  await expect(body.getByText("Marque só o que os seus celulares podem ver;", { exact: false })).toBeVisible();
  await expect(body.getByText("Desmarcar a última pasta para de servir este cofre", { exact: false })).toBeVisible();
  // Nothing to go back to while all of it is served: the button is not there.
  await expect(body.getByRole("button", { name: "Servir a pasta inteira" })).toHaveCount(0);
  const tree = body.getByRole("list", { name: "Pastas dentro de Vault" });
  await expect(tree).toBeVisible();
  // Folders with folders inside are closed; the others are plain rows.
  const projetos = tree.getByRole("checkbox", { name: "Servir Projetos", exact: true });
  await expect(projetos).toBeVisible();
  await expect(tree.getByRole("checkbox", { name: "Servir Projetos/Mesa" })).toBeHidden();
  await tree.getByRole("button", { name: "Mostrar as pastas dentro de Projetos" }).click();
  await expect(tree.getByRole("checkbox", { name: "Servir Projetos/Mesa" })).toBeVisible();
  // Ticking Projetos: it is a part now, the folder is neither all nor none,
  // and what is inside Projetos is served with it, not on its own.
  await projetos.check();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", só 1 pasta");
  await expect(vault).not.toBeChecked();
  await expect(vault).toHaveJSProperty("indeterminate", true);
  const mesa = tree.getByRole("checkbox", { name: "Servir Projetos/Mesa" });
  await expect(mesa).toBeChecked();
  await expect(mesa).toBeDisabled();
  await expect(mesa).toHaveAccessibleDescription("servida junto com Projetos");
  // The keyboard reaches it: Tab to a row and Space ticks it.
  await tree.getByRole("button", { name: "Mostrar as pastas dentro de Diario" }).click();
  await tree.getByRole("button", { name: "Mostrar as pastas dentro de 2026" }).click();
  const outubro = tree.getByRole("checkbox", { name: "Servir Diario/2026/Outubro" });
  await outubro.focus();
  await page.keyboard.press("Space");
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", só 2 pastas");
  await expect(tree.getByRole("checkbox", { name: "Servir Diario/2026/Outubro" })).toBeFocused();
  await expect(tree.getByRole("checkbox", { name: "Servir Diario", exact: true })).toHaveJSProperty("indeterminate", true);
  // A folder with a chosen folder inside reads "mixed": a click on it opens
  // it and widens nothing.
  const diario = tree.getByRole("checkbox", { name: "Servir Diario", exact: true });
  await diario.click();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", só 2 pastas");
  await expect(diario).toHaveJSProperty("indeterminate", true);
  await expect(tree.getByRole("checkbox", { name: "Servir Diario/2026/Outubro" })).toBeChecked();
  // Unticking the last chosen folder stops serving the vault, and the choice
  // goes (the maintainer, 2026-10-16: "Para de servir o cofre").
  await tree.getByRole("checkbox", { name: "Servir Diario/2026/Outubro" }).uncheck();
  await tree.getByRole("checkbox", { name: "Servir Projetos", exact: true }).click();
  await expect(vault).not.toBeChecked();
  await expect(vault).toHaveJSProperty("indeterminate", false);
  await expect(body.locator(".ls-here .ls-parts")).toHaveCount(0);
  await vault.check();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", serve tudo");
  await expect(vault).toBeChecked();
  // Choose again. A click on the folder's own box, which reads "mixed",
  // opens the tree and serves nothing more or less; the way back to the
  // whole folder is the tree's own button.
  await tree.getByRole("checkbox", { name: "Servir Segredo" }).check();
  await expect(vault).toHaveJSProperty("indeterminate", true);
  await vault.click();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", só 1 pasta");
  await expect(vault).toHaveJSProperty("indeterminate", true);
  await expect(tree.getByRole("checkbox", { name: "Servir Segredo" })).toBeChecked();
  // The vault's attachments folder goes along, files only, read-only; and
  // says none does when it would be one of the chosen.
  await expect(body.getByText("A pasta de anexos do cofre, “Anexos”, vai junto, só para ler: só arquivos, nenhuma nota.")).toBeVisible();
  await tree.getByRole("checkbox", { name: "Servir Anexos" }).check();
  await expect(body.getByText("Nenhuma pasta de anexos vai junto", { exact: false })).toBeVisible();
  await tree.getByRole("checkbox", { name: "Servir Anexos" }).uncheck();
  await body.getByRole("button", { name: "Servir a pasta inteira" }).click();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", serve tudo");
  await expect(vault).toHaveJSProperty("indeterminate", false);
  await expect(vault).toBeChecked();
  // A mixed vault can be stopped from its tree, and the focus goes to its box.
  await tree.getByRole("checkbox", { name: "Servir Segredo" }).check();
  await body.getByRole("button", { name: "Parar de servir este cofre" }).click();
  await expect(vault).not.toBeChecked();
  await expect(vault).toBeFocused();
  await expect(body.locator(".ls-here .ls-parts")).toHaveCount(0);
  await vault.check();
  await expect(body.locator(".ls-here .ls-serves")).toHaveText(", serve tudo");
});

test("the folders chosen inside a folder are locked while serving, and a bad choice is said", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  const tree = body.getByRole("list", { name: "Pastas dentro de Vault" });
  await tree.getByRole("checkbox", { name: "Servir Anexos" }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("Servindo em 192.168.1.20:51234", { exact: false }).first()).toBeVisible();
  await expect(tree.getByRole("checkbox", { name: "Servir Anexos" })).toBeDisabled();
  await expect(tree.getByRole("checkbox", { name: "Servir Segredo" })).toBeDisabled();
  await expect(body.getByRole("checkbox", { name: /^Vault/ })).toBeDisabled();
  // The tree stays readable (open and closed) while it serves.
  await tree.getByRole("button", { name: "Mostrar as pastas dentro de Diario" }).click();
  await expect(tree.getByRole("checkbox", { name: "Servir Diario/2026" })).toBeDisabled();
});

test("a chosen folder gone from the disk is left out at the start and said, and with none left it will not start", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  const tree = body.getByRole("list", { name: "Pastas dentro de Vault" });
  await tree.getByRole("checkbox", { name: "Servir Antigo" }).check();
  // Only the lost folder chosen: it refuses, and says why, never the whole.
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await expect(body.getByText("none of the folders chosen inside it is there any more", { exact: false })).toBeVisible();
  await expect(body.getByText("Desligado.")).toBeVisible();
  // With another one chosen it serves that one and says what it left out.
  await tree.getByRole("checkbox", { name: "Servir Projetos", exact: true }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await expect(body.getByText("ficaram de fora por não existirem mais no disco: Vault/Antigo", { exact: false }).first()).toBeVisible();
  await expect(body.getByText("Não estão mais no disco e ficaram de fora: Antigo.")).toBeVisible();
  // With serving off the line stays, for the person to act on, until the
  // choice changes.
  await body.getByRole("button", { name: "Parar de servir", exact: true }).click();
  await expect(body.getByText("Desligado.").first()).toBeVisible();
  await expect(body.getByText("Não estão mais no disco e ficaram de fora: Antigo.")).toBeVisible();
  await tree.getByRole("checkbox", { name: "Servir Antigo" }).uncheck();
  await expect(body.getByText("Não estão mais no disco e ficaram de fora: Antigo.")).toHaveCount(0);
});

test("the recent folders are a group that is shut by default, remembered, with the filter inside it", async ({ app, page }) => {
  await app.open();
  await section(app);
  const body = page.locator(".settings-body");
  const recent = body.locator("details.ls-recent");
  await expect(recent.locator("summary")).toHaveText("Recentes · 11 pastas");
  // Shut: the rows and the filter are not there to reach.
  await expect(body.getByRole("searchbox", { name: "Filtrar pastas" })).toBeHidden();
  await expect(body.getByRole("checkbox", { name: "Sandbox" })).toBeHidden();
  // By keyboard: the summary opens and shuts it.
  await recent.locator("summary").focus();
  await page.keyboard.press("Enter");
  const filter = body.getByRole("searchbox", { name: "Filtrar pastas" });
  await expect(filter).toBeVisible();
  // The filter filters the group and nothing else: the open folder stays.
  await filter.fill("receitas");
  await expect(body.getByRole("checkbox", { name: "Receitas" })).toBeVisible();
  await expect(body.getByRole("checkbox", { name: "Sandbox" })).toHaveCount(0);
  await expect(body.getByRole("checkbox", { name: /^Vault/ })).toBeVisible();
  await filter.press("Escape");
  // A ticked recent folder has its tree behind its own button, as before.
  await body.getByRole("checkbox", { name: "Sandbox" }).check();
  const open = body.getByRole("button", { name: "Escolher pastas · serve tudo" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await expect(body.getByRole("list", { name: "Pastas dentro de Sandbox" })).toBeVisible();
  await expect(recent.locator("summary")).toHaveText("Recentes · 11 pastas · 1 marcada");
  // What was left open is kept for the viewer, and shut is kept too.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("verso-served-recent-open"))).toBe("1");
  await recent.locator("summary").click();
  await expect(recent).not.toHaveAttribute("open", "");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("verso-served-recent-open"))).toBe("0");
});

/** Where a dialog's box sits in the window, and whether it scrolls inside. */
async function placed(page, name) {
  const box = page.getByRole("dialog", { name }).locator(".ls-dialog");
  return box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, vw: innerWidth, vh: innerHeight, scrolls: el.scrollHeight > el.clientHeight + 1 };
  });
}

// The maintainer's screenshot, 2026-11-05: "Parear um celular" sat low and
// narrow over Settings, scrolling inside although there was room. The
// section's dialogs are centred in the window and held within it; at a
// desktop size the pairing dialog has its QR beside the facts and does not
// scroll; on a phone it fits the width.
for (const [size, wide] of [[{ width: 1280, height: 800 }, true], [{ width: 390, height: 844 }, false]]) {
  test(`the section's dialogs are centred and held within the window, ${size.width}×${size.height} @layout`, async ({ app, page }) => {
    await page.setViewportSize(size);
    await app.open();
    await section(app);
    const body = page.locator(".settings-body");
    await body.getByRole("checkbox", { name: /^Vault/ }).check();
    await body.getByRole("button", { name: "Ligar o servidor" }).click();
    const first = await placed(page, "Antes de ligar");
    for (const p of [first]) {
      expect(Math.abs(p.left + p.right - p.vw)).toBeLessThanOrEqual(2);
      expect(Math.abs(p.top + p.bottom - p.vh)).toBeLessThanOrEqual(2);
      expect(p.scrolls).toBe(false);
    }
    await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
    await body.getByRole("button", { name: "Parear um celular" }).click();
    await expect(page.getByRole("dialog", { name: "Parear um celular" }).getByText("BCDF-GHJK")).toBeVisible();
    const pair = await placed(page, "Parear um celular");
    expect(Math.abs(pair.left + pair.right - pair.vw)).toBeLessThanOrEqual(2);
    expect(pair.top).toBeGreaterThanOrEqual(15);
    expect(pair.bottom).toBeLessThanOrEqual(pair.vh - 15);
    expect(pair.right - pair.left).toBeLessThanOrEqual(pair.vw - 30);
    if (wide) {
      expect(pair.scrolls).toBe(false);
      expect(pair.width).toBeGreaterThan(640);
    }
    // Escape closes it, and the focus goes back to Settings.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Parear um celular" })).toHaveCount(0);
    await expect(page.locator(".settings")).toBeVisible();
  });
}
