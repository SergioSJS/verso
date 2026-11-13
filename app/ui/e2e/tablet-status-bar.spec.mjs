// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A tablet's status bar (the maintainer's iPad in landscape, 2026-11-12:
// "a barra é mais que o dobro do que a versão normal do Verso"): at most
// about 1.3 times the desktop's, its controls 24px at least (WCAG 2.5.8),
// the ⌘ hints hidden with no keyboard; the desktop's bar is unchanged.

import { expect, test } from "./fixtures.mjs";

const barHeight = (page) => page.locator("footer.status-bar").evaluate((e) => e.getBoundingClientRect().height);

test("a tablet's status bar is close to the desktop's, its controls at least 24px", async ({ app, page, browser }) => {
  await app.open();
  const desktop = await barHeight(page);
  // The desktop's own: about 31px, its ⌘ hints shown.
  expect(desktop).toBeGreaterThan(24);
  expect(desktop).toBeLessThan(40);
  await expect(page.locator("footer.status-bar .status-keys")).toBeVisible();

  const tablet = await browser.newContext({ viewport: { width: 1389, height: 970 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, baseURL: page.url().replace(/\/harness\.html.*/, "") });
  const tab = await tablet.newPage();
  await tab.goto("/harness.html");
  await expect(tab.locator("footer.status-bar")).toBeVisible();
  const coarse = await tab.evaluate(() => matchMedia("(pointer: coarse)").matches);
  test.skip(!coarse, "this browser's emulation reports no coarse pointer");
  const height = await barHeight(tab);
  test.info().annotations.push({ type: "heights", description: `desktop ${desktop}px, tablet ${height}px` });
  expect(height).toBeLessThanOrEqual(desktop * 1.3 + 1);
  for (const id of ["#toggle-side", "#report-bug", "#toggle-right"]) {
    const box = await tab.locator(`footer.status-bar ${id}`).boundingBox();
    if (box) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
  }
  await expect(tab.locator("footer.status-bar .status-keys")).toBeHidden();
  await tablet.close();
});
