// End-to-end tests for make.md folder pages enhancements (ADR 0060 S2).

import { test, expect } from "./fixtures.mjs";

test("folder page displays folder note, cover banner, sticker, and default table", async ({ app }) => {
  await app.open();
  const folderNote = "Projects/Projects.md";
  const itemNote = "Projects/Task1.md";
  await app.writeOutside(
    folderNote,
    `---
banner: assets/diagrama.svg
banner_y: "40"
sticker: emoji//1f4c1
color: "#3b82f6"
---
# Projects Overview

Welcome to projects folder note.
`,
  );
  await app.writeOutside(itemNote, "# Task 1\nDetails here.\n");
  await app.folderChanged([folderNote, itemNote], true);

  // Click on folder label to open folder leaf
  const summary = app.page.locator('#notes summary[data-folder="Projects"]');
  await expect(summary).toBeVisible();
  const label = summary.locator(".folder-label");
  await label.click();

  // Folder leaf is active
  const sheet = app.page.locator(".sheet");
  await expect(sheet).toBeVisible();

  // Cover banner is visible
  const coverBox = sheet.locator(".note-cover-box");
  await expect(coverBox).toBeVisible();
  const coverImg = coverBox.locator("img.note-cover-img");
  await expect(coverImg).toBeVisible();

  // Sticker button is visible
  const stickerBtn = sheet.locator(".note-sticker-btn");
  await expect(stickerBtn).toBeVisible();
  await expect(stickerBtn).toHaveText("📁");

  // Title has color
  const title = sheet.locator(".note-title");
  await expect(title).toHaveCSS("color", "rgb(59, 130, 246)");

  // Folder note content is displayed
  const noteBody = sheet.locator(".folder-note-body");
  await expect(noteBody).toContainText("Welcome to projects folder note.");

  // Base table is mounted and rendered (default folderPageTable is true)
  const baseContainer = sheet.locator(".folder-base-container");
  await expect(baseContainer).toBeVisible();
  const base = baseContainer.locator(".base");
  await expect(base).toBeVisible();
});

test("turn note into folder moves note into new folder as folder note", async ({ app }) => {
  await app.open();
  const note = "OrphanDoc.md";
  await app.writeOutside(note, "# Orphan Doc\nThis note will become a folder.\n");
  await app.folderChanged([note], true);

  const row = app.page.locator(`#notes li[data-path="${note}"] > button`);
  await expect(row).toBeVisible();

  // Trigger context menu
  await row.click({ button: "right" });
  const menu = app.page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();

  await menu.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  const turnBtn = menu.getByRole("menuitem", { name: "Transformar em pasta" });
  await expect(turnBtn).toBeVisible();
  await turnBtn.click();

  // If a plan is shown, confirm it
  const plan = app.page.locator(".plan:not([hidden])");
  if (await plan.isVisible({ timeout: 2000 }).catch(() => false)) {
    await plan.locator("button.save").click();
  }

  // The folder note OrphanDoc/OrphanDoc.md should now exist
  await expect.poll(async () => {
    const files = await app.files();
    return files.includes("OrphanDoc/OrphanDoc.md");
  }).toBe(true);
});

test("a folder page's right click offers what the tree's does, with icons", async ({ app }) => {
  await app.open();
  await app.writeOutside("Pasta/Item.md", "# Item\n");
  await app.folderChanged(["Pasta/Item.md"], true);
  await app.page.locator('#notes summary[data-folder="Pasta"] .folder-label').click();
  const leaf = app.page.locator(".leaf:not([hidden])").filter({ has: app.page.locator(".folder-tools") });
  await expect(leaf).toBeVisible();
  // Off the items: the folder's own menu.
  const tools = leaf.locator(".folder-tools");
  const box = await tools.boundingBox();
  await app.page.mouse.click(box.x + 2, box.y + box.height + 40, { button: "right" });
  const items = app.page.locator('.menu:not([hidden]) button[role="menuitem"]');
  for (const label of ["Nova nota nesta pasta", "Nova pasta", "Nova base", "Novo board", "Nova página web…", /^Mostrar no /, "Copiar caminho relativo"]) {
    await expect(items.filter({ hasText: label })).toHaveCount(1);
  }
  // Every item with its icon.
  const withoutIcon = await items.evaluateAll((els) => els.filter((e) => !e.querySelector("svg")).map((e) => e.textContent));
  expect(withoutIcon).toEqual([]);
});

test("a PDF shows its first page in a folder's view", async ({ app }) => {
  await app.open();
  await app.page.locator('#notes summary[data-folder="assets"] .folder-label').click();
  const leaf = app.page.locator(".leaf:not([hidden])").filter({ has: app.page.locator(".folder-tools") });
  await leaf.locator(".folder-tools button[title='Miniaturas']").click();
  const pdf = leaf.locator(".item.kind-pdf .thumb");
  await expect(pdf).toBeVisible();
  // Drawn by pdf.js from the file, once the row is on screen.
  const cover = pdf.locator("img.pdf-cover");
  await expect(cover).toBeVisible({ timeout: 15000 });
  expect(await cover.evaluate((img) => img.src.startsWith("data:image/png") && img.naturalWidth > 100)).toBe(true);
});
