// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A button hidden from the ribbon has a way back (src/ribbon.ts); the files
// button starts hidden (the status bar has that toggle): the
// gear is never hidden, the status bar says where the others come back
// from, the gear's menu shows them again, and the settings' Appearance
// lists every button with its switch.
import { expect, test } from "./fixtures.mjs";

test("a hidden ribbon button comes back, and the gear never hides", async ({ app, page }) => {
  await app.open();
  const files = page.locator('.ribbon-item[data-id="quick"]');
  const gear = page.locator('.ribbon-item[data-id="settings"]');
  await files.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Ocultar este botão" }).click();
  await expect(files).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Ajustes › Aparência");
  // The gear's menu: no "hide", and the hidden one comes back from it.
  await gear.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Ocultar este botão" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /Mostrar botões ocultos \(2\)/ })).toBeVisible();
  await page.keyboard.press("Escape");
  // Hidden again from the settings, and shown again there.
  await gear.click();
  await page.locator(".settings-nav-item", { hasText: "Aparência" }).click();
  const row = page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Abrir…$/ }) });
  await expect(row.locator("input")).not.toBeChecked();
  await row.locator(".switch").click();
  await expect(files).toHaveCount(1);
  await expect(page.locator(".setting", { has: page.locator(".setting-title", { hasText: /^Ajustes$/ }) }).locator("input")).toHaveCount(0);
});
