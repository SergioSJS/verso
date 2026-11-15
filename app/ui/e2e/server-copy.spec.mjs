// A server's folder picked in the app (the maintainer, 2026-11-15, after a
// folder opened from his UniVerso on the Android app would not open again
// in airplane mode): on every app, the pick downloads the whole folder into
// a folder of this device, binds it with sync and opens that copy. Where it
// goes is asked now, with the folder's size — inside the app or the phone's
// Documents on Android, the app's Documents on iOS, a folder chosen on a
// desktop — and the window on the server alone stays the other way. Once
// the copy is here the pick opens it, offline too, with nothing asked. The
// harness stands in for the host (src/harness/serverCopy.ts).

import { test, expect } from "./fixtures.mjs";

const URL = "http://localhost:7351";
const SAID = "Não foi possível alcançar o servidor localhost:7351 — ele está fora do ar ou sem rede.";

/** Signed in to a server with the folder "Campanha", of 3 files. */
async function signedIn(app) {
  await app.page.evaluate((url) => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url, email: "ana@casa.lan", name: "Ana" }];
    h.server_folders = () => ({ folders: [{ id: "f1", name: "Campanha", role: "owner", owner: null, share: false, missing: false }], may_create: false });
    window.__harness.serverCopy.sizes.set("f1", { name: "Campanha", files: 3, bytes: 2516582 });
  }, URL);
}

/** The folder switcher's row of the server's folder, pressed. */
async function pickInSwitcher(app) {
  await app.page.locator("#open").click();
  const box = app.page.getByRole("dialog", { name: "Trocar de pasta" });
  await box.getByRole("region", { name: "Meus" }).getByRole("button", { name: /Campanha/ }).click();
}

/** Settings › Servers, the server's folders listed: its "Abrir aqui". */
async function openHere(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).first().click();
  const button = app.page.getByRole("button", { name: /^Abrir Campanha nesta janela/ });
  await expect(button).toBeVisible();
  return button;
}

/** Settings › Servers' "Abrir aqui" of the folder, pressed. */
async function pickInServers(app) {
  await (await openHere(app)).click();
}

const question = (app) => app.page.getByRole("dialog", { name: "Abrir “Campanha”" });

test("on a desktop the pick asks, with the size, chooses where, downloads and opens the copy; the next pick opens it", async ({ app }) => {
  await app.open();
  await signedIn(app);
  await pickInSwitcher(app);
  const q = question(app);
  await expect(q).toBeVisible();
  await expect(q).toContainText("O Verso baixa a pasta inteira para este aparelho");
  await expect(q.locator(".copy-size")).toHaveText("3 arquivos · 2,4 MB");
  await expect(q).toContainText("Você escolhe a pasta onde a cópia fica");
  // The desktop's dialog cancelled: nothing made, the question stays.
  await app.page.evaluate(() => (window.__harness.serverCopy.cancelChoose = true));
  await q.getByRole("button", { name: "Escolher onde e baixar…" }).click();
  await expect.poll(async () => (await app.calls("server_copy_make")).length).toBe(1);
  await expect(q.getByRole("button", { name: "Escolher onde e baixar…" })).toBeVisible();
  await expect(q.locator(".copy-progress")).toBeHidden();
  // Chosen: the copy opens and its download is shown to the end.
  await q.getByRole("button", { name: "Escolher onde e baixar…" }).click();
  const made = (await app.calls("server_copy_make")).at(-1);
  expect(made).toEqual({ url: URL, folder: "f1", place: "choose" });
  await expect(q.locator(".copy-said")).toHaveText("Pronto: 3 arquivos estão neste aparelho. A cópia abre mesmo sem internet.");
  await expect(app.page.locator("#folder")).toHaveText("Campanha");
  await expect(app.page.locator("#sync-state")).toHaveText("Sincronizada");
  await q.getByRole("button", { name: "OK" }).click();
  await expect(q).toBeHidden();
  // The next pick opens the copy, with nothing asked and nothing made.
  await pickInSwitcher(app);
  await expect.poll(async () => (await app.calls("server_copy_open")).length).toBe(2);
  await expect(question(app)).toBeHidden();
  expect((await app.calls("server_copy_make")).length).toBe(2);
  expect((await app.calls("server_open")).length).toBe(0);
});

test("the download's progress is said file by file", async ({ app }) => {
  await app.open();
  await signedIn(app);
  await app.page.evaluate(() => (window.__harness.serverCopy.auto = false));
  await pickInSwitcher(app);
  const q = question(app);
  await q.getByRole("button", { name: "Escolher onde e baixar…" }).click();
  await expect(q.locator(".copy-said")).toHaveText("Baixando: 0 de 3 arquivos…");
  await app.page.evaluate(() => window.__harness.serverCopy.step());
  await expect(q.locator(".copy-said")).toHaveText("Baixando: 1 de 3 arquivos…");
  await expect(q.locator("progress")).toHaveAttribute("value", "1");
  await app.page.evaluate(() => {
    window.__harness.serverCopy.step();
    window.__harness.serverCopy.step();
  });
  await expect(q.locator(".copy-said")).toHaveText(/^Pronto: 3 arquivos/);
});

