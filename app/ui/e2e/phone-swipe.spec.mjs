// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A sideways swipe on the phone brings the side panels (the maintainer,
// 2026-11-15; ADR 0076 item 6; app/ui/src/screen/swipe.ts): right to left
// the right panel, left to right the files, the other way closes the one
// open; never from the screen's edge (Android's Back), never on a vertical
// scroll, a selection, something that scrolls sideways or a canvas-like
// view; Back closes a panel a swipe opened; a switch in the top bar's sheet
// turns it off. Touch is sent through Chromium's DevTools protocol, the only
// engine of the harness where Playwright can move a finger
// (e2e/touch.spec.mjs).

import { expect, test } from "./fixtures.mjs";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
test.skip(({ browserName }) => browserName !== "chromium", "touch moves need Chromium's DevTools protocol");

const NOTE = "04 - Escrevendo no Editor";

/** A finger from (x, y) in `steps` moves of (dx, dy) each, 16 ms apart,
 *  and lifted; `during` runs before the lift. */
async function swipe(page, x, y, dx, dy = 0, { steps = 10, during, holdMs = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const at = (px, py) => [{ x: px, y: py, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x, y) });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x + dx * i, y + dy * i) });
    await page.waitForTimeout(16);
  }
  if (during) await during();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** The panels' slide finished, so the next finger lands on what is there. */
async function settled(page) {
  await page.locator("aside.side, aside.right").evaluateAll((els) => Promise.all(els.flatMap((e) => e.getAnimations().map((a) => a.finished))));
}

async function open(app, page) {
  await app.open();
  await app.quickOpen(NOTE);
  await expect(page.locator(".pane .phone-head .phone-title-name").first()).toHaveText(NOTE);
  // Away from the edges, in the note's text.
  await expect(page.locator(".leaf:not([hidden]) .preview").first()).toBeVisible();
}

const body = (page) => page.locator("body");

test("right to left brings the right panel, left to right takes it away; the files the other way round", async ({ app, page }) => {
  await open(app, page);
  const panel = page.locator(".bottom-bar .bar-right");
  const files = page.locator(".bottom-bar .bar-files");
  await expect(panel).toHaveAttribute("aria-expanded", "false");

  // The panel follows the finger before the lift.
  let midway = "";
  await swipe(page, 300, 450, -20, 0, { during: async () => { midway = await page.locator("aside.right").evaluate((e) => e.style.transform); } });
  expect(midway).toMatch(/^translateX\(\d+(\.\d+)?px\)$/);
  await expect(body(page)).toHaveClass(/\bright-open\b/);
  // Opened through the bar's own toggle: its button says so.
  await expect(panel).toHaveAttribute("aria-expanded", "true");
  // Let go: the classes hold it again, nothing of the drag stays inline.
  expect(await page.locator("aside.right").evaluate((e) => e.style.transform)).toBe("");
  await settled(page);

  // Back on the page beside it, the other way: it goes.
  await swipe(page, 40, 450, 20);
  await expect(body(page)).not.toHaveClass(/\bright-open\b/);
  await expect(panel).toHaveAttribute("aria-expanded", "false");
  await settled(page);

  // Left to right: the files.
  await swipe(page, 60, 450, 20);
  await expect(body(page)).toHaveClass(/\bside-open\b/);
  await expect(files).toHaveAttribute("aria-expanded", "true");
  await settled(page);
  // On the drawer itself, right to left: it goes.
  await swipe(page, 280, 300, -20);
  await expect(body(page)).not.toHaveClass(/\bside-open\b/);
  await settled(page);

  // Android's Back closes a panel a swipe opened.
  await swipe(page, 300, 450, -20);
  await expect(body(page)).toHaveClass(/\bright-open\b/);
  expect(await page.evaluate(() => window.versoBack?.())).toBe(true);
  await expect(body(page)).not.toHaveClass(/\bright-open\b/);
});

test("not from the edge, not up and down, not short and slow", async ({ app, page }) => {
  await open(app, page);
  // From the very edge: Android's Back gesture lives there.
  await swipe(page, 6, 450, 20);
  await swipe(page, 386, 450, -20);
  // Up and down: the note scrolls.
  await swipe(page, 200, 600, 2, -25);
  // A little, slowly: back where it was.
  await swipe(page, 250, 450, -2, 0, { steps: 10 });
  await page.waitForTimeout(300);
  await expect(body(page)).not.toHaveClass(/\b(side|right)-open\b/);
  // A long press first, then across: a long press's, not a swipe.
  await swipe(page, 300, 450, -20, 0, { holdMs: 700 });
  await expect(body(page)).not.toHaveClass(/\b(side|right)-open\b/);
});

test("what keeps the finger keeps the swipe: a sideways scroll, a marked view, a selection", async ({ app, page }) => {
  await open(app, page);
  // Something that scrolls sideways (a wide table, a code block), and a
  // view that opts out by its mark (a board, a map, a graph do by their
  // own `touch-action` or class), put in the note's text.
  await page.locator(".leaf:not([hidden]) .preview").first().evaluate((p) => {
    const wide = document.createElement("div");
    wide.className = "test-wide";
    wide.style.cssText = "overflow-x:auto;height:120px";
    wide.innerHTML = '<div style="width:1200px;height:100px">wide</div>';
    const marked = document.createElement("div");
    marked.className = "test-marked";
    marked.dataset.noSwipe = "";
    marked.style.cssText = "height:120px";
    const panning = document.createElement("div");
    panning.className = "test-pans";
    panning.style.cssText = "height:120px;touch-action:none";
    p.prepend(wide, marked, panning);
  });
  for (const sel of [".test-wide", ".test-marked", ".test-pans"]) {
    const box = await page.locator(sel).boundingBox();
    await swipe(page, 300, box.y + 60, -20);
    await expect(body(page), sel).not.toHaveClass(/\bright-open\b/);
  }
  // A selection of text: its handles are being dragged.
  await page.locator(".leaf:not([hidden]) .preview p").first().evaluate((p) => {
    const r = document.createRange();
    r.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await swipe(page, 300, 650, -20);
  await expect(body(page)).not.toHaveClass(/\bright-open\b/);
  await page.evaluate(() => getSelection().removeAllRanges());
  await swipe(page, 300, 650, -20);
  await expect(body(page)).toHaveClass(/\bright-open\b/);
});

test("the sheet's switch turns the swipe off and back on", async ({ app, page }) => {
  await open(app, page);
  const count = page.locator(".pane .phone-tabs").first();
  const name = "Deslizar para o lado abre os painéis";
  await count.click();
  const sheet = page.getByRole("dialog", { name: "Abas e opções" });
  const toggle = sheet.getByRole("switch", { name });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await swipe(page, 300, 450, -20);
  await expect(body(page)).not.toHaveClass(/\bright-open\b/);
  // The buttons still open it.
  await page.locator(".bottom-bar .bar-right").click();
  await expect(body(page)).toHaveClass(/\bright-open\b/);
  await page.locator(".bottom-bar .bar-right").click();
  await expect(body(page)).not.toHaveClass(/\bright-open\b/);
  // Kept for the next start, and back on from the same switch.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings") ?? "{}").phoneSwipe)).toBe(false);
  await count.click();
  await sheet.getByRole("switch", { name }).click();
  await expect(sheet.getByRole("switch", { name })).toBeChecked();
});
