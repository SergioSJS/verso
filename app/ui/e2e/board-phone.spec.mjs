// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A board on a phone (2026-11-15, the maintainer's option C; ADR 0076 items
// 1 and 10): the canvas keeps only the drawing tools — one bar at the foot held
// upright, in the app's bottom bar's place; one column at the right edge
// held sideways, all eight tools in it — and everything else is a tap away:
// undo and redo in the top bar, Board | Text and the board's verbs in the
// ⋯ sheet's "Board" section. A reader's board, with no tools, keeps the
// app's bottom bar. Run at the two sizes here, in WebKit and Chromium.

import { test, expect } from "./fixtures.mjs";

// In Obsidian's own layout, so a save writes it as it is (no "rewrite in Obsidian's layout?").
const TWO = '{\n\t"nodes":[\n\t\t{"id":"a","type":"text","text":"Alfa","x":0,"y":0,"width":300,"height":120},\n\t\t{"id":"b","type":"text","text":"Beta","x":400,"y":0,"width":300,"height":120}\n\t],\n\t"edges":[]\n}';

async function openBoard(app, query = "") {
  await app.open(query);
  await app.writeOutside("Mesa.canvas", TWO);
  await app.folderChanged(["Mesa.canvas"], true);
  await expect(app.page.locator("#notes")).toContainText("Mesa.canvas");
  await app.quickOpen("Mesa");
  await app.boardReady();
}

const sheet = (page) => page.locator(".pane.focused .phone-title").click();
// The desktop toolbar's order (one order on every size, ADR 0076 item 6).
const TOOLS = ["toolbar-hand", "toolbar-selection", "toolbar-rectangle", "toolbar-arrow", "toolbar-freedraw", "toolbar-text", "toolbar-eraser"];

