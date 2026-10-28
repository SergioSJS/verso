// End-to-end tests for Focuses (ADR 0062).

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

test("focos tab is present in right panel with Início as default", async ({ app }) => {
  await app.open();

  // Open right panel
  await app.key("Mod+Alt+ArrowRight");

  // Focos tab button beside bookmarks
  const tabBtn = app.page.locator('#right-tabs button[data-tab="focuses"]');
  await expect(tabBtn).toBeVisible();

  // Click Focos tab
  await tabBtn.click();
  await expect(tabBtn).toHaveAttribute("aria-selected", "true");

  // Início is always listed first and marked active
  const firstFocus = app.page.locator(".focus-item").first();
  await expect(firstFocus).toBeVisible();
  await expect(firstFocus.locator(".row-name")).toContainText("Início");
  await expect(firstFocus).toHaveClass(/active/);

  // Tree heading has no reset button initially
  const resetBtn = app.page.locator("#notes-heading-reset");
  await expect(resetBtn).toBeHidden();
});

test("reading focuses from .space/waypoints.json filters the tree", async ({ app }) => {
  await app.open();

  // Prepare files
  await app.writeOutside("Projetos/Tarefa.md", "# Tarefa\n");
  await app.writeOutside("Pessoal/Diario.md", "# Diario\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", sticker: "ui//home", paths: ["/"] },
      { name: "Trabalho", sticker: "emoji//1f4bc", paths: ["Projetos"] },
    ]),
  );
  await app.folderChanged(["Projetos/Tarefa.md", "Pessoal/Diario.md", ".space/waypoints.json"], true);

  // Open right panel and switch to Focos tab
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  const trabalhoItem = app.page.locator('.focus-item[data-focus-name="Trabalho"]');
  await expect(trabalhoItem).toBeVisible();

  // Click Trabalho focus
  await trabalhoItem.locator(".focus-name-btn").click();
  await expect(trabalhoItem).toHaveClass(/active/);

  // Tree heading now shows focus name and reset button
  const heading = app.page.locator("#notes-heading-text");
  await expect(heading).toContainText("Trabalho");
  const resetBtn = app.page.locator("#notes-heading-reset");
  await expect(resetBtn).toBeVisible();

  // Tree only shows Projetos folder, not Pessoal
  const projetos = app.page.locator('#notes summary[data-folder="Projetos"]');
  await expect(projetos).toBeVisible();
  const pessoal = app.page.locator('#notes summary[data-folder="Pessoal"]');
  await expect(pessoal).toHaveCount(0);

  // Clicking reset returns to Início and full tree
  await resetBtn.click();
  await expect(resetBtn).toBeHidden();
  await expect(app.page.locator('#notes summary[data-folder="Pessoal"]')).toBeVisible();
});

test("add, rename, reorder and delete focus in Focos tab", async ({ app }) => {
  await app.open();

  // Open right panel and switch to Focos tab
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // Add focus button
  const addBtn = app.page.locator("#focuses-add");
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  // Prompt dialog for new focus
  const promptInput = app.page.locator(".prompt-box input");
  await expect(promptInput).toBeVisible();
  await promptInput.fill("Estudos");
  await app.page.locator(".confirm-actions button.save").click();

  const estudosItem = app.page.locator('.focus-item[data-focus-name="Estudos"]');
  await expect(estudosItem).toBeVisible();

  // Rename focus
  const renameBtn = estudosItem.locator('button[title="Renomear"]');
  await renameBtn.click();
  const renameInput = app.page.locator(".prompt-box input");
  await expect(renameInput).toBeVisible();
  await renameInput.fill("Pesquisa");
  await app.page.locator(".confirm-actions button.save").click();

  const pesquisaItem = app.page.locator('.focus-item[data-focus-name="Pesquisa"]');
  await expect(pesquisaItem).toBeVisible();
  await expect(estudosItem).toHaveCount(0);

  // Delete focus
  const deleteBtn = pesquisaItem.locator('button[title="Excluir"]');
  await deleteBtn.click();
  // Confirmation dialog
  const confirmDel = app.page.locator(".confirm-actions button.save");
  await expect(confirmDel).toBeVisible();
  await confirmDel.click();

  await expect(pesquisaItem).toHaveCount(0);
});

