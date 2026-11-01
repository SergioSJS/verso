// The data diagram on a narrow pane (ADR 0106, the phone): one slim row of
// icon buttons, the rest in a "…" menu, the search opened over the row, the
// hint shown once and dismissible. At 390 × 844 with a finger; Docker only.

import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const SAMPLE = readFileSync(new URL("../../../demo-vault-en/Sample Data/campaign-npcs.json", import.meta.url), "utf8");
const SHOTS = process.env.DG_SHOTS ?? "";

async function open(app, page) {
  await app.open();
  await app.writeOutside("campaign-npcs.json", SAMPLE);
  await app.folderChanged(["campaign-npcs.json"], true);
  await app.quickOpen("campaign-npcs");
  await expect(page.locator(".leaf:visible .editor.source")).toBeVisible();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".dg-box").first()).toBeVisible();
}

const scale = (page) => page.locator(".dg-layer").evaluate((el) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1));
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test("shots: the diagram at the desktop's size", async ({ app, page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(app, page);
  await shot(page, `${process.env.DG_TAG ?? "x"}-desktop`);
});

test("on a phone the toolbar is one slim row of icons and a menu @layout", async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(app, page);
  await shot(page, `${process.env.DG_TAG ?? "x"}-phone`);
  const bar = page.locator(".leaf:visible .dg-bar");
  const b = await bar.boundingBox();
  expect(b.height).toBeLessThanOrEqual(56);
  // No text buttons in the row, and every target is a finger's.
  const finger = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const least = finger ? 44 : 36;
  for (const btn of await bar.locator("button:visible").all()) {
    const r = await btn.boundingBox();
    expect(r.width).toBeGreaterThanOrEqual(least);
    expect(r.height).toBeGreaterThanOrEqual(least);
    await expect(btn).toHaveAttribute("aria-label", /.+/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The hint: one line, dismissed for good.
  const hint = page.locator(".leaf:visible .dg-hint");
  await expect(hint).toBeVisible();
  expect((await hint.boundingBox()).height).toBeLessThanOrEqual(56);
  await hint.locator(".dg-hint-close").click();
  await expect(hint).toBeHidden();

  // Fit to screen moves the diagram.
  await page.locator(".leaf:visible .dg-bar button[aria-label='Afastar']").click();
  await page.locator(".leaf:visible .dg-bar button[aria-label='Afastar']").click();
  const before = await scale(page);
  await page.locator(".leaf:visible .dg-bar button[aria-label='Ajustar à tela']").click();
  await expect.poll(() => scale(page)).not.toBe(before);

  // The overflow menu: collapse all changes the boxes, expand all brings them back.
  const boxes = page.locator(".dg-box");
  // The boxes are drawn on the next frame after a pan, a zoom or a fold, and
  // only the ones near the view: a count read at once is the last frame's
  // (a Mac's slower frames showed 13 for the view's 8). Read it once it
  // holds still for a few frames.
  const drawn = async () => {
    let last = -1;
    for (let same = 0; same < 4; ) {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const n = await boxes.count();
      same = n === last ? same + 1 : 0;
      last = n;
    }
    return last;
  };
  const all = await drawn();
  await page.locator(".leaf:visible .dg-overflow").click();
  const menu = page.locator("ul.menu");
  for (const name of ["Recolher tudo", "Expandir tudo", "Expandir até o nível…", "Arrumar de novo"]) {
    await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  }
  await shot(page, `${process.env.DG_TAG ?? "x"}-phone-menu`);
  await menu.getByRole("menuitem", { name: "Recolher tudo" }).click();
  await expect.poll(() => boxes.count()).toBeLessThan(all);
  const folded = await drawn();
  await page.locator(".leaf:visible .dg-overflow").click();
  await menu.getByRole("menuitem", { name: "Expandir tudo" }).click();
  await expect.poll(() => boxes.count()).toBeGreaterThan(folded);

  // Search: opens over the row, finds, closes.
  await page.locator(".leaf:visible .dg-search-open").click();
  const input = page.locator(".leaf:visible .dg-search");
  await expect(input).toBeVisible();
  await input.fill("Yara");
  await expect(page.locator(".leaf:visible .dg-matches")).toContainText("1");
  await shot(page, `${process.env.DG_TAG ?? "x"}-phone-search`);
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(56);
  await page.locator(".leaf:visible .dg-search-close").click();
  await expect(input).toBeHidden();
  await expect(page.locator(".leaf:visible .dg-search-open")).toBeVisible();

  // The dismissal is remembered: a diagram opened again has no hint.
  await page.locator(".leaf:visible .data-modes button[data-mode=text]").click();
  await page.locator(".leaf:visible .data-modes button[data-mode=diagram]").click();
  await expect(page.locator(".leaf:visible .dg-hint")).toBeHidden();
});
