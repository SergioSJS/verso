// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The font size's sample in Settings › Appearance: it shows the true size, it
// follows the slider and the width, and the dialog stays as it is.
import { expect, test } from "./fixtures.mjs";

const SHOTS = process.env.SHOTS ?? "";
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function settings(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
}
const sizeOf = (page) => page.locator(".font-sample-body p").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

test("the sample follows the slider and the width; the dialog does not move", async ({ app, page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await app.open();
  await settings(app);
  const slider = page.locator('.settings-body input[type="range"]').first();
  await slider.scrollIntoViewIfNeeded();
  const sample = page.locator(".font-sample");
  await expect(sample.locator(".font-sample-label")).toHaveText("Exemplo");
  await expect(sample.locator(".font-sample-frame")).toHaveAttribute("aria-hidden", "true");
  await expect(sample).toContainText("dragão");
  await slider.fill("12");
  const small = await sizeOf(page);
  const box = await page.locator(".settings-box").boundingBox();
  await slider.fill("24");
  const big = await sizeOf(page);
  expect(big).toBeGreaterThan(small * 1.8);
  await expect(slider).toHaveAttribute("aria-valuetext", "24 px");
  const after = await page.locator(".settings-box").boundingBox();
  expect(Math.abs(after.width - box.width)).toBeLessThan(1);
  expect(Math.abs(after.height - box.height)).toBeLessThan(1);
  await shot(page, "sample-24-desktop");
  // The width: a narrow text is laid out narrower than a large one (before fitting).
  await slider.fill("15");
  const frame = sample.locator(".font-sample-body");
  const laid = () => frame.evaluate((e) => e.offsetWidth);
  const choose = (v) => page.locator(".settings-body select").filter({ has: page.locator('option[value="narrow"]') }).selectOption(v);
  await choose("large");
  await expect.poll(laid).toBeGreaterThan(1000);
  await choose("narrow");
  await expect.poll(laid).toBeLessThan(700);
  await shot(page, "sample-15-narrow");
});

for (const [name, w, h, zoom] of [["phone", 390, 800, false], ["zoom200", 700, 450, true]]) {
  test(`the sample fits the dialog on a ${name}, at the largest size`, async ({ app, page }) => {
    await page.setViewportSize({ width: w, height: h });
    await app.open(zoom ? "?zoom=host" : "");
    await settings(app);
    const slider = page.locator('.settings-body input[type="range"]').first();
    await slider.scrollIntoViewIfNeeded();
    await slider.fill("30");
    const select = page.locator(".settings-body select").filter({ has: page.locator('option[value="full"]') });
    await select.selectOption("full");
    const frame = page.locator(".font-sample-frame");
    await frame.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await page.locator(".font-sample-body").boundingBox()).width).toBeLessThanOrEqual((await frame.boundingBox()).width + 1);
    const f = await frame.boundingBox();
    const b = await page.locator(".settings-box").boundingBox();
    expect(f.x).toBeGreaterThanOrEqual(b.x);
    expect(f.x + f.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await shot(page, `sample-${name}`);
  });
}

test("the zoom row is one aligned line (desktop host)", async ({ app, page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await app.open("?zoom=host");
  await settings(app);
  const row = page.locator(".zoom-control");
  await row.scrollIntoViewIfNeeded();
  const boxes = await row.locator("button, .zoom-level").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { y: r.y, h: r.height }; }));
  for (const bx of boxes) { expect(Math.abs(bx.h - boxes[0].h)).toBeLessThan(1.5); expect(Math.abs(bx.y - boxes[0].y)).toBeLessThan(1.5); }
  await shot(page, "zoom-row-desktop");
  await page.setViewportSize({ width: 390, height: 800 });
  await row.scrollIntoViewIfNeeded();
  await shot(page, "zoom-row-phone");
});
