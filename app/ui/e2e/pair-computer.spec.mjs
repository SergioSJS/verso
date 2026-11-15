// "Parear com um computador de casa" (ADR 0117, "The Verso app paired";
// the maintainer, 2026-11-15): the phone's Verso — and any app — pairs with
// the computer at home that serves, by the address and the code of its
// *Pair a phone* dialog; the computer is then a server of Settings ›
// Servers, named for what it is, whose folder is picked as any server's: a
// copy here. Away from home the copy's status says so calmly; a computer
// whose identity was replaced is said as that. And the computer's own
// dialog tells the person about the app, and says when the app asks. The
// harness stands in for the host (src/harness/pairComputer.ts).

import { test, expect } from "./fixtures.mjs";

const URL = "https://verso-0123456789abcdef0123.home.arpa:51234";

async function openServers(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).first().click();
}

const form = (app) => app.page.getByRole("form", { name: "Parear com um computador de casa" });

test("a phone pairs by the computer's address and code, and its folder is picked as a copy", async ({ app }) => {
  await app.open("?host=mobile");
  await app.page.evaluate(() => {
    window.__harness.core.handlers.server_folders = () => ({ folders: [{ id: "f1", name: "Campanha", role: "editor", owner: null, share: false, missing: false }], may_create: false });
    window.__harness.serverCopy.sizes.set("f1", { name: "Campanha", files: 2, bytes: 4096 });
  });
  await openServers(app);
  const f = form(app);
  await expect(f).toBeVisible();
  await expect(f).toContainText("Parear um celular");
  await f.getByLabel("Endereço do computador").fill("192.168.1.20:51234");
  await f.getByLabel("Código").fill("bcdf ghjk");
  await f.getByRole("button", { name: "Parear" }).click();
  await expect(f.locator(".srv-said")).toHaveText("Pareado. Escolha abaixo uma pasta do computador de casa para guardar a cópia dela aqui.");
  expect((await app.calls("server_pair")).at(-1)).toEqual({ address: "192.168.1.20:51234", code: "bcdf ghjk" });
  // Listed as what it is, never by the name the app reaches it by.
  const block = app.page.getByRole("region", { name: "Computador de casa · Sérgio" });
  await expect(block).toBeVisible();
  await expect(block).not.toContainText("home.arpa");
  await expect(block).toContainText("Pareado: este aparelho guarda cópias");
  await block.getByRole("button", { name: /^Abrir Campanha nesta janela/ }).click();
  const q = app.page.getByRole("dialog", { name: "Abrir “Campanha”" });
  await q.getByRole("button", { name: "Baixar e abrir" }).click();
  await expect.poll(async () => (await app.calls("server_copy_make")).at(-1)).toEqual({ url: URL, folder: "f1", place: "in_app" });
  await expect(q.locator(".copy-said")).toHaveText(/^Pronto: 2 arquivos/);
});

test("a wrong code, an address with no port and a refusal are said in the person's language, with a try again", async ({ app }) => {
  // The host's refusals are logged as such; here they are the point.
  app.expected.push(/refused: the address has its port/, /refused: the code was not right/, /refused: the computer said no/);
  await app.open("?host=mobile");
  await openServers(app);
  const f = form(app);
  await f.getByLabel("Endereço do computador").fill("192.168.1.20");
  await f.getByLabel("Código").fill("BCDF-GHJK");
  await f.getByRole("button", { name: "Parear" }).click();
  await expect(f.getByRole("alert")).toContainText("com a porta depois dos dois-pontos");
  await f.getByLabel("Endereço do computador").fill("192.168.1.20:51234");
  await f.getByLabel("Código").fill("XXXX-XXXX");
  await f.getByRole("button", { name: "Parear" }).click();
  await expect(f.getByRole("alert")).toContainText("O código não confere");
  await app.page.evaluate(() => (window.__harness.pairComputer.refuse = true));
  await f.getByLabel("Código").fill("BCDF-GHJK");
  await f.getByRole("alert").getByRole("button", { name: "Tentar de novo" }).click();
  await expect(f.getByRole("alert")).toContainText("O computador disse não");
  await expect(app.page.getByRole("region", { name: /Computador de casa/ })).toHaveCount(0);
});

test("away from home the copy says so calmly; a replaced identity is said as that", async ({ app, page }) => {
  await app.open();
  const status = { key: "harness", on: true, server: URL, folder: "f1", folder_name: "Campanha", role: "editor", state: "offline", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: null, message: "verso-0123456789abcdef0123.home.arpa:51234", problem: "unreachable", versions: null, revoked: null, cloud: null };
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
  await expect(page.locator("#sync-state")).toHaveText("Longe do computador de casa: a cópia funciona sem ele");
  const changed = { ...status, state: "error", problem: "identity_changed", message: "this computer's identity changed: …" };
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, changed);
  await app.emit("sync-status", changed);
  await expect(page.locator("#sync-state")).toContainText("a identidade do computador de casa mudou");
});

test("the computer's dialog tells about the app, and says when the app asks", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).click();
  const body = page.locator(".settings-body");
  await body.getByRole("checkbox", { name: /^Vault/ }).check();
  await body.getByRole("button", { name: "Ligar o servidor" }).click();
  await page.getByRole("dialog", { name: "Antes de ligar" }).getByRole("button", { name: "Entendi, ligar" }).click();
  await body.getByRole("button", { name: "Parear um celular" }).click();
  const dialog = page.getByRole("dialog", { name: "Parear um celular" });
  await expect(dialog).toContainText("Parear com um computador de casa");
  await page.evaluate(() => window.__harness.core.localServer.askAsPhone("Verso · Pixel da Ana", false, true));
  await expect(dialog.getByRole("heading", { name: "Foi você quem digitou este código no app Verso?" })).toBeVisible();
  await expect(dialog).toContainText("É o app Verso, não o navegador");
});
