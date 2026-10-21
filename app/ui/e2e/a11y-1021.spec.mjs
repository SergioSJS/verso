// The accessibility items decided on 2026-10-21 (docs/review/accessibility.md,
// section 8): the status line's routine save is silent for a screen reader,
// the small targets reach 24 px, the graph's count waits for typing to pause,
// a press on a graph node leaves the view alone, and Alt+Enter follows the
// link under the caret.

import { test, expect } from "./fixtures.mjs";

test("a routine save is shown but not announced; a failure is both", async ({ app, page }) => {
  await app.open("?vault=empty");
  await app.writeOutside("Nota.md", "# Nota\n\n");
  await app.folderChanged(["Nota.md"], true);
  await app.quickOpen("Nota");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.type("texto");
  await expect(page.locator("#status")).toHaveText("Salvo.");
  // The live region exists, is polite, and stayed empty for the save.
  const live = page.locator("#status-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveText("");
  await expect(page.locator("#status")).not.toHaveAttribute("role", /.+/);
  // Anything else the line says is announced.
  await page.evaluate(() => { document.getElementById("status").textContent = "Nada gravado: o arquivo mudou em disco."; });
  await expect(live).toHaveText("Nada gravado: o arquivo mudou em disco.");
});
