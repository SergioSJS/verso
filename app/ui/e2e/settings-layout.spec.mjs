// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Settings' rows keep their title and description in a column of their own
// (seen 2026-10-15: in "Arquivos e links" the Lixeira row's description was
// squeezed to one word per line by the long value beside it). In every
// section, at the dialog's default width, no row's text column is narrower
// than 12rem, and nothing in a row overflows it.

import { expect, test } from "./fixtures.mjs";

test("no settings row squeezes its description, in any section", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  const nav = page.locator(".settings-nav-item");
  const count = await nav.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    await nav.nth(i).click();
    // Let a value that arrives late (the folder's space, the trash) land.
    await page.waitForTimeout(150);
    const bad = await page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const out = [];
      for (const row of document.querySelectorAll(".settings-body .setting")) {
        const text = row.querySelector(":scope > .setting-text");
        if (!text) continue;
        const rowWidth = row.getBoundingClientRect().width;
        const w = text.getBoundingClientRect().width;
        // 12rem, or the whole row when the row itself is narrower.
        const least = Math.min(12 * rem, rowWidth - 1);
        if (w < least) out.push(`${text.querySelector(".setting-title")?.textContent}: ${Math.round(w)}px of ${Math.round(rowWidth)}px`);
        for (const c of row.children) {
          if (c.getBoundingClientRect().right > row.getBoundingClientRect().right + 1) out.push(`${text.querySelector(".setting-title")?.textContent}: overflows`);
        }
      }
      return out;
    });
    expect(bad, await nav.nth(i).textContent()).toEqual([]);
  }
});

test("a long value stacks under the title and wraps in its own column", async ({ app, page }) => {
  await app.open();
  await app.key("Mod+,");
  await page.evaluate(() => {
    const body = document.querySelector(".settings-body");
    const row = document.createElement("div");
    row.className = "setting";
    row.id = "probe-row";
    const text = document.createElement("div");
    text.className = "setting-text";
    text.innerHTML = '<div class="setting-title">Lixeira</div><div class="setting-desc">A lixeira não conta no espaço da pasta.</div>';
    const value = document.createElement("span");
    value.className = "setting-value";
    value.textContent = "3 itens na lixeira, 6,3 KB. Os arquivos apagados ficam 30 dias e depois somem de vez. ".repeat(3);
    row.append(text, value);
    body.append(row);
  });
  const text = page.locator("#probe-row .setting-text");
  const value = page.locator("#probe-row .setting-value");
  const t = await text.boundingBox();
  const v = await value.boundingBox();
  expect(t.width).toBeGreaterThanOrEqual(12 * 16);
  const row = await page.locator("#probe-row").boundingBox();
  expect(v.x + v.width).toBeLessThanOrEqual(row.x + row.width + 1);
  // Beside the title, or stacked under it: never over it.
  expect(v.x >= t.x + t.width - 1 || v.y >= t.y + t.height - 1).toBe(true);
});
