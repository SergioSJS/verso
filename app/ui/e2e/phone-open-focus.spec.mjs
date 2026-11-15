// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The maintainer's phone (2026-11-08): Settings opened with the on-screen
// keyboard up, its search field having taken the focus; its close sat under
// the status bar where no tap reached it; Android's Back did nothing. On a
// touch screen no field takes the focus when a tap opens what holds it (a
// key shortcut and a desktop keep it); a dialog's close is a finger's size inside the screen; Back
// (`window.versoBack`, which the Android activity calls) closes what is on
// top, then the drawer, and answers false when nothing is open.

import { expect, test } from "./fixtures.mjs";

const touch = (page) => page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);

test("opened by a tap on a touch screen, Settings and the palette focus no field; opened by a key, they do @layout", async ({ app, page }, info) => {
  await app.open();
  const isTouch = await touch(page);
  // Chromium's phone is a touch screen; a desktop is not.
  if (info.project.name === "phone-chromium") expect(isTouch).toBe(true);
  if (info.project.name === "chromium" || info.project.name === "webkit") expect(isTouch).toBe(false);
  const field = () => page.evaluate(() => {
    const at = document.activeElement;
    return at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
  });
  // By a key — a keyboard is at hand — the field takes the focus everywhere.
  await app.key("Mod+,");
  await expect(page.locator(".settings-search")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-search")).toBeHidden();
  for (const combo of ["Mod+p", "Mod+Shift+p"]) {
    await app.key(combo);
    await expect(page.locator(".quick:not([hidden]) input").first(), combo).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".quick:not([hidden])")).toHaveCount(0);
  }
  // By a tap on a phone (its bottom bar and drawer): no field, no keyboard; the dialog holds the focus.
  if (!(await page.locator(".bottom-bar").isVisible())) return;
  await page.locator(".bottom-bar .bar-files").click();
  await page.locator(".side-foot-item:visible").last().click();
  await expect(page.locator(".settings-search")).toBeVisible();
  expect(await field()).toBe(!isTouch);
  if (isTouch) await expect(page.locator(".quick.settings")).toBeFocused();
  await page.locator(".settings-close").click();
  await page.locator(".bottom-bar .bar-commands").click();
  await expect(page.locator(".quick.palette:not([hidden])")).toBeVisible();
  expect(await field()).toBe(!isTouch);
});

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
