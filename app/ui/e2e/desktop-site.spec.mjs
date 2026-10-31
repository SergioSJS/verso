// A phone asking for the desktop site (the maintainer, 2026-10-30, Chrome on
// Android): the page is laid out for ~980 CSS px and scaled onto the screen.
// Chromium emulates it: a desktop agent, 980 CSS px wide, a touch screen, the
// phone's short side as `screen.width`. Docker only (no browser on the Mac host).
// Screenshots for the eye go to /shots when that folder is mounted.

import { test, expect } from "./fixtures.mjs";

test.skip(({ browserName }) => browserName !== "chromium", "the phone's engine");
test.use({
  viewport: { width: 980, height: 2125 },
  deviceScaleFactor: 2.6,
  hasTouch: true,
  isMobile: false,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const [k, v] of [["width", 377], ["height", 818], ["availWidth", 377], ["availHeight", 818]]) {
      Object.defineProperty(screen, k, { get: () => v });
    }
  });
});

test("the window scales itself up and its status bar and empty state are tidy", async ({ app, page }) => {
  await app.open("?vault=empty");
  await expect(page.locator("html.desk-on-phone")).toHaveCount(1);

  // Text at the device: its CSS size, times the page's zoom, times what the
  // browser shrinks the page by (the screen's width over the layout's).
  const m = await page.evaluate(() => {
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue("--phone-zoom"));
    const shrink = screen.width / window.innerWidth;
    const size = parseFloat(getComputedStyle(document.querySelector(".side .search input, #notes, .side")).fontSize);
    return { zoom, shrink, size, atDevice: size * zoom * shrink };
  });
  expect(m.zoom).toBeGreaterThan(1.5);
  // 12 CSS px is the floor of a phone's own text (css/screen.css); the desktop site gets there too.
  expect(m.atDevice).toBeGreaterThanOrEqual(12);

  // The empty state is centred in the pane, and drawn within it.
  const box = await page.evaluate(() => {
    const lesson = document.querySelector(".pane-empty, .lesson").getBoundingClientRect();
    const host = document.querySelector(".panes").getBoundingClientRect();
    return { centre: (lesson.top + lesson.height / 2 - host.top) / host.height, fits: lesson.width <= host.width + 1 };
  });
  expect(Math.abs(box.centre - 0.5)).toBeLessThanOrEqual(0.1);
  expect(box.fits).toBe(true);

  // The status bar's controls share one centre line.
  const centres = await page.evaluate(() =>
    [...document.querySelectorAll(".status-bar button svg")]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => r.top + r.height / 2),
  );
  expect(centres.length).toBeGreaterThan(3);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(2 * m.zoom);

  // No lone band above the lesson.
  await expect(page.locator(".work.empty .spaces")).toBeHidden();
  await page.screenshot({ path: "/shots/e2e-desktop-site-empty.png" }).catch(() => {});
});

test("an open note and the right sheet fit the window", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Mundo");
  await expect(page.locator(".note-title, .title-input").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator("#toggle-right").click();
  const right = await page.evaluate(() => {
    const r = document.querySelector("aside.right").getBoundingClientRect();
    return { inside: r.right <= window.innerWidth + 1, share: r.width / window.innerWidth };
  });
  expect(right.inside).toBe(true);
  // A sheet over the page, never wider than two thirds of it.
  expect(right.share).toBeLessThanOrEqual(0.67);
  await page.screenshot({ path: "/shots/e2e-desktop-site-right.png" }).catch(() => {});
});
