// End-to-end tests for make.md manual order, pins, and hide from tree (ADR 0060 S3).

import { test, expect } from "./fixtures.mjs";

test("pinned items sort first in tree and show pin badge", async ({ app }) => {
  await app.open();
  const folderNote = "Projects/Projects.md";
  const noteA = "Projects/Alpha.md";
  const noteB = "Projects/Beta.md";
  const noteZ = "Projects/Zeta.md";

  await app.writeOutside(
    folderNote,
    `---
pinned:
  - "[[Zeta]]"
---
# Projects
`,
  );
  await app.writeOutside(noteA, "# Alpha\n");
  await app.writeOutside(noteB, "# Beta\n");
  await app.writeOutside(noteZ, "# Zeta\n");
  await app.folderChanged([folderNote, noteA, noteB, noteZ], true);

  // In tree, expand Projects by clicking chevron
  const summary = app.page.locator('#notes summary[data-folder="Projects"]');
  await expect(summary).toBeVisible();
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  await expect(details).toHaveAttribute("open", "");

  // Zeta should have pin badge
  const zetaRow = details.locator('li[data-path="Projects/Zeta.md"] > button');
  await expect(zetaRow).toBeVisible();
  const pinBadge = zetaRow.locator(".pin-badge");
  await expect(pinBadge).toBeVisible();

  // Zeta should appear first among the folder's direct items
  const items = details.locator("ul > li[data-path]");
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(3);
  const firstPath = await items.first().getAttribute("data-path");
  expect(firstPath).toBe("Projects/Zeta.md");
});

test("manual order in folder note orders tree entries", async ({ app }) => {
  await app.open();
  const folderNote = "Tasks/Tasks.md";
  const note1 = "Tasks/First.md";
  const note2 = "Tasks/Second.md";
  const note3 = "Tasks/Third.md";

  await app.writeOutside(
    folderNote,
    `---
order:
  - Third.md
  - First.md
  - Second.md
---
# Tasks
`,
  );
  await app.writeOutside(note1, "# First\n");
  await app.writeOutside(note2, "# Second\n");
  await app.writeOutside(note3, "# Third\n");
  await app.folderChanged([folderNote, note1, note2, note3], true);

  // Expand Tasks folder
  const summary = app.page.locator('#notes summary[data-folder="Tasks"]');
  await expect(summary).toBeVisible();
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  await expect(details).toHaveAttribute("open", "");

  const items = details.locator("ul > li[data-path]");
  await expect(items).toHaveCount(4);

  const paths = [];
  for (let i = 0; i < 4; i++) {
    paths.push(await items.nth(i).getAttribute("data-path"));
  }
  expect(paths).toEqual(["Tasks/Third.md", "Tasks/First.md", "Tasks/Second.md", "Tasks/Tasks.md"]);
});

test("pin and unpin via context menu updates folder note frontmatter", async ({ app }) => {
  await app.open();
  const folderNote = "Team/Team.md";
  const member = "Team/Alice.md";

  await app.writeOutside(folderNote, "# Team\n");
  await app.writeOutside(member, "# Alice\n");
  await app.folderChanged([folderNote, member], true);

  const summary = app.page.locator('#notes summary[data-folder="Team"]');
  await expect(summary).toBeVisible();
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  await expect(details).toHaveAttribute("open", "");

  const row = details.locator(`li[data-path="${member}"] > button`);
  await expect(row).toBeVisible();

  // Right-click Alice to open context menu
  await row.click({ button: "right" });
  const menu = app.page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();

  const pinBtn = menu.locator("button", { hasText: "Fixar na pasta" });
  await expect(pinBtn).toBeVisible();
  await pinBtn.click();

  // Verify folder note now contains pinned: - "[[Alice]]"
  await expect.poll(async () => {
    const text = await app.file(folderNote);
    return text.includes("pinned:") && text.includes("[[Alice]]");
  }).toBe(true);

  // Unpin via context menu
  await row.click({ button: "right" });
  const menu2 = app.page.locator(".menu:not([hidden])");
  await expect(menu2).toBeVisible();

  const unpinBtn = menu2.locator("button", { hasText: "Desafixar da pasta" });
  await expect(unpinBtn).toBeVisible();
  await unpinBtn.click();

  // Verify folder note no longer contains [[Alice]]
  await expect.poll(async () => {
    const text = await app.file(folderNote);
    return !text.includes("[[Alice]]");
  }).toBe(true);
});

test("hide from tree removes item from tree and unhide in settings restores it", async ({ app }) => {
  await app.open();
  const secretNote = "Private.md";
  await app.writeOutside(secretNote, "# Private Note\n");
  await app.folderChanged([secretNote], true);

  const row = app.page.locator(`#notes li[data-path="${secretNote}"] > button`);
  await expect(row).toBeVisible();

  // Right-click and hide from tree
  await row.click({ button: "right" });
  const menu = app.page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();

  const hideBtn = menu.locator("button", { hasText: "Ocultar da árvore" });
  await expect(hideBtn).toBeVisible();
  await hideBtn.click();

  // Row should no longer be visible in tree
  await expect(row).not.toBeVisible();

  // Open settings via Mod+,
  await app.key("Mod+,");
  const settingsModal = app.page.locator(".settings");
  await expect(settingsModal).toBeVisible();

  // Navigate to Organizing section
  const orgTab = app.page.locator(".settings-nav-item", { hasText: "Organização" });
  await orgTab.click();

  // Hidden item row should be visible with "Mostrar" button
  const hiddenItem = app.page.locator(".hidden-item-row", { hasText: secretNote });
  await expect(hiddenItem).toBeVisible();

  const unhideBtn = hiddenItem.locator("button", { hasText: "Mostrar" });
  await unhideBtn.click();

  // Close settings via Escape
  await app.key("Escape");

  // Row should now be visible again in tree
  await expect(app.page.locator(`#notes li[data-path="${secretNote}"] > button`)).toBeVisible();
});
