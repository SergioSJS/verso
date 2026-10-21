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

// I.1b (decided 2026-10-21): the size limit is a setting, and on this
// computer's own folder a file is copied by the host under a token — no
// byte crosses to the window.
test("the largest imported file is a setting, asked of the host in megabytes", async ({ app, page }) => {
  await tree(app);
  await app.command("Importar arquivos");
  await expect.poll(async () => (await app.calls("pick_files")).length).toBe(1);
  expect((await app.calls("pick_files"))[0]).toMatchObject({ maxMb: 32 });
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  const input = page.getByLabel("Tamanho máximo de um arquivo importado (MB)");
  await expect(input).toHaveValue("32");
  await input.fill("200");
  await input.dispatchEvent("change");
  await page.keyboard.press("Escape");
  await app.command("Importar arquivos");
  await expect.poll(async () => (await app.calls("pick_files")).length).toBe(2);
  expect((await app.calls("pick_files"))[1]).toMatchObject({ maxMb: 200 });
  // Past the ceiling or below one, the setting is kept between 1 and 1024.
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  await input.fill("5000");
  await input.dispatchEvent("change");
  await expect(input).toHaveValue("1024");
});

test("a file past the limit is named with the limit, the rest still comes", async ({ app, page }) => {
  await tree(app);
  const big = "x".repeat(1024 * 1024 + 10);
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  const input = page.getByLabel("Tamanho máximo de um arquivo importado (MB)");
  await input.fill("1");
  await input.dispatchEvent("change");
  await page.keyboard.press("Escape");
  await choose(page, [{ name: "Grande.pdf", text: big }, { name: "Pequeno.txt", text: "p" }]);
  await app.command("Importar arquivos");
  await expect(row(page, "Pequeno.txt")).toBeVisible();
  await expect(status(page)).toContainText("Grande.pdf (grande demais, o limite é 1 MB)");
  expect(await app.file("Grande.pdf")).toBeNull();
});

test("on this computer's folder the file is copied by the host's token, not sent as bytes", async ({ app, page }) => {
  await tree(app);
  await page.evaluate(() => window.__harness.pickNext([{ name: "Mapa.png", text: "pelo token" }, { name: "Livro.pdf", text: "livro" }], [], true));
  await app.command("Importar arquivos");
  await expect(row(page, "Livro.pdf")).toBeVisible();
  // A name taken moves on, as a drop does.
  expect(await app.file("Mapa.png")).toBe("png original");
  expect(await app.file("Mapa (2).png")).toBe("pelo token");
  expect((await app.calls("create_picked")).length).toBe(2);
  expect((await app.calls("create_file")).length).toBe(0);
  await expect(status(page)).toContainText("Mapa.png → Mapa (2).png");
});

// I.1a: a drop on the tree is import's own way — never overwrite, never refuse.
test("a drop on the tree renames on a name clash and says so", async ({ app, page }) => {
  await tree(app);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["outro beta"], "Beta.md"));
    dt.items.add(new File(["novo"], "Novo.txt"));
    document.querySelector("#notes").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(row(page, "Beta (2).md")).toBeVisible();
  expect(await app.file("Beta.md")).toBe("beta original\n");
  expect(await app.file("Beta (2).md")).toBe("outro beta");
  expect(await app.file("Novo.txt")).toBe("novo");
  await expect(status(page)).toContainText("2 arquivos importados");
  await expect(status(page)).toContainText("Beta.md → Beta (2).md");
});

test("a drop larger than a message carries is named with the limit", async ({ app, page }) => {
  await tree(app);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(33 * 1024 * 1024)], "Enorme.bin"));
    dt.items.add(new File(["ok"], "Ok.txt"));
    document.querySelector("#notes").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(row(page, "Ok.txt")).toBeVisible();
  await expect(status(page)).toContainText("Enorme.bin (grande demais, o limite é 32 MB)");
  expect(await app.file("Enorme.bin")).toBeNull();
});
