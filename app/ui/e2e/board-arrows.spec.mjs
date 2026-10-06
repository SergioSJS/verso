// Arrows on a board: one drawn to the middle of a card ends on its side at
// once (as it will on the next opening), and "Setas soltas" draws arrows that
// attach to no card.

import { test, expect } from "./fixtures.mjs";

const TWO = '{\n\t"nodes":[\n\t\t{"id":"a","x":0,"y":0,"width":300,"height":200,"type":"text","text":"Alfa"},\n\t\t{"id":"b","x":700,"y":0,"width":300,"height":200,"type":"text","text":"Beta"}\n\t],\n\t"edges":[]\n}';

async function openBoard(app, page) {
  await app.open();
  await app.writeOutside("Mesa.canvas", TWO);
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const box = await page.locator(".board-canvas").boundingBox();
  // Focus in the board, so the tool's key is heard.
  await page.mouse.click(box.x + 600, box.y + box.height * 0.9);
}

const arrows = (page) =>
  page.evaluate(() =>
    window.__VERSO_TEST__.board
      .getSceneElements()
      .filter((e) => e.type === "arrow")
      .map((e) => ({ start: e.startBinding?.elementId ?? null, end: e.endBinding?.elementId ?? null, x: e.x, y: e.y, last: e.points[e.points.length - 1] })),
  );

async function arrowBetweenMiddles(app, page) {
  const a = await app.centerOf("a");
  const b = await app.centerOf("b");
  await page.keyboard.press("a");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 20 });
  await page.mouse.up();
}

test("an arrow drawn to the middle of a card ends on its side, and goes under the cards", async ({ app, page }) => {
  await openBoard(app, page);
  await arrowBetweenMiddles(app, page);
  await expect.poll(async () => (await arrows(page))[0]?.end).toBe("b");
  // The scene: the arrow leaves a's right side (x 300) and meets b's left (x 700).
  await expect
    .poll(async () => {
      const [e] = await arrows(page);
      return e ? [Math.round(e.x), Math.round(e.x + e.last[0])] : null;
    })
    .toEqual([300, 700]);
  const order = (await app.scene()).map((e) => e.type);
  expect(order.indexOf("arrow")).toBeLessThan(order.indexOf("embeddable"));
  // Opened again, the edge is where it was.
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).edges?.length ?? 0).toBe(1);
  await app.key("Mod+w");
  await app.quickOpen("Mesa");
  await app.boardReady();
  const [again] = await arrows(page);
  expect([Math.round(again.x), Math.round(again.x + again.last[0])]).toEqual([300, 700]);
});

test("an arrow snapped to a card's side stays on that side while the card is dragged", async ({ app, page }) => {
  await openBoard(app, page);
  await arrowBetweenMiddles(app, page);
  await expect.poll(async () => (await arrows(page))[0]?.end).toBe("b");
  await expect.poll(async () => Math.round((await arrows(page))[0].x + (await arrows(page))[0].last[0])).toBe(700);
  // Drag b down by 100, on its head, with the selection tool.
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  const b = await app.toPage(850, 10);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(b.x, b.y + i * 10);
    // During the drag the end is on b's left side, never back in its middle.
    const [e] = await arrows(page);
    expect(Math.round(e.x + e.last[0])).toBeLessThanOrEqual(700);
  }
  await page.mouse.up();
  expect((await app.scene()).find((e) => e.id === "b").y).toBeGreaterThan(50);
});

test("with Setas soltas on, an arrow between two cards attaches to neither", async ({ app, page }) => {
  await openBoard(app, page);
  await page.getByTestId("board-tool-insert").click();
  await page.getByTestId("board-tool-loose").click();
  await page.mouse.click((await page.locator(".board-canvas").boundingBox()).x + 600, (await page.locator(".board-canvas").boundingBox()).y + 700);
  await arrowBetweenMiddles(app, page);
  await expect.poll(async () => (await arrows(page)).length).toBe(1);
  await expect.poll(async () => (await arrows(page))[0]).toMatchObject({ start: null, end: null });
  // Not an edge: the file has none, and the arrow is in the drawing.
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).verso?.drawing?.length ?? 0).toBe(1);
  expect(JSON.parse(await app.file("Mesa.canvas")).edges ?? []).toEqual([]);
});

test("the arrow tool says how to draw a free arrow, and that Setas soltas is on", async ({ app, page }) => {
  await openBoard(app, page);
  await expect(page.getByTestId("board-arrow-hint")).toHaveCount(0);
  await page.keyboard.press("a");
  await expect(page.getByTestId("board-arrow-hint")).toHaveText(/segure ⌘ ao desenhar, ou Inserir › Setas soltas/);
  await page.getByTestId("board-tool-insert").click();
  await page.getByTestId("board-tool-loose").click();
  await page.keyboard.press("a");
  await expect(page.getByTestId("board-arrow-hint")).toHaveText(/Setas soltas ligado/);
  // Another tool: the hint goes.
  await page.keyboard.press("r");
  await expect(page.getByTestId("board-arrow-hint")).toHaveCount(0);
});

test.describe("on a touch screen, narrow", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a free arrow is reached by touch: the hint names no ⌘, and Insert is in the toolbar", async ({ app, page }) => {
    // A screen with no fine pointer: no mouse, no keyboard to hold ⌘ on.
    await page.addInitScript(() => {
      const own = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("pointer: fine") ? { ...own(q), matches: false, media: q } : own(q));
    });
    await openBoard(app, page);
    await page.locator('.App-toolbar [title^="Flecha"]').first().click();
    await expect(page.getByTestId("board-arrow-hint")).toHaveText("Seta livre, presa a nenhum cartão: Inserir › Setas soltas");
    await page.getByTestId("board-tool-insert").click();
    await expect(page.getByTestId("board-tool-loose")).toBeVisible();
  });
});
