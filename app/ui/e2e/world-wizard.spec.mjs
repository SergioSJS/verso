// Walkthrough, section 14 (note 26): the project wizard (ADR 0098 item 3).
// "Criar estrutura" does not write: it shows the whole tree, with a box and
// a name for every folder and file. What is unticked is not made (a folder
// takes what is inside it along); only then "Criar agora" writes.

import { test, expect } from "./fixtures.mjs";

const ROOT = "Costa Teste";

test("the wizard shows the tree first, and only what stays ticked is created", async ({ app, page }) => {
  await app.open();
  const filesBefore = await app.files();
  const foldersBefore = await app.folders();

  await app.command("Novo projeto a partir de modelo");
  const dialog = page.getByRole("dialog", { name: "Criar Novo Mundo ou Campanha" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nome do mundo ou campanha").fill(ROOT);
  await dialog.getByRole("button", { name: /Campanha de RPG \(Dados Críticos\)/ }).click();
  await expect(dialog.locator(".world-preview-root")).toContainText(`${ROOT}/`);

  // The tree, before anything is written.
  await dialog.getByRole("button", { name: "Criar estrutura" }).click();
  await expect(dialog.getByRole("heading", { name: "Confira o que será criado" })).toBeVisible();
  expect(await app.files()).toEqual(filesBefore);
  expect(await app.folders()).toEqual(foldersBefore);
  await expect(dialog.getByLabel(`Incluir ${ROOT}/7. Hexcrawl`, { exact: true })).toBeChecked();

  // Leave a folder out, and one note.
  await dialog.getByLabel(`Incluir ${ROOT}/7. Hexcrawl`, { exact: true }).uncheck();
  await dialog.getByLabel(`Incluir ${ROOT}/Painel do Mestre.md`, { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Criar agora" }).click();
  await expect(dialog).toBeHidden();

  const folders = await app.folders();
  const files = await app.files();
  expect(folders).toContain(`${ROOT}/1. Grupo`);
  expect(folders).toContain(`${ROOT}/Modelos`);
  expect(folders).not.toContain(`${ROOT}/7. Hexcrawl`);
  expect(files).toContain(`${ROOT}/Visão Geral da Campanha.md`);
  expect(files).toContain(`${ROOT}/Modelos/Ficha de NPC.md`);
  expect(files).not.toContain(`${ROOT}/Painel do Mestre.md`);
});

test("the Project wizard switch takes the command away", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Recursos" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Assistente de mundo e campanha$/ }) });
  await row.locator("label.switch").click();
  await page.keyboard.press("Escape");
  await app.key("Mod+Shift+p");
  await page.keyboard.type("a partir de modelo");
  // Nothing in the palette is called that any more; the rest of the note's
  // commands still are (the switch hides one command, not the palette).
  await expect(page.locator(".quick:not([hidden]) .quick-list li", { hasText: "a partir de modelo" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});