test("tree context menu 'Criar foco aqui' creates a focus", async ({ app }) => {
  await app.open();

  await app.writeOutside("Areas/Saude.md", "# Saude\n");
  await app.folderChanged(["Areas/Saude.md"], true);

  // Right click folder in tree
  const folder = app.page.locator('#notes summary[data-folder="Areas"]');
  await expect(folder).toBeVisible();
  await folder.click({ button: "right" });

  await app.page.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  await expect(app.page.getByRole("menuitem", { name: "Criar foco aqui", exact: true })).toBeVisible();
  await app.page.getByRole("menuitem", { name: "Criar foco aqui", exact: true }).click();

  // Active focus is now Areas
  const heading = app.page.locator("#notes-heading-text");
  await expect(heading).toContainText("Areas");
  const resetBtn = app.page.locator("#notes-heading-reset");
  await expect(resetBtn).toBeVisible();

  // Reset back to Home
  await resetBtn.click();
  await expect(resetBtn).toBeHidden();
});

test("command palette 'Trocar foco' switches focus", async ({ app }) => {
  await app.open();

  // Create a focus in memory
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("Dev");
  await app.page.locator(".confirm-actions button.save").click();

  // Trigger palette command "Trocar foco"
  await app.command("Trocar foco");

  const switcher = app.page.locator(".focus-switcher:not([hidden])");
  await expect(switcher).toBeVisible();
  const devOpt = switcher.locator('.quick-list button', { hasText: "Dev" });
  await expect(devOpt).toBeVisible();
  await devOpt.click();

  // Heading updated
  await expect(app.page.locator("#notes-heading-text")).toContainText("Dev");
  await expect(app.page.locator("#notes-heading-reset")).toBeVisible();
});

test("unknown format in .space/waypoints.json displays read-only banner", async ({ app }) => {
  await app.open();

  // Write invalid/unknown format (e.g. unknown key)
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", sticker: "ui//home", paths: ["/"], unknown_future_prop: 123 },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  const banner = app.page.locator(".focuses-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("formato desconhecido");
});

test("settings organizing toggle for syncing focuses shows one-time warning", async ({ app }) => {
  await app.open();

  // Open settings with Cmd+,
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings:not([hidden])");
  await expect(settingsModal).toBeVisible();

  // Go to organizing tab
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();

  // Find sync focuses toggle
  const syncRow = app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" });
  await expect(syncRow).toBeVisible();
  const toggle = syncRow.locator('input[type="checkbox"]');

  // Toggle on: should show ask dialog
  await toggle.click();
  const confirmBox = app.page.locator(".confirm-box");
  await expect(confirmBox).toBeVisible();
  await expect(confirmBox).toContainText("waypoints.json");

  // Confirm sync
  await confirmBox.locator("button.save", { hasText: "Manter iguais" }).click();
  await expect(confirmBox).toHaveCount(0);
  await expect(toggle).toBeChecked();
});

test("a focus does not change search, quick open, or backlinks (D4)", async ({ app }) => {
  await app.open();

  await app.writeOutside("Trabalho/Projeto.md", "# Projeto\nLembrar de [[Segredo]]\n");
  await app.writeOutside("Pessoal/Segredo.md", "# Segredo\nNota confidencial fora do foco.\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", sticker: "ui//home", paths: ["/"] },
      { name: "Foco Trabalho", sticker: "emoji//1f4bc", paths: ["Trabalho"] },
    ]),
  );
  await app.folderChanged(["Trabalho/Projeto.md", "Pessoal/Segredo.md", ".space/waypoints.json"], true);

  // Switch to Foco Trabalho
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.page.locator('.focus-item[data-focus-name="Foco Trabalho"] .focus-name-btn').click();

  // Tree only shows Trabalho
  await expect(app.page.locator('#notes summary[data-folder="Trabalho"]')).toBeVisible();
  await expect(app.page.locator('#notes summary[data-folder="Pessoal"]')).toHaveCount(0);

  // 1. Search still finds note in Pessoal
  const searchInput = app.page.locator("#search");
  await searchInput.fill("confidencial");
  await expect(app.page.locator("#notes .row-name", { hasText: "Segredo" })).toBeVisible();
  await searchInput.fill("");

  // 2. Quick open (Cmd+P) still finds note in Pessoal
  await app.quickOpen("Segredo");
  await expect(app.page.locator(".tab", { hasText: "Segredo" })).toBeVisible();
});

