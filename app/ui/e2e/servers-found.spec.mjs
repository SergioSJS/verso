// "Encontrados nesta rede" (ADR 0097): the servers the host found on the
// network by themselves, in Settings › Servers. A click fills the address
// the row shows and goes on to sign-in as typing it would; nothing
// connects because of the list alone. The harness answers the three
// commands (`discover_servers_*`); a test sets what the network holds.

import { test, expect } from "./fixtures.mjs";

const ZIMA = { name: "UniVerso-ab12cd", host: "universo-ab12cd.local", url: "http://192.168.1.9:7340", https: false, version: "0.8.4" };

async function openServers(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Servidores" }).click();
}

test("a server on the network is listed with its address, and a click starts the sign-in with it", async ({ app, page }) => {
  await app.open();
  await page.evaluate((found) => {
    const h = window.__harness.core.handlers;
    h.discover_servers_list = () => [found];
    h.server_sign_in = () => ({ code: "ABCD-1234", page: "http://192.168.1.9:7340/device" });
    h.server_sign_in_page = () => null;
  }, ZIMA);
  await openServers(app);
  const section = page.locator(".srv-found");
  await expect(section.getByRole("heading", { name: "Encontrados nesta rede" })).toBeVisible();
  const row = section.locator(".srv-found-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("UniVerso-ab12cd");
  // The address it will use is on the screen before the click, and so is
  // that it is not encrypted.
  await expect(row.locator("code")).toHaveText("http://192.168.1.9:7340");
  await expect(row).toContainText("sem HTTPS");
  expect((await app.calls("server_sign_in")).length).toBe(0);
  await row.getByRole("button", { name: "Conectar a UniVerso-ab12cd em http://192.168.1.9:7340" }).click();
  await expect(page.locator("#srv-address")).toHaveValue("http://192.168.1.9:7340");
  await expect.poll(async () => (await app.calls("server_sign_in")).length).toBe(1);
  expect((await app.calls("server_sign_in"))[0]).toMatchObject({ url: "http://192.168.1.9:7340" });
  // Typing an address stays possible.
  await expect(page.locator("#srv-address")).toBeEditable();
});

test("nothing found says how to find it; browsing ends when the section closes", async ({ app, page }) => {
  await app.open();
  await openServers(app);
  await expect(page.locator(".srv-found-state")).toContainText("Nenhum UniVerso respondeu ainda");
  await expect.poll(async () => (await app.calls("discover_servers_start")).length).toBe(1);
  expect((await app.calls("discover_servers_stop")).length).toBe(0);
  // Another section: the list is gone, and so is the browse.
  await page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  await expect.poll(async () => (await app.calls("discover_servers_stop")).length, { timeout: 8000 }).toBe(1);
});
