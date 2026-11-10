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
