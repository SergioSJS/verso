// Walkthrough, section 14 (note 26): the layout editor (ADR 0099 item 8).
// Settings › RPG & Mesa Solo › Fichas e Templates › Editar on a built-in
// layout copies it into the folder (`.verso/layouts/`) and opens the
// editor: the tree of blocks beside the card it draws. A block added from
// the menu shows in the tree and, once it has something to say, in the
// card; Salvar writes the layout's file; the list shows it as the folder's.

import { test, expect } from "./fixtures.mjs";

test("a block added in the editor shows in the preview, and saving writes the folder's layout", async ({ app, page }) => {
  await app.open();
  const before = (await app.files()).filter((p) => p.startsWith(".verso/layouts/"));
  expect(before).toHaveLength(0);

  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Fichas e Templates" }).click();
  const card = page.locator(".statblock-gallery-card").filter({ has: page.locator(".statblock-card-title", { hasText: /^Fatos e contadores$/ }) });
  await card.getByRole("button", { name: "Editar", exact: true }).click();

  // A built-in is copied first, and the editor says so.
  const editor = page.getByRole("dialog", { name: /Editar layout/ });
  await expect(editor).toBeVisible();
  await expect(editor.locator(".sbe-notice")).toContainText("uma cópia foi criada na pasta");
  await expect(editor.getByRole("tree", { name: "Blocos do layout" })).toBeVisible();
  await expect(editor.locator(".sbe-card .statblock-card")).toBeVisible();

  // Adicionar bloco › Texto: in the tree at once, and its fixed text in the card.
  const texts = editor.getByRole("treeitem", { name: /^Texto/ });
  const had = await texts.count();
  await editor.getByRole("button", { name: "Adicionar bloco" }).click();
  await editor.getByRole("menuitem", { name: /^Texto/ }).click();
  await expect(texts).toHaveCount(had + 1);
  await editor.getByLabel("Texto fixo (pt)").fill("Marca do teste");
  await expect(editor.locator(".sbe-card")).toContainText("Marca do teste");
  await expect(editor.locator(".sbe-dirty")).toContainText("Alterações não salvas");

  await editor.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(editor.locator(".sbe-dirty")).toHaveText("");
  await expect
    .poll(async () => {
      const paths = (await app.files()).filter((p) => p.startsWith(".verso/layouts/"));
      const texts = await Promise.all(paths.map((p) => app.file(p)));
      return texts.some((t) => t?.includes("Marca do teste"));
    })
    .toBe(true);

  // Closed with nothing unsaved, no question; the list shows the copy as the folder's.
  await editor.getByRole("button", { name: "Fechar" }).click();
  await expect(editor).toBeHidden();
  const mine = page.locator(".statblock-gallery-card").filter({ hasText: "Da pasta" }).filter({ hasText: "Fatos e contadores" });
  await expect(mine).toHaveCount(1);
});
