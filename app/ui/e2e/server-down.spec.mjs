// A server that cannot be reached (the maintainer, 2026-10-14: with the
// UniVerso at localhost:7351 down, "Sincronizar esta pasta" did nothing on
// the screen, and the app's log had two ERROR lines a click). The harness
// answers every command to a server as the host does when no connection
// is made (`serverDown`, src/harness.ts).

import { test, expect } from "./fixtures.mjs";

const SAID = "Não foi possível alcançar o servidor localhost:7351 — ele está fora do ar ou sem rede.";

/** Signed in to the server at localhost:7351, which has a folder. */
async function signedIn(app) {
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "http://localhost:7351", email: "ana@casa.lan", name: "Ana" }];
    h.server_folders = () => ({ folders: [{ id: "f1", name: "Campanha", role: "editor" }], may_create: false });
  });
}

async function openSection(app, name) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: name }).click();
}

test("Sync this folder with the server down says so where the button is, and tries again", async ({ app, page }) => {
  const warned = [];
  page.on("console", (m) => m.type() === "warning" && warned.push(m.text()));
  await app.open();
  await signedIn(app);
  await page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  await openSection(app, "Sincronizar");
  // The server's folders did not come: said in the form, before anything
  // is pressed.
  const failure = page.locator(".sync-failure");
  await expect(failure.getByRole("alert")).toHaveText(new RegExp(`^${SAID}`));
  // The person presses the button all the same: said again, beside it.
  const start = page.getByRole("button", { name: "Sincronizar esta pasta" });
  await start.click();
  await expect(failure.getByRole("alert")).toContainText(SAID);
  await expect.poll(async () => (await app.calls("folder_sync_start")).length).toBe(1);
  await expect(page.locator("#sync-state")).toBeHidden();
  // DevTools' console has a line for each failure (a warning: the suite
  // fails a test on an error), and the app's log one WARN for the server,
  // not an ERROR a click (once a minute, errors.ts).
  expect(warned.filter((w) => w === "Verso: unreachable: localhost:7351").length).toBeGreaterThanOrEqual(2);
  const logged = await page.evaluate(() => window.__harness.log.filter((l) => l.message.includes("localhost:7351")).map((l) => `${l.level} ${l.message}`));
  expect(logged).toEqual(["WARN unreachable: localhost:7351"]);

  // The server is back: "Tentar de novo" syncs, and the failure goes.
  await page.evaluate(() => window.__harness.serverDown(null));
  await failure.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.locator("#sync-state")).toHaveText("Sincronizada");
  await expect.poll(async () => (await app.calls("folder_sync_start")).length).toBe(2);
});

test("a synced folder whose server does not answer says so in the status bar and the section", async ({ app, page }) => {
  await app.open();
  await signedIn(app);
  const status = { key: "harness", on: true, server: "http://localhost:7351", folder: "f1", folder_name: "Campanha", role: "editor", state: "offline", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: [], log: [], last: null, message: "localhost:7351", problem: "unreachable", versions: null, revoked: null, cloud: null };
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
  await expect(page.locator("#sync-state")).toHaveText("Servidor fora de alcance: localhost:7351");
  await page.locator("#sync-state").click();
  await expect(page.locator(".sync-sentence")).toHaveText(`${SAID} As mudanças esperam e cruzam quando ele voltar.`);
  // The try again is the section's own: Sync now.
  await expect(page.getByRole("button", { name: "Sincronizar agora" })).toBeVisible();
});

test("Settings › Servers says a server down in place of its folders, and tries again", async ({ app, page }) => {
  await app.open();
  await signedIn(app);
  await page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  await openSection(app, "Servidores");
  const list = page.getByRole("list", { name: /localhost:7351/ });
  await expect(list.getByRole("alert")).toContainText(SAID);
  await page.evaluate(() => window.__harness.serverDown(null));
  await list.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(list.getByText("Campanha")).toBeVisible();
  await expect(list.getByRole("alert")).toHaveCount(0);
});

test("the folder switcher says a server down under its groups, and tries again", async ({ app, page }) => {
  await app.open();
  await signedIn(app);
  await page.evaluate(() => window.__harness.serverDown("localhost:7351"));
  await page.locator("#open").click();
  const switcher = page.locator(".folder-switcher");
  await expect(switcher.getByRole("alert")).toContainText(SAID);
  await page.evaluate(() => window.__harness.serverDown(null));
  await switcher.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(switcher.getByRole("button", { name: /Campanha/ })).toBeVisible();
  await expect(switcher.getByRole("alert")).toHaveCount(0);
});

// A window showing a server's folder whose server went down (the
// coordinator's second gap, 2026-10-14): the host tries again on its own,
// 5 s doubling to 5 min (reach.rs), and says each try that found it out of
// reach. The status bar says so, with "Tentar de novo", which asks the
// host to try now; the server back, it goes.
test("a server's folder whose server is down says so in the status bar, and tries again when asked", async ({ app, page }) => {
  await app.open();
  await app.emit("server-gone", { url: "http://localhost:7351", what: "connection" });
  await app.emit("server-gone", { url: "http://localhost:7351", what: "unreachable", address: "localhost:7351" });
  const state = page.locator("#server-state");
  await expect(state).toContainText("Servidor fora de alcance: localhost:7351");
  const again = state.getByRole("button", { name: "Tentar de novo" });
  await again.click();
  // The harness answers in a task of its own: the call lands a moment later.
  await expect.poll(async () => (await app.calls("server_retry")).length).toBe(1);
  // Busy until the host says how the try went.
  await expect(again).toHaveAttribute("aria-busy", "true");
  await app.emit("server-gone", { url: "http://localhost:7351", what: "unreachable", address: "localhost:7351" });
  await expect(again).not.toHaveAttribute("aria-busy", "true");
  await app.emit("server-back", { url: "http://localhost:7351" });
  await expect(state).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Conectado ao servidor de novo.");
});
