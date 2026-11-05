// Walkthrough, section 2: the tour board — its stops in order, shown whole
// from the outline, its drawn text measured with its font, nothing written
// for opening it; and ⌘P from a board.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const tour = JSON.parse(readFileSync(new URL("../../../demo-vault/Tour do Verso.canvas", import.meta.url), "utf8"));
const STOPS = tour.nodes.filter((n) => n.type === "group").map((n) => n.label);

test("the tour opens with its stops in order, each shown whole from the outline", async ({ app }) => {
  await app.open();
  await app.quickOpen("Tour do Verso");
  await app.boardReady();
  await app.page.getByRole("button", { name: "Sumário", exact: true }).click();
  const stops = app.page.locator(".board-outline-group");
  await expect(stops).toHaveText(STOPS);
  // A stop chosen in the outline is shown whole, in the middle (b1c5d58).
  const fourth = tour.nodes.filter((n) => n.type === "group")[3];
  const before = await app.view();
  await stops.nth(3).click();
  const chosen = await app.settledView(before);
  const c = await app.toPage(fourth.x + fourth.width / 2, fourth.y + fourth.height / 2);
  expect(Math.abs(c.x - (chosen.left + chosen.width / 2))).toBeLessThan(40);
  expect(Math.abs(c.y - (chosen.top + chosen.height / 2))).toBeLessThan(40);
  expect(fourth.width * chosen.zoom).toBeLessThanOrEqual(chosen.width);
  // Shown whole and as close as it fits: not centred at a distance, as
  // before b1c5d58 (review `board.md`, reading 4, finding 3).
  expect(Math.max((fourth.width * chosen.zoom) / chosen.width, (fourth.height * chosen.zoom) / chosen.height)).toBeGreaterThan(0.6);
  // Closing the outline (the pane grows) keeps the stop chosen: the whole
  // board came back over it once.
  await app.page.getByRole("button", { name: "Sumário", exact: true }).click();
  await expect(stops).toHaveCount(0);
  await app.page.waitForTimeout(400);
  expect((await app.settledView()).zoom).toBe(chosen.zoom);
  // Opening and moving around wrote nothing.
  expect(await app.calls("write_board")).toEqual([]);
});

test("drawn text is measured with its own font once it is in", async ({ app }) => {
  await app.open();
  await app.quickOpen("Tour do Verso");
  await app.boardReady();
  // "Tour do Verso" at 120 px in Excalifont: about 690 px; cut short when it
  // kept a fallback font's measure (b1c5d58).
  await app.page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => {
      const title = (await app.scene()).find((e) => e.id === "d-titulo");
      const width = await app.page.evaluate(([font, text]) => {
        const c = document.createElement("canvas").getContext("2d");
        c.font = font;
        return c.measureText(text).width;
      }, ["120px Excalifont", "Tour do Verso"]);
      return Math.abs(title.width - width) < 4;
    })
    .toBe(true);
});

test("⌘P opens the quick switcher from a board", async ({ app }) => {
  await app.open();
  await app.quickOpen("Tour do Verso");
  await app.boardReady();
  await app.page.locator(".excalidraw").first().focus();
  await app.key("Mod+p");
  await expect(app.page.getByRole("combobox", { name: "Abrir…" })).toBeFocused();
});

test("the board's main-menu button has a name for a screen reader @layout", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Tour do Verso");
  const menu = page.locator(".board-canvas .main-menu-trigger").first();
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAccessibleName("Menu do board");
});
