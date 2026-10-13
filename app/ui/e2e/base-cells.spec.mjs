// A base's table cell edited from the keyboard (ADR 0053): Enter on the
// cell opens its field, Enter in the field writes the note's property and
// shows the new value at once, the focus back on the cell — as Escape
// leaves it — where Enter opens the field again. The table is not held
// back until the focus leaves the cell.

import { test, expect } from "./fixtures.mjs";

const PROJECT = "projetos/Projeto Alpha.md";

test("Enter commits a base's cell, shows the value at once and keeps the focus on the cell", async ({ app, page }) => {
  await app.open();
  await app.quickOpen("Projetos.base");
  const row = page.locator(".base tr", { has: page.locator("a.base-file", { hasText: /^Projeto Alpha$/ }) });
  const cell = row.locator("td").nth(1);
  await expect(cell).toHaveText("em_andamento");
  await cell.focus();
  await page.keyboard.press("Enter");
  const field = cell.locator("input.base-cell-input");
  await expect(field).toBeFocused();
  await field.fill("pausado");
  await page.keyboard.press("Enter");
  // At once: no field left, the value shown, the cell holding the focus.
  await expect(field).toHaveCount(0, { timeout: 1000 });
  await expect(cell).toHaveText("pausado", { timeout: 1000 });
  await expect(cell).toBeFocused();
  // Written to the note, and drawn again from the core's answer, the
  // focus still on the cell.
  await expect.poll(() => app.file(PROJECT)).toContain("status: pausado");
  await expect.poll(async () => (await app.calls("query_base")).length).toBeGreaterThan(1);
  await expect(cell).toHaveText("pausado");
  await expect(cell).toBeFocused();
  // Enter again opens the field, with the value written.
  await page.keyboard.press("Enter");
  await expect(cell.locator("input.base-cell-input")).toHaveValue("pausado");
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  await expect(cell).toHaveText("pausado");
});
