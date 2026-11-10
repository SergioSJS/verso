// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The maintainer's phone (2026-11-08): Settings' close sat under the status
// bar where no tap reached it; Android's Back did nothing. A dialog's close
// is a finger's size inside the screen; Back
// (`window.versoBack`, which the Android activity calls) closes what is on
// top, then the drawer, and answers false when nothing is open.

import { expect, test } from "./fixtures.mjs";

test("Settings' close is a finger's size inside the screen @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  const close = page.locator(".settings-close");
  await expect(close).toBeVisible();
  const box = await close.boundingBox();
  const view = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  if (view.width <= 760) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await close.click();
  await expect(page.locator(".settings-search")).toBeHidden();
});

test("Back closes Settings, then the drawer, and says when nothing was open @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await expect(page.locator(".settings-search")).toBeVisible();
  expect(await page.evaluate(() => window.versoBack?.())).toBe(true);
  await expect(page.locator(".settings-search")).toBeHidden();
  if (page.viewportSize().width <= 760) {
    await page.locator(".bottom-bar .bar-files").click();
    await expect(page.locator("body.side-open")).toHaveCount(1);
    expect(await page.evaluate(() => window.versoBack?.())).toBe(true);
    await expect(page.locator("body.side-open")).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.versoBack?.())).toBe(false);
});