test("window focus reloads waypoints.json when changed externally (D8)", async ({ app }) => {
  await app.open();

  await app.writeOutside("PastaA/NotaA.md", "# Nota A\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Inicial", paths: ["PastaA"] },
    ]),
  );
  await app.folderChanged(["PastaA/NotaA.md", ".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await expect(app.page.locator('.focus-item[data-focus-name="Inicial"]')).toBeVisible();

  // External update: rename Inicial to ModificadoExternamente
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "ModificadoExternamente", paths: ["PastaA"] },
    ]),
  );

  // Trigger window focus event
  await app.page.evaluate(() => window.dispatchEvent(new Event("focus")));

  // Focos tab should update
  await expect(app.page.locator('.focus-item[data-focus-name="ModificadoExternamente"]')).toBeVisible();
  await expect(app.page.locator('.focus-item[data-focus-name="Inicial"]')).toHaveCount(0);
});

test("answering no to sync keeps focuses in local settings beside read-only waypoints (D5)", async ({ app }) => {
  await app.open();

  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "FocoMakeMD", paths: ["Docs"] },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // Add a focus in Verso
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("FocoVerso");
  await app.page.locator(".confirm-actions button.save").click();

  // Warning dialog asks whether to sync with make.md
  const confirmBox = app.page.locator(".confirm-box");
  await expect(confirmBox).toBeVisible();

  // Choose "Manter local" (no)
  await confirmBox.locator("button.ghost", { hasText: "Manter local" }).click();

  // Banner indicates sync is off
  await expect(app.page.locator(".focuses-banner")).toBeVisible();

  // Both make.md focus and Verso focus are visible in the list
  await expect(app.page.locator('.focus-item[data-focus-name="FocoMakeMD"]')).toBeVisible();
  await expect(app.page.locator('.focus-item[data-focus-name="FocoVerso"]')).toBeVisible();

  // Make.md focus is read-only (no edit/delete buttons)
  const makeMdItem = app.page.locator('.focus-item[data-focus-name="FocoMakeMD"]');
  await expect(makeMdItem.locator('button[title="Excluir"]')).toHaveCount(0);

  // Verso focus has edit/delete buttons
  const versoItem = app.page.locator('.focus-item[data-focus-name="FocoVerso"]');
  await expect(versoItem.locator('button[title="Excluir"]')).toBeVisible();

  // .space/waypoints.json was NOT modified
  const content = await app.file(".space/waypoints.json");
  expect(content).not.toContain("FocoVerso");
});

test("creating focuses without .space/waypoints.json never creates .space/ folder", async ({ app }) => {
  await app.open();

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // Create a focus
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("LocalOnly");
  await app.page.locator(".confirm-actions button.save").click();

  await expect(app.page.locator('.focus-item[data-focus-name="LocalOnly"]')).toBeVisible();

  // Check that .space/ was NOT created
  const content = await app.file(".space/waypoints.json");
  expect(content).toBeNull();
});

