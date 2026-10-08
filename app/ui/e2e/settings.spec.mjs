// Walkthrough, section 10: the settings and the bug report.

import { test, expect } from "./fixtures.mjs";

test("the settings have the sections the tutorial names", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await expect(app.page.locator(".settings-nav-item")).toHaveText(["Geral", "Aparência", "Editor", "Organização", "Arquivos e links", "Board", "Atalhos", "Terminal e agentes"]);
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  for (const label of ["Tema", "Paleta de cores", "Tamanho da fonte", "Fonte dos títulos", "Fonte do texto", "Cor de destaque dos títulos", "Largura do texto"]) {
    await expect(app.page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  for (const label of ["Figurinhas", "Capas", "Nome da nota da pasta (vazio: o nome da pasta)", "Ordenar arrastando na árvore"]) {
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

// A long answer beside a setting wraps under it, and the setting's own text
// keeps its width: "Adicionado… Cópia do anterior: …" squeezed the MCP
// row's description into a column a word wide (2026-10-08).
test("adding to Claude Desktop leaves the row readable", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Terminal e agentes" }).click();
  await app.page.getByRole("button", { name: "Adicionar ao Claude Desktop" }).click();
  await app.page.getByRole("button", { name: "Adicionar", exact: true }).click();
  const row = app.page.locator(".setting", { hasText: "Cópia do anterior" });
  await expect(row).toBeVisible();
  const widths = await row.evaluate((r) => ({ text: r.querySelector(".setting-text").getBoundingClientRect().width, row: r.getBoundingClientRect().width }));
  expect(widths.text).toBeGreaterThan(widths.row * 0.35);
});

// One server for all of Verso (ADR 0054, 2026-10-08): the mode changes what
// goes into Claude Desktop, and the open folder stays hidden until marked.
test("the server for all of Verso writes --all and starts with the folder hidden", async ({ app }) => {
  await app.open();
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Terminal e agentes" }).click();
  await app.page.locator(".setting", { hasText: "Agentes: uma pasta ou todo o Verso" }).locator("select").selectOption("all");
  const visible = app.page.locator(".setting", { hasText: "Esta pasta é visível para agentes" }).locator("input");
  await expect(visible).toBeEnabled();
  await expect(visible).not.toBeChecked();
  await visible.locator("..").click();
  await expect(visible).toBeChecked();
  await expect(app.page.locator(".setting-code").first()).toContainText("claude mcp add verso -- /usr/local/bin/verso mcp --all");
  await app.page.getByRole("button", { name: "Adicionar ao Claude Desktop" }).click();
  await expect(app.page.locator(".dialog, [role=dialog]").last()).toContainText("--all");
});
