// Walkthrough, section 10: a folder of this computer syncs with a folder
// of a server (ADR 0079). The harness has no server: a test signs it in to
// one, and says what the sync would (`sync-status`).

import { test, expect } from "./fixtures.mjs";

const COPY = "Sessao (conflito, Mac, 2026-10-10 15.34).md";

async function openSync(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
}

test("a folder syncs with a server, says its state, asks before deleting and shows a conflict", async ({ app }) => {
  await app.open();
  await openSync(app);
  // Not signed in to any server: the section says where to begin.
  await expect(app.page.getByText("Conecte a um servidor em Servidores primeiro.")).toBeVisible();
  await expect(app.page.locator("#sync-state")).toBeHidden();

  // Signed in to one, with a folder there.
  await app.page.evaluate(() => {
    const h = window.__harness.core.handlers;
    h.server_accounts = () => [{ url: "https://notas.casa", email: "ana@casa.lan", name: "Ana" }];
    h.server_folders = () => [{ id: "f1", name: "Campanha", role: "editor" }];
  });
  await app.page.locator(".settings-nav-item", { hasText: "Geral" }).click();
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
  const where = app.page.locator(".setting", { hasText: "Pasta no servidor" }).locator("select");
  await expect(where.locator("option")).toHaveText([/^Uma pasta nova: /, "Campanha · edita"]);
  // The space is shown before anything crosses (ADR 0075 item 5).
  await expect(app.page.locator(".sync-space")).toContainText("Esta pasta tem");
  await app.page.getByRole("button", { name: "Sincronizar esta pasta" }).click();
  const bar = app.page.locator("#sync-state");
  await expect(bar).toHaveText("Sincronizada");
  const started = await app.calls("folder_sync_start");
  expect(started).toHaveLength(1);
  expect(started[0].url).toBe("https://notas.casa");
  expect(started[0].folder).toBeNull();
  expect(started[0].name).toBeTruthy();

  // A pass paused for many deletions, with a conflict in the folder.
  await app.writeOutside("Sessao.md", "# Sessao\n\nversão do servidor\n");
  await app.writeOutside(COPY, "# Sessao\n\nversão deste computador\n");
  const status = await app.page.evaluate(() => window.__harness.core.sync);
  await app.emit("sync-status", { ...status, state: "paused", deletions: 12, conflicts: [COPY], refused: [{ path: "video.mov", reason: "quota", message: "" }] });
  await expect(bar).toHaveText("Pausada: 12 · 1 conflito");
  await expect(app.page.getByRole("alert")).toContainText("apagaria 12 arquivos");
  await expect(app.page.locator(".sync-refused")).toContainText("video.mov — a pasta chegou à cota do servidor");

  // The conflict's difference: the server's version, then the copy.
  await app.page.locator(".sync-conflict summary").click();
  await expect(app.page.locator(".sync-conflict .diff .del")).toContainText("versão do servidor");
  await expect(app.page.locator(".sync-conflict .diff .add")).toContainText("versão deste computador");

  // The deletions go ahead only on an explicit yes.
  await app.page.getByRole("button", { name: "Apagar 12 arquivos" }).click();
  await app.page.getByRole("alertdialog").getByRole("button", { name: "Apagar 12 arquivos" }).click();
  await expect.poll(() => app.calls("folder_sync_confirm").then((c) => c.length)).toBe(1);
  await expect(bar).toHaveText("Sincronizada");

  // The bar opens the section; turning sync off asks, then the bar goes.
  await app.key("Escape");
  await bar.click();
  await expect(app.page.locator('.settings-nav-item[aria-current="true"]', { hasText: "Sincronizar" })).toBeVisible();
  await app.page.getByRole("button", { name: "Desligar" }).click();
  await app.page.getByRole("alertdialog").getByRole("button", { name: "Desligar" }).click();
  await expect(bar).toBeHidden();
  await expect(app.page.getByRole("button", { name: "Sincronizar esta pasta" })).toBeVisible();
});