test("on Android the copy goes inside the app or in the phone's Documents, which asks for the access first", async ({ app }) => {
  await app.open("?host=mobile");
  await signedIn(app);
  await pickInServers(app);
  const q = question(app);
  const places = q.getByRole("group", { name: "Onde guardar a cópia" });
  await expect(places.getByRole("radio", { name: /Dentro do app/ })).toBeChecked();
  await expect(places).toContainText("Se o app for desinstalado, a cópia é apagada junto");
  await places.getByRole("radio", { name: /Celular\/Documents/ }).check();
  await q.getByRole("button", { name: "Baixar e abrir" }).click();
  // No access to all files yet: asked, nothing made.
  await expect(q.locator(".copy-access")).toContainText("precisa do acesso a todos os arquivos");
  expect((await app.calls("server_copy_make")).length).toBe(0);
  await q.getByRole("button", { name: "Permitir acesso" }).click();
  await expect.poll(async () => (await app.calls("shared_storage_access")).length).toBe(1);
  await q.getByRole("button", { name: "Baixar e abrir" }).click();
  await expect.poll(async () => (await app.calls("server_copy_make")).at(-1)).toEqual({ url: URL, folder: "f1", place: "phone" });
  await expect(q.locator(".copy-said")).toHaveText(/^Pronto: 3 arquivos/);
});

test("on Android inside the app is the first place, with nothing to allow", async ({ app }) => {
  await app.open("?host=mobile");
  await signedIn(app);
  await pickInServers(app);
  await question(app).getByRole("button", { name: "Baixar e abrir" }).click();
  await expect.poll(async () => (await app.calls("server_copy_make")).at(-1)).toEqual({ url: URL, folder: "f1", place: "in_app" });
  expect((await app.calls("shared_storage")).length).toBe(0);
});

test("on iOS the copy goes in the app's Documents, said where the Files app shows it", async ({ app }) => {
  await app.open("?host=ios");
  await signedIn(app);
  await pickInServers(app);
  const q = question(app);
  await expect(q).toContainText("No meu iPad (ou iPhone) › Verso");
  await expect(q.getByRole("radio")).toHaveCount(0);
  await q.getByRole("button", { name: "Baixar e abrir" }).click();
  await expect.poll(async () => (await app.calls("server_copy_make")).at(-1)).toEqual({ url: URL, folder: "f1", place: "documents" });
});

test("the window on the server alone stays the other way, said as online only", async ({ app }) => {
  await app.open();
  await signedIn(app);
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_open = () => ({ ...h.current_folder({}), name: "Campanha" });
  });
  await pickInSwitcher(app);
  const q = question(app);
  const only = q.getByRole("button", { name: "Abrir só no servidor, sem cópia" });
  await expect(only).toHaveAccessibleDescription("Só funciona com internet: nada fica neste aparelho.");
  await only.click();
  await expect(q).toBeHidden();
  await expect.poll(async () => (await app.calls("server_open")).at(-1)).toEqual({ url: URL, folder: "f1" });
  expect((await app.calls("server_copy_make")).length).toBe(0);
});

test("with the server down the question says so and tries again; a copy made before opens offline", async ({ app, page }) => {
  await app.open();
  await signedIn(app);
  const here = await openHere(app);
  await page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  await here.click();
  const q = question(app);
  await expect(q.getByRole("alert")).toContainText(SAID);
  await expect(q.getByRole("button", { name: "Escolher onde e baixar…" })).toBeDisabled();
  // The window on the server would fail too: not offered while out of reach.
  await expect(q.getByRole("button", { name: "Abrir só no servidor, sem cópia" })).toBeDisabled();
  await expect(q.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  // Back: "Tentar de novo" sizes it.
  await page.evaluate(() => window.__harness.serverDown(null));
  await q.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(q.locator(".copy-size")).toHaveText("3 arquivos · 2,4 MB");
  await expect(q.getByRole("alert")).toHaveCount(0);
  await expect(q.getByRole("button", { name: "Escolher onde e baixar…" })).toBeEnabled();
  await expect(q.getByRole("button", { name: "Abrir só no servidor, sem cópia" })).toBeEnabled();
  await q.getByRole("button", { name: "Cancelar" }).click();
  await expect(q).toBeHidden();
  // A copy is here and the server is down again (airplane mode): the pick
  // opens it, asking the server nothing.
  await page.evaluate((url) => window.__harness.serverCopy.copies.set(`${url}#f1`, "Campanha"), URL);
  await page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  const plans = (await app.calls("server_copy_plan")).length;
  await here.click();
  await expect(page.locator("#folder")).toHaveText("Campanha");
  await expect(question(app)).toBeHidden();
  expect((await app.calls("server_copy_plan")).length).toBe(plans);
});
