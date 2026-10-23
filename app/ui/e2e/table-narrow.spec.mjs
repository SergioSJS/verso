// Two small things of the Table panel (ADR 0107, 2026-10-23): the roller's
// dialog ("Rolar dados…") is an item of the dice row's "⋯" drawer, and at
// narrow widths the panel's top row keeps the roster, the Mesa window
// button, "hide from here back" (icon only) and the menu on one line.

import { test, expect } from "./fixtures.mjs";

async function setup(app, page, owner = true) {
  await app.open("?vault=empty&table=owner");
  await app.writeOutside("Diario.md", "# Diário\n");
  await app.folderChanged(["Diario.md"], true);
  await page.evaluate(() => {
    const h = window.__harness;
    h.table.role = "owner";
    h.table.up = true;
    h.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    h.emit("campaign-changed", { paths: [] });
  });
  if ((page.viewportSize()?.width ?? 1500) <= 760) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".tray-row")).toBeVisible();
  return view;
}

test("the roller's dialog is an item of the dice row's drawer", async ({ app, page }) => {
  const view = await setup(app, page);
  await view.getByRole("button", { name: "Mais dados" }).click();
  await view.getByRole("button", { name: "Rolar dados…" }).click();
  await expect(page.getByRole("textbox", { name: "Notação, como 1d20+3" })).toBeVisible();
  // The drawer closed behind it.
  await expect(view.getByRole("button", { name: "Rolar dados…" })).toBeHidden();
});

test("at 260 px the top row is one line and the hide button is an icon with its name", async ({ app, page }) => {
  const view = await setup(app, page);
  await page.evaluate(() => {
    document.querySelector("aside.right").style.width = "260px";
  });
  const hide = view.locator(".table-hide");
  await expect(hide).toHaveAttribute("aria-label", "Ocultar daqui pra trás");
  await expect(hide.locator(".table-hide-label")).toBeHidden();
  const boxes = await view.locator(".table-top > *").evaluateAll((els) => els.filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()));
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  const tops = boxes.map((b) => Math.round(b.top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
  const row = await view.locator(".table-top").boundingBox();
  for (const b of boxes) expect(b.right).toBeLessThanOrEqual(row.x + row.width + 1);
  // With room the words come back.
  await page.evaluate(() => {
    document.querySelector("aside.right").style.width = "560px";
  });
  await expect(hide.locator(".table-hide-label")).toBeVisible();
});
