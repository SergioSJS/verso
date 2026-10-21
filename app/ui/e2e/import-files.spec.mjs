// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// "Import files…" (A11Y.10, accessibility review section 8 item 10): files
// from the system without dragging. The system's picker is the host's; the
// harness answers `pick_files` with what a test says the person chose
// (`__harness.pickNext`), and the window creates the files with
// `create_file` as the drop does. A name taken moves on, never overwrites.

import { test, expect } from "./fixtures.mjs";
import { pickMenu } from "./menuPath.mjs";

const FILES = { "Zeta/Alfa.md": "a\n", "Beta.md": "beta original\n", "Mapa.png": "png original" };

async function tree(app) {
  await app.open("?vault=empty");
  for (const [p, text] of Object.entries(FILES)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(FILES), true);
  await expect(app.page.locator('#notes summary[data-folder="Zeta"]')).toBeVisible();
}
const choose = (page, files, skipped = []) => page.evaluate(([f, s]) => window.__harness.pickNext(f, s), [files, skipped]);
const row = (page, p) => page.locator(`#notes li[data-path="${p}"] > button`);
const status = (page) => page.locator("#status");

test("the palette imports two files into the root, a name taken is renamed, the first is focused", async ({ app, page }) => {
  await tree(app);
  await choose(page, [
    { name: "Mapa.png", text: "novo mapa" },
    { name: "Livro.pdf", text: "livro" },
  ]);
  await app.command("Importar arquivos");
  await expect(row(page, "Livro.pdf")).toBeVisible();
  await expect(row(page, "Mapa (2).png")).toBeVisible();
  // Never an overwrite.
  expect(await app.file("Mapa.png")).toBe("png original");
  expect(await app.file("Mapa (2).png")).toBe("novo mapa");
  expect(await app.file("Livro.pdf")).toBe("livro");
  // The first imported file has the focus, and the status line says it all.
  await expect(row(page, "Mapa (2).png")).toBeFocused();
  await expect(status(page)).toContainText("2 arquivos importados");
  await expect(status(page)).toContainText("Mapa.png → Mapa (2).png");
  // The window asked the host for a picker, and created through the contract.
  expect((await app.calls("pick_files")).length).toBe(1);
});

test("cancelling the picker changes nothing and says nothing", async ({ app, page }) => {
  await tree(app);
  const before = await app.files();
  await app.command("Importar arquivos");
  await expect.poll(async () => (await app.calls("pick_files")).length).toBe(1);
  expect(await app.files()).toEqual(before);
  await expect(status(page)).not.toContainText("importado");
});

test("a folder's menu imports into that folder: Novo, Importar arquivos…", async ({ app, page }) => {
  await tree(app);
  await choose(page, [{ name: "Alfa.md", text: "outro alfa" }, { name: "Extra.txt", text: "x" }]);
  await page.locator('#notes summary[data-folder="Zeta"]').click({ button: "right" });
  await pickMenu(page, "Novo", "Importar arquivos…");
  await expect(row(page, "Zeta/Extra.txt")).toBeVisible();
  expect(await app.file("Zeta/Alfa.md")).toBe("a\n");
  expect(await app.file("Zeta/Alfa (2).md")).toBe("outro alfa");
  expect(await app.file("Zeta/Extra.txt")).toBe("x");
  await expect(row(page, "Zeta/Alfa (2).md")).toBeFocused();
  await expect(status(page)).toContainText("2 arquivos importados");
});

test("a file's menu imports into the file's folder", async ({ app, page }) => {
  await tree(app);
  await choose(page, [{ name: "Novo.txt", text: "n" }]);
  await row(page, "Zeta/Alfa.md").click({ button: "right" });
  await pickMenu(page, "Novo", "Importar arquivos…");
  await expect(row(page, "Zeta/Novo.txt")).toBeVisible();
  await expect(status(page)).toContainText("1 arquivo importado");
});

test("the tree's empty-space menu imports into the root", async ({ app, page }) => {
  await tree(app);
  await choose(page, [{ name: "Raiz.txt", text: "r" }]);
  const box = await page.locator("#tree-root").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4, { button: "right" });
  await page.locator(".menu:not([hidden])").getByRole("menuitem", { name: "Importar arquivos…", exact: true }).click();
  await expect(row(page, "Raiz.txt")).toBeVisible();
});

test("the menu path works from the keyboard alone", async ({ app, page }) => {
  await tree(app);
  await choose(page, [{ name: "Teclado.txt", text: "k" }]);
  await page.locator('#notes summary[data-folder="Zeta"]').focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.locator(".menu:not([hidden])");
  await expect(menu).toBeVisible();
  // Arrow down to the "Novo" group, open it with →, then to the row and Enter.
  const novo = menu.getByRole("menuitem", { name: "Novo", exact: true });
  for (let i = 0; i < 30 && !(await novo.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("ArrowDown");
  await expect(novo).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const imp = page.getByRole("menuitem", { name: "Importar arquivos…", exact: true });
  for (let i = 0; i < 12 && !(await imp.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("ArrowDown");
  await expect(imp).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row(page, "Zeta/Teclado.txt")).toBeFocused();
});

test("what was left out is named, and the rest still comes", async ({ app, page }) => {
  await tree(app);
  await choose(page, [{ name: "Boa.txt", text: "b" }], [{ name: "Pasta", reason: "not_a_file" }, { name: "Nuvem.png", reason: "placeholder" }]);
  await app.command("Importar arquivos");
  await expect(row(page, "Boa.txt")).toBeVisible();
  await expect(status(page)).toContainText("1 arquivo importado");
  await expect(status(page)).toContainText("Pasta (não é um arquivo)");
  await expect(status(page)).toContainText("Nuvem.png (está só na nuvem)");
});

test("a reader on a server imports nothing and is told why", async ({ app, page }) => {
  await app.open("?vault=empty&side=server&role=reader");
  await choose(page, [{ name: "X.txt", text: "x" }]);
  await app.command("Importar arquivos");
  await expect(status(page)).toContainText("só lê");
  expect(await app.files()).not.toContain("X.txt");
});
