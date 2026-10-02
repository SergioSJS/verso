// End-to-end tests for inline embed editing and emoji trigger (ADR 0060 S4).

import { test, expect } from "./fixtures.mjs";

test("typing inside an embed in reading view changes the embedded file only (ADR 0060 S4)", async ({ app, page }) => {
  await app.open();
  const parentFile = "Parent.md";
  const childFile = "Child.md";

  await app.writeOutside(parentFile, "# Parent\n\n![[Child]]\n");
  await app.writeOutside(childFile, "# Child\n\nOriginal child text.\n");
  await app.folderChanged([parentFile, childFile], true);

  await app.quickOpen("Parent");

  // In reading view, the embed is rendered in .preview
  const embed = page.locator(".preview .embed-note");
  await expect(embed).toBeVisible();
  await expect(embed.locator(".embed-note-body")).toContainText("Original child text.");

  // Click edit button in embed to start inline editing
  const editBtn = embed.locator(".embed-edit");
  await expect(editBtn).toBeAttached();
  await editBtn.click();
  await expect(embed).toHaveClass(/editing/);

  // The card editor is mounted inside the embed
  const cardEditor = embed.locator(".card-editor");
  await expect(cardEditor).toBeVisible();

  // Type inside the embed's editor
  const cmContent = cardEditor.locator(".cm-content");
  await cmContent.click();
  await app.key("End");
  await page.keyboard.type(" Added text.");
  await app.key("Mod+s");

  // Child.md should be updated with the typed text
  await expect.poll(async () => await app.file(childFile)).toContain("Added text.");

  // Parent.md must remain unchanged
  const parentText = await app.file(parentFile);
  expect(parentText).toBe("# Parent\n\n![[Child]]\n");

  // Pressing Escape leaves editing and shows the updated preview
  await cmContent.press("Escape");
  await expect(embed).not.toHaveClass(/editing/);
  await expect(embed.locator(".embed-note-body")).toContainText("Added text.");
});

test("inline embed editing in Live Preview mode", async ({ app, page }) => {
  await app.open();
  const parentFile = "LiveParent.md";
  const childFile = "LiveChild.md";

  await app.writeOutside(parentFile, "# Live Parent\n\n![[LiveChild]]\n\nFooter line.\n");
  await app.writeOutside(childFile, "# Live Child\n\nInitial child text.\n");
  await app.folderChanged([parentFile, childFile], true);

  await app.quickOpen("LiveParent");

  // Switch to Live Preview mode
  await page.getByRole("button", { name: /^(Editar|Edit)$/, exact: true }).click();

  // Move caret to line 1 away from embed so Live Preview folds line 3
  await page.locator(".cm-content").first().click({ position: { x: 50, y: 10 } });

  // Live preview embed block is rendered in .editor
  const embed = page.locator(".editor .embed-note");
  await expect(embed).toBeVisible();
  await expect(embed.locator(".embed-note-body")).toContainText("Initial child text.");

  // Click edit button to start inline editing
  const editBtn = embed.locator(".embed-edit");
  await editBtn.click();
  await expect(embed).toHaveClass(/editing/);

  // Type in the mounted card editor
  const cardEditor = embed.locator(".card-editor");
  await expect(cardEditor).toBeVisible();
  const cmContent = cardEditor.locator(".cm-content");
  await cmContent.click();
  await app.key("End");
  await page.keyboard.type(" More in live.");
  await app.key("Mod+s");

  // Verify child note is saved
  await expect.poll(async () => await app.file(childFile)).toContain("More in live.");

  // Press Escape to exit
  await cmContent.press("Escape");
  await expect(embed).not.toHaveClass(/editing/);
  await expect(embed.locator(".embed-note-body")).toContainText("More in live.");
});

test("undo stays per file between parent and embed", async ({ app, page }) => {
  await app.open();
  const parentFile = "DocA.md";
  const childFile = "DocB.md";

  await app.writeOutside(parentFile, "Start A\n\n![[DocB]]\n\nEnd A\n");
  await app.writeOutside(childFile, "Start B\n");
  await app.folderChanged([parentFile, childFile], true);

  await app.quickOpen("DocA");

  // Switch to live mode
  await page.getByRole("button", { name: /^(Editar|Edit)$/, exact: true }).click();

  // Type in parent editor at the start
  const parentContent = page.locator(".cm-content").first();
  await parentContent.click({ position: { x: 50, y: 10 } });
  await app.key("Mod+Home");
  await page.keyboard.type("Prefix ");
  await expect(parentContent).toContainText("Prefix Start A");

  // Move cursor back to top line so embed on line 3 folds
  await app.key("Mod+Home");

  // Enter DocB embed in .editor
  const embed = page.locator(".editor .embed-note");
  await expect(embed).toBeVisible();
  await embed.locator(".embed-edit").click();

  const childContent = embed.locator(".card-editor .cm-content");
  await expect(childContent).toBeVisible();
  await childContent.click();
  await app.key("End");
  await page.keyboard.type(" Suffix");
  await expect(childContent).toContainText("Start B Suffix");

  // Undo inside embed
  await app.key("Mod+z");
  await expect(childContent).not.toContainText("Suffix");

  // Click back to parent: parent still has "Prefix"
  await parentContent.click({ position: { x: 50, y: 10 } });
  await expect(parentContent).toContainText("Prefix Start A");
});

test("conflict on the embedded file shows two versions", async ({ app, page }) => {
  await app.open();
  const parentFile = "ConflictParent.md";
  const childFile = "ConflictChild.md";

  await app.writeOutside(parentFile, "# Parent\n\n![[ConflictChild]]\n");
  await app.writeOutside(childFile, "# Conflict Child\nOriginal\n");
  await app.folderChanged([parentFile, childFile], true);

  await app.quickOpen("ConflictParent");

  const embed = page.locator(".preview .embed-note");
  await expect(embed).toBeVisible();
  await embed.locator(".embed-edit").click();

  const cardEditor = embed.locator(".card-editor");
  await expect(cardEditor).toBeVisible();
  const cmContent = cardEditor.locator(".cm-content");
  await cmContent.click();
  await app.key("End");
  await page.keyboard.type(" Local change");

  // Write external conflict to Child file
  await app.writeOutside(childFile, "# Conflict Child\nExternal remote change\n");

  // Save from embed editor triggers conflict
  await app.key("Mod+s");

  // Conflict banner should appear in the embed
  const banner = embed.locator(".conflict");
  await expect(banner).toBeVisible();
});

test("emoji trigger with : opens completion and inserts emoji (ADR 0060 E4)", async ({ app, page }) => {
  await app.open();
  const testFile = "EmojiTest.md";

  await app.writeOutside(testFile, "Hello \n");
  await app.folderChanged([testFile], true);

  await app.quickOpen("EmojiTest");

  // Switch to edit mode
  await page.getByRole("button", { name: /^(Editar|Edit)$/, exact: true }).click();

  const editorContent = page.locator(".cm-content").first();
  await editorContent.click();
  await app.key("End");

  // Type :smi
  await page.keyboard.type(":smi");

  // Autocomplete tooltip should appear
  const tooltip = page.locator(".cm-tooltip-autocomplete");
  await expect(tooltip).toBeVisible();

  // Click the first matching emoji in the list
  const option = tooltip.locator("li").first();
  await option.click();

  // The text should now contain an emoji character instead of :smi
  await expect(editorContent).not.toContainText(":smi");
  const text = await editorContent.textContent();
  expect(/[\u{1F300}-\u{1F9FF}]/u.test(text)).toBe(true);
});
