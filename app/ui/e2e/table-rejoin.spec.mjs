// The table joined again (ADR 0107): a setting changed, the folder shown
// again, the role told — each makes the window leave its table and join it
// anew. Two of them close together must still end at the table: the leave
// of the first must not land after the join of the second. Found with a
// player turning "Dados 3D" on in a browser: the next roll was refused
// with "join the table first", and stayed so.

import { test, expect } from "./fixtures.mjs";

async function serve(app, page, role) {
  await app.open();
  await app.writeOutside("Diario.md", "# Diário\n");
  await app.folderChanged(["Diario.md"], true);
  await page.evaluate((r) => {
    const t = window.__harness.table;
    t.role = r;
    t.up = true;
  }, role);
}

async function openTable(page) {
  if ((page.viewportSize()?.width ?? 1500) <= 760) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view.locator(".table-compose")).toBeVisible();
  return view;
}

for (const role of ["owner", "editor", "reader"]) {
  test(`two rejoins close together leave the window at the table (${role})`, async ({ app, page }) => {
    await serve(app, page, role);
    const view = await openTable(page);
    const entries = view.locator(".table-log .table-entry");
    const before = await entries.count();
    // A setting changed twice in a row: each change rejoins.
    await page.evaluate(() => {
      dispatchEvent(new Event("verso:features-changed"));
      dispatchEvent(new Event("verso:features-changed"));
    });
    await expect(view.locator(".table-compose")).toBeVisible();
    const field = view.getByRole("textbox", { name: "Mensagem para a mesa" });
    await field.fill("/r 1d6");
    await field.press("Enter");
    await expect(entries).toHaveCount(before + 1);
    await expect(view).not.toContainText("join the table first");
  });
}
