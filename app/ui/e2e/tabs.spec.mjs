// Walkthrough, sections 2 and 6: tabs (ADR 0059), ⌘W, F2.

import { test, expect } from "./fixtures.mjs";

const row = (app, path) => app.page.locator(`#notes li[data-path="${path}"] > button`);

test("a click opens a preview tab, which the next click replaces; a double click keeps it", async ({ app }) => {
  await app.open();
  await row(app, "01 - Guia de Markdown e Sintaxe.md").click();
  const preview = app.page.locator(".tab.preview");
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("01 - Guia de Markdown e Sintaxe");
  await row(app, "02 - Links, Âncoras e Notas Incorporadas.md").click();
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText("02 - Links");
  await expect(app.page.locator(".tab", { hasText: "01 - Guia de Markdown" })).toHaveCount(0);
  await row(app, "02 - Links, Âncoras e Notas Incorporadas.md").dblclick();
  await expect(app.page.locator(".tab.preview")).toHaveCount(0);
  await expect(app.page.locator(".tab", { hasText: "02 - Links" })).toHaveCount(1);
});

test("⌘W closes the tab — from the keys and from the app's menu — and ⌘⇧T opens it again", async ({ app }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  const tab = app.page.locator(".tab", { hasText: "03 - Propriedades" });
  await expect(tab).toHaveCount(1);
  await app.key("Mod+w");
  await expect(tab).toHaveCount(0);
  await app.key("Mod+Shift+t");
  await expect(tab).toHaveCount(1);
  // File › Close Tab (⌘W) on a Mac: the host's menu tells the window (bf12a4d).
  await app.emit("menu-close-tab", "main");
  await expect(tab).toHaveCount(0);
});

test("F2 renames the open note, right after a click on its row", async ({ app }) => {
  await app.open();
  await row(app, "38 - Ajuda, Atualizações e Diagnóstico.md").click();
  await expect(app.page.locator(".tab", { hasText: "38 - Ajuda" })).toHaveCount(1);
  await app.page.keyboard.press("F2");
  const field = app.page.locator("input.title-input");
  await expect(field).toBeVisible();
  await field.fill("37 - Ajuda");
  await field.press("Enter");
  // The notes that point to it are rewritten, after the plan is shown.
  await app.page.locator(".plan button.save").click();
  await expect.poll(() => app.files()).toContain("37 - Ajuda.md");
  await expect.poll(() => app.file("00 - Bem-vindo ao Verso.md")).toContain("[[37 - Ajuda]]");
});

test("after a click on a row the arrows walk the tree from it, and F2 still renames the open note", async ({ app }) => {
  await app.open();
  const first = row(app, "01 - Guia de Markdown e Sintaxe.md");
  await first.click();
  await expect(first).toBeFocused();
  await app.page.keyboard.press("ArrowDown");
  await expect(row(app, "02 - Links, Âncoras e Notas Incorporadas.md")).toBeFocused();
  await app.page.keyboard.press("ArrowUp");
  await expect(first).toBeFocused();
  // Reached by the keys, the row takes F2 itself: it is renamed in place.
  await app.page.keyboard.press("F2");
  await expect(app.page.locator("#notes input.rename")).toBeVisible();
  await app.page.keyboard.press("Escape");
});

test("back steps through the notes clicked in the tree, though one preview tab showed them all", async ({ app }) => {
  await app.open();
  for (const p of ["01 - Guia de Markdown e Sintaxe.md", "02 - Links, Âncoras e Notas Incorporadas.md", "03 - Propriedades e Metadados.md"]) await row(app, p).click();
  await expect(app.page.locator(".tab.preview")).toContainText("03 - Propriedades");
  // The trail is of notes, not tabs (review `board.md` §6 item 18).
  await app.key("Mod+[");
  await expect(app.page.locator(".tab.preview")).toContainText("02 - Links");
  await app.key("Mod+[");
  await expect(app.page.locator(".tab.preview")).toContainText("01 - Guia");
  await app.key("Mod+]");
  await expect(app.page.locator(".tab.preview")).toContainText("02 - Links");
});

test("a question on screen is answered before the menu's ⌘W closes anything", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  const tab = page.locator(".tab", { hasText: "03 - Propriedades" });
  await app.key("Mod+,");
  await expect(page.locator(".settings-nav-item").first()).toBeVisible();
  await app.emit("menu-close-tab", "main");
  await page.waitForTimeout(300);
  await expect(tab).toHaveCount(1);
});

