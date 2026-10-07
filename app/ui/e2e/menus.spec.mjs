// Right-click menus: never two separators together, none first or last —
// a section a file or a mode leaves out leaves no empty band.

import { test, expect } from "./fixtures.mjs";

/** The menu's visible children, as "sep" or "item", in order. */
const shape = (page, selector) =>
  page.evaluate((sel) => {
    const m = document.querySelector(sel);
    if (!m) return null;
    return Array.from(m.children)
      .filter((c) => getComputedStyle(c).display !== "none")
      .map((c) => (c.matches(".menu-sep, hr, .context-menu-item-separator") ? "sep" : "item"));
  }, selector);

function tidy(kinds) {
  expect(kinds?.length ?? 0).toBeGreaterThan(0);
  expect(kinds[0]).toBe("item");
  expect(kinds[kinds.length - 1]).toBe("item");
  for (let i = 1; i < kinds.length; i++) expect(kinds[i] === "sep" && kinds[i - 1] === "sep", `two separators at ${i}`).toBe(false);
}

test("the window's menus: a note, a folder and a tab", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  for (const target of [page.locator("#notes li[data-path] > button").first(), page.locator("#notes summary[data-folder]").first(), page.locator(".tab").first()]) {
    await target.click({ button: "right" });
    await expect(page.locator(".menu:not([hidden])")).toBeVisible();
    tidy(await shape(page, ".menu:not([hidden])"));
    await page.keyboard.press("Escape");
  }
});

test("the board's canvas menu, with Excalidraw's copies hidden", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Mesa.canvas", '{"nodes":[{"id":"a","x":0,"y":0,"width":300,"height":200,"type":"text","text":"A"}],"edges":[]}');
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const box = await page.locator(".board-canvas").boundingBox();
  await page.mouse.click(box.x + 100, box.y + box.height - 100, { button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  tidy(await shape(page, ".context-menu"));
});

test("the board's menu on a card, its link and the library hidden", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Mesa.canvas", '{"nodes":[{"id":"a","x":0,"y":0,"width":300,"height":200,"type":"text","text":"A"}],"edges":[]}');
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const c = await app.centerOf("a");
  await page.mouse.click(c.x, c.y);
  await page.mouse.click(c.x, c.y, { button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  await expect(page.locator('.context-menu li[data-testid="addToLibrary"]')).toBeHidden();
  tidy(await shape(page, ".context-menu"));
});

test("a picture's right click is Verso's menu: open, download, copy, reveal — not WebKit's, whose items did nothing", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("diagrama");
  const img = page.locator(".image-box img");
  await expect(img).toBeVisible();
  await img.click({ button: "right" });
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();
  for (const item of ["Abrir em nova aba", "Baixar imagem", "Copiar imagem", "Mostrar no Finder"]) await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Baixar imagem" }).click();
  expect((await download).suggestedFilename()).toBe("diagrama.svg");
  await img.click({ button: "right" });
  await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Mostrar no Finder" }).click();
  await expect.poll(() => app.calls("reveal")).toEqual([{ path: "assets/diagrama.svg" }]);
});
