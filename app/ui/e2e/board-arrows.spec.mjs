// Arrows on a board: an arrow between two cards is bound at the points it
// was drawn to, ends on the cards' outlines, and keeps those points as the
// cards move and the board opens again (ADR 0057 point 20); "Setas soltas"
// draws arrows that attach to no card.

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
      .map((e) => ({ start: e.startBinding?.elementId ?? null, end: e.endBinding?.elementId ?? null, x: e.x, y: e.y, last: e.points[e.points.length - 1], from: e.startBinding?.fixedPoint ?? null, to: e.endBinding?.fixedPoint ?? null })),
  );

async function arrowBetweenMiddles(app, page) {
  await arrowBetween(app, page, await app.centerOf("a"), await app.centerOf("b"));
}

async function arrowBetween(app, page, a, b) {
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
  expect(Math.abs(again.x - 300)).toBeLessThan(8);
  expect(Math.abs(again.x + again.last[0] - 700)).toBeLessThan(8);
});

test("an arrow aimed at a point of a card keeps that point: on the outline, as the card moves, and opened again", async ({ app, page }) => {
  await openBoard(app, page);
  // From near a's top right to near b's bottom left.
  await arrowBetween(app, page, await app.toPage(250, 40), await app.toPage(760, 170));
  await expect.poll(async () => (await arrows(page))[0]?.end).toBe("b");
  const [e] = await arrows(page);
  expect(e.from[0]).toBeCloseTo(0.83, 1);
  expect(e.from[1]).toBeCloseTo(0.2, 1);
  expect(e.to[0]).toBeCloseTo(0.2, 1);
  expect(e.to[1]).toBeCloseTo(0.85, 1);
  // Its ends on the outlines, where the way between the points leaves a
  // and meets b: the head shows, not under the card.
  expect(Math.round(e.x)).toBe(300);
  expect(Math.round(e.x + e.last[0])).toBe(700);
  // The file: the sides it meets, for Obsidian, and the points.
  await expect
    .poll(async () => {
      const edge = JSON.parse(await app.file("Mesa.canvas")).edges?.[0];
      return edge ? [edge.fromSide, edge.toSide, edge.verso?.fromPoint?.map((v) => Math.round(v * 10) / 10)] : null;
    })
    .toEqual(["right", "left", [0.8, 0.2]]);
  // b dragged down: the end follows the same point of b.
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  const head = await app.toPage(850, 10);
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(head.x, head.y + i * 15);
  await page.mouse.up();
  await expect.poll(async () => (await app.scene()).find((x) => x.id === "b").y).toBeGreaterThan(100);
  const [moved] = await arrows(page);
  expect(moved.to).toEqual(e.to);
  expect(moved.y + moved.last[1]).toBeGreaterThan(e.y + e.last[1] + 100);
  // Opened again, bound at the same points.
  await expect.poll(async () => JSON.parse(await app.file("Mesa.canvas")).nodes.find((n) => n.id === "b").y).toBeGreaterThan(100);
  await app.key("Mod+w");
  await app.quickOpen("Mesa");
  await app.boardReady();
  const [again] = await arrows(page);
  expect(again.from[0]).toBeCloseTo(e.from[0], 3);
  expect(again.to[1]).toBeCloseTo(e.to[1], 3);
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
  await expect(page.getByTestId("board-arrow-hint")).toHaveText(/segure (⌘|Ctrl) ao desenhar, ou Inserir › Setas soltas/);
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

  test("a free arrow is reached by touch: the hint names no ⌘, and Loose arrows is in ⋯ › Board", async ({ app, page }) => {
    // A screen with no fine pointer: no mouse, no keyboard to hold ⌘ on.
    await page.addInitScript(() => {
      const own = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("pointer: fine") ? { ...own(q), matches: false, media: q } : own(q));
    });
    await openBoard(app, page);
    await page.locator('.App-toolbar [title^="Flecha"]').first().click();
    // A phone's board keeps its canvas: Insert's items are ⋯ › Board's.
    await expect(page.getByTestId("board-arrow-hint")).toHaveText("Seta livre, presa a nenhum cartão: ⋯ › Board › Setas soltas");
    await app.boardVerb("loose", "board-tool-loose");
    await expect(page.getByTestId("board-arrow-hint")).toHaveText(/Setas soltas ligado.*⋯ › Board/);
  });
});

