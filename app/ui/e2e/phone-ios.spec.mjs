// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The iOS app's window (ADR 0119 A13, decided 2026-11-12), with the
// harness standing in for an iPhone's or iPad's host (`?host=ios`): no
// `link`, `discover`, `serve_away` or `updates`. Turn into a server shows
// the network's box alone and says it serves only while Verso is open;
// Servers has no "Found on this network"; Notifications has no Updates
// row; the console's line says a computer inspects the window. Android's
// and the desktop's are unchanged.

import { expect, test } from "./fixtures.mjs";

async function section(app, page, name) {
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: name }).first().click();
}

test("an iPad serves on the network alone, only while Verso is open", async ({ app, page }) => {
  await app.open("?host=ios");
  await section(app, page, "Transformar em servidor");
  const body = page.locator(".settings-body");
  await expect(body).toContainText("O Verso deste aparelho pode servir");
  await expect(body).toContainText("só enquanto o Verso estiver aberto na tela");
  await expect(page.locator("#ls-network")).toBeVisible();
  await expect(page.locator("#ls-link")).toBeHidden();
});

test("Android and the desktop keep the internet link's box", async ({ app, page }) => {
  for (const at of ["?host=mobile", ""]) {
    await app.open(at);
    await section(app, page, "Transformar em servidor");
    await expect(page.locator("#ls-link")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("an iPad's Servers has no list of servers found on the network", async ({ app, page }) => {
  await app.open("?host=ios");
  await section(app, page, "Servidores");
  await expect(page.locator(".settings-body .srv-connect").first()).toBeVisible();
  await expect(page.locator(".srv-found")).toHaveCount(0);
});

test("an iPad's notifications have no Updates row, and its console is a computer's", async ({ app, page }) => {
  await app.open("?host=ios");
  await section(app, page, "Notificações");
  await expect(page.locator(".settings-body")).not.toContainText("Uma versão nova do Verso");
  await page.locator(".settings-nav-item", { hasText: "Geral" }).first().click();
  await expect(page.locator(".settings-body")).toContainText("abre num computador ligado a este aparelho");
});

test("the desktop's notifications keep the Updates row", async ({ app, page }) => {
  await app.open();
  await section(app, page, "Notificações");
  await expect(page.locator(".settings-body")).toContainText("Uma versão nova do Verso");
});

// The iOS app opens only the folders in its own Documents (review #4,
// 2026-11-15): the folder switcher has no "Open another folder…", which
// opened Android's shared storage and failed there in English. Android
// keeps it (phone-android.spec.mjs).
async function switcher(page) {
  if (page.viewportSize().width < 760 && (await page.locator("body.side-open").count()) === 0) {
    await page.locator(".bottom-bar .bar-files").click();
    await page.locator("aside.side").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  }
  await page.locator("#open").click();
  return page.getByRole("dialog", { name: "Trocar de pasta" });
}

test("an iPad's folder switcher offers no other folder to open", async ({ app, page }) => {
  await app.open("?host=ios");
  const box = await switcher(page);
  await expect(box.getByRole("region", { name: "Neste celular" })).toBeVisible();
  await expect(box.getByRole("button", { name: "Abrir outra pasta…" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await app.open("?host=mobile");
  const android = await switcher(page);
  await expect(android.getByRole("button", { name: "Abrir outra pasta…" })).toBeVisible();
});
