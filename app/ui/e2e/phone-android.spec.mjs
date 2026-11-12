// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Android app's words (ADR 0118 Phase 1, 2026-11-10), with the harness
// standing in for a phone's host (`?host=mobile`): Settings › Sync says the
// folder lives inside the app and goes with it; Turn into a server speaks
// of "this phone", the Wi-Fi and the battery, not of a computer's firewall;
// the check for updates stays (a sideloaded APK keeps its updater). The
// desktop's words are unchanged.

import { expect, test } from "./fixtures.mjs";

async function section(app, page, name) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: name }).first().click();
}

test("a phone's Sync says the folder goes with the app", async ({ app, page }) => {
  await app.open("?host=mobile");
  await section(app, page, "Sincronizar");
  const body = page.locator(".settings-body");
  await expect(body).toContainText("está só neste celular, guardada dentro do app");
  await expect(body).toContainText("se o Verso for desinstalado, ela é apagada junto");
  await expect(body).not.toContainText("o Obsidian lê");
});

test("a phone's serving speaks of the Wi-Fi and the battery", async ({ app, page }) => {
  await app.open("?host=mobile");
  await section(app, page, "Transformar em servidor");
  const body = page.locator(".settings-body");
  await expect(body).toContainText("O Verso deste celular pode servir");
  await expect(body).not.toContainText("deste computador pode servir");
});

test("the desktop's Sync and serving words are unchanged", async ({ app, page }) => {
  await app.open();
  await section(app, page, "Sincronizar");
  await expect(page.locator(".settings-body")).toContainText("está só neste computador");
  await page.locator(".settings-nav-item", { hasText: "Transformar em servidor" }).first().click();
  await expect(page.locator(".settings-body")).toContainText("O Verso deste computador pode servir");
});

test("a phone keeps the check for updates", async ({ app, page }) => {
  await app.open("?host=mobile");
  await section(app, page, "Geral");
  await expect(page.getByRole("button", { name: "Verificar atualizações" })).toBeVisible();
});

// Share and "Open with" (ADR 0118 item 5, in v1 since 2026-11-12): what
// another app hands to the phone's Verso becomes a new note of the open
// folder, named by the other app's name for it, never over a note there.
test("what another app hands to Verso becomes a note of the folder", async ({ app, page }) => {
  await app.open("?host=mobile");
  await page.evaluate(() => {
    window.__harness.core.shared.push(
      { name: "Receitas.md", text: "# Receitas\n\nBolo de fubá.\n", problem: null },
      { name: "", text: "Ideias para a sessão\ncorpo", problem: null },
    );
    window.versoShared();
  });
  await expect(page.locator(".web-notice")).toContainText("Recebidos de outro app: 2 notas novas");
  expect(await page.evaluate(() => window.__harness.read("Receitas.md"))).toBe("# Receitas\n\nBolo de fubá.\n");
  expect(await page.evaluate(() => window.__harness.read("Ideias para a sessão.md"))).toBe("Ideias para a sessão\ncorpo");
  // The same name again: a second note beside, the first one untouched.
  await page.evaluate(() => {
    window.__harness.core.shared.push({ name: "Receitas.md", text: "outra", problem: null });
    window.versoShared();
  });
  await expect(page.locator(".web-notice")).toContainText("“Receitas 2”");
  expect(await page.evaluate(() => window.__harness.read("Receitas 2.md"))).toBe("outra");
  expect(await page.evaluate(() => window.__harness.read("Receitas.md"))).toBe("# Receitas\n\nBolo de fubá.\n");
});

test("a file Verso cannot take is said, and nothing is made", async ({ app, page }) => {
  await app.open("?host=mobile");
  const before = await page.evaluate(() => window.__harness.files());
  await page.evaluate(() => {
    window.__harness.core.shared.push({ name: "foto.png", text: null, problem: "not_text" });
    window.versoShared();
  });
  await expect(page.locator(".web-notice")).toContainText("“foto.png” não é texto: nada foi criado.");
  expect(await page.evaluate(() => window.__harness.files())).toEqual(before);
});

