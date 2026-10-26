// The window's zoom (ADR 0072, revised 2026-10-20): the keys and Ctrl with
// the wheel ask the host for the webview's zoom (the harness keeps the
// call: the real zoom needs the app), the status says it, it is kept for
// the next window, and a browser (no host) takes none of the keys.

import { test, expect } from "./fixtures.mjs";

const zooms = (app) => app.calls("plugin:webview|set_webview_zoom").then((c) => c.map((a) => a.value));

test("the keys zoom in 10 % steps, 0 resets, and it is said", async ({ app, page }) => {
  await app.open("?zoom=host");
  await app.key("Mod+=");
  await app.key("Mod+=");
  await app.key("Mod+-");
  await expect.poll(() => zooms(app)).toEqual([1.1, 1.2, 1.1]);
  await expect(page.locator("#status")).toContainText("Zoom 110 %");
  await app.key("Mod+0");
  await expect.poll(async () => (await zooms(app)).at(-1)).toBe(1);
  await expect(page.locator("#status")).toContainText("Zoom 100 %");
  expect(await page.evaluate(() => localStorage.getItem("verso.zoom"))).toBe("1");
});

test("Ctrl with the wheel zooms, except over a view that zooms itself", async ({ app, page }) => {
  await app.open("?zoom=host");
  await page.evaluate(() => {
    const note = document.querySelector("#main, main") ?? document.body;
    window.__wheel = (el, dy) => el.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, ctrlKey: true, bubbles: true, cancelable: true }));
    const host = document.createElement("div");
    host.className = "board-host";
    host.id = "fake-board";
    note.append(host);
  });
  await page.evaluate(() => window.__wheel(document.body, -100));
  await expect.poll(() => zooms(app)).toEqual([1.1]);
  await page.evaluate(() => window.__wheel(document.querySelector("#fake-board"), -100));
  await page.waitForTimeout(300);
  expect(await zooms(app)).toEqual([1.1]);
});

test("the zoom kept is applied at start-up", async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem("verso.zoom", "1.5"));
  await app.open("?zoom=host");
  await expect.poll(() => zooms(app)).toEqual([1.5]);
});

test("the commands are in the palette, and a browser takes none of the keys", async ({ app, page }) => {
  await app.open("?zoom=host");
  await app.command("Aumentar zoom");
  await expect.poll(() => zooms(app)).toEqual([1.1]);
  await app.open();
  await app.key("Mod+=");
  await page.waitForTimeout(300);
  expect(await zooms(app)).toEqual([]);
});
