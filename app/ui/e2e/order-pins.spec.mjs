// End-to-end tests for make.md manual order, pins, and hide from tree (ADR 0060 S3).

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

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
  // The folder note itself is no row of the tree.
  await expect(items).toHaveCount(3);

  const paths = [];
  for (let i = 0; i < 3; i++) {
    paths.push(await items.nth(i).getAttribute("data-path"));
  }
  expect(paths).toEqual(["Tasks/Third.md", "Tasks/First.md", "Tasks/Second.md"]);
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

  await menu.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  const pinBtn = menu.getByRole("menuitem", { name: "Fixar na pasta" });
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

  await menu2.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  const unpinBtn = menu2.getByRole("menuitem", { name: "Desafixar da pasta" });
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

  await menu.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  const hideBtn = menu.getByRole("menuitem", { name: "Ocultar da árvore" });
  await expect(hideBtn).toBeVisible();
  await hideBtn.click();

  // Row should no longer be visible in tree
  await expect(row).not.toBeVisible();

  // Unhide from the list in Settings › Organizing (ADR 0060, memo S3)
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Organização" }).click();
  const hiddenRow = app.page.locator(".hidden-item-row", { hasText: secretNote });
  await expect(hiddenRow).toBeVisible();
  await hiddenRow.getByRole("button", { name: "Mostrar" }).click();
  await expect(hiddenRow).toHaveCount(0);
  await app.key("Escape");

  // Row should now be visible again in tree
  await expect(app.page.locator(`#notes li[data-path="${secretNote}"] > button`)).toBeVisible();
});

test("pinning in a folder with no folder note creates it, with no question", async ({ app }) => {
  await app.open();
  const item = "Solo/Item.md";
  await app.writeOutside(item, "# Item\n");
  await app.folderChanged([item], true);

  const summary = app.page.locator('#notes summary[data-folder="Solo"]');
  await expect(summary).toBeVisible();
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  const row = details.locator(`li[data-path="${item}"] > button`);
  await row.click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Fixar na pasta");

  // Made at once (the maintainer, 2026-10-02), and said in the status bar.
  await expect.poll(async () => (await app.files()).includes("Solo/Solo.md")).toBe(true);
  await expect(app.page.getByRole("alertdialog")).toHaveCount(0);
  await expect(app.page.locator("#status")).toContainText("Nota da pasta criada: Solo/Solo.md");
  await expect.poll(async () => app.file("Solo/Solo.md")).toContain('- "[[Item]]"');
});

test("the menu switches the tree between alphabetical and custom order, keeping the custom one", async ({ app }) => {
  await app.open();
  const text = "---\norder:\n  - B.md\n  - A.md\n---\n# Lista\n";
  await app.writeOutside("Lista/Lista.md", text);
  await app.writeOutside("Lista/A.md", "# A\n");
  await app.writeOutside("Lista/B.md", "# B\n");
  await app.folderChanged(["Lista/Lista.md", "Lista/A.md", "Lista/B.md"], true);

  const summary = app.page.locator('#notes summary[data-folder="Lista"]');
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  const order = () => app.page.locator('#notes summary[data-folder="Lista"]').locator("xpath=..").locator("ul > li[data-path]").evaluateAll((els) => els.map((e) => e.dataset.path));
  await expect.poll(order).toEqual(["Lista/B.md", "Lista/A.md"]);

  const menu = app.page.locator(".menu:not([hidden])");
  await summary.click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Ordem alfabética");
  await expect.poll(order).toEqual(["Lista/A.md", "Lista/B.md"]);
  // The custom order is kept, not taken out.
  expect(await app.file("Lista/Lista.md")).toBe(text);

  await app.page.locator('#notes summary[data-folder="Lista"]').click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Ordem personalizada");
  await expect.poll(order).toEqual(["Lista/B.md", "Lista/A.md"]);
  expect(await app.file("Lista/Lista.md")).toBe(text);

  // The same switch, from the button beside "Arquivos".
  const toggle = app.page.getByRole("button", { name: "Ordem personalizada", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(order).toEqual(["Lista/A.md", "Lista/B.md"]);
  await toggle.click();
  await expect.poll(order).toEqual(["Lista/B.md", "Lista/A.md"]);
  await expect(app.page.getByRole("navigation", { name: "Arquivos", exact: true })).toBeVisible();
});

test("the root's notes are ordered by dragging, in the root's note", async ({ app }) => {
  await app.open();
  const before = await app.files();
  const row = (p) => app.page.locator(`#notes > li[data-path="${p}"] > button`);
  const first = "00 - Bem-vindo ao Verso.md";
  const second = "01 - Guia de Markdown e Sintaxe.md";
  await expect(row(second)).toBeVisible();
  // The root's notes sit below the folders, which the demo vault keeps
  // growing (the tutorial's pictures, its folders): bring the pair into the
  // window before reading where they are, never assume it fits unscrolled.
  await row(second).scrollIntoViewIfNeeded();
  await row(first).scrollIntoViewIfNeeded();
  await row(second).scrollIntoViewIfNeeded();
  const a = await row(second).boundingBox();
  const b = await row(first).boundingBox();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await app.page.mouse.down();
  await app.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 8, { steps: 4 });
  await app.page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.2, { steps: 12 });
  await app.page.mouse.up();

  // The root's note, named after the open folder, made at once.
  await expect.poll(async () => (await app.files()).filter((p) => !before.includes(p) && !p.includes("/")).length).toBe(1);
  const rootNote = (await app.files()).find((p) => !before.includes(p) && !p.includes("/"));
  // The note may be made before its order is written into it: wait for
  // both names, then compare their places.
  await expect
    .poll(async () => {
      const text = await app.file(rootNote);
      const [s, f] = [text.indexOf(`- ${second}`), text.indexOf(`- ${first}`)];
      return s >= 0 && f >= 0 && s < f;
    })
    .toBe(true);
  await expect.poll(async () => app.page.locator("#notes > li[data-path]").evaluateAll((els) => els.slice(0, 2).map((e) => e.dataset.path))).toEqual([second, first]);
  // Redrawn in place: the rows do not rise again, top to bottom.
  await expect(app.page.locator("#notes")).not.toHaveClass(/reveal/);
});

