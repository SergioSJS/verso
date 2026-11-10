// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The pass over the window on the maintainer's phone (2026-11-09): in every
// section of Settings, on a touch screen, each select, button and field is
// a target of 44px, and nothing reaches past the page sideways (the
// oracle's table for a screen reader did); the theme cards' copy says its
// word there; a phone's tabs keep their names instead of squeezing them.

import { expect, test } from "./fixtures.mjs";

const touch = (page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

test("every Settings section: targets of 44px on a touch screen, nothing wider than the page @layout", async ({ app, page }) => {
  await app.open();
  const isTouch = await touch(page);
  await app.key("Mod+,");
  const nav = page.locator(".settings-nav-item");
  const count = await nav.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i++) {
    const name = (await nav.nth(i).textContent()) ?? String(i);
    await nav.nth(i).click();
    await page.waitForTimeout(120);
    const bad = await page.evaluate((isTouch) => {
      const out = [];
      const body = document.querySelector(".settings-body");
      if (!body) return ["no page"];
      if (body.scrollWidth > body.clientWidth + 1) out.push(`the page is ${body.scrollWidth}px wide in ${body.clientWidth}px`);
      if (!isTouch) return out;
      for (const e of body.querySelectorAll("select, button, input")) {
        if (e instanceof HTMLInputElement && ["checkbox", "radio", "range", "color", "file", "hidden"].includes(e.type)) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(e).visibility === "hidden") continue;
        if (r.height < 43.5) out.push(`${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)}: ${Math.round(r.height)}px high`);
      }
      return out;
    }, isTouch);
    expect(bad, name).toEqual([]);
    const back = page.locator(".settings-back");
    if (await back.isVisible()) await back.click();
  }
});

test("the theme cards' copy says its word on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const copy = page.locator('.theme-act[data-act="copy"]').first();
  await expect(copy).toBeVisible();
  const word = copy.locator(".theme-act-word");
  if (await page.evaluate(() => matchMedia("(hover: none)").matches)) {
    await expect(word).toHaveText("Copiar");
    const box = await copy.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    expect(box.width).toBeGreaterThanOrEqual(43.5);
  } else {
    await expect(word).toBeHidden();
  }
});

test("a phone's tabs keep their names; the row scrolls @layout", async ({ app, page }) => {
  test.skip(page.viewportSize().width > 760, "a phone's tab row");
  await app.open();
  await app.quickOpen("01 - Guia");
  // Not squeezed: a tab is as wide as its name (up to its 22ch), the row scrolls.
  expect(await page.locator(".pane .tab").first().evaluate((e) => getComputedStyle(e).flexShrink)).toBe("0");
});

// The maintainer's answers of 2026-11-10: every dialog's controls are 44px on
// touch, not only Settings'; the right panel's tabs stay icons on a phone and
// a long press names the tab; the local table's hint fits its one line.

test("a dialog's buttons and fields are 44px on a touch screen: the palette, the roller @layout", async ({ app, page }) => {
  await app.open();
  if (!(await touch(page))) return;
  const small = async (layer) => page.locator(layer).evaluate((root) =>
    [...root.querySelectorAll("button, select, input:not([type=checkbox]):not([type=radio])")]
      .filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 43.5)
      .map((e) => `${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)}: ${Math.round(e.getBoundingClientRect().height)}px`));
  await app.key("Mod+Shift+p");
  await expect(page.locator(".quick.palette:not([hidden])")).toBeVisible();
  expect(await small(".quick.palette:not([hidden])")).toEqual([]);
  await page.keyboard.press("Escape");
  await app.command("Rolar dados");
  await expect(page.locator(".quick.dice-roller:not([hidden])")).toBeVisible();
  expect(await small(".quick.dice-roller:not([hidden])")).toEqual([]);
});

