// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A web page that is a native view floats over the window's page: an
// overlay used to hide it, and the page vanished while the overlay showed
// (the maintainer, 2026-11-12). Now the page is replaced by a picture of
// itself (`web_snapshot`) while the overlay is open (ADR 0056, revision of
// 2026-11-12): the picture in place before the view hides, the view shown
// before the picture goes. The harness draws a picture of two blue pixels,
// and none for an address saying "no-picture".

import { test, expect } from "./fixtures.mjs";

/** Each call that shows or hides a page records whether its picture was in
 *  the DOM at that moment: the order the person sees. */
async function watchVisible(page) {
  await page.evaluate(() => {
    window.__seen = [];
    window.__harness.core.handlers.web_visible = (a) => {
      window.__seen.push({ visible: a.visible, picture: document.querySelector("img.web-snapshot") !== null });
      return null;
    };
  });
}

const seen = (page) => page.evaluate(() => window.__seen);

/** Once the page shows: from here on, only what follows counts. */
async function shownNow(page) {
  await expect.poll(async () => (await seen(page)).at(-1)).toEqual({ visible: true, picture: false });
  const from = (await seen(page)).length;
  return () => seen(page).then((all) => all.slice(from));
}

async function openOverlay(app, page) {
  await app.key("Mod+p");
  await expect(page.locator(".quick:not([hidden])")).toHaveCount(1);
}

async function closeOverlay(page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".quick:not([hidden])")).toHaveCount(0);
}

test("a web note's page stays in sight, as a picture, behind the quick switcher", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Site.md", "---\nurl: https://example.com/site\n---\n");
  await app.folderChanged(["Site.md"], true);
  await watchVisible(page);
  await app.quickOpen("Site");
  await expect.poll(() => app.calls("web_open").then((c) => c.length)).toBe(1);
  const after = await shownNow(page);

  await openOverlay(app, page);
  const picture = page.locator(".web-host > img.web-snapshot");
  await expect(picture).toHaveCount(1);
  await expect.poll(() => app.calls("web_snapshot")).toEqual([{ label: "web-1" }]);
  // Hidden only with the picture already in place: no flash.
  await expect.poll(after).toEqual([{ visible: false, picture: true }]);
  // Where the page is, its size; decorative and out of the pointer's way.
  const fit = await page.evaluate(() => {
    const host = document.querySelector(".web-host").getBoundingClientRect();
    const img = document.querySelector("img.web-snapshot");
    const r = img.getBoundingClientRect();
    return { dx: Math.abs(r.left - host.left) + Math.abs(r.top - host.top), dw: Math.abs(r.width - host.width) + Math.abs(r.height - host.height), events: getComputedStyle(img).pointerEvents, src: img.src };
  });
  expect(fit.dx).toBeLessThan(1);
  expect(fit.dw).toBeLessThan(1);
  expect(fit.events).toBe("none");
  expect(fit.src).toMatch(/^blob:/);
  await expect(picture).toHaveAttribute("aria-hidden", "true");
  await expect(picture).toHaveAttribute("alt", "");

  await closeOverlay(page);
  // The view shows first, with the picture still under it; then it goes.
  await expect.poll(after).toEqual([
    { visible: false, picture: true },
    { visible: true, picture: true },
  ]);
  await expect(picture).toHaveCount(0);
});

test("an embedded page that refuses framing is a picture behind the overlay too", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Pagina.md", `<iframe src="https://frames-no.example/p" width="500" height="300"></iframe>\n`);
  await app.folderChanged(["Pagina.md"], true);
  await watchVisible(page);
  await app.quickOpen("Pagina");
  await page.locator('[data-embed-action="approve"]').click();
  await page.locator('[data-embed-action="approve-anyway"]').click();
  await expect.poll(() => app.calls("web_open").then((c) => c.length)).toBe(1);
  // The page placed and shown (the step before is what the picture needs).
  const after = await shownNow(page);

  await openOverlay(app, page);
  const picture = page.locator(".preview .embed-web > img.web-snapshot");
  await expect(picture).toHaveCount(1);
  await expect.poll(after).toEqual([{ visible: false, picture: true }]);
  // Over the box's border too, where the page's view lies.
  const fit = await page.evaluate(() => {
    const box = document.querySelector(".preview .embed-web").getBoundingClientRect();
    const r = document.querySelector("img.web-snapshot").getBoundingClientRect();
    return Math.abs(r.left - box.left) + Math.abs(r.top - box.top) + Math.abs(r.width - box.width) + Math.abs(r.height - box.height);
  });
  expect(fit).toBeLessThan(1.5);

  await closeOverlay(page);
  await expect(picture).toHaveCount(0);
  // (The note may move the page again later; the first two steps count.)
  expect((await after()).slice(0, 2)).toEqual([
    { visible: false, picture: true },
    { visible: true, picture: true },
  ]);
});

test("a page with no picture hides behind the overlay, as before", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Sem.md", "---\nurl: https://example.com/no-picture\n---\n");
  await app.folderChanged(["Sem.md"], true);
  await watchVisible(page);
  await app.quickOpen("Sem");
  await expect.poll(() => app.calls("web_open").then((c) => c.length)).toBe(1);
  const after = await shownNow(page);

  await openOverlay(app, page);
  await expect.poll(() => app.calls("web_snapshot").then((c) => c.length)).toBe(1);
  await expect.poll(after).toEqual([{ visible: false, picture: false }]);
  await expect(page.locator("img.web-snapshot")).toHaveCount(0);

  await closeOverlay(page);
  await expect.poll(after).toEqual([
    { visible: false, picture: false },
    { visible: true, picture: false },
  ]);
});
