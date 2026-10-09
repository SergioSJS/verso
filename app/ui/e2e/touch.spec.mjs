// A finger on the file tree (phone and tablet, ADR 0073 item 9): a swipe
// scrolls and never moves a note; a long press and a lift open the menu a
// right click opens; a long press and a move drag the row. Touch is sent
// through Chromium's DevTools protocol, the only engine of the harness
// where Playwright can move a finger.

import { test, expect } from "./fixtures.mjs";

// Tall enough that the whole tree fits: rows are taller for a finger.
test.use({ hasTouch: true, viewport: { width: 1280, height: 1600 } });

const NOTE = "03 - Propriedades e Metadados.md";

/** A finger at (x, y), moved along `path`, lifted; `holdMs` still first. */
async function finger(page, x, y, path, holdMs = 0) {
  const cdp = await page.context().newCDPSession(page);
  const at = (px, py) => [{ x: px, y: py, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x, y) });
  if (holdMs) await page.waitForTimeout(holdMs);
  let last = [x, y];
  for (const [px, py] of path) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(px, py) });
    await page.waitForTimeout(16);
    last = [px, py];
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  return last;
}

test.beforeEach(({ browserName }) => test.skip(browserName !== "chromium", "touch moves need Chromium's DevTools protocol"));

test("a swipe on a row scrolls the tree and moves nothing", async ({ app, page }) => {
  await app.open();
  const row = page.locator(`#notes li[data-path="${NOTE}"] button`).first();
  const box = await row.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await finger(page, x, y, [1, 2, 3, 4, 5, 6].map((i) => [x, y - i * 25]));
  await expect(page.locator("body")).not.toHaveClass(/dragging/);
  // A tap afterwards on a folder drops nothing into it.
  await page.locator('#notes summary[data-folder="Templates"]').tap();
  expect((await app.files())).toContain(NOTE);
  await expect(page.locator(".plan:not([hidden])")).toHaveCount(0);
});

test("a long press and a lift on a row open its menu", async ({ app, page }) => {
  await app.open();
  const row = page.locator(`#notes li[data-path="${NOTE}"] button`).first();
  const box = await row.boundingBox();
  await finger(page, box.x + box.width / 2, box.y + box.height / 2, [], 700);
  await expect(page.locator(".menu:not([hidden])")).toBeVisible();
  await expect(page.locator(".menu:not([hidden])")).toContainText("Renomear");
});

test("a long press and a move drag the row into a folder", async ({ app, page }) => {
  await app.open();
  const row = page.locator(`#notes li[data-path="${NOTE}"] button`).first();
  const box = await row.boundingBox();
  const target = await page.locator('#notes summary[data-folder="Templates"]').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  const steps = 8;
  await finger(page, x, y, Array.from({ length: steps }, (_, i) => [x + ((tx - x) * (i + 1)) / steps, y + ((ty - y) * (i + 1)) / steps]), 700);
  // The note has backlinks: the move asks first, as it does for a mouse.
  await page.locator(".plan:not([hidden])").getByRole("button", { name: "Atualizar links" }).click();
  await expect.poll(async () => (await app.files())).toContain(`Templates/${NOTE}`);
  await expect(page.locator(".menu:not([hidden])")).toHaveCount(0);
});
