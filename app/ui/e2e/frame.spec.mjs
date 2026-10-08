// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// No title bar on macOS and Windows (ADR 0072, src/frame.ts): the corner
// of the window's buttons stays clear whatever the layout, and the bars of
// the top row drag the window. The harness forces a frame with ?frame=.
import { expect, test } from "./fixtures.mjs";

/** The corner's height: the system's band on macOS, the top row on Windows. */
const band = (page, frame) => page.evaluate((frame) => (frame === "mac" ? 37 : 2.45 * parseFloat(getComputedStyle(document.documentElement).fontSize)), frame);

/** Whatever of the top row's bars' content sits inside the corner. */
async function inCorner(page, frame) {
  const ROW = await band(page, frame);
  return page.evaluate(({ frame, ROW }) => {
    const width = document.documentElement.clientWidth;
    const corner = frame === "mac" ? { left: 0, right: 78 } : { left: width - 138, right: width };
    const hits = [];
    for (const bar of document.querySelectorAll(".ribbon, .side-head, .spaces, .tabs, .right-tabs")) {
      for (const child of bar.querySelectorAll("button, input, .tab")) {
        const r = child.getBoundingClientRect();
        if (!r.width || !r.height || child.closest(".frame-controls")) continue;
        if (!child.checkVisibility({ visibilityProperty: true })) continue;
        if (r.top < ROW && r.bottom > 0 && r.left < corner.right && r.right > corner.left) hits.push(`${bar.className} › ${child.className || child.tagName}`);
      }
    }
    return hits;
  }, { frame, ROW });
}

for (const frame of ["mac", "windows"]) {
  test(`${frame}: nothing sits under the window's buttons, side bars open or closed, panes split`, async ({ app, page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await app.open(`?frame=${frame}`);
    await expect(page.locator("body")).toHaveClass(new RegExp(`framed-${frame}`));
    // Each layout is settled on the next frame (requestAnimationFrame).
    const clear = (step) => expect.poll(() => inCorner(page, frame), { message: step }).toEqual([]);
    await clear("one pane");
    await app.key("Mod+\\");
    await clear("two panes");
    await page.locator("#toggle-side").click();
    await clear("the side bar closed");
    await page.locator("#toggle-right").click();
    await clear("the right bar open");
    await page.setViewportSize({ width: 560, height: 700 });
    await clear("a narrow window");
    await page.setViewportSize({ width: 1000, height: 700 });
    // Two workspaces: the spaces bar is the top row, the tab bar beneath
    // it is left alone.
    await app.key("Mod+t");
    await expect(page.locator(".spaces")).toBeVisible();
    await clear("two workspaces");
    const tabsTop = await page.locator(".tabs").first().evaluate((el) => el.getBoundingClientRect().top);
    expect(await page.locator(".tabs").first().evaluate((el) => el.className)).not.toMatch(/frame-push/);
    expect(tabsTop).toBeGreaterThan(30);
    // Vertical tabs: a column, pushed down below the corner.
    await page.locator(".tabs").first().getByRole("button", { name: "Abas na vertical" }).click();
    await clear("vertical tabs");
    // The bars drag the window; their buttons and tabs do not.
    await expect(page.locator(".tabs").first()).toHaveAttribute("data-tauri-drag-region", "deep");
    await expect(page.locator(".side-head")).toHaveAttribute("data-tauri-drag-region", "deep");
  });
}

test("windows: the app's own buttons, labelled, at the top row's height", async ({ app, page }) => {
  await app.open("?frame=windows");
  const group = page.getByRole("group", { name: "Controles da janela" });
  await expect(group).toBeVisible();
  for (const name of ["Minimizar", "Maximizar", "Fechar"]) await expect(group.getByRole("button", { name })).toBeVisible();
  const box = await group.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(Math.round(box.x + box.width)).toBe(width);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.height)).toBe(Math.round(await band(page, "windows")));
});

test("without a frame — Linux, a popout, the harness — nothing changes", async ({ app, page }) => {
  await app.open();
  await expect(page.locator("body")).not.toHaveClass(/framed/);
  await expect(page.locator(".frame-controls")).toHaveCount(0);
  await expect(page.locator(".tabs").first()).not.toHaveAttribute("data-tauri-drag-region", /.*/);
});
