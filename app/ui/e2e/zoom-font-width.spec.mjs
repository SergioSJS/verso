// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The window zoom shown (a badge, and a row in Settings), the font size that
// sets only the notes' text, and the text width as a choice (ADR 0072, ADR
// 0100/0109). The harness keeps the webview's zoom as a call, so the zoom's
// effect on the viewport is played by the viewport: 200 % is half the CSS
// pixels, 50 % twice.
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS ?? "";
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function settings(app, section = "Aparência") {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: section }).click();
}
// The note's own preview: the settings page holds look samples that are previews too.
// (a side panel holds previews as well: the widest is the note's.)
const note = (s) => `[...document.querySelectorAll(${JSON.stringify(s)})].filter((e) => !e.closest(".settings-box, .look-sample") && !e.parentElement?.closest(".preview")).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]`;
const px = (page, sel, prop = "fontSize") => page.evaluate(([c, p]) => parseFloat(getComputedStyle(eval(c))[p]), [note(sel), prop]);
const width = (page, sel) => page.evaluate((c) => eval(c).getBoundingClientRect().width, note(sel));

test("a zoom change shows its level for a moment, and the settings row follows", async ({ app, page }) => {
  await app.open("?zoom=host");
  await app.key("Mod+=");
  const badge = page.locator("#zoom-badge");
  await expect(badge).toHaveText("Zoom 110 %");
  await expect(badge).toHaveClass(/on/);
  await shot(page, "badge");
  await expect(badge).not.toHaveClass(/on/, { timeout: 4000 });
  await settings(app);
  const level = page.locator(".zoom-control .zoom-level");
  await expect(level).toHaveText("110 %");
  await page.getByRole("button", { name: "Aumentar zoom" }).click();
  await expect(level).toHaveText("120 %");
  await app.key("Mod+-");
  await expect(level).toHaveText("110 %");
  await page.getByRole("button", { name: "Redefinir (100%)" }).click();
  await expect(level).toHaveText("100 %");
  await expect(page.getByRole("button", { name: "Redefinir (100%)" })).toBeDisabled();
  await shot(page, "zoom-row");
  // Keyboard only: the group is named, the buttons are reachable.
  await expect(page.getByRole("group", { name: "Zoom da janela" })).toBeVisible();
  await page.getByRole("button", { name: "Diminuir zoom" }).focus();
  await page.keyboard.press("Enter");
  await expect(level).toHaveText("90 %");
});

test("a browser has no zoom row", async ({ app, page }) => {
  await app.open();
  await settings(app);
  await expect(page.locator(".zoom-control")).toHaveCount(0);
});

for (const [zoom, w, h] of [["50", 2800, 1800], ["200", 700, 450]]) {
  test(`the settings dialog fits the window at ${zoom} % zoom, with the largest font`, async ({ app, page }) => {
    await page.setViewportSize({ width: w, height: h });
    await app.open("?zoom=host");
    await settings(app);
    const size = page.locator('.settings-body input[type="range"]').first();
    await size.fill("30");
    const box = await page.locator(".settings-box").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
    await expect(page.locator(".settings-search")).toBeInViewport();
    await expect(page.locator(".settings-body")).toBeInViewport();
    await shot(page, `settings-${zoom}`);
  });
}

test("the font size changes the notes' text only, and the slider stays under the pointer", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("01 - Guia");
  await expect(page.locator(".preview").first()).toBeVisible();
  const before = { note: await px(page, ".preview"), root: await px(page, "html"), rail: await px(page, ".status-bar") };
  await settings(app);
  const size = page.locator('.settings-body input[type="range"]').first();
  await size.scrollIntoViewIfNeeded();
  const boxBefore = await page.locator(".settings-box").boundingBox();
  const track = await size.boundingBox();
  // Drag the thumb from the left end to the right end.
  await page.mouse.move(track.x + 4, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 6 });
  const mid = await size.boundingBox();
  await page.mouse.move(track.x + track.width - 2, track.y + track.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await page.locator(".settings-box").boundingBox();
  const trackAfter = await size.boundingBox();
  // The dialog and the slider did not move or grow while it was dragged.
  expect(Math.abs(after.width - boxBefore.width)).toBeLessThan(1);
  expect(Math.abs(after.height - boxBefore.height)).toBeLessThan(1);
  expect(Math.abs(trackAfter.x - track.x)).toBeLessThan(1);
  expect(Math.abs(mid.x - track.x)).toBeLessThan(1);
  await expect(size).toHaveValue("30");
  expect(await px(page, "html")).toBe(before.root);
  expect(await px(page, ".status-bar")).toBe(before.rail);
  expect(await px(page, ".preview")).toBeGreaterThan(before.note * 1.8);
  await shot(page, "font-30");
  // The interface keeps its size: the settings' own text did not grow.
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".settings-nav-item")).fontSize))).toBeLessThan(20);
});

test("the text width: the theme's by default, then the person's own over it", async ({ app, page }) => {
  await page.setViewportSize({ width: 2400, height: 1000 });
  await app.open();
  await app.quickOpen("01 - Guia");
  await expect(page.locator(".preview").first()).toBeVisible();
  const root = (attr) => page.evaluate((a) => document.documentElement.dataset[a] ?? null, attr);
  expect(await root("measure")).toBeNull();
  const standard = await width(page, ".preview");
  await settings(app);
  const select = page.locator(".settings-body select").filter({ has: page.locator('option[value="medium"]') });
  const rem = 15;
  const want = { narrow: 40 * rem, medium: 48 * rem, large: 72 * rem };
  const seen = {};
  for (const [v, w] of Object.entries(want)) {
    await select.selectOption(v);
    expect(await root("measure")).toBe(v);
    seen[v] = [await width(page, ".preview"), w];
  }
  expect(seen).toEqual({ narrow: [600, 600], medium: [720, 720], large: [1080, 1080] });
  await select.selectOption("standard");
  expect(Math.abs((await width(page, ".preview")) - standard)).toBeLessThan(2);
  await select.selectOption("full");
  expect(await width(page, ".preview")).toBeGreaterThan(standard + 200);
  await shot(page, "width-full");
  // The person's choice wins over a theme's "line-width: narrow".
  await select.selectOption("large");
  await page.evaluate(() => { document.documentElement.dataset.lineWidth = "narrow"; });
  expect(Math.abs((await width(page, ".preview")) - 72 * rem)).toBeLessThan(2);
  // (A saved setting re-applies the theme's own choices, so the stand-in is set again.)
  await select.selectOption("theme");
  await page.evaluate(() => { document.documentElement.dataset.lineWidth = "narrow"; });
  expect(Math.abs((await width(page, ".preview")) - 40 * rem)).toBeLessThan(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("verso.settings")).measure)).toBe("theme");
});

test("a width saved by an older version is read back", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.settings", JSON.stringify({ measure: "wide" })));
  await app.open();
  expect(await page.evaluate(() => document.documentElement.dataset.measure)).toBe("full");
});