test.describe("held upright", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the tools are one bar at the foot, in the app's bar's place; undo and redo are the top bar's", async ({ app, page }) => {
    await openBoard(app);
    expect(await app.isPhone()).toBe(true);
    // The app's bottom bar gives way; the board reaches the screen's foot.
    await expect(page.locator(".bottom-bar")).toBeHidden();
    const canvas = await page.locator(".board-canvas").boundingBox();
    expect(Math.round(canvas.y + canvas.height)).toBe(844);
    const bar = await page.locator(".board-canvas .App-bottom-bar").boundingBox();
    expect(Math.round(bar.y + bar.height)).toBe(844);
    expect(bar.height).toBeLessThan(60);
    // Every tool in it, the text tool too, each a finger's target, in the desktop's order, "more" last.
    let lastX = -1;
    for (const id of TOOLS) {
      const x = (await page.getByTestId(id).boundingBox()).x;
      expect(x, `${id} after the one before`).toBeGreaterThan(lastX);
      lastX = x;
    }
    expect((await page.locator(".board-canvas .App-toolbar__extra-tools-trigger").boundingBox()).x).toBeGreaterThan(lastX);
    for (const id of TOOLS) {
      const b = await page.getByTestId(id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b.width, id).toBeGreaterThanOrEqual(44);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.y, id).toBeGreaterThanOrEqual(bar.y);
    }
    // No row above the canvas: neither Board | Text nor Excalidraw's menu nor Verso's island.
    await expect(page.locator(".leaf.board-face .leaf-head")).toBeHidden();
    await expect(page.locator(".board-canvas .main-menu-trigger")).toBeHidden();
    await expect(page.getByTestId("board-tool-outline")).toBeHidden();
    // Undo and redo: the top bar's, off until there is something to undo.
    const undo = page.locator(".pane.focused .phone-undo");
    const redo = page.locator(".pane.focused .phone-redo");
    await expect(undo).toBeVisible();
    await expect(undo).toHaveAccessibleName("Desfazer");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    const before = (await app.scene()).length;
    await page.getByTestId("toolbar-rectangle").click();
    await page.mouse.move(canvas.x + 80, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 220, canvas.y + 420, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await app.scene()).length).toBe(before + 1);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(async () => (await app.scene()).length).toBe(before);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(async () => (await app.scene()).length).toBe(before + 1);
  });

  test("⋯ › Board: Board | Text and the board's verbs, each doing what the board's own button does", async ({ app, page }) => {
    await openBoard(app);
    await sheet(page);
    const section = page.locator(".phone-sheet-board");
    await expect(section.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(section.locator("[data-verb]")).toHaveText(["Exportar, fundo e ajuda", "Cartão de texto", "Imagem ou PDF…", "Nota ou arquivo…", "Link…", "Página web…", "Setas soltas", "Buscar no board", "Sumário"].map((t) => new RegExp(t)));
    // The switch of the bottom bar says the board's tools take its place.
    await expect(page.locator(".phone-sheet-switch-note")).toHaveText("Num board, as ferramentas de desenho ficam no lugar dela.");
    // The outline: over the board, closed by its own button.
    await section.locator('[data-verb="outline"]').click();
    await expect(page.locator(".phone-sheet")).toHaveCount(0);
    const outline = page.locator(".board-outline");
    await expect(outline).toBeVisible();
    await expect(outline).toContainText("Alfa");
    await outline.getByRole("button", { name: "Fechar o sumário" }).click();
    await expect(outline).toHaveCount(0);
    // The search: its field shows at once, focused, and counts.
    await sheet(page);
    await page.locator('.phone-sheet-board [data-verb="search"]').click();
    const field = page.locator(".board-ex-tools input[type=search]");
    await expect(field).toBeFocused();
    await expect(field).toBeVisible();
    await field.fill("Beta");
    await expect(page.locator(".board-ex-search-count")).toHaveText("1 de 1");
    await field.fill("");
    await field.blur();
    // Text, and back to Board from the text's own row.
    await sheet(page);
    await page.locator('.phone-sheet-board [data-face="source"]').click();
    await expect(page.locator(".board-host")).toBeHidden();
    const modes = page.locator(".leaf:not([hidden]) .leaf-head .modes:has([data-face])");
    await expect(modes).toBeVisible();
    await modes.locator('[data-face="board"]').click();
    await expect(page.locator(".board-host")).toBeVisible();
    await expect(page.locator(".bottom-bar")).toBeHidden();
    // Excalidraw's menu, on the board.
    await sheet(page);
    await page.locator('.phone-sheet-board [data-verb="menu"]').click();
    const menu = page.locator(".board-canvas .main-menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const canvas = await page.locator(".board-canvas").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  });

  test("what acts on a selection shows only while there is one", async ({ app, page }) => {
    await openBoard(app);
    const island = page.locator(".board-canvas .mobile-shape-actions");
    await expect(island).toBeHidden();
    const canvas = await page.locator(".board-canvas").boundingBox();
    await page.getByTestId("toolbar-rectangle").click();
    await page.mouse.move(canvas.x + 80, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 220, canvas.y + 420, { steps: 8 });
    await page.mouse.up();
    await expect(island).toBeVisible();
    const bar = await page.locator(".board-canvas .App-bottom-bar").boundingBox();
    const b = await island.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(bar.y);
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__VERSO_TEST__.board.updateScene({ appState: { selectedElementIds: {} } }));
    await expect(island).toBeHidden();
  });

  test("a reader's board keeps the app's bottom bar; ⋯ › Board has only what reads", async ({ app, page }) => {
    await openBoard(app, "?vault=empty&side=server&role=reader");
    await expect(page.locator(".App-toolbar")).toHaveCount(0);
    await expect(page.locator(".bottom-bar")).toBeVisible();
    await expect(page.locator(".pane.focused .phone-undo")).toBeHidden();
    await expect(page.locator(".board-canvas .disable-view-mode")).toBeHidden();
    await sheet(page);
    await expect(page.locator(".phone-sheet-board [data-verb]")).toHaveText([/Exportar, fundo e ajuda/, /Buscar no board/, /Sumário/]);
    await expect(page.locator(".phone-sheet-switch-note")).toHaveCount(0);
  });
});

test.describe("held sideways", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("the tools are one column at the right edge, all eight in it; the canvas keeps the height", async ({ app, page, browserName }) => {
    test.skip(browserName !== "chromium", "a phone held sideways is a coarse pointer under 500 px: Playwright's touch screen is Chromium's");
    await openBoard(app);
    expect(await app.isPhone()).toBe(true);
    await expect(page.locator(".bottom-bar")).toBeHidden();
    const canvas = await page.locator(".board-canvas").boundingBox();
    expect(Math.round(canvas.y + canvas.height)).toBe(390);
    const boxes = [];
    for (const id of [...TOOLS]) boxes.push(await page.getByTestId(id).boundingBox());
    boxes.push(await page.locator(".board-canvas .App-toolbar__extra-tools-trigger").boundingBox());
    for (const b of boxes) {
      expect(b).not.toBeNull();
      // One column, at the right edge, inside the board.
      expect(Math.round(b.x + b.width)).toBe(Math.round(canvas.x + canvas.width));
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(40);
      expect(b.y).toBeGreaterThanOrEqual(canvas.y - 1);
      expect(b.y + b.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    // The see-through box that keeps Excalidraw's count lets the canvas have the pointer.
    const left = { x: canvas.x + canvas.width - 200, y: canvas.y + canvas.height / 2 };
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, left);
    expect(under).toBe("CANVAS");
    // Undo and redo stay in the top bar; ⋯ › Board is there.
    await expect(page.locator(".pane.focused .phone-undo")).toBeVisible();
    await sheet(page);
    await expect(page.locator('.phone-sheet-board [data-verb="text"]')).toBeVisible();
  });
});

// The side panels' handles (2026-11-15, the maintainer: on a board the
// sideways swipe never starts — the canvas keeps the finger — and the
// bottom bar's Files and Panel are the board's tools now; app/ui/src/screen/edgeHandles.ts).
test.describe("the side panels' handles, upright", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a board shows a tab on each edge: the left opens the files, the right the panel; hidden while one is open", async ({ app, page }) => {
    await openBoard(app);
    const left = page.locator(".edge-left");
    const right = page.locator(".edge-right");
    await expect(left).toBeVisible();
    await expect(left).toHaveAccessibleName("Abrir os arquivos");
    await expect(right).toHaveAccessibleName("Abrir o painel da direita");
    for (const b of [await left.boundingBox(), await right.boundingBox()]) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.y + b.height / 2).toBeCloseTo(844 / 2, -1);
    }
    expect(Math.round((await left.boundingBox()).x)).toBe(0);
    expect(Math.round((await right.boundingBox()).x + 44)).toBe(390);
    await left.click();
    await expect(page.locator("body")).toHaveClass(/side-open/);
    await expect(left).toBeHidden();
    await expect(right).toBeHidden();
    // A tap beside the drawer closes it; the tabs are back.
    await page.mouse.click(370, 700);
    await expect(page.locator("body")).not.toHaveClass(/side-open/);
    await expect(right).toBeVisible();
    await right.click();
    await expect(page.locator("body")).toHaveClass(/right-open/);
    await expect(right).toBeHidden();
  });

  test("a drawing has them too; a note does not, nor the board's outline over its edge", async ({ app, page }) => {
    await app.open();
    await app.quickOpen("Desenho do Excalidraw");
    await expect(page.locator(".drawing-host .excalidraw")).toBeVisible();
    await expect(page.locator(".edge-left")).toBeVisible();
    await expect(page.locator(".edge-right")).toBeVisible();
    await app.quickOpen("04 - Escrevendo no Editor");
    await expect(page.locator(".edge-left")).toBeHidden();
    await expect(page.locator(".edge-right")).toBeHidden();
    await app.quickOpen("Board de Demonstração");
    await app.boardReady();
    await expect(page.locator(".edge-right")).toBeVisible();
    await app.boardVerb("outline", "board-tool-outline");
    await expect(page.locator(".board-outline")).toBeVisible();
    await expect(page.locator(".edge-right")).toBeHidden();
  });

  test("a swipe that starts on a handle, past Android's Back band, drags its panel out", async ({ app, page, browserName }) => {
    test.skip(browserName !== "chromium", "touch moves need Chromium's DevTools protocol");
    await openBoard(app);
    const b = await page.locator(".edge-right").boundingBox();
    // Inside the handle's target, left of the 24 px band at the screen's edge.
    const x = b.x + 8;
    const y = b.y + b.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const at = (px) => [{ x: px, y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x - 18 * i) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect(page.locator("body")).toHaveClass(/right-open/);
  });
});

test.describe("the side panels' handles, sideways", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("the panel's tab stands at the left of the board's column, clear of its tools", async ({ app, page, browserName }) => {
    test.skip(browserName !== "chromium", "a phone held sideways is a coarse pointer under 500 px: Playwright's touch screen is Chromium's");
    await openBoard(app);
    const right = await page.locator(".edge-right").boundingBox();
    const tool = await page.getByTestId("toolbar-eraser").boundingBox();
    expect(right.x + right.width).toBeLessThanOrEqual(tool.x + 1);
    await expect(page.locator(".edge-left")).toBeVisible();
    await page.locator(".edge-right").click();
    await expect(page.locator("body")).toHaveClass(/right-open/);
  });
});
