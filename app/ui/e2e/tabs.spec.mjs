// Walkthrough, sections 2 and 6: tabs (ADR 0059), ⌘W, F2.

import { test, expect } from "./fixtures.mjs";

const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);

test("a click opens a preview tab, which the next click replaces; a double click keeps it", async ({ app }) => {
  await app.open();
  await row(app, "01 - Guia de Markdown e Sintaxe.md").click();
  const preview = app.page.locator(".tab.preview");
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("01 - Guia de Markdown e Sintaxe");
  await row(app, "02 - Links, Âncoras e Notas Incorporadas.md").click();
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("02 - Links");
  await expect(app.page.locator(".tab", { hasText: "01 - Guia de Markdown" })).toHaveCount(0);
  await row(app, "02 - Links, Âncoras e Notas Incorporadas.md").dblclick();
  await expect(app.page.locator(".tab.preview")).toHaveCount(0);
  await expect(app.page.locator(".tab", { hasText: "02 - Links" })).toHaveCount(1);
});

test("⌘W closes the tab — from the keys and from the app's menu — and ⌘⇧T opens it again", async ({ app }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  const tab = app.page.locator(".tab", { hasText: "03 - Propriedades" });
  await expect(tab).toHaveCount(1);
  await app.key("Mod+w");
  await expect(tab).toHaveCount(0);
  await app.key("Mod+Shift+t");
  await expect(tab).toHaveCount(1);
  // File › Close Tab (⌘W) on a Mac: the host's menu tells the window (a51aab2).
  await app.emit("menu-close-tab", "main");
  await expect(tab).toHaveCount(0);
});

test("F2 renames the open note, right after a click on its row", async ({ app }) => {
  await app.open();
  await row(app, "18 - Ajuda, Atualizações e Diagnóstico.md").click();
  await expect(app.page.locator(".tab", { hasText: "18 - Ajuda" })).toHaveCount(1);
  await app.page.keyboard.press("F2");
  const field = app.page.locator("input.title-input");
  await expect(field).toBeVisible();
  await field.fill("18 - Ajuda");
  await field.press("Enter");
  // The notes that point to it are rewritten, after the plan is shown.
  await app.page.locator(".plan button.save").click();
  await expect.poll(() => app.files()).toContain("18 - Ajuda.md");
  expect(await app.file("00 - Bem-vindo ao Verso.md")).toContain("[[18 - Ajuda]]");
});
