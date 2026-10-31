// Walkthrough, sections 8 and 9: the practice board, lesson by lesson, and
// the board's file — what the bugs of 2026-09-30 and 2026-10-01 broke.

import { test, expect } from "./fixtures.mjs";

const MAC = process.platform === "darwin";
const FRONT = MAC ? "Meta+Alt+BracketRight" : "Control+Shift+BracketRight";
const BACK = MAC ? "Meta+Alt+BracketLeft" : "Control+Shift+BracketLeft";
const BOARD = "Treino do Board.canvas";

async function openPractice(app, lesson) {
  await app.open();
  await app.quickOpen("Treino do Board");
  await app.boardReady();
  if (lesson) await app.show(lesson);
  await app.page.locator(".excalidraw").first().focus();
}

const order = async (app) => (await app.scene()).map((e) => e.id);

test("lesson 7: ⌘⌥] brings a drawing to the front and ⌘⌥[ sends one to the back", async ({ app, page }) => {
  const warnings = [];
  page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
  await openPractice(app, "l-camadas");
  await app.select("d-cam-circulo");
  await page.keyboard.press(FRONT);
  await expect.poll(async () => (await order(app)).indexOf("d-cam-circulo")).toBeGreaterThan((await order(app)).indexOf("d-cam-losango"));
  // The diamond lies over the square: sent to the back, it goes under it
  // (the square is under it already, and proves nothing — review
  // `board.md`, reading 4, finding 7).
  expect((await order(app)).indexOf("d-cam-losango")).toBeGreaterThan((await order(app)).indexOf("d-cam-quadrado"));
  await app.select("d-cam-losango");
  await page.keyboard.press(BACK);
  await expect.poll(async () => (await order(app)).indexOf("d-cam-losango")).toBeLessThan((await order(app)).indexOf("d-cam-quadrado"));
  // Four actions matched ⌘⌥] on a Mac, and Excalidraw ran none (bf12a4d).
  expect(warnings.filter((w) => /multiple actions match/i.test(w))).toEqual([]);
});

test("a drawing sent behind a card stays behind it when the board opens again", async ({ app, page }) => {
  await openPractice(app, "l-ligar");
  await app.select("d-lig-w");
  await page.keyboard.press(BACK);
  await expect.poll(async () => JSON.parse(await app.file(BOARD)).verso.drawing.find((d) => d.id === "d-lig-w")?.under, { timeout: 10_000 }).toBeTruthy();
  const under = JSON.parse(await app.file(BOARD)).verso.drawing.find((d) => d.id === "d-lig-w").under;
  await app.key("Mod+w");
  await app.quickOpen("Treino do Board");
  await app.boardReady();
  const ids = await order(app);
  expect(ids.indexOf("d-lig-w")).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf("d-lig-w")).toBeLessThan(ids.indexOf(under));
});

test("lesson 10: an arrow between two notes, promoted to a relation, shows its name at once", async ({ app, page }) => {
  await openPractice(app, "l-relacoes");
  await page.keyboard.press("a");
  const from = await app.centerOf("n-alpha");
  const to = await app.centerOf("n-beta-2");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 25 });
  await page.mouse.up();
  const arrow = (await app.scene()).find((e) => e.type === "arrow" && e.startBinding === "n-alpha" && e.endBinding === "n-beta-2");
  expect(arrow, "the arrow binds both cards").toBeTruthy();
  await page.getByTestId("board-tool-promote").click();
  await page.locator(".prompt-field").fill("inspira");
  await page.locator(".prompt-field").press("Enter");
  await page.locator(".plan:visible button.save").click();
  await expect.poll(() => app.file("projetos/Projeto Alpha.md")).toContain('inspira: "[[Projeto Beta]]"');
  // The label: on the arrow, measured, in no group — not invisible until the
  // board opens again (bf12a4d).
  await expect
    .poll(async () => {
      const label = (await app.scene()).find((e) => e.type === "text" && e.containerId === arrow.id);
      return label ? { text: label.text, frame: label.frameId ?? null, sized: label.width > 0 && label.height > 0 } : null;
    })
    .toEqual({ text: "inspira", frame: null, sized: true });
  await expect
    .poll(async () => {
      const edge = JSON.parse(await app.file(BOARD)).edges.find((e) => e.id === arrow.id);
      return edge ? [edge.label, edge.verso?.relation] : null;
    })
    .toEqual(["inspira", "inspira"]);
});