// A folder of the phone's shared storage (ADR 0118 item 4.4, in v1 since
// 2026-11-12): "Open another folder" walks the storage in the window, asks
// for All files access first, and opens the folder chosen.
async function switcher(page) {
  if (page.viewportSize().width < 760 && (await page.locator("body.side-open").count()) === 0) {
    await page.locator(".bottom-bar .bar-files").click();
    await page.locator("aside.side").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  }
  await page.locator("#open").click();
  return page.getByRole("dialog", { name: "Trocar de pasta" });
}

test("a phone opens a folder of its shared storage", async ({ app, page }) => {
  await app.open("?host=mobile");
  const box = await switcher(page);
  await expect(box.getByRole("region", { name: "Neste celular" })).toBeVisible();
  await box.getByRole("button", { name: "Abrir outra pasta…" }).click();
  const storage = page.getByRole("dialog", { name: "Abrir uma pasta do celular" });
  await expect(storage).toContainText("Acesso a todos os arquivos");
  await storage.getByRole("button", { name: "Permitir acesso" }).click();
  // Back from Android's page: the window asks again.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(storage.getByRole("button", { name: "Documents" })).toBeVisible();
  await expect(storage.getByRole("button", { name: "Abrir esta pasta" })).toBeDisabled();
  await storage.getByRole("button", { name: "Documents" }).click();
  await storage.getByRole("button", { name: "Obsidian" }).click();
  await storage.getByRole("button", { name: "Abrir “Obsidian”" }).click();
  await expect(storage).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__harness.core.storage.opened)).toEqual(["Documents/Obsidian"]);
  await expect(page.locator("#folder")).toHaveText("Obsidian");
});

test("a new folder of the shared storage is made and opened", async ({ app, page }) => {
  await app.open("?host=mobile");
  await page.evaluate(() => (window.__harness.core.storage.access = true));
  const box = await switcher(page);
  await box.getByRole("button", { name: "Abrir outra pasta…" }).click();
  const storage = page.getByRole("dialog", { name: "Abrir uma pasta do celular" });
  await storage.getByRole("button", { name: "Documents" }).click();
  await storage.getByRole("button", { name: "Nova pasta…" }).click();
  await page.locator(".prompt-field").fill("Campanha");
  await page.locator(".prompt-box").getByRole("button", { name: "Criar e abrir" }).click();
  await expect.poll(() => page.evaluate(() => window.__harness.core.storage.opened)).toEqual(["Documents/Campanha"]);
});

// Background sync (ADR 0118 item 6.3, in v1 since 2026-11-12): a phone's
// Settings › Sync has the option, off by default, its two conditions
// usable only with it on; the host hears the choice at once and at the
// next start. A desktop has no such row.
test("a phone turns background sync on, with its conditions", async ({ app, page }) => {
  await app.open("?host=mobile");
  await expect.poll(() => page.evaluate(() => window.__harness.core.background)).toEqual({ on: false, wifiOnly: false, chargingOnly: false });
  await section(app, page, "Sincronizar");
  const row = page.locator(".sync-background");
  await expect(row).toContainText("Sincronizar em segundo plano");
  await expect(row.getByRole("checkbox", { name: "Só no Wi-Fi" })).toBeDisabled();
  await row.locator(".switch").click();
  await row.getByRole("checkbox", { name: "Só no Wi-Fi" }).check();
  await expect.poll(() => page.evaluate(() => window.__harness.core.background)).toEqual({ on: true, wifiOnly: true, chargingOnly: false });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__harness.core.background)).toEqual({ on: true, wifiOnly: true, chargingOnly: false });
});

test("a desktop's Sync has no background option", async ({ app, page }) => {
  await app.open();
  await section(app, page, "Sincronizar");
  await expect(page.locator(".settings-body")).toContainText("está só neste computador");
  await expect(page.locator(".sync-background")).toHaveCount(0);
});
