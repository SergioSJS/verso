// A Markdown file opened without its folder (ADR 0114 item 29): the
// loose-files window draws no tree and no folder commands, its one way back
// is reachable by keyboard, a read-only reason is shown, a stale folder
// command is refused, a link to a sibling opens a tab of its own, and a
// link to nothing says so. `?loose=1` (src/harness.ts) stands for the window
// the host makes for a double-clicked `.md`.

import { test, expect } from "./fixtures.mjs";

test("the loose window shows the file alone, with no tree and no folder tools", async ({ app, page }) => {
  await app.open("?loose=1");
  await expect(page.locator("html")).toHaveClass(/loose/);
  await expect(page.locator(".tab", { hasText: "Lista de compras" })).toBeVisible();
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("Lista de compras.md");
  await expect(page.locator(".loose-bar .loose-place")).toHaveText("em Downloads");
  // No tree, no ribbon, no search box, no "new note" key.
  await expect(page.locator(".side")).toBeHidden();
  await expect(page.locator("#ribbon")).toBeHidden();
  await expect(page.locator('.status-keys [data-cmd="new"]')).toBeHidden();
  // The capabilities say what the side cannot: the classes are on the page.
  for (const c of ["index", "search", "backlinks", "create", "trash", "sync", "table", "board"]) await expect(page.locator("html")).toHaveClass(new RegExp(`cannot-${c}`));
  // The right panel keeps the outline only.
  await page.locator("#toggle-right").click();
  await expect(page.locator('.right-tabs [data-tab="outline"]')).toBeVisible();
  for (const tab of ["backlinks", "tags", "bookmarks", "focuses", "calendar"]) await expect(page.locator(`.right-tabs [data-tab="${tab}"]`)).toBeHidden();
  // The one way back is a button, reachable by keyboard.
  const back = page.getByRole("button", { name: "Abrir a pasta inteira no Verso" });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  // A confirmation that names the folder; "Abrir a pasta" asks the host.
  await expect(page.getByText("Abrir a pasta “Downloads” no Verso?")).toBeVisible();
  await page.getByRole("button", { name: "Abrir a pasta", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__harnessOpenedFolder)).toEqual({ name: "Lista de compras.md", known: false });
});

test("a stale folder command is refused in words, and the file is edited and saved by its name", async ({ app, page }) => {
  await app.open("?loose=1");
  // The palette lists no "new note"; a folder command typed anyway is
  // refused by the side, not silently.
  await app.key("Mod+Shift+p");
  await page.keyboard.type("Nova nota");
  await expect(page.locator(".quick.palette:not([hidden]) .quick-list li")).toHaveCount(0);
  await page.keyboard.press("Escape");
  const refused = await page.evaluate(async () => {
    const r = await window.__harness.invoke("list_notes", {}).catch((e) => e);
    return r?.kind ?? "ok";
  });
  expect(refused).toBe("refused");
  // Edited and saved under its own name: the file in memory changes.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await app.key("Mod+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- leite");
  await expect.poll(() => app.file("Lista de compras.md"), { timeout: 15_000 }).toContain("- leite");
});

test("a link opens a sibling note as a tab of its own; a link to nothing says so", async ({ app, page }) => {
  await app.open("?loose=1");
  await page.getByRole("button", { name: "Leitura", exact: true }).click().catch(() => {});
  await page.locator('.preview a.wikilink[data-target="Vizinha"]').click();
  await expect(page.locator(".tab", { hasText: "Vizinha" })).toBeVisible();
  await expect(page.locator(".loose-bar .loose-name")).toHaveText("Vizinha.md");
  // Back to the first tab: its link to nothing.
  await page.locator(".tab", { hasText: "Lista de compras" }).click();
  await page.locator('.preview a.wikilink[data-target="Longe"]').click();
  await expect(page.locator("#status")).toHaveText("Não há nota com esse nome ao lado deste arquivo. Abra a pasta inteira para seguir links.");
  await expect(page.locator(".tab", { hasText: "Longe" })).toHaveCount(0);
});

test("a read-only reason is shown above the text and the editor is locked", async ({ app, page }) => {
  await app.open("?loose=1&ro=permissions");
  await expect(page.locator(".note-sheet .flags, .flags").first()).toContainText("Só leitura: o sistema não deixa gravar este arquivo");
  // The editor is locked: typing changes nothing on disk.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.type("zzz");
  await page.waitForTimeout(1500);
  expect(await app.file("Lista de compras.md")).not.toContain("zzz");
});

test("a file above the bound opens in Source, read only", async ({ app, page }) => {
  await app.open("?loose=1&ro=too_large");
  await expect(page.locator(".flags").first()).toContainText("passa de 8 MiB");
  await expect(page.locator(".cm-content").first()).toBeVisible();
  // Source, not Live Preview: the heading's marks stay in the text.
  await expect(page.locator(".cm-content").first()).toContainText("# Lista de compras");
});

test("a folder opened before that holds the file is offered in one line", async ({ app, page }) => {
  await app.open("?loose=1&known=1");
  await expect(page.locator(".loose-known")).toContainText("Este arquivo fica em “Notas”, uma pasta que você já abriu.");
  await page.locator(".loose-known").getByRole("button", { name: "Abrir a pasta" }).click();
  await expect.poll(() => page.evaluate(() => window.__harnessOpenedFolder)).toEqual({ name: "Lista de compras.md", known: true });
});
