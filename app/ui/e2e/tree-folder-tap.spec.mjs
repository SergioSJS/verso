// A folder's row on a finger (ADR 0060, amendment of 2026-10-30; the
// maintainer: "tem que clicar milimetricamente na setinha"): a tap anywhere
// on the row opens or closes the folder, and its page opens from the small
// button at the row's end or from the row's menu. With a mouse the same
// since 2026-10-31: a click on the row toggles, the button opens the page.

import { test, expect } from "./fixtures.mjs";

const PHONE = 760;
const FILES = { "Zeta/Alfa.md": "a\n", "Zeta/Sub/Deep.md": "d\n", "Beta.md": "b\n" };
const folder = (page, f) => page.locator(`#notes summary[data-folder="${f}"]`);

async function setup(app) {
  await app.open("?vault=empty");
  for (const [p, text] of Object.entries(FILES)) await app.writeOutside(p, text);
  await app.folderChanged(Object.keys(FILES), true);
  const page = app.page;
  // The drawer open on a phone, so that the tree can be tapped.
  if (page.viewportSize().width < PHONE && !(await page.locator("body.side-open").count())) {
    await page.locator(".bottom-bar .bar-files").click();
    await expect(page.locator("body.side-open")).toHaveCount(1);
    await page.locator("aside.side").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  }
  await expect(folder(page, "Zeta")).toBeVisible();
  return page.evaluate(() => matchMedia("(pointer: coarse)").matches);
}

test("a folder's row: a tap toggles it, a button at its end opens the page, a long press the menu @layout", async ({ app, page, browserName }, testInfo) => {
  const coarse = await setup(app);
  const z = folder(page, "Zeta");
  const button = z.locator("button.folder-page");
  if (!coarse) {
    // A mouse (ADR 0060, 2026-10-31): a click anywhere on the row toggles it,
    // on the name as on the arrow; the page opens from the button at the end.
    await expect(z).toHaveAttribute("aria-expanded", "true");
    await z.locator(".folder-label").click();
    await expect(z).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".sheet")).toHaveCount(0);
    await z.locator(".chev").click();
    await expect(z).toHaveAttribute("aria-expanded", "true");
    // The button: shown on the row's hover, named, and it opens the page
    // without toggling the row.
    await z.hover();
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS("opacity", "1");
    await expect(button).toHaveAttribute("aria-label", /Abrir a página da pasta/);
    await button.click();
    await expect(page.locator(".sheet")).toBeVisible();
    await expect(z).toHaveAttribute("aria-expanded", "true");
    // The keyboard: the button is a Tab stop of its own and shows on focus,
    // even with the pointer away.
    await page.mouse.move(0, 0);
    // (Guards the app on WebKit: the clicked button takes the focus, so Tab
    // goes from where the person is; review I7.)
    await z.focus();
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("opacity", "1");
    return;
  }
  // A finger: the whole row is the target, 44 px tall at least.
  const box = await z.boundingBox();
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  await expect(z).toHaveAttribute("aria-expanded", "true");
  // On the name, not on the arrow.
  await z.locator(".folder-label").tap();
  await expect(z).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".sheet")).toHaveCount(0);
  await z.locator(".folder-label").tap();
  await expect(z).toHaveAttribute("aria-expanded", "true");
  // The button at the row's end: visible, named, 44 px, and it opens the page.
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", /Abrir a página da pasta/);
  const bb = await button.boundingBox();
  expect(Math.round(bb.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(bb.height)).toBeGreaterThanOrEqual(44);
  await button.tap();
  await expect(page.locator(".sheet")).toBeVisible();
  await expect(z).toHaveAttribute("aria-expanded", "true");
  // On a phone the drawer goes as the page opens, as for a note (the phone
  // pass, 2026-11-10): opened again for the rest.
  if (page.viewportSize().width <= 760) {
    await expect(page.locator("body.side-open")).toHaveCount(0);
    await page.locator(".bottom-bar .bar-files").click();
    await expect(page.locator("body.side-open")).toHaveCount(1);
  }
  // The keyboard: Enter toggles the row, the button is a Tab stop of its own.
  await z.focus();
  await page.keyboard.press("Enter");
  await expect(z).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(z).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  // A long press opens the row's menu, which also opens the page; it toggles nothing.
  if (browserName === "chromium" && testInfo.project.use.hasTouch) {
    const label = await z.locator(".folder-label").boundingBox();
    const x = label.x + 4;
    const y = label.y + label.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    const menu = page.locator(".menu:not([hidden])");
    await expect(menu.getByRole("menuitem", { name: "Abrir a página da pasta" })).toBeVisible();
    await expect(z).toHaveAttribute("aria-expanded", "true");
  }
});
