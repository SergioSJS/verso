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