test("back follows a note renamed meanwhile", async ({ app }) => {
  await app.open();
  await row(app, "01 - Guia de Markdown e Sintaxe.md").click();
  await row(app, "02 - Links, Âncoras e Notas Incorporadas.md").click();
  // The first note, no longer in a tab, is renamed from its row.
  await row(app, "01 - Guia de Markdown e Sintaxe.md").focus();
  await app.page.keyboard.press("F2");
  const field = app.page.locator("#notes input");
  await expect(field).toBeVisible();
  await field.fill("01 - Guia");
  await field.press("Enter");
  const save = app.page.locator(".plan:visible button.save");
  if (await save.isVisible().catch(() => false)) await save.click();
  await expect.poll(() => app.files()).toContain("01 - Guia.md");
  await app.key("Mod+[");
  // The trail follows the rename (review `board.md`, second reading, finding 6).
  await expect(app.page.locator(".tab.preview")).toContainText("01 - Guia");
  await expect(app.page.locator(".load-failure")).toHaveCount(0);
});

test("a text file changed here and on disk keeps both on a third choice: the disk's under the name, mine in a copy", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Lista.txt", "um\ndois\n");
  await app.folderChanged(["Lista.txt"], true);
  await row(app, "Lista.txt").dblclick();
  await page.locator(".cm-content:visible").first().click();
  await app.key("Mod+End");
  await page.keyboard.type("três aqui");
  // Before the autosave: another program wrote the file meanwhile.
  const outside = "um\ndois\nlá fora\n";
  await app.writeOutside("Lista.txt", outside);
  const conflict = page.locator(".conflict:visible");
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("button")).toHaveText(["Descartar o meu e recarregar", "Gravar o meu por cima", "Guardar os dois"]);
  await conflict.getByRole("button", { name: "Guardar os dois" }).click();
  const named = /^Lista \(conflito, Mac de Teste, \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\)\.txt$/;
  await expect.poll(async () => (await app.files()).filter((f) => named.test(f)).length).toBe(1);
  const copy = (await app.files()).find((f) => named.test(f));
  expect(await app.file("Lista.txt")).toBe(outside);
  expect(await app.file(copy)).toBe("um\ndois\ntrês aqui");
  // The tab shows the copy, with nothing left to save and no conflict.
  await expect(page.locator(".conflict:visible")).toHaveCount(0);
  await expect(page.locator(".tab.active, .tab[aria-selected='true']").first()).toContainText("conflito, Mac de Teste");
  await expect(page.locator("#status")).toContainText("Os dois ficaram");
});

test("a hidden tab bar always has a named way back: the pane's own button on a phone, the palette, Settings @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("03 - Propriedades");
  const bar = page.locator(".pane .tabs");
  const phone = (page.viewportSize()?.width ?? 1500) <= 760;
  await expect(bar).toBeVisible();
  // Hide it from the palette, which a phone opens from its bottom bar.
  await app.command("Ocultar barra de abas");
  await expect(page.locator(".pane.tabs-hidden")).toHaveCount(1);
  await expect(bar).toBeHidden();
  if (phone) {
    // The only thing on a phone: a button with the bar's name on it.
    const back = page.getByRole("button", { name: "Mostrar barra de abas" });
    await expect(back).toBeVisible();
    if (process.env.PHONE_SHOTS) await page.screenshot({ path: `${process.env.PHONE_SHOTS}/tabs-hidden-${page.viewportSize().width}.png` });
    const box = await back.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
    await back.click();
    await expect(bar).toBeVisible();
    await app.command("Ocultar barra de abas");
    await expect(bar).toBeHidden();
  }
  // The palette brings it back, by the name the button has.
  await app.command("Mostrar barra de abas");
  await expect(bar).toBeVisible();
  // And so does the switch in Settings.
  await app.command("Ocultar barra de abas");
  await expect(bar).toBeHidden();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Editor" }).click();
  const sw = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Mostrar barra de abas$/ }) });
  await expect(sw).toBeVisible();
  await sw.locator("label.switch").click();
  await expect(page.locator(".pane.tabs-hidden")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(bar).toBeVisible();
});
