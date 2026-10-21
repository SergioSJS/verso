// A PDF closed, or left for another note, while pdf.js is still fetching
// its other pages: tearing the document down must not make the viewer
// log "Unable to get page N to initialize viewer: Transport destroyed"
// (the fixture fails a test on any console error). 2026-10-21.

import { test, expect } from "./fixtures.mjs";

/** The tab is closed in the turn the viewer asks the worker for page 2:
 *  the request is on its way, and its answer comes after the document is
 *  torn down. */
async function closeWhenPage2IsAsked(page) {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    let asked = false;
    Worker.prototype.postMessage = function (msg, ...rest) {
      const out = post.call(this, msg, ...rest);
      if (!asked && msg && msg.action === "GetPage" && msg.data?.pageIndex >= 1) {
        asked = true;
        // What the embed had drawn when the note went: the test reads this,
        // since the page is gone in the same turn and a poll can miss it.
        window.__page1WhenAsked = !!document.querySelector('.page[data-page-number="1"]');
        for (const k of [{ ctrlKey: true }, { metaKey: true }]) document.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true, cancelable: true, ...k }));
      }
      return out;
    };
  });
}

test("closing a PDF's tab while the other pages are still being asked for logs nothing", async ({ app, page }) => {
  await closeWhenPage2IsAsked(page);
  await app.open();
  await app.quickOpen("manual-verso.pdf");
  await expect(page.getByRole("tabpanel", { name: /^manual-verso\.pdf/ })).toHaveCount(0, { timeout: 15_000 });
  // Let any late rejection surface before the fixture reads the console.
  await page.waitForTimeout(1500);
});

test("closing a note that embeds a multi-page PDF while its pages are still being asked for logs nothing", async ({ app, page }) => {
  await closeWhenPage2IsAsked(page);
  await app.open();
  await app.writeOutside("Embed do manual.md", "# Embed\n\n![[manual-verso.pdf]]\n");
  await app.folderChanged(["Embed do manual.md"], true);
  await app.quickOpen("Embed do manual");
  // The embed drew its first page and the viewer asked for the second; the
  // note was closed in that same turn, so the page is not on screen to be
  // polled for (a fast machine never lets a poll see it): the init script
  // noted it was there.
  await expect.poll(() => page.evaluate(() => window.__page1WhenAsked), { timeout: 15_000 }).toBe(true);
  await expect(page.locator('.page[data-page-number="1"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(1500);
});
