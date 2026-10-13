// Walkthrough, section 8: the board's file — what opening, closing and the
// disk do to it. The cases of the reading of 2026-10-01 (review `board.md`,
// reading 2, findings 1, 2 and 5; reading 4, finding 5; §6 items 3, 4, 6).

import { test, expect } from "./fixtures.mjs";

/** Two text cards, as Obsidian writes a canvas. */
const TWO = '{\n\t"nodes":[\n\t\t{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"},\n\t\t{"id":"b","x":400,"y":0,"width":250,"height":60,"type":"text","text":"Beta"}\n\t],\n\t"edges":[]\n}';

async function openBoard(app, path, text) {
  await app.open();
  await app.writeOutside(path, text);
  await app.folderChanged([path], true);
  await expect(app.page.locator("#notes")).toContainText(path);
  await app.quickOpen(path.replace(/\.canvas$/, ""));
  await app.boardReady();
}

/** Drag a card by its middle, as a user does. */
async function drag(app, id, dx, dy) {
  const at = await app.centerOf(id);
  await app.page.mouse.move(at.x, at.y);
  await app.page.mouse.down();
  await app.page.mouse.move(at.x + dx, at.y + dy, { steps: 8 });
  await app.page.mouse.up();
}

const nodeOf = (text, id) => JSON.parse(text).nodes.find((n) => n.id === id);

for (const board of ["Tour do Verso", "Treino do Board"]) {
  test(`${board}: pressing on it, panning and zooming right after it opens writes nothing`, async ({ app, page }) => {
    await app.open();
    await app.quickOpen(board);
    await page.waitForFunction(() => window.__VERSO_TEST__?.board);
    const box = await page.locator(".board-canvas").boundingBox();
    // At once, before the fonts are in and the board measures its text.
    await page.mouse.click(box.x + 30, box.y + box.height - 30);
    await page.keyboard.down("Space");
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 360, box.y + 340, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await app.key("Mod+Equal");
    await page.waitForTimeout(6500);
    expect(await app.calls("write_board")).toEqual([]);
  });
}

test("a card moved and the tab closed at once is saved, not lost", async ({ app }) => {
  await openBoard(app, "Mesa.canvas", TWO);
  await drag(app, "b", 80, 40);
  await app.key("Mod+w");
  await expect.poll(async () => nodeOf(await app.file("Mesa.canvas"), "b").x).not.toBe(400);
});

test("a board follows its file changed on disk when nothing is unsaved", async ({ app }) => {
  await openBoard(app, "Mesa.canvas", TWO);
  await app.writeOutside("Mesa.canvas", TWO.replace('"x":400', '"x":2000'));
  await app.folderChanged(["Mesa.canvas"]);
  await expect.poll(async () => (await app.scene()).find((e) => e.id === "b")?.x).toBe(2000);
  expect(await app.calls("write_board")).toEqual([]);
});

test("a board changed here and on disk shows both, and writes nothing over the disk", async ({ app, page }) => {
  await openBoard(app, "Mesa.canvas", TWO);
  await drag(app, "b", 80, 40);
  // Before the board's save: Obsidian moved the other card meanwhile.
  const outside = TWO.replace('"x":0,"y":0', '"x":-300,"y":0');
  await app.writeOutside("Mesa.canvas", outside);
  await expect(page.locator(".conflict:visible")).toBeVisible();
  expect(await app.file("Mesa.canvas")).toBe(outside);
});

test("a board changed here and on disk keeps both on a third choice: the disk's under the name, this board in a copy", async ({ app, page }) => {
  await openBoard(app, "Mesa.canvas", TWO);
  await drag(app, "b", 80, 40);
  const outside = TWO.replace('"x":0,"y":0', '"x":-300,"y":0');
  await app.writeOutside("Mesa.canvas", outside);
  const conflict = page.locator(".conflict:visible");
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("button")).toHaveText(["Descartar o meu e recarregar", "Gravar o meu por cima", "Guardar os dois"]);
  await conflict.getByRole("button", { name: "Guardar os dois" }).click();
  // Named as sync names a copy: this computer's name and the minute.
  const named = /^Mesa \(conflito, Mac de Teste, \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\)\.canvas$/;
  await expect.poll(async () => (await app.files()).filter((f) => named.test(f)).length).toBe(1);
  const copy = (await app.files()).find((f) => named.test(f));
  // The disk's board kept its name; this one is in the copy, a new file.
  expect(await app.file("Mesa.canvas")).toBe(outside);
  const mine = await app.file(copy);
  expect(nodeOf(mine, "b").x).not.toBe(400);
  expect(nodeOf(mine, "a").x).toBe(0);
  await expect(page.locator(".conflict:visible")).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Os dois ficaram");
});

test("a canvas in another layout asks before its first save rewrites it", async ({ app, page }) => {
  const compact = '{"nodes":[{"id":"a","x":0,"y":0,"width":250,"height":60,"type":"text","text":"Alfa"},{"id":"b","x":400,"y":0,"width":250,"height":60,"type":"text","text":"Beta"}],"edges":[]}';
  await openBoard(app, "Outra.canvas", compact);
  await drag(app, "b", 80, 40);
  const plan = page.getByRole("dialog", { name: "Reescrever no layout do Obsidian?" });
  await expect(plan).toBeVisible();
  // Left as it is: nothing written.
  await plan.getByRole("button", { name: "Deixar como está" }).click();
  await page.waitForTimeout(300);
  expect(await app.file("Outra.canvas")).toBe(compact);
  // Asked again on the next save, and accepted: written in Obsidian's layout.
  await drag(app, "a", 40, 40);
  await expect(plan).toBeVisible();
  await plan.getByRole("button", { name: "Reescrever e salvar" }).click();
  await expect.poll(() => app.file("Outra.canvas")).toMatch(/^\{\n\t"nodes":\[\n/);
});

test("a canvas saved by a later Verso opens to look at only, and nothing is written", async ({ app, page }) => {
  const later = TWO.replace('\n\t"edges":[]\n}', '\n\t"edges":[],\n\t"verso":{"version":2,"drawing":[]}\n}');
  await openBoard(app, "Futuro.canvas", later);
  await expect(page.locator("#status")).toContainText("Verso mais novo");
  await drag(app, "b", 80, 40);
  await page.waitForTimeout(1500);
  expect(await app.calls("write_board")).toEqual([]);
  expect(await app.file("Futuro.canvas")).toBe(later);
});

test("a move undone before its save leaves nothing to write, and the tab closes clean", async ({ app }) => {
  await openBoard(app, "Mesa.canvas", TWO);
  await drag(app, "b", 80, 40);
  await app.key("Mod+z");
  await app.page.waitForTimeout(1200);
  await app.key("Mod+w");
  await expect(app.page.locator(".tab", { hasText: "Mesa" })).toHaveCount(0);
  // Neither the board nor its text written again (review `board.md`,
  // second reading, finding 3).
  expect(await app.calls("write_board")).toEqual([]);
  expect(await app.calls("write_text")).toEqual([]);
  expect(await app.file("Mesa.canvas")).toBe(TWO);
});
