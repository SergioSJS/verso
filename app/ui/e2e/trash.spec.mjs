// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The folder's trash (ADR 0080; walkthrough, section 10): what was
// deleted seen in the settings' Trash, reached from the command palette,
// the file tree's menu and the folder's settings; restored where it was,
// or beside it when the name is taken, saying where it went; shortening
// the retention expires what is past it; delete now and empty ask first,
// in the page, with the size.

import { expect, test } from "./fixtures.mjs";

const delete_ = (page, path) => page.evaluate((p) => window.__harness.core.invoke("delete_note", { path: p }), path);

async function folder(app) {
  await app.open("?vault=empty");
  const files = { "Ideias.md": "# Ideias\n", "Pasta/Outra.md": "# Outra\n", "Rascunho.md": "# Rascunho\n" };
  for (const [p, t] of Object.entries(files)) await app.writeOutside(p, t);
  await app.folderChanged(Object.keys(files), true);
}

test("a deleted note is listed and restored beside a name taken since @layout", async ({ app, page }) => {
  await folder(app);
  await delete_(page, "Ideias.md");
  await app.writeOutside("Ideias.md", "# Ideias novas\n");
  await app.command("Abrir a lixeira");
  const body = page.locator(".settings-body");
  await expect(body.locator(".settings-title")).toHaveText("Lixeira");
  await expect(body.locator(".trash-sentence")).toHaveText("1 item na lixeira, 9 B.");
  await expect(body.getByText("Os arquivos apagados ficam 30 dias e depois somem de vez. A lixeira não conta no espaço da pasta.")).toBeVisible();
  // A list with a header row; each row's actions named for a reader.
  await expect(body.locator("table.trash-table thead th")).toHaveText(["Nome", "Onde estava", "Tamanho", "Apagado", "Expira", "Ações"]);
  const row = body.locator("tr[data-path='.trash/Ideias.md']");
  await expect(row.locator("td").nth(1)).toHaveText("na raiz");
  await row.getByRole("button", { name: "Restaurar Ideias.md" }).click();
  const said = body.locator(".trash-said");
  await expect(said).toContainText("Ideias.md já existia: restaurado ao lado, como Ideias (restaurado ");
  const files = await app.files();
  const back = files.find((f) => f.startsWith("Ideias (restaurado "));
  expect(back).toMatch(/^Ideias \(restaurado \d{4}-\d{2}-\d{2}\)\.md$/);
  expect(await app.file(back)).toBe("# Ideias\n");
  expect(await app.file("Ideias.md")).toBe("# Ideias novas\n");
  await expect(body.locator(".trash-sentence")).toHaveText("A lixeira está vazia.");
});

test("shortening the retention expires what is past it; delete now and empty ask first", async ({ app, page }) => {
  await folder(app);
  await delete_(page, "Pasta/Outra.md");
  // Ten days later, another deletion.
  await page.evaluate(() => (window.__harness.core.bin.now += 10 * 86400));
  await delete_(page, "Rascunho.md");
  await delete_(page, "Ideias.md");
  // From the file tree's menu.
  await page.evaluate(() => document.getElementById("tree-root").dispatchEvent(new MouseEvent("contextmenu", { clientX: 40, clientY: 200, bubbles: true, cancelable: true })));
  await page.getByRole("menuitem", { name: "Abrir a lixeira" }).click();
  const body = page.locator(".settings-body");
  await expect(body.locator("tbody tr")).toHaveCount(3);
  await expect(body.locator("tr[data-path='.trash/Pasta/Outra.md'] td").nth(1)).toHaveText("Pasta");
  // The search narrows the list.
  await body.getByRole("searchbox", { name: "Buscar na lixeira" }).fill("rasc");
  await expect(body.locator("tbody tr")).toHaveCount(1);
  await body.getByRole("searchbox", { name: "Buscar na lixeira" }).fill("");
  // Seven days: the entry deleted ten days ago goes at once.
  await body.getByRole("combobox", { name: "Manter arquivos apagados por" }).selectOption("7");
  await expect(body.locator("tbody tr")).toHaveCount(2);
  expect(await app.files()).not.toContain(".trash/Pasta/Outra.md");
  // Delete now: asked in the page, with the size; cancel keeps it.
  await body.getByRole("button", { name: "Apagar Rascunho.md agora" }).click();
  await expect(body.locator(".trash-ask")).toContainText("Apagar Rascunho.md de vez (11 B)? Não dá para desfazer.");
  await body.locator(".trash-ask").getByRole("button", { name: "Cancelar" }).click();
  await expect(body.locator("tbody tr")).toHaveCount(2);
  await body.getByRole("button", { name: "Apagar Rascunho.md agora" }).click();
  await body.locator(".trash-ask").getByRole("button", { name: "Apagar de vez" }).click();
  await expect(body.locator("tbody tr")).toHaveCount(1);
  await expect(body.locator(".trash-said")).toHaveText("1 item apagado de vez.");
  // Empty: the count and the size, asked first.
  await body.getByRole("button", { name: "Esvaziar a lixeira" }).click();
  await expect(body.locator(".trash-ask")).toContainText("Apagar de vez 1 item (9 B)?");
  await body.locator(".trash-ask").getByRole("button", { name: "Apagar de vez" }).click();
  await expect(body.locator(".trash-sentence")).toHaveText("A lixeira está vazia.");
  expect((await app.files()).filter((f) => f.startsWith(".trash/"))).toEqual([]);
});

test("the folder's settings show the trash beside its space", async ({ app, page }) => {
  await folder(app);
  await delete_(page, "Rascunho.md");
  await app.command("Ajustes");
  await page.locator(".settings-nav-item", { hasText: "Arquivos e links" }).click();
  const summary = page.locator(".trash-summary");
  await expect(summary).toContainText("1 item na lixeira, 11 B. Os arquivos apagados ficam 30 dias");
  await summary.getByRole("button", { name: "Abrir a lixeira" }).click();
  await expect(page.locator(".settings-body .settings-title")).toHaveText("Lixeira");
});