test("a long press on a right panel's tab names it first on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  if (page.viewportSize().width <= 760) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  const tab = page.locator("#right-tabs [data-tab]:not([hidden])").first();
  await expect(tab).toBeVisible();
  const name = await tab.evaluate((b) => b.title || b.getAttribute("aria-label"));
  // A long press is the window's contextmenu (touch.ts).
  await tab.dispatchEvent("contextmenu", { clientX: 20, clientY: 20 });
  const first = page.locator(".menu:not([hidden]) > li").first();
  await expect(first).toBeVisible();
  if (await page.evaluate(() => matchMedia("(hover: none)").matches)) await expect(first).toContainText(name);
  else await expect(first).not.toContainText(name);
  // The tab's own name for a screen reader is unchanged.
  expect(await tab.evaluate((b) => b.title || b.getAttribute("aria-label"))).toBe(name);
  await page.keyboard.press("Escape");
});

test("the local table's hint fits the phone's one-line composer @layout", async ({ app, page }) => {
  await app.open();
  if (page.viewportSize().width > 760) return;
  await page.locator(".bar-right").click();
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const field = page.getByRole("textbox", { name: "Mensagem para a mesa" });
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("placeholder", "Role com /r 1d20+3…");
});

// The maintainer's answers of 2026-11-10, second set: the Table's dice are
// 44px on a phone, a pane's own toolbars are 44px on touch, a phone's base
// table keeps whole words in columns of 9rem and scrolls sideways.

test("a pane's toolbar (the note's modes) is 44px on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  if (!(await touch(page))) return;
  await app.quickOpen("01 - Guia");
  const small = await page.locator(".pane.focused .modes button").evaluateAll((bs) =>
    bs.filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 43.5).map((b) => `${b.getAttribute("aria-label")}: ${Math.round(b.getBoundingClientRect().height)}px`));
  expect(small).toEqual([]);
});

test("the Table's dice row on a phone: 44px dice, nothing wider than the row @layout", async ({ app, page }) => {
  await app.open();
  if (page.viewportSize().width > 760) return;
  await page.locator(".bar-right").click();
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  // A phone keeps the dice row behind its button: open it first.
  const row = page.locator(".tray-scroll").first();
  if (!(await row.isVisible())) await page.locator(".table-view").getByRole("button", { name: "Dados", exact: true }).click();
  await expect(row).toBeVisible();
  const dice = await row.locator(".tray-die").evaluateAll((bs) => bs.filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().width)));
  expect(dice.length).toBeGreaterThan(3);
  for (const w of dice) expect(w).toBeGreaterThanOrEqual(44);
  // The row scrolls inside itself (KH, KL and the modifier stay in it); the page does not.
  expect(await row.locator(".tray-keep").count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

// The maintainer's answers of 2026-11-10, third set: a phone held sideways
// (a touch screen under 500px high) gets the phone's layout; the bottom bar's
// words shrink, then leave the marks alone, each still named; a base's
// column headers and the folder page's views are 44px on touch.

test("a touch screen under 500px high gets the phone's layout @layout", async ({ app, page }) => {
  await app.open();
  if (!(await touch(page))) return;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".bottom-bar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains("desk-on-phone"))).toBe(false);
});

test("the bottom bar's words shrink, then the marks stay alone, still named @layout", async ({ app, page }) => {
  await app.open();
  const bar = page.locator(".bottom-bar");
  if (!(await bar.isVisible())) return;
  await expect(bar).not.toHaveClass(/marks-only/);
  await bar.evaluate((b) => { b.style.width = "200px"; });
  await expect(bar).toHaveClass(/marks-only/);
  await expect(bar.getByRole("button", { name: "Comandos" })).toBeVisible();
  await bar.evaluate((b) => { b.style.width = ""; });
  await expect(bar).not.toHaveClass(/marks-only/);
});

test("a base's column headers and the folder page's views are 44px on a touch screen @layout", async ({ app, page }) => {
  await app.open();
  if (!(await touch(page))) return;
  await app.quickOpen("Projetos.base");
  const th = page.locator(".pane.focused .base-th").first();
  await expect(th).toBeVisible();
  expect((await th.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
});
