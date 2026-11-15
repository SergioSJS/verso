// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A Markdown text card on the board (ADR 0057, 2026-10-23): a button of the
// toolbar and a double click (a double tap) on an empty spot add one, its
// text asked for at once; the setting "Double click on the board creates"
// can give the spot back to Excalidraw's drawn text; a reader gets nothing.

import { test, expect } from "./fixtures.mjs";

const ONE = '{\n\t"nodes":[\n\t\t{"id":"a","type":"text","text":"Alfa","x":0,"y":0,"width":300,"height":120}\n\t],\n\t"edges":[]\n}';

async function openBoard(app, page, query = "") {
  await app.open(query);
  await app.writeOutside("Mesa.canvas", ONE);
  await app.folderChanged(["Mesa.canvas"], true);
  await expect(page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
}

const emptySpot = async (page) => {
  const box = await page.locator(".board-canvas").boundingBox();
  return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.7 };
};

async function fillPrompt(page, text) {
  const field = page.locator(".prompt-field");
  await expect(field).toBeVisible();
  await field.fill(text);
  await page.locator(".prompt-box button.save").click();
}

test("the toolbar's text card button adds a Markdown card whose dice code is a die @layout", async ({ app, page }) => {
  await openBoard(app, page);
  if (await app.isPhone()) {
    // A phone's board keeps its canvas: the button is ⋯ › Board's.
    await expect(page.getByTestId("board-tool-textcard")).toBeHidden();
    await app.boardVerb("text", "board-tool-textcard");
  } else {
    const button = page.getByRole("button", { name: "Cartão de texto" }).first();
    await expect(button).toBeVisible();
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await fillPrompt(page, "Ataque: `dice: 1d20`");
  await expect(page.locator(".board-card-slot")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rolar 1d20" })).toBeVisible();
});

test("cancelling the text card's text leaves no card @layout", async ({ app, page }) => {
  await openBoard(app, page);
  await app.boardVerb("text", "board-tool-textcard");
  await expect(page.locator(".prompt-field")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".prompt-field")).toHaveCount(0);
  await expect(page.locator(".board-card-slot")).toHaveCount(1);
});

test("a double click on an empty spot adds a text card there", async ({ app, page }) => {
  await openBoard(app, page);
  const at = await emptySpot(page);
  await page.mouse.dblclick(at.x, at.y);
  await fillPrompt(page, "Nova `dice: 1d20`");
  await expect(page.locator(".board-card-slot")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rolar 1d20" })).toBeVisible();
  // No drawn text was started.
  await expect(page.locator(".excalidraw-textEditorContainer textarea")).toHaveCount(0);
});

test("a double click on a card keeps editing that card, not a new one", async ({ app, page }) => {
  await openBoard(app, page);
  const at = await app.centerOf("a");
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator(".prompt-field")).toHaveValue("Alfa");
  await page.keyboard.press("Escape");
  await expect(page.locator(".board-card-slot")).toHaveCount(1);
});

test("with the setting on drawn text, a double click on an empty spot adds no card", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ boardDoubleClick: "drawn" })));
  await openBoard(app, page);
  const at = await emptySpot(page);
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator(".prompt-field")).toHaveCount(0);
  await expect(page.locator(".board-card-slot")).toHaveCount(1);
  await expect(page.locator(".excalidraw-textEditorContainer textarea")).toHaveCount(1);
});

test("a reader's double click on an empty spot adds nothing", async ({ app, page }) => {
  await openBoard(app, page, "?vault=empty&side=server&role=reader");
  const at = await emptySpot(page);
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator(".prompt-field")).toHaveCount(0);
  await expect(page.locator(".board-card-slot")).toHaveCount(1);
  expect(await app.calls("write_text")).toHaveLength(0);
});

// Playwright moves a finger only in Chromium; skipped before the app starts.
test.describe("on a touch screen", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !isMobile, "Playwright moves a finger only in Chromium");
  test("a double tap on an empty spot adds a text card @layout", async ({ app, page }) => {
    await openBoard(app, page);
    const at = await emptySpot(page);
    await page.touchscreen.tap(at.x, at.y);
    await page.touchscreen.tap(at.x, at.y);
    await fillPrompt(page, "Toque duplo");
    await expect(page.locator(".board-card-slot")).toHaveCount(2);
  });
});
