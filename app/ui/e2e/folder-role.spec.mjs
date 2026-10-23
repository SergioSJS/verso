// A person's role is per folder (ADR 0076 item 11; ADR 0027): the desktop
// window that shows a server's folder asks the side again, and where it
// only reads, the board has no tools, the editor reads and the line says
// so — without a reload. The app's own abilities (windows, updates,
// console, folders of this computer) stay.

import { test, expect } from "./fixtures.mjs";

const BOARD = `{\n\t"nodes":[\n\t\t{"id":"a","type":"text","text":"Primeiro","x":0,"y":0,"width":300,"height":80}\n\t],\n\t"edges":[]\n}`;

test("a window that comes to a folder where it only reads becomes read-only, without a reload", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Grupo.canvas", BOARD);
  await app.writeOutside("Nota.md", "# Nota\n\ntexto\n");
  await app.folderChanged(["Grupo.canvas", "Nota.md"], true);
  await app.quickOpen("Grupo");
  await app.boardReady();
  await expect(page.locator(".App-toolbar")).toHaveCount(1);
  await expect(page.locator("#open .folder-lock")).toBeHidden();

  await page.evaluate(() => window.__harness.showServerFolder("reader"));

  await expect(page.locator(".App-toolbar")).toHaveCount(0);
  await expect(page.locator("#open .folder-lock")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/cannot-reveal/);
  // The app's own abilities are not the server's to take away.
  await expect(page.locator("html")).not.toHaveClass(/cannot-windows/);
  await expect(page.locator("html")).not.toHaveClass(/cannot-updates/);
  await expect(page.locator("html")).not.toHaveClass(/cannot-devtools/);
  await expect(page.locator("html")).not.toHaveClass(/cannot-local-folders/);

  await app.quickOpen("Nota");
  await expect(page.locator(".cm-content").first()).toHaveAttribute("aria-readonly", "true");

  // And back to a folder where the person writes.
  await page.evaluate(() => window.__harness.showServerFolder("owner"));
  await expect(page.locator("#open .folder-lock")).toBeHidden();
  await expect(page.locator(".cm-content").first()).not.toHaveAttribute("aria-readonly", "true");
});
