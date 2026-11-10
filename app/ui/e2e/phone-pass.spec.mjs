// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pass over the window on the maintainer's phone (2026-11-09): in every
// section of Settings, on a touch screen, each select, button and field is
// a target of 44px, and nothing reaches past the page sideways (the
// oracle's table for a screen reader did); the theme cards' copy says its
// word there; a phone's tabs keep their names instead of squeezing them.

import { expect, test } from "./fixtures.mjs";

const touch = (page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

test("every Settings section: targets of 44px on a touch screen, nothing wider than the page @layout", async ({ app, page }) => {
  await app.open();
  const isTouch = await touch(page);
  await app.key("Mod+,");
  const nav = page.locator(".settings-nav-item");
  const count = await nav.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i++) {
    const name = (await nav.nth(i).textContent()) ?? String(i);
    await nav.nth(i).click();
    await page.waitForTimeout(120);
    const bad = await page.evaluate((isTouch) => {
      const out = [];
      const body = document.querySelector(".settings-body");
      if (!body) return ["no page"];
      if (body.scrollWidth > body.clientWidth + 1) out.push(`the page is ${body.scrollWidth}px wide in ${body.clientWidth}px`);
      if (!isTouch) return out;
      for (const e of body.querySelectorAll("select, button, input")) {
        if (e instanceof HTMLInputElement && ["checkbox", "radio", "range", "color", "file", "hidden"].includes(e.type)) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(e).visibility === "hidden") continue;
        if (r.height < 43.5) out.push(`${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)}: ${Math.round(r.height)}px high`);
      }
      return out;
    }, isTouch);
    expect(bad, name).toEqual([]);
    const back = page.locator(".settings-back");
    if (await back.isVisible()) await back.click();
  }
});

test("the theme cards' copy says its word on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const copy = page.locator('.theme-act[data-act="copy"]').first();
  await expect(copy).toBeVisible();
  const word = copy.locator(".theme-act-word");
  if (await page.evaluate(() => matchMedia("(hover: none)").matches)) {
    await expect(word).toHaveText("Copiar");
    const box = await copy.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    expect(box.width).toBeGreaterThanOrEqual(43.5);
  } else {
    await expect(word).toBeHidden();
  }
});

test("a phone's tabs keep their names; the row scrolls @layout", async ({ app, page }) => {
  test.skip(page.viewportSize().width > 760, "a phone's tab row");
  await app.open();
  await app.quickOpen("01 - Guia");
  // Not squeezed: a tab is as wide as its name (up to its 22ch), the row scrolls.
  expect(await page.locator(".pane .tab").first().evaluate((e) => getComputedStyle(e).flexShrink)).toBe("0");
});
