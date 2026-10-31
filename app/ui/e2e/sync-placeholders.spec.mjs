// Files that are only in iCloud or OneDrive (ADR 0043, decided 2026-10-27):
// the sync card brings them down on a click, with the size said first,
// progress, a Stop and a refusal when the disk cannot hold them; files the
// server already has are a quiet line, not a task. The harness stands in
// for the host (src/harness/cloudFiles.ts).

import { test, expect } from "./fixtures.mjs";

const MB = 1024 * 1024;

async function syncCard(app, page, files, free) {
  await app.open();
  await page.evaluate(
    ([f, fr]) => {
      const core = window.__harness.core;
      core.sync = { ...core.sync, key: "harness", on: true, server: "http://localhost:7351", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", cloud_only: [] };
      core.cloudFiles.put(f, fr);
    },
    [files, free],
  );
  await app.emit("sync-status", await page.evaluate(() => window.__harness.core.sync));
  await page.locator("#sync-state").click();
}

test("the card downloads the files only in the cloud, saying the size first", async ({ app, page }) => {
  await syncCard(app, page, { "Mapas/a.png": 3 * MB, "Mapas/b.png": 5 * MB, "c.md": 1 * MB }, 500 * 1024 ** 3);
  const go = page.getByRole("button", { name: /^Baixar 3 arquivos \(9 MB\)$/ });
  await expect(go).toBeVisible();
  await go.click();
  // Every file came down, so the placeholder block is gone: the run's outcome is said by the card itself (syncView ranNote), outside .sync-download.
  const said = page.locator(".sync-live");
  await expect(said).toContainText("3 arquivos baixados");
  expect((await app.calls("fetch_file")).length).toBe(3);
  expect((await app.calls("folder_sync_now")).length).toBe(1);
  // Nothing is left in the card.
  await expect(page.getByRole("button", { name: /^Baixar/ })).toHaveCount(0);
});

test("with the disk too full the card says so and downloads nothing", async ({ app, page }) => {
  await syncCard(app, page, { "a.png": 3 * MB }, 1024 * MB);
  await page.getByRole("button", { name: /^Baixar 1 arquivo/ }).click();
  await expect(page.locator(".sync-download .sync-live")).toContainText("Não há espaço no disco");
  expect((await app.calls("fetch_file")).length).toBe(0);
});

test("when the disk's room cannot be told, nothing is downloaded and it is said", async ({ app, page }) => {
  await syncCard(app, page, { "a.png": 3 * MB }, null);
  await page.getByRole("button", { name: /^Baixar 1 arquivo/ }).click();
  await expect(page.locator(".sync-download .sync-live")).toHaveText("Não deu para saber o espaço livre no disco; nada foi baixado.");
  expect((await app.calls("fetch_file")).length).toBe(0);
});

test("files only in the cloud that the server has are a quiet line, not a task", async ({ app, page }) => {
  await app.open();
  const status = { key: "harness", on: true, server: "http://localhost:7351", folder: "f1", folder_name: "Campanha", role: "editor", state: "synced", sending: 0, receiving: 0, deletions: null, conflicts: [], refused: [], cloud_only: ["a.md", "b.md"], log: [], last: null, message: null, problem: null, versions: null, revoked: null, cloud: null };
  await page.evaluate((st) => {
    window.__harness.core.handlers.folder_sync = () => st;
  }, status);
  await app.emit("sync-status", status);
  await page.locator("#sync-state").click();
  await expect(page.locator(".sync-quiet")).toHaveText("2 arquivos estão só na nuvem; o servidor tem a cópia.");
  await expect(page.locator(".sync-needs .sync-item")).toHaveCount(0);
});