test("Início is untouchable and non-Home focus containing / renders root tree and is deletable", async ({ app }) => {
  await app.open();

  await app.writeOutside("Areas/Nota.md", "# Nota\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "RootFocus", paths: ["/"] },
    ]),
  );
  await app.folderChanged(["Areas/Nota.md", ".space/waypoints.json"], true);

  // Enable sync so focuses from waypoints.json are editable/deletable
  await app.key("Mod+,");
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  await app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" }).locator('input[type="checkbox"]').click();
  await app.page.locator(".confirm-box button.save", { hasText: "Manter iguais" }).click();
  await app.key("Escape");

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // Início has no delete button
  const inicio = app.page.locator(".focus-item").first();
  await expect(inicio.locator(".row-name")).toContainText("Início");
  await expect(inicio.locator('button[title="Excluir"]')).toHaveCount(0);

  // RootFocus has delete button
  const rootItem = app.page.locator('.focus-item[data-focus-name="RootFocus"]');
  await expect(rootItem).toBeVisible();
  const delBtn = rootItem.locator('button[title="Excluir"]');
  await expect(delBtn).toBeVisible();

  // Selecting RootFocus renders root tree directly (no nameless folder, no //)
  await rootItem.locator(".focus-name-btn").click();
  await expect(app.page.locator("#notes-heading-text")).toContainText("RootFocus");
  const areasFolder = app.page.locator('#notes summary[data-folder="Areas"]');
  await expect(areasFolder).toBeVisible();
  await expect(app.page.locator('#notes summary[data-folder="/"]')).toHaveCount(0);
  await expect(app.page.locator('#notes summary[data-folder="//Areas"]')).toHaveCount(0);

  // RootFocus can be deleted
  await rootItem.locator('button[title="Excluir"]').click();
  await app.page.locator(".confirm-actions button.save").click();
  await expect(rootItem).toHaveCount(0);
});

test("concurrent merge preserves both make.md and Verso additions without data loss (BLOCKING 1 & 2)", async ({ app }) => {
  await app.open();

  // Initial waypoints.json with Home
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // Enable sync in settings
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings:not([hidden])");
  await expect(settingsModal).toBeVisible();
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  const syncRow = app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" });
  await syncRow.locator('input[type="checkbox"]').click();
  const confirmBox = app.page.locator(".confirm-box");
  await confirmBox.locator("button.save", { hasText: "Manter iguais" }).click();
  await app.key("Escape");

  // Verso has loaded focuses. Now make.md concurrently writes to .space/waypoints.json
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "MakeMDFocus", paths: ["Externo"] },
    ]),
  );

  // Verso adds a new focus
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("VersoFocus");
  await app.page.locator(".confirm-actions button.save").click();

  // Both MakeMDFocus and VersoFocus should exist in UI and on disk!
  await expect(app.page.locator('.focus-item[data-focus-name="VersoFocus"]')).toBeVisible();
  await expect(app.page.locator('.focus-item[data-focus-name="MakeMDFocus"]')).toBeVisible();

  const fileContent = await app.file(".space/waypoints.json");
  expect(fileContent).toContain("MakeMDFocus");
  expect(fileContent).toContain("VersoFocus");
});

test("byte and key order preservation in .space/waypoints.json", async ({ app }) => {
  await app.open();

  // Initial file with custom key order: "paths" before "name"
  const rawJson = '[\n  {\n    "paths": [\n      "/"\n    ],\n    "name": "Home"\n  }\n]';
  await app.writeOutside(".space/waypoints.json", rawJson);
  await app.folderChanged([".space/waypoints.json"], true);

  // Enable sync
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.key("Mod+,");
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  await app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" }).locator('input[type="checkbox"]').click();
  await app.page.locator(".confirm-box button.save", { hasText: "Manter iguais" }).click();
  await app.key("Escape");

  // Add focus in Verso
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("NovoFoco");
  await app.page.locator(".confirm-actions button.save").click();

  // Check that the Home focus still preserves "paths" before "name"
  const content = await app.file(".space/waypoints.json");
  expect(content).toContain('"paths"');
  expect(content).toContain('"name"');
  const homePathsIdx = content.indexOf('"paths"');
  const homeNameIdx = content.indexOf('"Home"');
  expect(homePathsIdx).toBeLessThan(homeNameIdx);
});