test("an edge chosen in the outline is selected as a click selects it: Edit arrow works on it", async ({ app, page }) => {
  await app.open();
  const edge = '{"nodes":[{"id":"a","x":0,"y":0,"width":300,"height":200,"type":"text","text":"Alfa"},{"id":"b","x":700,"y":0,"width":300,"height":200,"type":"text","text":"Beta"}],"edges":[{"id":"e","fromNode":"a","fromSide":"right","toNode":"b","toSide":"left"}]}';
  await app.writeOutside("Mesa.canvas", edge);
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  await page.getByTestId("board-tool-outline").click();
  await page.locator(".board-outline").getByText("Alfa → Beta").first().click();
  // Excalidraw's "Edit arrow" needs the arrow's editor; without it, it threw
  // (the fixture fails on any error in the console or the log).
  await page.getByTitle("Editar seta").click();
  await expect.poll(() => page.evaluate(() => window.__VERSO_TEST__.board.getAppState().selectedLinearElement?.isEditing)).toBe(true);
});

test("an arrow from a drawn shape to the middle of a picture ends there, over the picture, and follows it after the board opens again", async ({ app, page }) => {
  await app.open();
  const pic = '{\n\t"nodes":[\n\t\t{"id":"img","type":"file","file":"assets/diagrama.svg","x":600,"y":0,"width":300,"height":200}\n\t],\n\t"edges":[]\n}';
  await app.writeOutside("Figura.canvas", pic);
  await app.folderChanged(["Figura.canvas"], true);
  await app.quickOpen("Figura");
  await app.boardReady();
  const box = await page.locator(".board-canvas").boundingBox();
  await page.mouse.click(box.x + 600, box.y + box.height * 0.9);
  // A rectangle, drawn.
  await page.keyboard.press("r");
  const r0 = await app.toPage(650, 300);
  const r1 = await app.toPage(850, 400);
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  await page.mouse.move(r1.x, r1.y, { steps: 8 });
  await page.mouse.up();
  // An arrow from its middle to the picture's middle.
  await page.keyboard.press("Escape");
  await arrowBetween(app, page, await app.toPage(750, 350), await app.toPage(750, 100));
  await expect.poll(async () => (await arrows(page))[0]?.end).toBe("img");
  const [e] = await arrows(page);
  // The head at the point, inside the picture — not stopped at its edge.
  expect(Math.abs(e.x + e.last[0] - 750)).toBeLessThan(8);
  expect(Math.abs(e.y + e.last[1] - 100)).toBeLessThan(8);
  // Drawn over the picture: the card shows the part of the arrow inside it.
  await expect(page.locator(".board-card-over svg").first()).toBeAttached();
  // Saved, closed, opened again: the picture still carries the arrow.
  await expect.poll(async () => JSON.parse(await app.file("Figura.canvas")).verso?.drawing?.length ?? 0).toBe(2);
  await app.key("Mod+w");
  await app.quickOpen("Figura");
  await app.boardReady();
  const m = await app.centerOf("img");
  await page.mouse.click(box.x + 600, box.y + box.height * 0.9);
  await page.keyboard.press("v");
  await page.mouse.move(m.x, m.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(m.x - i * 15, m.y);
  await page.mouse.up();
  await expect.poll(async () => (await app.scene()).find((x) => x.id === "img").x).toBeLessThan(500);
  const [moved] = await arrows(page);
  expect(moved.end).toBe("img");
  expect(moved.x + moved.last[0]).toBeLessThan(e.x + e.last[0] - 100);
});
