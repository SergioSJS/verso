// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The board's right-click menu (Excalidraw's, restyled): the check of a
// toggle has its own column, an item without a shortcut shows no key.
// Shots: ~/.cache/boardmenu-shots.

import { test, expect } from "./fixtures.mjs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/boardmenu-shots`;
const ONE = '{\n\t"nodes":[\n\t\t{"id":"a","x":0,"y":0,"width":300,"height":200,"type":"text","text":"Alfa"}\n\t],\n\t"edges":[]\n}';

test("the board's context menu: no check over a label, no empty key @layout", async ({ app, page }, info) => {
  await app.open();
  await app.writeOutside("Mesa.canvas", ONE);
  await app.folderChanged(["Mesa.canvas"], true);
  await app.quickOpen("Mesa");
  await app.boardReady();
  const box = await page.locator(".board-canvas").boundingBox();
  const small = !["webkit", "chromium"].includes(info.project.name);
  const phone = info.project.name.startsWith("phone");
  const at = { x: box.x + Math.min(600, box.width / 2), y: box.y + box.height * 0.8 };
  if (phone) {
    // The long press of a touch screen ends in this event.
    await page.locator(".board-canvas canvas.interactive").dispatchEvent("contextmenu", { clientX: at.x, clientY: at.y, button: 2, bubbles: true });
  } else await page.mouse.click(at.x, at.y, { button: "right" });
  const menu = page.locator(".board-canvas .context-menu");
  await expect(menu).toBeVisible();
  const items = menu.locator(".context-menu-item");
  expect(await items.count()).toBeGreaterThan(3);
  const checked = menu.locator(".context-menu-item.checkmark");
  expect(await checked.count()).toBeGreaterThan(0);
  for (const el of await checked.all()) {
    const check = await el.evaluate((b) => {
      const r = getComputedStyle(b, "::before");
      const label = b.querySelector(".context-menu-item__label").getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      // The pseudo-element's box: its left offset and width, in the item.
      const left = bb.left + parseFloat(r.left);
      const w = parseFloat(r.width) || parseFloat(r.fontSize);
      return { right: left + w, labelLeft: label.left, left };
    });
    expect(check.right).toBeLessThanOrEqual(check.labelLeft - 2);
    expect(check.left).toBeGreaterThanOrEqual(0);
  }
  for (const li of await menu.locator("li:not(.context-menu-item-separator)").all()) {
    if (!(await li.isVisible())) continue;
    const k = li.locator(".context-menu-item__shortcut");
    const text = ((await k.textContent()) ?? "").trim();
    // The phone layout has no shortcuts at all.
    if (!text || small) await expect(k).toBeHidden();
    else await expect(k).toBeVisible();
  }
  const lang = await page.evaluate(() => document.documentElement.lang || "");
  await menu.screenshot({ path: `${SHOTS}/menu-${info.project.name}-${lang || "x"}-light.png` });
  // The same menu in the dark theme: the board's colours follow the tokens.
  await page.keyboard.press("Escape");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  if (phone) await page.locator(".board-canvas canvas.interactive").dispatchEvent("contextmenu", { clientX: at.x, clientY: at.y, button: 2, bubbles: true });
  else await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu).toBeVisible();
  await menu.screenshot({ path: `${SHOTS}/menu-${info.project.name}-${lang || "x"}-dark.png` });
});