test("lesson 6: a group made and renamed on the board is listed and saved by its name", async ({ app, page }) => {
  await openPractice(app, "l-grupos");
  const before = new Set(await order(app));
  await app.select("n-maca", "n-banana", "n-uva");
  const at = await app.centerOf("n-maca");
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.getByText("Envolver a seleção num quadro", { exact: true }).click();
  const frame = (await app.scene()).find((e) => e.type === "frame" && !before.has(e.id));
  expect(frame, "a new frame round the fruit").toBeTruthy();
  // Its name, above its top left corner: Excalidraw draws it as an element
  // of the page, and a double click on it opens the field.
  await page.locator(`[id$="-frame-name-${frame.id}"]`).dblclick();
  const field = page.locator(".excalidraw input:focus");
  await expect(field).toBeVisible();
  await field.fill("Frutas");
  await field.press("Enter");
  await page.getByRole("button", { name: "Sumário", exact: true }).click();
  await expect(page.locator(".board-outline-group", { hasText: "Frutas" })).toBeVisible();
  await expect.poll(async () => JSON.parse(await app.file(BOARD)).nodes.find((n) => n.id === frame.id)?.label).toBe("Frutas");
});

test("lesson 8: a text card is edited from a double click", async ({ app, page }) => {
  await openPractice(app, "l-cartoes");
  const at = await app.centerOf("n-editavel");
  await page.mouse.dblclick(at.x, at.y);
  const field = page.locator(".prompt-field");
  await expect(field).toBeVisible();
  await field.fill("**Editado!** Funcionou.");
  await page.locator(".prompt-box button.save").click();
  await expect.poll(async () => JSON.parse(await app.file(BOARD)).nodes.find((n) => n.id === "n-editavel")?.text).toBe("**Editado!** Funcionou.");
});

test("lesson 11: the board's search finds the word as typed, and stays put while the board saves", async ({ app, page }) => {
  await openPractice(app);
  await app.key("Mod+f");
  const field = page.locator(".board-ex-search input");
  await expect(field).toBeFocused();
  await page.keyboard.type("tesouro");
  await expect(field).toHaveValue("tesouro");
  await expect(field).toHaveAttribute("spellcheck", "false");
  await expect(page.locator(".board-ex-search-count")).toHaveText(/^1 de \d+$/);
  // On a match other than the first, which is where the old bug sent the
  // view back to (review `board.md`, reading 4, finding 2).
  await field.press("Enter");
  await expect(page.locator(".board-ex-search-count")).toHaveText(/^2 de \d+$/);
  const before = await app.settledView();
  // A real change, so that the board saves: a drawn element nudged with
  // the keyboard, as a user does.
  const writes = (await app.calls("write_board")).length;
  await app.select("d-lig-w");
  await page.locator(".excalidraw").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await app.calls("write_board")).length).toBeGreaterThan(writes);
  // The folder changed — the board's own save, as the watcher reports it:
  // the view stays where the user is (bf12a4d).
  await app.folderChanged([BOARD]);
  await page.waitForTimeout(800);
  const after = await app.settledView();
  expect([after.scrollX, after.scrollY, after.zoom]).toEqual([before.scrollX, before.scrollY, before.zoom]);
});

test("text whose font arrives late is measured again, not left cut at its edges", async ({ app, page }) => {
  // The fonts held back past the board's last scheduled look (4 s): a cold
  // start of the app, where WebKit loads them late and does not say so.
  await page.route(/\.(woff2?|ttf)(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
  await openPractice(app);
  // Each text as Excalidraw lays it out, its fallbacks included: the widest
  // line wider than the box it keeps is drawn cut.
  const cut = () =>
    page.evaluate(() => {
      const fonts = { 5: "Excalifont, Xiaolai, Segoe UI Emoji", 6: "Nunito, Segoe UI Emoji" };
      const ctx = document.createElement("canvas").getContext("2d");
      return window.__VERSO_TEST__.board
        .getSceneElements()
        .filter((e) => e.type === "text" && fonts[e.fontFamily])
        .filter((e) => {
          ctx.font = `${e.fontSize}px ${fonts[e.fontFamily]}`;
          return Math.max(...e.text.split("\n").map((l) => ctx.measureText(l).width)) > e.width + 1;
        })
        .map((e) => e.id);
    });
  // Waited for, not asked for: asking would load them on the test's behalf.
  const arrived = () =>
    page.evaluate(() => {
      const loaded = new Set();
      document.fonts.forEach((f) => f.status === "loaded" && loaded.add(f.family.replace(/^["']|["']$/g, "")));
      return loaded.has("Excalifont") && loaded.has("Nunito");
    });
  await expect.poll(arrived, { timeout: 20_000 }).toBe(true);
  await expect.poll(cut, { timeout: 5_000 }).toEqual([]);
});