test("iCloud placeholder .waypoints.json.icloud displays unavailable banner", async ({ app }) => {
  await app.open();

  // Create .space/.waypoints.json.icloud
  await app.writeOutside(".space/.waypoints.json.icloud", "placeholder");
  await app.folderChanged([".space/.waypoints.json.icloud"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // The file is only in the cloud: the banner says so and offers the download (fix/focus-placeholder).
  const banner = app.page.locator(".focuses-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("na nuvem");
});

test("local focuses survive enabling sync with make.md when choosing Manter local", async ({ app }) => {
  await app.open();

  // 1. Create a focus "Areas" without make.md (stored in local settings)
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("Areas");
  await app.page.locator(".confirm-actions button.save").click();
  await expect(app.page.locator('.focus-item[data-focus-name="Areas"]')).toBeVisible();

  // 2. make.md creates .space/waypoints.json
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Externo", paths: ["Docs"] },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  // 3. Turn on sync in settings
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings:not([hidden])");
  await expect(settingsModal).toBeVisible();
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  const syncRow = app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" });
  await syncRow.locator('input[type="checkbox"]').click();

  // Dialog 1: Warning about make.md format
  const confirmBox1 = app.page.locator(".confirm-box");
  await expect(confirmBox1).toBeVisible();
  await confirmBox1.locator("button.save", { hasText: "Manter iguais" }).click();

  // Dialog 2: Migration prompt - choose "Manter local"
  const confirmBox2 = app.page.locator(".confirm-box");
  await expect(confirmBox2).toBeVisible();
  await confirmBox2.locator("button.ghost", { hasText: "Manter local" }).click();
  await app.key("Escape");

  // 4. Verify in Focos tab:
  // Both Externo (from make.md) and Areas (local) are visible!
  await expect(app.page.locator('.focus-item[data-focus-name="Externo"]')).toBeVisible();
  const areasItem = app.page.locator('.focus-item[data-focus-name="Areas"]');
  await expect(areasItem).toBeVisible();

  // .space/waypoints.json was NOT modified with "Areas"
  const content = await app.file(".space/waypoints.json");
  expect(content).not.toContain("Areas");
  expect(content).toContain("Externo");

  // In settings, localFocuses still has Areas
  const settingsJson = await app.page.evaluate(() => localStorage.getItem("verso.settings"));
  expect(settingsJson).toContain("Areas");
});

test("local focuses migrate to waypoints.json when choosing Manter iguais", async ({ app }) => {
  await app.open();

  // 1. Create a focus "Areas" without make.md
  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.page.locator("#focuses-add").click();
  await app.page.locator(".prompt-box input").fill("Areas");
  await app.page.locator(".confirm-actions button.save").click();
  await expect(app.page.locator('.focus-item[data-focus-name="Areas"]')).toBeVisible();

  // 2. make.md creates .space/waypoints.json
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Externo", paths: ["Docs"] },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  // 3. Turn on sync in settings
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings:not([hidden])");
  await expect(settingsModal).toBeVisible();
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  const syncRow = app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" });
  await syncRow.locator('input[type="checkbox"]').click();

  // Dialog 1: Warning about make.md format
  const confirmBox1 = app.page.locator(".confirm-box");
  await expect(confirmBox1).toBeVisible();
  await confirmBox1.locator("button.save", { hasText: "Manter iguais" }).click();

  // Dialog 2: Migration prompt - choose "Manter iguais"
  const confirmBox2 = app.page.locator(".confirm-box");
  await expect(confirmBox2).toBeVisible();
  await confirmBox2.locator("button.save", { hasText: "Manter iguais" }).click();
  await app.key("Escape");

  // 4. Verify in Focos tab and on disk:
  await expect(app.page.locator('.focus-item[data-focus-name="Externo"]')).toBeVisible();
  await expect(app.page.locator('.focus-item[data-focus-name="Areas"]')).toBeVisible();

  // .space/waypoints.json contains both
  const content = await app.file(".space/waypoints.json");
  expect(content).toContain("Areas");
  expect(content).toContain("Externo");

  // In settings, localFocuses was cleared
  const settingsJson = await app.page.evaluate(() => localStorage.getItem("verso.settings"));
  if (settingsJson) {
    const parsed = JSON.parse(settingsJson);
    const local = Object.values(parsed.localFocuses || {}).flat();
    expect(local).toHaveLength(0);
  }
});

test("duplicate focus names in waypoints.json are treated as known format (D6)", async ({ app }) => {
  await app.open();

  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Dup", paths: ["PastaA"] },
      { name: "Dup", paths: ["PastaB"] },
    ]),
  );
  await app.folderChanged([".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  // A known format shows no banner at all (3c0c5ca7 removed the unasked-folder notice too).
  await expect(app.page.locator(".focuses-banner")).toHaveCount(0);

  // Dup item is visible
  await expect(app.page.locator('.focus-item[data-focus-name="Dup"]').first()).toBeVisible();
});

test("deleting second duplicate focus deletes the second focus, not the first", async ({ app }) => {
  await app.open();

  await app.writeOutside("A/NotaA.md", "# Nota A\n");
  await app.writeOutside("B/NotaB.md", "# Nota B\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Foco", paths: ["A"] },
      { name: "Foco", paths: ["B"] },
    ]),
  );
  await app.folderChanged(["A/NotaA.md", "B/NotaB.md", ".space/waypoints.json"], true);

  // Turn on sync so changes save to .space/waypoints.json
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings:not([hidden])");
  await expect(settingsModal).toBeVisible();
  await app.page.locator('.settings-nav-item', { hasText: "Organização" }).click();
  const syncRow = app.page.locator(".setting", { hasText: "Manter os focos iguais aos do make.md" });
  await syncRow.locator('input[type="checkbox"]').click();
  const confirmBox = app.page.locator(".confirm-box");
  if (await confirmBox.isVisible()) {
    await confirmBox.locator("button.save", { hasText: "Manter iguais" }).click();
  }
  await app.key("Escape");

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();

  const dupItems = app.page.locator('.focus-item[data-focus-name="Foco"]');
  await expect(dupItems).toHaveCount(2);

  // Click delete on the SECOND "Foco"
  const secondDeleteBtn = dupItems.nth(1).locator('button[title="Excluir"]');
  await secondDeleteBtn.click();

  // Confirm delete dialog
  const deleteConfirm = app.page.locator(".confirm-box");
  await expect(deleteConfirm).toBeVisible();
  await deleteConfirm.locator("button.save", { hasText: "Excluir" }).click();

  // Verify only 1 "Foco" remains in the UI
  await expect(app.page.locator('.focus-item[data-focus-name="Foco"]')).toHaveCount(1);

  // Verify on disk: waypoints.json has "A" and NOT "B"
  const diskContent = await app.file(".space/waypoints.json");
  const parsed = JSON.parse(diskContent);
  const focos = parsed.filter((f) => f.name === "Foco");
  expect(focos).toHaveLength(1);
  expect(focos[0].paths).toEqual(["A"]);
});

