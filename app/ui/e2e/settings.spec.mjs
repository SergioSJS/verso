// Walkthrough, section 10: the settings and the bug report.

import { test, expect } from "./fixtures.mjs";

test("the settings have the sections the tutorial names", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await expect(app.page.locator(".settings-nav-item")).toHaveText(["Geral", "Aparência", "Editor", "Arquivos e links", "Board", "Atalhos", "Terminal e agentes"]);
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  for (const label of ["Tema", "Paleta de cores", "Tamanho da fonte", "Fonte dos títulos", "Fonte do texto", "Cor de destaque dos títulos", "Largura do texto"]) {
    await expect(app.page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("the bug report opens with no error of the session", async ({ app }) => {
  await app.open();
  await app.page.locator("#report-bug").click();
  const dialog = app.page.getByRole("dialog", { name: "Relatar problema" });
  await expect(dialog).toBeVisible();
  const text = await dialog.locator("textarea").inputValue();
  expect(text).toContain("## Erros desta sessão");
  expect(text).toMatch(/## Erros desta sessão\s+nenhum/);
});