test("renaming a folder renames its folder note, and its open tab follows", async ({ app }) => {
  await app.open();
  await app.writeOutside("Team/Team.md", "---\nsticker: emoji//1f465\n---\n# Team\n");
  await app.writeOutside("Team/Alice.md", "# Alice\n");
  await app.folderChanged(["Team/Team.md", "Team/Alice.md"], true);
  await app.quickOpen("Team");

  const summary = app.page.locator('#notes summary[data-folder="Team"]');
  await summary.focus();
  await app.page.keyboard.press("F2");
  const field = app.page.locator("#notes input");
  await expect(field).toBeVisible();
  await field.fill("Crew");
  await field.press("Enter");
  const save = app.page.locator(".plan:visible button.save");
  if (await save.isVisible().catch(() => false)) await save.click();

  await expect.poll(() => app.files()).toContain("Crew/Crew.md");
  expect(await app.files()).not.toContain("Crew/Team.md");
  await expect(app.page.locator('#notes summary[data-folder="Crew"] .entry-sticker')).toHaveCount(1);
  await expect(app.page.locator(".tab", { hasText: "Crew" })).toBeVisible();
  await expect(app.page.locator(".tab", { hasText: "Team" })).toHaveCount(0);
  await expect(app.page.locator(".load-failure")).toHaveCount(0);
});

test("a folder's note is not a row of the tree; the folder's menu opens it", async ({ app }) => {
  await app.open();
  await app.writeOutside("Caixa/Caixa.md", "# Caixa\n");
  await app.writeOutside("Caixa/Item.md", "# Item\n");
  await app.writeOutside("Lado.md", "# Lado\n");
  await app.writeOutside("Lado/Coisa.md", "# Coisa\n");
  await app.folderChanged(["Caixa/Caixa.md", "Caixa/Item.md", "Lado.md", "Lado/Coisa.md"], true);

  const summary = app.page.locator('#notes summary[data-folder="Caixa"]');
  const details = summary.locator("xpath=..");
  await details.evaluate((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); });
  await expect(details.locator('li[data-path="Caixa/Item.md"]')).toBeVisible();
  await expect(app.page.locator('#notes li[data-path="Caixa/Caixa.md"]')).toHaveCount(0);
  // A note beside its folder is the folder's too.
  await expect(app.page.locator('#notes li[data-path="Lado.md"]')).toHaveCount(0);

  await summary.click({ button: "right" });
  await pickMenu(app.page, "Organizar", "Abrir nota da pasta");
  await expect(app.page.locator(".tab", { hasText: "Caixa" })).toBeVisible();
});
