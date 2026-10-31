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
  await page.locator(".settings-nav-item", { hasText: "Dados e RPG" }).click();
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

test("an imported bundle is kept in the folder: it is a file, it comes back, and a taken id gets a new one (ADR 0098 item 2)", async ({ app, page }) => {
  await app.open();
  const bundle = { version: 1, id: "minha-mesa", name: "Minha Mesa", description: "Uma mesa de teste.", folders: ["Sessões"], files: [{ path: "Visão Geral.md", content: "# {{title}}" }] };
  const openWizard = async () => {
    await app.command("Novo projeto a partir de modelo");
    const dialog = page.getByRole("dialog", { name: "Criar Novo Mundo ou Campanha" });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const importIt = async (dialog) => {
    await dialog.getByRole("tab", { name: "Gerador com IA" }).click();
    await dialog.getByLabel("Cole aqui o JSON gerado pela sua IA").fill(JSON.stringify(bundle));
    await dialog.getByRole("button", { name: "Validar e Importar" }).click();
  };

  let dialog = await openWizard();
  await importIt(dialog);
  await expect(dialog.getByRole("button", { name: /Minha Mesa/ })).toHaveCount(1);
  expect(JSON.parse(await app.file(".verso/bundles/minha-mesa.json")).name).toBe("Minha Mesa");
  await expect(dialog.locator(".world-status-line")).toContainText("guardado na pasta");

  // The same id again: kept under a new one, said.
  await importIt(dialog);
  await expect(dialog.getByRole("button", { name: /Minha Mesa/ })).toHaveCount(2);
  expect(JSON.parse(await app.file(".verso/bundles/minha-mesa-2.json")).id).toBe("minha-mesa-2");
  await expect(dialog.locator(".world-status-line")).toContainText("identificador novo");

  // Closed and opened again: read from the folder, not from the window's memory.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await app.writeOutside(".verso/bundles/de-fora.json", JSON.stringify({ ...bundle, id: "de-fora", name: "Veio de Fora" }));
  await app.writeOutside(".verso/bundles/quebrado.json", JSON.stringify({ version: 1 }));
  dialog = await openWizard();
  await expect(dialog.getByRole("button", { name: /Minha Mesa/ })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: /Veio de Fora/ })).toHaveCount(1);
  await expect(dialog.locator(".world-folder-bundles-note")).toContainText("quebrado");
  await page.keyboard.press("Escape");
});

test.describe("in English", () => {
  test.use({ locale: "en-US" });
  test("a built-in bundle is previewed and created with English folder and note names (ADR 0098 item 10)", async ({ app, page }) => {
    await app.open();
    await app.command("New project from a template");
    const dialog = page.getByRole("dialog", { name: "Create New World or Campaign" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("World or campaign name").fill("Realm");
    await dialog.getByRole("button", { name: /RPG Campaign \(Dados Críticos\)/ }).click();
    await expect(dialog.locator(".world-preview-folders")).toContainText("2. Sessions");
    await expect(dialog.locator(".world-preview-folders")).not.toContainText("Sessões");
    await dialog.getByRole("button", { name: "Create structure" }).click();
    await expect(dialog.getByLabel("Include Realm/Templates/Session Log.md", { exact: true })).toBeChecked();
    await dialog.getByRole("button", { name: "Create now" }).click();
    await expect(dialog).toBeHidden();
    expect(await app.folders()).toContain("Realm/2. Sessions");
    const files = await app.files();
    expect(files).toContain("Realm/Templates/Session Log.md");
    expect(files).toContain("Realm/Campaign Overview.md");
    expect(files.filter((f) => f.startsWith("Realm/")).some((f) => f.includes("Sessão") || f.includes("Modelos"))).toBe(false);
  });
});