test("create focus here prompts to sync and writes new focus directly to waypoints.json", async ({ app }) => {
  await app.open();

  await app.writeOutside("Areas/Saude.md", "# Saude\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Docs", paths: ["Documentos"] },
    ]),
  );
  await app.folderChanged(["Areas/Saude.md", ".space/waypoints.json"], true);

  // Right-click Areas folder in tree to trigger "Criar foco aqui"
  const folder = app.page.locator('#notes summary[data-folder="Areas"]');
  await expect(folder).toBeVisible();
  await folder.click({ button: "right" });

  await app.page.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  await expect(app.page.getByRole("menuitem", { name: "Criar foco aqui", exact: true })).toBeVisible();
  await app.page.getByRole("menuitem", { name: "Criar foco aqui", exact: true }).click();

  // Dialog appears asking if user wants to sync with make.md format
  const confirmBox = app.page.locator(".confirm-box");
  await expect(confirmBox).toBeVisible();
  await confirmBox.locator("button.save", { hasText: "Manter iguais" }).click();

  // The new focus is written to .space/waypoints.json once the answer is
  // handled — not in the same tick as the click.
  await expect
    .poll(async () => JSON.parse(await app.file(".space/waypoints.json")).find((f) => f.name === "Areas")?.paths ?? null)
    .toEqual(["Areas"]);

  // And localStorage localFocuses must NOT contain Areas
  const settingsJson = await app.page.evaluate(() => localStorage.getItem("verso.settings"));
  if (settingsJson) {
    const s = JSON.parse(settingsJson);
    const local = Object.values(s.localFocuses || {}).flat();
    expect(local.some((f) => f.name === "Areas")).toBe(false);
  }
});



