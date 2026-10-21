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
  // Selected, the card is entered a moment later and takes the pointer
  // (its links, its text): a right click then never reached the board, and
  // no menu opened — seen as a flaky test under load, where the two clicks
  // came apart (2026-10-08). The pause makes that the case every time.
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(600);
  await page.mouse.click(c.x, c.y, { button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  await expect(page.locator('.context-menu li[data-testid="addToLibrary"]')).toBeHidden();
  tidy(await shape(page, ".context-menu"));
});

test("a picture card on a board keeps the window's picture menu", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Fotos.canvas", '{"nodes":[{"id":"p","x":0,"y":0,"width":300,"height":200,"type":"file","file":"assets/diagrama.svg"}],"edges":[]}');
  await app.folderChanged(["Fotos.canvas"], true);
  await app.quickOpen("Fotos");
  await app.boardReady();
  await expect(page.locator(".board-card-image img").first()).toBeVisible();
  const c = await app.centerOf("p");
  // Entered (selected, a moment later), its right click is the picture's
  // menu, not the board's: the window's image menu answers in the capture
  // phase, and the card's forwarding skips pictures besides.
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(600);
  await page.mouse.click(c.x, c.y, { button: "right" });
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu.getByRole("menuitem", { name: "Baixar imagem" })).toBeVisible();
  await expect(page.locator(".context-menu")).toHaveCount(0);
});

test("a picture's right click is Verso's menu: open, download, copy, reveal — not WebKit's, whose items did nothing", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("diagrama");
  const img = page.locator(".image-box img");
  await expect(img).toBeVisible();
  await img.click({ button: "right" });
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();
  // "Mostrar no Finder" on the Mac, File Explorer or the file manager elsewhere.
  for (const item of ["Abrir em nova aba", "Baixar imagem", "Copiar imagem", /^Mostrar no /]) await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  const download = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Baixar imagem" }).click();
  expect((await download).suggestedFilename()).toBe("diagrama.svg");
  await img.click({ button: "right" });
  await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: /^Mostrar no / }).click();
  await expect.poll(() => app.calls("reveal")).toEqual([{ path: "assets/diagrama.svg" }]);
});

// A file's menu is grouped (2026-10-21): the often-used actions stay in
// the first list, the rest sits in submenus that open by hover, by → /
// Enter and by a tap, and close by ← / Esc.
const topRows = (page) => page.locator(".menu:not([hidden]) > li:not(.menu-sep) > button");

async function openFileMenu(app, page) {
  await app.open();
  const row = page.locator("#notes li[data-path] > button").first();
  const path = await row.locator("xpath=..").getAttribute("data-path");
  await row.click({ button: "right" });
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  return path;
}

test("a file's menu is short, its groups are submenus", async ({ app, page }) => {
  await openFileMenu(app, page);
  const n = await topRows(page).count();
  expect(n, "top-level rows").toBeLessThanOrEqual(14);
  for (const group of ["Personalizar", "Organizar", "Novo"]) {
    const b = page.getByRole("menuitem", { name: group, exact: true });
    await expect(b).toHaveAttribute("aria-haspopup", "menu");
    await expect(b).toHaveAttribute("aria-expanded", "false");
  }
  // What was loose before is now inside a group, not in the first list.
  for (const gone of ["Alterar cor…", "Mover para cima", "Criar foco aqui", "Nova pasta", "Importar cofre de exemplo"]) {
    await expect(page.getByRole("menuitem", { name: gone })).toHaveCount(0);
  }
  await expect(page.getByRole("menuitem", { name: "Renomear" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Mover para a lixeira" })).toBeVisible();
});

test("a submenu opens by hover and closes by Esc and by the left arrow", async ({ app, page }) => {
  await openFileMenu(app, page);
  const parent = page.getByRole("menuitem", { name: "Novo", exact: true });
  await parent.hover();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem", { name: "Nova pasta" })).toBeVisible();
  // Moving to another group swaps the submenu.
  await page.getByRole("menuitem", { name: "Organizar", exact: true }).hover();
  await expect(page.getByRole("menuitem", { name: "Nova pasta" })).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Ocultar da árvore" })).toBeVisible();
  // Enter on it: the keyboard path, the first item focused.
  await page.getByRole("menuitem", { name: "Novo", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Nova nota nesta pasta" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menuitem", { name: "Nova pasta" })).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Novo", exact: true })).toBeFocused();
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Nova nota nesta pasta" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Nova pasta" })).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Novo", exact: true })).toBeFocused();
  // A second Esc closes the menu itself.
  await page.keyboard.press("Escape");
  await expect(page.locator(".menu:not([hidden])")).toHaveCount(0);
});

test("an action inside a submenu runs and closes the menu", async ({ app, page }) => {
  const path = await openFileMenu(app, page);
  await page.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ocultar da árvore" }).click();
  await expect(page.locator(".menu:not([hidden])")).toHaveCount(0);
  await expect(page.locator(`#notes li[data-path="${path}"]`)).toHaveCount(0);
});

test("a submenu stays on the screen near the right edge", async ({ app, page }) => {
  await app.open();
  const row = page.locator("#notes li[data-path] > button").first();
  const box = await row.boundingBox();
  const vw = page.viewportSize().width;
  await row.click({ button: "right", position: { x: Math.min(box.width - 4, 40), y: 8 } });
  // Put the menu against the right edge, then open a group.
  await page.evaluate(() => {
    const m = document.querySelector(".menu:not([hidden])");
    m.style.left = `${window.innerWidth - m.offsetWidth - 8}px`;
  });
  await page.getByRole("menuitem", { name: "Organizar", exact: true }).click();
  const sub = await page.locator(".menu-sub:not([hidden])").boundingBox();
  expect(sub.x).toBeGreaterThanOrEqual(0);
  expect(sub.x + sub.width).toBeLessThanOrEqual(vw);
});
