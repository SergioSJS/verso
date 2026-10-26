// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The right panel (backlinks, outline, tags…) can be found: a toggle named
// for what a press does, at the top-right of the window with no note open
// (as Obsidian has it), the phone's bottom bar with a "Panel" verb, the
// same name on every control, and a key to close it. Tagged `@layout`: it
// also runs at a phone's and a tablet's size.
import { test, expect } from "./fixtures.mjs";
import { mkdirSync } from "node:fs";

const SHOTS = `${process.env.HOME ?? "/root"}/.cache/rightpanel-shots`;
const phone = (page) => page.viewportSize().width < 760;
async function shot(page, name) {
  try {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` });
  } catch { /* no place to write */ }
}
/** The control to press: the status bar's, the bottom bar's Panel verb on a phone. */
const control = (page) => (phone(page) ? page.locator(".bottom-bar .bar-right") : page.locator("#toggle-right"));
const settle = (page) => page.locator("aside.right").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));

for (const [locale, show, hide, tab, shortcutHint] of [
  ["pt-BR", "Mostrar painel da direita", "Ocultar painel da direita", "Favoritos", /painel da direita/i],
  ["en-US", "Show right panel", "Hide right panel", "Bookmarks", /right panel/i],
]) {
  test.describe(`the right panel's toggle, ${locale}`, () => {
    test.use({ locale });
    test(`is named, open with no note, shows its tabs, and the key closes it @layout`, async ({ app, page }) => {
      await app.open(locale === "en-US" ? "?vault=empty&lang=en" : "?vault=empty");
      if (locale === "en-US") {
        await page.evaluate(() => localStorage.setItem("verso.settings", JSON.stringify({ lang: "en" })));
        await page.reload();
        await page.waitForFunction(() => window.__harness?.ready === true);
      }
      const toggle = control(page);
      await expect(toggle).toBeVisible();
      // Found by its accessible name, closed: it says what a press does.
      await expect(page.getByRole("button", { name: show, exact: true }).and(toggle)).toHaveCount(1);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAttribute("title", new RegExp(show));
      await shot(page, `closed-${locale}`);
      await toggle.click();
      if (phone(page)) await settle(page);
      await expect(page.locator("#toggle-right")).toHaveAttribute("aria-expanded", "true");
      if (!phone(page)) await expect(page.getByRole("button", { name: hide, exact: true }).and(toggle)).toHaveCount(1);
      // What it holds, not a blank column: its tabs and a line on why it is empty.
      const tabs = page.locator("#right-tabs [role=tab]");
      await expect(tabs.first()).toBeVisible();
      await expect(page.locator("#right-tabs").getByRole("tab", { name: tab })).toBeVisible();
      expect(await tabs.count()).toBeGreaterThanOrEqual(4);
      await expect(page.locator("#right-body")).not.toBeEmpty();
      await shot(page, `open-${locale}`);
      if (phone(page)) {
        await page.getByRole("button", { name: hide, exact: true }).and(page.locator("#right-close")).click();
        await settle(page);
      } else {
        await app.key("Mod+Alt+ArrowRight");
      }
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAttribute("aria-label", show);
      if (phone(page)) {
        // The bottom bar's verb opens the same drawer.
        const verb = page.locator(".bottom-bar .bar-right");
        await expect(page.getByRole("button", { name: show, exact: true }).and(verb)).toHaveCount(1);
        await verb.click();
        await settle(page);
        await expect(page.locator("body.right-open")).toHaveCount(1);
        await shot(page, `open-bar-${locale}`);
        await page.locator("#right-close").click();
        await settle(page);
      }
      // The key opens it, too.
      if (!phone(page)) {
        await app.key("Mod+Alt+ArrowRight");
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
      }
      void shortcutHint;
    });
  });
}

test("every control of the right panel carries the same name @layout", async ({ app, page }) => {
  await app.open("?vault=empty");
  const names = await page.evaluate(() => [...document.querySelectorAll("#toggle-right, .bar-right")].map((b) => b.getAttribute("aria-label")));
  expect(names.length).toBeGreaterThanOrEqual(2);
  for (const n of names) expect(n).toBe("Mostrar painel da direita");
  if (!phone(page)) {
    await expect(page.locator('.ribbon-item[data-id="right"]')).toHaveAttribute("aria-label", "Mostrar painel da direita");
  }
});

test.describe("the ribbon's top", () => {
  test.skip(({ viewport }) => viewport.width < 760, "a phone has no ribbon");
  test("the files button is not on the ribbon by default (the status bar has the toggle) @layout", async ({ app, page }) => {
    await app.open("?vault=empty");
    await expect(page.locator('.ribbon-item[data-id="files"]')).toHaveCount(0);
    await expect(page.locator("#toggle-side")).toBeVisible();
  });
});