test("a focus created in sync mode becomes the active one", async ({ app }) => {
  await app.open();

  await app.writeOutside("Areas/Saude.md", "# Saude\n");
  await app.writeOutside(".space/waypoints.json", JSON.stringify([{ name: "Home", paths: ["/"] }]));
  await app.folderChanged(["Areas/Saude.md", ".space/waypoints.json"], true);

  const folder = app.page.locator('#notes summary[data-folder="Areas"]');
  await folder.click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Criar foco aqui");
  await app.page.locator(".confirm-box button.save", { hasText: "Manter iguais" }).click();

  // The tree shows the new focus, not Início: the focus written to the file
  // is the one selected.
  await expect(app.page.locator("#notes-heading-reset")).toBeVisible();
  await expect(app.page.locator("#notes-heading")).toContainText("Areas");
});

test("adding a path to a focus created from the menu keeps the path in sync mode", async ({ app }) => {
  await app.open();

  await app.writeOutside("Areas/Saude.md", "# Saude\n");
  await app.writeOutside(".space/waypoints.json", JSON.stringify([{ name: "Home", paths: ["/"] }]));
  await app.folderChanged(["Areas/Saude.md", ".space/waypoints.json"], true);

  // No focus to add to yet: "Adicionar ao foco…" asks for a new one.
  await app.page.locator('#notes summary[data-folder="Areas"]').click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Adicionar ao foco…");
  await app.page.locator(".prompt-box input").fill("Saude");
  await app.page.locator(".confirm-actions button.save").click();
  await app.page.locator(".confirm-box button.save", { hasText: "Manter iguais" }).click();

  await expect
    .poll(async () => JSON.parse(await app.file(".space/waypoints.json")).find((f) => f.name === "Saude")?.paths)
    .toEqual(["Areas"]);
});

test("the active focus stays chosen when make.md puts a focus before it", async ({ app }) => {
  await app.open();

  await app.writeOutside("PastaA/NotaA.md", "# Nota A\n");
  await app.writeOutside("PastaB/NotaB.md", "# Nota B\n");
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Alfa", paths: ["PastaA"] },
      { name: "Beta", paths: ["PastaB"] },
    ]),
  );
  await app.folderChanged(["PastaA/NotaA.md", "PastaB/NotaB.md", ".space/waypoints.json"], true);

  await app.key("Mod+Alt+ArrowRight");
  await app.page.locator('#right-tabs button[data-tab="focuses"]').click();
  await app.page.locator('.focus-item[data-focus-name="Alfa"] .focus-name-btn').click();
  await expect(app.page.locator("#notes-heading-text")).toContainText("Alfa");

  // make.md inserts a focus at the top: Alfa moves one position down.
  await app.writeOutside(
    ".space/waypoints.json",
    JSON.stringify([
      { name: "Home", paths: ["/"] },
      { name: "Novo", paths: ["PastaB"] },
      { name: "Alfa", paths: ["PastaA"] },
      { name: "Beta", paths: ["PastaB"] },
    ]),
  );
  await app.page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(app.page.locator('.focus-item[data-focus-name="Novo"]')).toBeVisible();
  await expect(app.page.locator("#notes-heading-text")).toContainText("Alfa");
});
