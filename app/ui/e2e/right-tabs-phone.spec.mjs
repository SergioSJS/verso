// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The right panel's tabs on a phone (ADR 0072 amendment, 2026-11-01; the
// maintainer: "a) 34×44 px, as 8 cabem e o resto vai para …"): each tab is
// 34 px wide and 44 high, the eight fit in the drawer of a 390 px phone
// (min(85vw, 320px), 44 of it the drawer's close), and on a narrower phone
// those that do not fit fold into the "⋯" — never squeezed.

import { expect, test } from "./fixtures.mjs";

const tabs = (page) => page.locator('#right-tabs > button[role="tab"]:not([data-overflow])');
/** The drawer a phone `viewport` px wide gets: min(85vw, 320px). */
const drawer = (viewport) => Math.min(Math.round(viewport * 0.85), 320);

async function onBar(page) {
  return tabs(page).evaluateAll((els) => {
    const edge = document.querySelector("aside.right").getBoundingClientRect().right;
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.dataset.tab, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), edge: Math.round(edge) };
    });
  });
}

test("on a phone the tabs are 34 by 44 px, the eight fit at 390 and a narrower one folds the rest into the ⋯ @layout", async ({ app, page }) => {
  test.skip((page.viewportSize()?.width ?? 1500) > 760, "the phone's bar");
  await app.open("?vault=empty&table=owner");
  await page.locator(".bar-right").click();
  await expect(page.locator("#right-tabs")).toBeVisible();
  // A tab that is not the game's, so the drawer keeps its 320 px.
  await page.locator('#right-tabs [data-tab="backlinks"]').click();
  const more = page.getByRole("button", { name: "Mais abas do painel" });
  const aside = page.locator("aside.right");
  const seen = {};
  for (const viewport of [390, 360, 320]) {
    // The drawer's own width at that phone, set here; the bar measures itself on resize.
    await aside.evaluate((el, w) => (el.style.width = `${w}px`), drawer(viewport));
    await page.waitForTimeout(300);
    const boxes = await onBar(page);
    seen[viewport] = boxes.length;
    for (const b of boxes) {
      expect(b.w).toBe(34);
      expect(b.h).toBe(44);
      // Inside the drawer, and clear of its close button (44 px).
      expect(b.right).toBeLessThanOrEqual(b.edge - 44 + 1);
    }
  }
  // The eight fit at 390 and at 360 they do not all: the rest is in the ⋯, nothing lost.
  expect(seen[390]).toBe(8);
  expect(seen[360]).toBeLessThan(8);
  expect(seen[320]).toBeLessThan(seen[360]);
  expect(seen[320]).toBeGreaterThanOrEqual(5);
  await expect(more).toBeVisible();
  await more.click();
  const folded = page.locator(".menu:not([hidden]) [role='menuitem']");
  expect(await folded.count()).toBeGreaterThanOrEqual(8 - seen[320]);
});
